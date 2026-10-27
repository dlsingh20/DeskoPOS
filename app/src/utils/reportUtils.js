/**
 * Restaurant reports, computed from classified bills (utils/historyUtils.classifyBill).
 *
 * Every report is a pure function: compute(bills, ctx) -> { columns, rows, totals, kpis?, notes? }.
 * Using the same bill classification as History keeps both screens' figures identical.
 *
 * Column types: text, number, money, percent, datetime, date.
 */
import {
  BILL_TYPES,
  ORDER_TYPE_LABELS,
  getItemLineAmount,
  getPaymentLabel,
  matchesSearch,
  money,
  round2,
  shiftDate,
  todayInZone,
  zonedToDate,
} from './historyUtils';
import { getDiscountInfo, personName } from './discountUtils';
import { buildTaxLines } from './taxProfiles';

/* ------------------------------------------------------------------ */
/* Date ranges                                                         */
/* ------------------------------------------------------------------ */

export const REPORT_DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days (till yesterday)' },
  { key: 'last30', label: 'Last 30 days (till yesterday)' },
  { key: 'thisWeek', label: 'This week (Mon to today)' },
  { key: 'lastWeek', label: 'Last week (Mon to Sun)' },
  { key: 'thisMonth', label: 'This month (to today)' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'custom', label: 'Custom range' },
];

/** Day of week of a YYYY-MM-DD date, Monday = 0 */
const weekdayIndex = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

/**
 * @returns {{from: Date, to: Date, fromDate: string, toDate: string, label: string}} `to` is exclusive
 */
