/**
 * HISTORY module: pure bill classification, filtering and summary logic.
 *
 * Bill status, payment status and collection status are kept separate:
 *  - billStatus       operational state from Order.status (completed / outstanding / cancelled / refunded)
 *  - payments         OrderPayment rows grouped by their own status (completed / pending / failed / refunded)
 *  - collectionStatus whether the money for the bill has been collected (paid, unpaid, partially paid, ...)
 *
 * Accounting rules (see docs/HISTORY_MODULE.md):
 *  - Only bills that are completed or outstanding are "billable". Cancelled and refunded bills are counted
 *    but never added to Total, Tax or collection cards.
 *  - Collected = OrderPayment rows with status "completed", except method "pay_later" (no money received).
 *    Guest Visit (room_charge) counts as collected: the amount is settled to the hotel room folio.
 *  - Balance = bill total - collected, never negative.
 *  - Pending Collection = balance of billable bills that are still open for collection.
 *  - Total = Cash + Card + UPI + Guest Visit + Other + Pending Collection + Written off (- overpayment),
 *    which is checked by reconcileSummary().
 */

export const CLOSED_ORDER_STATUSES = ['completed', 'outstanding', 'cancelled', 'refunded'];
const BILLABLE_STATUSES = ['completed', 'outstanding'];
const EPSILON = 0.005;

export const money = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Payment methods                                                     */
/* ------------------------------------------------------------------ */

/** Summary-card bucket for each OrderPayment.method */
export const PAYMENT_BUCKETS = {
  cash: 'cash',
  credit_card: 'card',
  debit_card: 'card',
  mobile_payment: 'upi',
  room_charge: 'guestVisit',
  gift_card: 'other',
  loyalty_points: 'other',
  bank_transfer: 'other',
  pay_later: 'credit',
};

const METHOD_LABELS = {
  cash: 'Cash',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  mobile_payment: 'UPI',
  room_charge: 'Guest Visit',
  gift_card: 'Gift Card',
  loyalty_points: 'Loyalty Points',
  bank_transfer: 'Bank Transfer',
  pay_later: 'Credit Pay',
};

/** Filter options for the payment-method filter (keys match PAYMENT_BUCKETS values) */
export const PAYMENT_FILTERS = [
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card' },
  { key: 'upi', label: 'UPI / wallets' },
  { key: 'guestVisit', label: 'Guest Visit' },
  { key: 'credit', label: 'Credit Pay / unpaid' },
  { key: 'other', label: 'Other methods' },
];

/** The settlement popup writes "Paid via Paytm" into notes for mobile payments */
const CHANNEL_LABELS = { upi: 'UPI', paytm: 'Paytm', phonepe: 'PhonePe', gpay: 'Google Pay' };

/** Wallet / UPI app: the payment's `channel` field, or "Paid via X" in older payment notes */
export const getPaymentChannel = (payment) => {
  if (payment?.channel) return CHANNEL_LABELS[String(payment.channel).toLowerCase()] || payment.channel;
  const match = /Paid via ([A-Za-z]+)/.exec(payment?.notes || '');
  return match ? match[1] : null;
};

export const getPaymentLabel = (payment) => {
  if (payment?.method === 'mobile_payment') return getPaymentChannel(payment) || 'UPI';
  return METHOD_LABELS[payment?.method] || payment?.method || 'Unknown';
};

/** Payment reference without the trailing card digits being guessed: shown as recorded */
export const getPaymentReference = (payment) => payment?.transaction_id || '';

/* ------------------------------------------------------------------ */
/* Order types                                                         */
/* ------------------------------------------------------------------ */

export const BILL_TYPES = [
  { key: 'all', label: 'All Bills' },
  { key: 'dine_in', label: 'Dine In', types: ['dine_in'] },
  { key: 'takeaway', label: 'Takeaway', types: ['takeaway', 'pickup'] },
  { key: 'delivery', label: 'Delivery', types: ['delivery'] },
  { key: 'room_service', label: 'Room Service', types: ['room_service'] },
];

export const ORDER_TYPE_LABELS = {
  dine_in: 'Dine In',
  takeaway: 'Takeaway',
  pickup: 'Pickup',
  delivery: 'Delivery',
  room_service: 'Room Service',
};

