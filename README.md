# DeskoPOS

Everything for DeskoPOS, the independent POS for restaurants and cafes: the service (one PostgreSQL database for every client, a Python Django + DRF API, and the Super Admin API), the POS app staff use (`app/`) and the Super Admin console (`admin-console/`). Nothing depends on StayDesko. The design is in `docs/DESIGN.md`; `docs/schema.sql` is the reference schema it was tested with (the Django models and migrations are the source of truth from now on).

## Status

**Phase 0 (foundation) is built:**

- Super Admin console (`admin-console/`) and API: sign-in with an authenticator code, create a client (Client ID from 101, with its roles, Administrator, payment methods, country taxes, first outlet), activate / deactivate / close, reset the Administrator password, plans, countries, audit.
- Client isolation in the database: Row Level Security on every client table, plus a same-client foreign key beside every link between client tables. A request can only see and change its own client's rows, even if the code forgets a filter.
- Sign-in on one page for every client: the login ID (unique across all clients) finds the client. Emailed code for Administrators and Managers with 24 h device trust, lockout after repeated wrong passwords, rotating refresh tokens, sign-out, and sign-out everywhere when a client is deactivated.
- Users & roles (Administrator, Manager, Cashier, Waiter, per-user access changes, outlet access, last-Administrator protection, safe delete), manager approvals with PIN or password (single use, 5 minutes), audit log.

**Phase 1 (parity), in progress:**

