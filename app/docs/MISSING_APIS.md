# POS missing APIs

Backend requirements for the POS frontend, 12 Oct 2026. These are the endpoints the app needs for the features built so far: Fine Dine, payments, discounts, History, printing, users and roles, and reports. Each entry has the request and response JSON the app expects. Today the app works around these gaps in the browser.

Base URL `https://api.staydesko.com`. Amounts are decimal strings with 2 places. Times are ISO 8601 with offset. Auth is the existing JWT plus `X-Hotel-Context`.

Priorities:

- **P1 · needed for security or correct money handling**
- **P2 · unlocks features already built in the app**
- **P3 · later / improvement**

**Shared error shape**

```json
{
  "code": "permission_denied",
  "detail": "Discounts above 10% need a manager approval.",
  "fields": {},
  "approval_required": true,
  "permission": "discount.unlimited"
}
```

Status checked against the live API on 19 Oct 2026 (cash counters on 20 Oct): **7 live**, 6 partly live, 6 behaviour to confirm, 43 not in the API yet. The app now uses every live endpoint and falls back to its old method on servers without it.

**Please confirm:** the Swagger file documents the new endpoints' request bodies with the generic Order / User / OrderItem shapes. The app sends the bodies shown here.

## Summary

| # | Status | Priority | Type | Method | Endpoint | Purpose |
|---|---|---|---|---|---|---|
| 1 | Behaviour to confirm | P1 | Rule for all endpoints | ALL | `/api/pos/api/*` | Enforce POS permissions on the server |
| 2 | Live | P1 | Change to existing | GET | `/api/auth/me/` | Return POS access with the signed-in user |
| 3 | Live | P1 | New endpoint | PUT | `/api/auth/users/{id}/pos-access/` | Set a user's POS role and access |
| 4 | Live | P1 | Change to existing | POST | `/api/auth/users/` | Create POS staff (including waiters without a password) |
| 5 | Behaviour to confirm | P1 | Change to existing | POST | `/api/auth/token/` | Reject sign-in for accounts that cannot log in |
| 6 | Behaviour to confirm | P1 | Change to existing | DELETE | `/api/auth/users/{id}/` | Safe delete |
| 7 | Behaviour to confirm | P2 | Change to existing | POST | `/api/auth/users/{id}/set_active/` | Protect the last Administrator |
| 8 | Not in API yet | P2 | New endpoint | POST | `/api/auth/users/{id}/set-password/` | Administrator sets a user's password |
| 9 | Not in API yet | P2 | New endpoint | POST | `/api/auth/users/{id}/set-pin/` | Set a manager approval PIN |
| 10 | Live | P1 | New endpoint | POST | `/api/pos/api/approvals/` | Manager approval |
| 11 | Not in API yet | P2 | New endpoint | POST | `/api/auth/audit-logs/` | Write audit events |
| 12 | Partly live | P1 | New endpoint | POST | `/api/pos/api/orders/{id}/apply_discount/` | Apply a bill discount |
| 13 | Live | P1 | New endpoint | DELETE | `/api/pos/api/orders/{id}/discount/` | Remove a bill discount |
| 14 | Partly live | P1 | New endpoint | POST | `/api/pos/api/orders/{id}/settle/` | Settle a bill in one transaction |
| 15 | Partly live | P1 | Change to existing | POST | `/api/pos/api/order-payments/create_flexible_payment/` | Payment fields for tips, cash and wallets |
| 16 | Not in API yet | P3 | New endpoint | POST | `/api/pos/api/order-payments/{id}/initiate/` | Card terminal / UPI QR payment |
| 17 | Live | P2 | New endpoint | GET | `/api/pos/api/staff/` | POS staff list |
| 18 | Not in API yet | P3 | New endpoint | POST | `/api/pos/api/orders/{id}/print-log/` | Record bill and KOT prints |
| 19 | Partly live | P1 | Change to existing | GET | `/api/pos/api/orders/{id}/` | New order fields |
| 20 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/orders/{id}/cancel/` | Cancel an order with a reason |
| 21 | Live | P1 | New endpoint | POST | `/api/pos/api/order-items/{id}/void/` | Reduce or remove an item already sent to the kitchen |
| 22 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/orders/{id}/send_kot/` | Send new items to the kitchen (KOT tracking) |
| 23 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/orders/merge/` | Merge tables |
| 24 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/orders/{id}/move_items/` | Move items between tables |
| 25 | Not in API yet | P2 | New endpoint | GET | `/api/pos/api/orders/history/` | Closed bills with filters |
| 26 | Not in API yet | P2 | New endpoint | GET | `/api/pos/api/orders/history/summary/` | History summary cards |
| 27 | Not in API yet | P3 | New endpoint | GET | `/api/pos/api/reports/{report}/` | Server-side reports |
| 28 | Partly live | P2 | New endpoint | POST | `/api/pos/api/shifts/open/` | Cash counter shifts per restaurant / terminal |
| 29 | Partly live | P2 | New endpoint | POST | `/api/pos/api/shifts/{id}/close/` | Close a shift (Z report) |
| 30 | Not in API yet | P2 | New endpoint | PUT | `/api/pos/api/restaurants/{id}/print-settings/` | Restaurant print settings |
| 31 | Not in API yet | P2 | New endpoint | PUT | `/api/pos/api/restaurants/{id}/tax-config/` | Country tax configuration |
| 32 | Not in API yet | P3 | Change to existing | GET | `/api/hotels/my-hotel/` | Hotel locale and country code |
| 33 | Not in API yet | P3 | New endpoint | GET | `/api/pos/api/third-party/integrations/` | Delivery platform status |
| 34 | Not in API yet | P3 | New endpoint | GET | `/api/pos/api/third-party/orders/` | Incoming aggregator orders |
| 35 | Not in API yet | P3 | New endpoint | POST | `/api/pos/api/third-party/orders/{id}/accept/` | Accept or reject an aggregator order |
| 36 | Not in API yet | P1 | Change to existing | POST | `/api/pos/api/orders/{id}/apply_discount/` | Discount only eligible products |
| 37 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/order-items/{id}/apply_discount/` | Discount one product line |
| 38 | Not in API yet | P2 | Change to existing | PATCH | `/api/pos/api/menu-items/{id}/` | More product fields |
| 39 | Not in API yet | P1 | New endpoint | POST | `/api/pos/api/taxes/` | Tax master |
| 40 | Not in API yet | P1 | Change to existing | PATCH | `/api/pos/api/menu-categories/{id}/` | Category taxes (several per category) and order calculation |
| 41 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/tax-profiles/` | Tax profiles |
| 42 | Not in API yet | P2 | Change to existing | PATCH | `/api/pos/api/menu-categories/{id}/` | Category defaults and subcategories |
| 43 | Not in API yet | P1 | Change to existing | GET | `/api/pos/api/orders/{id}/` | Order line tax and discount snapshot |
| 44 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/modifier-groups/` | Variants, modifiers and add-ons |
| 45 | Not in API yet | P3 | New endpoint | POST | `/api/pos/api/combos/` | Combos and meal deals |
| 46 | Not in API yet | P3 | New endpoint | POST | `/api/pos/api/price-schedules/` | Scheduled and happy-hour prices |
| 47 | Not in API yet | P3 | Change to existing | PATCH | `/api/pos/api/menu-items/{id}/` | Product availability rules |
| 48 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/menu-items/{id}/image/` | Upload a product or category image |
| 49 | Not in API yet | P2 | New endpoint | GET | `/api/pos/api/menu-items/{id}/history/` | Product change history |
| 50 | Not in API yet | P2 | Change to existing | DELETE | `/api/pos/api/menu-items/{id}/` | Safe delete and archive |
| 51 | Not in API yet | P1 | Rule for all endpoints | ALL | `/api/pos/api/menu-items/, /menu-categories/, /taxes/, /tax-profiles/` | Only authorised roles change products and taxes |
| 52 | Not in API yet | P1 | Change to existing | GET | `/api/pos/api/orders/` | Mark orders and items that came from a table QR |
| 53 | Not in API yet | P1 | Change to existing | POST | `/api/pos/public/orders/` | Guest places an order from the table QR |
| 54 | Not in API yet | P2 | New endpoint | PUT | `/api/pos/api/restaurants/{id}/qr-ordering/` | QR ordering settings (restaurant and table) |
| 55 | Not in API yet | P2 | New endpoint | POST | `/api/pos/api/orders/{id}/qr/accept/` | Accept or reject QR items (accept mode) |
| 56 | Not in API yet | P2 | Change to existing | POST | `/api/pos/api/tables/{id}/generate_qr_code/` | Table QR code: secret code and ordering link |
| 57 | Not in API yet | P1 | New endpoint | GET | `https://guest.staydesko.com/ordering/table` | Guest ordering page (guest app) |
| 58 | Not in API yet | P1 | Change to existing | POST | `/api/pos/api/orders/{id}/settle/` | Link POS payments to the cashier's shift |
| 59 | Behaviour to confirm | P1 | Change to existing | POST | `/api/accounting/cash-register/open/` | Open and close rules for cash counter shifts |
| 60 | Not in API yet | P2 | New endpoint | POST | `/api/accounting/cash-register/{id}/movements/` | Cash in and cash out during a shift |
| 61 | Behaviour to confirm | P2 | Change to existing | GET | `/api/accounting/cash-register/{id}/` | Shift report: payment split and activity |
| 62 | Not in API yet | P1 | New endpoint | POST | `/api/pos/api/orders/{id}/refund/` | Refund a paid bill (manager) |

## Users, roles & approvals

### Enforce POS permissions on the server

`ALL /api/pos/api/*` · **P1** · Rule for all endpoints

**Status:** Behaviour to confirm. Not visible in the schema. Please confirm which endpoints check POS permissions and return 403 with approval_required.

Every POS rule (discount limit, Credit Pay, voids, history window, reports, setup, user management) is enforced only in the app today. Anyone with a valid token can call the API directly. Each endpoint must check the caller's POS permission and return 403 in the shared error format.

**Used by:** All screens

**Request body:** none

**Response 403**

```json
{
  "code": "permission_denied",
  "detail": "Discounts above 10% need a manager approval.",
  "fields": {},
  "approval_required": true,
  "permission": "discount.unlimited"
}
```

**Notes**

- Permission keys used by the app: bill.settle, bill.reprint, discount.unlimited, payment.credit, order.void_items, history.full, history.export, reports.view, settings.manage, users.manage.
- When approval_required is true the app shows the manager approval dialog and retries with approval_id.

### Return POS access with the signed-in user

`GET /api/auth/me/` · **P1** · Change to existing

**Status:** Live. User now has pos_access (read-only). The app reads role, permissions, discount limit and restaurants from it.

Add the user's POS role, effective permissions, discount limit and restaurants, so the app no longer parses the profile "department" field.

**Used by:** App start (AccessContext), header

**Request body:** none

**Response 200**

```json
{
  "id": 42,
  "username": "asha.k",
  "first_name": "Asha",
  "last_name": "K",
  "email": "asha@example.com",
  "is_active": true,
  "role": "front_desk_agent",
  "pos_access": {
    "role": "cashier",
    "can_login": true,
    "permissions": [
      "bill.settle",
      "bill.reprint"
    ],
    "discount_limit_percent": "10.00",
    "restaurant_ids": [
      3
    ],
    "has_pin": true
  }
}
```

**Notes**

- Administrators: role "administrator" with every permission including users.manage.