/* ------------------------------------------------------------------ */
/* Bill classification                                                 */
/* ------------------------------------------------------------------ */

/** Display state of a bill: drives the status badge and the expanded banner */
export const BILL_STATES = {
  paid: { label: 'Completed', banner: 'Completed Bill', tone: 'green', pending: false },
  completed_pending: { label: 'Completed Pending', banner: 'Completed Pending Collection', tone: 'amber', pending: true },
  settlement_pending: { label: 'Payment Pending', banner: 'Payment Confirmation Pending', tone: 'blue', pending: true },
  credit_unpaid: { label: 'Credit Unpaid', banner: 'On Credit, Unpaid', tone: 'orange', pending: true },
  credit_partial: { label: 'Credit Part Paid', banner: 'On Credit, Partially Paid', tone: 'orange', pending: true },
  transferred_ar: { label: 'Transferred to AR', banner: 'Transferred to Accounts Receivable', tone: 'orange', pending: true },
  credit_settled: { label: 'Credit Settled', banner: 'Credit Bill Settled', tone: 'green', pending: false },
  written_off: { label: 'Written Off', banner: 'Balance Written Off', tone: 'gray', pending: false },
  cancelled: { label: 'Cancelled', banner: 'Cancelled Bill', tone: 'red', pending: false },
  refunded: { label: 'Refunded', banner: 'Refunded Bill', tone: 'purple', pending: false },
};

/** Labels for Pending Bills categories, so they are never merged into one */
export const PENDING_CATEGORY_LABELS = {
  completed_pending: 'Completed, pending collection',
  settlement_pending: 'Payment settlement pending',
  credit_unpaid: 'Unpaid (Credit Pay)',
  credit_partial: 'Partially paid',
  transferred_ar: 'Transferred to accounts receivable',
};

const OUTSTANDING_CLOSED = ['resolved', 'written_off'];
const WRITE_OFF_ACTIONS = ['complimentary', 'manager_writeoff'];

/** Latest timestamp among values (ISO strings), or null */
const latest = (values) => values.filter(Boolean).sort().pop() || null;

/**
 * When a bill was closed (settled, moved to credit, cancelled or refunded): the business date of a sale.
 * Uses closed_at / cancelled_at from the server; older orders fall back to the last completed payment
 * (completed bills), then the last update. Returns null when the order carries none of these
 * (e.g. the slim list entry of a cancelled order).
 */
export const getCloseTime = (order) => {
  if (!order) return null;
  if (order.closed_at) return order.closed_at;
  if (order.status === 'cancelled' && order.cancelled_at) return order.cancelled_at;
  if (order.status === 'completed') {
    const paid = latest((order.payments || [])
      .filter((p) => p.status === 'completed' && p.method !== 'pay_later')
      .map((p) => p.processed_at || p.created_at));
    if (paid) return paid;
  }
  return order.updated_at || null;
};

/**
 * Builds the view model for one closed order.
 * @param {Object} order Order from /orders/
 * @param {Object} [outstanding] Matching OutstandingOrder record, if any
 */
