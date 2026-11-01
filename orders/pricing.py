"""
Order calculation: one function for orders, settle, refunds and previews (DESIGN.md §8).

1. Line gross = unit price x quantity.
2. The bill discount is split across discountable lines in proportion to their gross.
3. Each percentage tax = (line gross - line discount) x rate; taxes aren't charged on taxes.
4. Fixed taxes: amount x quantity (per_unit) or once per bill (per_bill); discounts don't reduce them.
5. When prices include tax, percentage taxes are taken out of the price instead of added.
6. The service charge = (line price before tax - line discount) x the order's rate, always added on top.
   Percentage taxes are charged on it too: 100 + 10% service = 110, + 7% VAT of 110 = 117.70.
   With prices including tax the price is first taken back to before tax (107 -> 100), so the
   bill is 107 + 10.00 service + 0.70 VAT on the service = 117.70 as well.
7. Each tax is rounded to the currency decimals; the total is rounded by the client's rule
   and the difference shown as round_off.
"""
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal

from core.money import round_money

ZERO = Decimal(0)
# Order types the tax channels know; room service is charged like dine-in
CHANNEL_FOR_TYPE = {'dine_in': 'dine_in', 'takeaway': 'takeaway', 'delivery': 'delivery', 'room_service': 'dine_in'}


def applicable_taxes(product, order_type):
    """The taxes a new line of this product gets, as snapshots (dicts)."""
    category = product.category
    channel = CHANNEL_FOR_TYPE.get(order_type, order_type)
    if not category.uses_tax_list:
        if category.tax_rate and category.tax_rate > 0:
            return [{'tax': None, 'name': 'Tax', 'type': 'percentage', 'rate': category.tax_rate,
                     'amount': None, 'fixed_basis': None}]
        return []
    return [{'tax': t, 'name': t.name, 'type': t.type, 'rate': t.rate, 'amount': t.amount, 'fixed_basis': t.fixed_basis}
            for t in (link.tax for link in category.tax_links.select_related('tax'))
            if t.is_active and (not t.channels or channel in t.channels)]


def _round_total(value, mode, step):
    if mode == 'none' or not step:
        return value
    rounding = {'nearest': ROUND_HALF_UP, 'up': ROUND_CEILING, 'down': ROUND_FLOOR}[mode]
    return (value / step).quantize(Decimal(1), rounding=rounding) * step


def service_charge_rate(settings_row, order_type):
    """The service charge % a new order of this type gets (dine-in only when the client says so)."""
    rate = settings_row.service_charge_rate or ZERO
    if rate and settings_row.service_charge_dine_in_only and CHANNEL_FOR_TYPE.get(order_type) != 'dine_in':
        return ZERO
    return rate


def calculate(lines, *, decimals, prices_include_tax=False, discount_amount=ZERO,
              rounding_mode='none', rounding_step=ZERO, service_charge_rate=ZERO):
    """
    lines: [{'unit_price', 'quantity', 'discountable', 'taxes': [snapshot dicts with 'key']}]
    Returns per-line results (same order) and the order totals. Pure: no database.
    """
    r = lambda v: round_money(v, decimals)  # noqa: E731
    gross = [r(Decimal(l['unit_price']) * l['quantity']) for l in lines]
    subtotal = sum(gross, ZERO)

    # Split the discount across discountable lines; the last one takes the rounding remainder
    eligible = [i for i, l in enumerate(lines) if l.get('discountable', True) and gross[i] > 0]
    eligible_total = sum((gross[i] for i in eligible), ZERO)
    discount = min(r(discount_amount), eligible_total)
    shares = [ZERO] * len(lines)
    if discount and eligible_total:
        given = ZERO
        for n, i in enumerate(eligible):
            share = discount - given if n == len(eligible) - 1 else r(discount * gross[i] / eligible_total)
            shares[i] = share
            given += share

    service_rate = Decimal(service_charge_rate or 0)
    results, seen_per_bill, tax_total, added_tax, service_total = [], set(), ZERO, ZERO, ZERO
    for i, line in enumerate(lines):
        base = gross[i] - shares[i]
        percent = [t for t in line['taxes'] if t['type'] == 'percentage']
        if prices_include_tax and percent:
            total_rate = sum((Decimal(t['rate']) for t in percent), ZERO)
            net = base * 100 / (100 + total_rate)
        else:
            net = base
        service = net * service_rate / 100 if line['quantity'] else ZERO
        service_total += service
        amounts = []
        for t in line['taxes']:
            if t['type'] == 'percentage':
                rate = Decimal(t['rate'])
                if not line['quantity']:
                    amount = ZERO
                elif prices_include_tax:
                    # The tax on the price is inside it; the tax on the service charge is added
                    on_service = r(service * rate / 100)
                    amount = r(net * rate / 100) + on_service
                    added_tax += on_service
                else:
                    amount = r((net + service) * rate / 100)
                    added_tax += amount
            elif t['fixed_basis'] == 'per_unit':
                amount = r(Decimal(t['amount']) * line['quantity'])
                added_tax += amount
            else:  # per_bill: once per order, on the first line that has it
                key = t.get('key') or t['name']
                amount = ZERO if key in seen_per_bill or not line['quantity'] else r(Decimal(t['amount']))
                if amount:
                    seen_per_bill.add(key)
                added_tax += amount
            amounts.append(amount)
            tax_total += amount
        results.append({'gross': gross[i], 'discount': shares[i], 'tax_amounts': amounts,
                        'tax_amount': sum(amounts, ZERO)})

    service_total = r(service_total)
    raw_total = subtotal - discount + service_total + added_tax
    total = r(_round_total(raw_total, rounding_mode, Decimal(rounding_step or 0)))
    return results, {'subtotal': subtotal, 'discount_amount': discount, 'service_charge': service_total,
                     'tax_amount': tax_total,
                     'round_off': total - raw_total, 'total_amount': total}
