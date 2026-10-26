from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db import IntegrityError, transaction
from django.utils import timezone

from outlets.models import TenantSettings

from . import pricing
from .models import OPEN_STATUSES, NumberSequence, Order, OrderEvent


def business_date(outlet, tenant, now=None):
    """The day an order counts toward: before the outlet's day close (04:00), it's still yesterday."""
    tz = ZoneInfo(outlet.timezone or tenant.get('timezone') or 'UTC')
    local = (now or timezone.now()).astimezone(tz)
    close = outlet.day_close_time
    if isinstance(close, str):
        close = datetime.strptime(close, '%H:%M').time()
    return (local - timedelta(days=1)).date() if local.time() < close else local.date()


def next_number(outlet, kind, period):
    """Next value of a gapless counter; the row stays locked until the transaction ends."""
    for _ in range(3):
        row = NumberSequence.objects.select_for_update().filter(outlet=outlet, kind=kind, period=str(period)).first()
        if row is None:
            try:
                with transaction.atomic():
                    row = NumberSequence.objects.create(outlet=outlet, kind=kind, period=str(period))
            except IntegrityError:
                continue  # created by a parallel request: lock it on the next pass
            row = NumberSequence.objects.select_for_update().get(id=row.id)
        row.last_value += 1
        row.save(update_fields=['last_value'])
        return row.last_value
    raise RuntimeError('Could not take the next number')


def new_order_number(outlet, day):
    return f'{day:%y%m%d}{next_number(outlet, "order", day):03d}'


def record(order, event_type, actor=None, **data):
    OrderEvent.objects.create(order=order, type=event_type, actor=actor, data=data)


def recalculate(order, tenant):
    """Recompute every line and the order totals from the line snapshots, and save them."""
    settings_row = TenantSettings.objects.get()
    decimals = int(tenant.get('currency_decimals') or 0)
    items = list(order.items.prefetch_related('taxes'))
    lines = [{'unit_price': i.unit_price, 'quantity': i.quantity, 'discountable': i.discountable,
              'taxes': [{'key': t.tax_id or t.name, 'type': t.type, 'rate': t.rate, 'amount': t.amount,
                         'fixed_basis': t.fixed_basis, 'name': t.name} for t in i.taxes.all()]}
             for i in items]
    discount = order.discount_amount
    if order.discount_type == 'percent' and order.discount_percent is not None:
        eligible = sum((i.unit_price * i.quantity for i in items if i.discountable), pricing.ZERO)
        discount = eligible * order.discount_percent / 100
    results, totals = pricing.calculate(
        lines, decimals=decimals, prices_include_tax=settings_row.prices_include_tax, discount_amount=discount,
        rounding_mode=settings_row.rounding_mode, rounding_step=settings_row.rounding_step)

    for item, result in zip(items, results):
        item.total_price = result['gross']
        item.discount_amount = result['discount']
        item.tax_amount = result['tax_amount']
        item.save(update_fields=['total_price', 'discount_amount', 'tax_amount', 'updated_at'])
        for tax, amount in zip(item.taxes.all(), result['tax_amounts']):
            if tax.tax_amount != amount:
                tax.tax_amount = amount
                tax.save(update_fields=['tax_amount'])

    for field, value in totals.items():
        setattr(order, field, value)
    if order.amount_paid <= 0:
        order.payment_status = 'pending'
    elif order.amount_paid < order.total_amount:
        order.payment_status = 'partial'
    else:
        order.payment_status = 'paid'
    order.version += 1
    order.save()
    return order


def sync_table(table):
    """A table is occupied while it has an open order, and free once the last one closes."""
    if table is None:
        return
    has_open = Order.objects.filter(table=table, status__in=OPEN_STATUSES).exists()
    if has_open and table.status != 'occupied':
        table.status = 'occupied'
        table.save(update_fields=['status', 'updated_at'])
    elif not has_open and table.status == 'occupied':
        table.status = 'available'
        table.save(update_fields=['status', 'updated_at'])
