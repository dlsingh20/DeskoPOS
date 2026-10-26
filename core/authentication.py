import json

import jwt
from django.db import connection
from rest_framework import authentication, exceptions

from . import tenancy, tokens
from .exceptions import ApiError, ClientInactive

# All an account on a temporary password can do until it sets its own
PASSWORD_CHANGE_PATHS = ('/api/auth/me/', '/api/auth/change-password/', '/api/auth/logout/')


def _bearer(request):
    parts = authentication.get_authorization_header(request).split()
    if len(parts) != 2 or parts[0].lower() != b'bearer':
        return None
    return parts[1].decode()


def load_current_tenant():
    """The client of the current transaction (app.current_tenant()), as a dict."""
    with connection.cursor() as cursor:
        cursor.execute('SELECT * FROM app.current_tenant()')
        row = cursor.fetchone()
        if row is None:
            return None
        columns = [c.name for c in cursor.description]
    tenant = dict(zip(columns, row))
    # Django leaves jsonb as text on raw cursors
    for key in ('plan_features', 'feature_overrides'):
        if isinstance(tenant[key], str):
            tenant[key] = json.loads(tenant[key])
    return tenant


class ClientTokenAuthentication(authentication.BaseAuthentication):
    """
    Client staff. Scopes the request transaction to the token's client, then
    checks the client is active and the session hasn't been revoked, so
    suspending a client or signing a user out takes effect immediately.
    """

    def authenticate(self, request):
        token = _bearer(request)
        if token is None:
            return None
        try:
            claims = tokens.decode(token, tokens.CLIENT_AUDIENCE)
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed('Your session has expired. Sign in again.', code='token_invalid')

        from accounts.models import AuthSession, User

        tenancy.act_as_client(claims['tid'])
        tenant = load_current_tenant()
        if tenant is None or tenant['status'] != 'active':
            raise ClientInactive('This account is deactivated. Contact AppDesko.')
        if not AuthSession.objects.filter(id=claims['sid'], revoked_at__isnull=True).exists():
            raise exceptions.AuthenticationFailed('You were signed out. Sign in again.', code='session_revoked')
        user = User.objects.select_related('role').filter(id=claims['sub'], is_active=True).first()
        if user is None:
            raise exceptions.AuthenticationFailed('This user is deactivated.', code='user_inactive')
        if user.must_change_password and request.path not in PASSWORD_CHANGE_PATHS:
            raise ApiError('Set your own password first.', code='password_change_required', status_code=403)

        request.tenant = tenant
        request.session_id = claims['sid']
        return user, claims

    def authenticate_header(self, request):
        return 'Bearer'


class PlatformTokenAuthentication(authentication.BaseAuthentication):
    """AppDesko staff using the Super Admin console."""

    def authenticate(self, request):
        token = _bearer(request)
        if token is None:
            return None
        try:
            claims = tokens.decode(token, tokens.PLATFORM_AUDIENCE)
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed('Your session has expired. Sign in again.', code='token_invalid')

        from console.models import PlatformUser

        tenancy.act_as_platform()
        user = PlatformUser.objects.filter(id=claims['sub'], is_active=True).first()
        if user is None:
            raise exceptions.AuthenticationFailed('This account is deactivated.', code='user_inactive')
        return user, claims

    def authenticate_header(self, request):
        return 'Bearer'
