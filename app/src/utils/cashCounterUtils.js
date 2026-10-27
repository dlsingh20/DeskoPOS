/**
 * Cash counters and cashier shifts.
 *
 * Counters (Counter 1, Bar counter, …) are set up by an Administrator. After signing in, a user who
 * can settle bills opens a shift on a free counter; payments they take count toward that shift.
 * A shift left open at sign-out stays on the cashier's name until they (or a Manager) close it.
 *
 * Backend: /api/accounting/cash-counters/ and /api/accounting/cash-register/ (only reachable while
 * the hotel has cash counters switched on). See docs/MISSING_APIS.md → "Cash counters".
 */

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** Notes and coins for the optional count-by-denomination helper */
const DENOMINATIONS = {
  INR: [500, 200, 100, 50, 20, 10, 5, 2, 1],
  AED: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
  SAR: [500, 200, 100, 50, 20, 10, 5, 1],
  GBP: [50, 20, 10, 5, 2, 1],
  EUR: [500, 200, 100, 50, 20, 10, 5, 2, 1],
  USD: [100, 50, 20, 10, 5, 1],
};
export const denominationsFor = (currency) => DENOMINATIONS[String(currency || '').toUpperCase()] || DENOMINATIONS.USD;

/** Total of { [denomination]: count } plus loose coins / other cash */
export const denominationTotal = (counts = {}, other = 0) => round2(
  Object.entries(counts).reduce((sum, [value, count]) => sum + num(value) * Math.max(0, Math.floor(num(count))), 0) + num(other),
);

/** Over/short above this amount needs a reason from a Manager (REACT_APP_CASH_VARIANCE_LIMIT, default 0) */
export const VARIANCE_LIMIT = (() => {
  const value = parseFloat(process.env.REACT_APP_CASH_VARIANCE_LIMIT);
  return Number.isFinite(value) && value >= 0 ? value : 0;
})();

/** A shift still open after this many hours is flagged as left open */
export const STALE_SHIFT_HOURS = 14;

/**
 * Who has to open a counter:
 * - Cashiers and Managers who can settle bills must open one before using the POS.
 * - Administrators may skip it (setup work) but still need one to take payments.
 * - Anyone else never needs one.
 */
export const counterRequirement = (access) => {
  if (!access || !access.permissions?.has('bill.settle')) return { required: false, canSkip: false };
  if (access.role === 'administrator') return { required: false, canSkip: true };
  return { required: true, canSkip: false };
};

/** Managers and Administrators see the expected cash; cashiers count blind */
export const seesExpectedCash = (access) => ['manager', 'administrator'].includes(access?.role);

/** Only Administrators add, rename or remove counters */
export const canEditCounters = (access) => access?.role === 'administrator';

export const isOpenShift = (shift) => !!shift && shift.status === 'open';

export const shiftCounterId = (shift) => (shift?.counter_ref != null ? Number(shift.counter_ref) : null);

export const shiftCounterName = (shift, counters = []) => {
  const id = shiftCounterId(shift);
  const counter = id != null ? counters.find((c) => Number(c.id) === id) : null;
  return counter?.name || shift?.counter_snapshot || shift?.counter || (id != null ? `Counter #${id}` : 'Counter');
};

/**
 * Counters in use by someone else: Map(counterId → open shift).
 * One person per counter, so these can't be picked.
 */
export const busyCounters = (shifts = [], userId = null) => {
  const map = new Map();
  shifts.filter(isOpenShift).forEach((s) => {
    const id = shiftCounterId(s);
    if (id == null) return;
    if (userId != null && Number(s.cashier) === Number(userId)) return;
    map.set(id, s);
  });
  return map;
};

/** Active counters in display order */
export const sortCounters = (counters = []) => [...counters].sort(
  (a, b) => (num(a.sort_order) - num(b.sort_order)) || String(a.name).localeCompare(String(b.name)),
);

export const isStaleShift = (shift, now = new Date(), hours = STALE_SHIFT_HOURS) => {
  if (!isOpenShift(shift) || !shift.opened_at) return false;
  const opened = new Date(shift.opened_at).getTime();
  return Number.isFinite(opened) && now.getTime() - opened > hours * 3600 * 1000;
};

const hasNumber = (value) => value != null && value !== '' && Number.isFinite(parseFloat(value));

