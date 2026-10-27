# HISTORY module

The History tab (`/history`) has two sections: **Sales History** and **Pending Bills**. The tab is selected with `?tab=pending`, so switching doesn't reload the page.

Code:

- `src/components/history/`: `HistoryView`, `HistoryToolbar`, `HistorySummaryCards`, `BillsTable`, `BillDetails`, `exportHistory`
- `src/services/HistoryService.js`: read-only API calls
- `src/utils/historyUtils.js`: classification, filters, summary and dates (tests in `historyUtils.test.js`)
- `src/utils/xlsxWriter.js`: dependency-free `.xlsx` writer (tests in `xlsxWriter.test.js`)

The module only reads data. It never changes orders or payments.

## Data loaded

| Data | Endpoint | Notes |
|---|---|---|
| Bills | `GET /api/pos/api/orders/?restaurant_id&ordering=-order_time&date_from&date_to&page_size=100` | Follows `next`. Rows are re-filtered in the browser by restaurant, status (`completed`, `outstanding`, `cancelled`, `refunded`) and exact order time, in case the server ignores a filter. Paging stops once pages are older than the range. The limit is 50 pages (5,000 orders), after which a warning is shown. |
| Missing items/payments | `GET /orders/{id}/` | Only fetched if the list response leaves them out. |
| Credit records | `GET /api/pos/api/outstanding-orders/` | Tells resolved, written-off and AR-transferred credit bills apart. |
| Item categories | `GET menu-items/`, `GET menu-categories/` | Includes unavailable items, so old bills still show categories. |
| Operator names | `GET /api/auth/users/` (StaffService) | Falls back to `Staff #id`. |
| Shift indicator | `GET /api/accounting/cash-register/?ordering=-register_date` | Shows "Shift status unavailable" if the login can't read it. |
| Header operator name | `GET /api/auth/me/` | |

Dates use the hotel time zone (`hotelSettings.timezone`), falling back to the browser's. Sales History defaults to **Today**; Pending Bills defaults to **Last 30 days**. Both have Yesterday, Last 7 days, This month, Last 30 days, Last 90 days and a custom date + time range. A bill is in the range by the time it **closed** (settled, moved to Credit Pay, cancelled or refunded): `closed_at` from the server, or for older orders the last completed payment, then the last update. Orders up to 7 days older than the period are checked, so a table opened yesterday and settled today counts today.

## Status model

Bill status, payment status and collection status are kept separate.

| Bill state | Rule | Pending tab |
|---|---|---|
| Completed | order `completed`, nothing left to pay | no |
| Completed Pending | order `completed`, paid less than the total | yes |
| Payment Pending | a `pending` payment (for example card) would cover the balance | yes |
| Credit Unpaid | order `outstanding` (Credit Pay), nothing paid | yes |
| Credit Part Paid | order `outstanding`, part paid | yes |
| Transferred to AR | credit record status `transferred_ar` | yes |
| Credit Settled | credit bill fully paid, or its credit record `resolved` | no |
| Written Off | credit record `written_off`, or resolved as `complimentary` / `manager_writeoff` | no |
| Cancelled | order `cancelled` | no |
| Refunded | order `refunded` | no |

Status chips on Sales History: **All** shows every closed bill. **Completed** shows `completed` and `outstanding` bills, both of which are operationally closed. **Cancelled** shows `cancelled` bills. Refunded bills appear under All.

## Accounting rules

- **Collected** means `OrderPayment` rows with status `completed`, excluding method `pay_later`, which records no money.
- **Guest Visit** (`room_charge`) counts as settled for the POS, because the amount moved to the room folio. It is not pending collection.
- **Balance** = bill total − collected, never negative. Paying more than the total is reported as "overpaid".
- **Total** = sum of bill totals for completed and credit bills. Cancelled and refunded bills are counted on the Bills card, but not in Total, Tax or the payment cards. With the **Cancelled** chip, the card shows "Cancelled value" instead.
- **Cash / Card / UPI / Guest Visit**: completed payments by method:
  - Card = `credit_card` + `debit_card`.
  - UPI = `mobile_payment`, which covers UPI, Paytm and PhonePe. The app name comes from the payment notes ("Paid via Paytm").
  - Gift card, loyalty and bank transfer go to an **Other** card, which appears only when it is non-zero.
- **Pending Collection** = sum of balances of bills in a pending state.
- **Tax** = sum of `tax_amount` on completed and credit bills.
- **Check:** Total = Cash + Card + UPI + Guest Visit + Other + Pending Collection + Written off − Overpaid. The screen shows a red warning if this doesn't hold.
- Split payments are listed per method in the Payment column, e.g. `Cash ₹400.00 + Paytm ₹600.00`.

## Expanded bill

Clicking a row, or pressing Enter or Space on it, opens the bill below the row. The panel shows:

- A status banner whose colour and title follow the bill state, with the outstanding amount on the right.
- Operator, bill number, remaining amount and payment mode.
- Order type, table, customer, room, payment reference and timestamps.
- Items grouped into rounds. Items saved within 90 seconds of each other count as one round, labelled "ORDER n" when there is more than one round.
- Items Total and a bill breakdown: subtotal, discount, service charge, tax, grand total, paid, balance.
- Every payment row with its status, reference, time, operator and notes (tips, cash received).

Cancelled items are struck through and left out of Items Total. If Items Total doesn't equal the server subtotal, the difference is shown.

## Excel export

The export covers the current tab, filters and date range, with the same figures as the cards. It has 4 sheets:

- **Report Info:** date range, time zone, filters, generated time and operator, summary and reconciliation.
- **Bill Summary:** one row per bill.
- **Bill Items:** one row per item.
- **Payment Details:** one row per payment, plus credit records.

Amounts are numeric cells, so Excel sums match the cards.

## Configuration

- `REACT_APP_SUPPORT_PHONE` (optional) shows a support number in the header.

## Backend gaps

1. **No closed time on `Order`.** "Closed" uses the last completed payment time, or `updated_at`, which changes on any later edit. Add `closed_at` and `cancelled_at`.
2. **Cancellation details.** There is no cancellation reason or cancelling user. The panel shows `notes` when present. Add `cancel_reason` and `cancelled_by`.
3. **Refund amounts.** `partially_refunded` payments don't say how much was refunded. Add `refunded_amount`, or refund rows linked to the original payment.
4. **Item size, variants and add-ons.** These don't exist, so Size shows "—". Item-level discounts don't exist either.
5. **GST breakdown.** Only `tax_amount` is stored. Add CGST/SGST/IGST components to show a split.
6. **Item category.** `OrderItem` has no category. It is looked up from the current menu, so a deleted menu item shows "—". Snapshot `category_name` on `OrderItem`.
7. **Server-side history and summary.** All bills in the range are loaded into the browser. Add these, scoped to the restaurant and time zone:
   - `GET /orders/history/?from&to&status&type&search` with closed statuses only and proper date filters.
   - `GET /orders/history/summary/` returning the card totals.
8. **Filter support is undocumented.** The Swagger file lists only `search`, `ordering`, `page` and `page_size` for `/orders/`. The client re-filters to stay correct, but confirm that `restaurant_id`, `date_from`, `date_to` and `ordering=-order_time` work on the server, or loading will be slow.
9. **Shift link.** Bills aren't linked to a cash-register shift, so the indicator shows only the last closed shift. Add a `shift` FK on `Order` or `OrderPayment` to filter by shift.
