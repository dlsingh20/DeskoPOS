"""Money over the API: strings rounded to the client currency's decimals (2 for INR, 3 for KWD, 0 for JPY)."""
from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers


def currency_decimals(request):
    tenant = getattr(request, 'tenant', None) or {}
    value = tenant.get('currency_decimals')
    return 2 if value is None else int(value)


def round_money(value, decimals):
    return Decimal(value).quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)


def money_str(value, decimals):
    return None if value is None else f'{round_money(value, decimals):.{decimals}f}'


def format_money(value, tenant):
    """₹120.00 / AED 15.50: for labels only; amounts travel as plain strings."""
    if value is None:
        return None
    decimals = int(tenant.get('currency_decimals') or 0) if tenant else 2
    symbol = (tenant or {}).get('currency_symbol') or (tenant or {}).get('currency_code') or ''
    return f'{symbol}{round_money(value, decimals):,.{decimals}f}'


class MoneyField(serializers.DecimalField):
    """Decimal in, currency-rounded string out. Rejects more decimals than the currency has."""

    def __init__(self, **kwargs):
        kwargs.setdefault('max_digits', 14)
        kwargs.setdefault('decimal_places', 4)
        kwargs.setdefault('min_value', Decimal(0))
        super().__init__(**kwargs)

    def _decimals(self):
        return currency_decimals(self.context.get('request'))

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        decimals = self._decimals()
        if value != round_money(value, decimals):
            raise serializers.ValidationError(
                f'Use at most {decimals} decimal places.' if decimals else 'Use a whole number.')
        return value

    def to_representation(self, value):
        return money_str(value, self._decimals())
