"""Client users, roles, permissions, sign-in sessions, approvals and the audit log."""
from functools import cached_property

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.db.models.functions import Lower

from core.models import TenantModel, TimestampedModel, app_table

SYSTEM_ROLES = {
    # key: (name, can_login, default permissions: '*' = all, '*-admin' = all but admin-only)
    'administrator': ('Administrator', True, '*'),
    'manager': ('Manager', True, '*-admin'),
    'cashier': ('Cashier', True, ['bill.settle', 'bill.reprint']),
    'waiter': ('Waiter', False, []),
}


class Role(TenantModel):
    key = models.SlugField(max_length=40)
    name = models.TextField()
    can_login = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('roles')
        ordering = ['id']
        constraints = [models.UniqueConstraint('tenant', 'key', name='roles_tenant_key_uniq')]

    def __str__(self):
        return self.name


class RolePermission(TenantModel):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='permissions')
    permission = models.ForeignKey('console.Permission', on_delete=models.PROTECT, related_name='+', db_column='permission_key')

    class Meta:
        db_table = app_table('role_permissions')
        constraints = [models.UniqueConstraint('role', 'permission', name='role_permissions_uniq')]


class User(TenantModel, TimestampedModel):
    """
    A person working for a client. The login ID (username) is unique across
    ALL clients: there is one login page and the login ID finds the client.
    """
    username = models.CharField(max_length=60)
    email = models.EmailField(null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True, default='')
    first_name = models.CharField(max_length=60, blank=True, default='')
    last_name = models.CharField(max_length=60, blank=True, default='')
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='users')
    language = models.CharField(max_length=10, null=True, blank=True)
    password_hash = models.TextField(null=True, blank=True)  # NULL = can't sign in (waiters)
    pin_hash = models.TextField(null=True, blank=True)       # manager approval PIN
    must_change_password = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    failed_logins = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('self', on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    is_client_user = True
    is_authenticated = True

    class Meta:
        db_table = app_table('users')
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(Lower('username'), name='users_login_id_uniq'),
            models.UniqueConstraint('tenant', Lower('email'), name='users_tenant_email_uniq', condition=models.Q(email__isnull=False)),
        ]

    def __str__(self):
        return self.username

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip() or self.username

    def set_password(self, raw):
        self.password_hash = make_password(raw) if raw else None

    def check_password(self, raw):
        return bool(self.password_hash) and check_password(raw, self.password_hash)

    def set_pin(self, raw):
        self.pin_hash = make_password(raw) if raw else None

    def check_pin(self, raw):
        return bool(self.pin_hash) and check_password(raw, self.pin_hash)

    @cached_property
    def permission_keys(self):
        """Role permissions plus this user's own additions, minus their removals."""
        keys = set(RolePermission.objects.filter(role_id=self.role_id).values_list('permission_id', flat=True))
        for override in self.permission_overrides.all():
            if override.granted:
                keys.add(override.permission_id)
            else:
                keys.discard(override.permission_id)
        return keys

    def has_perm(self, key):
        return key in self.permission_keys


class UserPermissionOverride(TenantModel):
    """Per-user change on top of the role (Edit user -> Access)."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='permission_overrides')
    permission = models.ForeignKey('console.Permission', on_delete=models.PROTECT, related_name='+', db_column='permission_key')
    granted = models.BooleanField()

    class Meta:
        db_table = app_table('user_permission_overrides')
        constraints = [models.UniqueConstraint('user', 'permission', name='user_permission_overrides_uniq')]


class UserOutlet(TenantModel):
    """Outlets a user may work in. No rows = all outlets."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='outlet_links')
    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.CASCADE, related_name='+')

    class Meta:
        db_table = app_table('user_outlets')
        constraints = [models.UniqueConstraint('user', 'outlet', name='user_outlets_uniq')]


class AuthSession(TenantModel):
    """A signed-in device. The refresh token is stored hashed and rotated on every refresh."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    token_hash = models.CharField(max_length=64, unique=True)
    user_agent = models.TextField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('auth_sessions')


class OtpChallenge(TenantModel):
    """Emailed sign-in code for Administrators and Managers."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='+')
    code_hash = models.TextField()
    attempts = models.IntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('otp_challenges')


class TrustedDevice(TenantModel):
    """Device that entered a code; no code asked again until it expires (24 h)."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='+')
    trust_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('trusted_devices')


class Approval(TenantModel):
    """A manager's approval for one restricted action: single use, valid for 5 minutes."""
    permission = models.ForeignKey('console.Permission', on_delete=models.PROTECT, related_name='+', db_column='permission_key')
    approver = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    order_id = models.BigIntegerField(null=True, blank=True)  # FK added with the orders module
    context = models.JSONField(default=dict, blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('approvals')


class AuditLog(TenantModel):
    """Who did what. Append-only: the client role can't update or delete rows."""
    actor = models.ForeignKey(User, on_delete=models.PROTECT, null=True, related_name='+')
    outlet = models.ForeignKey('outlets.Outlet', on_delete=models.PROTECT, null=True, related_name='+')
    action = models.TextField()
    entity_type = models.TextField()
    entity_id = models.BigIntegerField(null=True)
    approval = models.ForeignKey(Approval, on_delete=models.PROTECT, null=True, related_name='+')
    before_data = models.JSONField(null=True)
    after_data = models.JSONField(null=True)
    ip_address = models.GenericIPAddressField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = app_table('audit_log')
        ordering = ['-id']
        indexes = [models.Index(fields=['tenant', 'entity_type', 'entity_id'], name='audit_entity_idx')]