### Set a user's POS role and access

`PUT /api/auth/users/{id}/pos-access/` · **P1** · New endpoint

**Status:** Live. In the API. The app now saves role and access here (falls back to the department text on older servers).

Store POS role, per-user permission changes, discount limit and restaurant assignment in proper fields instead of "department". Must not change the user's hotel role.

**Used by:** Users & Roles → Add / Edit user

**Request body**

```json
{
  "role": "cashier",
  "permissions": {
    "grant": [
      "reports.view"
    ],
    "revoke": [
      "bill.reprint"
    ]
  },
  "discount_limit_percent": "10.00",
  "restaurant_ids": [
    3,
    5
  ]
}
```

**Response 200**

```json
{
  "user_id": 42,
  "role": "cashier",
  "can_login": true,
  "permissions": [
    "bill.settle",
    "reports.view"
  ],
  "discount_limit_percent": "10.00",
  "restaurant_ids": [
    3,
    5
  ],
  "updated_by": {
    "id": 1,
    "name": "Admin User"
  },
  "updated_at": "2026-10-12T09:30:00Z"
}
```

**Error 400**

```json
{
  "code": "invalid",
  "detail": "Unknown permission: reports.edit",
  "fields": {
    "permissions": [
      "Unknown permission: reports.edit"
    ]
  }
}
```

**Error 403**

```json
{
  "code": "permission_denied",
  "detail": "Only Administrators can change access.",
  "permission": "users.manage"
}
```

**Notes**

- role: manager | cashier | waiter. users.manage can never be granted here.
- Waiter forces can_login = false.

### Create POS staff (including waiters without a password)

`POST /api/auth/users/` · **P1** · Change to existing

**Status:** Live. UserCreate now has pos_access and nullable passwords. Waiters are created without a password.

Accept pos_access on create and allow can_login = false with no password, so waiters don't need the random password the app generates today.

**Used by:** Users & Roles → Add user

**Request body**

```json
{
  "username": "ravi.waiter",
  "email": "",
  "first_name": "Ravi",
  "last_name": "K",
  "password": null,
  "confirm_password": null,
  "profile": {
    "phone": "+91 98765 43210",
    "hotel": 7
  },
  "pos_access": {
    "role": "waiter",
    "permissions": {
      "grant": [],
      "revoke": []
    },
    "restaurant_ids": [
      3
    ]
  }
}
```

**Response 201**

```json
{
  "id": 57,
  "username": "ravi.waiter",
  "first_name": "Ravi",
  "last_name": "K",
  "is_active": true,
  "pos_access": {
    "role": "waiter",
    "can_login": false,
    "permissions": [],
    "restaurant_ids": [
      3
    ]
  }
}
```

**Error 400**

```json
{
  "code": "invalid",
  "detail": "A user with that username already exists.",
  "fields": {
    "username": [
      "A user with that username already exists."
    ]
  }
}
```

### Reject sign-in for accounts that cannot log in

`POST /api/auth/token/` · **P1** · Change to existing

**Status:** Behaviour to confirm. Not visible in the schema. Please confirm /auth/token/ refuses waiters and deactivated users.

Waiters (can_login = false) and deactivated users must not receive a token.

**Used by:** Sign-in screen, manager approval

**Request body**

```json
{
  "username": "ravi.waiter",
  "password": "x"
}
```

**Response 403**

```json
{
  "code": "login_not_allowed",
  "detail": "Waiter accounts cannot sign in to the POS."
}
```

### Safe delete

`DELETE /api/auth/users/{id}/` · **P1** · Change to existing

**Status:** Behaviour to confirm. Not visible in the schema. Please confirm 409 has_history / last_admin.

Refuse to delete users who have orders, payments, tips, approvals or audit records (use PROTECT foreign keys), the last Administrator, or yourself.

**Used by:** Users & Roles → Delete

**Request body:** none

**Response 204**

(empty body)

**Error 409**

```json
{
  "code": "has_history",
  "detail": "This user has 128 orders and 64 payments. Deactivate the user instead.",
  "counts": {
    "orders": 128,
    "payments": 64
  }
}
```

**Error 409**

```json
{
  "code": "last_admin",
  "detail": "You cannot delete the last Administrator."
}
```

### Protect the last Administrator

`POST /api/auth/users/{id}/set_active/` · **P2** · Change to existing

**Status:** Behaviour to confirm. Not visible in the schema. Please confirm the last Administrator is protected.

Document the body (is_active) and refuse to deactivate yourself or the last Administrator.

**Used by:** Users & Roles → Deactivate / Reactivate

**Request body**

```json
{
  "is_active": false
}
```

**Response 200**

```json
{
  "id": 57,
  "is_active": false
}
```

**Error 409**

```json
{
  "code": "last_admin",
  "detail": "You cannot deactivate the last Administrator."
}
```

### Administrator sets a user's password

`POST /api/auth/users/{id}/set-password/` · **P2** · New endpoint

**Status:** Not in API yet

Today only the emailed reset link exists, which fails for staff without email. Optionally force a change at next sign-in.

**Used by:** Users & Roles → Reset password

**Request body**

```json
{
  "new_password": "Temp#2026pos",
  "must_change_password": true
}
```

**Response 204**

(empty body)

**Error 400**

```json
{
  "code": "invalid",
  "detail": "Password too common.",
  "fields": {
    "new_password": [
      "This password is too common."
    ]
  }
}
```

**Notes**

- Add must_change_password to /auth/me/ and return 403 code "password_change_required" from other endpoints until it is changed.

### Set a manager approval PIN

`POST /api/auth/users/{id}/set-pin/` · **P2** · New endpoint

**Status:** Not in API yet

Approvals use the manager's username and password today. A 4 to 6 digit PIN, stored hashed, is faster at the counter. Self-service: POST /api/auth/me/pin/ with current_password.

**Used by:** Users & Roles; manager approval dialog

**Request body**

```json
{
  "pin": "4821"
}
```

**Response 204**

(empty body)

**Error 400**

```json
{
  "code": "invalid",
  "detail": "PIN must be 4 to 6 digits.",
  "fields": {
    "pin": [
      "PIN must be 4 to 6 digits."
    ]
  }
}
```

**Notes**

- Lock the PIN for 15 minutes after 5 wrong attempts.

### Manager approval

`POST /api/pos/api/approvals/` · **P1** · New endpoint

**Status:** Live. In the API. The approval dialog now sends password or PIN here and passes approval_id to discounts, Credit Pay and voids.

Server-side check that a Manager/Administrator approves a restricted action. Returns a single-use approval_id that the follow-up request includes. Replaces the client-side check (token + /auth/me/ on a second client).

**Used by:** Discount above limit, Credit Pay, reduce/remove items already sent to the kitchen

**Request body**

```json
{
  "permission": "discount.unlimited",
  "approver_username": "meera.manager",
  "approver_secret": "4821",
  "secret_type": "pin",
  "order_id": 9812,
  "context": {
    "discount_type": "percent",
    "discount_value": "25.00",
    "amount": "300.00"
  }
}
```

**Response 201**

```json
{
  "approval_id": "apr_7f3c9a",
  "permission": "discount.unlimited",
  "order_id": 9812,
  "approver": {
    "id": 12,
    "name": "Meera S"
  },
  "requested_by": {
    "id": 42,
    "name": "Asha K"
  },
  "expires_at": "2026-10-12T09:35:00Z"
}
```

**Error 401**

```json
{
  "code": "invalid_credentials",
  "detail": "Wrong username or PIN."
}
```

**Error 403**

```json
{
  "code": "cannot_approve",
  "detail": "Asha K cannot approve this. A Manager or Administrator must approve."
}
```

**Notes**

- Valid for 5 minutes and one use. Store it for the audit trail and reports (who approved what).

### Write audit events

`POST /api/auth/audit-logs/` · **P2** · New endpoint

**Status:** Not in API yet

The audit log is read-only. The server should log these events itself; this endpoint covers client-only events such as reprints and approval cancellations.

**Used by:** Users & Roles, discounts, voids, Credit Pay, reprints

**Request body**

```json
{
  "module": "pos",
  "action": "bill.reprint",
  "resource_type": "order",
  "resource_id": "9812",
  "description": "Bill #2610011 reprinted (duplicate)",
  "changes": {
    "copy": "duplicate",
    "format": "thermal80"
  }
}
```

**Response 201**

```json
{
  "id": 50211,
  "action": "bill.reprint",
  "user": 42,
  "user_full_name": "Asha K",
  "timestamp": "2026-10-12T09:31:00Z"
}
```

**Notes**

- Server-side events to log automatically: user.create, user.update, user.deactivate, user.delete, access.change, discount.apply, discount.remove, item.void, order.cancel, payment.credit, approval.grant.

## Billing, discounts & payments

### Apply a bill discount

`POST /api/pos/api/orders/{id}/apply_discount/` · **P1** · New endpoint

**Status:** Partly live. In the API. The discount dialog now posts here; the server limit is honoured (asks for approval and retries). Not yet right: tax_amount stays the same after a discount (seen 20 Oct with 50% and 100% discounts). Tax must be recalculated on the discounted amount; see the notes and worked example below.

Store discount type, percent, reason and who gave or approved it. The server recalculates tax and total and enforces the user's limit. Today the app PATCHes discount_amount and writes a "[Disc]" line into notes.

**Used by:** Fine Dine order popup and Complete Payment popup → Disc: Apply / Edit

**Request body**

```json
{
  "type": "percent",
  "value": "10.00",
  "reason": "Regular customer",
  "expected_subtotal": "1200.00",
  "approval_id": null
}
```

**Response 200**

```json
{
  "id": 9812,
  "order_number": "2610011",
  "status": "served",
  "subtotal": "1200.00",
  "discount_type": "percent",
  "discount_percent": "10.00",
  "discount_amount": "120.00",
  "discount_reason": "Regular customer",
  "discounted_by": {
    "id": 42,
    "name": "Asha K"
  },
  "discount_approved_by": null,
  "service_charge": "108.00",
  "tax_amount": "54.00",
  "total_amount": "1242.00",
  "amount_paid": "0.00",
  "amount_due": "1242.00"
}
```

**Error 403**

```json
{
  "code": "permission_denied",
  "detail": "Discounts above 10% need a manager approval.",
  "fields": {},
  "approval_required": true,
  "permission": "discount.unlimited"
}
```

**Error 409**

```json
{
  "code": "subtotal_changed",
  "detail": "The bill changed. New subtotal is 1350.00.",
  "subtotal": "1350.00"
}
```

**Error 409**

```json
{
  "code": "below_paid",
  "detail": "The discounted total would be less than the amount already paid."
}
```

**Notes**

- type: percent | fixed. A percent discount is taken on the subtotal, before service charge and tax.
- Keep the percent when items change and recalculate the amount, so the app no longer needs its "re-apply" warning.
- Tax is calculated on the amount after the discount. Split the bill discount across the discountable lines in proportion to their amounts (any rounding remainder on the largest line, so the shares add up to the discount exactly). Each percentage tax (today: the category tax_rate) = (line amount − its share of the discount) × rate. A 100% discount gives 0 percentage tax.
- Fixed taxes (Tax master: per_unit, per_bill) do not change with a discount: per_unit stays amount × quantity, per_bill is charged once. Waiving them is a separate action, not part of a discount.
- Service charge is also worked out on the discounted amount (in the response above: 10% of 1080 = 108).

