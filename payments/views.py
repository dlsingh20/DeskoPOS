"""
Billing: bill discounts, settling (payments, tip, Credit Pay) in one transaction, part
payments, the payment list for cash counters, and refunds.
Contracts: MISSING_APIS.md "Billing, discounts & payments", "Cash counters", "Refunds".
"""
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import generics, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import audit
from accounts.models import User
from accounts.views import use_approval
from core.exceptions import ApiError, Conflict
from core.money import MoneyField, money_str
from core.pagination import StandardPagination
from core.permissions import require
from orders.models import Order
from orders.services import recalculate, record, sync_order_tables
from orders.views import _fresh, _locked_order, order_payload
from outlets.models import TenantSettings
from outlets.services import outlets_for

from .models import OutstandingAccount, Payment, Refund, RefundLine, Tip
from .services import (
    APP_METHODS, ZERO, decimals_of, document_number, open_shift_of, payment_method_for, payment_payload, person,
    refund_payload, remember, replay, shift_for_payment, when,
)

UNPROCESSABLE = 422


def _money(request, value):
    return money_str(value, decimals_of(request))


def _order_any_status(request, pk):
    return generics.get_object_or_404(
        Order.objects.select_for_update().filter(outlet__in=outlets_for(request.user)), pk=pk)


# ---- Discount -----------------------------------------------------------------

class DiscountSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=['percent', 'fixed'])
    value = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal('0.0001'))
    reason = serializers.CharField(max_length=200)
    expected_subtotal = serializers.DecimalField(max_digits=14, decimal_places=4, required=False, allow_null=True)
    approval_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)


@api_view(['POST'])
def apply_discount(request, pk):
    body = DiscountSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    data = body.validated_data
    order = _locked_order(request, pk)
    decimals = decimals_of(request)
    subtotal = order.subtotal
    if data.get('expected_subtotal') is not None and _money(request, data['expected_subtotal']) != _money(request, subtotal):
        raise Conflict(f'The bill changed. New subtotal is {_money(request, subtotal)}.', code='subtotal_changed',
                       subtotal=_money(request, subtotal))
    eligible = sum((i.unit_price * i.quantity for i in order.items.all() if i.discountable), ZERO)
    if eligible <= 0:
        raise Conflict('No item on this bill can be discounted.', code='nothing_discountable')
    if data['type'] == 'percent':
        if data['value'] > 100:
            raise ApiError('At most 100%.', code='invalid', fields={'value': ['At most 100%.']})
        percent = data['value']
    else:
        if data['value'] > eligible:
            raise ApiError(f'At most {_money(request, eligible)}.', code='invalid',
                           fields={'value': [f'At most {_money(request, eligible)}.']})
        percent = data['value'] * 100 / eligible

    approval = None
    limit = TenantSettings.objects.get().cashier_discount_limit
    if percent > limit:
        approval = use_approval(request, data.get('approval_id'), 'discount.unlimited', order.id)
    order.discount_type = data['type']
    order.discount_percent = data['value'] if data['type'] == 'percent' else None
    order.discount_amount = data['value'] if data['type'] == 'fixed' else ZERO
    order.discount_reason = data['reason'].strip()
    order.discounted_by = request.user
    order.discount_approved_by = approval.approver if approval else None
    recalculate(order, request.tenant)
    if order.total_amount < order.amount_paid:
        raise Conflict('The discounted total would be less than the amount already paid.', code='below_paid')
    record(order, 'discount', request.user, type=data['type'], value=str(data['value']), reason=order.discount_reason)
    audit.record(request, 'order.discount', 'order', order.id, approval=approval,
                 after={'order_number': order.order_number, 'type': data['type'], 'value': str(data['value']),
                        'amount': money_str(order.discount_amount, decimals), 'reason': order.discount_reason})
    return Response(_fresh(request, order.id))


@api_view(['DELETE'])
def remove_discount(request, pk):
    order = _locked_order(request, pk)
    order.discount_type = ''
    order.discount_percent = None
    order.discount_amount = ZERO
    order.discount_reason = ''
    order.discounted_by = None
    order.discount_approved_by = None
    recalculate(order, request.tenant)
    record(order, 'discount_removed', request.user)
    return Response(_fresh(request, order.id))


# ---- Settle -------------------------------------------------------------------

class PaymentLineSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=sorted(APP_METHODS))
    amount = MoneyField(min_value=Decimal('0.0001'))
    reference = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)
    channel = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=20)
    card_type = serializers.ChoiceField(choices=['credit', 'debit'], required=False, allow_null=True)
    amount_received = MoneyField(required=False, allow_null=True)
    change_returned = MoneyField(required=False, allow_null=True)


