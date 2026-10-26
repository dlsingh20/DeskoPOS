from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from rest_framework import serializers
from rest_framework.response import Response

from core.exceptions import ApiError, Conflict
from core.money import money_str
from orders.services import next_number
from outlets.models import TenantSettings

from .models import IdempotencyRecord, PaymentMethod, Shift

ZERO = Decimal(0)

# The POS app's method names → the kind of the client's payment method
APP_METHODS = {
    'cash': 'cash', 'credit_card': 'card', 'debit_card': 'card', 'card': 'card',
    'mobile_payment': 'wallet', 'upi': 'wallet', 'digital_wallet': 'wallet', 'bank_transfer': 'bank_transfer',
}
CASH_REGISTER_EXEMPT_ROLES = ('administrator',)  # the app lets Administrators work without a counter

_dt = serializers.DateTimeField()


def when(value):
    return _dt.to_representation(value) if value else None


def person(user):
    return {'id': user.id, 'name': user.full_name} if user else None


def decimals_of(request):
    return int(request.tenant.get('currency_decimals') or 0)


def payment_method_for(app_method, channel=''):
    """The client's configured method for what the app sent: the wallet named by channel, else the first of its kind."""
    kind = APP_METHODS.get(app_method)
    if kind is None:
        raise ApiError(f'"{app_method}" is not a payment method the POS takes.', code='invalid',
                       fields={'method': ['Not a valid payment method.']})
    methods = PaymentMethod.objects.filter(is_active=True)
    if channel:
        named = methods.filter(code=channel.lower()).first()
        if named:
            return named
    return methods.filter(kind=kind).first()


def payment_payload(p, decimals):
    m = lambda v: money_str(v, decimals)  # noqa: E731
    return {
        'id': p.id,
        'order': p.order_id,
        'method': p.method,
        'method_label': p.payment_method.label if p.payment_method_id else p.method,
        'channel': p.channel or None,
        'card_type': p.card_type or None,
        'amount': m(p.amount),
        'amount_received': m(p.amount_received),
        'change_returned': m(p.change_returned),
        'transaction_id': p.reference,
        'reference': p.reference,
        'status': p.status,
        'refunded_amount': m(p.refunded_amount),
        'cash_register': p.shift_id,
        'processed_by': p.received_by_id,
        'processed_by_name': p.received_by.full_name,
        'processed_at': when(p.created_at),
        'created_at': when(p.created_at),
        'source': p.source,
        'notes': p.notes,
    }


# ---- Cash counter shifts ------------------------------------------------------

def open_shift_of(user):
    return Shift.objects.filter(cashier=user, status='open').select_related('counter').first()


def shift_for_payment(request, outlet, cash_register=None):
    """
    The cashier's open shift that money taken now belongs to. The app sends its id; without
    it the caller's open shift is used. Administrators may work without one.
    """
    if cash_register:
        shift = Shift.objects.filter(id=cash_register, status='open').first()
        if shift is None or shift.cashier_id != request.user.id:
            raise Conflict('That cash counter is not your open counter. Reopen the payment screen.', code='no_open_shift')
    else:
        shift = open_shift_of(request.user)
    if shift is None and request.user.role.key not in CASH_REGISTER_EXEMPT_ROLES:
        raise Conflict('Open a cash counter before taking payments.', code='no_open_shift')
    if shift and shift.outlet_id != outlet.id:
        raise Conflict(f'Your open counter ({shift.counter_name}) belongs to another restaurant.', code='no_open_shift')
    return shift


