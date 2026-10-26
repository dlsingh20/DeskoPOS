# AppDesko POS service: design

Design for making the POS an independent product with its own PostgreSQL database and a Python API, sold to clients worldwide. Drafted 26 Oct 2026; decisions from the product owner added the same day (section 13).

Files in this folder:

| File | What it is |
|---|---|
| `DESIGN.md` | This document |
| `schema.sql` | PostgreSQL 15+ schema: 9 platform tables, 62 client tables, row-level security, roles |
| `seed.sql` | Currencies, countries with their default taxes, the permission list, plans, and the functions that create a client and change its status |
| `test_schema.py` | Loads both files into a throwaway PostgreSQL and checks 21 guarantees (Client IDs from 101, login IDs unique across clients, isolation between clients, money rules) |

## 1. Decisions at a glance

| Topic | Decision | Why |
|---|---|---|
| Language / framework | Python 3.12, Django 5.2 + Django REST Framework | The app already speaks DRF (pagination, error shape, field names), so the frontend changes little. Mature auth, migrations, admin tooling. |
| Database | PostgreSQL 16, one database, shared tables with `tenant_id` | One schema to migrate, cross-client reporting for AppDesko, cheap per client. |
| Client isolation | `tenant_id` on every row + composite foreign keys + Row Level Security | Three independent locks: the API filters, the database refuses cross-client references, and RLS hides other clients' rows even if a query forgets the filter. |
| Client ID | `platform.tenants.id`, identity starting at **101** | The client's account number with AppDesko (invoices, support, Super Admin). |
| Sign-in | One login page for every client; **login IDs are unique across all clients** | The login ID alone tells the system which client the user belongs to. |
| Background work | Celery + Redis | E-bills by SMS/WhatsApp, report exports, aggregator sync, outbox delivery. |
| Real time | Django Channels (WebSocket), one channel per outlet | Tables, KOTs and orders update on every device without polling. |
| Files | S3-compatible object storage | Product images, logos, exports. |
| Super Admin | Separate small React app on the same API (`/api/platform/…`) | Different users, different login, MFA required. |
| Hosting | Containers (Railway today; any Docker host later) + managed PostgreSQL with point-in-time recovery | Same as the frontend. |

Alternative considered: FastAPI + SQLAlchemy. It's faster per request and supports composite keys natively, but every CRUD screen, permission and admin tool would be built by hand. Django wins on delivery time for a product with ~40 resources.

## 2. Architecture

```
 POS app (React)          Super Admin console (React)        Guest QR page / aggregators
       │ JWT (client user)          │ JWT (platform user + MFA)            │ public / webhook
       ▼                            ▼                                      ▼
 ┌──────────────────────────── POS service (Django) ─────────────────────────────┐
 │ /api/auth   /api/pos/api/…        /api/platform/…        /api/public/…         │
 │ Tenant middleware: token → client → status check → SET LOCAL app.tenant_id    │
 │ Modules: accounts · outlets · catalog · taxes · orders · kitchen · payments ·  │
 │          cash · customers · inventory · reports · printing · integrations ·    │
 │          audit · platform                                                      │
 └───────┬─────────────────────────┬──────────────────────┬──────────────────────┘
         ▼                         ▼                      ▼
   PostgreSQL 16             Redis (cache,           Celery workers
   (platform + app,          channels, broker)       (outbox, SMS, exports,
    RLS on app)                                       aggregator sync)
```

One codebase, deployed as a **modular monolith**: one Django project, one app per module, with clear boundaries (a module only touches its own tables; others go through its service functions). It's simple to run now and can be split later if one part (for example reports) needs to scale on its own.

## 3. Multi-tenancy

**Terms.** A *client* (tenant) is the business that buys AppDesko, for example "Spice Garden Pvt Ltd", Client ID 105. An *outlet* is one restaurant, cafe or bar of that client. A client has one or more outlets; products, taxes, users and customers belong to the client, and each outlet picks prices, availability, tables, counters and printers.

**How a request is scoped**

