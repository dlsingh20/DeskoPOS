/**
 * Product Management: pure helpers for products (menu items) and categories.
 *
 * Phase 1 uses only fields the live API stores (MenuItem / MenuCategory). Fields such as SKU,
 * discount eligibility, tax profiles, modifiers and combos wait for the backend
 * (see docs/MISSING_APIS.md, "Products & taxes").
 */

/** Allergens shown as quick picks (EU's 14 major allergens plus peanuts); custom ones are allowed */
export const COMMON_ALLERGENS = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'nuts', 'soy', 'dairy',
  'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
];

export const DIETARY_FLAGS = [
  { key: 'is_vegetarian', label: 'Vegetarian', short: 'Veg' },
  { key: 'is_vegan', label: 'Vegan', short: 'Vegan' },
  { key: 'is_gluten_free', label: 'Gluten-free', short: 'GF' },
  { key: 'is_spicy', label: 'Spicy', short: 'Spicy' },
];

export const EMPTY_PRODUCT = {
  name: '',
  category: '',
  price: '',
  description: '',
  is_available: true,
  is_vegetarian: false,
  is_vegan: false,
  is_gluten_free: false,
  is_spicy: false,
  allergens: [],
  calories: '',
  preparation_time_minutes: '',
  kitchen_notes: '',
  sort_order: '',
  image_alt_text: '',
};

const str = (v) => (v === null || v === undefined ? '' : String(v));

/** Allergens arrive as a list, a JSON string or comma text: always return a clean lowercase list */
export const normalizeAllergens = (value) => {
  let list = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      list = text.startsWith('[') ? JSON.parse(text) : text.split(/[;,]/);
    } catch (error) {
      list = text.split(/[;,]/);
    }
  }
  if (!Array.isArray(list)) return [];
  // "No", "None", "-", "N/A" written in the allergens cell mean no allergens
  const NONE = new Set(['no', 'none', 'nil', 'n/a', 'na', '-', '0', 'false', 'nothing']);
  return Array.from(new Set(list.map((a) => String(a).trim().toLowerCase()).filter((a) => a && !NONE.has(a))));
};

/** API item -> form values */
export const productToForm = (item) => ({
  ...EMPTY_PRODUCT,
  name: str(item.name),
  category: item.category != null ? String(item.category) : '',
  price: item.price != null ? String(item.price) : '',
  description: str(item.description),
  is_available: item.is_available !== false,
  is_vegetarian: !!item.is_vegetarian,
  is_vegan: !!item.is_vegan,
  is_gluten_free: !!item.is_gluten_free,
  is_spicy: !!item.is_spicy,
  allergens: normalizeAllergens(item.allergens),
  calories: item.calories != null ? String(item.calories) : '',
  preparation_time_minutes: item.preparation_time_minutes != null ? String(item.preparation_time_minutes) : '',
  kitchen_notes: str(item.kitchen_notes),
  sort_order: item.sort_order != null ? String(item.sort_order) : '',
  image_alt_text: str(item.image_alt_text),
});

const intOrNull = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));

/** Form values -> API payload (MenuItemCreate / PATCH) */
export const formToPayload = (form, decimals = 2) => {
  const payload = {
    name: form.name.trim(),
    category: parseInt(form.category, 10),
    price: Number(form.price).toFixed(decimals),
    description: form.description.trim(),
    is_available: !!form.is_available,
    is_vegetarian: !!form.is_vegetarian,
    is_vegan: !!form.is_vegan,
    is_gluten_free: !!form.is_gluten_free,
    is_spicy: !!form.is_spicy,
    allergens: normalizeAllergens(form.allergens),
    kitchen_notes: form.kitchen_notes.trim(),
    image_alt_text: form.image_alt_text.trim(),
  };
  const calories = intOrNull(form.calories);
  const prep = intOrNull(form.preparation_time_minutes);
  const sort = intOrNull(form.sort_order);
  if (calories !== null) payload.calories = calories;
  if (prep !== null) payload.preparation_time_minutes = prep;
  if (sort !== null) payload.sort_order = sort;
  return payload;
};

/**
 * Field errors for a product form.
 * @param {Object} form
 * @param {Object} opts - { decimals, products (to catch duplicate names in a category), editingId }
 */