def shift_totals(shift, decimals):
    """Takings by method, cash expected in the drawer and the shift's activity."""
    m = lambda v: money_str(v or ZERO, decimals)  # noqa: E731
    from orders.models import ItemVoid, Order

    from .models import RefundLine

    # Takings minus the refunds paid out during this shift (a refund counts where the money left the drawer)
    taken = {r['method']: r for r in shift.payments.exclude(status__in=['failed', 'pending', 'voided'])
             .values('method').annotate(total=Sum('amount'), count=Count('id'))}
    refunded = {r['method']: r['total'] for r in RefundLine.objects.filter(refund__shift=shift)
                .values('method').annotate(total=Sum('amount'))}
    net = {method: (taken[method]['total'] if method in taken else ZERO) - refunded.get(method, ZERO)
           for method in sorted(set(taken) | set(refunded))}
    movements = shift.movements.aggregate(cash_in=Sum('amount', filter=Q(type='in')),
                                          cash_out=Sum('amount', filter=Q(type='out')))
    cash_tips = shift.tips.filter(method='cash').aggregate(t=Sum('amount'))['t'] or ZERO
    orders = Order.objects.filter(payments__shift=shift).distinct()
    expected = (shift.opening_balance + net.get('cash', ZERO) + cash_tips + (movements['cash_in'] or ZERO)
                - (movements['cash_out'] or ZERO))
    return {
        'expected_cash': m(expected),
        'grand_total': m(sum(net.values(), ZERO)),
        'by_method': [{'payment_method': method, 'total': m(total),
                       'count': taken[method]['count'] if method in taken else 0} for method, total in net.items()],
        'cash_refunds': m(refunded.get('cash')),
        'cash_in': m(movements['cash_in']),
        'cash_out': m(movements['cash_out']),
        'cash_tips': m(cash_tips),
        'tips': m(shift.tips.aggregate(t=Sum('amount'))['t']),
        'bills': orders.count(),
        'discounts': m(orders.aggregate(t=Sum('discount_amount'))['t']),
        'voids': m(ItemVoid.objects.filter(voided_by=shift.cashier, voided_at__gte=shift.opened_at,
                                           **({'voided_at__lte': shift.closed_at} if shift.closed_at else {}))
                   .aggregate(t=Sum('amount'))['t']),
        'cancelled_bills': Order.objects.filter(cancelled_by=shift.cashier, cancelled_at__gte=shift.opened_at,
                                                **({'cancelled_at__lte': shift.closed_at} if shift.closed_at else {}))
                                        .count(),
    }, expected


# ---- Invoice and credit note numbers ------------------------------------------

def fiscal_year(day, start_month):
    first = day.year if day.month >= start_month else day.year - 1
    return f'{first % 100:02d}-{(first + 1) % 100:02d}' if start_month != 1 else f'{first}'


def document_number(outlet, kind, day):
    """INV and credit-note numbers: gapless per restaurant and fiscal year, in the client's format."""
    settings_row = TenantSettings.objects.get()
    fy = fiscal_year(day, settings_row.fiscal_year_start or 4)
    seq = next_number(outlet, 'invoice' if kind == 'invoice' else 'cn', fy)
    fmt = settings_row.invoice_format or '{outlet}/{fy}/{seq:06}'
    number = fmt.format(outlet=outlet.code, fy=fy, seq=seq)
    return number if kind == 'invoice' else f'CN/{number}'


# ---- Idempotency --------------------------------------------------------------

def idempotency_key(request):
    key = request.headers.get('Idempotency-Key') or request.data.get('idempotency_key')
    return str(key)[:100] if key else None


def replay(request, endpoint):
    """The stored answer when this key was used before on this endpoint."""
    key = idempotency_key(request)
    if not key:
        return None
    done = IdempotencyRecord.objects.filter(key=key, endpoint=endpoint).first()
    return Response(done.response_body, status=done.response_code) if done else None


def remember(request, endpoint, response):
    key = idempotency_key(request)
    if key:
        try:
            with transaction.atomic():
                IdempotencyRecord.objects.create(key=key, endpoint=endpoint, response_code=response.status_code,
                                                 response_body=response.data)
        except IntegrityError:
            pass  # a parallel retry finished first; the order lock makes the second one a no-op
    return response
