"""Users & roles, per-user access and manager approvals."""
from types import SimpleNamespace

import pytest

from accounts.models import User
from accounts.views import use_approval
from core import tenancy
from core.exceptions import PermissionRequired

from .conftest import own_password, sign_in


def create_user(api, **body):
    return api.post('/api/auth/users/', body, format='json')


def test_admin_creates_staff(client_admin):
    _, api, _ = client_admin
    r = create_user(api, login_id='sg_mgr1', first_name='Meera', role='manager', email='meera@spice.example',
                    password='Manager-pass-1')
    assert r.status_code == 201, r.data
    assert r.data['role'] == 'manager' and r.data['must_change_password'] is True

    waiter = create_user(api, login_id='sg_ravi', first_name='Ravi', role='waiter')
    assert waiter.status_code == 201 and waiter.data['can_login'] is False


def test_managers_need_an_email_for_the_sign_in_code(client_admin):
    _, api, _ = client_admin
    r = create_user(api, login_id='sg_mgr2', role='manager', password='Manager-pass-1')
    assert r.status_code == 400 and 'email' in r.data['fields']


def test_login_id_must_be_free_in_every_client(client_admin, make_client):
    make_client(name='Beans Cafe', admin_login_id='bc_admin', admin_email='a@beans.example', country='AE')
    _, api, _ = client_admin
    r = create_user(api, login_id='BC_ADMIN', role='cashier', password='Cashier-pass-1')
    assert r.status_code == 400 and 'login_id' in r.data['fields']
    assert api.get('/api/auth/users/login-id-available/', {'login_id': 'bc_admin'}).data['available'] is False


def test_cashier_cannot_manage_users(client_admin):
    _, api, _ = client_admin
    create_user(api, login_id='sg_cash', role='cashier', password='Cashier-pass-1')
    cashier, _ = sign_in('sg_cash', 'Cashier-pass-1')
    r = cashier.get('/api/auth/users/')
    assert r.status_code == 403 and r.data['permission'] == 'users.manage'


def test_per_user_access_changes(client_admin):
    _, api, _ = client_admin
    r = create_user(api, login_id='sg_cash', role='cashier', password='Cashier-pass-1',
                    permission_overrides={'reports.view': True, 'bill.reprint': False})
    assert r.status_code == 201, r.data
    _, body = sign_in('sg_cash', 'Cashier-pass-1')
    assert body['user']['permissions'] == ['bill.settle', 'reports.view']

    bad = create_user(api, login_id='sg_cash2', role='cashier', password='Cashier-pass-1',
                      permission_overrides={'users.manage': True})
    assert bad.status_code == 400


def test_last_administrator_is_protected(client_admin):
    _, api, body = client_admin
    me = body['user']['id']
    r = api.post(f'/api/auth/users/{me}/set_active/', {'is_active': False}, format='json')
    assert r.status_code == 409
    r = api.patch(f'/api/auth/users/{me}/', {'role': 'manager'}, format='json')
    assert r.status_code == 409 and r.data['code'] == 'last_administrator'


def test_deactivating_a_user_signs_them_out(client_admin):
    _, api, _ = client_admin
    uid = create_user(api, login_id='sg_cash', role='cashier', password='Cashier-pass-1').data['id']
    cashier, _ = sign_in('sg_cash', 'Cashier-pass-1')
    api.post(f'/api/auth/users/{uid}/set_active/', {'is_active': False}, format='json')
    assert cashier.get('/api/auth/me/').status_code == 401


def test_only_users_who_never_signed_in_can_be_deleted(client_admin):
    _, api, _ = client_admin
    fresh = create_user(api, login_id='sg_new', role='cashier', password='Cashier-pass-1').data['id']
    used = create_user(api, login_id='sg_used', role='cashier', password='Cashier-pass-1').data['id']
    sign_in('sg_used', 'Cashier-pass-1')
    assert api.delete(f'/api/auth/users/{fresh}/').status_code == 204
    r = api.delete(f'/api/auth/users/{used}/')
    assert r.status_code == 409 and r.data['code'] == 'user_has_history'


@pytest.fixture
def cashier_and_manager(client_admin):
    tenant, api, _ = client_admin
    create_user(api, login_id='sg_cash', role='cashier', password='Cashier-pass-1')
    mgr = create_user(api, login_id='sg_mgr', role='manager', email='m@spice.example', password='Manager-pass-1').data
    api.post(f"/api/auth/users/{mgr['id']}/set-pin/", {'pin': '4821'}, format='json')
    cashier, _ = sign_in('sg_cash', 'Cashier-pass-1')
    return tenant, cashier


def test_manager_approves_with_pin(cashier_and_manager):
    _, cashier = cashier_and_manager
    r = cashier.post('/api/pos/api/approvals/', {'permission': 'discount.unlimited', 'approver_username': 'sg_mgr',
                                                 'approver_secret': '4821', 'secret_type': 'pin',
                                                 'context': {'discount_value': '25'}}, format='json')
    assert r.status_code == 201, r.data
    assert r.data['approver']['name'] == 'sg_mgr' and r.data['self'] is False

    wrong = cashier.post('/api/pos/api/approvals/', {'permission': 'discount.unlimited', 'approver_username': 'sg_mgr',
                                                     'approver_secret': '0000', 'secret_type': 'pin'}, format='json')
    assert wrong.status_code == 401


def test_cashier_cannot_approve(cashier_and_manager):
    _, cashier = cashier_and_manager
    r = cashier.post('/api/pos/api/approvals/', {'permission': 'payment.credit', 'approver_username': 'sg_cash',
                                                 'approver_secret': own_password('Cashier-pass-1')}, format='json')
    assert r.status_code == 403 and r.data['code'] == 'cannot_approve'


def test_an_approval_works_once(cashier_and_manager):
    tenant, cashier = cashier_and_manager
    approval_id = cashier.post('/api/pos/api/approvals/', {
        'permission': 'payment.credit', 'approver_username': 'sg_mgr', 'approver_secret': 'Manager-pass-1'},
        format='json').data['approval_id']
    with tenancy.client_scope(tenant['id']):
        request = SimpleNamespace(user=User.objects.select_related('role').get(username='sg_cash'))
        assert use_approval(request, approval_id, 'payment.credit').id == approval_id
        with pytest.raises(PermissionRequired) as err:
            use_approval(request, approval_id, 'payment.credit')
        assert err.value.extra['approval_required'] is True