export const validateProduct = (form, { decimals = 2, products = [], editingId = null } = {}) => {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Enter the product name.';
  else if (name.length > 200) errors.name = 'Use at most 200 characters.';
  if (!form.category) errors.category = 'Choose a category.';

  const priceText = String(form.price).trim();
  const pricePattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!priceText) errors.price = 'Enter the selling price.';
  else if (!pricePattern.test(priceText)) {
    errors.price = decimals > 0 ? `Enter a number with up to ${decimals} decimal places.` : 'Enter a whole number.';
  }

  const intField = (key, label, max) => {
    const v = String(form[key] ?? '').trim();
    if (v === '') return;
    if (!/^\d+$/.test(v) || parseInt(v, 10) > max) errors[key] = `${label} must be a whole number up to ${max}.`;
  };
  intField('calories', 'Calories', 10000);
  intField('preparation_time_minutes', 'Preparation time', 600);
  intField('sort_order', 'Display order', 100000);

  if (form.is_vegan && !form.is_vegetarian) errors.is_vegetarian = 'A vegan product is also vegetarian.';

  if (name && form.category) {
    const clash = products.find((p) => p.id !== editingId
      && String(p.category) === String(form.category)
      && String(p.name || '').trim().toLowerCase() === name.toLowerCase());
    if (clash) errors.name = 'A product with this name already exists in the category.';
  }
  return errors;
};

/** Copy of a product for "Duplicate": new name, not yet saved */
export const duplicateForm = (item, products = []) => {
  const form = productToForm(item);
  const base = `${form.name} (copy)`;
  let name = base;
  let n = 2;
  const taken = new Set(products.filter((p) => String(p.category) === form.category).map((p) => String(p.name).toLowerCase()));
  while (taken.has(name.toLowerCase())) {
    name = `${form.name} (copy ${n})`;
    n += 1;
  }
  return { ...form, name };
};

/* ------------------------------------------------------------------ */
/* Listing                                                             */
/* ------------------------------------------------------------------ */

/**
 * @param {Array} products
 * @param {Object} f - { search, category, status ('all'|'available'|'unavailable'), dietary (flag key or 'all') }
 */
export const filterProducts = (products, f = {}) => {
  const q = String(f.search || '').trim().toLowerCase();
  return products.filter((p) => {
    if (f.category && f.category !== 'all' && String(p.category) !== String(f.category)) return false;
    if (f.status === 'available' && p.is_available === false) return false;
    if (f.status === 'unavailable' && p.is_available !== false) return false;
    if (f.dietary && f.dietary !== 'all' && !p[f.dietary]) return false;
    if (!q) return true;
    return [p.name, p.description, p.kitchen_notes, String(p.id)].some((v) => String(v || '').toLowerCase().includes(q));
  });
};

export const sortProducts = (products, { key = 'name', dir = 'asc' } = {}, categoryName = () => '') => {
  const value = (p) => {
    switch (key) {
      case 'price': return parseFloat(p.price) || 0;
      case 'category': return categoryName(p.category).toLowerCase();
      case 'updated': return new Date(p.updated_at || 0).getTime();
      case 'status': return p.is_available === false ? 1 : 0;
      default: return String(p.name || '').toLowerCase();
    }
  };
  return [...products].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp = typeof va === 'number' ? va - vb : va.localeCompare(vb, undefined, { numeric: true });
    return dir === 'desc' ? -cmp : cmp;
  });
};

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export const EMPTY_CATEGORY = { name: '', description: '', tax_rate: '', sort_order: '', is_available: true, menu: '' };

export const categoryToForm = (c) => ({
  name: str(c.name),
  description: str(c.description),
  tax_rate: c.tax_rate != null && c.tax_rate !== '' ? String(Number(c.tax_rate)) : '',
  sort_order: c.sort_order != null ? String(c.sort_order) : '',
  is_available: c.is_available !== false,
  menu: c.menu != null ? String(c.menu) : '',
});

