"""Super Admin console: creating clients, activating and deactivating them."""
import pyotp
from django.db import connection

from accounts.models import Role, User
from console.models import PlatformUser
from core import tenancy
from outlets.models import CashCounter, Outlet, PrintSettings
from payments.models import PaymentMethod
from taxes.models import Tax

from .conftest import ADMIN_PASSWORD, platform_api_for, sign_in


def test_client_ids_start_at_101(db):
    with connection.cursor() as cursor:
        cursor.execute("SELECT seqstart FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid WHERE c.relname = 'tenants_id_seq'")
        assert cursor.fetchone()[0] == 101


def test_platform_login_needs_the_authenticator_code(owner):
    from rest_framework.test import APIClient
    r = APIClient().post('/api/platform/auth/login/', {'email': owner.email, 'password': 'owner-password-123', 'totp': '000000'},
                         format='json')
    assert r.status_code == 401
    assert r.data['code'] == 'invalid_credentials'


def test_client_api_token_is_refused_by_the_console(client_admin):
    _, api, _ = client_admin
    assert api.get('/api/platform/tenants/').status_code in (401, 403)


def test_create_client_sets_everything_up(make_client):
    tenant = make_client(activate=False)
    assert tenant['id'] >= 101
    assert tenant['status'] == 'pending'
    assert (tenant['country'], tenant['currency'], tenant['timezone']) == ('IN', 'INR', 'Asia/Kolkata')

    with tenancy.platform_scope(tenant['id']):
        roles = dict(Role.objects.filter(tenant_id=tenant['id']).values_list('key', 'can_login'))
        assert roles == {'administrator': True, 'manager': True, 'cashier': True, 'waiter': False}
        admin = User.objects.get(tenant_id=tenant['id'])
        assert admin.username == 'sg_admin' and admin.role.key == 'administrator' and admin.must_change_password
        assert sorted(Tax.objects.filter(tenant_id=tenant['id']).values_list('name', flat=True)) == ['CGST', 'SGST']
        assert list(PaymentMethod.objects.filter(tenant_id=tenant['id']).values_list('code', flat=True)) == \
            ['cash', 'card', 'upi', 'credit_pay']
        outlet = Outlet.objects.get(tenant_id=tenant['id'])
        assert outlet.code == 'MAIN'
        assert CashCounter.objects.filter(outlet=outlet).count() == 1
        assert PrintSettings.objects.get(outlet=outlet).header['taxIdLabel'] == 'GSTIN'


def test_country_decides_currency_and_taxes(make_client):
    tenant = make_client(name='Beans Cafe', admin_login_id='bc_admin', country='AE', business_type='cafe')
    assert tenant['currency'] == 'AED'
    with tenancy.platform_scope(tenant['id']):
        assert list(Tax.objects.filter(tenant_id=tenant['id']).values_list('name', 'rate')) == [('VAT', 5)]
        assert Outlet.objects.get(tenant_id=tenant['id']).type == 'cafe'


def test_login_ids_are_unique_across_clients(make_client, platform_api):
    make_client()
    r = platform_api.post('/api/platform/tenants/', {
        'name': 'Copycat', 'country': 'GB', 'outlet_name': 'Copycat', 'admin_login_id': 'SG_Admin',
        'admin_password': 'Another-pass-1', 'admin_email': 'a@copycat.example'}, format='json')
    assert r.status_code == 409
    assert r.data['code'] == 'login_id_taken'
    check = platform_api.get('/api/platform/login-id-available/', {'login_id': 'sg_ADMIN'})
    assert check.data == {'login_id': 'sg_ADMIN', 'valid': True, 'available': False}


def test_pending_client_cannot_sign_in(make_client):
    make_client(activate=False)
    from rest_framework.test import APIClient
    r = APIClient().post('/api/auth/token/', {'username': 'sg_admin', 'password': 'Admin-pass-1'}, format='json')
    assert r.status_code == 403
    assert r.data['code'] == 'client_inactive'


