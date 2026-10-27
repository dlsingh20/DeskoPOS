# Fine Dine dashboard: backend requirements

The Fine Dine dashboard (`src/components/fineDine/`) works with the existing POS API for tables, orders, items, KOT printing and kitchen transfer. The features below are built in the UI but need server support before they can change data. Each one must run inside a single database transaction so a failure never leaves orders half-changed.

Checked against the API schema at `https://api.staydesko.com/swagger.json` on 2026-10-10.

## 1. Merge tables

The UI is in `MergeTableDialog.jsx`. To enable it, set `MERGE_SUPPORTED = true` and wire `onMerge` in `FineDineDashboard.jsx`.

`POST /api/pos/api/orders/merge/`

```json
{ "target_table_id": 12, "source_table_ids": [13, 14] }
```

- Move every non-cancelled item from the open orders on the source tables into the target table's open order. Create that order if the target has none.
- Keep quantity, unit price, special instructions, kitchen notes and item status.
- Recalculate subtotal, tax, service charge and total on the target order.
- Close the emptied source orders with a status that reports do **not** count as a customer cancellation (for example `merged`, linked to the target order). Then free the source tables.
- Reject the merge if a source order has payments, if the tables belong to different restaurants, or if fewer than two tables are given.
- Return the updated target order.

## 2. Move items between tables

The UI is in `MoveItemsDialog.jsx`. To enable it, set `MOVE_ITEMS_SUPPORTED = true` and wire `onMove` in `FineDineDashboard.jsx`.

`POST /api/pos/api/orders/{source_order_id}/move_items/`

```json
{
  "destination_table_id": 15,
  "items": [{ "order_item_id": 301, "quantity": 2 }]
}
```

- Partial quantities are allowed. Reduce the source line, and create or increase the matching line on the destination order.
- Create the destination order if the table has none.
- Validate that each quantity is between 1 and the line's quantity, and that the items belong to the source order.
- Recalculate both orders' totals. Close the source order if it ends up empty.
- Return both updated orders.

## 3. Third-party live orders (Zomato, Swiggy)

The UI is in `LiveOrdersView.jsx`, `OrderActionToolbar.jsx` and `services/ThirdPartyService.js`. Today the service reports "not configured" and never shows invented orders.

- `GET /api/pos/api/third-party/integrations/?restaurant_id=X` returns `{ configured, platforms: [{ key, connected }] }`.
- `GET /api/pos/api/third-party/orders/?restaurant_id=X&status=live` returns incoming orders: platform, external id, items, total, status and received time.
- `POST /api/pos/api/third-party/orders/{id}/accept/` and `/reject/` accept or reject an incoming order. Accepting should create a normal POS order so it flows into the kitchen.

## 4. KOT tracking (recommended)

There is no record of which items have already been sent to the kitchen, so:

- "Send to kitchen" only applies while an order is `pending`. After that, items added to a `confirmed` order rely on staff printing a KOT for the new items. The popup's "Add & print KOT" does this automatically.
- "Print KOT" on a table card reprints the whole order.

Suggested change: add `kot_sent_at` (or a `kot_number`) to `OrderItem`, plus `POST /orders/{id}/send_kot/`. The endpoint would mark unsent items as sent and return only those items, so reprints and duplicates can be avoided on the server.

## 5. Other observations

- `TableService.updateTableStatus` called `PATCH /tables/{id}/status/`, but the API exposes `PATCH /tables/{id}/update_status/`. This bug existed before the Fine Dine work and was fixed with the payment settlement change.
- `GET /orders/` is paginated. The dashboard follows `next` links (`OrderService.getOpenOrders`). Older screens that call `getOrders` only read the first page.
- Menu items have no variants or add-ons in the API, so the popup supports only quantity and a free-text kitchen note per item.

## 6. Payment settlement (Complete Payment popup)

The popup is in `src/components/payment/SettlePaymentModal.jsx`, and the settlement steps are in `src/services/SettlementService.js` (tests: `SettlementService.test.js`). It uses only existing endpoints:

| Method in popup | Server call | `OrderPayment.method` |
|---|---|---|
| Cash | `POST order-payments/create_flexible_payment/` | `cash` |
| Card (credit / debit) | same | `credit_card` / `debit_card` |
| UPI, Paytm, PhonePe | same; the app name is saved in `notes` | `mobile_payment` |
| Guest Visit | `POST orders/{id}/charge_to_room/` (in-house hotel guest) | `room_charge` |
| Credit Pay | `PATCH orders/{id}/update_status/` → `outstanding`, plus `POST outstanding-orders/` if the server hasn't created a record | none (no money received) |

