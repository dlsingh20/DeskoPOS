# Users and roles

## What the POS does today

**Users & Roles** (`/users`, Administrators only) lists POS staff and lets an Administrator:

- **Add users** as Manager, Cashier or Waiter.
- **Edit** a user's details, role and access.
- **Deactivate or reactivate** a user.
- **Send a password reset link** (email).
- **Delete** a user. This is allowed only for accounts that have never signed in, and needs a typed confirmation.

Hotel administrators are listed read-only. Other hotel staff (front desk, housekeeping, …) are not shown, so the POS can't change or delete their hotel accounts.

| Role | Signs in | Default access |
|---|---|---|
| Administrator (hotel `admin`) | yes | Everything, including Users & Roles |
| Manager | yes | All POS features, except Users & Roles |
| Cashier | yes | Orders, settle bills, print and reprint bills. Discounts up to 10% (`REACT_APP_CASHIER_DISCOUNT_LIMIT`). History for the current shift only (since the last cash counter close, today only). |
| Waiter | **no** | Server on orders and tip attribution. A waiter order console comes later. |

An Administrator can switch individual permissions on or off per user (Edit → Access). Users & Roles itself can't be granted.

| Permission | Code | Without it |
|---|---|---|
| `bill.settle` | `st` | Settle buttons hidden |
| `bill.reprint` | `rb` | No reprint in History |
| `discount.unlimited` | `du` | Above the limit needs **manager approval** |
| `payment.credit` | `cp` | Credit Pay needs **manager approval** |
| `order.void_items` | `vi` | Reducing or removing items already sent to the kitchen needs **manager approval** |
| `history.full` | `hf` | History limited to the current shift; Archive hidden |
| `history.export` | `hx` | No Excel export |
| `reports.view` | `rp` | Reports hidden |
| `settings.manage` | `sm` | Tables, Add Table and print settings hidden |

**Manager approval** works like this:

- A Manager or Administrator types their username and password on the same device.
- The app checks them with `POST /api/auth/token/` and `GET /api/auth/me/` on a separate HTTP client. The cashier stays signed in, and nothing is stored.
- The approver is recorded:
  - **Discounts:** in the discount line (`| Approved: <name>`).
  - **Credit Pay:** in the payment notes.
  - **Item voids:** in the order notes (`[Void] … | Approved: <name>`).

**Waiters:** they are created with a random password nobody knows. If a waiter does sign in, the POS shows "This account can't sign in to the POS".

Hotel users without a POS role keep working: hotel managers get Manager access and everyone else gets Cashier access. Assign a POS role to tighten this.

Code:

- `src/utils/posAccess.js`: roles, permissions and storage format (tests: `posAccess.test.js`)
- `src/context/AccessContext.jsx`: signed-in user, `can()`, the approval dialog, and route guards
- `src/services/UserService.js`
- `src/components/users/`

## How roles are stored (interim)

The server has no POS roles, so the POS role and any per-user changes are written to the user's profile `department`:

```
POS Manager
POS Cashier
POS Cashier [+rp,-rb]      (reports added, reprint removed)
POS Waiter
```

The hotel `role` is set to `manager` for POS Managers and `front_desk_agent` for Cashiers and Waiters.

> **Check this:** a POS Manager gets the hotel role `manager`, which may also give them manager rights in the hotel system. If that's not wanted, change `POS_ROLES.manager.hotelRole` in `posAccess.js`, or let the backend add POS roles (below).

## What the backend must add

1. **Enforce permissions on the server.** All of the above is enforced only in the app. Anyone with a valid token can call the API directly. Each POS endpoint must check the user's POS permissions:
   - discount amount against the user's limit
   - `charge_to_room` and outstanding (Credit Pay)
   - item quantity changes and deletes after the kitchen has the order
   - order list date ranges
   - reports
   - table and menu changes
2. **POS roles and permissions:**
   - Add `pos_role` (manager / cashier / waiter) to the user profile.
   - Store per-user permissions in a real table, e.g. the existing `UserPermission` (`module = "pos"`, `permission_key`), linked to the user.
   - Stop writing hotel roles for POS staff.
3. **Accounts that can't sign in.** Add `can_login = false` (or an unusable password) for waiters, and have `/auth/token/` reject them. Today they get a random password.
4. **Safe delete.**
   - Reject `DELETE /auth/users/{id}/` when the user has orders, payments, tips or audit records (`PROTECT` foreign keys), and return a clear error.
   - Prevent deleting or deactivating the last administrator.
5. **Manager approval endpoint.** Add `POST /api/pos/api/approvals/` with `{username, password or PIN, permission, order_id, details}`. It would check the approver's role on the server, store an approval record and return an approval id that the follow-up request must include. The current check works but is client-side only. A short **manager PIN** field (hashed) would make approvals faster at the counter.
6. **Audit log writes.** `/auth/audit-logs/` is read-only. POS should record:
   - user created, edited, deactivated or deleted
   - access changed
   - approvals, discounts, voids, Credit Pay and reprints
7. **Admin password reset.** There's no endpoint for an administrator to set a user's password. Today only the email reset link works, which needs an email address. Also add "must change password at next sign-in".
8. **Shift scope for cashiers.** History uses the hotel's last closed cash register as the start of the cashier's window. Cash registers should be per restaurant or terminal and linked to the cashier who opened them.
9. **Restaurant / outlet assignment.** Restrict users to specific restaurants.
10. **Session security** for shared counters: inactivity timeout, and quick PIN switching between users.
