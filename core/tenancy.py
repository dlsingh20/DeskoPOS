"""
Which client a database session works for, and as which database role.

Every request runs in one transaction (ATOMIC_REQUESTS). Authentication calls
act_as_client() or act_as_platform(), which issue SET LOCAL statements, so the
role and the client end with the transaction and can't leak to the next
request on the same connection.

  pos_api       client requests; Row Level Security limits every app table
                to app.tenant_id
  pos_platform  Super Admin requests; bypasses RLS to create and support clients
"""
from contextlib import contextmanager
from contextvars import ContextVar

from django.db import connection, transaction

_tenant_id = ContextVar('tenant_id', default=None)

CLIENT_ROLE = 'pos_api'
PLATFORM_ROLE = 'pos_platform'


def current_tenant_id():
    return _tenant_id.get()


def _set(role, tenant_id):
    if not connection.in_atomic_block:
        raise RuntimeError('Tenant context needs a transaction (ATOMIC_REQUESTS or transaction.atomic).')
    with connection.cursor() as cursor:
        cursor.execute(f'SET LOCAL ROLE {role}')
        cursor.execute("SELECT set_config('app.tenant_id', %s, true)", [str(tenant_id) if tenant_id else ''])
    _tenant_id.set(tenant_id)


def act_as_client(tenant_id):
    """Scope the current transaction to one client, subject to RLS."""
    _set(CLIENT_ROLE, tenant_id)


def act_as_platform(tenant_id=None):
    """Super Admin access. tenant_id is set when creating rows for a client."""
    _set(PLATFORM_ROLE, tenant_id)


def reset():
    """Back to the connection's own role (tests share one transaction across requests)."""
    _tenant_id.set(None)
    if connection.connection is not None and connection.in_atomic_block:
        with connection.cursor() as cursor:
            cursor.execute('RESET ROLE')
            cursor.execute("SELECT set_config('app.tenant_id', '', true)")


@contextmanager
def client_scope(tenant_id):
    """For background jobs and commands: a transaction scoped to one client."""
    with transaction.atomic():
        act_as_client(tenant_id)
        try:
            yield
        finally:
            reset()


@contextmanager
def platform_scope(tenant_id=None):
    with transaction.atomic():
        act_as_platform(tenant_id)
        try:
            yield
        finally:
            reset()