class TipSerializer(serializers.Serializer):
    amount = MoneyField(min_value=Decimal('0.0001'))
    method = serializers.ChoiceField(choices=sorted(APP_METHODS))
    staff_id = serializers.IntegerField(required=False, allow_null=True)


class CreditSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=200)
    customer_phone = serializers.CharField(max_length=30)


class SettleSerializer(serializers.Serializer):
    expected_amount_due = MoneyField()
    payments = PaymentLineSerializer(many=True, required=False)
    tip = TipSerializer(required=False, allow_null=True)
    room_charge = serializers.DictField(required=False, allow_null=True)
    credit = CreditSerializer(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=1000)
    approval_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    cash_register = serializers.IntegerField(required=False, allow_null=True)
    idempotency_key = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=100)


def add_payment(request, order, shift, line, notes='', source='settle'):
    received = line.get('amount_received')
    change = None
    if line['method'] == 'cash' and received is not None:
        if received < line['amount']:
            raise ApiError('Cash received is less than the amount.', code='invalid',
                           fields={'amount_received': ['Less than the amount.']})
        change = received - line['amount']
    method = line['method']
    channel = (line.get('channel') or '').strip().lower()
    return Payment.objects.create(
        outlet=order.outlet, order=order, payment_method=payment_method_for(method, channel), method=method,
        channel=channel, card_type=line.get('card_type') or ('debit' if method == 'debit_card' else
                                                             'credit' if method == 'credit_card' else ''),
        amount=line['amount'], amount_received=received if method == 'cash' else None, change_returned=change,
        reference=(line.get('reference') or '').strip(), shift=shift, received_by=request.user, notes=notes,
        source=source)


def close_order(request, order, new_status):
    now = timezone.now()
    order.status = new_status
    order.closed_at = now
    order.closed_by = request.user
    order.served_at = order.served_at or now
    if not order.invoice_number:
        order.invoice_number = document_number(order.outlet, 'invoice', order.business_date)
    order.items.filter(quantity__gt=0).exclude(status='cancelled').update(status='served')
    recalculate(order, request.tenant)  # payment status and version
    sync_order_tables(order)


@api_view(['POST'])
@permission_classes([require('bill.settle')])
def settle(request, pk):
    """Payments, tip, completion, invoice number and table in one transaction (MISSING_APIS.md)."""
    endpoint = f'settle:{pk}'
    order = _order_any_status(request, pk)  # lock first: a parallel retry waits here, then replays
    done = replay(request, endpoint)
    if done:
        return done
    body = SettleSerializer(data=request.data, context={'request': request})
    body.is_valid(raise_exception=True)
    data = body.validated_data

    if order.status in ('completed', 'outstanding', 'refunded'):
        raise Conflict(f'Order is already {order.status}.', code='already_settled', order_status=order.status)
    if order.status == 'cancelled':
        raise Conflict('This order is cancelled.', code='order_closed')
    if not order.items.filter(quantity__gt=0).exists():
        raise Conflict('This order has no items.', code='empty_order')
    due = order.amount_due
    if _money(request, data['expected_amount_due']) != _money(request, due):
        raise Conflict(f'Amount due is now {_money(request, due)}.', code='amount_changed', amount_due=_money(request, due))
    if data.get('room_charge'):
        raise Conflict('Guest Visit (charge to a hotel room) needs the StayDesko connection, which is not set up yet.',
                       code='room_charge_unavailable')

    lines = data.get('payments') or []
    paying = sum((line['amount'] for line in lines), ZERO)
    if paying > due:
        return Response({'code': 'overpayment', 'detail': f'Payments exceed the amount due by {_money(request, paying - due)}.'},
                        status=UNPROCESSABLE)
    credit = data.get('credit')
    approval = None
    if credit:
        if paying >= due:
            raise ApiError('Nothing is left for Credit Pay.', code='invalid', fields={'credit': ['Nothing left to pay later.']})
        approval = use_approval(request, data.get('approval_id'), 'payment.credit', order.id)
    elif paying < due:
        return Response({'code': 'underpayment', 'detail': f'Payments are {_money(request, due - paying)} short of the amount due.'},
                        status=UNPROCESSABLE)

    tip = data.get('tip')
    shift = shift_for_payment(request, order.outlet, data.get('cash_register')) if (lines or tip) else None
    notes = (data.get('notes') or '').strip()
    payments = [add_payment(request, order, shift, line, notes if n == 0 else '') for n, line in enumerate(lines)]
    order.amount_paid += paying
    tip_row = None
    if tip:
        staff = User.objects.filter(id=tip['staff_id']).first() if tip.get('staff_id') else None
        if tip.get('staff_id') and staff is None:
            raise ApiError('No such staff member.', code='invalid', fields={'tip.staff_id': ['No such staff member.']})
        tip_row = Tip.objects.create(order=order, method=tip['method'], amount=tip['amount'], staff=staff, shift=shift,
                                     received_by=request.user)

    if credit:
        name, phone = credit['customer_name'].strip(), credit['customer_phone'].strip()
        order.customer_name = order.customer_name or name
        order.customer_phone = order.customer_phone or phone
        OutstandingAccount.objects.create(order=order, customer_name=name, customer_phone=phone,
                                          customer_email=order.customer_email, original_amount=due - paying,
                                          approved_by=approval.approver if approval else None, created_by=request.user)
    close_order(request, order, 'outstanding' if credit else 'completed')
    record(order, 'settled', request.user, paid=str(paying), credit=bool(credit), notes=notes)
    audit.record(request, 'order.settle', 'order', order.id, approval=approval,
                 after={'order_number': order.order_number, 'paid': str(paying), 'credit': bool(credit),
                        'invoice': order.invoice_number})

    decimals = decimals_of(request)
    payload = order_payload(Order.objects.get(id=order.id), request)
    response = Response({
        'order': {k: payload[k] for k in ('id', 'order_number', 'status', 'total_amount', 'amount_paid', 'amount_due',
                                          'closed_at', 'invoice_number', 'payment_status')},
        'payments': [payment_payload(p, decimals) for p in payments],
        'tip': {'id': tip_row.id, 'amount': money_str(tip_row.amount, decimals), 'method': tip_row.method,
                'staff': person(tip_row.staff)} if tip_row else None,
        'table': {'id': order.table.id, 'status': order.table.status} if order.table else None,
    })
    return remember(request, endpoint, response)


