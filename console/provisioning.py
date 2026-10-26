"""Creating a client and changing its status (Super Admin console)."""
from django.db import connection, transaction
from django.utils import timezone

from accounts.models import SYSTEM_ROLES, AuthSession, Role, RolePermission, User
from core import tenancy
from core.exceptions import ApiError, Conflict
from outlets.models import TenantSettings
from outlets.services import create_outlet
from payments.models import PaymentMethod
from taxes.models import Tax

from .models import Country, Permission, PlatformAuditLog, Plan, Tenant, TenantStatusHistory

DEFAULT_PAYMENT_METHODS = [
    # code, label, kind, needs_reference, opens_drawer
    ('cash', 'Cash', 'cash', False, True),
    ('card', 'Card', 'card', True, False),
    ('upi', 'UPI', 'wallet', True, False),
    ('credit_pay', 'Credit Pay', 'pay_later', False, False),
]

OUTLET_TYPE_FOR_BUSINESS = {'cafe': 'cafe', 'bar': 'bar', 'qsr': 'qsr', 'bakery': 'bakery', 'cloud_kitchen': 'cloud_kitchen'}

ALLOWED_TRANSITIONS = {
    'pending': {'active', 'closed'},
    'active': {'suspended', 'closed'},
    'suspended': {'active', 'closed'},
    'closed': set(),
}


def login_id_taken(login_id):
    with connection.cursor() as cursor:
        cursor.execute('SELECT app.login_id_taken(%s)', [login_id])
        return cursor.fetchone()[0]


def _audit(platform_user, tenant, action, details, ip=None):
    PlatformAuditLog.objects.create(platform_user=platform_user, tenant=tenant, action=action, details=details, ip_address=ip)


@transaction.atomic
def provision_tenant(*, name, business_type, country_code, outlet_name, admin_login_id, admin_password,
                     created_by, admin_email=None, plan_code=None, currency_code=None, timezone_name=None,
                     language='en', login_prefix=None, contact=None, ip=None):
    """
    Creates a client in status `pending` with everything it needs to start:
    settings, the four system roles and their permissions, the Administrator
    (must change the password at first sign-in), payment methods, the
    country's taxes, and a first outlet with a cash counter and print settings.
    """
    country = Country.objects.filter(code=country_code).first()
    if country is None:
        raise ApiError(f'Unknown country {country_code}.', code='unknown_country')
    if login_id_taken(admin_login_id):
        raise Conflict(f'The login ID "{admin_login_id}" is already used. Login IDs are unique across all clients.',
                       code='login_id_taken')
    plan = Plan.objects.filter(code=plan_code).first() if plan_code else None

    tenant = Tenant.objects.create(
        name=name, business_type=business_type, country=country,
        currency_id=currency_code or country.default_currency_id,
        locale=country.default_locale, timezone=timezone_name or country.default_timezone,
        language=language, plan=plan, login_prefix=login_prefix or None, created_by=created_by,
        **(contact or {}),
    )

    # Rows below belong to the new client
    tenancy.act_as_platform(tenant.id)

    TenantSettings.objects.create()
    all_permissions = list(Permission.objects.all())
    admin_role = None
    for key, (role_name, can_login, defaults) in SYSTEM_ROLES.items():
        role = Role.objects.create(key=key, name=role_name, can_login=can_login, is_system=True)
        if defaults == '*':
            keys = [p.key for p in all_permissions]
        elif defaults == '*-admin':
            keys = [p.key for p in all_permissions if not p.admin_only]
        else:
            keys = defaults
        RolePermission.objects.bulk_create(
            [RolePermission(tenant_id=tenant.id, role=role, permission_id=k) for k in keys])
        if key == 'administrator':
            admin_role = role

    admin = User(username=admin_login_id, email=admin_email or None, first_name='Administrator',
                 role=admin_role, must_change_password=True)
    admin.set_password(admin_password)
    admin.save()

    PaymentMethod.objects.bulk_create([
        PaymentMethod(tenant_id=tenant.id, code=code, label=label, kind=kind, needs_reference=ref,
                      opens_drawer=drawer, sort_order=(i + 1) * 10)
        for i, (code, label, kind, ref, drawer) in enumerate(DEFAULT_PAYMENT_METHODS)
    ])

    for i, t in enumerate(country.tax_template):
        Tax.objects.create(
            name=t['name'], code=t.get('code', ''), type=t['type'], sequence=i,
            rate=t.get('rate') if t['type'] == 'percentage' else None,
            amount=t.get('amount') if t['type'] == 'fixed' else None,
            fixed_basis=t.get('fixed_basis') if t['type'] == 'fixed' else None,
            reporting_code=t.get('reporting_code', ''),
        )

    create_outlet(code='MAIN', name=outlet_name, type=OUTLET_TYPE_FOR_BUSINESS.get(business_type, 'restaurant'),
                  tax_id_label=country.tax_id_label)

    TenantStatusHistory.objects.create(tenant=tenant, from_status=None, to_status='pending',
                                       reason='Created', changed_by=created_by)
    _audit(created_by, tenant, 'tenant.create',
           {'admin_login_id': admin_login_id, 'plan': plan_code, 'country': country_code}, ip)
    tenancy.act_as_platform()
    return tenant


@transaction.atomic
def set_tenant_status(tenant, new_status, *, reason='', changed_by, ip=None):
    """Activate, suspend or close a client. Suspend and close sign everyone out."""
    tenant = Tenant.objects.select_for_update().get(pk=tenant.pk)
    old = tenant.status
    if new_status == old:
        return tenant
    if new_status not in ALLOWED_TRANSITIONS.get(old, set()):
        raise Conflict(f"A {old} client can't be changed to {new_status}.", code='invalid_transition')
    if new_status == 'suspended' and not reason:
        raise ApiError('Give a reason for deactivating the client.', code='reason_required')

    now = timezone.now()
    tenant.status = new_status
    if new_status == 'active':
        tenant.activated_at = tenant.activated_at or now
        tenant.suspended_at = None
        tenant.suspended_reason = ''
    elif new_status == 'suspended':
        tenant.suspended_at = now
        tenant.suspended_reason = reason
    elif new_status == 'closed':
        tenant.closed_at = now
    tenant.save()

    if new_status in ('suspended', 'closed'):
        AuthSession.objects.filter(tenant_id=tenant.id, revoked_at__isnull=True).update(revoked_at=now)

    TenantStatusHistory.objects.create(tenant=tenant, from_status=old, to_status=new_status,
                                       reason=reason, changed_by=changed_by)
    _audit(changed_by, tenant, f'tenant.{new_status}', {'from': old, 'reason': reason}, ip)
    return tenant


@transaction.atomic
def reset_admin_password(tenant, *, login_id, new_password, changed_by, ip=None):
    """Set a temporary password for one of the client's Administrators."""
    tenancy.act_as_platform(tenant.id)
    user = User.objects.filter(tenant_id=tenant.id, username__iexact=login_id, role__key='administrator').first()
    if user is None:
        raise ApiError(f'No Administrator "{login_id}" in client {tenant.id}.', code='not_found', status_code=404)
    user.set_password(new_password)
    user.must_change_password = True
    user.failed_logins = 0
    user.locked_until = None
    user.save()
    AuthSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())
    tenancy.act_as_platform()
    _audit(changed_by, tenant, 'admin.reset_password', {'login_id': user.username}, ip)
    return user