/** The shift's live takings: { expected_cash, grand_total, by_method: [{ payment_method, total, count }] } or null */
export const shiftTotals = (shift) => {
  let totals = shift?.totals;
  if (typeof totals === 'string') {
    try { totals = JSON.parse(totals); } catch (e) { totals = null; }
  }
  return totals && typeof totals === 'object' ? totals : null;
};

const SKIPPED_PAYMENT_STATUSES = ['failed', 'pending', 'cancelled', 'canceled', 'voided'];

/**
 * POS bill payments the shift's cashier took while the shift was open, by method.
 * The server's shift totals don't include POS payments yet, so the POS adds them itself.
 * `linked`: the server already ties payments to shifts (payments carry cash_register), so its
 * totals include them and nothing must be added.
 * @returns {{ byMethod: Array<{method, total, count}>, cash: number, linked: boolean }}
 */
export const summarizePosPayments = (payments = [], { cashierId, from, to = null }) => {
  const linked = payments.some((p) => p && Object.prototype.hasOwnProperty.call(p, 'cash_register'));
  const start = from ? new Date(from).getTime() : -Infinity;
  const end = to ? new Date(to).getTime() : Infinity;
  const map = new Map();
  payments.forEach((p) => {
    if (cashierId != null && Number(p.processed_by) !== Number(cashierId)) return;
    if (SKIPPED_PAYMENT_STATUSES.includes(String(p.status || '').toLowerCase())) return;
    const at = new Date(p.processed_at || p.created_at).getTime();
    if (!Number.isFinite(at) || at < start || at > end) return;
    const method = p.method || 'other';
    const line = map.get(method) || { method, total: 0, count: 0 };
    line.total = round2(line.total + num(p.amount) - num(p.refunded_amount));
    line.count += 1;
    map.set(method, line);
  });
  const byMethod = [...map.values()].sort((a, b) => b.total - a.total);
  return { byMethod, cash: map.get('cash')?.total || 0, linked };
};

/**
 * Money on a shift. The server's totals.expected_cash (opening cash + cash taken − paid out) wins;
 * otherwise calculated_closing; otherwise opening + cash received − cash paid out.
 * POS bill payments in shift.posTakings (see summarizePosPayments) are added on top while the
 * server doesn't count them.
 */
export const shiftFigures = (shift) => {
  const totals = shiftTotals(shift);
  const byMethod = (Array.isArray(totals?.by_method) ? totals.by_method : []).map((m) => ({
    method: m.payment_method || m.method || 'other',
    total: round2(num(m.total)),
    count: m.count != null ? Number(m.count) : null,
  }));
  const opening = round2(num(shift?.opening_balance));
  const paidOut = round2(num(shift?.cash_payments));
  const cashLine = byMethod.find((m) => m.method === 'cash');
  let expected;
  if (hasNumber(totals?.expected_cash)) expected = round2(num(totals.expected_cash));
  else if (hasNumber(shift?.calculated_closing)) expected = round2(num(shift.calculated_closing));
  let received;
  if (cashLine) received = cashLine.total;
  else if (expected != null) received = round2(expected - opening + paidOut);
  else received = round2(num(shift?.cash_receipts));
  if (expected == null) expected = round2(opening + received - paidOut);
  // POS bills the server's totals don't include yet
  const pos = shift?.posTakings && !shift.posTakings.linked ? shift.posTakings : null;
  if (pos) {
    received = round2(received + pos.cash);
    expected = round2(expected + pos.cash);
  }
  const counted = hasNumber(shift?.physical_count) ? round2(num(shift.physical_count)) : null;
  // The server's variance ignores POS cash it doesn't count yet
  const variance = hasNumber(shift?.variance) && counted != null && !pos
    ? round2(num(shift.variance))
    : (counted != null ? round2(counted - expected) : null);
  const serverGrand = hasNumber(totals?.grand_total) ? round2(num(totals.grand_total)) : null;
  const posGrand = pos ? round2(pos.byMethod.reduce((sum, m) => sum + m.total, 0)) : 0;
  const grandTotal = serverGrand != null || pos ? round2((serverGrand || 0) + posGrand) : null;
  return { opening, received, paidOut, expected, counted, variance, byMethod, grandTotal, posByMethod: pos ? pos.byMethod : [] };
};