1. The access token carries `tenant_id`, `user_id` and the token version.
2. The middleware loads the client from cache (60 s). If its status isn't `active`, it refuses the request with `403 {"code": "client_suspended"}`, so suspension takes effect within a minute even for tokens that haven't expired yet.
3. Each request runs in one transaction that starts with `SET LOCAL app.tenant_id = '<id>'`. RLS policies on every `app` table compare against this value.
4. The selected outlet comes from the `X-Outlet-Id` header (replaces today's `x-hotel-context`) and is checked against the user's allowed outlets.
5. Celery tasks receive `tenant_id` explicitly and set the same variable.

**Database roles.** `pos_api` (the POS API) is subject to RLS and can't read the client list. `pos_platform` (the Super Admin API) bypasses RLS to create and support clients; every use is written to `platform.platform_audit_log`. `pos_migrator` owns the schema.

**Composite foreign keys.** Every client table has `UNIQUE (tenant_id, id)` and references use `(tenant_id, x_id)`, so an order of client 101 can't point at a table of client 102. Django has no composite foreign keys, so models keep a normal `ForeignKey(db_constraint=False)` and a migration adds the composite constraint with `RunSQL`. A test in CI checks every relation has one.

**Schema per client was rejected:** migrations would run hundreds of times, cross-client reports and plan limits get hard, and connection pooling suffers. If a large client ever needs its own database, the same schema can be deployed for them alone (the "silo" option); the code doesn't change.

## 4. Super Admin console

Users: AppDesko staff only (`platform.platform_users`), with roles `owner`, `admin`, `support`, `billing`, `read_only`. Email + password + TOTP; no client user can sign in here.

| Screen | What it does |
|---|---|
| Clients | List with Client ID, name, country, plan, status, outlets, users, last activity. Search by ID or name. |
| New client | Business name, type (restaurant, cafe, bar, QSR, bakery, cloud kitchen…), country, currency (defaults from country), time zone, plan, first outlet name, contact details, login prefix (`sg`), **Administrator login ID (`sg_admin`, checked for uniqueness as you type) and temporary password**. Creates the client as **Pending**. |
| Client details | Profile, plan and feature switches, outlets, user count, usage, status history, audit trail. |
| Activate / Deactivate | `pending → active`, `active → suspended` (with a reason), `suspended → active`, `→ closed`. Deactivating signs every user out immediately. |
| Reset Administrator password | Sets a new temporary password; the admin must change it at next sign-in. |
| Plans | Limits (outlets, users, devices) and features (inventory, QR ordering, aggregators, multi-outlet). Per-client overrides. |
| Support access | Time-boxed, read-only by default, needs a reason; shown to the client in their audit log. |
| Platform audit | Every Super Admin action. |

**What "create client" does** (`platform.provision_tenant` in `seed.sql`, called in one transaction):

1. Creates the client with the next Client ID (101, 102, …) and status `pending`.
2. Creates client settings (rounding, fiscal year, invoice format, cashier discount limit).
3. Creates the system roles Administrator, Manager, Cashier and Waiter, with today's default permissions.
4. Creates the Administrator user with the given username and password, marked "must change password".
5. Creates payment methods Cash, Card, UPI and Credit Pay. The client can rename them or add more, such as Paytm.
6. Creates the country's default taxes: India gets CGST 2.5% + SGST 2.5%, UAE gets VAT 5%. The client can edit them.
7. Creates the first outlet with one cash counter and print settings.

**Statuses**

| Status | Client can sign in | Data |
|---|---|---|
| `pending` | No | Being set up by AppDesko |
| `active` | Yes | Normal use |
| `suspended` | No ("This account is deactivated. Contact AppDesko.") | Kept; reactivating restores everything |
| `closed` | No | Export offered, kept 90 days (configurable), then purged |

## 5. Client sign-in and setup

**Sign-in:** the same URL and page for every client: login ID + password. Login IDs are unique across **all** clients, so the login ID alone identifies the client (`app.lookup_login`, the only query that runs before a client is known). Two clients can't both have `admin`, so the convention is a short client prefix, the way `nph_ad` works today: the Super Admin sets a prefix per client (`sg`), and the Users screen suggests `sg_` for new login IDs. The prefix is a suggestion, not a rule; uniqueness is what the database enforces.

The check order at sign-in: login ID exists → client is `active` → user is active and their role can sign in → not locked → password → emailed code for Administrators and Managers (unless the device is trusted). The error for a wrong login ID and a wrong password is the same ("Wrong login ID or password"), so the page doesn't reveal which login IDs exist. A suspended client gets "This account is deactivated. Contact AppDesko."

Security carried over from today: emailed sign-in code for Administrators and Managers with 24 h device trust (`otp_challenges`, `trusted_devices`), Turnstile captcha, waiters can't sign in (`roles.can_login = false`). Added: lockout after repeated failures (`users.failed_logins`, `locked_until`), refresh tokens stored hashed and revocable (`auth_sessions`).

**First sign-in of the Administrator** → change password → **setup wizard** (each step skippable, all of it editable later in the screens that already exist):

1. Business and outlet details, tax registration (GSTIN / TRN), licence number
2. Taxes: check the country defaults, rename, add (for example a fixed Packing charge on takeaway)
3. Categories and products: add by hand or import a CSV/Excel file
4. Tables and areas
5. Users: Managers, Cashiers, Waiters
6. Payment methods and print settings

## 6. What each client configures

| Setting | Where | Notes |
|---|---|---|
| Currency, decimals, locale, time zone, language | Client (outlet can override currency and time zone; user can override language) | Set by Super Admin at creation from the country; JPY has 0 decimals, KWD 3 |
| Taxes: names, codes, % or fixed, per unit or per bill, order types | `app.taxes` | Fully client-defined; "GST", "VAT", "Service Tax", "Packing" are just data |
| Taxes per category, override per product | `category_taxes`, `product_taxes` | Same as today's Product Management screen |
| Prices include tax | `tenant_settings` | Needed outside India (UK/UAE menus show tax-inclusive prices) |
| Rounding of the bill total | `tenant_settings` | None / nearest / up / down, step 1.00 or 0.05 |
| Invoice number format, fiscal year start | `tenant_settings` | `{outlet}/{fy}/{seq:06}` → `MAIN/26-27/000731` |
| Payment methods and their labels | `app.payment_methods` | Paytm, PhonePe, Amex… |
| Roles and permissions | `roles`, `role_permissions`, per-user overrides | Custom roles possible later; system roles can't be deleted |
| Service charge, cashier discount limit, QR ordering mode | `outlets.settings` / `tenant_settings` | |
| Bill and KOT layout | `app.print_settings` (+ device overrides) | Today kept per device in the browser; moves to the server |

## 7. Data model

Full definitions are in `schema.sql`. Groups:

| Group | Tables |
|---|---|
| Platform | tenants, tenant_status_history, plans, platform_users, support_sessions, platform_audit_log, currencies, countries, permissions |
| Access | tenant_settings, roles, role_permissions, users, user_permission_overrides, user_outlets, auth_sessions, otp_challenges, trusted_devices, devices, approvals, audit_log |
| Floor | outlets, floor_areas, dining_tables, cash_counters, prep_stations |
| Catalogue | categories (with subcategories), products, product_variants, outlet_products, modifier_groups, modifiers, product_modifier_groups, combo_items, menus, menu_categories |
| Tax | taxes, category_taxes, product_taxes |
| Orders | number_sequences, orders, order_items, order_item_modifiers, order_item_taxes, order_taxes, order_discounts, item_voids, kots, kot_items, order_events |
| Money | payment_methods, payments, tips, refunds, refund_lines, outstanding_accounts, outstanding_notes, shifts, cash_movements |
| Customers | customers |
| Inventory | suppliers, ingredients, stock_levels, stock_movements, recipes, recipe_ingredients |
| Settings & plumbing | print_settings, integrations, external_orders, idempotency_keys, outbox_events |

**Rules built into the model**

- **Bills never change after settling.** Each order line keeps a snapshot of the name, price, modifiers, every tax charged (`order_item_taxes`) and its share of the discount. Editing a product or tax only affects new lines.
- **Kitchen notes stay off the bill.** `order_items.special_instructions` goes on KOTs only. This is the rule fixed in the app today.
- **Gapless numbering.** Order and KOT numbers restart each business day; invoice and credit-note numbers run per fiscal year. They're taken from `number_sequences` inside the settle transaction, so a failed settle doesn't leave a gap.
- **Business date.** An order belongs to the business day it opened in. The day rolls over at the outlet's `day_close_time`, 04:00 by default, so a 1 a.m. bill counts toward the previous day.
- **Money** is `numeric(18,4)` and rounded to the currency's decimals by the API. Amounts are sent as strings, as today.
- **No hard deletes of anything that was sold.** Products, users and taxes are deactivated instead. Users with orders can't be deleted.
- **Status and type fields are text with a CHECK**, not PostgreSQL enums, so a new value is a one-line migration.
- **Optimistic locking** (`orders.version`) stops two devices from overwriting each other's changes to the same order.
- **`client_ref` (UUID) on orders** makes order creation safe to retry, and is the basis for offline mode later.
- **Audit:** `audit_log` (who, what, before/after, approval) and `order_events` (timeline). The API role can't update or delete them.

## 8. API

Keep the current paths (`/api/auth/…`, `/api/pos/api/…`) and field names wherever possible, so the existing React services switch to the new server with small changes. The 62 entries in `docs/MISSING_APIS.md` are the contract for the new endpoints: build them as specified there instead of the workarounds the app uses today.

**Conventions**

- JSON, decimal strings for money, ISO 8601 times with offset.
- List responses use DRF pagination: `{count, next, previous, results}`.
- Errors: `{code, detail, fields, approval_required, permission}`, as in `MISSING_APIS.md`.
- `Idempotency-Key` header (also accepted in the body) on settle, payments, refunds and cash movements.
- `If-Match: <version>` on order changes, answered with `409 order_changed` when another device changed the order first.
- Every write checks the user's permission on the server, or a single-use `approval_id` for approvable actions.

**Endpoints by module**

| Module | Endpoints |
|---|---|
| Auth | `POST /api/auth/token/` (client_id, username, password, captcha; may answer `202 otp_required`), `POST /api/auth/token/refresh/`, `POST /api/auth/logout/`, `GET /api/auth/me/`, `POST /api/auth/change-password/`, `POST /api/auth/password-reset/` |
| Users & roles | `/api/auth/users/` CRUD, `PUT /users/{id}/pos-access/`, `POST /users/{id}/set_active/`, `/set-password/`, `/set-pin/`; `/api/auth/roles/`; `/api/auth/audit-logs/` (read) |
| Approvals | `POST /api/pos/api/approvals/` |
| Outlets & settings | `/restaurants/` (outlets), `/restaurants/{id}/print-settings/`, `/settings/` (client), `/payment-methods/`, `/devices/` |
| Floor | `/tables/` CRUD, `/tables/by_restaurant/`, `/tables/{id}/update_status/`, `/tables/{id}/generate_qr_code/`, `/floor-areas/`, `/prep-stations/`, `/cash-counters/` |
| Catalogue | `/menu-categories/`, `/menu-items/` (products), `/menu-items/{id}/image/`, `/menu-items/{id}/history/`, `/variants/`, `/modifier-groups/`, `/combos/`, `/menus/`, `/menu-items/import/` (CSV) |
| Tax | `/taxes/`, category and product `tax_ids`, `/taxes/preview/` |
| Orders | `/orders/` (list with filters, create), `/orders/{id}/` (get, patch), `/update_status/`, `/cancel/`, `/apply_discount/`, `DELETE /discount/`, `/send_kot/`, `/move_items/`, `/orders/merge/`, `/orders/kitchen_stats/`; `/order-items/` add, patch, `/void/` |
| Payments | `POST /orders/{id}/settle/`, `POST /orders/{id}/refund/`, `/order-payments/` (read), `/outstanding-orders/` + `/add_note/` + `/resolve/` |
| Cash | `/shifts/open/`, `/shifts/current/`, `/shifts/{id}/close/`, `/shifts/{id}/movements/`, `/shifts/{id}/report/` (X/Z) |
| History & reports | `/orders/history/`, `/orders/history/summary/`, `/reports/{key}/` (sales, items, tax summary, payments, discounts, voids & cancellations, waiter tips, hourly), Excel export as a background job |
| Customers | `/customers/` (search by phone), `/customers/{id}/orders/` |
| Inventory | `/ingredients/`, `/stock-levels/` (+ adjust, count, transfer, record_waste), `/stock-movements/`, `/recipes/`, `/inventory-reports/…`, `/suppliers/` |
| QR ordering (public) | `GET /api/public/tables/{qr_secret}/menu/`, `POST /api/public/tables/{qr_secret}/orders/`, `/orders/{id}/qr/accept/` |
| Integrations | `/integrations/`, aggregator webhooks `/api/hooks/{provider}/`, `/third-party/orders/{id}/accept/` |
| Realtime | `wss://…/ws/outlets/{id}/` events: `order.updated`, `table.status`, `kot.created`, `qr.order` |
| Platform | `/api/platform/auth/…`, `/api/platform/tenants/` (list, create), `/tenants/{id}/` (get, patch), `/tenants/{id}/activate/`, `/suspend/`, `/close/`, `/reset-admin-password/`, `/support-session/`, `/api/platform/plans/`, `/api/platform/audit/` |

**Order calculation** (server-side, one function used by orders, settle, refunds and previews):

1. Line gross = (unit price + modifiers) × billable quantity.
2. The bill discount is split across the discountable lines in proportion to their gross.
3. Each percentage tax = (line gross − line discount) × rate. Taxes aren't charged on other taxes.
4. Each fixed tax is charged per unit (amount × quantity) or once per bill. Discounts don't reduce fixed taxes.
5. When prices include tax, the tax is taken out of the price instead of added on top.
6. Each tax amount is rounded to the currency decimals, then the bill total is rounded by the client's rounding rule, and the difference is shown as round-off.

This is the rule already documented in `MISSING_APIS.md` ("Apply a bill discount") with a worked example. It becomes the shared test cases for the backend and the app.

## 9. What changes in the current app

1. Login: the page stays as it is (login ID + password). Drop the hotel context and `x-hotel-context`; send `X-Outlet-Id`.
2. `ApiClient.js`: new base URL; token refresh against `/api/auth/token/refresh/`.
3. Replace the workarounds now marked "Waiting for the server": settle in steps, roles stored in the profile `department`, print settings in the browser, client-side reports and history over many requests.
4. Hotel-only features become an optional **PMS integration**: Guest Visit (charge to room) and the checked-in guests list. They show only when the client has a PMS connected. The current Room99 / StayDesko hotel is a client like any other and keeps them through a StayDesko PMS connector.
5. New small app: the Super Admin console (same React + Chakra stack).

## 10. Moving off the current backend

1. Build the new service next to the old one; nothing changes for current users.
2. Export the current hotel's POS data (restaurants, tables, menus, taxes, users, open and closed orders, payments, outstanding, inventory) and load it as a client, with old→new ID maps kept for support.
3. Run both side by side for one test outlet; compare day totals and tax reports.
4. Switch clients one at a time: a feature flag selects the API base URL per client, so switching back is just the flag.
5. Close the old POS endpoints once every client has moved.

## 11. Roadmap

| Phase | Scope |
|---|---|
| 0 · Foundation | Platform tables, Super Admin console (create, activate, deactivate, reset admin), tenancy middleware + RLS, auth with Client ID, OTP, roles & permissions, audit, CI with tenant-isolation tests |
| 1 · Parity | Outlets, tables, QR codes, catalogue, taxes, orders, KOT, discounts, voids, settle, payments, tips, Credit Pay, cash counters & shifts, history, print settings, approvals, guest name/phone on bills, StayDesko PMS connector (room charge, checked-in guests) so the hotel client can move |
| 2 · Close the gaps | Refunds and credit notes, server-side reports and Excel export, merge/move tables, inventory and recipes with stock deduction on sale, customers, realtime updates, setup wizard and CSV import |
| 3 · Growth | QR ordering end to end, Swiggy/Zomato, other PMS connectors, e-bill by SMS/WhatsApp, app translations, variants/modifiers/combos in the app, plans and billing for AppDesko |
| 4 · Later | Offline mode, kitchen display, loyalty, reservations, accounting exports (Tally, Zoho, QuickBooks), e-invoicing |

## 12. Suggestions: missing or useful

**Needed before selling to many clients**

- **Subscription plans and limits** (in the schema): stop a Starter client from adding a fourth outlet. Add billing (Razorpay / Stripe subscriptions) and automatic suspension after a grace period.
- **Server-side enforcement of every permission and limit.** Today most checks run in the browser, so anyone with a token can call the API directly.
- **Credit notes for refunds** with their own number series (needed for GST), and a lock on a closed business day so settled days can't be edited.
- **Backups with point-in-time recovery**, plus a per-client data export (clients will ask: "give me all my data").
- **Data protection:** consent for marketing on customer phone numbers (India's DPDP Act, GDPR for UK/EU clients), phone numbers masked in lists, retention rules for closed clients.
- **Monitoring:** error tracking (Sentry), uptime checks, slow-query logs, and per-client usage so AppDesko sees inactive or struggling clients early.

**Useful for the product**

- **E-bill by SMS / WhatsApp** using the guest phone captured at settle. It saves paper and builds a customer list.
- **Customer profiles and loyalty:** visit count and spend are already in the schema.
- **B2B bills:** customer GSTIN and name on the invoice (field already on orders and customers). Later, GST e-invoicing and the UAE FTA format.
- **Kitchen display screens** per prep station, using KOT status in the schema.
- **Offline mode:** keep taking orders when the internet drops and sync later. Orders already carry a device-generated `client_ref`.
- **Central menu for chains:** one catalogue with per-outlet price and availability (`outlet_products`), already in the schema.
- **Happy-hour / time-based prices**, combos and modifiers (partly in the schema; scheduled prices are listed in `MISSING_APIS.md`).
- **Day-end report emailed to the owner:** sales, taxes, payment split, voids, discounts, cash variance.
- **Accounting export** (Tally, Zoho Books, QuickBooks) from the outbox events.
- **Reservations and waitlist** for dine-in clients.

## 13. Decisions

| # | Question | Decision (26 Oct 2026) |
|---|---|---|
| 1 | Login style | One URL and page for every client. The login ID identifies the client, so login IDs are unique across all clients. |
| 2 | Current Room99 / StayDesko hotel | Becomes a client. Its room charge and checked-in guests move to the StayDesko PMS connector in Phase 1. |
| 3 | Countries | Global from the start (section 14). |
| 4 | Hosting region and data residency | Later. The design allows a separate database per region without code changes. |
| 5 | Who builds the backend | The POS team builds everything: the service, the Super Admin console and the app changes. |

## 14. Going global

Built into the schema and seed now:

- **31 countries** with currency, locale, time zone, the local name of the tax registration (GSTIN, TRN, VAT No, ABN…) and a starting set of restaurant taxes, plus 26 currencies with their decimals (0 for JPY and IDR, 3 for KWD, BHD and OMR). Adding a country is one row.
- **Taxes are the client's own data:** any name and code, percentage or fixed, per unit or per bill, per order type, per outlet (US sales tax differs by city), and **compound taxes** with a calculation order for the few places that charge tax on tax.
- **Prices including tax** (UK, EU, Australia, UAE) or excluding it (India, US) per client.
- **Time zone per outlet** and a business day that rolls over at the outlet's closing time.
- **Language per client and per user** (`tenants.language`, `users.language`).

Still to do for a global launch:

- **Translate the app** (English first; Arabic needs right-to-left layout) and keep all text in translation files from now on.
- **Number, date and address formats** from the locale. The app's regional formatting (`utils/regionalFormat.js`) already does numbers and dates.
- **Country rules for bills:** fiscal receipts and e-invoicing differ by country (India GST e-invoice for B2B, Saudi ZATCA QR on every bill, EU tax-inclusive receipts). Add them country by country as clients sign up, starting with Saudi ZATCA, which is mandatory for every bill there.
- **Payment providers per region:** Razorpay (India), Stripe (global) and local wallets as integrations.
- **Tax-rate review:** the seeded rates are a starting point for a typical restaurant, not tax advice. The setup wizard asks the client to confirm them.