export const validateCategory = (form, { categories = [], editingId = null } = {}) => {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Enter the category name.';
  else if (categories.some((c) => c.id !== editingId && String(c.name).trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'A category with this name already exists.';
  }
  const tax = String(form.tax_rate).trim();
  if (tax !== '' && (!/^\d+(\.\d{1,2})?$/.test(tax) || Number(tax) > 100)) errors.tax_rate = 'Enter a percentage from 0 to 100, up to 2 decimals.';
  const sort = String(form.sort_order).trim();
  if (sort !== '' && !/^\d+$/.test(sort)) errors.sort_order = 'Display order must be a whole number.';
  return errors;
};

export const categoryFormToPayload = (form) => {
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    is_available: !!form.is_available,
    tax_rate: String(form.tax_rate).trim() === '' ? '0.00' : Number(form.tax_rate).toFixed(2),
  };
  if (String(form.sort_order).trim() !== '') payload.sort_order = parseInt(form.sort_order, 10);
  if (form.menu) payload.menu = parseInt(form.menu, 10);
  return payload;
};

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Parses CSV (RFC 4180: quotes, escaped quotes, line breaks in quotes). Detects ; or tab delimiters. */
export const parseCsv = (text) => {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': (firstLine.match(/,/g) || []).length, ';': (firstLine.match(/;/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
  const [best, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delimiter = bestCount > 0 ? best : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
};

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Cells starting with = + - @ are prefixed so spreadsheets do not run them as formulas
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */

/** Columns of the export file and the import template (order matters for the template) */
export const PRODUCT_COLUMNS = [
  { key: 'id', label: 'ID', help: 'Leave EMPTY for new products. Only use the number from an export, to update that product. Not for your own codes or SKUs.' },
  { key: 'name', label: 'Name', help: 'Required.' },
  { key: 'category', label: 'Category', help: 'Required. Category name; new names are created on import if you choose.' },
  { key: 'price', label: 'Price', help: 'Required. Selling price, without currency symbol.' },
  { key: 'description', label: 'Description' },
  { key: 'available', label: 'Available', help: 'yes / no (default yes).' },
  { key: 'vegetarian', label: 'Vegetarian', help: 'yes / no' },
  { key: 'vegan', label: 'Vegan', help: 'yes / no' },
  { key: 'gluten_free', label: 'Gluten free', help: 'yes / no' },
  { key: 'spicy', label: 'Spicy', help: 'yes / no' },
  { key: 'allergens', label: 'Allergens', help: 'Separated by ; e.g. nuts; dairy. Leave empty (or write No) when there are none.' },
  { key: 'calories', label: 'Calories' },
  { key: 'prep_minutes', label: 'Prep minutes' },
  { key: 'kitchen_notes', label: 'Kitchen notes' },
  { key: 'sort_order', label: 'Display order' },
];

const yesNo = (v) => (v ? 'yes' : 'no');

export const productsToRows = (products, categoryName) => [
  PRODUCT_COLUMNS.map((c) => c.label),
  ...products.map((p) => [
    p.id, p.name, categoryName(p.category), p.price != null ? Number(p.price) : '', p.description || '',
    yesNo(p.is_available !== false), yesNo(p.is_vegetarian), yesNo(p.is_vegan), yesNo(p.is_gluten_free), yesNo(p.is_spicy),
    normalizeAllergens(p.allergens).join('; '), p.calories ?? '', p.preparation_time_minutes ?? '', p.kitchen_notes || '', p.sort_order ?? '',
  ]),
];

/**
 * Amount text from a file -> "1234.50": drops currency symbols, spaces and thousands separators;
 * "2,50" (decimal comma) becomes "2.50". Returns '' when nothing numeric is left.
 */
export const normalizeAmount = (text) => {
  let s = String(text ?? '').trim().replace(/[^\d.,-]/g, '');
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  return s;
};

const parseBool = (v, fallback) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return { value: fallback };
  if (['yes', 'y', 'true', '1', 'available', 'active'].includes(s)) return { value: true };
  if (['no', 'n', 'false', '0', 'unavailable', 'inactive'].includes(s)) return { value: false };
  return { error: `"${v}" is not yes or no` };
};

