import {
  buildBillModel,
  buildKotModel,
  escapeHtml,
  formatAmount,
  renderBillHtml as toBillHtml,
  renderKotHtml as toKotHtml,
} from './printTemplates';
import printSettingsService, { defaultPrintSettings, normalizePrintSettings, validateLicence } from '../services/PrintSettingsService';
import { buildTaxLines, profileKeyForCountry, taxSettingsFromProfile, validateTaxComponents, validateTaxId } from './taxProfiles';
import { currencyDecimals, resolveRegionalFormat } from './regionalFormat';

const INDIA = { locale: 'en-IN', currency: 'INR', decimals: 2, timeZone: 'Asia/Kolkata' };

const indiaSettings = (overrides = {}) => {
  const base = defaultPrintSettings('IN');
  return normalizePrintSettings({
    ...base,
    header: { ...base.header, name: 'Spice <Garden>', taxId: '29ABCDE1234F1Z5', licence: '11223344556677', address: 'MG Road\nBengaluru' },
    ...overrides,
  });
};

const order = (overrides = {}) => ({
  id: 7,
  order_number: '2610011',
  restaurant: 3,
  restaurant_name: 'Server Name',
  table_number: 'DI-12',
  type: 'dine_in',
  status: 'completed',
  order_time: '2026-10-01T07:39:00Z',
  subtotal: '1200.00',
  discount_amount: '120.00',
  notes: '[Disc] 10% = 120.00 | Reason: Regular customer | By: A | At: 2026-10-01T07:40:00.000Z',
  service_charge: '108.00',
  tax_amount: '54.01',
  total_amount: '1242.01',
  items: [
    { id: 1, menu_item: 1, menu_item_name: 'Paneer Tikka', quantity: 1, unit_price: '280.00', total_price: '280.00', status: 'served' },
    { id: 2, menu_item: 1, menu_item_name: 'Paneer Tikka', quantity: 1, unit_price: '280.00', total_price: '280.00', status: 'served' },
    { id: 3, menu_item: 2, menu_item_name: 'Dal Makhani', quantity: 2, unit_price: '320.00', total_price: '640.00', status: 'served', special_instructions: 'Less spicy' },
    { id: 4, menu_item: 9, menu_item_name: 'Cancelled Soup', quantity: 1, unit_price: '150.00', total_price: '150.00', status: 'cancelled' },
  ],
  payments: [
    { id: 1, method: 'cash', amount: '1000.00', status: 'completed', notes: 'Cash received 1000.00, change returned 0.00' },
    { id: 2, method: 'mobile_payment', amount: '242.01', status: 'completed', notes: 'Paid via Paytm' },
    { id: 3, method: 'pay_later', amount: '50.00', status: 'completed' },
  ],
  ...overrides,
});

