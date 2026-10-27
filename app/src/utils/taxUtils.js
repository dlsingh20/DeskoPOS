/**
 * Tax master (Admin → Product Management → Taxes) and category taxes.
 *
 * A tax is either a percentage of the line amount or a fixed amount, charged per item quantity or
 * once per bill. A category can have several taxes; its products are taxed with all of them.
 * The server owns the real calculation (see docs/MISSING_APIS.md → "Tax master" and "Category
 * taxes"); previewTaxes() only shows staff what to expect.
 *
 * Preview rules (same as the server contract): percentage taxes are each calculated on the line
 * amount after discount (not on other taxes); fixed per-unit taxes are amount × quantity; fixed
 * per-bill taxes are charged once per bill.
 */

export const TAX_TYPES = [
  { key: 'percentage', label: 'Percentage' },
  { key: 'fixed', label: 'Fixed amount' },
];

export const FIXED_BASIS = [
  { key: 'per_unit', label: 'Per item quantity', hint: 'e.g. 10 per bottle: 3 bottles = 30' },
  { key: 'per_bill', label: 'Once per bill', hint: 'e.g. a packing charge of 20 per takeaway bill' },
];

export const TAX_CHANNELS = [
  { key: 'dine_in', label: 'Dine in' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'delivery', label: 'Delivery' },
];

export const EMPTY_TAX = {
  name: '',
  code: '',
  type: 'percentage',
  rate: '',
  amount: '',
  fixed_basis: 'per_unit',
  channels: ['dine_in', 'takeaway', 'delivery'],
  reporting_code: '',
  is_active: true,
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const taxToForm = (tax) => ({
  ...EMPTY_TAX,
  name: tax.name || '',
  code: tax.code || '',
  type: tax.type === 'fixed' ? 'fixed' : 'percentage',
  rate: tax.rate != null && tax.rate !== '' ? String(Number(tax.rate)) : '',
  amount: tax.amount != null && tax.amount !== '' ? String(Number(tax.amount)) : '',
  fixed_basis: tax.fixed_basis === 'per_bill' ? 'per_bill' : 'per_unit',
  channels: Array.isArray(tax.channels) && tax.channels.length ? tax.channels : EMPTY_TAX.channels,
  reporting_code: tax.reporting_code || '',
  is_active: tax.is_active !== false,
});

export const taxFormToPayload = (form, decimals = 2) => {
  const payload = {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    type: form.type,
    channels: form.channels,
    reporting_code: form.reporting_code.trim(),
    is_active: !!form.is_active,
  };
  if (form.type === 'percentage') {
    payload.rate = num(form.rate).toFixed(3);
    payload.amount = null;
    payload.fixed_basis = null;
  } else {
    payload.rate = null;
    payload.amount = num(form.amount).toFixed(decimals);
    payload.fixed_basis = form.fixed_basis;
  }
  return payload;
};

/** Field errors for the tax form */
export const validateTax = (form, { taxes = [], editingId = null, decimals = 2 } = {}) => {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Enter the tax name.';
  else if (name.length > 60) errors.name = 'Use at most 60 characters.';
  else if (taxes.some((t) => t.id !== editingId && String(t.name).trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'A tax with this name already exists.';
  }
  const code = form.code.trim();
  if (code && !/^[A-Za-z0-9_-]{1,20}$/.test(code)) errors.code = 'Use up to 20 letters, digits, - or _.';
  else if (code && taxes.some((t) => t.id !== editingId && String(t.code || '').toLowerCase() === code.toLowerCase())) {
    errors.code = 'Another tax uses this code.';
  }
  if (form.type === 'percentage') {
    const r = String(form.rate).trim();
    if (!r) errors.rate = 'Enter the percentage.';
    else if (!/^\d+(\.\d{1,3})?$/.test(r) || Number(r) > 100) errors.rate = 'Enter 0 to 100, up to 3 decimals.';
  } else {
    const a = String(form.amount).trim();
    const pattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;
    if (!a) errors.amount = 'Enter the amount.';
    else if (!pattern.test(a)) errors.amount = decimals > 0 ? `Enter a number with up to ${decimals} decimals.` : 'Enter a whole number.';
    if (!FIXED_BASIS.some((b) => b.key === form.fixed_basis)) errors.fixed_basis = 'Choose how the amount applies.';
  }
  if (!form.channels?.length) errors.channels = 'Choose at least one order type.';
  return errors;
};

/** "CGST 2.5%" / "Packing ₹20.00 per bill" */
export const describeTax = (tax, formatPrice = (v) => num(v).toFixed(2)) => {
  if (tax.type === 'fixed') {
    return `${tax.name} ${formatPrice(tax.amount)} ${tax.fixed_basis === 'per_bill' ? 'per bill' : 'per item'}`;
  }
  return `${tax.name} ${Number(tax.rate)}%`;
};

/** Category's tax ids, whatever shape the API returns (tax_ids or taxes[]) */
export const categoryTaxIds = (category) => {
  if (Array.isArray(category?.tax_ids)) return category.tax_ids.map(Number);
  if (Array.isArray(category?.taxes)) return category.taxes.map((t) => Number(typeof t === 'object' ? t.id : t));
  return [];
};

/** Taxes applied to a category, in the order of the tax list */
export const categoryTaxes = (category, taxes) => {
  const ids = new Set(categoryTaxIds(category));
  return taxes.filter((t) => ids.has(Number(t.id)));
};

/**
 * Preview of the taxes on one product line.
 * @param {number} price - unit price (tax-exclusive)
 * @param {number} quantity
 * @param {Array} taxes - applied taxes
 * @param {Object} opts - { channel, discount, formatPrice } discount = amount off this line; formatPrice for the labels
 * @returns {{ lines: Array<{id, label, amount}>, lineAmount, taxTotal, total, perBill }}
 */
export const previewTaxes = (price, quantity, taxes, { channel = 'dine_in', discount = 0, formatPrice } = {}) => {
  const lineAmount = round2(Math.max(0, num(price) * num(quantity) - num(discount)));
  const applicable = taxes.filter((t) => t.is_active !== false && (!t.channels || !t.channels.length || t.channels.includes(channel)));
  const lines = applicable.map((t) => {
    let amount;
    if (t.type === 'fixed') amount = t.fixed_basis === 'per_bill' ? num(t.amount) : num(t.amount) * num(quantity);
    else amount = (lineAmount * num(t.rate)) / 100;
    return { id: t.id, label: describeTax(t, formatPrice), amount: round2(amount), perBill: t.type === 'fixed' && t.fixed_basis === 'per_bill' };
  });
  const taxTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, lineAmount, taxTotal, total: round2(lineAmount + taxTotal) };
};

/** Short text for list columns: "CGST 2.5% + SGST 2.5%" or the legacy "5%" */
export const categoryTaxSummary = (category, taxes, formatPrice) => {
  const applied = categoryTaxes(category, taxes);
  if (applied.length) return applied.map((t) => describeTax(t, formatPrice)).join(' + ');
  return `${Number(category?.tax_rate || 0)}%`;
};