- Done: restaurants (outlets, with the plan's outlet limit), client settings for the app (name, currency, time zone), tables (status, QR code secret), tax master, menus, categories (single rate or a tax list), menu items. Same paths and fields the POS app uses (`/api/pos/api/...`). Accounts on a temporary password can only set their own until they do.
- Done: orders and KOT. Placing orders (priced from the menu, never from the app), one open order per table, table status following its orders, adding and changing items, numbered KOTs (`send_kot`, or automatically when an order is confirmed), voids and cancelling with a manager approval, kitchen statuses and stats. Order and KOT numbers restart each business day per restaurant. The bill calculation is in `orders/pricing.py`.
- Done: billing and cash counters. Bill discounts (tax recalculated on the discounted amount, the cashier limit enforced with manager approval), settling in one transaction (split payments, cash change, tip, Credit Pay, invoice number, table freed; retries with the same idempotency key replay the first answer), part payments, Credit Pay collection (`/outstanding-orders/`), refunds with credit-note numbers, and cash counter shifts on `/api/accounting/` (open, blind close, cash in/out, takings by method). Every payment and refund belongs to the cashier's open shift.
- Done: history, reports and print settings. History and Reports are worked out in the app from `/orders/`; the service adds what they need (staff names on `/staff/`, waiter ids, Credit Pay records) and enforces the History window: users without `history.full` see bills closed since the later of midnight and the last cash counter close. Top sellers on `/reports/top_items`. Print settings are shared by every device of a restaurant (`/restaurants/{id}/print-settings/`).
- Done: the app's Users & Roles screen on the service (users list their effective `permissions`; Administrators set a temporary password with `set-password/`), numbered KOTs for items added after the kitchen has the order (`send_kot/`), and refunds from History (orders carry their `refunds` with credit note numbers).
- Done: merged tables (`/orders/merge/`, `/orders/{id}/unmerge/`). Tables share one bill but keep ordering on their own; KOTs print per table with its name, and settling frees them all.
- Done: split tables (`/tables/{id}/split/`): a temporary table 4-1 next to table 4 for another party, with its own order and bill, removed once that bill closes.
- Not connected to StayDesko: Guest Visit (room charge) answers 409 and will be built later.
- Next: real email sending for sign-in codes, hosting (managed PostgreSQL, backups, HTTPS). Planned: server-side history and reports (`/orders/history/`, `/reports/{report}/`) for long periods, realtime updates.

The POS app is in `app/` (see below).

## Run it

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip
set DEBUG=1                                           # bash: export DEBUG=1
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py create_platform_user you@appdesko.com --name "Your Name"
.venv/Scripts/python manage.py runserver 8001
```

Without `DATABASE_URL` an embedded PostgreSQL 16 starts in `.pgdata/` (pgserver), so nothing else needs installing. `create_platform_user` prints an `otpauth://` link: add it to an authenticator app, because Super Admin sign-in needs the code.

Tests: `.venv/Scripts/python -m pytest`

## POS app

The screens restaurant staff use, in `app/` (React + Chakra UI). Details and build settings in `app/README.md`.

```bash
cd app
npm install
npm run dev        # http://localhost:3001, talks to the service on http://localhost:8001
npm test
```

## Super Admin console

A small React app in `admin-console/` for creating clients, activating and deactivating them, resetting the Administrator password and reading the activity log.

```bash
cd admin-console
npm install
npm run dev        # http://localhost:3100, talks to the service on http://localhost:8001
npm test
```

Set `VITE_API_BASE_URL` when the service runs elsewhere. Sign in with the email and password from `create_platform_user`. The authenticator code is off for now; set `PLATFORM_REQUIRE_TOTP=true` on the service and `VITE_REQUIRE_TOTP=true` on the console to ask for it again. Likewise `SIGNIN_EMAIL_CODE=true` turns the emailed sign-in code back on for client Administrators and Managers. Owners and admins can change clients; support staff can only look.

### Onboarding forms (IRF)

**Onboarding** in the console makes an Information Request Form for a new client and gives a secret link (`/irf/<token>/`, served by this service). The client fills it in on any device: business, contacts, outlets and tables, billing and taxes, the menu as an Excel sheet, staff, payments and printing. Answers save as they type, and **Submit** checks the required ones. A submitted form is read only for the client until it is reopened. In the console you can review the answers, fill in what the client did not share (**Edit answers**, an edit link valid for 8 hours), make a new link, and download the answers as **PDF** or **JSON**. The JSON (`deskopos.irf/1`) is what creating the restaurant from the form will read.

The questions are defined once in `console/irf_schema.py`; the page (`console/irf_page.html`), the server checks and the PDF all follow it. Files are kept in the database (up to 10 MB each, 15 per form). Set `IRF_BASE_URL` (for example `https://api.posdesko.com`) so links use the public address.

**Create restaurant** (on a submitted form) or **Import JSON** (on the Onboarding list, for an export you may have edited) creates the client from the answers (`console/irf_import.py`). A preview shows what will be made and anything that blocks it (a login ID another client uses, a table listed twice) before anything is written. The import creates the client as Pending with the usual defaults, then sets billing rules, outlets, cash counters, tables, bill print settings, taxes, payment methods, the Administrator and staff (temporary passwords, shown once; login IDs are made up for staff without one), and the menu from an .xlsx or .csv sheet (`console/menu_sheet.py` finds the Name / Category / Price columns, category heading rows and sheet names). Only the taxes on the form are created, never the country defaults, plus the service charge from the billing rules as a tax (dine-in only when the form says so). Taxes for every item go on every menu category; taxes for some items (VAT on liquor) are left for you to assign. Timed menus, the bill header text and delivery platforms are kept in the client's settings for reference and set up by hand.

## Layout

| Folder | What |
|---|---|
| `config/` | Settings, URLs |
| `core/` | Client scoping (`tenancy.py`), database guards applied after every migrate (`db_guards.py`), tokens, authentication, errors, base models |
| `console/` | Super Admin: clients, plans, platform users, reference data (currencies, countries, permissions) |
| `accounts/` | Client users, roles, sign-in, approvals, audit |
| `outlets/`, `floor/`, `catalogue/`, `taxes/`, `orders/`, `payments/` | Restaurants and client settings, tables, menus/categories/products, taxes, orders and KOTs, billing and cash counters (URLs in `config/pos_urls.py` and `config/accounting_urls.py`) |
| `app/` | POS app for restaurant staff (React + Chakra UI) |
| `admin-console/` | Super Admin web console (React + Chakra UI) |
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