export const resolveReportRange = ({ preset, customFrom, customTo, customFromTime = '00:00', customToTime = '23:59' }, timeZone, now = new Date()) => {
  const today = todayInZone(timeZone, now);
  const yesterday = shiftDate(today, -1);
  let fromDate = today;
  let toDate = today;
  switch (preset) {
    case 'yesterday': fromDate = yesterday; toDate = yesterday; break;
    case 'last7': fromDate = shiftDate(yesterday, -6); toDate = yesterday; break;
    case 'last30': fromDate = shiftDate(yesterday, -29); toDate = yesterday; break;
    case 'thisWeek': fromDate = shiftDate(today, -weekdayIndex(today)); break;
    case 'lastWeek': {
      const thisMonday = shiftDate(today, -weekdayIndex(today));
      fromDate = shiftDate(thisMonday, -7);
      toDate = shiftDate(thisMonday, -1);
      break;
    }
    case 'thisMonth': fromDate = `${today.slice(0, 8)}01`; break;
    case 'lastMonth': {
      const firstThisMonth = `${today.slice(0, 8)}01`;
      toDate = shiftDate(firstThisMonth, -1);
      fromDate = `${toDate.slice(0, 8)}01`;
      break;
    }
    case 'custom':
      fromDate = customFrom || today;
      toDate = customTo || fromDate;
      break;
    default: break;
  }
  if (toDate < fromDate) [fromDate, toDate] = [toDate, fromDate];

  if (preset === 'custom') {
    return {
      from: zonedToDate(fromDate, customFromTime, timeZone),
      to: new Date(zonedToDate(toDate, customToTime, timeZone).getTime() + 60 * 1000),
      fromDate,
      toDate,
      label: `${fromDate} ${customFromTime} to ${toDate} ${customToTime}`,
    };
  }
  return {
    from: zonedToDate(fromDate, '00:00', timeZone),
    to: zonedToDate(shiftDate(toDate, 1), '00:00', timeZone),
    fromDate,
    toDate,
    label: fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`,
  };
};

/** "YYYY-MM-DD" of an instant in the restaurant's time zone */
export const dateInZone = (value, timeZone) => (value ? todayInZone(timeZone, new Date(value)) : '');

const hourInZone = (value, timeZone) => {
  if (!value) return null;
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  return parseInt(hour, 10) % 24;
};

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export const STATUS_OPTIONS = [
  { key: 'sales', label: 'Completed & credit (sales)' },
  { key: 'paid', label: 'Fully settled' },
  { key: 'pending', label: 'Pending collection' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'all', label: 'All bills' },
];

const statusMatches = (bill, status) => {
  switch (status) {
    case 'all': return true;
    case 'paid': return bill.billable && !bill.isPending;
    case 'pending': return bill.isPending;
    case 'cancelled': return bill.billStatus === 'cancelled';
    case 'refunded': return bill.billStatus === 'refunded';
    default: return bill.billable;
  }
};

/**
 * Bill-level filters shared by all reports.
 * @param {Object} f - { status, billType, payment, table, server, search }
 */
export const filterReportBills = (bills, f = {}) => {
  const billType = BILL_TYPES.find((t) => t.key === f.billType);
  return bills.filter((bill) => {
    if (f.status && !statusMatches(bill, f.status)) return false;
    if (billType?.types && !billType.types.includes(bill.type)) return false;
    if (f.payment && f.payment !== 'all' && !bill.paymentBuckets.includes(f.payment)) return false;
    if (f.table && f.table !== 'all' && bill.tableLabel !== f.table) return false;
    if (f.server && f.server !== 'all') {
      if (f.server === 'none' ? bill.serverId != null : String(bill.serverId) !== f.server) return false;
    }
    return matchesSearch(bill, f.search);
  });
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const sum = (list, fn) => round2(list.reduce((acc, x) => acc + (fn(x) || 0), 0));
const pct = (part, whole) => (whole ? round2((part / whole) * 100) : 0);

const billableItems = (bill) => (bill.items || []).filter((item) => item.status !== 'cancelled');
const itemQty = (item) => parseInt(item.quantity, 10) || 0;

/** Tip lines written by the payment popup: "Tip 50.00 via Cash for Ravi K (staff #12)" */
const TIP = /Tip ([\d.]+) via ([^|]+?)(?: for (.+?) \(staff #(\d+)\))?\s*(?:\||$)/g;
export const parseTips = (notes) => {
  const tips = [];
  let match;
  TIP.lastIndex = 0;
  while ((match = TIP.exec(String(notes || ''))) !== null) {
    tips.push({ amount: money(match[1]), method: match[2].trim(), staffName: match[3] || '', staffId: match[4] || null });
  }
  return tips;
};

const billTips = (bill) => bill.payments.filter((p) => p.status === 'completed').flatMap((p) => parseTips(p.notes));

/** Void approvals written to order notes: "[Void] Remove 2 x Soup | Approved: Name | At: ..." */
const VOID = /\[Void\] ([^|]+?) \| Approved: ([^|]+?)(?: \| At: ([^\s|]+))?\s*$/;
const billVoids = (bill) => String(bill.order.notes || '').split('\n')
  .map((line) => VOID.exec(line.trim()))
  .filter(Boolean)
  .map((m) => ({ description: m[1].trim(), approvedBy: m[2].trim(), at: m[3] || null }));

const salesFigures = (bills) => {
  const sales = bills.filter((b) => b.billable);
  return {
    count: sales.length,
    gross: sum(sales, (b) => b.subtotal),
    discount: sum(sales, (b) => b.discount),
    charges: sum(sales, (b) => b.charges),
    tax: sum(sales, (b) => b.tax),
    total: sum(sales, (b) => b.total),
    cash: sum(sales, (b) => b.collections.cash),
    card: sum(sales, (b) => b.collections.card),
    upi: sum(sales, (b) => b.collections.upi),
    guestVisit: sum(sales, (b) => b.collections.guestVisit),
    other: sum(sales, (b) => b.collections.other),
    pending: sum(sales.filter((b) => b.isPending), (b) => b.balance),
    items: sales.reduce((acc, b) => acc + billableItems(b).reduce((n, i) => n + itemQty(i), 0), 0),
  };
};

const col = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });

const PAYMENT_COLUMNS = [
  col('cash', 'Cash', 'money'),
  col('card', 'Card', 'money'),
  col('upi', 'UPI', 'money'),
  col('guestVisit', 'Guest Visit', 'money'),
  col('other', 'Other', 'money'),
  col('pending', 'Pending', 'money'),
];

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

const salesSummary = (bills) => {
  const s = salesFigures(bills);
  const cancelled = bills.filter((b) => b.billStatus === 'cancelled');
  const byType = Object.entries(ORDER_TYPE_LABELS).map(([type, label]) => {
    const list = bills.filter((b) => b.billable && b.type === type);
    return { type, label, count: list.length, total: sum(list, (b) => b.total) };
  }).filter((r) => r.count > 0);

  const rows = [
    { section: 'Sales', metric: 'Bills', value: s.count, valueType: 'number' },
    { section: 'Sales', metric: 'Items sold (qty)', value: s.items, valueType: 'number' },
    { section: 'Sales', metric: 'Gross sales (item value)', value: s.gross },
    { section: 'Sales', metric: 'Discounts', value: -s.discount },
    { section: 'Sales', metric: 'Net sales', value: round2(s.gross - s.discount) },
    { section: 'Sales', metric: 'Service charge', value: s.charges },
    { section: 'Sales', metric: 'Tax', value: s.tax },
    { section: 'Sales', metric: 'Total (bill value)', value: s.total, bold: true },
    { section: 'Sales', metric: 'Average bill', value: s.count ? round2(s.total / s.count) : 0 },
    { section: 'Collections', metric: 'Cash', value: s.cash },
    { section: 'Collections', metric: 'Card', value: s.card },
    { section: 'Collections', metric: 'UPI / wallets', value: s.upi },
    { section: 'Collections', metric: 'Guest Visit (room charge)', value: s.guestVisit },
    { section: 'Collections', metric: 'Other methods', value: s.other },
    { section: 'Collections', metric: 'Pending collection', value: s.pending },
    ...byType.map((t) => ({ section: 'By order type', metric: `${t.label} (${t.count} bills)`, value: t.total })),
    { section: 'Exceptions', metric: 'Cancelled bills', value: cancelled.length, valueType: 'number' },
    { section: 'Exceptions', metric: 'Cancelled value', value: sum(cancelled, (b) => b.total) },
  ];
  return {
    kpis: [
      { label: 'Bills', value: s.count, type: 'number' },
      { label: 'Total', value: s.total, type: 'money' },
      { label: 'Net sales', value: round2(s.gross - s.discount), type: 'money' },
      { label: 'Average bill', value: s.count ? round2(s.total / s.count) : 0, type: 'money' },
      { label: 'Discounts', value: s.discount, type: 'money' },
      { label: 'Tax', value: s.tax, type: 'money' },
      { label: 'Pending', value: s.pending, type: 'money' },
    ],
    columns: [col('section', 'Section'), col('metric', 'Metric'), col('value', 'Value', 'money')],
    rows,
    totals: null,
  };
};

const dayWise = (bills, ctx) => {
  const days = new Map();
  bills.forEach((b) => {
    // Business date: the day the bill closed (settled), not when it was ordered
    const day = dateInZone(b.closedAt || b.orderTime, ctx.timeZone);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(b);
  });
  const rows = Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => {
    const s = salesFigures(list);
    return {
      date: day, bills: s.count, gross: s.gross, discount: s.discount, charges: s.charges, tax: s.tax, total: s.total,
      avg: s.count ? round2(s.total / s.count) : 0,
      cash: s.cash, card: s.card, upi: s.upi, guestVisit: s.guestVisit, other: s.other, pending: s.pending,
    };
  });
  return {
    columns: [
      col('date', 'Date', 'date'), col('bills', 'Bills', 'number'), col('gross', 'Gross', 'money'), col('discount', 'Discount', 'money'),
      col('charges', 'Charges', 'money'), col('tax', 'Tax', 'money'), col('total', 'Total', 'money'), col('avg', 'Avg bill', 'money', { noTotal: true }),
      ...PAYMENT_COLUMNS,
    ],
    rows,
    totals: true,
  };
};

const billWise = (bills, ctx) => ({
  columns: [
    col('billNo', 'Bill No'), col('status', 'Status'), col('type', 'Type'), col('table', 'Table'), col('server', 'Server'),
    col('orderTime', 'Order time', 'datetime'), col('closedAt', 'Closed', 'datetime'),
    col('gross', 'Gross', 'money'), col('discount', 'Discount', 'money'), col('charges', 'Charges', 'money'), col('tax', 'Tax', 'money'),
    col('total', 'Total', 'money'), col('payment', 'Payment'), col('paid', 'Paid', 'money'), col('balance', 'Balance', 'money'),
  ],
  rows: [...bills].sort((a, b) => new Date(a.closedAt || a.orderTime) - new Date(b.closedAt || b.orderTime)).map((b) => ({
    id: b.id,
    billNo: b.billNo,
    status: b.stateInfo.label,
    type: ORDER_TYPE_LABELS[b.type] || b.type || '',
    table: b.tableLabel,
    server: b.serverId != null ? ctx.staffName(b.serverId) : '',
    orderTime: b.orderTime,
    closedAt: b.closedAt,
    gross: b.subtotal,
    discount: b.discount,
    charges: b.charges,
    tax: b.tax,
    total: b.total,
    payment: ctx.describePayments(b),
    paid: b.paid,
    balance: b.balance,
    muted: !b.billable,
    excluded: !b.billable,
  })),
  totals: true,
  notes: ['Cancelled and refunded bills are greyed out and left out of the totals.'],
});

const paymentModes = (bills) => {
  const map = new Map();
  const add = (key, label, amount, kind = 'collected') => {
    const row = map.get(key) || { method: label, kind, count: 0, amount: 0 };
    row.count += 1;
    row.amount = round2(row.amount + amount);
    map.set(key, row);
  };
  bills.filter((b) => b.billable || b.billStatus === 'refunded').forEach((b) => {
    b.completedPayments.forEach((p) => add(`c:${getPaymentLabel(p)}`, getPaymentLabel(p), money(p.amount)));
    b.pendingPayments.forEach((p) => add(`p:${getPaymentLabel(p)}`, `${getPaymentLabel(p)} (awaiting confirmation)`, money(p.amount), 'pending'));
    b.refundedPayments.forEach((p) => add(`r:${getPaymentLabel(p)}`, `${getPaymentLabel(p)} (refunded)`,
      money(p.refunded_amount) > 0 ? money(p.refunded_amount) : money(p.amount), 'refunded'));
    if (b.billable && b.billStatus === 'outstanding' && b.balance > 0) add('credit', 'Credit Pay (unpaid balance)', b.balance, 'pending');
  });
  const rows = Array.from(map.values());
  const collected = sum(rows.filter((r) => r.kind === 'collected'), (r) => r.amount);
  rows.forEach((r) => { r.share = r.kind === 'collected' ? pct(r.amount, collected) : null; });
  rows.sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'collected' ? -1 : 1));
  return {
    columns: [col('method', 'Payment mode'), col('count', 'Payments', 'number'), col('amount', 'Amount', 'money'), col('share', 'Share of collected', 'percent', { noTotal: true })],
    rows: rows.map((r) => ({ ...r, muted: r.kind !== 'collected' })),
    totals: { method: 'Total collected', count: rows.filter((r) => r.kind === 'collected').reduce((n, r) => n + r.count, 0), amount: collected },
    notes: ['Paytm, PhonePe and UPI are listed separately here; History shows them together under UPI.'],
  };
};

const itemWise = (bills, ctx) => {
  const map = new Map();
  bills.filter((b) => b.billable).forEach((b) => billableItems(b).forEach((item) => {
    const category = item.category_name || ctx.itemCategory(item.menu_item) || 'Uncategorised';
    if (ctx.filters.category && ctx.filters.category !== 'all' && category !== ctx.filters.category) return;
    const key = item.menu_item ?? item.menu_item_name;
    const row = map.get(key) || { item: item.menu_item_name || `Item #${item.menu_item}`, category, qty: 0, amount: 0, bills: new Set() };
    row.qty += itemQty(item);
    row.amount = round2(row.amount + getItemLineAmount(item));
    row.bills.add(b.id);
    map.set(key, row);
  }));
  const total = sum(Array.from(map.values()), (r) => r.amount);
  const rows = Array.from(map.values())
    .map((r) => ({ item: r.item, category: r.category, qty: r.qty, bills: r.bills.size, amount: r.amount, avg: r.qty ? round2(r.amount / r.qty) : 0, share: pct(r.amount, total) }))
    .sort((a, b) => b.amount - a.amount);
  return {
    columns: [col('item', 'Item'), col('category', 'Category'), col('qty', 'Qty', 'number'), col('bills', 'Bills', 'number', { noTotal: true }),
      col('amount', 'Amount', 'money'), col('avg', 'Avg price', 'money', { noTotal: true }), col('share', 'Share', 'percent', { noTotal: true })],
    rows,
    totals: true,
    notes: ['Item amounts are before bill discounts, service charge and tax. Cancelled items are excluded.'],
  };
};

