"""
Order calculation: one function for orders, settle, refunds and previews (DESIGN.md §8).

1. Line gross = unit price x quantity.
2. The bill discount is split across discountable lines in proportion to their gross.
3. Each percentage tax = (line gross - line discount) x rate; taxes aren't charged on taxes.
4. Fixed taxes: amount x quantity (per_unit) or once per bill (per_bill); discounts don't reduce them.
5. When prices include tax, percentage taxes are taken out of the price instead of added.
6. Each tax is rounded to the currency decimals; the total is rounded by the client's rule
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


def calculate(lines, *, decimals, prices_include_tax=False, discount_amount=ZERO,
              rounding_mode='none', rounding_step=ZERO):
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

    results, seen_per_bill, tax_total, added_tax = [], set(), ZERO, ZERO
    for i, line in enumerate(lines):
        base = gross[i] - shares[i]
        percent = [t for t in line['taxes'] if t['type'] == 'percentage']
        if prices_include_tax and percent:
            total_rate = sum((Decimal(t['rate']) for t in percent), ZERO)
            net = base * 100 / (100 + total_rate)
        else:
            net = base
        amounts = []
        for t in line['taxes']:
            if t['type'] == 'percentage':
                amount = r(net * Decimal(t['rate']) / 100) if line['quantity'] else ZERO
                if not prices_include_tax:
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

    raw_total = subtotal - discount + added_tax
    total = r(_round_total(raw_total, rounding_mode, Decimal(rounding_step or 0)))
    return results, {'subtotal': subtotal, 'discount_amount': discount, 'tax_amount': tax_total,
                     'round_off': total - raw_total, 'total_amount': total}