export const classifyBill = (order, outstanding = null) => {
  const total = round2(money(order.total_amount));
  const payments = Array.isArray(order.payments) ? order.payments : [];

  // Money received stays "paid" after a refund (DeskoPOS records refunded_amount); the refund is shown on its own
  const refundedAmount = (p) => (money(p.refunded_amount) > 0 ? money(p.refunded_amount) : (p.status === 'refunded' ? money(p.amount) : 0));
  const completedPayments = payments.filter((p) => p.method !== 'pay_later' && (p.status === 'completed'
    || p.status === 'partially_refunded' || (p.status === 'refunded' && money(p.refunded_amount) > 0)));
  const pendingPayments = payments.filter((p) => p.status === 'pending' && p.method !== 'pay_later');
  const refundedPayments = payments.filter((p) => p.status === 'refunded' || p.status === 'partially_refunded');

  const paid = round2(completedPayments.reduce((sum, p) => sum + money(p.amount), 0));
  const pendingConfirmation = round2(pendingPayments.reduce((sum, p) => sum + money(p.amount), 0));
  const refunded = round2(refundedPayments.reduce((sum, p) => sum + refundedAmount(p), 0));

  const collections = { cash: 0, card: 0, upi: 0, guestVisit: 0, other: 0 };
  completedPayments.forEach((p) => {
    const bucket = PAYMENT_BUCKETS[p.method] || 'other';
    if (collections[bucket] !== undefined) collections[bucket] = round2(collections[bucket] + money(p.amount));
  });

  const billStatus = order.status;
  const billable = BILLABLE_STATUSES.includes(billStatus);
  const rawBalance = billable ? round2(Math.max(0, total - paid)) : 0;
  const overpaid = billable ? round2(Math.max(0, paid - total)) : 0;

  let state;
  let balance = rawBalance;
  let writtenOff = 0;

  if (billStatus === 'cancelled') state = 'cancelled';
  else if (billStatus === 'refunded') state = 'refunded';
  else if (outstanding && OUTSTANDING_CLOSED.includes(outstanding.status) && rawBalance > EPSILON) {
    // The outstanding desk closed the balance without a POS payment on this order
    if (outstanding.status === 'written_off' || WRITE_OFF_ACTIONS.includes(outstanding.resolution_action)) {
      state = 'written_off';
      writtenOff = rawBalance;
    } else {
      state = 'credit_settled';
      // Resolved elsewhere (for example collected on the outstanding screen); not money in this report
      writtenOff = rawBalance;
    }
    balance = 0;
  } else if (rawBalance <= EPSILON) {
    state = billStatus === 'outstanding' ? 'credit_settled' : 'paid';
    balance = 0;
  } else if (pendingConfirmation > 0 && paid + pendingConfirmation >= total - EPSILON) state = 'settlement_pending';
  else if (outstanding?.status === 'transferred_ar') state = 'transferred_ar';
  else if (billStatus === 'outstanding') state = paid > EPSILON ? 'credit_partial' : 'credit_unpaid';
  else state = 'completed_pending';

  const items = Array.isArray(order.items) ? order.items : null;

  const closedAt = getCloseTime(order);

  return {
    id: order.id,
    order,
    outstanding,
    billNo: order.order_number || `#${order.id}`,
    billStatus,
    state,
    stateInfo: BILL_STATES[state],
    isPending: BILL_STATES[state].pending,
    billable,
    type: order.type,
    tableLabel: order.table_number || (order.table ? String(order.table) : ''),
    customerName: order.customer_name || outstanding?.customer_name || '',
    customerPhone: order.customer_phone || outstanding?.customer_phone || '',
    total,
    subtotal: round2(money(order.subtotal)),
    tax: round2(money(order.tax_amount)),
    discount: round2(money(order.discount_amount)),
    charges: round2(money(order.service_charge)),
    paid,
    pendingConfirmation,
    refunded,
    balance,
    writtenOff,
    overpaid,
    collections,
    payments,
    completedPayments,
    pendingPayments,
    refundedPayments,
    paymentBuckets: Array.from(new Set(
      [
        ...completedPayments.map((p) => PAYMENT_BUCKETS[p.method] || 'other'),
        ...pendingPayments.map((p) => PAYMENT_BUCKETS[p.method] || 'other'),
        ...(billStatus === 'outstanding' || payments.some((p) => p.method === 'pay_later') ? ['credit'] : []),
      ]
    )),
    items,
    orderTime: order.order_time || order.created_at || null,
    closedAt,
    serverId: order.server ?? null,
    settledById: completedPayments.length ? completedPayments[completedPayments.length - 1].processed_by ?? null : null,
  };
};

/** Short text for the Payment column, e.g. "Cash ₹1,000.00 + Paytm ₹2,661.00" */
export const describePayments = (bill, formatPrice) => {
  const parts = bill.completedPayments.map((p) => `${getPaymentLabel(p)} ${formatPrice(money(p.amount))}`);
  bill.pendingPayments.forEach((p) => parts.push(`${getPaymentLabel(p)} ${formatPrice(money(p.amount))} (pending)`));
  if (bill.balance > EPSILON && bill.billStatus === 'outstanding') parts.push(`Credit ${formatPrice(bill.balance)}`);
  if (!parts.length) {
    if (bill.billStatus === 'cancelled') return '—';
    if (bill.writtenOff > 0) return bill.state === 'written_off' ? 'Written off' : 'Settled on credit desk';
    return 'Unpaid';
  }
  return parts.join(' + ');
};

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