describe('buildBillModel', () => {
  test('combines identical lines, skips cancelled items and keeps totals from the server', () => {
    const m = buildBillModel(order(), { settings: indiaSettings(), serverName: 'Ravi', ...INDIA });
    expect(m.title).toBe('TAX INVOICE');
    expect(m.header).toMatchObject({ name: 'Spice <Garden>', taxIdLabel: 'GSTIN', taxId: '29ABCDE1234F1Z5', licenceLabel: 'FSSAI Lic. No' });
    expect(m.lines).toEqual([
      { name: 'Paneer Tikka', qty: 2, rate: 280, amount: 560 },
      { name: 'Dal Makhani', qty: 2, rate: 320, amount: 640 },
    ]);
    expect(m.totalQty).toBe(4);
    expect(m.itemsTotal).toBe(1200);
    expect(m.discount).toEqual({ amount: 120, label: 'Disc (10%)' });
    expect(m.total).toBe(1242.01);
    expect(m.date).toBe('01 Oct 2026, 01:09 pm');
    expect(m.fmt(100799)).toBe('1,00,799.00');
  });

  test('India profile splits tax into CGST + SGST that add back to the tax amount', () => {
    const m = buildBillModel(order(), { settings: indiaSettings() });
    expect(m.taxes).toEqual([{ label: 'CGST', amount: 27.01 }, { label: 'SGST', amount: 27 }]);
    const single = buildBillModel(order(), { settings: indiaSettings({ tax: { ...taxSettingsFromProfile('IN'), mode: 'single' } }) });
    expect(single.taxes).toEqual([{ label: 'GST', amount: 54.01 }]);
  });

  test('payments: split methods, cash change, pay_later is not money received', () => {
    const m = buildBillModel(order(), { settings: indiaSettings() });
    expect(m.payments.map((p) => [p.label, p.amount])).toEqual([['Cash', 1000], ['Paytm', 242.01]]);
    expect(m.cash).toEqual({ received: 1000, change: 0 });
    expect(m.balance).toBe(0);
    expect(m.status).toBe('paid');
  });

  test('without a tax registration the receipt title is used; unpaid and credit states', () => {
    const base = defaultPrintSettings('IN');
    const noTaxId = normalizePrintSettings({ ...base, header: { ...base.header, name: 'X' } });
    const unpaid = buildBillModel(order({ status: 'served', payments: [] }), { settings: noTaxId });
    expect(unpaid.title).toBe('BILL');
    expect(unpaid.status).toBe('unpaid');
    expect(unpaid.balance).toBe(1242.01);
    expect(buildBillModel(order({ status: 'outstanding', payments: [] }), { settings: noTaxId }).status).toBe('credit');
  });

  test('UAE: VAT on one line, TRN label, tax invoice title, AED with code on the total', () => {
    const base = defaultPrintSettings('AE');
    const s = normalizePrintSettings({ ...base, header: { ...base.header, name: 'Al Noor Cafe', taxId: '100123456700003' } });
    const m = buildBillModel(order({ tax_amount: '57.50' }), { settings: s, locale: 'en-AE', currency: 'AED', decimals: 2, timeZone: 'Asia/Dubai' });
    expect(m.title).toBe('TAX INVOICE');
    expect(m.taxes).toEqual([{ label: 'VAT', amount: 57.5 }]);
    const html = toBillHtml(m, 'thermal80');
    expect(html).toContain('TRN: 100123456700003');
    expect(html).toContain('GRAND TOTAL (AED)');
    expect(html).not.toContain('GSTIN');
    expect(html).not.toContain('CGST');
  });

  test('US: sales tax, receipt title, Letter paper, 2 decimals in en-US', () => {
    const s = normalizePrintSettings({ ...defaultPrintSettings('US'), header: { ...defaultPrintSettings('US').header, name: 'Diner' } });
    expect(s.sheetSize).toBe('Letter');
    const m = buildBillModel(order({ total_amount: '100799.00' }), { settings: s, locale: 'en-US', currency: 'USD', decimals: 2, timeZone: 'America/New_York' });
    expect(m.title).toBe('RECEIPT');
    expect(m.taxes[0].label).toBe('Sales Tax');
    expect(m.fmt(100799)).toBe('100,799.00');
    expect(m.date).toBe('Oct 01, 2026, 03:39 am');
    expect(toBillHtml(m, 'sheet', s.sheetSize)).toContain('size: letter');
  });

  test('zero-decimal currency (JPY)', () => {
    const m = buildBillModel(order(), { settings: indiaSettings(), locale: 'ja-JP', currency: 'JPY', decimals: 0 });
    expect(m.fmt(1242.01)).toBe('1,242');
  });

  test('falls back to the restaurant name from the order', () => {
    const m = buildBillModel(order(), { settings: normalizePrintSettings({}) });
    expect(m.header.name).toBe('Server Name');
  });
});

describe('bill HTML', () => {
  test.each([
    ['thermal80', 'width: 72mm'],
    ['thermal58', 'width: 48mm'],
    ['sheet', 'size: A4'],
  ])('%s layout', (format, css) => {
    const html = toBillHtml(buildBillModel(order(), { settings: indiaSettings(), serverName: 'Ravi', ...INDIA }), format);
    expect(html).toContain(css);
    expect(html).toContain('Spice &lt;Garden&gt;');
    expect(html).not.toContain('Spice <Garden>');
    expect(html).toContain('MG Road<br>Bengaluru');
    expect(html).toContain('GSTIN: 29ABCDE1234F1Z5');
    expect(html).toContain('FSSAI Lic. No: 11223344556677');
    expect(html).toContain('Disc (10%)');
    expect(html).toContain('-120.00');
    expect(html).toContain('CGST');
    expect(html).toContain('1,242.01');
    expect(html).toContain('(INR)');
    expect(html).toContain('Paytm');
    expect(html).not.toContain('Cancelled Soup');
    // Kitchen notes are for the KOT only
    expect(html).not.toContain('Less spicy');
  });

  test('duplicate mark on reprints', () => {
    const html = toBillHtml(buildBillModel(order(), { settings: indiaSettings(), duplicate: true }), 'thermal80');
    expect(html).toContain('DUPLICATE');
  });
});

