import { classifyBill } from './historyUtils';
import { taxSettingsFromProfile } from './taxProfiles';
import {
  REPORTS,
  computeTotals,
  effectiveStatus,
  filterReportBills,
  parseTips,
  resolveReportRange,
} from './reportUtils';

const TZ = 'Asia/Kolkata';
let id = 1;
const pay = (method, amount, status = 'completed', notes = '') => ({ id: id++, method, amount: String(amount), status, notes, processed_at: '2026-10-01T08:00:00Z' });
const item = (menuItem, name, qty, price, extra = {}) => ({ id: id++, menu_item: menuItem, menu_item_name: name, quantity: qty, unit_price: String(price), total_price: String(qty * price), status: 'served', created_at: '2026-10-01T07:00:00Z', ...extra });

const order = (o = {}) => ({
  id: id++,
  order_number: `B${id}`,
  table_number: '5',
  type: 'dine_in',
  status: 'completed',
  subtotal: '1000.00',
  discount_amount: '0.00',
  service_charge: '0.00',
  tax_amount: '50.00',
  total_amount: '1050.00',
  order_time: '2026-10-01T07:30:00Z', // 13:00 in Kolkata
  updated_at: '2026-10-01T08:00:00Z',
  server: 7,
  notes: '',
  items: [item(1, 'Paneer Tikka', 2, 300), item(2, 'Naan', 5, 80)],
  payments: [pay('cash', 1050)],
  ...o,
});

const bills = [
  classifyBill(order()),
  classifyBill(order({
    order_time: '2026-10-01T15:45:00Z', // 21:15 in Kolkata
    table_number: '7',
    server: 9,
    discount_amount: '100.00',
    total_amount: '950.00',
    notes: '[Disc] 10% = 100.00 | Reason: Staff | By: Cashier A | Approved: Manager B | At: 2026-10-01T15:50:00.000Z',
    payments: [pay('mobile_payment', 500, 'completed', 'Paid via Paytm | Tip 40.00 via Cash for Ravi K (staff #12)'), pay('credit_card', 450)],
  })),
  classifyBill(order({ order_time: '2026-09-30T20:00:00Z', status: 'outstanding', table_number: '', type: 'takeaway', payments: [], server: null, customer_name: 'R. Kumar' })), // 1 Oct 01:30 IST
  classifyBill(order({
    status: 'cancelled', payments: [],
    items: [item(3, 'Soup', 1, 150, { status: 'cancelled' })],
    notes: '[Void] Remove 1 x Soup | Approved: Manager B | At: 2026-10-01T09:00:00.000Z',
  })),
  classifyBill(order({ order_time: '2026-10-02T06:00:00Z', payments: [{ ...pay('room_charge', 1050), processed_at: '2026-10-02T06:40:00Z' }], updated_at: '2026-10-02T06:40:00Z', items: [item(1, 'Paneer Tikka', 1, 300), item(4, 'Coffee', 2, 100, { status: 'cancelled' })] })),
];

const ctx = (filters = {}) => ({
  timeZone: TZ,
  staffName: (sid) => ({ 7: 'Asha', 9: 'Ravi K' }[sid] || `Staff #${sid}`),
  itemCategory: (m) => ({ 1: 'Starters', 2: 'Breads' }[m] || ''),
  taxSettings: taxSettingsFromProfile('IN'),
  filters: { status: 'sales', category: 'all', ...filters },
  describePayments: () => '',
  now: new Date('2026-10-05T00:00:00Z'),
});

const run = (key, filters = {}) => {
  const report = REPORTS.find((r) => r.key === key);
  const f = { ...filters, status: effectiveStatus(report, filters.status) };
  return report.compute(filterReportBills(bills, f), ctx(f));
};