const categoryWise = (bills, ctx) => {
  const items = itemWise(bills, { ...ctx, filters: { ...ctx.filters, category: 'all' } }).rows;
  const map = new Map();
  items.forEach((r) => {
    const row = map.get(r.category) || { category: r.category, items: 0, qty: 0, amount: 0 };
    row.items += 1;
    row.qty += r.qty;
    row.amount = round2(row.amount + r.amount);
    map.set(r.category, row);
  });
  const total = sum(Array.from(map.values()), (r) => r.amount);
  return {
    columns: [col('category', 'Category'), col('items', 'Items', 'number'), col('qty', 'Qty', 'number'), col('amount', 'Amount', 'money'), col('share', 'Share', 'percent', { noTotal: true })],
    rows: Array.from(map.values()).map((r) => ({ ...r, share: pct(r.amount, total) })).sort((a, b) => b.amount - a.amount),
    totals: true,
    notes: ['Amounts are item values before bill discounts, service charge and tax.'],
  };
};

const hourly = (bills, ctx) => {
  const hours = new Map();
  bills.filter((b) => b.billable).forEach((b) => {
    const h = hourInZone(b.orderTime, ctx.timeZone);
    if (h === null) return;
    const row = hours.get(h) || { hour: h, bills: 0, total: 0, items: 0 };
    row.bills += 1;
    row.total = round2(row.total + b.total);
    row.items += billableItems(b).reduce((n, i) => n + itemQty(i), 0);
    hours.set(h, row);
  });
  const pad = (n) => String(n).padStart(2, '0');
  return {
    columns: [col('slot', 'Hour'), col('bills', 'Bills', 'number'), col('items', 'Items (qty)', 'number'), col('total', 'Sales', 'money'), col('avg', 'Avg bill', 'money', { noTotal: true })],
    rows: Array.from(hours.values()).sort((a, b) => a.hour - b.hour).map((r) => ({
      slot: `${pad(r.hour)}:00 - ${pad((r.hour + 1) % 24)}:00`, bills: r.bills, items: r.items, total: r.total, avg: r.bills ? round2(r.total / r.bills) : 0,
    })),
    totals: true,
    notes: ['Grouped by order time in the restaurant\'s time zone (when the kitchen was busy). Bills are included when they closed in the selected period.'],
  };
};