After a payment, the order is re-read and closed (`completed`) only if the server shows nothing left to pay. The table is marked `available` only when no other order is open on it.

### Gaps the backend should close

- **Tips:** `OrderPayment` has no tip fields, so tip amount, tip method and waiter are written into the payment `notes` as text (for example `Tip 50.00 via Cash for Ravi K (staff #12)`). For Credit Pay they go into the outstanding record's `internal_notes`. Add `tip_amount`, `tip_method` and `tip_staff` (FK to user) to `OrderPayment`, or add a `Tip` model, so tips can be reported and reconciled.
- **Cash received / change:** also stored only in `notes`. Add `amount_received` and `change_returned` to `OrderPayment`.
- **Idempotency:** the frontend avoids double payments by re-reading the amount due before paying and by blocking repeat clicks. Two terminals settling at the same moment could still both pay. Accept an `Idempotency-Key` header on `create_flexible_payment`, or reject payments that exceed the remaining balance on the server.
- **Settle in one call:** a single `POST orders/{id}/settle/` that records the payment, completes the order and frees the table in one transaction would remove the multi-step sequence from the client.
- **Payment gateways:** there is no card-terminal, UPI QR, Paytm or PhonePe gateway integration for POS orders. These methods are recorded manually with a transaction reference, and staff must tick a confirmation box. If you connect a gateway, add an initiate/status endpoint so the popup can wait for `completed` before closing.
- **Waiter list:** loaded from `GET /api/auth/users/`. If a POS login can't read that list, the waiter dropdown is disabled. A POS-scoped `GET /api/pos/api/staff/?role=waiter` would be better.
- **Fixed in this change:** `TableService.updateTableStatus` now calls the correct `PATCH tables/{id}/update_status/` path (see section 5).

## 7. Bill discount

The UI is in `src/components/discount/` (`DiscountLine`, `DiscountDialog`), and the logic is in `src/services/DiscountService.js` (tests: `DiscountService.test.js`). A "Disc:" line appears in the Fine Dine order popup and in the Complete Payment popup, and applies a **percent** or **fixed** discount to an open bill.

It uses the existing `PATCH /api/pos/api/orders/{id}/` with `discount_amount` and `notes`:

- A percent discount is taken on the food `subtotal`, before service charge and tax. It is rounded to 2 decimals and saved as an amount.
- A reason is required: Regular customer, Staff, Complaint / service recovery, Manager approval, Promotion / offer, or Other with free text.
- The type, percent, reason, operator and time are saved as one line in `notes`, for example:
  `[Disc] 10% = 120.00 | Reason: Regular customer | By: Nushrath | At: 2026-10-11T10:00:00.000Z`
  The History bill panel reads this line.
- Optional cap: `REACT_APP_MAX_DISCOUNT_PERCENT=20`. It is off when not set.
- Safety checks:
  - The order must be open.
  - The subtotal must not have changed since the dialog opened.
  - The discount can't exceed the subtotal.
  - After saving, the order is re-read. The previous discount is restored if the server didn't save the amount, didn't recalculate the total, or the new total is below what has already been paid.
- If items change after a percent discount, the bill shows a warning with **Re-apply** or **Keep amount**. Settlement is blocked until one is chosen.

### Gaps the backend should close

- **Discount fields:** `Order` stores only `discount_amount`. Add `discount_type` (percent/fixed), `discount_percent`, `discount_reason`, `discounted_by` (FK to user) and `discounted_at`. Then the server can recalculate a percent discount when items change, and reports don't need to parse notes.
- **Tax base:** confirm that tax and service charge are calculated on the subtotal after the discount, which is the GST rule for discounts shown on the invoice. The UI shows whatever the server returns.
- **Permissions:** there is no manager PIN or discount permission. Add a role-based limit, e.g. a maximum percent per role, and enforce it on the server.
- **Item-level discounts:** not supported by `OrderItem`. They would need `discount_amount` on `OrderItem`.

## 8. Bill and KOT print formats

Settings are at **Settings → Bill & KOT formats** (`/settings/printing`, `src/components/settings/PrintSettingsView.jsx`). Each device saves them for each restaurant in `localStorage` (`PrintSettingsService`).

