"""
Guest ordering from a table's QR code (/api/guest/tables/<code>/). No sign-in: the code is the
table's secret (floor.DiningTable.qr_secret), so a new QR code stops printed copies working.

The guest gives a name and mobile number and orders onto the table's open order (or the bill the
table is merged into), or a new one. Lines are marked source='qr'; a device in the restaurant
(QrOrderWatcher) prints the KOT, straight away or after the cashier accepts, as the restaurant's
QR ordering mode says.
"""
import re
from datetime import timedelta

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from catalogue.models import Category, Product
from core import tenancy
from core.authentication import load_current_tenant
from core.exceptions import ApiError, Conflict
from core.money import money_str
from floor.models import DiningTable
from outlets.models import PrintSettings, TenantSettings

from . import pricing
from .models import Order, OrderEvent
from .services import business_date, new_order_number, open_order_of_table, recalculate, record, sync_order_tables
from .views import add_line

PHONE_RE = re.compile(r'\+?[\d\s-]{7,15}')
# Guards against a code being used to flood a restaurant with orders
MAX_LINES, MAX_QUANTITY = 30, 20
ORDERS_PER_TABLE, WINDOW_MINUTES = 15, 10


class GuestLineSerializer(serializers.Serializer):
    menu_item = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY)
    special_instructions = serializers.CharField(required=False, allow_blank=True, max_length=200)


class GuestOrderSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    phone = serializers.CharField(max_length=20)
    items = GuestLineSerializer(many=True, min_length=1, max_length=MAX_LINES)
    client_ref = serializers.UUIDField(required=False, allow_null=True)  # makes a retry safe

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter your name.')
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not PHONE_RE.fullmatch(value) or len(re.sub(r'\D', '', value)) < 7:
            raise serializers.ValidationError('Enter a valid mobile number.')
        return value


class GuestTableView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def table(self, request, code, lock=False):
        """The table this code belongs to, with the request scoped to its client."""
        tenancy.act_as_platform()
        found = DiningTable.objects.filter(qr_secret=code).values('id', 'tenant_id').first() if code else None
        if found is None:
            raise ApiError('This QR code is not valid any more. Please ask the staff for help.',
                           code='not_found', status_code=404)
        tenancy.act_as_client(found['tenant_id'])
        tenant = load_current_tenant()
        qs = DiningTable.objects.select_related('outlet')
        table = (qs.select_for_update() if lock else qs).get(id=found['id'])
        if tenant is None or tenant['status'] != 'active' or not table.outlet.is_active:
            raise ApiError('This restaurant is not taking orders here right now.', code='closed', status_code=403)
        if not table.is_active or not table.qr_enabled:
            raise ApiError('Ordering from this table is turned off. Please ask the staff.', code='qr_off', status_code=403)
        request.tenant = tenant
        return table


def _mode(outlet):
    ps = PrintSettings.objects.filter(outlet=outlet).first()
    return (ps.options or {}).get('qr_orders_mode', 'auto') if ps else 'auto'


def _table_label(table):
    number = (table.table_number or '').strip()
    return f'Table {number}' if number.isdigit() else (number or table.name or f'Table {table.id}')