const discounts = (bills) => {
  const rows = bills.filter((b) => b.billable && b.discount > 0).map((b) => {
    const note = getDiscountInfo(b.order).note;
    return {
      id: b.id,
      billNo: b.billNo,
      orderTime: b.orderTime,
      gross: b.subtotal,
      percent: note?.type === 'percent' ? note.percent : pct(b.discount, b.subtotal),
      discount: b.discount,
      total: b.total,
      reason: note?.reason || '',
      by: note?.by || '',
      approvedBy: note?.approvedBy || '',
    };
  });
  return {
    columns: [col('billNo', 'Bill No'), col('orderTime', 'Order time', 'datetime'), col('gross', 'Gross', 'money'), col('percent', 'Disc %', 'percent', { noTotal: true }),
      col('discount', 'Discount', 'money'), col('total', 'Bill total', 'money'), col('reason', 'Reason'), col('by', 'Given by'), col('approvedBy', 'Approved by')],
    rows,
    totals: true,
  };
};

const cancellations = (bills) => {
  const rows = [];
  bills.forEach((b) => {
    if (b.billStatus === 'cancelled' || b.billStatus === 'refunded') {
      rows.push({ id: b.id, billNo: b.billNo, orderTime: b.orderTime, kind: b.billStatus === 'cancelled' ? 'Bill cancelled' : 'Bill refunded', detail: '', qty: null, value: b.total, by: '', note: b.order.notes ? String(b.order.notes).split('\n')[0].slice(0, 80) : '' });
    }
    if (b.billable && b.refunded > 0) {
      const refunds = Array.isArray(b.order.refunds) ? b.order.refunds : [];
      rows.push({
        id: b.id, billNo: b.billNo, orderTime: b.orderTime, kind: 'Part refund', detail: refunds.map((r) => r.credit_note_number).join(', '), qty: null, value: b.refunded,
        by: refunds.map((r) => r.refunded_by?.name).filter(Boolean).join(', '), note: refunds.map((r) => r.note).filter(Boolean).join('; ').slice(0, 80),
      });
    }
    if (b.billable || b.billStatus === 'cancelled') {
      (b.items || []).filter((i) => i.status === 'cancelled').forEach((i) => rows.push({
        id: b.id, billNo: b.billNo, orderTime: b.orderTime, kind: 'Item cancelled', detail: i.menu_item_name, qty: itemQty(i), value: getItemLineAmount(i), by: '', note: i.special_instructions || '',
      }));
      // Voids recorded by the server (items reduced or removed after reaching the kitchen)
      (b.items || []).filter((i) => Number(i.voided_quantity) > 0).forEach((i) => rows.push({
        id: b.id, billNo: b.billNo, orderTime: b.orderTime, kind: 'Item voided', detail: i.menu_item_name, qty: Number(i.voided_quantity),
        value: round2(money(i.unit_price ?? i.menu_item_price) * Number(i.voided_quantity)), by: '', note: '',
      }));
    }
    if (b.billStatus === 'cancelled' && b.order.cancel_reason) {
      const row = rows.find((r) => r.id === b.id && r.kind === 'Bill cancelled');
      if (row) {
        row.note = b.order.cancel_reason;
        row.by = [personName(b.order.cancelled_by), personName(b.order.cancel_approved_by)].filter(Boolean).join(' / ');
      }
    }
    billVoids(b).forEach((v) => rows.push({
      id: b.id, billNo: b.billNo, orderTime: v.at || b.orderTime, kind: 'Void approved', detail: v.description, qty: null, value: null, by: v.approvedBy, note: '',
    }));
  });
  rows.sort((a, b) => new Date(a.orderTime) - new Date(b.orderTime));
  return {
    columns: [col('billNo', 'Bill No'), col('orderTime', 'Time', 'datetime'), col('kind', 'Type'), col('detail', 'Item / action'), col('qty', 'Qty', 'number'),
      col('value', 'Value', 'money'), col('by', 'Approved by'), col('note', 'Notes')],
    rows,
    totals: true,
  };
};