describe('KOT', () => {
  const kot = {
    orderNumber: 'ORD-9', tableNumber: '5', orderType: 'dine_in', isAddition: true, timestamp: '2026-10-01T07:39:00Z',
    items: [{ quantity: 2, menu_item_name: 'Butter <Naan>', special_instructions: 'Extra butter' }],
  };

  test('model and copies in one job', () => {
    const models = [1, 2].map((copy) => buildKotModel(kot, { serverName: 'Ravi', ...INDIA, copy, copies: 2 }));
    expect(models[0]).toMatchObject({ table: '5', isAddition: true, totalQty: 2, time: '01 Oct 2026, 01:09 pm' });
    const html = toKotHtml(models, 'thermal80');
    expect(html).toContain('KOT - NEW ITEMS');
    expect(html).toContain('TABLE 5');
    expect(html).toContain('Butter &lt;Naan&gt;');
    expect(html).toContain('Extra butter');
    expect(html).toContain('Copy 2 of 2');
    expect(html.match(/page-break-after/g)).toHaveLength(1);
  });

  test.each([
    ['thermal80', 'A4', 'width: 72mm'],
    ['thermal58', 'A4', 'width: 48mm'],
    ['sheet', 'A4', 'size: A5'],
    ['sheet', 'Letter', 'size: 5.5in 8.5in'],
  ])('%s layout on %s', (format, sheetSize, css) => {
    expect(toKotHtml(buildKotModel(kot), format, sheetSize)).toContain(css);
  });
});

describe('tax profiles', () => {
  test('country names and codes map to profiles', () => {
    expect(profileKeyForCountry('India')).toBe('IN');
    expect(profileKeyForCountry('ae')).toBe('AE');
    expect(profileKeyForCountry('United States')).toBe('US');
    expect(profileKeyForCountry('Germany')).toBe('EU');
    expect(profileKeyForCountry('FR')).toBe('EU');
    expect(profileKeyForCountry('Kenya')).toBe('OTHER');
    expect(profileKeyForCountry('')).toBe('OTHER');
  });

  test('split components always add up to the tax amount', () => {
    const tax = { mode: 'split', components: [{ label: 'A', share: 33.33 }, { label: 'B', share: 33.33 }, { label: 'C', share: 33.34 }] };
    const lines = buildTaxLines(10, tax);
    expect(lines.reduce((sum, l) => Math.round((sum + l.amount) * 100) / 100, 0)).toBe(10);
    expect(buildTaxLines(0, tax)).toEqual([]);
    expect(buildTaxLines(5, { mode: 'single', singleLabel: 'VAT' })).toEqual([{ label: 'VAT', amount: 5 }]);
  });

  test('validation', () => {
    expect(validateTaxComponents({ mode: 'split', components: [{ label: 'A', share: 60 }, { label: 'B', share: 30 }] })).toMatch(/100%/);
    expect(validateTaxComponents({ mode: 'split', components: [{ label: 'A', share: 50 }, { label: '', share: 50 }] })).toMatch(/name/);
    expect(validateTaxComponents({ mode: 'single' })).toBeNull();
    expect(validateTaxId('IN', '29ABCDE1234F1Z5')).toBeNull();
    expect(validateTaxId('IN', '29ABCDE1234F1Z')).toMatch(/GSTIN/);
    expect(validateTaxId('GB', 'GB 123 4567 89')).toBeNull();
    expect(validateTaxId('AE', 'x')).toMatch(/3 to 30/);
    expect(validateLicence('11223344556677')).toBeNull();
    expect(validateLicence('#')).toMatch(/3 to 30/);
  });
});

