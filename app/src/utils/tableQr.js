/**
 * Table QR codes: the ordering link each table's QR encodes, and printable card layouts.
 *
 * The guest ordering page lives in a separate guest app (REACT_APP_GUEST_APP_URL). DeskoPOS has none
 * yet, so QR ordering stays hidden until that address is set. The link uses the server's
 * table.qr_code_url when it is an ordering link; otherwise it is built from the guest app URL plus the
 * table's QR code (a per-table secret, so changing a table number in the link does not work once the
 * guest app validates the code). Regenerating a table's QR invalidates printed copies.
 */
import { escapeHtml } from './printTemplates';

export const GUEST_APP_URL = (process.env.REACT_APP_GUEST_APP_URL || '').replace(/\/+$/, '');

/** Table QR codes for guest ordering are shown only when a guest app is set up */
export const QR_ORDERING = !!GUEST_APP_URL;

const IMAGE_URL = /\.(png|jpe?g|gif|svg|webp)(\?|$)/i;

/** The table's QR secret when `qr_code` holds a code (not an image path or URL) */
export const getTableQrCode = (table) => {
  const code = String(table?.qr_code || '').trim();
  if (!code || /^https?:\/\//i.test(code) || code.includes('/') || IMAGE_URL.test(code)) return '';
  return code;
};

/**
 * Link a table's QR code opens.
 * @param {Object} table - { id, qr_code, qr_code_url }
 * @param {Object} ctx - { restaurantId, hotelId, baseUrl }
 */
export const buildTableOrderingUrl = (table, { restaurantId, hotelId, baseUrl = GUEST_APP_URL } = {}) => {
  const serverUrl = String(table?.qr_code_url || '').trim();
  if (/^https?:\/\//i.test(serverUrl) && !IMAGE_URL.test(serverUrl)) return serverUrl;
  const params = new URLSearchParams();
  if (hotelId) params.set('hotel', hotelId);
  params.set('restaurant', restaurantId ?? table?.restaurant ?? '');
  params.set('table', table?.id ?? '');
  const code = getTableQrCode(table);
  if (code) params.set('code', code);
  params.set('source', 'qr');
  return `${baseUrl}/ordering/table?${params.toString()}`;
};

/** "T5" / "Table 5" label for cards */
export const tableCardLabel = (table) => {
  const number = String(table?.table_number ?? '').trim();
  if (!number) return table?.name || `Table ${table?.id}`;
  return /^\d+$/.test(number) ? `Table ${number}` : number;
};

/* ------------------------------------------------------------------ */
/* Printable cards                                                     */
/* ------------------------------------------------------------------ */

export const QR_PRINT_FORMATS = [
  { key: 'tent', label: 'Table tent card (A6)', description: 'One card per page, 105 × 148 mm. Fold or put in a stand.' },
  { key: 'grid', label: 'A4 sheet, 6 cards', description: 'Six cards per A4 page to cut out.' },
  { key: 'sticker', label: 'Stickers, 60 mm', description: 'Square stickers, 12 per A4 sheet (3 × 4).' },
];

const CARD_CSS = {
  tent: `@page { size: 105mm 148mm; margin: 0; }
    .sheet { width: 105mm; height: 148mm; display: flex; page-break-after: always; break-after: page; }
    .card { width: 105mm; height: 148mm; padding: 10mm 8mm; }
    .qr { width: 62mm; height: 62mm; } .title { font-size: 18pt; } .table { font-size: 30pt; }`,
  grid: `@page { size: A4; margin: 8mm; }
    .sheet { display: grid; grid-template-columns: repeat(2, 1fr); grid-auto-rows: 89mm; gap: 4mm; page-break-after: always; break-after: page; }
    .card { border: 0.3mm dashed #999; padding: 5mm; }
    .qr { width: 46mm; height: 46mm; } .title { font-size: 12pt; } .table { font-size: 22pt; }`,
  sticker: `@page { size: A4; margin: 10mm 12mm; }
    .sheet { display: grid; grid-template-columns: repeat(3, 60mm); grid-auto-rows: 60mm; gap: 4mm 3mm; justify-content: center; page-break-after: always; break-after: page; }
    .card { width: 60mm; height: 60mm; border-radius: 4mm; border: 0.3mm solid #ddd; padding: 3mm; }
    .qr { width: 36mm; height: 36mm; } .title { font-size: 8pt; } .table { font-size: 14pt; } .hint, .foot { display: none; }`,
};

const PER_PAGE = { tent: 1, grid: 6, sticker: 12 };

/**
 * Complete HTML document with one card per table.
 * @param {Array<{label, qrDataUrl, url}>} cards
 * @param {Object} opts - { format, restaurantName, heading, footer }
 */
export const renderQrCardsHtml = (cards, { format = 'grid', restaurantName = '', heading = 'Scan to see the menu and order', footer = '' } = {}) => {
  const per = PER_PAGE[format] || 6;
  const pages = [];
  for (let i = 0; i < cards.length; i += per) pages.push(cards.slice(i, i + per));
  const cardHtml = (c) => `<div class="card">
      <div class="title">${escapeHtml(restaurantName)}</div>
      <div class="table">${escapeHtml(c.label)}</div>
      <img class="qr" src="${c.qrDataUrl}" alt="QR code for ${escapeHtml(c.label)}">
      <div class="hint">${escapeHtml(heading)}</div>
      ${footer ? `<div class="foot">${escapeHtml(footer)}</div>` : ''}
    </div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Table QR codes</title><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Arial, Helvetica, 'Noto Sans', sans-serif; }
  .card { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2mm; overflow: hidden; }
  .title { font-weight: bold; letter-spacing: 0.02em; }
  .table { font-weight: 800; line-height: 1.1; }
  .qr { image-rendering: pixelated; }
  .hint { font-size: 10pt; color: #333; }
  .foot { font-size: 8pt; color: #666; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  ${CARD_CSS[format] || CARD_CSS.grid}
</style></head><body>
${pages.map((page) => `<div class="sheet">${page.map(cardHtml).join('')}</div>`).join('\n')}
</body></html>`;
};

/* ------------------------------------------------------------------ */
/* Bulk table numbers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Table numbers for bulk create: prefix + from..to, skipping numbers that already exist.
 * @returns {{ numbers: string[], skipped: string[], error: string|null }}
 */
export const planBulkTables = ({ prefix = '', from, to }, existing = []) => {
  const start = parseInt(from, 10);
  const end = parseInt(to, 10);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    return { numbers: [], skipped: [], error: 'Enter a valid range, e.g. 1 to 20.' };
  }
  if (end - start + 1 > 200) return { numbers: [], skipped: [], error: 'Create at most 200 tables at a time.' };
  const taken = new Set(existing.map((t) => String(t.table_number).trim().toLowerCase()));
  const numbers = [];
  const skipped = [];
  for (let n = start; n <= end; n += 1) {
    const number = `${prefix.trim()}${n}`;
    if (taken.has(number.toLowerCase())) skipped.push(number);
    else numbers.push(number);
  }
  return { numbers, skipped, error: null };
};

/* ------------------------------------------------------------------ */
/* QR orders arriving at the POS                                       */
/* ------------------------------------------------------------------ */

export const isQrSource = (value) => ['qr', 'qr_code', 'table_qr', 'guest_qr'].includes(String(value || '').toLowerCase());

/** Whether an order came from a table QR (order-level source/channel) */
export const isQrOrder = (order) => isQrSource(order?.source) || isQrSource(order?.order_source) || isQrSource(order?.channel);

/**
 * Items a guest added by QR that have not been handled yet: QR source on the item (or on a
 * QR order), not cancelled, not yet sent to the kitchen per the server, and not already handled
 * on this device.
 */
export const pendingQrItems = (order, handled = new Set()) => {
  const orderIsQr = isQrOrder(order);
  return (order?.items || []).filter((item) => {
    if (item.status === 'cancelled') return false;
    const fromQr = isQrSource(item.source) || isQrSource(item.order_source) || (orderIsQr && item.source == null);
    if (!fromQr) return false;
    if (item.kot_sent_at || item.kot_number) return false;
    return !handled.has(String(item.id));
  });
};
