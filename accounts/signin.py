"""
Sign-in with one login page for every client: the login ID finds the client.

Order of checks: captcha → login ID → password → client active → user can
sign in → not locked → emailed code (Administrators and Managers, unless the
device is trusted). A wrong login ID and a wrong password give the same
answer, so the page doesn't reveal which login IDs exist.
"""
import secrets
from datetime import timedelta

import requests
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.db import connection
from django.utils import timezone

from core import tenancy, tokens
from core.authentication import load_current_tenant
from core.exceptions import ApiError, ClientInactive
from outlets.models import TenantSettings

from .models import AuthSession, OtpChallenge, TrustedDevice, User

INVALID = 'Wrong login ID or password.'


class OtpRequired(Exception):
    def __init__(self, email_hint):
        self.email_hint = email_hint


def verify_captcha(token, ip):
    if not settings.TURNSTILE_SECRET:
        return
    try:
        result = requests.post('https://challenges.cloudflare.com/turnstile/v0/siteverify',
                               data={'secret': settings.TURNSTILE_SECRET, 'response': token or '', 'remoteip': ip},
                               timeout=5).json()
    except requests.RequestException:
        raise ApiError('Captcha check is unavailable. Try again.', code='captcha_unavailable', status_code=503)
    if not result.get('success'):
        raise ApiError('Complete the captcha and try again.', code='captcha_failed')


def _lookup(login_id):
    with connection.cursor() as cursor:
        cursor.execute('SELECT tenant_id, tenant_status, user_id FROM app.lookup_login(%s)', [login_id])
        return cursor.fetchone()


def _mask_email(email):
    name, _, domain = email.partition('@')
    return f'{name[:2]}{"*" * max(1, len(name) - 2)}@{domain}'


def _needs_otp(user):
    if user.role.key not in settings.OTP_ROLES:
        return False
    tenant_settings = TenantSettings.objects.filter(tenant_id=user.tenant_id).first()
    return tenant_settings is None or tenant_settings.require_otp_for_admins


def _trusted(user, trust_token):
    if not trust_token:
        return False
    return TrustedDevice.objects.filter(user=user, trust_hash=tokens.hash_token(trust_token),
                                        expires_at__gt=timezone.now()).exists()


def _send_code(user):
    if not user.email:
        raise ApiError('This account needs an email address for the sign-in code. Ask your Administrator to add one.',
                       code='otp_email_missing', status_code=403)
    code = f'{secrets.randbelow(10 ** 6):06d}'
    OtpChallenge.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=timezone.now())
    OtpChallenge.objects.create(user=user, code_hash=make_password(code), expires_at=timezone.now() + settings.OTP_LIFETIME)
    send_mail('Your AppDesko POS sign-in code',
              f'Your sign-in code is {code}. It expires in {int(settings.OTP_LIFETIME.total_seconds() // 60)} minutes.',
              None, [user.email])
    raise OtpRequired(_mask_email(user.email))


def _check_code(user, code):
    challenge = (OtpChallenge.objects.filter(user=user, consumed_at__isnull=True, expires_at__gt=timezone.now())
                 .order_by('-id').first())
    if challenge is None:
        raise ApiError('The sign-in code has expired. Start again to get a new one.', code='otp_expired', status_code=401)
    if challenge.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise ApiError('Too many wrong codes. Start again to get a new one.', code='otp_locked', status_code=401)
    if not check_password(str(code).strip(), challenge.code_hash):
        challenge.attempts += 1
        challenge.save(update_fields=['attempts'])
        raise ApiError('Wrong sign-in code.', code='invalid_otp', status_code=401)
    challenge.consumed_at = timezone.now()
    challenge.save(update_fields=['consumed_at'])
    trust = tokens.random_token()
    TrustedDevice.objects.create(user=user, trust_hash=tokens.hash_token(trust),
                                 expires_at=timezone.now() + settings.OTP_TRUST_LIFETIME)
    return trust