class GuestMenu(GuestTableView):
    def get(self, request, code):
        table = self.table(request, code)
        outlet, tenant = table.outlet, request.tenant
        decimals = int(tenant.get('currency_decimals') or 0)
        products = Product.objects.filter(is_active=True).order_by('sort_order', 'name')
        categories = (Category.objects
                      .filter(is_active=True, menu_links__menu__outlet=outlet, menu_links__menu__is_active=True)
                      .distinct().order_by('sort_order', 'name')
                      .prefetch_related(Prefetch('products', queryset=products)))
        settings_row = TenantSettings.objects.get()
        service = pricing.service_charge_rate(settings_row, 'dine_in')
        return Response({
            'restaurant': {'name': outlet.name, 'address': ', '.join(p for p in (outlet.address, outlet.city) if p)},
            'table': {'label': _table_label(table)},
            'currency': {'code': tenant['currency_code'], 'symbol': tenant['currency_symbol'], 'decimals': decimals,
                         'locale': tenant['locale']},
            'prices_include_tax': settings_row.prices_include_tax,
            'service_charge_rate': f'{service:.2f}' if service else None,
            'mode': _mode(outlet),
            'categories': [{
                'id': c.id, 'name': c.name,
                'items': [{'id': p.id, 'name': p.name, 'description': p.description,
                           'price': money_str(p.price, decimals), 'vegetarian': p.is_vegetarian, 'vegan': p.is_vegan,
                           'spicy': p.is_spicy, 'available': p.is_available, 'image_url': p.image_url}
                          for p in c.products.all()],
            } for c in categories if c.products.all()],
        })


class GuestOrder(GuestTableView):
    def post(self, request, code):
        body = GuestOrderSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        table = self.table(request, code, lock=True)
        outlet = table.outlet

        ref = str(data['client_ref']) if data.get('client_ref') else None
        if ref:
            done = OrderEvent.objects.filter(type='qr_order', data__client_ref=ref).select_related('order').first()
            if done:
                return Response(self._receipt(done.order, done.data, outlet))
        since = timezone.now() - timedelta(minutes=WINDOW_MINUTES)
        if OrderEvent.objects.filter(type='qr_order', data__table=table.id, created_at__gte=since).count() >= ORDERS_PER_TABLE:
            raise Conflict('Too many orders from this table just now. Please ask the staff.', code='too_many')

        products = {p.id: p for p in Product.objects.filter(
            id__in=[line['menu_item'] for line in data['items']], is_active=True,
            category__is_active=True, category__menu_links__menu__outlet=outlet).select_related('category')}
        for line in data['items']:
            product = products.get(line['menu_item'])
            if product is None:
                raise ApiError("An item in your order isn't on the menu any more. Please refresh the menu.",
                               code='invalid', fields={'items': [f'No menu item {line["menu_item"]}.']})
            if not product.is_available:
                raise Conflict(f'{product.name} is sold out. Please remove it and order again.', code='item_unavailable')

        order = open_order_of_table(table)
        if order is None:
            day = business_date(outlet, request.tenant)
            order = Order.objects.create(
                outlet=outlet, table=table, type='dine_in', source='qr', business_date=day,
                order_number=new_order_number(outlet, day),
                service_charge_rate=pricing.service_charge_rate(TenantSettings.objects.get(), 'dine_in'),
                customer_name=data['name'], customer_phone=data['phone'])
            line_table = None
        else:
            order = Order.objects.select_for_update().get(id=order.id)
            line_table = None if order.table_id == table.id else table  # merged into another table's bill
            changed = []
            for field, value in (('customer_name', data['name']), ('customer_phone', data['phone'])):
                if not getattr(order, field):
                    setattr(order, field, value)
                    changed.append(field)
            if changed:
                order.save(update_fields=[*changed, 'updated_at'])

        lines = []
        for line in data['items']:
            item = add_line(order, products[line['menu_item']], line['quantity'], line.get('special_instructions'),
                            None, table=line_table)
            item.source = 'qr'
            item.save(update_fields=['source'])
            lines.append({'name': item.menu_item_name, 'quantity': item.quantity})
        recalculate(order, request.tenant)
        sync_order_tables(order)
        event = {'table': table.id, 'table_label': _table_label(table), 'name': data['name'], 'phone': data['phone'],
                 'items': lines, 'client_ref': ref}
        record(order, 'qr_order', None, **event)
        return Response(self._receipt(order, event, outlet), status=201)

    @staticmethod
    def _receipt(order, event, outlet):
        return {'order_number': order.order_number, 'table': event.get('table_label'), 'items': event.get('items', []),
                'mode': _mode(outlet)}