**Worked example:** food for 800 (CGST 2.5% + SGST 2.5%) and 2 beers at 100 each (VAT 20% + bottle deposit 10 per bottle), no service charge.

| | No discount | 50% discount | 100% discount |
|---|---|---|---|
| Food after discount | 800 | 400 | 0 |
| CGST + SGST (5%) | 40 | 20 | 0 |
| Beer after discount | 200 | 100 | 0 |
| VAT 20% | 40 | 20 | 0 |
| Bottle deposit (2 × 10) | 20 | 20 | 20 |
| **Total** | **1100** | **560** | **20** |

### Remove a bill discount

`DELETE /api/pos/api/orders/{id}/discount/` · **P1** · New endpoint

**Status:** Live. In the API. Remove discount now uses this.

Clears the discount fields and recalculates the totals.

**Used by:** Discount dialog → Remove discount

**Request body:** none

**Response 200**

```json
{
  "id": 9812,
  "discount_type": null,
  "discount_percent": null,
  "discount_amount": "0.00",
  "total_amount": "1380.00",
  "amount_due": "1380.00"
}
```

### Settle a bill in one transaction

`POST /api/pos/api/orders/{id}/settle/` · **P1** · New endpoint

**Status:** Partly live. In the API, but browsers block it while the Idempotency-Key header is not in the CORS allow list (Access-Control-Allow-Headers), which shows as "Network Error". Add idempotency-key to CORS_ALLOW_HEADERS. Until then the app sends the key in the body as idempotency_key (please honour it there too) and no header.

Record the payment(s), tip and cash details, complete the order, issue the invoice number and free the table atomically. Today the app chains 4 to 6 calls (payment, re-read, update_status, table status, outstanding record).

**Used by:** Complete Payment popup → Settle & Close Order

**Request headers**

```json
{
  "Idempotency-Key": "6f1d2c1e-8a8b-4c7e-9a55-3c2d6b2a9e10"
}
```

**Request body**

```json
{
  "expected_amount_due": "1242.00",
  "payments": [
    {
      "method": "cash",
      "amount": "742.00",
      "amount_received": "800.00",
      "change_returned": "58.00"
    },
    {
      "method": "mobile_payment",
      "channel": "paytm",
      "amount": "500.00",
      "reference": "UTR4561237890"
    }
  ],
  "tip": {
    "amount": "50.00",
    "method": "cash",
    "staff_id": 12
  },
  "room_charge": null,
  "credit": null,
  "notes": "",
  "approval_id": null,
  "idempotency_key": "6f1d2c1e-8a8b-4c7e-9a55-3c2d6b2a9e10"
}
```

**Response 200**

```json
{
  "order": {
    "id": 9812,
    "order_number": "2610011",
    "status": "completed",
    "total_amount": "1242.00",
    "amount_paid": "1242.00",
    "amount_due": "0.00",
    "closed_at": "2026-10-12T09:40:00Z",
    "invoice_number": "INV/26-27/000731"
  },
  "payments": [
    {
      "id": 3301,
      "method": "cash",
      "amount": "742.00",
      "amount_received": "800.00",
      "change_returned": "58.00",
      "status": "completed"
    },
    {
      "id": 3302,
      "method": "mobile_payment",
      "channel": "paytm",
      "amount": "500.00",
      "transaction_id": "UTR4561237890",
      "status": "completed"
    }
  ],
  "tip": {
    "id": 77,
    "amount": "50.00",
    "method": "cash",
    "staff": {
      "id": 12,
      "name": "Ravi K"
    }
  },
  "table": {
    "id": 5,
    "status": "available"
  }
}
```

**Error 409**

```json
{
  "code": "amount_changed",
  "detail": "Amount due is now 1380.00.",
  "amount_due": "1380.00"
}
```

**Error 409**

```json
{
  "code": "already_settled",
  "detail": "Order is already completed.",
  "order_status": "completed"
}
```

**Error 422**

```json
{
  "code": "overpayment",
  "detail": "Payments exceed the amount due by 100.00."
}
```

**Notes**

