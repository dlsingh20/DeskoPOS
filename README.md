# AppDesko POS service

The independent backend for the AppDesko POS: one PostgreSQL database for every client, a Python (Django + DRF) API, and the Super Admin API. The design is in `docs/DESIGN.md`; `docs/schema.sql` is the reference schema it was tested with (the Django models and migrations are the source of truth from now on).

## Status

**Phase 0 (foundation) is built:**

- Super Admin API: sign-in with an authenticator code, create a client (Client ID from 101, with its roles, Administrator, payment methods, country taxes, first outlet), activate / deactivate / close, reset the Administrator password, plans, countries, audit.
- Client isolation in the database: Row Level Security on every client table, plus a same-client foreign key beside every link between client tables. A request can only see and change its own client's rows, even if the code forgets a filter.
- Sign-in on one page for every client: the login ID (unique across all clients) finds the client. Emailed code for Administrators and Managers with 24 h device trust, lockout after repeated wrong passwords, rotating refresh tokens, sign-out, and sign-out everywhere when a client is deactivated.
- Users & roles (Administrator, Manager, Cashier, Waiter, per-user access changes, outlet access, last-Administrator protection, safe delete), manager approvals with PIN or password (single use, 5 minutes), audit log.

Next: Phase 1 (outlets, tables, products, taxes, orders, KOT, settle, payments, cash counters, history, print settings, StayDesko PMS connector). See the roadmap in `DESIGN.md`.

## Run it

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip
set DEBUG=1                                           # bash: export DEBUG=1
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py create_platform_user you@appdesko.com --name "Your Name"
.venv/Scripts/python manage.py runserver 8000
```

Without `DATABASE_URL` an embedded PostgreSQL 16 starts in `.pgdata/` (pgserver), so nothing else needs installing. `create_platform_user` prints an `otpauth://` link: add it to an authenticator app, because Super Admin sign-in needs the code.

Tests: `.venv/Scripts/python -m pytest`

## Layout

| Folder | What |
|---|---|
| `config/` | Settings, URLs |
| `core/` | Client scoping (`tenancy.py`), database guards applied after every migrate (`db_guards.py`), tokens, authentication, errors, base models |
| `console/` | Super Admin: clients, plans, platform users, reference data (currencies, countries, permissions) |
| `accounts/` | Client users, roles, sign-in, approvals, audit |
| `outlets/`, `taxes/`, `payments/` | Outlets and client settings, taxes, payment methods (grow in Phase 1) |
| `tests/` | API and database tests, including the isolation guarantees |

## Rules for new code

- Client tables inherit `core.models.TenantModel` and set `db_table = app_table('name')`. The guards (RLS, `UNIQUE (tenant_id, id)`, composite foreign keys) are added automatically on `migrate`; `tests/test_isolation.py` fails if one is missing.
- Never read `.tenant` on a client model in a client request; use `request.tenant` (the `pos_api` role can't read platform tables).
- Status and type fields are text with choices, not PostgreSQL enums.
- Money: `DecimalField(**MONEY)`; amounts go over the API as strings.
- Every write that needs a permission uses `core.permissions.require(...)`; approvable actions call `accounts.views.use_approval(...)`.
- Write audit entries with `accounts.audit.record(...)` for anything a manager would ask "who did this?" about.

## Production database roles

Migrations run as the schema owner (`pos_owner`), which must be able to switch to the two runtime roles:

```sql
CREATE ROLE pos_api NOLOGIN NOBYPASSRLS;
CREATE ROLE pos_platform NOLOGIN BYPASSRLS;
CREATE ROLE pos_owner LOGIN PASSWORD '...';
GRANT pos_api, pos_platform TO pos_owner;
CREATE DATABASE pos OWNER pos_owner;
```

(`migrate` creates and grants the two roles itself when the connecting user is allowed to; on managed PostgreSQL create them first as above.)

Each request switches with `SET LOCAL ROLE pos_api` (clients, subject to RLS) or `pos_platform` (Super Admin). Don't connect as a superuser in production: superusers skip RLS.
