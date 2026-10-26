"""/tables/: dining tables, their status and QR codes."""
import secrets

from django.db.models import ProtectedError
from rest_framework import generics, serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import audit
from core.exceptions import ApiError
from core.permissions import read_or_require, require
from outlets.models import Outlet
from outlets.services import outlets_for
from outlets.views import outlet_from_param

from .models import DiningTable


def new_qr_secret():
    return secrets.token_urlsafe(12)


class TableSerializer(serializers.ModelSerializer):
    restaurant = serializers.PrimaryKeyRelatedField(source='outlet', queryset=Outlet.objects.all())
    restaurant_name = serializers.CharField(source='outlet.name', read_only=True)
    is_available = serializers.SerializerMethodField()
    qr_code = serializers.CharField(source='qr_secret', read_only=True)
    qr_code_url = serializers.SerializerMethodField()

    class Meta:
        model = DiningTable
        fields = ['id', 'restaurant', 'restaurant_name', 'table_number', 'name', 'capacity', 'status', 'is_available',
                  'location', 'is_outdoor', 'has_view', 'accessibility', 'qr_code', 'qr_code_url', 'qr_enabled',
                  'sort_order', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'is_client_user', False):
            self.fields['restaurant'].queryset = outlets_for(request.user)
        if self.instance is not None and not isinstance(self.instance, (list, tuple)) and hasattr(self.instance, 'pk'):
            self.fields['restaurant'].read_only = True  # tables don't move between restaurants

    def get_is_available(self, table):
        return table.status == 'available'

    def get_qr_code_url(self, table):
        # The app builds the ordering link from qr_code and its guest app address
        return None

    def validate_table_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the table number.')
        return value

    def validate_capacity(self, value):
        if not 1 <= value <= 999:
            raise serializers.ValidationError('Enter seats from 1 to 999.')
        return value

    def validate(self, attrs):
        outlet = attrs.get('outlet') or getattr(self.instance, 'outlet', None)
        number = attrs.get('table_number')
        if outlet and number:
            clash = DiningTable.objects.filter(outlet=outlet, table_number__iexact=number, is_active=True)
            if self.instance:
                clash = clash.exclude(id=self.instance.id)
            if clash.exists():
                raise serializers.ValidationError({'table_number': 'This table number is already used.'})
        return attrs


def _tables(request):
    return DiningTable.objects.filter(is_active=True, outlet__in=outlets_for(request.user)).select_related('outlet')


class TableList(generics.ListCreateAPIView):
    serializer_class = TableSerializer
    permission_classes = [read_or_require('settings.manage')]

    def get_queryset(self):
        qs = _tables(self.request)
        outlet = outlet_from_param(self.request, required=False)
        if outlet:
            qs = qs.filter(outlet=outlet)
        if self.request.query_params.get('status'):
            qs = qs.filter(status=self.request.query_params['status'])
        return qs

    def perform_create(self, serializer):
        table = serializer.save(qr_secret=new_qr_secret())
        if not table.name:
            table.name = f'Table {table.table_number}'
            table.save(update_fields=['name'])
        audit.record(self.request, 'table.create', 'table', table.id, after={'table_number': table.table_number})


@api_view(['GET'])
def tables_by_restaurant(request):
    outlet = outlet_from_param(request)
    tables = _tables(request).filter(outlet=outlet)
    return Response(TableSerializer(tables, many=True, context={'request': request}).data)


class TableDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TableSerializer
    permission_classes = [read_or_require('settings.manage')]

    def get_queryset(self):
        return _tables(self.request)

    def perform_update(self, serializer):
        table = serializer.save()
        audit.record(self.request, 'table.update', 'table', table.id, after={'table_number': table.table_number})

    def perform_destroy(self, table):
        if table.status == 'occupied':
            raise ApiError('This table has guests. Settle or move its order first.', code='table_occupied', status_code=409)
        audit.record(self.request, 'table.delete', 'table', table.id, before={'table_number': table.table_number})
        try:
            table.delete()
        except ProtectedError:
            # Has orders: keep it for history, free its number
            table.is_active = False
            table.qr_secret = None
            table.save(update_fields=['is_active', 'qr_secret', 'updated_at'])


@api_view(['PATCH', 'POST'])
def update_status(request, pk):
    """Staff mark a table occupied, reserved, cleaning or available."""
    table = generics.get_object_or_404(_tables(request), pk=pk)
    new_status = request.data.get('status')
    if new_status not in DiningTable.STATUSES:
        raise ApiError(f'Status must be one of: {", ".join(DiningTable.STATUSES)}.', code='invalid',
                       fields={'status': ['Not a valid status.']})
    table.status = new_status
    table.save(update_fields=['status', 'updated_at'])
    return Response(TableSerializer(table, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([require('settings.manage')])
def generate_qr_code(request, pk):
    """New QR secret: codes printed before stop working."""
    table = generics.get_object_or_404(_tables(request), pk=pk)
    table.qr_secret = new_qr_secret()
    table.save(update_fields=['qr_secret', 'updated_at'])
    audit.record(request, 'table.qr_regenerate', 'table', table.id)
    return Response(TableSerializer(table, context={'request': request}).data)


@api_view(['POST'])
def free_stale_tables(request):
    """
    Frees tables still occupied by orders from an earlier business day.
    Orders aren't built yet, so there's nothing stale to free.
    """
    outlet_from_param(request)
    return Response({'freed_tables_count': 0, 'freed_tables': []})
