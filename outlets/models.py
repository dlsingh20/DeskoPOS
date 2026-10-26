"""A client's outlets (restaurant, cafe, bar…) and client-wide settings."""
from django.db import models

from core.models import MONEY, RATE, TenantModel, TimestampedModel, app_table


class TenantSettings(TenantModel):
    """One row per client."""
    prices_include_tax = models.BooleanField(default=False)
    rounding_mode = models.CharField(max_length=8, default='nearest',
                                     choices=[(m, m) for m in ('none', 'nearest', 'up', 'down')])
    rounding_step = models.DecimalField(default=1, **MONEY)
    fiscal_year_start = models.SmallIntegerField(default=4)  # month
    invoice_format = models.TextField(default='{outlet}/{fy}/{seq:06}')
    cashier_discount_limit = models.DecimalField(default=10, **RATE)
    require_otp_for_admins = models.BooleanField(default=True)
    settings = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = app_table('tenant_settings')
        constraints = [models.UniqueConstraint('tenant', name='tenant_settings_one_per_client')]


class Outlet(TenantModel, TimestampedModel):
    TYPES = ['restaurant', 'cafe', 'bar', 'qsr', 'bakery', 'room_service', 'poolside', 'banquet', 'cloud_kitchen', 'other']

    code = models.CharField(max_length=12)
    name = models.TextField()
    type = models.CharField(max_length=20, default='restaurant', choices=[(t, t) for t in TYPES])
    description = models.TextField(blank=True, default='')
    address = models.TextField(blank=True, default='')
    city = models.TextField(blank=True, default='')
    state_code = models.TextField(blank=True, default='')
    postal_code = models.TextField(blank=True, default='')
    phone = models.TextField(blank=True, default='')
    email = models.TextField(blank=True, default='')
    tax_reg_number = models.TextField(blank=True, default='')
    licence_label = models.TextField(blank=True, default='')
    licence_number = models.TextField(blank=True, default='')
    currency_code = models.CharField(max_length=3, null=True, blank=True)  # NULL = client currency
    timezone = models.TextField(null=True, blank=True)                     # NULL = client time zone
    day_close_time = models.TimeField(default='04:00')
    opening_hours = models.JSONField(default=dict, blank=True)
    capacity = models.IntegerField(null=True, blank=True)
    settings = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = app_table('outlets')
        ordering = ['sort_order', 'id']
        constraints = [models.UniqueConstraint('tenant', 'code', name='outlets_tenant_code_uniq')]

    def __str__(self):
        return self.name


class CashCounter(TenantModel):
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='cash_counters')
    name = models.TextField()
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = app_table('cash_counters')
        ordering = ['sort_order', 'id']
        constraints = [models.UniqueConstraint('outlet', 'name', name='cash_counters_outlet_name_uniq')]


class PrintSettings(TenantModel):
    FORMATS = [(f, f) for f in ('thermal80', 'thermal58', 'sheet')]

    outlet = models.OneToOneField(Outlet, on_delete=models.CASCADE, related_name='print_settings')
    bill_format = models.CharField(max_length=10, default='thermal80', choices=FORMATS)
    kot_format = models.CharField(max_length=10, default='thermal80', choices=FORMATS)
    sheet_size = models.CharField(max_length=10, default='A4')
    kot_copies = models.SmallIntegerField(default=1)
    auto_print_bill = models.BooleanField(default=False)
    header = models.JSONField(default=dict, blank=True)
    footer = models.TextField(default='Thank you! Visit again.')
    options = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = app_table('print_settings')