const taxReport = (bills, ctx) => {
  const days = new Map();
  bills.filter((b) => b.billable).forEach((b) => {
    // Business date: the day the bill closed (settled), not when it was ordered
    const day = dateInZone(b.closedAt || b.orderTime, ctx.timeZone);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(b);
  });
  const componentLabels = buildTaxLines(100, ctx.taxSettings).map((t) => t.label);
  const rows = Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => {
    const tax = sum(list, (b) => b.tax);
    const total = sum(list, (b) => b.total);
    const row = { date: day, bills: list.length, taxable: round2(total - tax), tax, total };
    // Split each bill's tax the same way the printed bill does, then add up
    componentLabels.forEach((label) => { row[`tax_${label}`] = 0; });
    list.forEach((b) => buildTaxLines(b.tax, ctx.taxSettings).forEach((t) => { row[`tax_${t.label}`] = round2((row[`tax_${t.label}`] || 0) + t.amount); }));
    return row;
  });
  return {
    columns: [
      col('date', 'Date', 'date'), col('bills', 'Bills', 'number'), col('taxable', 'Taxable value', 'money'),
      ...(componentLabels.length > 1 ? componentLabels.map((l) => col(`tax_${l}`, l, 'money')) : []),
      col('tax', componentLabels.length === 1 ? componentLabels[0] : 'Total tax', 'money'), col('total', 'Bill total', 'money'),
    ],
    rows,
    totals: true,
    notes: ['Taxable value = bill total - tax. Tax components follow the print settings (Settings > Bill & KOT formats); the server stores only the total tax per bill.'],
  };
};