def _register_failure(user):
    user.failed_logins += 1
    if user.failed_logins >= settings.LOGIN_MAX_FAILURES:
        user.locked_until = timezone.now() + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
        user.failed_logins = 0
    user.save(update_fields=['failed_logins', 'locked_until'])


def new_session(user, request):
    """Create a signed-in session and its tokens. Refresh token = '<client id>.<random>'."""
    secret = tokens.random_token()
    session = AuthSession.objects.create(
        user=user, token_hash=tokens.hash_token(secret),
        user_agent=request.META.get('HTTP_USER_AGENT', '')[:300], ip_address=request.META.get('REMOTE_ADDR'),
        expires_at=timezone.now() + settings.REFRESH_TOKEN_LIFETIME,
    )
    return session, f'{user.tenant_id}.{secret}'


def access_token(user, session):
    return tokens.issue({'sub': user.id, 'tid': user.tenant_id, 'sid': session.id, 'role': user.role.key},
                        tokens.CLIENT_AUDIENCE, settings.ACCESS_TOKEN_LIFETIME)


def sign_in(request, login_id, password, captcha=None, otp_code=None, otp_trust=None):
    """Returns (user, session, refresh, new_trust_token). Raises ApiError or OtpRequired."""
    verify_captcha(captcha, request.META.get('REMOTE_ADDR'))
    tenancy.act_as_client(None)
    found = _lookup(login_id.strip()) if login_id else None
    if found is None:
        make_password(password)  # same time as a real check
        raise ApiError(INVALID, code='invalid_credentials', status_code=401)
    tenant_id, tenant_status, user_id = found

    tenancy.act_as_client(tenant_id)
    user = User.objects.select_related('role').get(id=user_id)
    if user.locked_until and user.locked_until > timezone.now():
        raise ApiError('Too many wrong passwords. Try again in a few minutes.', code='account_locked', status_code=403)
    if not user.check_password(password):
        _register_failure(user)
        raise ApiError(INVALID, code='invalid_credentials', status_code=401)
    if tenant_status != 'active':
        raise ClientInactive('This account is deactivated. Contact AppDesko.')
    if not user.is_active or not user.role.can_login:
        raise ApiError("This user can't sign in to the POS.", code='login_not_allowed', status_code=403)

    new_trust = None
    if _needs_otp(user) and not _trusted(user, otp_trust):
        if not otp_code:
            _send_code(user)
        new_trust = _check_code(user, otp_code)

    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = timezone.now()
    user.save(update_fields=['failed_logins', 'locked_until', 'last_login_at'])
    session, refresh = new_session(user, request)
    return user, session, refresh, new_trust


def refresh(request, refresh_token):
    """Rotate a refresh token. Returns (user, session, new_refresh)."""
    tenant_part, _, secret = (refresh_token or '').partition('.')
    if not tenant_part.isdigit() or not secret:
        raise ApiError('Your session has expired. Sign in again.', code='token_invalid', status_code=401)
    tenancy.act_as_client(int(tenant_part))
    session = (AuthSession.objects.select_related('user__role')
               .filter(token_hash=tokens.hash_token(secret), revoked_at__isnull=True, expires_at__gt=timezone.now())
               .first())
    tenant = load_current_tenant()
    if session is None:
        raise ApiError('Your session has expired. Sign in again.', code='token_invalid', status_code=401)
    if tenant is None or tenant['status'] != 'active':
        raise ClientInactive('This account is deactivated. Contact AppDesko.')
    user = session.user
    if not user.is_active or not user.role.can_login:
        raise ApiError("This user can't sign in to the POS.", code='login_not_allowed', status_code=403)
    new_secret = tokens.random_token()
    session.token_hash = tokens.hash_token(new_secret)
    session.expires_at = timezone.now() + settings.REFRESH_TOKEN_LIFETIME
    session.save(update_fields=['token_hash', 'expires_at'])
    return user, session, f'{user.tenant_id}.{new_secret}'