- Guest Visit: send room_charge: { "guest_id": 881 } and no payments.
- Credit Pay: send credit: { "customer_name": "R. Kumar", "customer_phone": "+91 98765 43210" } and no payments; requires payment.credit or approval_id. The server creates the outstanding record.
- Same Idempotency-Key within 24 h returns the first result, so retries never charge twice.
- CORS: add idempotency-key to CORS_ALLOW_HEADERS (django-cors-headers: CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key")). The app also sends the key in the body as idempotency_key.
- Do not free the table when another order is still open on it.

### Payment fields for tips, cash and wallets

`POST /api/pos/api/order-payments/create_flexible_payment/` · **P1** · Change to existing

**Status:** Partly live. Live on OrderPayment: amount_received, change_returned, channel, card_type, refunded_amount. Tip fields are not on the payment (tips go through /settle/). Idempotency-Key and overpayment checks can't be confirmed from the schema.

If /settle/ is not built yet: accept tip, cash-received/change and wallet channel fields (today they go into notes as text), honour Idempotency-Key and reject payments above the remaining balance.

**Used by:** Complete Payment popup

**Request headers**

```json
{
  "Idempotency-Key": "6f1d2c1e-8a8b-4c7e-9a55-3c2d6b2a9e10"
}
```

**Request body**

```json
{
  "order": 9812,
  "method": "cash",
  "amount": "1242.00",
  "amount_received": "1300.00",
  "change_returned": "58.00",
  "channel": null,
  "card_type": null,
  "transaction_id": "",
  "tip_amount": "50.00",
  "tip_method": "cash",
  "tip_staff": 12,
  "notes": ""
}
```

**Response 201**

```json
{
  "id": 3301,
  "order": 9812,
  "method": "cash",
  "amount": "1242.00",
  "amount_received": "1300.00",
  "change_returned": "58.00",
  "tip_amount": "50.00",
  "tip_method": "cash",
  "tip_staff": 12,
  "status": "completed",
  "processed_by": 42,
  "processed_at": "2026-10-12T09:40:00Z"
}
```

**Error 422**

```json
{
  "code": "overpayment",
  "detail": "Amount exceeds the remaining balance of 1242.00."
}
```

**Notes**

- channel: upi | paytm | phonepe | gpay (for mobile_payment). card_type: credit | debit.

### Card terminal / UPI QR payment

`POST /api/pos/api/order-payments/{id}/initiate/` · **P3** · New endpoint

**Status:** Not in API yet

Start a gateway payment (card terminal, dynamic UPI QR) and poll its status, so card and UPI payments are confirmed by the provider rather than by staff ticking a box.

**Used by:** Complete Payment popup (future)

**Request body**

```json
{
  "order_id": 9812,
  "method": "mobile_payment",
  "channel": "upi",
  "amount": "1242.00",
  "terminal_id": "T-02"
}
```

**Response 201**

```json
{
  "payment_id": 3310,
  "status": "pending",
  "qr_payload": "upi://pay?pa=merchant@bank&am=1242.00&tr=3310",
  "expires_at": "2026-10-12T09:45:00Z"
}
```

**Notes**

- GET /api/pos/api/order-payments/{id}/status/ → { "payment_id": 3310, "status": "completed" | "pending" | "failed", "transaction_id": "..." }

### POS staff list

`GET /api/pos/api/staff/?restaurant_id=3&role=waiter&active=true` · **P2** · New endpoint

**Status:** Live. In the API. Waiter picker, History, Reports and printed bills now read staff names here.

Waiter and server picker readable by Cashiers. /api/auth/users/ may be restricted to admins, which would disable the waiter dropdown.

**Used by:** Complete Payment popup (tip waiter), History, Reports (server names)

**Request body:** none

**Response 200**

```json
{
  "count": 2,
  "results": [
    {
      "id": 12,
      "name": "Ravi K",
      "role": "waiter",
      "is_active": true
    },
    {
      "id": 42,
      "name": "Asha K",
      "role": "cashier",
      "is_active": true
    }
  ]
}
```

**Notes**

- Include inactive staff when ?active=all so History can still show names of people who left.

### Record bill and KOT prints

`POST /api/pos/api/orders/{id}/print-log/` · **P3** · New endpoint

**Status:** Not in API yet

Count original and duplicate prints per bill. Reprints are marked DUPLICATE on paper only today.

**Used by:** Print bill, Print receipt, Reprint bill, Print KOT

**Request body**

```json
{
  "document": "bill",
  "copy": "duplicate",
  "format": "thermal80",
  "device": "Counter-1"
}
```

**Response 201**

```json
{
  "id": 901,
  "order": 9812,
  "document": "bill",
  "copy": "duplicate",
  "print_number": 2,
  "printed_by": {
    "id": 42,
    "name": "Asha K"
  },
  "printed_at": "2026-10-12T10:02:00Z"
}
```

## Orders & kitchen

### New order fields

`GET /api/pos/api/orders/{id}/` · **P1** · Change to existing

**Status:** Partly live. Live: guest_count, closed_at/by, cancelled_at/by, cancel_approved_by, cancel_reason, discount_* fields, amount_paid, amount_due, invoice_number, category_name, voided_quantity, refunded_amount. Missing: kot_number and kot_sent_at on items.

Fields the app has to guess today: close and cancel times, cancel reason, guest count (covers), discount details, amount paid/due, invoice number and item category snapshot.

**Used by:** History (Closed column, cancelled bills), Reports, printed bills

**Request body:** none

**Response 200**

```json
{
  "id": 9812,
  "order_number": "2610011",
  "status": "completed",
  "guest_count": 4,
  "closed_at": "2026-10-12T09:40:00Z",
  "closed_by": {
    "id": 42,
    "name": "Asha K"
  },
  "cancelled_at": null,
  "cancelled_by": null,
  "cancel_reason": "",
  "discount_type": "percent",
  "discount_percent": "10.00",
  "discount_amount": "120.00",
  "discount_reason": "Regular customer",
  "amount_paid": "1242.00",
  "amount_due": "0.00",
  "invoice_number": "INV/26-27/000731",
  "items": [
    {
      "id": 1,
      "menu_item": 31,
      "menu_item_name": "Paneer Tikka",
      "category_name": "Starters",
      "quantity": 2,
      "unit_price": "280.00",
      "total_price": "560.00",
      "status": "served",
      "kot_number": 1,
      "kot_sent_at": "2026-10-12T08:55:00Z"
    }
  ],
  "payments": [
    {
      "id": 3301,
      "method": "cash",
      "amount": "1242.00",
      "status": "completed",
      "refunded_amount": "0.00"
    }
  ]
}
```

**Notes**

- category_name is a snapshot at order time so deleted menu items keep their category in reports.
- refunded_amount on payments covers partially_refunded.

### Cancel an order with a reason

`POST /api/pos/api/orders/{id}/cancel/` · **P2** · New endpoint

**Status:** Not in API yet

Record who cancelled, when and why. Needs order.cancel permission or a manager approval.

**Used by:** Fine Dine (planned), Reports → Cancellations

**Request body**

```json
{
  "reason": "Customer left before food was served",
  "approval_id": "apr_7f3c9a"
}
```

**Response 200**

```json
{
  "id": 9812,
  "status": "cancelled",
  "cancelled_at": "2026-10-12T09:10:00Z",
  "cancelled_by": {
    "id": 42,
    "name": "Asha K"
  },
  "cancel_approved_by": {
    "id": 12,
    "name": "Meera S"
  },
  "cancel_reason": "Customer left before food was served"
}
```

**Error 409**

```json
{
  "code": "has_payments",
  "detail": "Refund the payments before cancelling."
}
```

### Reduce or remove an item already sent to the kitchen

`POST /api/pos/api/order-items/{id}/void/` · **P1** · New endpoint

**Status:** Live. In the API. Reducing or removing an item already sent to the kitchen now calls this.

Keep the cancelled quantity as a record with reason and approver. Today the app PATCHes the quantity or deletes the line, losing the history, and writes a "[Void]" line into the order notes.

**Used by:** Fine Dine order popup → quantity − / remove

**Request body**

```json
{
  "quantity": 1,
  "reason": "Guest changed the order",
  "approval_id": "apr_7f3c9a"
}
```

**Response 200**

```json
{
  "item": {
    "id": 501,
    "quantity": 1,
    "voided_quantity": 1,
    "status": "served"
  },
  "void": {
    "id": 88,
    "quantity": 1,
    "amount": "280.00",
    "reason": "Guest changed the order",
    "voided_by": {
      "id": 42,
      "name": "Asha K"
    },
    "approved_by": {
      "id": 12,
      "name": "Meera S"
    },
    "voided_at": "2026-10-12T09:05:00Z"
  },
  "order": {
    "id": 9812,
    "subtotal": "920.00",
    "total_amount": "1003.00"
  }
}
```

**Error 403**

```json
{
  "code": "permission_denied",
  "detail": "Voids need a manager approval.",
  "approval_required": true,
  "permission": "order.void_items"
}
```

**Notes**

- Items still pending (not sent to the kitchen) can keep using PATCH / DELETE without approval.

### Send new items to the kitchen (KOT tracking)

`POST /api/pos/api/orders/{id}/send_kot/` · **P2** · New endpoint

**Status:** Not in API yet

Mark unsent items as sent, assign a KOT number and return only those items, so reprints and duplicates are controlled by the server.

**Used by:** Fine Dine: Print KOT, Send to kitchen, Add & print KOT

**Request body**

```json
{
  "reprint_kot_number": null
}
```

**Response 200**

```json
{
  "order_id": 9812,
  "kot_number": 3,
  "sent_at": "2026-10-12T09:12:00Z",
  "items": [
    {
      "id": 512,
      "menu_item_name": "Butter Naan",
      "quantity": 4,
      "special_instructions": ""
    }
  ],
  "is_reprint": false
}
```

**Notes**

- reprint_kot_number: 2 returns KOT 2 again with is_reprint: true.
- Moves a pending order to confirmed.

### Merge tables

`POST /api/pos/api/orders/merge/` · **P2** · New endpoint

**Status:** Not in API yet

Move all items from the source tables' open orders into the target table's order in one transaction.

**Used by:** Fine Dine → Merge Table (disabled until available)

**Request body**

```json
{
  "target_table_id": 12,
  "source_table_ids": [
    13,
    14
  ]
}
```

**Response 200**

```json
{
  "target_order": {
    "id": 9820,
    "table": 12,
    "subtotal": "2450.00",
    "total_amount": "2817.50",
    "items_count": 9
  },
  "closed_orders": [
    {
      "id": 9821,
      "status": "merged",
      "merged_into": 9820
    },
    {
      "id": 9822,
      "status": "merged",
      "merged_into": 9820
    }
  ],
  "freed_tables": [
    13,
    14
  ]
}
```

**Error 409**

```json
{
  "code": "has_payments",
  "detail": "Table 13 has payments recorded and cannot be merged."
}
```

**Notes**

- Use a "merged" status that reports do not count as a cancellation.

### Move items between tables

`POST /api/pos/api/orders/{id}/move_items/` · **P2** · New endpoint

**Status:** Not in API yet

Move whole or partial item quantities to another table's order (created if needed).

**Used by:** Fine Dine → Move Items (disabled until available)

**Request body**

```json
{
  "destination_table_id": 15,
  "items": [
    {
      "order_item_id": 301,
      "quantity": 2
    }
  ]
}
```

**Response 200**

```json
{
  "source_order": {
    "id": 9812,
    "subtotal": "640.00",
    "total_amount": "736.00",
    "status": "served"
  },
  "destination_order": {
    "id": 9830,
    "table": 15,
    "subtotal": "560.00",
    "total_amount": "644.00",
    "status": "confirmed"
  }
}
```

**Error 400**

```json
{
  "code": "invalid",
  "detail": "Quantity for item 301 must be between 1 and 2."
}
```

## History, reports & shifts

### Closed bills with filters

`GET /api/pos/api/orders/history/?restaurant_id=3&from=2026-10-01T00:00:00%2B05:30&to=2026-10-12T00:00:00%2B05:30&status=completed,outstanding&type=dine_in&payment=cash&table=5&server=12&search=2610&page=1&page_size=100` · **P2** · New endpoint

**Status:** Not in API yet

Server-side filtering and paging for History, Reports and exports. Today the app pages through /orders/ newest first, filters in the browser and stops at 5,000 orders.

**Used by:** History (both tabs), Reports, Excel export

**Request body:** none

**Response 200**

```json
{
  "count": 642,
  "next": "/api/pos/api/orders/history/?page=2",
  "previous": null,
  "results": [
    {
      "id": 9812,
      "order_number": "2610011",
      "status": "completed",
      "collection_status": "paid",
      "type": "dine_in",
      "table_number": "5",
      "server": 12,
      "order_time": "2026-10-11T07:39:00Z",
      "closed_at": "2026-10-11T07:58:00Z",
      "subtotal": "1200.00",
      "discount_amount": "120.00",
      "service_charge": "108.00",
      "tax_amount": "54.00",
      "total_amount": "1242.00",
      "amount_paid": "1242.00",
      "amount_due": "0.00",
      "payments": [
        {
          "method": "cash",
          "amount": "1242.00",
          "status": "completed"
        }
      ]
    }
  ]
}
```

**Notes**

- Only closed statuses: completed, outstanding, cancelled, refunded.
- from / to are ISO date-times with offset (the restaurant's time zone); to is exclusive.
- collection_status: paid | partially_paid | unpaid | payment_pending | transferred_ar | written_off.
- search matches order number, customer name, phone and exact amount.

### History summary cards

`GET /api/pos/api/orders/history/summary/?restaurant_id=3&from=...&to=...&status=...` · **P2** · New endpoint

**Status:** Not in API yet

The eight summary cards for the same filters, calculated on the server.

**Used by:** History summary cards

**Request body:** none

**Response 200**

```json
{
  "bills": 62,
  "total": "100799.00",
  "cash": "73618.00",
  "card": "0.00",
  "upi": "27181.00",
  "guest_visit": "12330.00",
  "other": "0.00",
  "pending_collection": "0.00",
  "written_off": "0.00",
  "tax": "4129.62",
  "cancelled_count": 2,
  "cancelled_value": "1850.00",
  "refunded_count": 0
}
```

**Notes**

- Must satisfy: total = cash + card + upi + guest_visit + other + pending_collection + written_off − overpaid.

### Server-side reports

`GET /api/pos/api/reports/{report}/?restaurant_id=3&from=...&to=...&status=sales&type=all&payment=all&table=all&server=all&category=all&search=` · **P3** · New endpoint

**Status:** Not in API yet

Same 13 reports as the Reports screen, with one response shape, for long periods and large outlets. The existing /reports/* endpoints have no documented parameters.

**Used by:** Reports screen

**Request body:** none

**Response 200**

```json
{
  "report": "daywise",
  "period": {
    "from": "2026-10-04T00:00:00+05:30",
    "to": "2026-10-11T00:00:00+05:30",
    "time_zone": "Asia/Kolkata"
  },
  "columns": [
    {
      "key": "date",
      "label": "Date",
      "type": "date"
    },
    {
      "key": "bills",
      "label": "Bills",
      "type": "number"
    },
    {
      "key": "total",
      "label": "Total",
      "type": "money"
    }
  ],
  "rows": [
    {
      "date": "2026-10-04",
      "bills": 58,
      "total": "91240.00"
    }
  ],
  "totals": {
    "bills": 412,
    "total": "642110.00"
  }
}
```

**Notes**

- report: summary, daywise, billwise, hourly, payments, credit, items, categories, staff, tables, discounts, cancellations, tax.
- Column types: text, number, money, percent, date, datetime.

### Cash counter shifts per restaurant / terminal

`POST /api/pos/api/shifts/open/` · **P2** · New endpoint

**Status:** Partly live. The accounting module has this: /api/accounting/cash-counters/ and /api/accounting/cash-register/ (open, current, open_defaults, close, reconcile). The POS Cash Counters feature uses them instead of this path. Still missing: the link to POS payments and the rules in "Cash counters" below.

Open and close a cashier shift with a cash count. The cashier History window ("since the last cash counter close") uses the hotel-wide accounting cash register today.

**Used by:** History (cashier window, previous shift indicator); future shift screen

**Request body**

```json
{
  "restaurant_id": 3,
  "terminal": "Counter-1",
  "opening_cash": "2000.00"
}
```

**Response 201**

```json
{
  "id": 311,
  "restaurant_id": 3,
  "terminal": "Counter-1",
  "status": "open",
  "opened_by": {
    "id": 42,
    "name": "Asha K"
  },
  "opened_at": "2026-10-12T03:30:00Z",
  "opening_cash": "2000.00"
}
```

**Notes**

- GET /api/pos/api/shifts/current/?restaurant_id=3&terminal=Counter-1 → the open shift or 404.
- GET /api/pos/api/shifts/last-closed/?restaurant_id=3 → { "id": 310, "closed_at": "2026-10-11T17:45:00Z", "closed_by": {...} }.
- Link orders and payments to the shift (shift_id) so reports can filter by shift.

### Close a shift (Z report)

`POST /api/pos/api/shifts/{id}/close/` · **P2** · New endpoint

**Status:** Partly live. POST /api/accounting/cash-register/{id}/close/ records the count and the difference; the POS uses it. Still missing: the report breakdown (payment split, discounts, voids, tips); see "Shift report: payment split and activity".

Close the shift with the counted cash and return the shift report: sales, payment split, expected vs counted cash, discounts, voids and tips.

**Used by:** Future shift screen; Reports → Shift report

**Request body**

```json
{
  "counted_cash": "15480.00",
  "notes": "Rs 20 short"
}
```

**Response 200**

```json
{
  "id": 311,
  "status": "closed",
  "closed_at": "2026-10-12T17:45:00Z",
  "closed_by": {
    "id": 42,
    "name": "Asha K"
  },
  "report": {
    "bills": 64,
    "sales_total": "101329.00",
    "cash_sales": "13500.00",
    "opening_cash": "2000.00",
    "expected_cash": "15500.00",
    "counted_cash": "15480.00",
    "variance": "-20.00",
    "card": "0.00",
    "upi": "29411.00",
    "guest_visit": "12330.00",
    "pending": "2230.00",
    "discounts": "1240.00",
    "voids": "560.00",
    "tips": "850.00"
  }
}
```

**Notes**

- GET /api/pos/api/shifts/{id}/report/ returns the same report for an open shift (X report).

## Print & tax settings

### Restaurant print settings

`PUT /api/pos/api/restaurants/{id}/print-settings/` · **P2** · New endpoint

**Status:** Not in API yet

Share bill header, tax labels and formats across all devices of a restaurant. Today they are saved per device in the browser. GET returns the same body.

**Used by:** Settings → Bill & KOT formats; every bill and KOT print

**Request body**

```json
{
  "bill_format": "thermal80",
  "kot_format": "thermal80",
  "sheet_size": "A4",
  "header": {
    "name": "Spice Garden",
    "address": "12 MG Road, Bengaluru 560001",
    "phone": "080 4000 1234",
    "tax_id_label": "GSTIN",
    "tax_id": "29ABCDE1234F1Z5",
    "licence_label": "FSSAI Lic. No",
    "licence": "11223344556677",
    "footer": "Thank you! Visit again."
  },
  "tax": {
    "profile": "IN",
    "invoice_title": "TAX INVOICE",
    "receipt_title": "BILL",
    "mode": "split",
    "single_label": "GST",
    "components": [
      {
        "label": "CGST",
        "share": 50
      },
      {
        "label": "SGST",
        "share": 50
      }
    ]
  },
  "kot_copies": 1,
  "auto_print_bill": false
}
```

**Response 200**

```json
{
  "restaurant_id": 3,
  "updated_at": "2026-10-12T09:00:00Z",
  "updated_by": {
    "id": 1,
    "name": "Admin User"
  }
}
```

**Notes**

- Devices may still override bill_format / kot_format locally (different printers per terminal).
- Requires settings.manage.

### Country tax configuration

`PUT /api/pos/api/restaurants/{id}/tax-config/` · **P2** · New endpoint

**Status:** Not in API yet

Real tax rates and components per item or category (GST CGST/SGST/IGST, VAT rates, US sales tax, Canadian GST/PST/HST), tax-inclusive pricing and item codes (HSN/SAC). Only the total tax_amount exists today, so printed splits are by share and rates are not printed.

**Used by:** Printed bills, Tax report, order totals (server)

**Request body**

```json
{
  "country": "IN",
  "prices_include_tax": false,
  "registration": {
    "label": "GSTIN",
    "number": "29ABCDE1234F1Z5"
  },
  "tax_classes": [
    {
      "key": "food_5",
      "label": "Restaurant service 5%",
      "components": [
        {
          "label": "CGST",
          "rate": "2.50"
        },
        {
          "label": "SGST",
          "rate": "2.50"
        }
      ],
      "code": "SAC 996331"
    },
    {
      "key": "alcohol",
      "label": "Liquor (state VAT)",
      "components": [
        {
          "label": "VAT",
          "rate": "20.00"
        }
      ],
      "code": ""
    }
  ],
  "default_tax_class": "food_5"
}
```

**Response 200**

```json
{
  "restaurant_id": 3,
  "version": 4,
  "updated_at": "2026-10-12T09:00:00Z"
}
```

**Notes**

- Menu items get tax_class. Order and items return tax_lines: [{ "label": "CGST", "rate": "2.50", "amount": "27.00" }].
- E-invoicing (Saudi ZATCA QR, India IRN for B2B, EU fiscal devices) builds on this: return qr_payload / irn with the settled order.

### Hotel locale and country code

`GET /api/hotels/my-hotel/` · **P3** · Change to existing

**Status:** Not in API yet

The app guesses number and date format from the currency. Add an explicit locale and ISO country code.

**Used by:** Bills, History, Reports (formatting); print settings defaults

**Request body:** none

**Response 200**

```json
{
  "id": 7,
  "name": "Room99 Bengaluru",
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "country": "India",
  "country_code": "IN",
  "locale": "en-IN",
  "language": "en"
}
```

## Third-party orders

### Delivery platform status

`GET /api/pos/api/third-party/integrations/?restaurant_id=3` · **P3** · New endpoint

**Status:** Not in API yet

Which aggregators (Zomato, Swiggy, …) are connected. The Third Party tab shows "Not set up" until this exists.

**Used by:** Third Party tab, Live Orders button

**Request body:** none

**Response 200**

```json
{
  "configured": true,
  "platforms": [
    {
      "key": "zomato",
      "name": "Zomato",
      "connected": true,
      "store_id": "ZOM-55102",
      "accepting_orders": true
    },
    {
      "key": "swiggy",
      "name": "Swiggy",
      "connected": false
    }
  ]
}
```

### Incoming aggregator orders

`GET /api/pos/api/third-party/orders/?restaurant_id=3&status=live` · **P3** · New endpoint

**Status:** Not in API yet

Live orders waiting to be accepted, and orders in progress.

**Used by:** Third Party tab

**Request body:** none

**Response 200**

```json
{
  "results": [
    {
      "id": "tp_901",
      "platform": "zomato",
      "external_id": "ZMT-7781234",
      "status": "new",
      "received_at": "2026-10-12T12:01:00Z",
      "accept_by": "2026-10-12T12:04:00Z",
      "customer": {
        "name": "Neha",
        "phone_masked": "+91 ******3210"
      },
      "items": [
        {
          "name": "Paneer Tikka",
          "quantity": 1,
          "price": "280.00",
          "notes": ""
        }
      ],
      "subtotal": "280.00",
      "taxes": "14.00",
      "packaging": "20.00",
      "total": "314.00",
      "payment": "prepaid"
    }
  ]
}
```

### Accept or reject an aggregator order

`POST /api/pos/api/third-party/orders/{id}/accept/` · **P3** · New endpoint

**Status:** Not in API yet

Accepting creates a normal POS order (type delivery) so it goes to the kitchen. Reject: POST /third-party/orders/{id}/reject/ with a reason.

**Used by:** Third Party tab

**Request body**

```json
{
  "prep_time_minutes": 20
}
```

**Response 200**

```json
{
  "id": "tp_901",
  "status": "accepted",
  "pos_order": {
    "id": 9901,
    "order_number": "2610140",
    "type": "delivery",
    "status": "confirmed"
  }
}
```

**Error 409**

```json
{
  "code": "expired",
  "detail": "The platform cancelled this order because it was not accepted in time."
}
```

**Notes**

- Reject body: { "reason": "item_unavailable" | "kitchen_busy" | "store_closed" | "other", "detail": "" }.

## Products, taxes & pricing

### Discount only eligible products

`POST /api/pos/api/orders/{id}/apply_discount/` · **P1** · Change to existing

**Status:** Not in API yet

Each product gets is_discountable (default true) and optional limits. A bill-level percent discount must be calculated on eligible lines only, and fixed discounts allocated across eligible lines, on the server, so no screen or API call can discount a non-discountable product. Response shows the eligible amount so the cashier sees it before confirming.

**Used by:** Discount dialog (order popup and Complete Payment), Product form → Discounts

**Request body**

```json
{
  "type": "percent",
  "value": "10.00",
  "reason": "Regular customer",
  "expected_subtotal": "200.00",
  "approval_id": null,
  "preview": false
}
```

**Response 200**

```json
{
  "id": 9812,
  "subtotal": "200.00",
  "eligible_subtotal": "150.00",
  "non_discountable_subtotal": "50.00",
  "discount_type": "percent",
  "discount_percent": "10.00",
  "discount_amount": "15.00",
  "lines": [
    {
      "order_item_id": 1,
      "name": "Food item A",
      "amount": "100.00",
      "discountable": true,
      "discount": "10.00"
    },
    {
      "order_item_id": 2,
      "name": "Beverage B",
      "amount": "50.00",
      "discountable": false,
      "discount": "0.00"
    },
    {
      "order_item_id": 3,
      "name": "Dessert C",
      "amount": "50.00",
      "discountable": true,
      "discount": "5.00"
    }
  ],
  "tax_amount": "9.25",
  "total_amount": "194.25"
}
```

**Error 409**

```json
{
  "code": "nothing_discountable",
  "detail": "No product on this bill can be discounted."
}
```

**Notes**

- preview: true returns the same body without saving, so the dialog can show "Discount applies to 150.00 of 200.00".
- Product-level limits: max_discount_percent and max_discount_amount cap each line; allow_percent / allow_fixed restrict the discount type per product.
- Calculation order (configurable per jurisdiction): prices → product discounts → bill discount on remaining eligible amounts → taxes → service charges / fees → total.

### Discount one product line

`POST /api/pos/api/order-items/{id}/apply_discount/` · **P2** · New endpoint

**Status:** Not in API yet

Line-level discount that respects the product's eligibility and limits, with reason and approval like bill discounts.

**Used by:** Order popup (planned): discount on a single item

**Request body**

```json
{
  "type": "fixed",
  "value": "20.00",
  "reason": "Cold food complaint",
  "approval_id": null
}
```

**Response 200**

```json
{
  "order_item_id": 2,
  "amount": "100.00",
  "discount_type": "fixed",
  "discount_amount": "20.00",
  "discount_reason": "Cold food complaint",
  "order": {
    "id": 9812,
    "total_amount": "1222.00"
  }
}
```

**Error 403**

```json
{
  "code": "not_discountable",
  "detail": "Beverage B cannot be discounted."
}
```

### More product fields

`PATCH /api/pos/api/menu-items/{id}/` · **P2** · Change to existing

**Status:** Not in API yet

Fields the Product form needs beyond today's menu item. Same fields on POST /menu-items/ and in GET responses (list and detail, including category id).

**Used by:** Product Management → Product form (Basic, Pricing, Discounts, Availability, Advanced)

**Request body**

```json
{
  "display_name": "Paneer Tikka (6 pcs)",
  "sku": "STR-PT-01",
  "barcode": "8901234567890",
  "subcategory": 14,
  "product_type": "food",
  "prep_station": 3,
  "unit": "portion",
  "cost_price": "95.00",
  "show_on_pos": true,
  "show_online": false,
  "is_discountable": true,
  "discount_rules": {
    "allow_percent": true,
    "allow_fixed": true,
    "max_discount_percent": "20.00",
    "max_discount_amount": null,
    "combinable_with_promotions": false
  },
  "tax_profile": null,
  "prices": {
    "dine_in": "280.00",
    "takeaway": "260.00",
    "delivery": "300.00",
    "online": "300.00"
  },
  "min_price": "250.00",
  "max_price": "350.00",
  "translations": {
    "ar": {
      "name": "بانير تكا",
      "description": ""
    }
  }
}
```

**Response 200**

```json
{
  "id": 31,
  "name": "Paneer Tikka",
  "category": 2,
  "price": "280.00",
  "sku": "STR-PT-01",
  "is_discountable": true,
  "tax_profile": null,
  "effective_tax_profile": {
    "id": 1,
    "name": "Standard Food Tax",
    "source": "category"
  },
  "updated_at": "2026-10-13T09:00:00Z",
  "updated_by": {
    "id": 1,
    "name": "Admin User"
  }
}
```

**Error 403**

```json
{
  "code": "permission_denied",
  "detail": "Only authorised roles can change cost price, tax or discount settings.",
  "permission": "products.sensitive"
}
```

**Notes**

- product_type: food | beverage | alcoholic_beverage | non_food | service | custom.
- cost_price visible only to roles with settings.manage; never returned to cashiers.
- tax_profile null = inherit the category's default_tax_profile; effective_tax_profile shows what applies.
- sku and barcode unique per restaurant.

### Tax master

`POST /api/pos/api/taxes/` · **P1** · New endpoint

**Status:** Not in API yet. Not in the API (checked 19 Oct). The Admin screen Product Management → Taxes is built against this contract and shows "Waiting for the server" until it is live.

List of taxes per restaurant, each a percentage or a fixed amount (per item quantity or once per bill). GET (list, paginated, ?restaurant_id=), POST, GET/PATCH /taxes/{id}/. No hard delete: PATCH is_active=false. The Admin screen (Product Management → Taxes) is built and waits for this endpoint.

**Used by:** Product Management → Taxes; Category form → Taxes checkboxes

**Request body**

```json
{
  "restaurant": 3,
  "name": "CGST",
  "code": "CGST",
  "type": "percentage",
  "rate": "2.500",
  "amount": null,
  "fixed_basis": null,
  "channels": [
    "dine_in",
    "takeaway",
    "delivery"
  ],
  "reporting_code": "SAC 996331",
  "is_active": true
}
```

**Response 201**

```json
{
  "id": 7,
  "restaurant": 3,
  "name": "CGST",
  "code": "CGST",
  "type": "percentage",
  "rate": "2.500",
  "amount": null,
  "fixed_basis": null,
  "channels": [
    "dine_in",
    "takeaway",
    "delivery"
  ],
  "reporting_code": "SAC 996331",
  "is_active": true,
  "created_at": "2026-10-19T10:00:00Z",
  "updated_at": "2026-10-19T10:00:00Z"
}
```

**Notes**

- type: percentage | fixed. percentage: rate 0–100, up to 3 decimals; amount and fixed_basis null. fixed: amount (currency decimals) and fixed_basis per_unit | per_bill; rate null.
- Fixed example: { name: "Packing", type: "fixed", amount: "20.00", fixed_basis: "per_bill", channels: ["takeaway","delivery"] }.
- channels: order types the tax applies to (dine_in, takeaway, delivery); empty = all.
- name unique per restaurant (case-insensitive); code optional, unique when set. 400 with field errors otherwise.
- Permission: settings.manage (Managers and Admins). Hotel isolation via X-Hotel-Context.
- Later (not needed for launch): compounding, effective dates/versions, exempt/zero-rated treatment, prices that include tax.

### Category taxes (several per category) and order calculation

`PATCH /api/pos/api/menu-categories/{id}/` · **P1** · Change to existing

**Status:** Not in API yet. Not in the API: categories only have tax_rate. The category form already shows the tax checkboxes and sends tax_ids once the Tax master is live.

A category can have several taxes. The category form (built) sends tax_ids; the server stores them and calculates order tax from them. Replaces the single tax_rate for categories that have taxes.

**Used by:** Product Management → Categories (tax checkboxes), order totals, printed bills

**Request body**

```json
{
  "tax_ids": [
    7,
    8,
    12
  ]
}
```

**Response 200**

```json
{
  "id": 5,
  "name": "Beverages",
  "tax_ids": [
    7,
    8,
    12
  ],
  "taxes": [
    {
      "id": 7,
      "name": "CGST",
      "type": "percentage",
      "rate": "2.500"
    },
    {
      "id": 8,
      "name": "SGST",
      "type": "percentage",
      "rate": "2.500"
    },
    {
      "id": 12,
      "name": "Bottle deposit",
      "type": "fixed",
      "amount": "10.00",
      "fixed_basis": "per_unit"
    }
  ],
  "tax_rate": "5.00"
}
```

**Notes**

- Accept tax_ids on POST and PATCH; return tax_ids and taxes (summary) on GET. Reject ids from another restaurant (400). Sending tax_ids: [] explicitly = no tax (clears tax_rate to 0). A PATCH without tax_ids leaves the category's taxes and tax_rate unchanged (the POS omits it when editing a single-rate category without ticking taxes).
- tax_rate becomes read-only for categories with taxes: the sum of their percentage taxes, so older screens keep showing a sensible rate. Categories that have never had tax_ids keep using tax_rate as today.
- Order calculation per line: each percentage tax = line amount after discount × rate (taxes are not calculated on other taxes); fixed per_unit = amount × quantity; fixed per_bill = once per order (only if the order has an item from a category with that tax). Respect channels against the order type.
- A bill discount is split across the lines before tax and lowers only the percentage taxes; fixed taxes stay. See "Apply a bill discount" for the rule and a worked example.
- Round each tax amount to the currency decimals. Return each tax separately on the order (tax_breakdown, see Order line tax snapshot) and keep tax_amount = their total.
- Changes apply to new items; settled bills keep the taxes they were charged.

### Tax profiles

`POST /api/pos/api/tax-profiles/` · **P2** · New endpoint

**Status:** Not in API yet

Reusable sets of taxes (e.g. Standard Food Tax, Alcoholic Beverage Tax, Zero-rated) assigned to categories and products.

**Used by:** Product Management → Tax Profiles, Category form, Product form → Taxes

**Request body**

```json
{
  "name": "Premium Beverage",
  "description": "VAT + local beverage tax + bottle fee",
  "prices_include_tax": false,
  "taxes": [
    {
      "tax_id": 1,
      "sequence": 1
    },
    {
      "tax_id": 7,
      "sequence": 2
    },
    {
      "tax_id": 9,
      "sequence": 3
    }
  ],
  "exemption_reason": "",
  "is_active": true
}
```

**Response 201**

```json
{
  "id": 4,
  "name": "Premium Beverage",
  "prices_include_tax": false,
  "taxes": [
    {
      "tax_id": 1,
      "code": "VAT",
      "sequence": 1
    },
    {
      "tax_id": 7,
      "code": "LBT",
      "sequence": 2
    },
    {
      "tax_id": 9,
      "code": "ENV",
      "sequence": 3
    }
  ],
  "used_by": {
    "categories": 1,
    "products": 12
  }
}
```

**Notes**

- prices_include_tax true: tax is extracted from the selling price (never added again); false: added on top.
- GET /tax-profiles/{id}/preview/?price=100&quantity=2&channel=dine_in returns the calculated tax lines for the form preview.

### Category defaults and subcategories

`PATCH /api/pos/api/menu-categories/{id}/` · **P2** · Change to existing

**Status:** Not in API yet

Default tax profile and preparation station per category, and parent for subcategories. Replaces the single tax_rate field over time (keep it until migrated).

**Used by:** Product Management → Categories

**Request body**

```json
{
  "default_tax_profile": 1,
  "default_prep_station": 2,
  "parent": null,
  "icon": "coffee"
}
```

**Response 200**

```json
{
  "id": 5,
  "name": "Hot Beverages",
  "default_tax_profile": {
    "id": 1,
    "name": "Standard Food Tax"
  },
  "default_prep_station": {
    "id": 2,
    "name": "Bar"
  },
  "parent": null,
  "children": [
    14,
    15
  ],
  "tax_rate": "5.00"
}
```

**Notes**

- Changing defaults affects new orders only; open orders keep their line snapshots (see Order tax snapshot).

### Order line tax and discount snapshot

`GET /api/pos/api/orders/{id}/` · **P1** · Change to existing

**Status:** Not in API yet

Store on each order line the price, tax profile, each tax component and discount used, so finalized bills never change when products or taxes change, and History/Reports/printed bills show real tax components.

**Used by:** History, Reports → Tax summary, printed bills, refunds

**Request body:** none

**Response 200**

```json
{
  "id": 9812,
  "tax_breakdown": [
    {
      "code": "VAT",
      "name": "VAT",
      "rate": "10.00",
      "taxable": "150.00",
      "amount": "15.00"
    },
    {
      "code": "ENV",
      "name": "Environmental Fee",
      "basis": "unit",
      "amount": "0.40"
    }
  ],
  "items": [
    {
      "id": 2,
      "menu_item": 44,
      "menu_item_name": "Premium Beverage",
      "quantity": 2,
      "unit_price": "25.00",
      "prices_include_tax": false,
      "discountable": false,
      "discount_amount": "0.00",
      "modifiers": [
        {
          "id": 3,
          "name": "Large",
          "price": "5.00"
        }
      ],
      "tax_lines": [
        {
          "code": "VAT",
          "rate": "10.00",
          "base": "60.00",
          "amount": "6.00"
        },
        {
          "code": "LBT",
          "rate": "5.00",
          "base": "66.00",
          "amount": "3.30"
        },
        {
          "code": "ENV",
          "basis": "unit",
          "amount": "0.40"
        }
      ]
    }
  ]
}
```

**Notes**

- Snapshot is fixed when the order is completed; refunds and voids reuse it.

### Variants, modifiers and add-ons

`POST /api/pos/api/modifier-groups/` · **P2** · New endpoint

**Status:** Not in API yet

Modifier groups (Size, Milk, Doneness, Add-ons) with min/max selection, linked to products. Order item create accepts the chosen modifiers.

**Used by:** Product Management → Modifiers and Add-ons; order popup (choose options)

**Request body**

```json
{
  "name": "Milk",
  "required": false,
  "min_select": 0,
  "max_select": 1,
  "options": [
    {
      "name": "Regular",
      "price": "0.00",
      "sku": "",
      "is_available": true,
      "is_discountable": true,
      "tax_profile": null,
      "prep_station": null
    },
    {
      "name": "Oat",
      "price": "40.00",
      "sku": "MILK-OAT",
      "is_available": true,
      "is_discountable": false,
      "tax_profile": null,
      "prep_station": null
    }
  ],
  "menu_items": [
    31,
    32
  ]
}
```

**Response 201**

```json
{
  "id": 3,
  "name": "Milk",
  "min_select": 0,
  "max_select": 1,
  "options": [
    {
      "id": 11,
      "name": "Regular",
      "price": "0.00"
    },
    {
      "id": 12,
      "name": "Oat",
      "price": "40.00"
    }
  ],
  "menu_items": [
    31,
    32
  ]
}
```

**Notes**

- POST /order-items/ accepts "modifiers": [{ "option_id": 12, "quantity": 1 }]; server validates min/max and availability and stores name/price/tax per option.
- Options do not inherit the parent's tax or discount settings unless set.

### Combos and meal deals

`POST /api/pos/api/combos/` · **P3** · New endpoint

**Status:** Not in API yet

Bundles with a fixed price or component prices, price allocation for tax/reporting, substitutions and paid upgrades.

**Used by:** Product Management → Combos and Meal Deals; order popup

**Request body**

```json
{
  "name": "Burger Meal",
  "category": 6,
  "pricing": "fixed",
  "price": "399.00",
  "allocation": "proportional_to_component_price",
  "components": [
    {
      "name": "Burger",
      "menu_items": [
        51,
        52
      ],
      "default_item": 51,
      "quantity": 1
    },
    {
      "name": "Side",
      "menu_items": [
        60,
        61
      ],
      "default_item": 60,
      "quantity": 1,
      "upgrades": [
        {
          "menu_item": 61,
          "extra_price": "40.00"
        }
      ]
    },
    {
      "name": "Drink",
      "menu_items": [
        70,
        71,
        72
      ],
      "default_item": 70,
      "quantity": 1
    }
  ],
  "is_discountable": true
}
```

**Response 201**

```json
{
  "id": 8,
  "name": "Burger Meal",
  "pricing": "fixed",
  "price": "399.00",
  "components": 3
}
```

**Notes**

- allocation: proportional_to_component_price | fixed_shares; document the method used per jurisdiction.

### Scheduled and happy-hour prices

`POST /api/pos/api/price-schedules/` · **P3** · New endpoint

**Status:** Not in API yet

Future price changes with an effective date, and recurring promotional prices (happy hour).

**Used by:** Product form → Pricing

**Request body**

```json
{
  "name": "Happy hour",
  "menu_items": [
    70,
    71
  ],
  "kind": "recurring",
  "days": [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri"
  ],
  "start_time": "17:00",
  "end_time": "19:00",
  "adjustment": {
    "type": "percent",
    "value": "-30.00"
  },
  "channels": [
    "dine_in"
  ],
  "combinable_with_discounts": false
}
```

**Response 201**

```json
{
  "id": 2,
  "name": "Happy hour",
  "kind": "recurring",
  "is_active": true
}
```

**Notes**

- kind: once (effective_from date, replaces price) | recurring (days + times).

### Product availability rules

`PATCH /api/pos/api/menu-items/{id}/` · **P3** · Change to existing

**Status:** Not in API yet

Availability by day/time, channel and branch, temporary sold-out separate from deactivation, and scheduled activation.

**Used by:** Product form → Availability; Fine Dine menu (sold-out badge)

**Request body**

```json
{
  "sold_out_until": "2026-10-13T23:59:00+05:30",
  "availability": {
    "days": [
      "sat",
      "sun"
    ],
    "start_time": "08:00",
    "end_time": "12:00",
    "channels": [
      "dine_in",
      "takeaway"
    ]
  },
  "active_from": "2026-11-01",
  "active_to": "2027-01-31",
  "branches": [
    {
      "restaurant_id": 3,
      "is_available": true,
      "price": "280.00"
    },
    {
      "restaurant_id": 5,
      "is_available": false
    }
  ]
}
```

**Response 200**

```json
{
  "id": 31,
  "is_available": true,
  "is_sold_out": true,
  "is_available_now": false
}
```

**Notes**

- is_available stays "deactivated or not"; is_sold_out is temporary. The ordering menu should use is_available_now.

### Upload a product or category image

`POST /api/pos/api/menu-items/{id}/image/` · **P2** · New endpoint

**Status:** Not in API yet

Multipart upload (field "image", JPEG/PNG/WebP up to 2 MB). Same for /menu-categories/{id}/image/. Today only GET exists.

**Used by:** Product form, Category form

**Request headers**

```json
{
  "Content-Type": "multipart/form-data"
}
```

**Request body**

```json
"(multipart) image=<file>, image_alt_text=\"Paneer tikka on a plate\""
```

**Response 200**

```json
{
  "id": 31,
  "image_url": "https://cdn.example.com/menu/31.webp",
  "has_image": true
}
```

**Error 400**

```json
{
  "code": "invalid",
  "detail": "Use a JPEG, PNG or WebP image up to 2 MB."
}
```

### Product change history

`GET /api/pos/api/menu-items/{id}/history/` · **P2** · New endpoint

**Status:** Not in API yet

Who changed price, tax, discount eligibility, availability and other fields, with old and new values. Same for categories, taxes and tax profiles.

**Used by:** Product Management → Change History

**Request body:** none

**Response 200**

```json
{
  "results": [
    {
      "id": 801,
      "changed_at": "2026-10-13T09:00:00Z",
      "changed_by": {
        "id": 1,
        "name": "Admin User"
      },
      "changes": {
        "price": [
          "260.00",
          "280.00"
        ],
        "is_discountable": [
          true,
          false
        ]
      }
    }
  ]
}
```

### Safe delete and archive

`DELETE /api/pos/api/menu-items/{id}/` · **P2** · Change to existing

**Status:** Not in API yet

Refuse to delete products or categories that appear on any order (protect history); offer archive instead. Today the app only deactivates.

**Used by:** Product list → Delete / Archive

**Request body:** none

**Response 204**

(empty body)

**Error 409**

```json
{
  "code": "has_history",
  "detail": "This product is on 342 orders. Archive it instead.",
  "counts": {
    "orders": 342
  }
}
```

**Notes**

- POST /menu-items/{id}/archive/ hides it everywhere (including Product Management by default) but keeps it for History.

### Only authorised roles change products and taxes

`ALL /api/pos/api/menu-items/, /menu-categories/, /taxes/, /tax-profiles/` · **P1** · Rule for all endpoints

**Status:** Not in API yet

Create/update/delete on products, categories, taxes, profiles, modifiers and prices require settings.manage (cost price, tax and discount settings may need a stricter products.sensitive permission). Cashiers get 403 even through the API.

**Used by:** Product Management (all sections)

**Request body:** none

**Response 403**

```json
{
  "code": "permission_denied",
  "detail": "Your role cannot change products.",
  "permission": "settings.manage"
}
```

## QR table ordering

### Mark orders and items that came from a table QR

`GET /api/pos/api/orders/?restaurant_id=3&status=pending` · **P1** · Change to existing

**Status:** Not in API yet

Required for QR ordering to work in the POS. Every order and order item carries source (pos | qr | third_party), also in the order list. The POS uses it for the QR badge, alerts and automatic KOTs; until it exists the POS cannot tell QR orders apart.

**Used by:** QR order watcher (alerts, auto-KOT, Accept / Reject), Fine Dine table cards (QR badge), Reports

**Request body:** none

**Response 200**

```json
{
  "results": [
    {
      "id": 9901,
      "order_number": "2610140",
      "table": 5,
      "table_number": "5",
      "status": "pending",
      "source": "qr",
      "customer_name": "Neha",
      "customer_phone": "+91 98765 43210",
      "items": [
        {
          "id": 7001,
          "menu_item": 31,
          "menu_item_name": "Paneer Tikka",
          "quantity": 1,
          "source": "qr",
          "round": 1,
          "kot_sent_at": null,
          "created_at": "2026-10-13T12:01:00Z"
        },
        {
          "id": 7002,
          "menu_item": 70,
          "menu_item_name": "Masala Chai",
          "quantity": 2,
          "source": "qr",
          "round": 1,
          "kot_sent_at": null,
          "created_at": "2026-10-13T12:01:00Z"
        }
      ]
    }
  ]
}
```

**Notes**

- Also needs kot_sent_at (or kot_number) per item — see "Send new items to the kitchen (KOT tracking)" — so a KOT is printed once even with several POS devices.
- Include items (with source and kot_sent_at) in the list response, or the POS must load each order.

### Guest places an order from the table QR

`POST /api/pos/public/orders/?api_key=XXX` · **P1** · Change to existing

**Status:** Not in API yet

Called by the guest app. Validates the table's QR code, that the table is in service, that QR ordering is on and the restaurant is open, and that items are available, using server prices and taxes. If the table already has an open order, the items are ADDED to it as a new round (one bill per table); otherwise a new order is created. Both are marked source = qr.

**Used by:** Guest app (guest.staydesko.com/ordering/table)

**Request headers**

```json
{
  "Idempotency-Key": "guest-device-uuid-1697190000"
}
```

**Request body**

```json
{
  "restaurant_id": 3,
  "table_id": 5,
  "code": "k7Fq9x",
  "customer_name": "Neha",
  "customer_phone": "+91 98765 43210",
  "notes": "No onion in anything please",
  "items": [
    {
      "menu_item": 31,
      "quantity": 1,
      "special_instructions": "Less spicy"
    },
    {
      "menu_item": 70,
      "quantity": 2,
      "special_instructions": ""
    }
  ]
}
```

**Response 201**

```json
{
  "order_number": "2610140",
  "order_id": 9901,
  "table_number": "5",
  "added_to_existing_order": false,
  "round": 1,
  "status": "pending",
  "accepted": false,
  "items": [
    {
      "id": 7001,
      "menu_item_name": "Paneer Tikka",
      "quantity": 1,
      "unit_price": "280.00"
    },
    {
      "id": 7002,
      "menu_item_name": "Masala Chai",
      "quantity": 2,
      "unit_price": "60.00"
    }
  ],
  "subtotal": "400.00",
  "tax_amount": "20.00",
  "total_amount": "420.00",
  "tracking_token": "trk_f3a9c2"
}
```

**Error 403**

```json
{
  "code": "invalid_table_code",
  "detail": "This QR code is no longer valid. Please ask the staff."
}
```

**Error 409**

```json
{
  "code": "qr_ordering_off",
  "detail": "Ordering from the table is not available right now."
}
```

**Error 409**

```json
{
  "code": "item_unavailable",
  "detail": "Paneer Tikka is sold out.",
  "items": [
    31
  ]
}
```

**Error 429**

```json
{
  "code": "too_many_orders",
  "detail": "Please wait a moment before ordering again."
}
```

**Notes**

- Prices, taxes and availability come from the server, never from the guest app.
- Limits against abuse: max quantity per line / per order, rate limit per table and per device, optional phone OTP.
- tracking_token lets the guest follow status without staff login (GET /pos/public/orders/{order_number}/status/?token=...).

### QR ordering settings (restaurant and table)

`PUT /api/pos/api/restaurants/{id}/qr-ordering/` · **P2** · New endpoint

**Status:** Not in API yet

Restaurant-wide on/off and mode (auto send to kitchen, or cashier accepts first), and per-table on/off. The POS keeps the mode per device today; the server should own it so all devices agree and the guest app can show the right message.

**Used by:** Tables & QR Codes → QR ordering; guest app

**Request body**

```json
{
  "enabled": true,
  "mode": "auto",
  "hours": {
    "start": "11:00",
    "end": "23:00"
  },
  "max_items_per_order": 30,
  "require_phone": true
}
```

**Response 200**

```json
{
  "restaurant_id": 3,
  "enabled": true,
  "mode": "auto",
  "updated_at": "2026-10-13T10:00:00Z"
}
```

**Notes**

- Per table: PATCH /api/pos/api/tables/{id}/ { "qr_ordering_enabled": false }.
- mode: auto | accept.

### Accept or reject QR items (accept mode)

`POST /api/pos/api/orders/{id}/qr/accept/` · **P2** · New endpoint

**Status:** Not in API yet

In accept mode QR items wait until a cashier accepts (marks them sent to the kitchen and returns them for the KOT) or rejects them (cancelled with a reason, guest sees "rejected"). Reject: POST /orders/{id}/qr/reject/ with the same item_ids and a reason.

**Used by:** QR order watcher → Accept & print KOT / Reject

**Request body**

```json
{
  "item_ids": [
    7001,
    7002
  ]
}
```

**Response 200**

```json
{
  "order_id": 9901,
  "status": "confirmed",
  "accepted_by": {
    "id": 42,
    "name": "Asha K"
  },
  "kot": {
    "kot_number": 3,
    "items": [
      {
        "id": 7001,
        "menu_item_name": "Paneer Tikka",
        "quantity": 1
      },
      {
        "id": 7002,
        "menu_item_name": "Masala Chai",
        "quantity": 2
      }
    ]
  }
}
```

**Error 409**

```json
{
  "code": "already_handled",
  "detail": "Another device already accepted these items."
}
```

**Notes**

- already_handled stops two counters from both printing the KOT.

### Table QR code: secret code and ordering link

`POST /api/pos/api/tables/{id}/generate_qr_code/` · **P2** · Change to existing

**Status:** Not in API yet

Document what the table fields hold: qr_code = a random per-table secret (at least 8 characters), qr_code_url = the full ordering link for the guest app. New tables get one automatically; generate_qr_code replaces it so printed copies of the old one stop working.

**Used by:** Tables & QR Codes (show, print, new QR code); Fine Dine Add Table

**Request body**

```json
{}
```

**Response 200**

```json
{
  "id": 5,
  "table_number": "5",
  "qr_code": "k7Fq9xWm",
  "qr_code_url": "https://guest.staydesko.com/ordering/table?hotel=7&restaurant=3&table=5&code=k7Fq9xWm&source=qr",
  "updated_at": "2026-10-13T10:05:00Z"
}
```

**Notes**

- Today the POS builds the link itself when qr_code_url is not an ordering link (env REACT_APP_GUEST_APP_URL).

### Guest ordering page (guest app)

`GET https://guest.staydesko.com/ordering/table?hotel=7&restaurant=3&table=5&code=k7Fq9xWm&source=qr` · **P1** · New endpoint

**Status:** Not in API yet

The page the QR opens, built in the guest app. Flow: validate table + code (GET /pos/public/tables/{id}/validate/) → show restaurant and table → menu with categories, dietary filters and sold-out items (GET /pos/public/restaurants/{id}/menu/) → cart with notes → name and phone → place order (POST /pos/public/orders/) → status screen (received, accepted, preparing, served) with "Add more items" for the next round.

**Used by:** Guests at the table

**Request body:** none

**Notes**

- Mobile first, works without an account; language follows the browser where translations exist.
- Shows prices with tax as the bill will (tax-inclusive or exclusive per restaurant).
- Payment stays at the counter for now; online payment can be added with the payment gateway endpoints.
- Clear messages for: invalid/old QR code, QR ordering off, restaurant closed, item sold out.

## Cash counters

The POS now asks Cashiers and Managers to open a cash counter after signing in, records the counter on each settlement, and closes it with a blind cash count at sign-out (optional; a counter left open stays on the cashier's name). It uses the accounting module's /cash-counters/ and /cash-register/ endpoints. These items are what the backend still needs.

### Link POS payments to the cashier's shift

`POST /api/pos/api/orders/{id}/settle/` · **P1** · Change to existing

**Status:** Not in API yet. OrderPayment has no shift link, only processed_by, so it is not certain that POS cash counts toward the cash_receipts of the cashier's shift.

Every POS payment, refund and cash tip belongs to the cashier's open shift. The POS sends cash_register (the open shift id) in the settle body; the server checks it is the caller's open shift, stores it on each payment and counts cash payments minus cash refunds into the shift's cash_receipts.

**Used by:** Complete Payment popup, Outstanding → Collect payment, Cash Counters (expected cash), shift reports

**Request body**

```json
{
  "expected_amount_due": "1242.00",
  "payments": [
    {
      "method": "cash",
      "amount": "1242.00",
      "amount_received": "1300.00",
      "change_returned": "58.00"
    }
  ],
  "cash_register": 311,
  "idempotency_key": "6f1d2c1e-8a8b-4c7e-9a55-3c2d6b2a9e10"
}
```

**Error 409**

```json
{
  "code": "no_open_shift",
  "detail": "Open a cash counter before taking payments."
}
```

**Notes**

- Add OrderPayment.cash_register (nullable foreign key) and return it on payments. When the body has no cash_register, use the caller's open shift.
- While the hotel has cash counters switched on, reject payments and refunds from a user with no open shift (409 no_open_shift). Room charge and Credit Pay take no cash but still belong to the shift for the payment split.
- A shift left open keeps collecting on the cashier's name until it is closed; never move payments to another shift automatically.
- Same for /order-payments/create_flexible_payment/ and outstanding collections (/outstanding-orders/{id}/resolve/).

### Open and close rules for cash counter shifts

`POST /api/accounting/cash-register/open/` · **P1** · Change to existing

**Status:** Behaviour to confirm. In the API. The schema documents open and close with the generic shift fields; the POS sends the same body as the hotel's accounting screen (counter_id, shift_template_id). Please document these bodies in the schema and confirm the checks below.

The POS opens a shift after sign-in with the counter, shift name and opening cash, and closes it with the counted cash.

**Used by:** Open your cash counter screen, Sign out → Count cash & close, Cash Counters → Close

**Request body**

```json
{
  "counter_id": 3,
  "shift_template_id": 1,
  "opening_balance": "2000.00",
  "notes": ""
}
```

**Response 201**

```json
{
  "id": 311,
  "status": "open",
  "counter_ref": 3,
  "counter_snapshot": "Counter 1",
  "cashier": 42,
  "cashier_name": "Asha K",
  "opening_balance": "2000.00",
  "opened_at": "2026-10-20T03:30:00Z"
}
```

**Error 409**

```json
{
  "code": "counter_in_use",
  "detail": "Counter 1 is open by Ravi K."
}
```

**Notes**

- Without counter_id the server answers "Select a cash counter: …" (seen 20 Oct when the POS sent counter_ref). The free-text counter field is only for hotels with no counters set up.
- One open shift per counter and one per user (409 counter_in_use / already_open). open_defaults?counter_id= returns opening_balance (the cash left at the last close), shift_template ({ id, … }) and carried_from.
- DELETE /cash-counters/{id}/ deactivates the counter (the hotel screen calls it "deactivate"); the POS uses PATCH is_active instead.
- Close: POST /cash-register/{id}/close/ with { "physical_count": "15480.00", "notes": "" } returns the shift with calculated_closing and variance. Cashiers count blind: the POS hides the expected cash from them; ideally the server returns calculated_closing and variance only to Managers and Administrators.
- Managers and Administrators may close another user's shift; record closed_by.
- Counters are hotel-wide today. Add an optional restaurant on CashCounter so each outlet sees only its own counters.
- Cashiers need read access to /cash-counters/ and to /cash-register/ (their own shift, and which counters are in use).

### Cash in and cash out during a shift

`POST /api/accounting/cash-register/{id}/movements/` · **P2** · New endpoint

**Status:** Not in API yet. cash_payments is only one total.

Record money put into or taken out of the drawer during a shift, with a reason, so the expected cash stays right: petty expenses, supplier payments, tips paid out, cash moved to the safe.

**Used by:** Counter badge → Cash in / Cash out (planned), shift reports

**Request body**

```json
{
  "type": "out",
  "amount": "500.00",
  "reason": "supplier",
  "note": "Milk vendor",
  "approval_id": null
}
```

**Response 201**

```json
{
  "id": 91,
  "cash_register": 311,
  "type": "out",
  "amount": "500.00",
  "reason": "supplier",
  "note": "Milk vendor",
  "created_by": {
    "id": 42,
    "name": "Asha K"
  },
  "created_at": "2026-10-20T08:10:00Z"
}
```

**Notes**

- type: in | out. reason: petty_expense | supplier | tip_payout | safe_drop | float_top_up | other.
- cash_payments = the sum of out movements; add cash_in for in movements. GET on the same path lists them.
- Cash out above a limit needs a manager approval (approval_id).

### Shift report: payment split and activity

`GET /api/accounting/cash-register/{id}/` · **P2** · Change to existing

**Status:** Behaviour to confirm. totals is in the API (expected_cash, grand_total, by_method, as the hotel's accounting screen reads it) but not documented in the schema, and it is not certain it includes POS payments.

The shift report and the close screen show the shift's takings by payment method and the cash expected in the drawer. They need the POS payments linked to the shift (see "Link POS payments to the cashier's shift"), plus a few more figures.

**Used by:** Close counter, shift report (X and Z), Cash Counters → Open now and Recently closed

**Request body:** none

**Response 200**

```json
{
  "id": 311,
  "status": "open",
  "opening_balance": "2000.00",
  "totals": {
    "expected_cash": "15500.00",
    "grand_total": "57741.00",
    "by_method": [
      {
        "payment_method": "cash",
        "total": "13500.00",
        "count": 41
      },
      {
        "payment_method": "mobile_payment",
        "total": "29411.00",
        "count": 18
      },
      {
        "payment_method": "room_charge",
        "total": "12330.00",
        "count": 5
      }
    ],
    "cash_refunds": "0.00",
    "cash_tips": "850.00",
    "discounts": "1240.00",
    "voids": "560.00",
    "cancelled_bills": 2
  }
}
```

**Notes**

- In the API today: expected_cash (opening cash + cash taken − paid out), grand_total and by_method. Please document them in the schema (totals is typed as a string there).
- Wanted in addition: cash_refunds, cash_tips, discounts, voids and cancelled_bills.
- Same figures for an open shift (X report) and a closed one (Z report). The POS reloads the shift before closing and printing.

## Refunds

### Refund a paid bill (manager)

`POST /api/pos/api/orders/{id}/refund/` · **P1** · New endpoint

**Status:** Not in API yet. Checked against the live schema on 26 Oct 2026: there is no POS refund action, and `refunded_amount` on order payments is read-only, so the app cannot record a refund correctly on its own.

A Manager refunds all or part of a settled bill: the guest gets money back, the bill shows as refunded in History and Reports, and a cash refund comes out of the cashier's open counter so the expected cash stays right. Needs a new `bill.refund` permission (Manager and Administrator by default) or a manager approval for anyone else.

**Used by:** History → Bill details → Refund (planned)

**Request body**

```json
{
  "refunds": [
    {
      "payment_id": 5521,
      "amount": "500.00",
      "method": "cash",
      "reference": ""
    }
  ],
  "reason": "food_quality",
  "note": "Dal was cold, guest complained",
  "approval_id": null,
  "cash_register": 311,
  "idempotency_key": "6f0d1c1e-9a43-4f1b-9b57-1f3c2a8e7d10"
}
```

**Response 200**

```json
{
  "id": 9812,
  "status": "completed",
  "total_amount": "1242.01",
  "amount_paid": "1242.01",
  "refunded_total": "500.00",
  "refund": {
    "id": 77,
    "credit_note_number": "CN-2610-0004",
    "amount": "500.00",
    "reason": "food_quality",
    "note": "Dal was cold, guest complained",
    "refunded_by": {
      "id": 12,
      "name": "Meera S"
    },
    "approved_by": null,
    "created_at": "2026-10-26T14:05:00+05:30",
    "lines": [
      {
        "payment_id": 5521,
        "method": "cash",
        "amount": "500.00",
        "reference": ""
      }
    ]
  },
  "payments": [
    {
      "id": 5521,
      "method": "cash",
      "amount": "1000.00",
      "status": "partially_refunded",
      "refunded_amount": "500.00"
    },
    {
      "id": 5522,
      "method": "mobile_payment",
      "amount": "242.01",
      "status": "completed",
      "refunded_amount": "0.00"
    }
  ]
}
```

**Error 409**

```json
{
  "code": "not_refundable",
  "detail": "Only settled bills can be refunded. This bill is outstanding."
}
```

**Error 400**

```json
{
  "code": "amount_exceeds_paid",
  "detail": "Payment 5521 has 500.00 left to refund.",
  "fields": {
    "refunds[0].amount": ["At most 500.00."]
  }
}
```

**Notes**

- Only `completed` bills. Outstanding (Credit Pay) and cancelled bills are not refunded; the credit is written off or the order cancelled instead.
- Each line refunds one payment, at most its `amount − refunded_amount`. The server sets the payment's `refunded_amount` and status (`partially_refunded`, or `refunded` when nothing is left).
- When every payment is fully refunded the order moves to `refunded`; a partial refund keeps it `completed`. The invoice number stays; a credit note number is issued for the refund (GST needs one for India).
- reason: food_quality | wrong_order | service | overcharged | duplicate_payment | other. `note` is required for `other`.
- Cash refunds count against the cashier's open shift (`cash_register`) as `cash_refunds` in the shift totals (see "Shift report: payment split and activity"). The server rejects a cash refund when no shift is open.
- Room charge (Guest Visit) refunds reverse the charge on the guest folio. Card and UPI refunds record the reference of the refund made on the terminal or app.
- Tips are not refunded through this endpoint.
- Needs `bill.refund`, or an `approval_id` from "Manager approval" for that permission. Writes an audit event. Replays with the same `idempotency_key` return the first result instead of refunding twice.