const staffReport = (bills, ctx) => {
  const map = new Map();
  const get = (id) => {
    const key = id == null ? 'none' : String(id);
    if (!map.has(key)) map.set(key, { server: id == null ? 'No server' : ctx.staffName(id), bills: 0, items: 0, total: 0, tips: 0, tipCount: 0 });
    return map.get(key);
  };
  bills.filter((b) => b.billable).forEach((b) => {
    const row = get(b.serverId);
    row.bills += 1;
    row.items += billableItems(b).reduce((n, i) => n + itemQty(i), 0);
    row.total = round2(row.total + b.total);
  });
  bills.filter((b) => b.billable).forEach((b) => billTips(b).forEach((t) => {
    const row = get(t.staffId != null ? t.staffId : b.serverId);
    row.tips = round2(row.tips + t.amount);
    row.tipCount += 1;
  }));
  return {
    columns: [col('server', 'Server / waiter'), col('bills', 'Bills', 'number'), col('items', 'Items (qty)', 'number'), col('total', 'Sales', 'money'),
      col('avg', 'Avg bill', 'money', { noTotal: true }), col('tipCount', 'Tips', 'number'), col('tips', 'Tip amount', 'money')],
    rows: Array.from(map.values()).map((r) => ({ ...r, avg: r.bills ? round2(r.total / r.bills) : 0 })).sort((a, b) => b.total - a.total),
    totals: true,
    notes: ['Tips are read from the payment notes recorded at settlement (amount, method and waiter).'],
  };
};