# ---- Part payments and the payment list ---------------------------------------

class FlexiblePaymentSerializer(PaymentLineSerializer):
    order_id = serializers.IntegerField(required=False)
    order = serializers.IntegerField(required=False)
    transaction_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=1000)
    cash_register = serializers.IntegerField(required=False, allow_null=True)


@api_view(['POST'])
@permission_classes([require('bill.settle')])
def flexible_payment(request):
    """A payment toward an open bill (part payment); the order stays open until settled."""
    endpoint = 'payment'
    body = FlexiblePaymentSerializer(data=request.data, context={'request': request})
    body.is_valid(raise_exception=True)
    data = body.validated_data
    order_id = data.get('order_id') or data.get('order')
    if not order_id:
        raise ApiError('Which order?', code='invalid', fields={'order_id': ['Required.']})
    order = _locked_order(request, order_id)
    done = replay(request, endpoint)
    if done:
        return done
    if data['amount'] > order.amount_due:
        return Response({'code': 'overpayment',
                         'detail': f'Amount exceeds the remaining balance of {_money(request, order.amount_due)}.'},
                        status=UNPROCESSABLE)
    shift = shift_for_payment(request, order.outlet, data.get('cash_register'))
    line = {**data, 'reference': data.get('reference') or data.get('transaction_id')}
    payment = add_payment(request, order, shift, line, (data.get('notes') or '').strip())
    order.amount_paid += payment.amount
    recalculate(order, request.tenant)
    record(order, 'payment', request.user, amount=str(payment.amount), method=payment.method)
    return remember(request, endpoint, Response(payment_payload(payment, decimals_of(request)),
                                                status=status.HTTP_201_CREATED))


class PaymentPagination(StandardPagination):
    page_size = 100


class PaymentList(generics.GenericAPIView):
    pagination_class = PaymentPagination

    def get(self, request):
        params = request.query_params
        qs = (Payment.objects.filter(outlet__in=outlets_for(request.user))
              .select_related('payment_method', 'received_by').order_by('-created_at', '-id'))
        for param, field in (('order', 'order_id'), ('cash_register', 'shift_id'), ('method', 'method')):
            if params.get(param):
                qs = qs.filter(**{field: params[param]})
        if params.get('restaurant_id'):
            qs = qs.filter(outlet_id=params['restaurant_id'])
        if params.get('since') and parse_datetime(params['since']):
            qs = qs.filter(created_at__gte=parse_datetime(params['since']))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response([payment_payload(p, decimals_of(request)) for p in page])


@api_view(['GET', 'PATCH'])
def payment_detail(request, pk):
    payment = generics.get_object_or_404(
        Payment.objects.filter(outlet__in=outlets_for(request.user)).select_related('payment_method', 'received_by'), pk=pk)
    if request.method == 'PATCH':
        if set(request.data) - {'notes'}:
            raise ApiError('Only the notes of a payment can be changed.', code='invalid')
        payment.notes = str(request.data.get('notes') or '')[:1000]
        payment.save(update_fields=['notes'])
    return Response(payment_payload(payment, decimals_of(request)))