/** "mobile_payment" → "Mobile payment" */
export const methodLabel = (method) => {
  const text = String(method || 'other').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** "Over 20.00" / "Short 20.00" / "Balanced" */
export const describeVariance = (variance, formatPrice = (v) => num(v).toFixed(2)) => {
  if (variance == null) return '—';
  if (Math.abs(variance) < 0.005) return 'Balanced';
  return `${variance > 0 ? 'Over' : 'Short'} ${formatPrice(Math.abs(variance))}`;
};

/** Amount field check: blank → error, up to `decimals` places, not negative */
export const validateAmount = (value, decimals = 2, { required = true } = {}) => {
  const text = String(value ?? '').trim();
  if (!text) return required ? 'Enter the amount.' : null;
  const pattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(text)) return decimals > 0 ? `Enter a number with up to ${decimals} decimals.` : 'Enter a whole number.';
  return null;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/**
 * 80 mm shift report. kind "X" = mid-shift (counter stays open), "Z" = at close.
 * showExpected false prints only what the cashier counted (blind close).
 */
export const buildShiftReportHtml = ({
  shift, kind = 'Z', counterName, hotelName = '', formatPrice = (v) => num(v).toFixed(2),
  formatTime = (v) => (v ? new Date(v).toLocaleString() : '—'), showExpected = true, printedBy = '',
}) => {
  const f = shiftFigures(shift);
  const row = (label, value, bold = false) => `<tr${bold ? ' class="b"' : ''}><td>${escapeHtml(label)}</td><td class="r">${escapeHtml(value)}</td></tr>`;
  const rows = [
    row('Counter', counterName),
    row('Cashier', shift?.cashier_name || '—'),
    shift?.shift ? row('Shift', shift.shift) : '',
    row('Opened', formatTime(shift?.opened_at)),
    kind === 'Z' ? row('Closed', formatTime(shift?.closed_at)) : row('Printed', formatTime(new Date().toISOString())),
  ].join('');
  const methodRow = (prefix) => (m) => row(`${prefix}${methodLabel(m.method)}${m.count != null ? ` (${m.count})` : ''}`, formatPrice(m.total));
  const takings = showExpected && (f.byMethod.length || f.posByMethod.length)
    ? `<table>${f.byMethod.map(methodRow('')).join('')}${f.posByMethod.map(methodRow('POS bills · ')).join('')}${f.grandTotal != null ? row('All methods', formatPrice(f.grandTotal), true) : ''}</table><hr>`
    : '';
  const money = [
    row('Opening cash', formatPrice(f.opening)),
    showExpected ? row('Cash received', formatPrice(f.received)) : '',
    showExpected ? row('Cash paid out', formatPrice(f.paidOut)) : '',
    showExpected ? row('Expected in drawer', formatPrice(f.expected), true) : '',
    f.counted != null ? row('Counted', formatPrice(f.counted), true) : '',
    showExpected && f.variance != null ? row('Difference', describeVariance(f.variance, formatPrice), true) : '',
  ].join('');
  const title = kind === 'Z' ? 'SHIFT CLOSE (Z REPORT)' : 'SHIFT REPORT (X)';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
@page { size: 80mm auto; margin: 4mm; }
body { font: 12px/1.4 monospace; color: #000; width: 72mm; margin: 0; }
h1 { font-size: 14px; text-align: center; margin: 0 0 2px; }
p { text-align: center; margin: 0 0 6px; }
table { width: 100%; border-collapse: collapse; margin: 6px 0; }
td { padding: 1px 0; vertical-align: top; } td.r { text-align: right; } tr.b td { font-weight: bold; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
</style></head><body>
${hotelName ? `<p>${escapeHtml(hotelName)}</p>` : ''}<h1>${title}</h1><hr>
<table>${rows}</table><hr>${takings}<table>${money}</table>
${shift?.notes ? `<hr><div>Notes: ${escapeHtml(shift.notes)}</div>` : ''}
<hr><table>${row('Closed by', shift?.closed_by_name || (kind === 'Z' ? '—' : 'Still open'))}${printedBy ? row('Printed by', printedBy) : ''}</table>
<p style="margin-top:14px">Cashier signature ____________</p>
</body></html>`;
};