describe('date presets', () => {
  const now = new Date('2026-10-11T10:00:00Z'); // Sunday 11 Oct in Kolkata
  test('last 7 and 30 days end yesterday', () => {
    expect(resolveReportRange({ preset: 'last7' }, TZ, now)).toMatchObject({ fromDate: '2026-10-04', toDate: '2026-10-10' });
    expect(resolveReportRange({ preset: 'last30' }, TZ, now)).toMatchObject({ fromDate: '2026-09-11', toDate: '2026-10-10' });
    expect(resolveReportRange({ preset: 'yesterday' }, TZ, now).from.toISOString()).toBe('2026-10-09T18:30:00.000Z');
  });
  test('weeks start on Monday; months', () => {
    expect(resolveReportRange({ preset: 'thisWeek' }, TZ, now)).toMatchObject({ fromDate: '2026-10-05', toDate: '2026-10-11' });
    expect(resolveReportRange({ preset: 'lastWeek' }, TZ, now)).toMatchObject({ fromDate: '2026-09-28', toDate: '2026-10-04' });
    expect(resolveReportRange({ preset: 'thisMonth' }, TZ, now)).toMatchObject({ fromDate: '2026-10-01', toDate: '2026-10-11' });
    expect(resolveReportRange({ preset: 'lastMonth' }, TZ, now)).toMatchObject({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    expect(resolveReportRange({ preset: 'lastMonth' }, TZ, new Date('2026-03-15T10:00:00Z'))).toMatchObject({ fromDate: '2026-02-01', toDate: '2026-02-28' });
  });
  test('custom range includes the end minute', () => {
    const r = resolveReportRange({ preset: 'custom', customFrom: '2026-10-01', customTo: '2026-10-01', customFromTime: '10:00', customToTime: '22:00' }, TZ, now);
    expect(r.from.toISOString()).toBe('2026-10-01T04:30:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-01T16:31:00.000Z');
  });
});

describe('filters', () => {
  test('status, type, payment, table, server, search', () => {
    expect(filterReportBills(bills, { status: 'sales' })).toHaveLength(4);
    expect(filterReportBills(bills, { status: 'pending' })).toHaveLength(1);
    expect(filterReportBills(bills, { status: 'cancelled' })).toHaveLength(1);
    expect(filterReportBills(bills, { status: 'all', billType: 'takeaway' })).toHaveLength(1);
    expect(filterReportBills(bills, { status: 'sales', payment: 'upi' })).toHaveLength(1);
    expect(filterReportBills(bills, { status: 'sales', table: '7' })).toHaveLength(1);
    expect(filterReportBills(bills, { status: 'sales', server: 'none' })).toHaveLength(1);
    expect(filterReportBills(bills, { status: 'all', search: bills[1].billNo })).toHaveLength(1);
  });
});

describe('reports', () => {
  test('sales summary', () => {
    const r = run('summary');
    const value = (metric) => r.rows.find((x) => x.metric === metric).value;
    expect(value('Bills')).toBe(4);
    expect(value('Total (bill value)')).toBe(1050 + 950 + 1050 + 1050);
    expect(value('Discounts')).toBe(-100);
    expect(value('Cash')).toBe(1050);
    expect(value('UPI / wallets')).toBe(500);
    expect(value('Card')).toBe(450);
    expect(value('Guest Visit (room charge)')).toBe(1050);
    expect(value('Pending collection')).toBe(1050);
    expect(value('Cancelled bills')).toBe(1);
  });

  test('day-wise groups by the restaurant date and totals add up', () => {
    const r = run('daywise');
    expect(r.rows.map((x) => [x.date, x.bills])).toEqual([['2026-10-01', 3], ['2026-10-02', 1]]);
    expect(computeTotals(r).total).toBe(4100);
  });

  test('a bill ordered late one day and settled after midnight counts on the settlement day', () => {
    const late = classifyBill(order({
      order_time: '2026-10-02T18:00:00Z', // 23:30 on 2 Oct in Kolkata
      closed_at: '2026-10-02T19:15:00Z', // 00:45 on 3 Oct
      payments: [{ ...pay('cash', 1050), processed_at: '2026-10-02T19:15:00Z' }],
    }));
    const r = REPORTS.find((x) => x.key === 'daywise').compute([late], ctx());
    expect(r.rows.map((x) => x.date)).toEqual(['2026-10-03']);
  });

  test('bill-wise leaves cancelled bills out of the totals', () => {
    const r = run('billwise', { status: 'all' });
    expect(r.rows).toHaveLength(5);
    expect(computeTotals(r).total).toBe(4100);
  });

  test('payment modes list wallets separately and include credit', () => {
    const r = run('payments');
    const amount = (m) => r.rows.find((x) => x.method === m)?.amount;
    expect(amount('Paytm')).toBe(500);
    expect(amount('Credit Card')).toBe(450);
    expect(amount('Credit Pay (unpaid balance)')).toBe(1050);
    expect(r.totals.amount).toBe(1050 + 500 + 450 + 1050);
  });

  test('item-wise excludes cancelled items; category filter', () => {
    const r = run('items');
    const paneer = r.rows.find((x) => x.item === 'Paneer Tikka');
    expect(paneer).toMatchObject({ qty: 7, amount: 2100, category: 'Starters' });
    expect(r.rows.some((x) => x.item === 'Coffee')).toBe(false);
    const breads = REPORTS.find((x) => x.key === 'items').compute(filterReportBills(bills, { status: 'sales' }), ctx({ category: 'Breads' }));
    expect(breads.rows.map((x) => x.item)).toEqual(['Naan']);
  });

  test('category-wise', () => {
    const r = run('categories');
    expect(r.rows.map((x) => [x.category, x.qty, x.amount])).toEqual([['Starters', 7, 2100], ['Breads', 15, 1200]]);
  });

  test('hourly uses the restaurant time zone', () => {
    const r = run('hourly');
    expect(r.rows.map((x) => x.slot)).toEqual(['01:00 - 02:00', '11:00 - 12:00', '13:00 - 14:00', '21:00 - 22:00']);
  });

  test('discounts show reason, giver and approver', () => {
    const r = run('discounts');
    expect(r.rows).toEqual([expect.objectContaining({ percent: 10, discount: 100, reason: 'Staff', by: 'Cashier A', approvedBy: 'Manager B' })]);
  });

  test('cancellations include cancelled bills, cancelled items and approved voids', () => {
    const r = run('cancellations');
    expect(r.rows.map((x) => x.kind).sort()).toEqual(['Bill cancelled', 'Item cancelled', 'Item cancelled', 'Void approved']);
    expect(r.rows.find((x) => x.kind === 'Void approved').by).toBe('Manager B');
  });

  test('tax splits into the configured components and adds up', () => {
    const r = run('tax');
    const day1 = r.rows.find((x) => x.date === '2026-10-01');
    expect(day1).toMatchObject({ tax: 150, tax_CGST: 75, tax_SGST: 75, taxable: 3050 - 150 });
    expect(r.columns.map((c) => c.label)).toEqual(['Date', 'Bills', 'Taxable value', 'CGST', 'SGST', 'Total tax', 'Bill total']);
  });

  test('staff report with tips by waiter', () => {
    const r = run('staff');
    expect(r.rows.find((x) => x.server === 'Asha')).toMatchObject({ bills: 2, total: 2100 });
    expect(r.rows.find((x) => x.server === 'No server')).toMatchObject({ bills: 1 });
    const tipRow = r.rows.find((x) => x.tips > 0);
    expect(tipRow).toMatchObject({ tips: 40, tipCount: 1 });
  });

  test('table report skips takeaway and averages time', () => {
    const r = run('tables');
    expect(r.rows.map((x) => x.table)).toEqual(['5', '7']);
    expect(r.rows[0].avgMinutes).toBeGreaterThan(0);
  });

  test('credit report ages pending bills', () => {
    const r = run('credit');
    expect(r.rows).toEqual([expect.objectContaining({ customer: 'R. Kumar', balance: 1050, ageDays: 4 })]);
  });
});

describe('helpers', () => {
  test('tip parsing', () => {
    expect(parseTips('Paid via UPI | Tip 50.00 via Cash for Ravi K (staff #12) | x')).toEqual([{ amount: 50, method: 'Cash', staffName: 'Ravi K', staffId: '12' }]);
    expect(parseTips('Tip 20.00 via Card')).toEqual([{ amount: 20, method: 'Card', staffName: '', staffId: null }]);
    expect(parseTips('')).toEqual([]);
  });

  test('every report runs on an empty list', () => {
    REPORTS.forEach((report) => {
      const r = report.compute([], ctx());
      expect(Array.isArray(r.rows)).toBe(true);
      expect(r.columns.length).toBeGreaterThan(1);
    });
  });
});
