"""
/orders/ and /order-items/: taking orders, adding and changing items, the kitchen
(KOT, statuses), voids and cancellation. Contracts: MISSING_APIS.md "Orders & kitchen".
Settling and payments come with the payments module.
"""
import re
from datetime import timedelta

from django.db.models import Avg, F, Q
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts import audit
from accounts.views import use_approval
from catalogue.models import Product
from core.exceptions import ApiError, Conflict, PermissionRequired
from core.money import money_str
from core.pagination import StandardPagination
from floor.models import DiningTable
from outlets.services import outlets_for
from outlets.views import outlet_from_param
from payments.services import payment_payload

from . import pricing
from .models import OPEN_STATUSES, ItemVoid, Kot, Order, OrderItem, OrderItemTax
from .services import business_date, history_start, new_order_number, next_number, recalculate, record, sync_table

KITCHEN_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served']
ITEM_STATUS_FOR_ORDER = {'preparing': 'preparing', 'ready': 'ready', 'served': 'served'}
PHONE_RE = re.compile(r'\+?[\d\s-]{7,15}')

_dt = serializers.DateTimeField()


def when(value):
    return _dt.to_representation(value) if value else None


def person(user):
    return {'id': user.id, 'name': user.full_name} if user else None


def decimals_of(request):
    return int(request.tenant.get('currency_decimals') or 0)


# ---- Reading ------------------------------------------------------------------

def item_payload(item, decimals):
    m = lambda v: money_str(v, decimals)  # noqa: E731
    return {
        'id': item.id,
        'order': item.order_id,
        'menu_item': item.product_id,
        'menu_item_name': item.menu_item_name,
        'category_name': item.category_name,
        'quantity': item.quantity,
        'voided_quantity': item.voided_quantity,
        'unit_price': m(item.unit_price),
        'menu_item_price': m(item.unit_price),
        'total_price': m(item.total_price),
        'discount_amount': m(item.discount_amount),
        'tax_amount': m(item.tax_amount),
        'taxes': [{'id': t.tax_id, 'name': t.name, 'type': t.type,
                   'rate': f'{t.rate:.3f}' if t.rate is not None else None, 'amount': m(t.tax_amount)}
                  for t in item.taxes.all()],
        'special_instructions': item.special_instructions,
        'status': item.status,
        'kot_number': item.kot.number if item.kot_id else None,
        'kot_sent_at': when(item.kot.sent_at) if item.kot_id else None,
        'created_at': when(item.created_at),
        'updated_at': when(item.updated_at),
    }


def tax_breakdown(order, decimals):
    """Each tax charged on the order, added up across its lines."""
    totals = {}
    for item in order.items.all():
        for t in item.taxes.all():
            key = (t.tax_id, t.name, t.type, t.rate)
            totals[key] = totals.get(key, pricing.ZERO) + t.tax_amount
    return [{'id': k[0], 'name': k[1], 'type': k[2], 'rate': f'{k[3]:.3f}' if k[3] is not None else None,
             'amount': money_str(v, decimals)} for k, v in totals.items() if v]


