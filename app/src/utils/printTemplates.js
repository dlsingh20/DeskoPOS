/**
 * Bill and KOT print templates in three formats:
 *   thermal80 - 80 mm roll (72 mm printable)
 *   thermal58 - 58 mm roll (48 mm printable)
 *   sheet     - A4 or US Letter invoice (bill) / A5 or Half Letter ticket (KOT)
 *
 * Country neutral: tax labels and titles come from the print settings (country
 * tax profile); money and dates use the hotel's locale, currency and time zone.
 *
 * buildBillModel / buildKotModel turn API data into plain values (tested);
 * renderBillHtml / renderKotHtml turn a model into a complete HTML document
 * used by both browser printing and the companion app.
 */
import { getDiscountInfo } from './discountUtils';
import { getPaymentLabel } from './historyUtils';
import { buildTaxLines } from './taxProfiles';

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Number formatter for amounts in the hotel's locale, without a currency symbol
 * (receipt printers often lack symbol glyphs; the currency code is printed with the total).
 */
export const makeAmountFormatter = (locale, decimals = 2) => {
  let formatter;
  try {
    formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } catch (error) {
    formatter = new Intl.NumberFormat('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return (value) => formatter.format(round2(num(value)));
};

export const formatAmount = (value, locale, decimals) => makeAmountFormatter(locale, decimals)(value);

export const formatPrintDate = (value, timeZone, locale) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timeZone || undefined, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date).replace(/\b(AM|PM)\b/, (m) => m.toLowerCase());
  } catch (error) {
    return date.toLocaleString();
  }
};

const ORDER_TYPES = {
  dine_in: 'Dine In', takeaway: 'Takeaway', pickup: 'Pickup', delivery: 'Delivery', room_service: 'Room Service',
};

/* ------------------------------------------------------------------ */
/* Bill model                                                          */
/* ------------------------------------------------------------------ */

/**
 * Same item at the same price is printed as one line. Item notes are kitchen
 * instructions: they print on the KOT only, never on the guest's bill.
 */
const combineItems = (items) => {
  const lines = new Map();
  items.filter((item) => item.status !== 'cancelled').forEach((item) => {
    const qty = parseInt(item.quantity, 10) || 0;
    const rate = round2(num(item.unit_price ?? item.menu_item_price));
    const amount = item.total_price !== undefined && item.total_price !== null && item.total_price !== ''
      ? round2(num(item.total_price))
      : round2(rate * qty);
    const name = item.menu_item_name || item.name || 'Item';
    const key = `${item.menu_item ?? name}|${rate}`;
    const line = lines.get(key) || { name, qty: 0, rate, amount: 0 };
    line.qty += qty;
    line.amount = round2(line.amount + amount);
    lines.set(key, line);
  });
  return Array.from(lines.values());
};

const CASH_NOTE = /Cash received ([\d.]+), change returned ([\d.]+)/;

/**
 * @param {Object} order - order from the API, with items and payments
 * @param {Object} options - { settings, serverName, timeZone, locale, currency, decimals, duplicate, printedAt }
 */