const tableReport = (bills) => {
  const map = new Map();
  bills.filter((b) => b.billable && b.tableLabel).forEach((b) => {
    const row = map.get(b.tableLabel) || { table: b.tableLabel, bills: 0, total: 0, minutes: [] };
    row.bills += 1;
    row.total = round2(row.total + b.total);
    if (b.orderTime && b.closedAt) {
      const mins = (new Date(b.closedAt) - new Date(b.orderTime)) / 60000;
      if (mins > 0 && mins < 24 * 60) row.minutes.push(mins);
    }
    map.set(b.tableLabel, row);
  });
  return {
    columns: [col('table', 'Table'), col('bills', 'Bills', 'number'), col('total', 'Sales', 'money'), col('avg', 'Avg bill', 'money', { noTotal: true }),
      col('avgMinutes', 'Avg time (min)', 'number', { noTotal: true })],
    rows: Array.from(map.values())
      .map((r) => ({
        table: r.table, bills: r.bills, total: r.total, avg: r.bills ? round2(r.total / r.bills) : 0,
        avgMinutes: r.minutes.length ? Math.round(r.minutes.reduce((a, m) => a + m, 0) / r.minutes.length) : null,
      }))
      .sort((a, b) => a.table.localeCompare(b.table, undefined, { numeric: true })),
    totals: true,
    notes: ['Average time runs from order time to the bill closing (last payment).'],
  };
};

const creditReport = (bills, ctx) => {
  const now = ctx.now || new Date();
  const rows = bills.filter((b) => b.isPending).map((b) => ({
    id: b.id,
    billNo: b.billNo,
    orderTime: b.orderTime,
    status: b.stateInfo.label,
    customer: b.customerName,
    phone: b.customerPhone,
    total: b.total,
    paid: b.paid,
    balance: b.balance,
    ageDays: b.orderTime ? Math.max(0, Math.floor((now - new Date(b.orderTime)) / 86400000)) : null,
    record: b.outstanding?.status ? b.outstanding.status.replace(/_/g, ' ') : '',
  })).sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  return {
    columns: [col('billNo', 'Bill No'), col('orderTime', 'Order time', 'datetime'), col('status', 'Status'), col('customer', 'Customer'), col('phone', 'Phone'),
      col('total', 'Bill total', 'money'), col('paid', 'Paid', 'money'), col('balance', 'Balance due', 'money'), col('ageDays', 'Age (days)', 'number', { noTotal: true }),
      col('record', 'Credit record')],
    rows,
    totals: true,
    notes: ['Only bills ordered in the selected date range. Use a longer range to see older credit.'],
  };
};

