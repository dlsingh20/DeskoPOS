# Tables & QR codes, and QR table ordering

## Tables & QR Codes console

Open **☰ → Tables & QR Codes** (`/tables`; the old `/table-management` link redirects here). It needs `settings.manage`, so it's for Managers and Administrators.

- **Tables:**
  - Add a table (number, seats, name, area, outdoor), or **add several** (prefix plus a range, e.g. P-1 … P-20; existing numbers are skipped).
  - Edit tables.
  - Take a table **out of order** and back in service. Tables are never deleted, so past bills keep their table.
- **QR codes:**
  - Every table shows its QR. New tables (including those added from Fine Dine's Add Table) get a code from the server.
  - **Show QR** gives a large QR and the link with a copy button.
  - **New QR code** replaces the table's secret, so printed copies of the old one stop working.
- **Print:** select tables, or print all, then choose a format:
  - **Table tent card** (A6, one per page)
  - **A4 sheet with 6 cards** (with cut lines)
  - **Stickers**: 60 mm squares, 12 per A4 page.
  
  Each card shows the restaurant name, table number, QR, your text and an optional footer. Printing goes through the browser's print dialog.
- **QR ordering settings** (saved on the device, like print settings):
  - **Mode:** send to the kitchen and print the KOT automatically (default), or have the cashier accept or reject first.
  - **"This device handles QR orders":** turn it on for exactly one device per restaurant, usually the counter with the kitchen printer. That device prints the KOTs and shows Accept / Reject. Other devices only show an alert.
  - **Sound** for new QR orders.

The QR opens the guest app: `REACT_APP_GUEST_APP_URL`, which defaults to `https://guest.staydesko.com` in production and `http://devguest.staydesko.com` otherwise. The path is `/ordering/table?hotel=…&restaurant=…&table=…&code=<table secret>&source=qr`. If the server's `qr_code_url` is an ordering link, it is used as is.

## QR orders in the POS

`src/components/qrOrders/QrOrderWatcher.jsx` runs on every POS screen. Every 15 seconds it looks for QR items that haven't been handled yet.

- **All devices:** an alert ("New QR order · Table 5") and a sound.
- **The handling device, auto mode:** prints the KOT for the new items (only those) and sends a pending order to the kitchen.
- **The handling device, accept mode:**
  - **Accept & print KOT:** prints the KOT and sends to the kitchen.
  - **Reject:** removes the QR items, or cancels the order if it contained only them.
- **Fine Dine:** the table card shows a **QR** badge. After that it's a normal order: edit, discount, settle.
- **App restarts:** items are remembered on the device so they don't alert twice. QR items older than 30 minutes are not printed when the app opens.

## What the backend and guest app must do

All of these are in `docs/MISSING_APIS.md` → "QR table ordering":

1. **Mark orders and items with `source = "qr"` (P1).** Until this exists, the POS cannot recognise QR orders and the watcher does nothing.
2. **The public order endpoint:**
   - validates the table code
   - adds the items to the table's open order (one bill per table) or creates a new one
   - uses server prices and limits abuse.
3. **The guest ordering page in the guest app:** validate the table, then menu, cart, place order, track status.
4. **Server-side settings and actions:**
   - QR settings (restaurant on/off and mode, per-table on/off)
   - accept / reject endpoints
   - KOT tracking (`kot_sent_at`), so each KOT prints once across devices.
5. **Document the QR fields:** `qr_code` is a secret per table, and `qr_code_url` is the ordering link.

Code:

- `src/components/tablesAdmin/TablesConsole.jsx`
- `src/utils/tableQr.js` (tests: `tableQr.test.js`)
- `src/services/TableService.js`: `patchTable`, `regenerateQrCode`, `ensureQrCode`
