import re

import pyotp
import pytest
from rest_framework.test import APIClient

from console.models import PlatformUser
from core import tenancy

OWNER_PASSWORD = 'owner-password-123'


@pytest.fixture
def owner(db):
    with tenancy.platform_scope():
        user = PlatformUser(email='owner@appdesko.com', full_name='Owner', role='owner', mfa_secret=pyotp.random_base32())
        user.set_password(OWNER_PASSWORD)
        user.save()
    return user


def platform_api_for(user, password=OWNER_PASSWORD):
    api = APIClient()
    r = api.post('/api/platform/auth/login/', {'email': user.email, 'password': password,
                                               'totp': pyotp.TOTP(user.mfa_secret).now()}, format='json')
    assert r.status_code == 200, r.data
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    return api


@pytest.fixture
def platform_api(owner):
    return platform_api_for(owner)


@pytest.fixture
def make_client(platform_api):
    """Create (and by default activate) a client through the Super Admin API."""

    def make(name='Spice Garden', admin_login_id='sg_admin', admin_password='Admin-pass-1',
             admin_email='admin@spice.example', country='IN', activate=True, **extra):
        r = platform_api.post('/api/platform/tenants/', {
            'name': name, 'country': country, 'outlet_name': f'{name} Main',
            'admin_login_id': admin_login_id, 'admin_password': admin_password, 'admin_email': admin_email,
            'plan': 'growth', **extra}, format='json')
        assert r.status_code == 201, r.data
        if activate:
            r2 = platform_api.post(f"/api/platform/tenants/{r.data['id']}/activate/", {}, format='json')
            assert r2.status_code == 200, r2.data
            return r2.data
        return r.data

    return make


def code_from(mailoutbox):
    return re.search(r'\b(\d{6})\b', mailoutbox[-1].body).group(1)


def sign_in(login_id, password, mailoutbox=None, otp_trust=None):
    """Full sign-in (with the emailed code when asked). Returns (api client, token response)."""
    api = APIClient()
    body = {'username': login_id, 'password': password}
    if otp_trust:
        body['otp_trust'] = otp_trust
    r = api.post('/api/auth/token/', body, format='json')
    if r.status_code == 202:
        assert mailoutbox is not None, 'sign-in code requested'
        r = api.post('/api/auth/token/', {**body, 'otp_code': code_from(mailoutbox)}, format='json')
    assert r.status_code == 200, r.data
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    return api, r.data


@pytest.fixture
def client_admin(make_client, mailoutbox):
    """An active client and its Administrator, signed in."""
    tenant = make_client()
    api, tokens = sign_in('sg_admin', 'Admin-pass-1', mailoutbox)
    return tenant, api, tokens
