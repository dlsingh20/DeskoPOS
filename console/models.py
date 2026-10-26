"""Super Admin (platform) data: clients, plans, AppDesko staff, reference data."""
from django.contrib.auth.hashers import check_password, make_password
from django.db import models

from core.models import platform_table


class Currency(models.Model):
    code = models.CharField(max_length=3, primary_key=True)  # ISO 4217
    name = models.TextField()
    symbol = models.TextField()
    decimals = models.SmallIntegerField(default=2)

    class Meta:
        db_table = platform_table('currencies')
        ordering = ['code']


class Country(models.Model):
    code = models.CharField(max_length=2, primary_key=True)  # ISO 3166-1 alpha-2
    name = models.TextField()
    default_currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name='+')
    default_locale = models.TextField()
    default_timezone = models.TextField()
    tax_id_label = models.TextField(blank=True, default='')
    # Taxes created for a new client in this country (editable by the client)
    tax_template = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = platform_table('countries')
        ordering = ['name']


class Permission(models.Model):
    """POS permission catalogue, the same for every client."""
    key = models.CharField(max_length=64, primary_key=True)
    group_name = models.TextField()
    label = models.TextField()
    approvable = models.BooleanField(default=False)
    admin_only = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = platform_table('permissions')
        ordering = ['sort_order']


class Plan(models.Model):
    code = models.SlugField(unique=True)
    name = models.TextField()
    max_outlets = models.IntegerField(null=True, blank=True)  # NULL = unlimited
    max_users = models.IntegerField(null=True, blank=True)
    max_devices = models.IntegerField(null=True, blank=True)
    features = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = platform_table('plans')
        ordering = ['id']


class Tenant(models.Model):
    """A client of AppDesko. id is the Client ID; the first client is 101."""

    class Status(models.TextChoices):
        PENDING = 'pending'
        ACTIVE = 'active'
        SUSPENDED = 'suspended'
        CLOSED = 'closed'

    BUSINESS_TYPES = ['restaurant', 'cafe', 'bar', 'qsr', 'bakery', 'food_court', 'cloud_kitchen', 'hotel_fnb', 'other']

    name = models.TextField()
    business_type = models.CharField(max_length=20, default='restaurant',
                                     choices=[(t, t) for t in BUSINESS_TYPES])
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='+')
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name='+')
    locale = models.TextField()
    timezone = models.TextField()
    language = models.TextField(default='en')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, null=True, blank=True, related_name='tenants')
    feature_overrides = models.JSONField(default=dict, blank=True)
    login_prefix = models.CharField(max_length=12, unique=True, null=True, blank=True)
    contact_name = models.TextField(blank=True, default='')
    contact_email = models.EmailField(blank=True, default='')
    contact_phone = models.TextField(blank=True, default='')
    billing_address = models.TextField(blank=True, default='')
    tax_reg_number = models.TextField(blank=True, default='')
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspended_reason = models.TextField(blank=True, default='')
    closed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('PlatformUser', on_delete=models.PROTECT, null=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = platform_table('tenants')
        ordering = ['id']
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=['pending', 'active', 'suspended', 'closed']),
                                   name='tenants_status_valid'),
        ]

    def __str__(self):
        return f'{self.id} {self.name}'


class TenantStatusHistory(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='status_history')
    from_status = models.CharField(max_length=12, null=True)
    to_status = models.CharField(max_length=12)
    reason = models.TextField(blank=True, default='')
    changed_by = models.ForeignKey('PlatformUser', on_delete=models.PROTECT, null=True, related_name='+')
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = platform_table('tenant_status_history')
        ordering = ['id']


class PlatformUser(models.Model):
    """AppDesko staff. Email + password + TOTP; separate from client users."""

    ROLES = ['owner', 'admin', 'support', 'billing', 'read_only']

    email = models.EmailField()
    full_name = models.TextField()
    password_hash = models.TextField()
    mfa_secret = models.TextField()
    role = models.CharField(max_length=12, default='support', choices=[(r, r) for r in ROLES])
    is_active = models.BooleanField(default=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    is_platform_user = True
    is_authenticated = True

    class Meta:
        db_table = platform_table('platform_users')
        constraints = [models.UniqueConstraint(models.functions.Lower('email'), name='platform_users_email_uniq')]

    def set_password(self, raw):
        self.password_hash = make_password(raw)

    def check_password(self, raw):
        return check_password(raw, self.password_hash)


class SupportSession(models.Model):
    """Time-boxed access to a client's data by AppDesko support, always with a reason."""
    platform_user = models.ForeignKey(PlatformUser, on_delete=models.PROTECT, related_name='+')
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name='+')
    reason = models.TextField()
    read_only = models.BooleanField(default=True)
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = platform_table('support_sessions')


class PlatformAuditLog(models.Model):
    platform_user = models.ForeignKey(PlatformUser, on_delete=models.PROTECT, null=True, related_name='+')
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, null=True, related_name='+')
    action = models.TextField()
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = platform_table('platform_audit_log')
        ordering = ['-id']
