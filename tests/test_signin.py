"""One login page for every client: the login ID finds the client."""
from rest_framework.test import APIClient

from accounts.models import Role, User
from core import tenancy

from .conftest import code_from, sign_in


def post_token(**body):
    return APIClient().post('/api/auth/token/', body, format='json')


def add_user(tenant_id, login_id, role_key, password='User-pass-12', email=None):
    with tenancy.platform_scope(tenant_id):
        user = User(username=login_id, role=Role.objects.get(tenant_id=tenant_id, key=role_key), email=email,
                    must_change_password=False)
        user.set_password(password if user.role.can_login else None)
        user.save()
    return user


def test_wrong_login_id_and_wrong_password_look_the_same(make_client):
    make_client()
    a = post_token(username='nobody', password='Admin-pass-1')
    b = post_token(username='sg_admin', password='wrong-password')
    assert a.status_code == b.status_code == 401
    assert a.data['detail'] == b.data['detail'] == 'Wrong login ID or password.'


def test_login_id_is_case_insensitive_and_finds_the_right_client(make_client, mailoutbox):
    first = make_client()
    second = make_client(name='Beans Cafe', admin_login_id='bc_admin', admin_email='a@beans.example', country='AE')
    _, body = sign_in('BC_Admin', 'Admin-pass-1', mailoutbox)
    assert body['user']['client']['id'] == second['id'] != first['id']
    assert body['user']['client']['currency'] == 'AED'


def test_admin_gets_an_emailed_code_and_the_device_is_trusted(make_client, mailoutbox):
    make_client()
    first = post_token(username='sg_admin', password='Admin-pass-1')
    assert first.status_code == 202 and first.data['otp_required'] is True
    assert first.data['email_hint'] == 'ad***@spice.example'

    wrong = post_token(username='sg_admin', password='Admin-pass-1', otp_code='000000')
    assert wrong.status_code == 401 and wrong.data['code'] == 'invalid_otp'
    ok = post_token(username='sg_admin', password='Admin-pass-1', otp_code=code_from(mailoutbox))
    assert ok.status_code == 200 and ok.data['otp_trust']

    mails = len(mailoutbox)
    again = post_token(username='sg_admin', password='Admin-pass-1', otp_trust=ok.data['otp_trust'])
    assert again.status_code == 200
    assert len(mailoutbox) == mails  # no new code


def test_cashier_signs_in_without_a_code(client_admin):
    tenant, _, _ = client_admin
    add_user(tenant['id'], 'sg_cash1', 'cashier')
    r = post_token(username='sg_cash1', password='User-pass-12')
    assert r.status_code == 200
    assert r.data['user']['permissions'] == ['bill.reprint', 'bill.settle']


def test_waiters_cannot_sign_in(client_admin):
    tenant, _, _ = client_admin
    add_user(tenant['id'], 'sg_waiter1', 'waiter')
    assert post_token(username='sg_waiter1', password='').status_code == 401


def test_repeated_wrong_passwords_lock_the_account(client_admin):
    tenant, _, _ = client_admin
    add_user(tenant['id'], 'sg_cash2', 'cashier')
    for _ in range(5):
        assert post_token(username='sg_cash2', password='nope').status_code == 401
    locked = post_token(username='sg_cash2', password='User-pass-12')
    assert locked.status_code == 403 and locked.data['code'] == 'account_locked'


def test_refresh_rotates_and_the_old_token_stops_working(client_admin):
    _, _, tokens = client_admin
    api = APIClient()
    r = api.post('/api/auth/token/refresh/', {'refresh': tokens['refresh']}, format='json')
    assert r.status_code == 200 and r.data['refresh'] != tokens['refresh']
    assert api.post('/api/auth/token/refresh/', {'refresh': tokens['refresh']}, format='json').status_code == 401


def test_logout_ends_the_session(client_admin):
    _, api, _ = client_admin
    assert api.post('/api/auth/logout/').status_code == 204
    r = api.get('/api/auth/me/')
    assert r.status_code == 401 and r.data['code'] == 'session_revoked'


def test_temporary_password_must_be_changed_first(make_client, mailoutbox):
    make_client()
    api, _ = sign_in('sg_admin', 'Admin-pass-1', mailoutbox, first_time=False)
    assert api.get('/api/auth/me/').data['must_change_password'] is True
    blocked = api.get('/api/pos/api/restaurants/')
    assert blocked.status_code == 403 and blocked.data['code'] == 'password_change_required'
    same = api.post('/api/auth/change-password/', {'current_password': 'Admin-pass-1', 'new_password': 'Admin-pass-1'}, format='json')
    assert same.status_code == 400
    r = api.post('/api/auth/change-password/', {'current_password': 'Admin-pass-1', 'new_password': 'New-pass-456'}, format='json')
    assert r.status_code == 200
    assert api.get('/api/pos/api/restaurants/').status_code == 200
    me = api.get('/api/auth/me/').data
    assert me['must_change_password'] is False
    assert me['role']['key'] == 'administrator' and 'users.manage' in me['permissions']
    assert me['client']['features']['inventory'] is True
    assert [o['code'] for o in me['outlets']] == ['MAIN']
