"""/restaurants/ (the app's name for outlets) and /settings/ (client settings)."""
from django.db.models import Count, Q
from rest_framework import generics, serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import audit
from core.exceptions import ApiError, Conflict
from core.permissions import read_or_require

from .models import Outlet, PrintSettings, TenantSettings
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


# ---- Print settings -------------------------------------------------------------

FORMATS = ['thermal80', 'thermal58', 'sheet']
LICENCE_RE = r'^[A-Za-z0-9][A-Za-z0-9 ./-]{2,29}$'


class PrintHeaderSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, allow_blank=True, required=False, default='')
    address = serializers.CharField(max_length=300, allow_blank=True, required=False, default='')
    phone = serializers.CharField(max_length=40, allow_blank=True, required=False, default='')
    tax_id_label = serializers.CharField(max_length=30, allow_blank=True, required=False, default='')
    tax_id = serializers.CharField(max_length=30, allow_blank=True, required=False, default='')
    licence_label = serializers.CharField(max_length=30, allow_blank=True, required=False, default='')
    licence = serializers.RegexField(LICENCE_RE, allow_blank=True, required=False, default='', error_messages={
        'invalid': 'Use 3 to 30 letters, digits, spaces, dots, dashes or slashes.'})
    footer = serializers.CharField(max_length=200, allow_blank=True, required=False, default='')


class TaxComponentSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=20, allow_blank=True)
    share = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100)


class PrintTaxSerializer(serializers.Serializer):
    profile = serializers.CharField(max_length=10, allow_blank=True, required=False, default='')
    invoice_title = serializers.CharField(max_length=40, allow_blank=True, required=False, default='')
    receipt_title = serializers.CharField(max_length=40, allow_blank=True, required=False, default='')
    mode = serializers.ChoiceField(choices=['single', 'split'], required=False, default='single')
    single_label = serializers.CharField(max_length=20, allow_blank=True, required=False, default='')
    components = TaxComponentSerializer(many=True, required=False, default=list)

    def validate_components(self, value):
        if len(value) > 4:
            raise serializers.ValidationError('At most 4 tax lines.')
        return value


class PrintSettingsSerializer(serializers.Serializer):
    bill_format = serializers.ChoiceField(choices=FORMATS)
    kot_format = serializers.ChoiceField(choices=FORMATS)
    sheet_size = serializers.ChoiceField(choices=['A4', 'Letter'])
    header = PrintHeaderSerializer()
    tax = PrintTaxSerializer(required=False, allow_null=True)
    kot_copies = serializers.IntegerField(min_value=1, max_value=3)
    auto_print_bill = serializers.BooleanField()
    qr_orders_mode = serializers.ChoiceField(choices=['auto', 'accept'], required=False)


def print_settings_payload(ps):
    h = ps.header or {}
    return {
        'restaurant_id': ps.outlet_id,
        'saved': ps.updated_by_id is not None,
        'bill_format': ps.bill_format,
        'kot_format': ps.kot_format,
        'sheet_size': ps.sheet_size,
        'header': {'name': h.get('name', ''), 'address': h.get('address', ''), 'phone': h.get('phone', ''),
                   'tax_id_label': h.get('tax_id_label', h.get('taxIdLabel', '')), 'tax_id': h.get('tax_id', ''),
                   'licence_label': h.get('licence_label', ''), 'licence': h.get('licence', ''), 'footer': ps.footer},
        'tax': (ps.options or {}).get('tax'),
        'kot_copies': ps.kot_copies,
        'auto_print_bill': ps.auto_print_bill,
        'qr_orders_mode': (ps.options or {}).get('qr_orders_mode', 'auto'),
        'updated_at': serializers.DateTimeField().to_representation(ps.updated_at),
        'updated_by': {'id': ps.updated_by.id, 'name': ps.updated_by.full_name} if ps.updated_by else None,
    }


@api_view(['GET', 'PUT'])
@permission_classes([read_or_require('settings.manage')])
def print_settings(request, pk):
    """Bill header, tax labels and formats shared by every device of a restaurant."""
    outlet = generics.get_object_or_404(outlets_for(request.user), pk=pk)
    ps, _ = PrintSettings.objects.get_or_create(outlet=outlet, defaults={'header': {'name': outlet.name}})
    if request.method == 'PUT':
        body = PrintSettingsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        ps = PrintSettings.objects.select_for_update().get(id=ps.id)
        header = dict(data['header'])
        ps.footer = header.pop('footer').strip()
        header['tax_id'] = header['tax_id'].upper()
        ps.header = {k: v.strip() for k, v in header.items()}
        for field in ('bill_format', 'kot_format', 'sheet_size', 'kot_copies', 'auto_print_bill'):
            setattr(ps, field, data[field])
        options = dict(ps.options or {})
        if data.get('tax') is not None:
            options['tax'] = {**data['tax'], 'components': [{'label': c['label'], 'share': float(c['share'])}
                                                            for c in data['tax']['components']]}
        if data.get('qr_orders_mode'):
            options['qr_orders_mode'] = data['qr_orders_mode']
        ps.options = options
        ps.updated_by = request.user
        ps.save()
        audit.record(request, 'print_settings.update', 'outlet', outlet.id,
                     after={'bill_format': ps.bill_format, 'kot_format': ps.kot_format})
        ps = PrintSettings.objects.select_related('updated_by').get(id=ps.id)
    return Response(print_settings_payload(ps))