| Format | Bill | KOT |
|---|---|---|
| `thermal80` | 80 mm roll; Item / Qty / Rate / Amt columns | Large table number and items |
| `thermal58` | 58 mm roll; item name, then `qty x rate = amount` | Same, narrower |
| `sheet` | A4 or US Letter invoice with item table and signature line | A5 or Half Letter ticket with big text |

Other settings:

- **Bill header:** name, address, phone and footer.
- **Tax & invoice:** see below.
- **Options:** KOT copies (1 to 3) and auto-print after settlement (off by default).

Templates are in `src/utils/printTemplates.js` (tests: `printTemplates.test.js`). The same HTML goes to browser printing (a hidden frame, so pop-ups aren't needed) and to the companion app.

Where printing happens:

- **Print bill** in the Fine Dine order popup.
- **Print receipt** after settling, or automatically if auto-print is on.
- **Reprint bill** in History, marked DUPLICATE.
- Every KOT print.

Bills are always printed from a fresh read of the order.

### Countries, tax labels and regional format

The bill is country neutral. Tax wording comes from a **country tax profile** (`src/utils/taxProfiles.js`):

- India (GST)
- UAE and Saudi Arabia (VAT)
- UK and EU (VAT)
- Australia, New Zealand and Singapore (GST)
- Malaysia (SST)
- Canada (GST/HST)
- US (sales tax)
- Other / custom

The first time a restaurant's print settings are opened, the profile is chosen from the hotel's `country`. A profile is only a starting point and fills in editable fields:

- **Tax registration label and number:** for example GSTIN, TRN, VAT No., ABN or Tax ID. India's GSTIN format is checked; other countries only get a basic check on characters and length.
- **Licence label and number:** for example FSSAI Lic. No, Trade Licence or CR No.
- **Titles:** one with a tax registration (e.g. TAX INVOICE, VAT RECEIPT) and one without (e.g. RECEIPT, BILL).
- **Tax on the bill:** one line (e.g. VAT, Sales Tax), or split into named components by share (e.g. CGST 50% + SGST 50%). Split components always add up exactly to the server's `tax_amount`.
- **Sheet paper size:** A4 or US Letter. US and Canada default to Letter.

Money and dates follow the hotel settings (`src/utils/regionalFormat.js`):

- Currency code and decimals: 0 for JPY, 3 for KWD.
- Number and date locale.
- Time zone.

The currency code is printed with the grand total, e.g. `GRAND TOTAL (AED)`. Symbols are left out because many receipt printers can't print them. Font fallbacks cover non-Latin item names (Arabic, CJK and others).

Device settings saved before profiles existed (`gstin`, `fssai`, `splitTax`) are migrated automatically as the India profile.

### Gaps the backend / product design should close

- **Restaurant-level print and tax settings:** settings live on each device, so a new terminal starts from the country defaults. Add a `print_settings` JSON field on `Restaurant` (or an endpoint) so all devices share the header, tax labels and formats. Keep the format choice overridable per device.
- **Tax configuration per country:** the planned product tax design should provide:
  - tax registration and licence numbers on `Restaurant` or `Hotel`
  - tax rates and components per item or order (for example CGST/SGST/IGST, VAT rates, US state/county sales tax, Canadian GST/PST/HST)
  - tax-inclusive vs tax-exclusive pricing
  - item codes where required (HSN/SAC)

  Today only `tax_amount` is stored, so rates are not printed and splits are by share.
- **E-invoicing / fiscal requirements:** some countries require a QR code or fiscal device signature on receipts. Examples: Saudi Arabia (ZATCA Phase 1/2 QR), India e-invoice IRN for B2B, and fiscal printers in parts of the EU and Latin America. These need server-side signing and a QR on the bill. They aren't implemented.
- **Hotel locale and language:** the locale comes from `hotel.locale` / `hotel.language` if present, otherwise from the currency, then the device. Add an explicit locale to the hotel settings. Printed labels (Item, Qty, Rate, Subtotal, …) are English only; translating them needs the app's i18n work.
- **Right-to-left layouts:** Arabic and Hebrew text prints with the correct glyphs, but the bill layout stays left to right.
- **Invoice numbering:** the bill number is `order_number`. If a separate, gap-free invoice series per financial year is needed, the server must issue it at settlement.
- **Print audit:** reprints are marked DUPLICATE on paper only. Recording prints with `POST /orders/{id}/print_log/` would allow counting reprints.
