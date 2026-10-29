"""
Settings for the AppDesko POS service.

Everything environment-specific comes from environment variables (see
.env.example). Without DATABASE_URL, development and tests start an embedded
PostgreSQL (pgserver) in .pgdata/, so no local install is needed.
"""
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=None):
    return os.environ.get(name, default)


def env_bool(name, default=False):
    return env(name, str(default)).lower() in ('1', 'true', 'yes', 'on')


DEBUG = env_bool('DEBUG', False)
# Super Admin authenticator (TOTP) code at sign-in. Off for now: email + password only
PLATFORM_REQUIRE_TOTP = env_bool('PLATFORM_REQUIRE_TOTP', False)
# Development only: Super Admin sign-in from this computer skips the authenticator code
PLATFORM_SKIP_TOTP_LOCAL = DEBUG and env_bool('PLATFORM_SKIP_TOTP_LOCAL', True)
SECRET_KEY = env('SECRET_KEY') or ('dev-only-insecure-key-never-use-in-production' if DEBUG or env('PYTEST_VERSION') else None)
if not SECRET_KEY:
    raise RuntimeError('SECRET_KEY is required')
ALLOWED_HOSTS = [h.strip() for h in env('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',') if h.strip()]
# On Railway, always accept its health-check probe and the service's own public domain
if env('RAILWAY_ENVIRONMENT'):
    ALLOWED_HOSTS += [h for h in ('healthcheck.railway.app', env('RAILWAY_PUBLIC_DOMAIN')) if h and h not in ALLOWED_HOSTS]

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'corsheaders',
    'rest_framework',
    'core',
    'console',
    'accounts',
    'outlets',
    'taxes',
    'payments',
    'floor',
    'catalogue',
    'orders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
    'core.middleware.DatabaseContextResetMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# ---- Database ---------------------------------------------------------------

DATABASE_URL = env('DATABASE_URL')
if not DATABASE_URL:
    from core.devdb import embedded_database_url
    DATABASE_URL = embedded_database_url(BASE_DIR / '.pgdata')

DATABASES = {'default': dj_database_url.parse(DATABASE_URL, conn_max_age=int(env('DB_CONN_MAX_AGE', '60')))}
# Every request runs in one transaction; the tenant and database role are set
# with SET LOCAL inside it (core.tenancy), so they end with the transaction.
DATABASES['default']['ATOMIC_REQUESTS'] = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---- Auth -------------------------------------------------------------------

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

JWT_SECRET = env('JWT_SECRET', SECRET_KEY)
ACCESS_TOKEN_LIFETIME = timedelta(minutes=int(env('ACCESS_TOKEN_MINUTES', '15')))
REFRESH_TOKEN_LIFETIME = timedelta(days=int(env('REFRESH_TOKEN_DAYS', '14')))
PLATFORM_TOKEN_LIFETIME = timedelta(minutes=int(env('PLATFORM_TOKEN_MINUTES', '60')))
OTP_LIFETIME = timedelta(minutes=10)
OTP_TRUST_LIFETIME = timedelta(hours=24)
OTP_MAX_ATTEMPTS = 5
LOGIN_MAX_FAILURES = int(env('LOGIN_MAX_FAILURES', '5'))
LOGIN_LOCK_MINUTES = int(env('LOGIN_LOCK_MINUTES', '15'))
APPROVAL_LIFETIME = timedelta(minutes=5)
# Emailed sign-in code for client Administrators/Managers. Off for now: ID + password only
SIGNIN_EMAIL_CODE = env_bool('SIGNIN_EMAIL_CODE', False)
# Roles that get the emailed sign-in code (when the client setting is on)
OTP_ROLES = ('administrator', 'manager')

# Cloudflare Turnstile; empty = captcha not checked (development)
TURNSTILE_SECRET = env('TURNSTILE_SECRET', '')

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['core.authentication.ClientTokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardPagination',
    'PAGE_SIZE': 50,
    'EXCEPTION_HANDLER': 'core.exceptions.exception_handler',
    'UNAUTHENTICATED_USER': None,
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'COERCE_DECIMAL_TO_STRING': True,
}

# ---- HTTP -------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = [o.strip() for o in env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:3001,http://localhost:3100').split(',') if o.strip()]
from corsheaders.defaults import default_headers  # noqa: E402
CORS_ALLOW_HEADERS = (*default_headers, 'idempotency-key', 'x-outlet-id', 'if-match')

EMAIL_BACKEND = env('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', 'AppDesko POS <no-reply@appdesko.com>')

USE_TZ = True
TIME_ZONE = 'UTC'
LANGUAGE_CODE = 'en'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': env('LOG_LEVEL', 'INFO')},
    'loggers': {'pgserver': {'level': 'WARNING'}},
}
