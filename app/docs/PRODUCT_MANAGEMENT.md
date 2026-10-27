# Product Management

Open **☰ → Product Management** (`/products`). It needs the `settings.manage` permission, which Managers and Administrators have by default and an Administrator can switch off per user. Cashiers never have it, and the page shows "No access".

## Phase 1 (built, on the live API)

| Section | What it does | API |
|---|---|---|
| **Products** | <ul><li>List with search (name, description, ID) and filters (category, availability, dietary).</li><li>Sort by name, category, price, availability or last update; 50 per page.</li><li>Row actions: Edit, Duplicate, Deactivate / Make available (switch in the row).</li><li>Bulk actions on selected products: make available or unavailable, move to a category, change price by % or a fixed amount, with a preview.</li></ul> | `GET/POST /menu-items/`, `PATCH /menu-items/{id}/` |
| **Product form** | <ul><li>Name, category, price (in the hotel currency's decimals) and description.</li><li>Available, plus vegetarian / vegan / gluten-free / spicy.</li><li>Allergens: the 14 common ones plus your own.</li><li>Preparation time, kitchen notes, calories, display order, image description.</li><li>Validation catches duplicate names in a category and vegan-but-not-vegetarian.</li></ul> | same |
| **Categories** | <ul><li>Add, edit and make inactive.</li><li>Fields: name, description, **tax rate %** (applies to all its products), display order.</li><li>Shows product counts.</li><li>Changing the tax warns that settled bills keep their tax.</li><li>The restaurant's first category creates its menu if there isn't one.</li></ul> | `GET/POST /menu-categories/`, `PATCH /menu-categories/{id}/`, `GET /menus/by_restaurant/`, `POST /menus/` |
| **Import / Export** | <ul><li>**Export:** Excel (Products and Categories sheets) or CSV.</li><li>**Template:** Excel with a help sheet.</li><li>**Import:** Excel or CSV, up to 2,000 rows. Each row is matched by ID, otherwise by name within its category.</li><li>The preview marks each row as new, update, no change or error. Missing categories can be created.</li><li>Nothing is saved until you confirm. Progress is shown, and you can download a problems file.</li></ul> | same, one request per product |

After every change the ordering menu (Fine Dine) is reloaded, so new prices and availability show straight away.

**Delete:** products are **deactivated** (unavailable), never deleted. This keeps History intact until the backend can refuse to delete products that are on orders.

Code:

- `src/components/products/`
- `src/services/ProductService.js`
- `src/utils/productUtils.js` (validation, CSV, import planning)
- `src/utils/xlsxReader.js` (Excel import, no dependency)
- Tests: `src/utils/productUtils.test.js`

## Phase 2 (waiting for the backend)

Specified with request and response JSON in `docs/MISSING_APIS.md` → "Products, taxes & pricing":

- **Discount eligibility per product (P1):** bill and line discounts calculated on eligible lines only, on the server.
- **Order line snapshots (P1):** tax and discount stored per line, so finalized bills never change.
- **Server-side permissions** for product and tax changes (P1).
- **More product fields:** SKU, barcode, display name, subcategory, product type, preparation station, unit, cost price, POS/online visibility, channel prices, min/max price, translations.
- **Tax master and Tax Profiles:** percentage or fixed, line/unit/order basis, compounding, channels, effective dates, zero-rated / exempt / out of scope.
- **Category defaults:** default tax profile, default station, subcategories.
- **Modifiers and add-ons; combos and meal deals.**
- **Pricing and availability:** scheduled and happy-hour prices; availability by day, time, channel and branch; temporary sold-out.
- **Housekeeping:** image upload, change history, safe delete / archive.

## Known limits

- **Availability:** one switch covers both "deactivated" and "temporarily sold out" until the backend adds sold-out.
- **Tax:** one rate per category. Products can't override it, and there is no inclusive pricing yet.
- **Bulk changes and imports** send one request per product. A failure affects only that product and is reported, and you can re-import the problems file.
- **Change history:** none until the history endpoint exists.