export const buildBillModel = (order, {
  settings, serverName = '', timeZone, locale, currency = '', decimals = 2, duplicate = false, printedAt = new Date(),
} = {}) => {
  const header = settings?.header || {};
  const lines = combineItems(order.items || []);
  const subtotal = round2(num(order.subtotal));
  const discountInfo = getDiscountInfo(order);
  const service = round2(num(order.service_charge));
  const tax = round2(num(order.tax_amount));
  const total = round2(num(order.total_amount));

  const taxes = buildTaxLines(tax, settings?.tax);
  const taxId = (header.taxId || '').trim();

  const payments = (order.payments || [])
    .filter((p) => p.status === 'completed' && p.method !== 'pay_later')
    .map((p) => ({
      label: getPaymentLabel(p),
      amount: round2(num(p.amount)),
      notes: p.notes || '',
      received: p.amount_received != null && p.amount_received !== '' ? num(p.amount_received) : null,
      change: p.change_returned != null && p.change_returned !== '' ? num(p.change_returned) : null,
    }));
  const pendingPayments = (order.payments || []).filter((p) => p.status === 'pending' && p.method !== 'pay_later');
  const paid = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  const balance = round2(Math.max(0, total - paid));

  // Cash received / change: payment fields, or the note older payments carry
  let cash = null;
  payments.forEach((p) => {
    if (p.received !== null) {
      cash = { received: p.received, change: p.change ?? 0 };
      return;
    }
    const match = CASH_NOTE.exec(p.notes);
    if (match) cash = { received: num(match[1]), change: num(match[2]) };
  });

  let status = 'unpaid';
  if (order.status === 'cancelled') status = 'cancelled';
  else if (balance <= 0.005) status = 'paid';
  else if (order.status === 'outstanding') status = 'credit';
  else if (pendingPayments.length) status = 'pending';
  else if (paid > 0) status = 'partial';

  return {
    // With a tax registration the bill is the tax invoice; without one it is a plain receipt
    title: (taxId ? settings?.tax?.invoiceTitle : settings?.tax?.receiptTitle) || (taxId ? 'INVOICE' : 'RECEIPT'),
    duplicate,
    header: {
      name: header.name || order.restaurant_name || 'Restaurant',
      address: header.address || '',
      phone: header.phone || '',
      taxIdLabel: header.taxIdLabel || 'Tax ID',
      taxId: taxId.toUpperCase(),
      licenceLabel: header.licenceLabel || 'Licence',
      licence: (header.licence || '').trim(),
      footer: header.footer || '',
    },
    billNo: order.order_number || String(order.id),
    invoiceNo: order.invoice_number || '',
    guests: Number(order.guest_count) > 0 ? Number(order.guest_count) : null,
    date: formatPrintDate(order.order_time || order.created_at, timeZone, locale),
    printedAt: formatPrintDate(printedAt, timeZone, locale),
    currency,
    fmt: makeAmountFormatter(locale, decimals),
    table: order.table_number || '',
    orderType: ORDER_TYPES[order.type] || '',
    serverName,
    customerName: order.customer_name || '',
    customerPhone: order.customer_phone || '',
    roomNumber: order.room_number || '',
    lines,
    totalQty: lines.reduce((sum, l) => sum + l.qty, 0),
    itemsTotal: round2(lines.reduce((sum, l) => sum + l.amount, 0)),
    subtotal,
    discount: discountInfo.amount > 0
      ? { amount: discountInfo.amount, label: discountInfo.type === 'percent' && discountInfo.percent ? `Disc (${discountInfo.percent}%)` : 'Disc' }
      : null,
    service,
    taxes,
    total,
    payments,
    paid,
    balance,
    cash,
    status,
  };
};

/* ------------------------------------------------------------------ */
/* KOT model                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {Object} kot - from buildKOTData: { orderNumber, tableNumber, items, timestamp, orderType, isAddition, kitchenNotes }
 */
export const buildKotModel = (kot, { serverName = '', timeZone, locale, copy = 1, copies = 1 } = {}) => ({
  orderNumber: kot.orderNumber || kot.order_number || '',
  table: kot.tableNumber || kot.table_number || '',
  orderType: ORDER_TYPES[kot.orderType] || '',
  time: formatPrintDate(kot.timestamp || new Date(), timeZone, locale),
  serverName,
  isAddition: !!kot.isAddition,
  kotNumber: kot.kotNumber ?? kot.kot_number ?? null,
  kitchenNotes: kot.kitchenNotes || '',
  items: (kot.items || []).map((item) => ({
    qty: parseInt(item.quantity, 10) || 1,
    name: item.menu_item_name || item.name || 'Item',
    note: item.special_instructions || '',
  })),
  totalQty: (kot.items || []).reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 1), 0),
  copy,
  copies,
});

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

// Fallback fonts cover non-Latin scripts (Arabic, CJK, Thai, ...) in item names and addresses
const MONO = "'Courier New', Courier, 'Noto Sans Mono', monospace";
const SANS = "Arial, Helvetica, 'Noto Sans', sans-serif";

const PAGE_CSS = {
  thermal80: `@page { margin: 0; }
    body { width: 72mm; padding: 2mm 4mm 6mm; font-family: ${MONO}; font-size: 12px; }`,
  thermal58: `@page { margin: 0; }
    body { width: 48mm; padding: 2mm 2mm 6mm; font-family: ${MONO}; font-size: 11px; }`,
  A4: `@page { size: A4; margin: 12mm; }
    body { font-family: ${SANS}; font-size: 12px; }`,
  Letter: `@page { size: letter; margin: 0.5in; }
    body { font-family: ${SANS}; font-size: 12px; }`,
  A5: `@page { size: A5; margin: 8mm; }
    body { font-family: ${SANS}; font-size: 16px; }`,
  HalfLetter: `@page { size: 5.5in 8.5in; margin: 0.35in; }
    body { font-family: ${SANS}; font-size: 16px; }`,
};