def order_payload(order, request):
    decimals = decimals_of(request)
    m = lambda v: money_str(v, decimals)  # noqa: E731
    items = list(order.items.all())
    return {
        'id': order.id,
        'order_number': order.order_number,
        'business_date': str(order.business_date),
        'restaurant': order.outlet_id,
        'restaurant_name': order.outlet.name,
        'table': order.table_id,
        'table_number': order.table.table_number if order.table else None,
        'table_name': order.table.name if order.table else None,
        'type': order.type,
        'status': order.status,
        'payment_status': order.payment_status,
        'source': order.source,
        'order_source': order.source,
        'guest_count': order.guest_count,
        'customer_name': order.customer_name,
        'customer_phone': order.customer_phone,
        'customer_email': order.customer_email,
        'room_number': order.room_number,
        'notes': order.notes,
        'server': order.server_id,
        'server_name': order.server.full_name if order.server else None,
        'waiter_name': order.server.full_name if order.server else None,
        'created_by': person(order.created_by),
        'created_by_name': order.created_by.full_name if order.created_by else None,
        'items': [item_payload(i, decimals) for i in items],
        'total_items': sum(i.quantity for i in items),
        'subtotal': m(order.subtotal),
        'discount_type': order.discount_type or None,
        'discount_percent': f'{order.discount_percent:.2f}' if order.discount_percent is not None else None,
        'discount_amount': m(order.discount_amount),
        'discount_reason': order.discount_reason,
        'discounted_by': person(order.discounted_by),
        'discount_approved_by': person(order.discount_approved_by),
        'tax_amount': m(order.tax_amount),
        'tax_breakdown': tax_breakdown(order, decimals),
        'service_charge': m(order.service_charge),
        'round_off': m(order.round_off),
        'total_amount': m(order.total_amount),
        'amount_paid': m(order.amount_paid),
        'amount_due': m(order.amount_due),
        'payments': [payment_payload(p, decimals) for p in order.payments.all()],
        'tip_amount': m(sum((t.amount for t in order.tips.all()), pricing.ZERO)),
        'invoice_number': order.invoice_number or None,
        'order_time': when(order.created_at),
        'created_at': when(order.created_at),
        'updated_at': when(order.updated_at),
        'served_time': when(order.served_at),
        'closed_at': when(order.closed_at),
        'closed_by': person(order.closed_by),
        'cancelled_at': when(order.cancelled_at),
        'cancelled_by': person(order.cancelled_by),
        'cancel_approved_by': person(order.cancel_approved_by),
        'cancel_reason': order.cancel_reason,
        'version': order.version,
    }


def _orders(request):
    qs = Order.objects.filter(outlet__in=outlets_for(request.user))
    start = history_start(request)
    if start:
        # Without history.full: open orders, and bills closed inside the user's history window
        qs = qs.filter(Q(status__in=OPEN_STATUSES) | Q(closed_at__gte=start) | Q(cancelled_at__gte=start))
    return (qs
            .select_related('outlet', 'table', 'server', 'created_by', 'closed_by', 'cancelled_by',
                            'cancel_approved_by', 'discounted_by', 'discount_approved_by')
            .prefetch_related('items__taxes', 'items__kot', 'payments__payment_method', 'payments__received_by', 'tips'))


def _locked_order(request, pk, must_be_open=True):
    """The order, locked for this transaction; 409 when it's closed."""
    order = generics.get_object_or_404(
        Order.objects.select_for_update().filter(outlet__in=outlets_for(request.user)), pk=pk)
    if must_be_open and not order.is_open:
        raise Conflict(f"This order is {order.status}, so it can't be changed.", code='order_closed')
    return order


def _fresh(request, order_id):
    return order_payload(_orders(request).get(id=order_id), request)


class OrderPagination(StandardPagination):
    page_size = 100


# ---- Creating -----------------------------------------------------------------

class NewItemSerializer(serializers.Serializer):
    menu_item = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=999)
    special_instructions = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=500)


class GuestFields(serializers.Serializer):
    customer_name = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=200)
    customer_phone = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=30)
    customer_email = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=200)
    room_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=2000)
    guest_count = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=999)

    def validate_customer_phone(self, value):
        value = (value or '').strip()
        if value and not PHONE_RE.fullmatch(value):
            raise serializers.ValidationError('Enter a valid phone number.')
        return value


class NewOrderSerializer(GuestFields):
    restaurant = serializers.IntegerField()
    table = serializers.IntegerField(required=False, allow_null=True)
    type = serializers.ChoiceField(choices=Order.TYPES, default='dine_in')
    client_ref = serializers.UUIDField(required=False, allow_null=True)
    items = NewItemSerializer(many=True, required=False)


class OrderChangeSerializer(GuestFields):
    table = serializers.IntegerField(required=False, allow_null=True)


GUEST_TEXT_FIELDS = ('customer_name', 'customer_phone', 'customer_email', 'room_number', 'notes')