export const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const normalizeText = (value) => String(value || '').toLowerCase();
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

/** Search by bill number, customer name, mobile number, table or amount */
export const matchesSearch = (bill, query) => {
  const q = normalizeText(query).trim();
  if (!q) return true;

  const plain = q.replace(/^#/, '');
  if (normalizeText(bill.billNo).replace(/^#/, '').includes(plain)) return true;
  if (normalizeText(bill.customerName).includes(q)) return true;
  if (normalizeText(bill.tableLabel) === plain) return true;

  const qDigits = digitsOnly(q);
  if (qDigits.length >= 4 && digitsOnly(bill.customerPhone).includes(qDigits)) return true;

  // Amount: "3661", "3,661" or "3661.00" matches a total of 3661.00
  const amountText = q.replace(/[₹,\s]/g, '');
  if (/^\d+(\.\d{1,2})?$/.test(amountText)) {
    const amount = parseFloat(amountText);
    if (Math.abs(bill.total - amount) < EPSILON) return true;
    if (bill.total.toFixed(2).startsWith(amountText)) return true;
  }
  return false;
};

/**
 * Applies every filter of the active tab.
 * @param {Array} bills classified bills
 * @param {Object} filters { tab, status, billType, search, payment, table, operator }
 */
export const filterBills = (bills, filters) => {
  const billType = BILL_TYPES.find((t) => t.key === filters.billType);
  return bills.filter((bill) => {
    if (filters.tab === 'pending' && !bill.isPending) return false;
    if (filters.tab !== 'pending') {
      if (filters.status === 'completed' && !['completed', 'outstanding'].includes(bill.billStatus)) return false;
      if (filters.status === 'cancelled' && bill.billStatus !== 'cancelled') return false;
    }
    if (filters.tab === 'pending' && filters.pendingCategory && filters.pendingCategory !== 'all' && bill.state !== filters.pendingCategory) return false;
    if (billType?.types && !billType.types.includes(bill.type)) return false;
    if (filters.payment && filters.payment !== 'all' && !bill.paymentBuckets.includes(filters.payment)) return false;
    if (filters.table && filters.table !== 'all' && bill.tableLabel !== filters.table) return false;
    if (filters.operator && filters.operator !== 'all'
      && String(bill.serverId) !== filters.operator && String(bill.settledById) !== filters.operator) return false;
    return matchesSearch(bill, filters.search);
  });
};

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

/**
 * Summary cards for a filtered list. Every amount is counted once:
 * payments by their own method, outstanding balances once in pendingCollection.
 */
export const summarizeBills = (bills) => {
  const summary = {
    bills: bills.length,
    billable: 0,
    total: 0,
    cash: 0,
    card: 0,
    upi: 0,
    guestVisit: 0,
    other: 0,
    pendingCollection: 0,
    pendingConfirmation: 0,
    writtenOff: 0,
    overpaid: 0,
    tax: 0,
    discount: 0,
    charges: 0,
    cancelledCount: 0,
    cancelledValue: 0,
    refundedCount: 0,
    refundedValue: 0,
    partRefunds: 0,
  };

  bills.forEach((bill) => {
    if (bill.billStatus === 'cancelled') {
      summary.cancelledCount += 1;
      summary.cancelledValue += bill.total;
      return;
    }
    if (bill.billStatus === 'refunded') {
      summary.refundedCount += 1;
      summary.refundedValue += bill.total;
      return;
    }
    summary.billable += 1;
    summary.total += bill.total;
    summary.tax += bill.tax;
    summary.discount += bill.discount;
    summary.charges += bill.charges;
    Object.entries(bill.collections).forEach(([key, value]) => { summary[key] += value; });
    if (bill.isPending) summary.pendingCollection += bill.balance;
    if (bill.state === 'settlement_pending') summary.pendingConfirmation += bill.pendingConfirmation;
    summary.writtenOff += bill.writtenOff;
    summary.overpaid += bill.overpaid;
    summary.partRefunds += bill.refunded;
  });

  Object.keys(summary).forEach((key) => {
    if (!/count$|^bills$|^billable$/i.test(key)) summary[key] = round2(summary[key]);
  });
  return summary;
};

/** Difference between Total and the parts it should be made of (0 when the figures reconcile) */
export const reconcileSummary = (summary) => round2(
  summary.total
  - (summary.cash + summary.card + summary.upi + summary.guestVisit + summary.other
    + summary.pendingCollection + summary.writtenOff - summary.overpaid)
);

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

const ROUND_GAP_MS = 90 * 1000;

/**
 * Groups bill items into rounds: items saved within 90 seconds of each other
 * were sent together. Returns [{ round, items }].
 */
export const groupItemsByRound = (items = []) => {
  const sorted = [...items].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const rounds = [];
  let lastTime = null;
  sorted.forEach((item) => {
    const time = item.created_at ? new Date(item.created_at).getTime() : null;
    if (!rounds.length || (time !== null && lastTime !== null && time - lastTime > ROUND_GAP_MS)) {
      rounds.push({ round: rounds.length + 1, items: [] });
    }
    rounds[rounds.length - 1].items.push(item);
    if (time !== null) lastTime = time;
  });
  return rounds;
};

export const getItemLineAmount = (item) => {
  if (item.total_price !== undefined && item.total_price !== null && item.total_price !== '') return round2(money(item.total_price));
  return round2(money(item.unit_price ?? item.menu_item_price) * (Number(item.quantity) || 0));
};

/** Sum of non-cancelled item lines */
export const getItemsTotal = (items = []) => round2(
  items.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + getItemLineAmount(item), 0)
);

/* ------------------------------------------------------------------ */
/* Dates (restaurant time zone)                                        */
/* ------------------------------------------------------------------ */

const isValidZone = (timeZone) => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
};

export const resolveTimeZone = (timeZone) => (isValidZone(timeZone)
  ? timeZone
  : Intl.DateTimeFormat().resolvedOptions().timeZone);

/** Offset of timeZone from UTC at the given instant, in ms */
const zoneOffset = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant)).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - (instant - (instant % 1000));
};

