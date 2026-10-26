"""One client can never see or touch another client's data."""
import pytest
from django.db import IntegrityError, ProgrammingError, connection, transaction

from accounts.models import AuditLog, User, UserOutlet
from core import tenancy
from outlets.models import Outlet

from .conftest import sign_in


@pytest.fixture
def two_clients(make_client, mailoutbox):
    a = make_client()
    b = make_client(name='Beans Cafe', admin_login_id='bc_admin', admin_email='a@beans.example', country='AE')
    api_a, _ = sign_in('sg_admin', 'Admin-pass-1', mailoutbox)
    return a, b, api_a


def test_api_lists_only_own_users(two_clients):
    a, b, api_a = two_clients
    logins = [u['login_id'] for u in api_a.get('/api/auth/users/').data['results']]
    assert logins == ['sg_admin']


def test_another_clients_user_is_not_found(two_clients):
    _, b, api_a = two_clients
    with tenancy.platform_scope():
        other = User.objects.get(tenant_id=b['id'])
    assert api_a.get(f'/api/auth/users/{other.id}/').status_code == 404
    assert api_a.patch(f'/api/auth/users/{other.id}/', {'first_name': 'X'}, format='json').status_code == 404


def test_database_hides_other_clients_rows(two_clients):
    a, b, _ = two_clients
    with tenancy.client_scope(a['id']):
        assert set(User.objects.values_list('tenant_id', flat=True)) == {a['id']}
        assert Outlet.objects.count() == 1


def test_nothing_is_visible_without_a_client(two_clients):
    with tenancy.client_scope(None):
        assert User.objects.count() == 0


def test_cannot_write_a_row_for_another_client(two_clients):
    a, b, _ = two_clients
    with tenancy.client_scope(a['id']):
        with pytest.raises(ProgrammingError, match='row-level security'):
            with transaction.atomic():
                Outlet.objects.create(tenant_id=b['id'], code='HACK', name='Hack')


def test_cannot_link_to_another_clients_row(two_clients):
    a, b, _ = two_clients
    with tenancy.platform_scope():
        other_outlet = Outlet.objects.get(tenant_id=b['id'])
    with tenancy.client_scope(a['id']):
        admin = User.objects.get()
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                UserOutlet.objects.create(user=admin, outlet_id=other_outlet.id)
                connection.cursor().execute('SET CONSTRAINTS ALL IMMEDIATE')


def test_every_client_table_is_guarded(db):
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'app' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)""")
        assert cursor.fetchall() == []
        # Each single-column FK between client tables has a same-client composite twin
        cursor.execute("""
            SELECT con.conname FROM pg_constraint con
            JOIN pg_class s ON s.oid = con.conrelid JOIN pg_namespace sn ON sn.oid = s.relnamespace
            JOIN pg_class d ON d.oid = con.confrelid JOIN pg_namespace dn ON dn.oid = d.relnamespace
            WHERE con.contype = 'f' AND sn.nspname = 'app' AND dn.nspname = 'app' AND array_length(con.conkey, 1) = 1
              AND NOT EXISTS (SELECT 1 FROM pg_constraint t WHERE t.conname = left(con.conname, 56) || '_tenant')""")
        assert cursor.fetchall() == []


def test_audit_log_is_append_only(two_clients):
    a, _, _ = two_clients
    with tenancy.client_scope(a['id']):
        assert AuditLog.objects.exists()
        with pytest.raises(ProgrammingError, match='permission denied'):
            with transaction.atomic():
                AuditLog.objects.all().delete()


def test_client_role_cannot_read_the_client_list(two_clients):
    a, _, _ = two_clients
    with tenancy.client_scope(a['id']):
        with pytest.raises(ProgrammingError, match='permission denied'):
            with transaction.atomic():
                connection.cursor().execute('SELECT * FROM platform.tenants')