def _product_for(outlet, product_id):
    product = (Product.objects.filter(id=product_id, is_active=True, category__menu_links__menu__outlet=outlet)
               .select_related('category').first())
    if product is None:
        raise ApiError("This item isn't on this restaurant's menu.", code='invalid',
                       fields={'menu_item': [f'No menu item {product_id} here.']})
    if not product.is_available:
        raise Conflict(f'{product.name} is sold out.', code='item_unavailable')
    return product


def _free_table(outlet, table_id, order=None):
    """The table, locked; 409 when another order is open on it."""
    table = DiningTable.objects.select_for_update().filter(id=table_id, outlet=outlet, is_active=True).first()
    if table is None:
        raise ApiError('No such table in this restaurant.', code='invalid', fields={'table': ['No such table.']})
    other = Order.objects.filter(table=table, status__in=OPEN_STATUSES).exclude(id=getattr(order, 'id', None)).first()
    if other:
        raise Conflict(f'Table {table.table_number} already has an open order ({other.order_number}). '
                       'Add the items to it.', code='table_has_order', order_id=other.id)
    return table


def add_line(order, product, quantity, note, user):
    item = OrderItem.objects.create(
        order=order, product=product, menu_item_name=product.name, category_name=product.category.name,
        unit_price=product.price, quantity=quantity, special_instructions=(note or '').strip(),
        discountable=product.discountable, created_by=user)
    OrderItemTax.objects.bulk_create([
        OrderItemTax(item=item, tax=t['tax'], name=t['name'], type=t['type'], rate=t['rate'], amount=t['amount'],
                     fixed_basis=t['fixed_basis'], tenant_id=item.tenant_id)
        for t in pricing.applicable_taxes(product, order.type)])
    return item