const documentHtml = (title, css, body) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; color: #000; background: #fff; }
  ${css}
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
  .rule { border-top: 1px dashed #000; margin: 4px 0; }
  .rule2 { border-top: 2px solid #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row > span:last-child { text-align: right; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  .muted { color: #333; }
  .dup { border: 1px solid #000; padding: 1px 6px; display: inline-block; font-weight: bold; letter-spacing: 1px; }
</style></head><body>${body}</body></html>`;

const row = (label, value, cls = '', style = '') => `<div class="row ${cls}"${style ? ` style="${style}"` : ''}><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

const STATUS_TEXT = {
  paid: 'PAID',
  partial: 'PART PAID',
  credit: 'ON CREDIT - TO BE PAID',
  pending: 'PAYMENT PENDING',
  unpaid: '',
  cancelled: 'CANCELLED',
};

const billHeaderHtml = (m) => [
  `<div class="c b" style="font-size:1.35em">${escapeHtml(m.header.name)}</div>`,
  m.header.address && `<div class="c">${escapeHtml(m.header.address).replace(/\n/g, '<br>')}</div>`,
  m.header.phone && `<div class="c">Ph: ${escapeHtml(m.header.phone)}</div>`,
  m.header.taxId && `<div class="c">${escapeHtml(m.header.taxIdLabel)}: ${escapeHtml(m.header.taxId)}</div>`,
  m.header.licence && `<div class="c">${escapeHtml(m.header.licenceLabel)}: ${escapeHtml(m.header.licence)}</div>`,
].filter(Boolean).join('');

const billMetaRows = (m) => [
  m.invoiceNo && row(`Invoice: ${m.invoiceNo}`, ''),
  row(`Bill: ${m.billNo}`, m.table ? `Table: ${m.table}` : m.orderType),
  row(m.date, m.table && m.orderType ? m.orderType : ''),
  (m.serverName || m.guests) && row(m.serverName ? `Server: ${m.serverName}` : '', m.guests ? `Guests: ${m.guests}` : ''),
  (m.customerName || m.customerPhone) && row(`Cust: ${[m.customerName, m.customerPhone].filter(Boolean).join(' ')}`, ''),
  m.roomNumber && row(`Room: ${m.roomNumber}`, ''),
].filter(Boolean).join('');

const totalsRows = (m) => [
  row('Subtotal', m.fmt(m.subtotal)),
  m.discount && row(m.discount.label, `-${m.fmt(m.discount.amount)}`),
  m.service > 0 && row('Service charge', m.fmt(m.service)),
  ...m.taxes.map((t) => row(t.label, m.fmt(t.amount))),
].filter(Boolean).join('');

const paymentRows = (m) => {
  const rows = m.payments.map((p) => row(p.label, m.fmt(p.amount)));
  if (m.cash) {
    rows.push(row('Cash received', m.fmt(m.cash.received)));
    rows.push(row('Change returned', m.fmt(m.cash.change)));
  }
  if (m.balance > 0.005 && m.status !== 'cancelled') rows.push(row('Balance due', m.fmt(m.balance), 'b'));
  return rows.join('');
};

const renderBillThermal = (m, format) => {
  const narrow = format === 'thermal58';
  const items = narrow
    ? m.lines.map((l) => `<div class="b">${escapeHtml(l.name)}</div>
        ${row(`  ${l.qty} x ${m.fmt(l.rate)}`, m.fmt(l.amount))}`).join('')
    : `<table><thead><tr>
        <th style="text-align:left">Item</th><th class="r" style="width:7mm">Qty</th>
        <th class="r" style="width:14mm">Rate</th><th class="r" style="width:17mm">Amt</th>
      </tr></thead><tbody>
      ${m.lines.map((l) => `<tr>
        <td style="padding-top:2px">${escapeHtml(l.name)}</td>
        <td class="r" style="vertical-align:top;padding-top:2px">${l.qty}</td>
        <td class="r" style="vertical-align:top;padding-top:2px">${m.fmt(l.rate)}</td>
        <td class="r" style="vertical-align:top;padding-top:2px">${m.fmt(l.amount)}</td>
      </tr>`).join('')}
      </tbody></table>`;

  return documentHtml(`Bill ${m.billNo}`, PAGE_CSS[format], `
    ${billHeaderHtml(m)}
    <div class="rule"></div>
    <div class="c b">${escapeHtml(m.title)}${m.duplicate ? ' <span class="dup">DUPLICATE</span>' : ''}</div>
    <div class="rule"></div>
    ${billMetaRows(m)}
    <div class="rule"></div>
    ${items}
    <div class="rule"></div>
    ${row(`Items: ${m.lines.length}  Qty: ${m.totalQty}`, '')}
    ${totalsRows(m)}
    <div class="rule2"></div>
    ${row(`GRAND TOTAL${m.currency ? ` (${m.currency})` : ''}`, m.fmt(m.total), 'b', 'font-size:1.25em')}
    <div class="rule2"></div>
    ${paymentRows(m)}
    ${STATUS_TEXT[m.status] ? `<div class="c b" style="margin-top:4px">${STATUS_TEXT[m.status]}</div>` : ''}
    ${m.header.footer ? `<div class="rule"></div><div class="c">${escapeHtml(m.header.footer)}</div>` : ''}
    <div class="c muted" style="margin-top:4px;font-size:0.85em">Printed ${escapeHtml(m.printedAt)}</div>`);
};

const renderBillSheet = (m, sheetSize) => {
  const cell = 'border:1px solid #000;padding:4px 6px;';
  return documentHtml(`Invoice ${m.billNo}`, PAGE_CSS[sheetSize === 'Letter' ? 'Letter' : 'A4'], `
    <table style="margin-bottom:8px"><tr>
      <td style="vertical-align:top">
        <div class="b" style="font-size:20px">${escapeHtml(m.header.name)}</div>
        ${m.header.address ? `<div>${escapeHtml(m.header.address).replace(/\n/g, '<br>')}</div>` : ''}
        ${m.header.phone ? `<div>Phone: ${escapeHtml(m.header.phone)}</div>` : ''}
        ${m.header.taxId ? `<div>${escapeHtml(m.header.taxIdLabel)}: ${escapeHtml(m.header.taxId)}</div>` : ''}
        ${m.header.licence ? `<div>${escapeHtml(m.header.licenceLabel)}: ${escapeHtml(m.header.licence)}</div>` : ''}
      </td>
      <td class="r" style="vertical-align:top">
        <div class="b" style="font-size:18px">${escapeHtml(m.title)}</div>
        ${m.duplicate ? '<div class="dup" style="margin-top:4px">DUPLICATE</div>' : ''}
        ${STATUS_TEXT[m.status] ? `<div class="b" style="margin-top:4px">${STATUS_TEXT[m.status]}</div>` : ''}
      </td>
    </tr></table>
    <table style="margin-bottom:10px"><tr>
      <td style="${cell}width:50%">
        ${m.invoiceNo ? `<div><b>Invoice No:</b> ${escapeHtml(m.invoiceNo)}</div>` : ''}
        <div><b>Bill No:</b> ${escapeHtml(m.billNo)}</div>
        <div><b>Date:</b> ${escapeHtml(m.date)}</div>
        ${m.orderType ? `<div><b>Order type:</b> ${escapeHtml(m.orderType)}</div>` : ''}
      </td>
      <td style="${cell}">
        ${m.table ? `<div><b>Table:</b> ${escapeHtml(m.table)}</div>` : ''}
        ${m.serverName ? `<div><b>Server:</b> ${escapeHtml(m.serverName)}</div>` : ''}
        ${m.customerName || m.customerPhone ? `<div><b>Customer:</b> ${escapeHtml([m.customerName, m.customerPhone].filter(Boolean).join(', '))}</div>` : ''}
        ${m.roomNumber ? `<div><b>Room:</b> ${escapeHtml(m.roomNumber)}</div>` : ''}
      </td>
    </tr></table>
    <table>
      <thead><tr>
        <th style="${cell}width:40px">S.No</th><th style="${cell}text-align:left">Item</th>
        <th style="${cell}width:60px" class="r">Qty</th><th style="${cell}width:100px" class="r">Rate</th><th style="${cell}width:110px" class="r">Amount</th>
      </tr></thead>
      <tbody>
        ${m.lines.map((l, i) => `<tr>
          <td style="${cell}" class="c">${i + 1}</td>
          <td style="${cell}">${escapeHtml(l.name)}</td>
          <td style="${cell}" class="r">${l.qty}</td>
          <td style="${cell}" class="r">${m.fmt(l.rate)}</td>
          <td style="${cell}" class="r">${m.fmt(l.amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <table style="margin-top:10px"><tr>
      <td style="vertical-align:top;padding-right:16px">
        <div>Items: ${m.lines.length} &nbsp; Total qty: ${m.totalQty}</div>
        ${m.payments.length || m.balance > 0.005 ? `<div class="b" style="margin-top:10px">Payment</div>${paymentRows(m)}` : ''}
      </td>
      <td style="width:280px;vertical-align:top">
        ${totalsRows(m)}
        <div class="rule2"></div>
        ${row(`Grand Total${m.currency ? ` (${m.currency})` : ''}`, m.fmt(m.total), 'b', 'font-size:15px')}
      </td>
    </tr></table>
    ${m.header.footer ? `<div class="c" style="margin-top:24px">${escapeHtml(m.header.footer)}</div>` : ''}
    <table style="margin-top:40px"><tr>
      <td class="muted" style="font-size:10px">Printed ${escapeHtml(m.printedAt)}</td>
      <td class="r">Authorised Signatory</td>
    </tr></table>`);
};

/** Complete HTML document for a bill */
export const renderBillHtml = (model, format = 'thermal80', sheetSize = 'A4') => (format === 'sheet' ? renderBillSheet(model, sheetSize) : renderBillThermal(model, format === 'thermal58' ? 'thermal58' : 'thermal80'));

const kotBody = (m, format) => {
  const sheet = format === 'sheet';
  const big = sheet ? '30px' : (format === 'thermal58' ? '18px' : '22px');
  const itemSize = sheet ? '22px' : (format === 'thermal58' ? '13px' : '15px');
  return `
    <div class="c b" style="font-size:1.2em">KOT${m.kotNumber ? ` #${escapeHtml(m.kotNumber)}` : ''}${m.isAddition ? ' - NEW ITEMS' : ''}</div>
    ${m.copies > 1 ? `<div class="c">Copy ${m.copy} of ${m.copies}</div>` : ''}
    <div class="rule"></div>
    <div class="c b" style="font-size:${big}">${m.table ? `TABLE ${escapeHtml(m.table)}` : escapeHtml(m.orderType || 'ORDER').toUpperCase()}</div>
    <div class="rule"></div>
    ${row(`Order: ${m.orderNumber}`, m.table && m.orderType ? m.orderType : '')}
    ${row(m.time, '')}
    ${m.serverName ? row(`Server: ${m.serverName}`, '') : ''}
    <div class="rule2"></div>
    ${m.items.map((item) => `<div style="font-size:${itemSize};padding:3px 0" class="b">
        <span style="display:inline-block;min-width:2.4em">${item.qty} x</span>${escapeHtml(item.name)}
      </div>
      ${item.note ? `<div style="margin:0 0 3px 2.4em;padding:1px 4px;border:1px solid #000;display:inline-block">${escapeHtml(item.note)}</div>` : ''}`).join('')}
    <div class="rule2"></div>
    ${row(`Items: ${m.items.length}`, `Qty: ${m.totalQty}`)}
    ${m.kitchenNotes ? `<div class="rule"></div><div class="b">Note: ${escapeHtml(m.kitchenNotes)}</div>` : ''}`;
};

/**
 * Complete HTML document for a KOT. Pass several models (copies) to print
 * them in one job, one per page / cut.
 */
export const renderKotHtml = (models, format = 'thermal80', sheetSize = 'A4') => {
  const list = Array.isArray(models) ? models : [models];
  const css = format === 'sheet' ? PAGE_CSS[sheetSize === 'Letter' ? 'HalfLetter' : 'A5'] : PAGE_CSS[format === 'thermal58' ? 'thermal58' : 'thermal80'];
  return documentHtml(`KOT ${list[0]?.orderNumber || ''}`, css, list
    .map((m) => kotBody(m, format))
    .join('<div style="page-break-after:always;break-after:page"></div>'));
};