# ---- Refunds ------------------------------------------------------------------

class RefundLineSerializer(serializers.Serializer):
    payment_id = serializers.IntegerField()
    amount = MoneyField(min_value=Decimal('0.0001'))
    method = serializers.ChoiceField(choices=sorted(APP_METHODS), required=False, allow_null=True)
    reference = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)


class RefundSerializer(serializers.Serializer):
    refunds = RefundLineSerializer(many=True, allow_empty=False)
    reason = serializers.ChoiceField(choices=Refund.REASONS)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=1000)
    approval_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    cash_register = serializers.IntegerField(required=False, allow_null=True)
    idempotency_key = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=100)


@api_view(['POST'])
def refund(request, pk):
    """A manager gives money back on a settled bill; cash comes out of the open counter."""
    endpoint = f'refund:{pk}'
    order = _order_any_status(request, pk)
    done = replay(request, endpoint)
    if done:
        return done
    body = RefundSerializer(data=request.data, context={'request': request})
    body.is_valid(raise_exception=True)
    data = body.validated_data
    if order.status != 'completed':
        raise Conflict(f'Only settled bills can be refunded. This bill is {order.status}.', code='not_refundable')
    note = (data.get('note') or '').strip()
    if data['reason'] == 'other' and not note:
        raise ApiError('Say why.', code='invalid', fields={'note': ['Required when the reason is Other.']})
    approval = use_approval(request, data.get('approval_id'), 'bill.refund', order.id)

    payments = {p.id: p for p in order.payments.select_for_update()}
    asked = {}
    for n, line in enumerate(data['refunds']):
        payment = payments.get(line['payment_id'])
        if payment is None:
            raise ApiError('That payment is not on this bill.', code='invalid',
                           fields={f'refunds[{n}].payment_id': ['Not on this bill.']})
        asked[payment.id] = asked.get(payment.id, ZERO) + line['amount']
        left = payment.amount - payment.refunded_amount
        if asked[payment.id] > left:
            raise ApiError(f'Payment {payment.id} has {_money(request, left)} left to refund.', code='amount_exceeds_paid',
                           fields={f'refunds[{n}].amount': [f'At most {_money(request, left)}.']})
    methods = [line.get('method') or payments[line['payment_id']].method for line in data['refunds']]
    shift = (shift_for_payment(request, order.outlet, data.get('cash_register')) if 'cash' in methods
             else open_shift_of(request.user))

    total = sum((line['amount'] for line in data['refunds']), ZERO)
    row = Refund.objects.create(order=order, credit_note_number=document_number(order.outlet, 'credit_note',
                                                                                 order.business_date),
                                amount=total, reason=data['reason'], note=note, shift=shift, refunded_by=request.user,
                                approved_by=approval.approver if approval else None)
    for line, method in zip(data['refunds'], methods):
        payment = payments[line['payment_id']]
        RefundLine.objects.create(refund=row, payment=payment, method=method, amount=line['amount'],
                                  reference=(line.get('reference') or '').strip())
        payment.refunded_amount += line['amount']
        payment.status = 'refunded' if payment.refunded_amount >= payment.amount else 'partially_refunded'
        payment.save(update_fields=['refunded_amount', 'status'])

    refunded_total = order.refunds.aggregate(t=Sum('amount'))['t'] or ZERO
    if refunded_total >= order.amount_paid:
        order.status = 'refunded'
        order.payment_status = 'refunded'
    else:
        order.payment_status = 'partially_refunded'
    order.version += 1
    order.save(update_fields=['status', 'payment_status', 'version', 'updated_at'])
    record(order, 'refund', request.user, amount=str(total), reason=data['reason'], credit_note=row.credit_note_number)
    audit.record(request, 'order.refund', 'order', order.id, approval=approval,
                 after={'order_number': order.order_number, 'amount': str(total), 'reason': data['reason'],
                        'credit_note': row.credit_note_number})

    decimals = decimals_of(request)
    m = lambda v: money_str(v, decimals)  # noqa: E731
    order = Order.objects.get(id=order.id)
    response = Response({
        'id': order.id, 'status': order.status, 'total_amount': m(order.total_amount), 'amount_paid': m(order.amount_paid),
        'refunded_total': m(refunded_total),
        'refund': refund_payload(row, decimals),
        'payments': [payment_payload(p, decimals) for p in order.payments.select_related('payment_method', 'received_by')],
    })
    return remember(request, endpoint, response)