describe('regional format', () => {
  test('hotel currency, locale and time zone with device fallback', () => {
    expect(resolveRegionalFormat({ currency: 'inr', timezone: 'Asia/Kolkata', country: 'India' }, 'en-US'))
      .toEqual({ timeZone: 'Asia/Kolkata', locale: 'en-IN', currency: 'INR', decimals: 2, country: 'India' });
    expect(resolveRegionalFormat({ currency: 'JPY' }, 'en-US')).toMatchObject({ locale: 'ja-JP', decimals: 0 });
    expect(resolveRegionalFormat({ timezone: 'Not/AZone' }, 'fr-FR')).toMatchObject({ timeZone: undefined, locale: 'fr-FR', currency: '' });
    expect(currencyDecimals('KWD')).toBe(3);
  });
});

describe('helpers and settings', () => {
  test('escape and amount format', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(formatAmount(100799, 'en-IN', 2)).toBe('1,00,799.00');
    expect(formatAmount(100799, 'de-DE', 2)).toBe('100.799,00');
  });

  test('defaults follow the country', () => {
    expect(defaultPrintSettings('India').tax).toMatchObject({ profile: 'IN', mode: 'split' });
    expect(defaultPrintSettings('GB')).toMatchObject({ sheetSize: 'A4', header: { taxIdLabel: 'VAT Reg No.' }, tax: { mode: 'single', singleLabel: 'VAT' } });
    expect(defaultPrintSettings('US').sheetSize).toBe('Letter');
    expect(defaultPrintSettings().tax.profile).toBe('OTHER');
  });

  test('settings saved before tax profiles are migrated as India', () => {
    const migrated = normalizePrintSettings({ billFormat: 'sheet', header: { name: 'Old', gstin: '29ABCDE1234F1Z5', fssai: '11223344556677' }, splitTax: false });
    expect(migrated.header).toMatchObject({ name: 'Old', taxIdLabel: 'GSTIN', taxId: '29ABCDE1234F1Z5', licenceLabel: 'FSSAI Lic. No', licence: '11223344556677' });
    expect(migrated.tax).toMatchObject({ profile: 'IN', mode: 'single' });
    expect(migrated.billFormat).toBe('sheet');
  });

  test('normalize drops invalid values', () => {
    expect(normalizePrintSettings({ billFormat: 'laser', kotCopies: 9, sheetSize: 'B5', tax: { profile: 'XX', mode: 'odd' } }))
      .toMatchObject({ billFormat: 'thermal80', kotCopies: 3, sheetSize: 'A4', tax: { profile: 'OTHER', mode: 'single' } });
  });

  test('saved per restaurant and falls back to the active restaurant', () => {
    localStorage.clear();
    expect(printSettingsService.get(1).saved).toBe(false);
    expect(printSettingsService.get(1, 'United Arab Emirates').tax.profile).toBe('AE');
    printSettingsService.save(1, { ...defaultPrintSettings('IN'), billFormat: 'sheet' });
    printSettingsService.save(2, { ...defaultPrintSettings('US'), billFormat: 'thermal58' });
    expect(printSettingsService.get(1, 'US')).toMatchObject({ billFormat: 'sheet', saved: true, tax: { profile: 'IN' } });
    expect(printSettingsService.get(2).billFormat).toBe('thermal58');
    printSettingsService.setActiveRestaurant(1);
    expect(printSettingsService.get(undefined).billFormat).toBe('sheet');
  });
});

describe('server order and payment fields on bills', () => {
  test('invoice number, guests, cash received and change from payment fields', () => {
    const m = buildBillModel(order({
      invoice_number: 'INV/26-27/000731',
      guest_count: 4,
      payments: [{ id: 9, method: 'cash', amount: '1242.01', status: 'completed', amount_received: '1300.00', change_returned: '57.99' }],
    }), { settings: indiaSettings(), serverName: 'Ravi', ...INDIA });
    expect(m).toMatchObject({ invoiceNo: 'INV/26-27/000731', guests: 4, cash: { received: 1300, change: 57.99 } });
    const html = toBillHtml(m, 'thermal80');
    expect(html).toContain('Invoice: INV/26-27/000731');
    expect(html).toContain('Guests: 4');
    expect(toBillHtml(m, 'sheet')).toContain('Invoice No:');
  });
});
