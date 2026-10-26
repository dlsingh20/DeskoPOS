"""/restaurants/ (the app's name for outlets) and /settings/ (client settings)."""
from django.db.models import Count, Q
from rest_framework import generics, serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import audit
from core.exceptions import ApiError, Conflict
from core.permissions import read_or_require

from .models import Outlet, TenantSettings
from .services import create_outlet, next_outlet_code, outlets_for


class RestaurantSerializer(serializers.ModelSerializer):
    contact_phone = serializers.CharField(source='phone', required=False, allow_blank=True)
    location = serializers.SerializerMethodField()
    total_tables = serializers.IntegerField(read_only=True)
    available_tables = serializers.IntegerField(read_only=True)
    occupied_tables = serializers.IntegerField(read_only=True)
    reserved_tables = serializers.IntegerField(read_only=True)

    class Meta:
        model = Outlet
        fields = ['id', 'code', 'name', 'type', 'description', 'address', 'city', 'state_code', 'postal_code', 'location',
                  'contact_phone', 'email', 'tax_reg_number', 'licence_label', 'licence_number', 'opening_hours',
                  'day_close_time', 'capacity', 'is_active', 'sort_order', 'total_tables', 'available_tables',
                  'occupied_tables', 'reserved_tables', 'created_at', 'updated_at']
        read_only_fields = ['id', 'code', 'is_active', 'created_at', 'updated_at']

    def get_location(self, outlet):
        return ', '.join(p for p in (outlet.address, outlet.city) if p)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the restaurant name.')
        others = Outlet.objects.filter(name__iexact=value, is_active=True)
        if self.instance:
            others = others.exclude(id=self.instance.id)
        if others.exists():
            raise serializers.ValidationError('Another restaurant already has this name.')
        return value


def _with_table_counts(qs):
    active = Q(tables__is_active=True)
    return qs.annotate(
        total_tables=Count('tables', filter=active),
        available_tables=Count('tables', filter=active & Q(tables__status='available')),
        occupied_tables=Count('tables', filter=active & Q(tables__status='occupied')),
        reserved_tables=Count('tables', filter=active & Q(tables__status='reserved')),
    )


class RestaurantList(generics.ListCreateAPIView):
    serializer_class = RestaurantSerializer
    permission_classes = [read_or_require('settings.manage')]
    pagination_class = None

    def get_queryset(self):
        qs = _with_table_counts(outlets_for(self.request.user))
        if self.request.query_params.get('search'):
            qs = qs.filter(name__icontains=self.request.query_params['search'])
        if self.request.query_params.get('type'):
            qs = qs.filter(type=self.request.query_params['type'])
        return qs

    def perform_create(self, serializer):
        limit = self.request.tenant.get('max_outlets')
        if limit is not None and Outlet.objects.filter(is_active=True).count() >= limit:
            raise Conflict(f'Your plan allows {limit} restaurant{"s" if limit != 1 else ""}. '
                           'Contact us to upgrade.', code='plan_limit')
        outlet = create_outlet(code=next_outlet_code(), tax_id_label=self.request.tenant.get('tax_id_label') or '',
                               **serializer.validated_data)
        serializer.instance = _with_table_counts(Outlet.objects.filter(id=outlet.id)).get()
        audit.record(self.request, 'outlet.create', 'outlet', outlet.id, after={'name': outlet.name})


class RestaurantDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RestaurantSerializer
    permission_classes = [read_or_require('settings.manage')]

    def get_queryset(self):
        return _with_table_counts(outlets_for(self.request.user))

    def perform_update(self, serializer):
        before = {k: getattr(serializer.instance, k) for k in ('name', 'type')}
        outlet = serializer.save()
        audit.record(self.request, 'outlet.update', 'outlet', outlet.id, before=before,
                     after={k: getattr(outlet, k) for k in before})

    def perform_destroy(self, outlet):
        # Outlets have history (orders, cash); they're closed, never deleted
        if outlet.is_active and Outlet.objects.filter(is_active=True).exclude(id=outlet.id).count() == 0:
            raise Conflict("This is the only open restaurant, so it can't be closed.", code='last_outlet')
        outlet.is_active = False
        outlet.save(update_fields=['is_active', 'updated_at'])
        audit.record(self.request, 'outlet.close', 'outlet', outlet.id)

    def patch(self, request, *args, **kwargs):
        # Reopening goes through here too ({"is_active": true}), with the plan limit
        if 'is_active' in request.data:
            outlet = self.get_object()
            active = bool(request.data['is_active'])
            if not active:
                self.perform_destroy(outlet)
            elif not outlet.is_active:
                limit = request.tenant.get('max_outlets')
                if limit is not None and Outlet.objects.filter(is_active=True).count() >= limit:
                    raise Conflict(f'Your plan allows {limit} restaurants.', code='plan_limit')
                outlet.is_active = True
                outlet.save(update_fields=['is_active', 'updated_at'])
                audit.record(request, 'outlet.reopen', 'outlet', outlet.id)
        return self.partial_update(request, *args, **kwargs)


def outlet_from_param(request, name='restaurant_id', required=True):
    """The outlet named in the query (or body); 400 when missing, 404 when the user can't use it."""
    raw = request.query_params.get(name) or (request.data.get(name) if hasattr(request, 'data') else None)
    if raw in (None, ''):
        if required:
            raise ApiError(f'{name} is required.', code='outlet_required')
        return None
    try:
        return outlets_for(request.user).get(id=int(raw))
    except (Outlet.DoesNotExist, ValueError, TypeError):
        raise ApiError('No such restaurant.', code='not_found', status_code=404)


class ClientSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantSettings
        fields = ['prices_include_tax', 'rounding_mode', 'rounding_step', 'cashier_discount_limit']


@api_view(['GET', 'PATCH'])
@permission_classes([read_or_require('settings.manage')])
def client_settings(request):
    """Client name, currency and locale for the app (replaces the hotel's /my-hotel/), plus POS settings."""
    settings_row = TenantSettings.objects.get()
    if request.method == 'PATCH':
        body = ClientSettingsSerializer(settings_row, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        body.save()
        audit.record(request, 'settings.update', 'settings', settings_row.id, after=dict(request.data))
    t = request.tenant
    return Response({
        'id': t['id'],
        'name': t['name'],
        'country': t['country_code'],
        'currency': t['currency_code'],
        'currency_symbol': t['currency_symbol'],
        'currency_decimals': t['currency_decimals'],
        'locale': t['locale'],
        'timezone': t['timezone'],
        'language': t['language'],
        'tax_id_label': t['tax_id_label'],
        'tax_reg_number': t['tax_reg_number'],
        'features': {**(t['plan_features'] or {}), **(t['feature_overrides'] or {})},
        'max_outlets': t['max_outlets'],
        **ClientSettingsSerializer(settings_row).data,
    })