class OrderList(generics.GenericAPIView):
    pagination_class = OrderPagination

    def get_queryset(self):
        params = self.request.query_params
        qs = _orders(self.request)
        outlet = outlet_from_param(self.request, required=False)
        if outlet:
            qs = qs.filter(outlet=outlet)
        if params.get('status'):
            qs = qs.filter(status__in=params['status'].split(','))
        if params.get('type'):
            qs = qs.filter(type=params['type'])
        if params.get('table_id'):
            qs = qs.filter(table_id=params['table_id'])
        if params.get('date_from'):
            qs = qs.filter(business_date__gte=params['date_from'][:10])
        if params.get('date_to'):
            qs = qs.filter(business_date__lte=params['date_to'][:10])
        if params.get('search'):
            s = params['search']
            qs = qs.filter(Q(order_number__icontains=s) | Q(customer_name__icontains=s) | Q(customer_phone__icontains=s))
        return qs

    def get(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response([order_payload(o, request) for o in page])

    def post(self, request):
        body = NewOrderSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if data.get('client_ref'):
            existing = _orders(request).filter(client_ref=data['client_ref']).first()
            if existing:
                return Response(order_payload(existing, request))
        outlet = outlets_for(request.user).filter(id=data['restaurant'], is_active=True).first()
        if outlet is None:
            raise ApiError('No such restaurant.', code='invalid', fields={'restaurant': ['No such restaurant.']})
        table = _free_table(outlet, data['table']) if data.get('table') else None
        lines = [(_product_for(outlet, line['menu_item']), line) for line in data.get('items', [])]

        day = business_date(outlet, request.tenant)
        order = Order.objects.create(
            outlet=outlet, table=table, type=data['type'], business_date=day,
            order_number=new_order_number(outlet, day), guest_count=data.get('guest_count'),
            client_ref=data.get('client_ref'), created_by=request.user,
            **{f: (data.get(f) or '').strip() for f in GUEST_TEXT_FIELDS})
        for product, line in lines:
            add_line(order, product, line['quantity'], line.get('special_instructions'), request.user)
        recalculate(order, request.tenant)
        sync_table(table)
        record(order, 'created', request.user, items=len(lines))
        return Response(_fresh(request, order.id), status=status.HTTP_201_CREATED)


# ---- One order ----------------------------------------------------------------

class OrderDetail(generics.GenericAPIView):
    def get(self, request, pk):
        return Response(order_payload(generics.get_object_or_404(_orders(request), pk=pk), request))

    def patch(self, request, pk):
        body = OrderChangeSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        changes = body.validated_data
        order = _locked_order(request, pk, must_be_open=False)
        # Guest details and notes can still be added to a closed bill (printed on reprints); nothing else
        if not order.is_open and set(changes) - {'customer_name', 'customer_phone', 'notes'}:
            raise Conflict(f"This order is {order.status}, so it can't be changed.", code='order_closed')
        old_table = order.table
        if 'table' in changes and changes['table'] != order.table_id:
            order.table = _free_table(order.outlet, changes['table'], order) if changes['table'] else None
        for field in GUEST_TEXT_FIELDS:
            if field in changes:
                setattr(order, field, (changes[field] or '').strip())
        if 'guest_count' in changes:
            order.guest_count = changes['guest_count']
        order.version += 1
        order.save()
        if order.table != old_table:
            sync_table(old_table)
            sync_table(order.table)
            record(order, 'table_changed', request.user, from_table=getattr(old_table, 'table_number', None),
                   to_table=getattr(order.table, 'table_number', None))
        return Response(_fresh(request, order.id))

    put = patch


@api_view(['PATCH', 'POST'])
def update_status(request, pk):
    """Kitchen and floor progress: pending → confirmed → preparing → ready → served."""
    new_status = request.data.get('status')
    if new_status == 'cancelled':
        return _cancel(request, pk)
    if new_status not in KITCHEN_STATUSES + ['completed']:
        raise ApiError('Not a valid status.', code='invalid', fields={'status': ['Not a valid status.']})
    order = _locked_order(request, pk)
    if new_status == 'completed' and order.amount_due > 0:
        raise Conflict('Settle the bill first.', code='not_paid')
    if order.status == 'pending' and new_status != 'pending':
        # The app sends an order to the kitchen by confirming it: its unsent items go on a KOT
        _new_kot(order, request.user)
    order.status = new_status
    if new_status == 'served' and not order.served_at:
        order.served_at = timezone.now()
    if new_status == 'completed':
        order.closed_at = timezone.now()
        order.closed_by = request.user
    if new_status in ITEM_STATUS_FOR_ORDER:
        order.items.filter(quantity__gt=0).exclude(status='cancelled').update(status=ITEM_STATUS_FOR_ORDER[new_status])
    order.version += 1
    order.save()
    sync_table(order.table)
    record(order, 'status', request.user, status=new_status)
    return Response(_fresh(request, order.id))


def _cancel(request, pk):
    order = _locked_order(request, pk)
    if order.amount_paid > 0:
        raise Conflict('Refund the payments before cancelling.', code='has_payments')
    reason = str(request.data.get('reason') or '').strip()
    approval = use_approval(request, request.data.get('approval_id'), 'order.cancel', order.id)
    order.status = 'cancelled'
    order.cancelled_at = timezone.now()
    order.cancelled_by = request.user
    order.cancel_approved_by = approval.approver if approval else None
    order.cancel_reason = reason
    order.version += 1
    order.save()
    order.items.update(status='cancelled')
    sync_table(order.table)
    record(order, 'cancelled', request.user, reason=reason)
    audit.record(request, 'order.cancel', 'order', order.id, approval=approval,
                 after={'order_number': order.order_number, 'reason': reason, 'total': str(order.total_amount)})
    return Response(_fresh(request, order.id))


@api_view(['POST'])
def cancel(request, pk):
    return _cancel(request, pk)


def _new_kot(order, user):
    """Put the order's unsent items on the next numbered KOT; None when there are none."""
    items = list(order.items.filter(kot__isnull=True, quantity__gt=0))
    if not items:
        return None, []
    kot = Kot.objects.create(order=order, number=next_number(order.outlet, 'kot', order.business_date), sent_by=user)
    OrderItem.objects.filter(id__in=[i.id for i in items]).update(kot=kot)
    record(order, 'kot', user, kot_number=kot.number, items=len(items))
    return kot, items


@api_view(['POST'])
def send_kot(request, pk):
    """New items go to the kitchen on one numbered KOT; reprint_kot_number returns an earlier one again."""
    reprint = request.data.get('reprint_kot_number')
    if reprint:
        order = generics.get_object_or_404(_orders(request), pk=pk)
        kot = order.kots.filter(number=reprint).first()
        if kot is None:
            raise ApiError(f'This order has no KOT {reprint}.', code='not_found', status_code=404)
        Kot.objects.filter(id=kot.id).update(print_count=F('print_count') + 1)
        items = list(kot.items.filter(quantity__gt=0))
    else:
        order = _locked_order(request, pk)
        kot, items = _new_kot(order, request.user)
        if kot is None:
            raise Conflict('There are no new items to send to the kitchen.', code='nothing_to_send')
        if order.status == 'pending':
            order.status = 'confirmed'
            order.version += 1
            order.save(update_fields=['status', 'version', 'updated_at'])
    return Response({
        'order_id': order.id, 'kot_number': kot.number, 'is_reprint': bool(reprint), 'sent_at': when(kot.sent_at),
        'items': [{'id': i.id, 'menu_item_name': i.menu_item_name, 'quantity': i.quantity,
                   'special_instructions': i.special_instructions} for i in items],
    })


@api_view(['GET'])
def kitchen_stats(request):
    outlet = outlet_from_param(request, required=False)
    orders = Order.objects.filter(outlet__in=outlets_for(request.user))
    if outlet:
        orders = orders.filter(outlet=outlet)
    now = timezone.now()
    open_orders = orders.filter(status__in=OPEN_STATUSES)
    counts = {s: open_orders.filter(status=s).count() for s in OPEN_STATUSES}
    served_recently = orders.filter(served_at__gte=now - timedelta(hours=24))
    avg = served_recently.aggregate(avg=Avg(F('served_at') - F('created_at')))['avg']
    avg_minutes = round(avg.total_seconds() / 60) if avg else 0
    return Response({
        'pending_orders': counts['pending'] + counts['confirmed'],
        'preparing_orders': counts['preparing'],
        'ready_orders': counts['ready'],
        'served_orders': served_recently.count(),
        'overdue_orders': open_orders.filter(status__in=['pending', 'confirmed', 'preparing'],
                                             created_at__lt=now - timedelta(minutes=30)).count(),
        'average_prep_time': avg_minutes,
        'estimated_wait_time': avg_minutes or 15,
        'orders_per_hour': orders.filter(created_at__gte=now - timedelta(hours=1)).count(),
    })


# ---- Items --------------------------------------------------------------------

def _sent_to_kitchen(order):
    """Same rule as the app: once the kitchen has the order, taking items off is a void."""
    return order.status != 'pending'


def _void_needed():
    return PermissionRequired('order.void_items', approvable=True,
                              detail='The kitchen has this item: void it instead (needs a manager).')


def _locked_item(request, pk):
    item = generics.get_object_or_404(
        OrderItem.objects.filter(order__outlet__in=outlets_for(request.user)), pk=pk)
    order = _locked_order(request, item.order_id)
    return OrderItem.objects.select_for_update().get(id=item.id), order


def _item_out(item_id, decimals):
    return item_payload(OrderItem.objects.select_related('kot').prefetch_related('taxes').get(id=item_id), decimals)


class AddItemSerializer(NewItemSerializer):
    order = serializers.IntegerField()


@api_view(['POST'])
def add_item(request):
    body = AddItemSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    data = body.validated_data
    order = _locked_order(request, data['order'])
    product = _product_for(order.outlet, data['menu_item'])
    item = add_line(order, product, data['quantity'], data.get('special_instructions'), request.user)
    recalculate(order, request.tenant)
    record(order, 'item_added', request.user, item=item.id, name=item.menu_item_name, quantity=item.quantity)
    return Response(_item_out(item.id, decimals_of(request)), status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def item_detail(request, pk):
    decimals = decimals_of(request)
    if request.method == 'GET':
        item = generics.get_object_or_404(OrderItem.objects.filter(order__outlet__in=outlets_for(request.user)), pk=pk)
        return Response(_item_out(item.id, decimals))
    item, order = _locked_item(request, pk)

    if request.method == 'DELETE':
        if _sent_to_kitchen(order):
            raise _void_needed()
        record(order, 'item_removed', request.user, name=item.menu_item_name, quantity=item.quantity)
        item.delete()
        recalculate(order, request.tenant)
        return Response(status=status.HTTP_204_NO_CONTENT)

    changed = []
    if 'quantity' in request.data:
        try:
            quantity = int(request.data['quantity'])
        except (TypeError, ValueError):
            quantity = 0
        if not 1 <= quantity <= 999:
            raise ApiError('Quantity must be from 1 to 999.', code='invalid', fields={'quantity': ['From 1 to 999.']})
        if quantity < item.quantity and _sent_to_kitchen(order):
            raise _void_needed()
        record(order, 'item_quantity', request.user, name=item.menu_item_name, before=item.quantity, after=quantity)
        item.quantity = quantity
        changed.append('quantity')
    if 'status' in request.data:
        if request.data['status'] not in OrderItem.STATUSES or request.data['status'] == 'cancelled':
            raise ApiError('Not a valid status.', code='invalid', fields={'status': ['Not a valid status.']})
        item.status = request.data['status']
        changed.append('status')
    if 'special_instructions' in request.data:
        if item.kot_id:
            raise Conflict('This item is already on a KOT.', code='already_sent')
        item.special_instructions = str(request.data['special_instructions'] or '').strip()[:500]
        changed.append('special_instructions')
    if changed:
        item.save(update_fields=changed + ['updated_at'])
        if 'quantity' in changed:
            recalculate(order, request.tenant)
    return Response(_item_out(item.id, decimals))


@api_view(['POST'])
def void_item(request, pk):
    """Take quantity off a line the kitchen already had, keeping who, why and the approver."""
    item, order = _locked_item(request, pk)
    try:
        quantity = int(request.data.get('quantity') or 0)
    except (TypeError, ValueError):
        quantity = 0
    if not 1 <= quantity <= item.quantity:
        raise ApiError(f'Void from 1 to {item.quantity}.', code='invalid',
                       fields={'quantity': [f'From 1 to {item.quantity}.']})
    reason = str(request.data.get('reason') or '').strip()
    if not reason:
        raise ApiError('Enter the reason.', code='invalid', fields={'reason': ['Enter the reason.']})
    approval = use_approval(request, request.data.get('approval_id'), 'order.void_items', order.id)
    void = ItemVoid.objects.create(item=item, quantity=quantity, amount=item.unit_price * quantity, reason=reason,
                                   voided_by=request.user, approved_by=approval.approver if approval else None)
    item.quantity -= quantity
    item.voided_quantity += quantity
    if item.quantity == 0:
        item.status = 'cancelled'
    item.save(update_fields=['quantity', 'voided_quantity', 'status', 'updated_at'])
    recalculate(order, request.tenant)
    record(order, 'item_voided', request.user, name=item.menu_item_name, quantity=quantity, reason=reason)
    audit.record(request, 'order.void_item', 'order_item', item.id, approval=approval,
                 after={'order_number': order.order_number, 'item': item.menu_item_name, 'quantity': quantity,
                        'reason': reason})
    decimals = decimals_of(request)
    return Response({
        'item': {'id': item.id, 'quantity': item.quantity, 'voided_quantity': item.voided_quantity, 'status': item.status},
        'void': {'id': void.id, 'quantity': quantity, 'amount': money_str(void.amount, decimals), 'reason': reason,
                 'voided_by': person(request.user), 'approved_by': person(void.approved_by),
                 'voided_at': when(void.voided_at)},
        'order': {'id': order.id, 'subtotal': money_str(order.subtotal, decimals),
                  'tax_amount': money_str(order.tax_amount, decimals),
                  'total_amount': money_str(order.total_amount, decimals)},
    })
