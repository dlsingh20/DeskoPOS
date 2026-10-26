"""Signed access tokens. Refresh tokens are random strings stored hashed (accounts.AuthSession)."""
import hashlib
import secrets
from datetime import datetime, timezone

import jwt
from django.conf import settings

CLIENT_AUDIENCE = 'pos'
PLATFORM_AUDIENCE = 'platform'


def issue(claims: dict, audience: str, lifetime) -> str:
    now = datetime.now(timezone.utc)
    # JWT requires sub to be a string
    payload = {**claims, 'sub': str(claims['sub']), 'aud': audience, 'iat': now, 'exp': now + lifetime}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def decode(token: str, audience: str) -> dict:
    """Raises jwt.InvalidTokenError (expired, wrong audience, bad signature)."""
    claims = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'], audience=audience)
    claims['sub'] = int(claims['sub'])
    return claims


def random_token(nbytes=32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()
