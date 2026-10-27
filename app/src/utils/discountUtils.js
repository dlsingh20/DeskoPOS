/**
 * Pure bill-discount helpers shared by the discount service, print templates
 * and History. The API stores only discount_amount; the type, percent, reason
 * and operator live in one tagged line of the order notes.
 */
export const NOTE_TAG = '[Disc]';

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};
const TOLERANCE = 0.01;

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Discount details from the order notes, or null */
export const parseDiscountNote = (notes) => {
  const line = String(notes || '').split('\n').reverse().find((l) => l.trim().startsWith(NOTE_TAG));
  if (!line) return null;
  const percentMatch = /\[Disc\]\s+([\d.]+)%\s*=\s*([\d.]+)/.exec(line);
  const fixedMatch = /\[Disc\]\s+Fixed\s+([\d.]+)/.exec(line);
  const field = (name) => (new RegExp(`${name}:\\s*([^|]+)`).exec(line)?.[1] || '').trim();
  return {
    type: percentMatch ? 'percent' : 'fixed',
    percent: percentMatch ? num(percentMatch[1]) : null,
    amount: num(percentMatch ? percentMatch[2] : fixedMatch?.[1]),
    reason: field('Reason'),
    by: field('By'),
    approvedBy: field('Approved'),
    at: field('At') || null,
  };
};

/** A person field from the API: an object with a name, a name string, or an id */
export const personName = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return value.name || [value.first_name, value.last_name].filter(Boolean).join(' ') || value.username || '';
  if (typeof value === 'number') return `Staff #${value}`;
  return String(value);
};

/**
 * Current discount state of an order.
 * Uses the server's discount fields (discount_type, discount_percent, discount_reason, discounted_by,
 * discount_approved_by) when present; older orders fall back to the "[Disc]" line in the notes.
 * `stale`: an older percent discount no longer matches the subtotal (the server now re-derives
 * percent discounts itself, so this only applies to orders without discount_type).
 */
export const getDiscountInfo = (order) => {
  const amount = round2(num(order?.discount_amount));
  const legacy = parseDiscountNote(order?.notes);
  const serverType = order?.discount_type || null;

  const note = amount > 0 && (serverType || legacy) ? {
    type: serverType || legacy?.type || 'fixed',
    percent: serverType ? (order.discount_percent != null ? num(order.discount_percent) : null) : legacy?.percent ?? null,
    amount,
    reason: order?.discount_reason || legacy?.reason || '',
    by: personName(order?.discounted_by) || legacy?.by || '',
    approvedBy: personName(order?.discount_approved_by) || legacy?.approvedBy || '',
    at: legacy?.at || null,
  } : null;

  const info = { amount, note, type: amount > 0 ? (note?.type || 'fixed') : null, percent: null, stale: false, expectedAmount: amount };
  if (amount > 0 && note?.type === 'percent' && note.percent) {
    info.percent = note.percent;
    info.expectedAmount = round2((round2(num(order.subtotal)) * note.percent) / 100);
    info.stale = !serverType && Math.abs(info.expectedAmount - amount) > TOLERANCE;
  }
  return info;
};