const headerKey = (h) => {
  const norm = String(h || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const aliases = {
    id: 'id', productid: 'id', name: 'name', productname: 'name', item: 'name', itemname: 'name',
    category: 'category', categoryname: 'category', price: 'price', sellingprice: 'price', description: 'description',
    available: 'available', active: 'available', status: 'available', vegetarian: 'vegetarian', veg: 'vegetarian',
    vegan: 'vegan', glutenfree: 'gluten_free', spicy: 'spicy', allergens: 'allergens', calories: 'calories',
    prepminutes: 'prep_minutes', preparationtime: 'prep_minutes', preptime: 'prep_minutes', kitchennotes: 'kitchen_notes',
    displayorder: 'sort_order', sortorder: 'sort_order',
  };
  return aliases[norm] || null;
};

/**
 * Plans an import without changing anything: one entry per data row.
 * Matching: by ID when present, otherwise by name within the category (case-insensitive).
 *
 * @param {Array<Array>} rows - parsed file, first row = headers
 * @param {Object} ctx - { products, categories, decimals, createCategories }
 * @returns {{ entries: Array, newCategories: string[], headerErrors: string[] }}
 */
export const planImport = (rows, { products = [], categories = [], decimals = 2, createCategories = false } = {}) => {
  if (!rows.length) return { entries: [], newCategories: [], headerErrors: ['The file is empty.'] };
  const keys = rows[0].map(headerKey);
  const headerErrors = ['name', 'category', 'price'].filter((k) => !keys.includes(k)).map((k) => `Missing column: ${PRODUCT_COLUMNS.find((c) => c.key === k).label}`);
  // A Reports export (e.g. Item-wise sales) has Qty / Amount / Share instead of Price
  const raw = rows[0].map((h) => String(h || '').trim().toLowerCase());
  if (headerErrors.length && (raw[0] === 'report' || ['qty', 'amount', 'share', 'bills', 'avg price'].some((h) => raw.includes(h)))) {
    return { entries: [], newCategories: [], headerErrors: ['This looks like a sales report, not a product list. Use Export (Excel or CSV) or the template to get an importable file'] };
  }
  if (headerErrors.length) return { entries: [], newCategories: [], headerErrors };

  const categoryByName = new Map(categories.map((c) => [String(c.name).trim().toLowerCase(), c]));
  const productById = new Map(products.map((p) => [String(p.id), p]));
  const newCategories = new Map();
  const seen = new Set();

  const entries = rows.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    const get = (k) => {
      const i = keys.indexOf(k);
      // Our exports prefix formula-like text with ' (spreadsheet safety); remove it again
      return i >= 0 ? String(cells[i] ?? '').trim().replace(/^'(?=[=+-@])/, '') : '';
    };
    const errors = [];
    const name = get('name');
    const categoryName = get('category');
    const rawPrice = get('price');
    const price = normalizeAmount(rawPrice);
    if (!name) errors.push('Name is empty');
    if (!categoryName) errors.push('Category is empty');
    const pricePattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;
    if (!rawPrice) errors.push('Price is empty');
    else if (!pricePattern.test(price)) errors.push(`Price "${rawPrice}" is not a valid amount`);

    const category = categoryByName.get(categoryName.toLowerCase());
    if (categoryName && !category) {
      // One new category per name, whatever the capitals; the first spelling wins
      if (createCategories) {
        if (!newCategories.has(categoryName.toLowerCase())) newCategories.set(categoryName.toLowerCase(), categoryName);
      } else errors.push(`Category "${categoryName}" does not exist`);
    }

    const flags = {};
    [['available', 'is_available', true], ['vegetarian', 'is_vegetarian', false], ['vegan', 'is_vegan', false],
      ['gluten_free', 'is_gluten_free', false], ['spicy', 'is_spicy', false]].forEach(([col, field, fallback]) => {
      const r = parseBool(get(col), fallback);
      if (r.error) errors.push(`${PRODUCT_COLUMNS.find((c) => c.key === col).label}: ${r.error}`);
      else flags[field] = r.value;
    });
    const ints = {};
    [['calories', 'calories'], ['prep_minutes', 'preparation_time_minutes'], ['sort_order', 'sort_order']].forEach(([col, field]) => {
      const v = get(col);
      if (v === '') return;
      if (!/^\d+$/.test(v)) errors.push(`${PRODUCT_COLUMNS.find((c) => c.key === col).label} "${v}" is not a whole number`);
      else ints[field] = parseInt(v, 10);
    });

    const warnings = [];
    let id = get('id');
    // IDs are the system's numeric product IDs from an export. People often type their own codes
    // (e.g. "W1") here: ignore those and match by name instead.
    if (id && !/^\d+$/.test(id)) {
      warnings.push(`ID "${id}" is not a product ID from an export, so it was ignored`);
      id = '';
    }
    let existing = null;
    if (id) {
      existing = productById.get(id);
      if (!existing) errors.push(`No product with ID ${id} (leave ID empty to add a new product)`);
    } else if (name && category) {
      existing = products.find((p) => String(p.category) === String(category.id) && String(p.name).trim().toLowerCase() === name.toLowerCase()) || null;
    }

    const dupKey = `${categoryName.toLowerCase()}|${name.toLowerCase()}`;
    if (name && categoryName && seen.has(dupKey)) errors.push('Same name and category appear more than once in the file');
    seen.add(dupKey);

    const payload = {
      name,
      price: price ? Number(price).toFixed(decimals) : '',
      description: get('description'),
      allergens: normalizeAllergens(get('allergens')),
      kitchen_notes: get('kitchen_notes'),
      ...flags,
      ...ints,
    };
    if (category) payload.category = category.id;

    let action = existing ? 'update' : 'create';
    if (errors.length) action = 'error';
    else if (existing) {
      const same = ['name', 'description', 'kitchen_notes', 'is_available', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'is_spicy']
        .every((k) => String(payload[k] ?? '') === String(existing[k] ?? (typeof payload[k] === 'boolean' ? false : '')))
        && Number(existing.price) === Number(payload.price)
        && String(existing.category) === String(payload.category)
        && normalizeAllergens(existing.allergens).join(',') === payload.allergens.join(',')
        && ['calories', 'preparation_time_minutes', 'sort_order'].every((k) => payload[k] === undefined || Number(existing[k]) === payload[k]);
      if (same) action = 'unchanged';
    }
    return { rowNumber, action, errors, warnings, name, categoryName, payload, existingId: existing?.id ?? null };
  });

  return { entries, newCategories: Array.from(newCategories.values()), headerErrors: [] };
};