/**
 * Report catalogue. `filters` lists the filters shown for the report;
 * `status` is the default bill status (null hides the status filter).
 */
export const REPORTS = [
  { key: 'summary', group: 'Sales', label: 'Sales summary', description: 'Totals, collections and order types for the period.', compute: salesSummary, filters: ['billType', 'payment', 'table', 'server'], status: 'all' },
  { key: 'daywise', group: 'Sales', label: 'Day-wise sales', description: 'One row per day with payment split.', compute: dayWise, filters: ['status', 'billType', 'payment', 'table', 'server'], status: 'sales' },
  { key: 'billwise', group: 'Sales', label: 'Bill-wise sales', description: 'Every bill with amounts and payment.', compute: billWise, filters: ['status', 'billType', 'payment', 'table', 'server', 'search'], status: 'all' },
  { key: 'hourly', group: 'Sales', label: 'Hourly sales', description: 'Busy hours by order time.', compute: hourly, filters: ['billType', 'table', 'server'], status: 'sales' },
  { key: 'payments', group: 'Payments', label: 'Payment modes', description: 'Collected amount per payment mode, plus pending and refunds.', compute: paymentModes, filters: ['billType', 'table', 'server'], status: 'all' },
  { key: 'credit', group: 'Payments', label: 'Pending & credit bills', description: 'Bills still awaiting collection, oldest first.', compute: creditReport, filters: ['billType', 'table', 'server', 'search'], status: 'pending' },
  { key: 'items', group: 'Items', label: 'Item-wise sales', description: 'Quantity and value per menu item.', compute: itemWise, filters: ['status', 'billType', 'table', 'server', 'category'], status: 'sales' },
  { key: 'categories', group: 'Items', label: 'Category-wise sales', description: 'Quantity and value per menu category.', compute: categoryWise, filters: ['status', 'billType', 'table', 'server'], status: 'sales' },
  { key: 'staff', group: 'Staff & tables', label: 'Server / waiter performance', description: 'Bills, sales and tips per server.', compute: staffReport, filters: ['billType', 'table'], status: 'sales' },
  { key: 'tables', group: 'Staff & tables', label: 'Table-wise sales', description: 'Bills, sales and average time per table.', compute: tableReport, filters: ['billType', 'server'], status: 'sales' },
  { key: 'discounts', group: 'Exceptions', label: 'Discounts', description: 'Discounted bills with reason, giver and approver.', compute: discounts, filters: ['billType', 'table', 'server', 'search'], status: 'sales' },
  { key: 'cancellations', group: 'Exceptions', label: 'Cancellations & voids', description: 'Cancelled and refunded bills, cancelled items and approved voids.', compute: cancellations, filters: ['billType', 'table', 'server', 'search'], status: 'all' },
  { key: 'tax', group: 'Tax', label: 'Tax summary', description: 'Day-wise taxable value and tax.', compute: taxReport, filters: ['billType'], status: 'sales' },
];

/** Status used for a report: its default, or the chosen one when the report shows the status filter */
export const effectiveStatus = (report, chosen) => (report.filters.includes('status') ? chosen || report.status : report.status);

/** Sums money/number columns for a totals row; `totals` may also be a preset object */
export const computeTotals = (result) => {
  if (!result.totals) return null;
  if (result.totals !== true) return result.totals;
  const totals = {};
  const rows = result.rows.filter((r) => !r.excluded);
  result.columns.forEach((c, i) => {
    if (i === 0) totals[c.key] = 'Total';
    else if ((c.type === 'money' || c.type === 'number') && !c.noTotal) {
      totals[c.key] = c.type === 'money'
        ? round2(rows.reduce((acc, r) => acc + (typeof r[c.key] === 'number' ? r[c.key] : 0), 0))
        : rows.reduce((acc, r) => acc + (typeof r[c.key] === 'number' ? r[c.key] : 0), 0);
    }
  });
  return totals;
};