/** "YYYY-MM-DD" + "HH:mm" in timeZone -> Date */
export const zonedToDate = (dateStr, timeStr = '00:00', timeZone) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const first = guess - zoneOffset(guess, timeZone);
  return new Date(guess - zoneOffset(first, timeZone));
};

/** Today's date in timeZone as "YYYY-MM-DD" */
export const todayInZone = (timeZone, now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

export const shiftDate = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

export const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'custom', label: 'Custom range' },
];

/**
 * Resolves a preset (or custom values) to { from: Date, to: Date, fromDate, toDate, label }.
 * `to` is exclusive.
 */
export const resolveDateRange = ({ preset, customFrom, customTo, customFromTime = '00:00', customToTime = '23:59' }, timeZone, now = new Date()) => {
  const today = todayInZone(timeZone, now);
  let fromDate = today;
  let toDate = today;
  switch (preset) {
    case 'yesterday': fromDate = shiftDate(today, -1); toDate = fromDate; break;
    case 'last7': fromDate = shiftDate(today, -6); break;
    case 'thisMonth': fromDate = `${today.slice(0, 8)}01`; break;
    case 'last30': fromDate = shiftDate(today, -29); break;
    case 'last90': fromDate = shiftDate(today, -89); break;
    case 'custom':
      fromDate = customFrom || today;
      toDate = customTo || fromDate;
      break;
    default: break;
  }
  if (toDate < fromDate) [fromDate, toDate] = [toDate, fromDate];

  if (preset === 'custom') {
    const from = zonedToDate(fromDate, customFromTime, timeZone);
    const to = new Date(zonedToDate(toDate, customToTime, timeZone).getTime() + 60 * 1000);
    return { from, to, fromDate, toDate, label: `${fromDate} ${customFromTime} to ${toDate} ${customToTime}` };
  }
  const from = zonedToDate(fromDate, '00:00', timeZone);
  const to = zonedToDate(shiftDate(toDate, 1), '00:00', timeZone);
  const presetLabel = DATE_PRESETS.find((p) => p.key === preset)?.label || 'Today';
  return { from, to, fromDate, toDate, label: fromDate === toDate ? `${presetLabel} (${fromDate})` : `${presetLabel} (${fromDate} to ${toDate})` };
};

/** "01 Oct 2026, 01:09 pm" in the restaurant time zone */
export const formatDateTime = (value, timeZone) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date).replace(/\b(AM|PM)\b/, (m) => m.toLowerCase());
};
