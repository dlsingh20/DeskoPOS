/** Guest ordering page helpers: the cart, guest details and money. */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Same rule as the server: an optional +, then 7 to 15 digits, spaces or dashes, at least 7 digits */
export const PHONE_PATTERN = /^\+?[\d\s-]{7,15}$/;

export const validateGuest = ({ name = '', phone = '' }) => {
  const errors = {};
  if (!name.trim()) errors.name = 'Enter your name.';
  const p = phone.trim();
  if (!p) errors.phone = 'Enter your mobile number.';
  else if (!PHONE_PATTERN.test(p) || p.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid mobile number.';
  return errors;
};

export const MAX_QUANTITY = 20;

/** cart: { [itemId]: quantity } → lines with the item and line total, in menu order */
export const cartLines = (cart, categories) => {
  const lines = [];
  (categories || []).forEach((c) => c.items.forEach((item) => {
    const quantity = cart[item.id] || 0;
    if (quantity > 0) lines.push({ item, quantity, total: round2(parseFloat(item.price) * quantity) });
  }));
  return lines;
};

export const cartSummary = (cart, categories) => {
  const lines = cartLines(cart, categories);
  return {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    total: round2(lines.reduce((sum, l) => sum + l.total, 0)),
  };
};

export const setQuantity = (cart, itemId, quantity) => {
  const next = { ...cart };
  const q = Math.max(0, Math.min(MAX_QUANTITY, quantity));
  if (q) next[itemId] = q;
  else delete next[itemId];
  return next;
};

export const makeMoneyFormatter = ({ locale, code, decimals = 2 } = {}) => {
  let formatter;
  try {
    formatter = new Intl.NumberFormat(locale || 'en', { style: 'currency', currency: code || 'INR', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } catch (error) {
    formatter = new Intl.NumberFormat('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return (value) => formatter.format(Number(value) || 0);
};

/** What is added to the menu prices on the bill, for the note under the total */
export const billNote = ({ prices_include_tax: included, service_charge_rate: service }) => {
  const parts = [];
  if (service) parts.push(`${parseFloat(service)}% service charge`);
  if (!included) parts.push('taxes');
  if (!parts.length) return 'Prices include taxes.';
  const text = `${parts.join(' and ')} ${parts.length > 1 || !included ? 'are' : 'is'} added on the bill.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const newClientRef = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : ((r % 4) + 8)).toString(16);
  });
};