def test_deactivate_signs_everyone_out_and_reactivate_restores(client_admin, platform_api, mailoutbox):
    tenant, api, tokens = client_admin
    assert api.get('/api/auth/me/').status_code == 200

    no_reason = platform_api.post(f"/api/platform/tenants/{tenant['id']}/suspend/", {}, format='json')
    assert no_reason.status_code == 400
    r = platform_api.post(f"/api/platform/tenants/{tenant['id']}/suspend/", {'reason': 'Unpaid invoice'}, format='json')
    assert r.status_code == 200 and r.data['status'] == 'suspended'

    me = api.get('/api/auth/me/')
    assert me.status_code == 403 and me.data['code'] == 'client_inactive'
    from rest_framework.test import APIClient
    assert APIClient().post('/api/auth/token/refresh/', {'refresh': tokens['refresh']}, format='json').status_code in (401, 403)

    platform_api.post(f"/api/platform/tenants/{tenant['id']}/activate/", {}, format='json')
    detail = platform_api.get(f"/api/platform/tenants/{tenant['id']}/")
    assert [h['to_status'] for h in detail.data['status_history']] == ['pending', 'active', 'suspended', 'active']
    assert [a['login_id'] for a in detail.data['administrators']] == ['sg_admin']
    sign_in('sg_admin', ADMIN_PASSWORD, mailoutbox, otp_trust=tokens.get('otp_trust'))


def test_closed_client_cannot_be_reopened(make_client, platform_api):
    tenant = make_client()
    platform_api.post(f"/api/platform/tenants/{tenant['id']}/close/", {}, format='json')
    r = platform_api.post(f"/api/platform/tenants/{tenant['id']}/activate/", {}, format='json')
    assert r.status_code == 409 and r.data['code'] == 'invalid_transition'


def test_reset_admin_password(client_admin, platform_api, mailoutbox):
    tenant, _, tokens = client_admin
    r = platform_api.post(f"/api/platform/tenants/{tenant['id']}/reset-admin-password/",
                          {'login_id': 'sg_admin', 'new_password': 'Temp-pass-99'}, format='json')
    assert r.status_code == 200
    _, body = sign_in('sg_admin', 'Temp-pass-99', mailoutbox, otp_trust=tokens.get('otp_trust'), first_time=False)
    assert body['user']['must_change_password'] is True


def test_support_staff_can_read_but_not_change_clients(make_client, db):
    tenant = make_client()
    with tenancy.platform_scope():
        support = PlatformUser(email='help@appdesko.com', full_name='Help', role='support', mfa_secret=pyotp.random_base32())
        support.set_password('support-pass-123')
        support.save()
    api = platform_api_for(support, 'support-pass-123')
    assert api.get('/api/platform/tenants/').status_code == 200
    assert api.post(f"/api/platform/tenants/{tenant['id']}/suspend/", {'reason': 'x'}, format='json').status_code == 403


def test_every_console_action_is_audited(make_client, platform_api):
    tenant = make_client()
    actions = [a['action'] for a in platform_api.get('/api/platform/audit/', {'tenant': tenant['id']}).data['results']]
    assert 'tenant.create' in actions and 'tenant.active' in actions


def test_local_development_can_skip_the_authenticator_code(owner, settings):
    from rest_framework.test import APIClient
    body = {'email': owner.email, 'password': 'owner-password-123'}
    assert APIClient().post('/api/platform/auth/login/', body, format='json').status_code == 401

    settings.PLATFORM_SKIP_TOTP_LOCAL = True
    assert APIClient().post('/api/platform/auth/login/', body, format='json').status_code == 200
    # Still needed from any other computer, and the password is still checked
    remote = APIClient(REMOTE_ADDR='203.0.113.9').post('/api/platform/auth/login/', body, format='json')
    assert remote.status_code == 401
    wrong = APIClient().post('/api/platform/auth/login/', {**body, 'password': 'nope'}, format='json')
    assert wrong.status_code == 401
