import { getPaymentLabel } from './historyUtils';
import {
  classifyBill,
  describePayments,
  filterBills,
  getItemsTotal,
  groupItemsByRound,
  matchesSearch,
  reconcileSummary,
  resolveDateRange,
  summarizeBills,
  zonedToDate,
} from './historyUtils';

const fmt = (n) => `₹${Number(n).toFixed(2)}`;

let nextId = 1;
const order = (overrides = {}) => ({
  id: nextId++,
  order_number: `ORD-${nextId}`,
  restaurant: 1,
  table: 5,
  table_number: '5',
  type: 'dine_in',
  status: 'completed',
  subtotal: '900.00',
  tax_amount: '45.00',
  service_charge: '55.00',
  discount_amount: '0.00',
  total_amount: '1000.00',
  order_time: '2026-10-01T07:30:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  items: [],
  payments: [],
  ...overrides,
});

const pay = (method, amount, status = 'completed', extra = {}) => ({
  id: nextId++, method, amount: String(amount), status, processed_at: '2026-10-01T07:55:00Z', ...extra,
});

describe('classifyBill', () => {
  test('fully paid cash bill is Completed with no balance', () => {
    const bill = classifyBill(order({ payments: [pay('cash', 1000)] }));
    expect(bill.state).toBe('paid');
    expect(bill.balance).toBe(0);
    expect(bill.collections.cash).toBe(1000);
    expect(bill.isPending).toBe(false);
    expect(bill.closedAt).toBe('2026-10-01T07:55:00Z');
  });

  test('split payment counts each method once', () => {
    const bill = classifyBill(order({ payments: [pay('cash', 400), pay('mobile_payment', 600, 'completed', { notes: 'Paid via Paytm' })] }));
    expect(bill.collections).toEqual({ cash: 400, card: 0, upi: 600, guestVisit: 0, other: 0 });
    expect(describePayments(bill, fmt)).toBe('Cash ₹400.00 + Paytm ₹600.00');
  });

  test('completed bill with a short payment is pending collection', () => {
    const bill = classifyBill(order({ payments: [pay('cash', 700)] }));
    expect(bill.state).toBe('completed_pending');
    expect(bill.balance).toBe(300);
    expect(bill.isPending).toBe(true);
  });

  test('Credit Pay bill with no payment is unpaid; pay_later rows are not money received', () => {
    const bill = classifyBill(order({ status: 'outstanding', payments: [pay('pay_later', 1000)] }));
    expect(bill.state).toBe('credit_unpaid');
    expect(bill.paid).toBe(0);
    expect(bill.balance).toBe(1000);
    expect(bill.paymentBuckets).toContain('credit');
  });

  test('credit bill partly paid', () => {
    const bill = classifyBill(order({ status: 'outstanding', payments: [pay('cash', 250)] }));
    expect(bill.state).toBe('credit_partial');
    expect(bill.balance).toBe(750);
  });

  test('a pending card payment covering the bill is settlement pending, not unpaid', () => {
    const bill = classifyBill(order({ payments: [pay('credit_card', 1000, 'pending')] }));
    expect(bill.state).toBe('settlement_pending');
    expect(bill.pendingConfirmation).toBe(1000);
    expect(bill.collections.card).toBe(0);
  });

  test('Guest Visit (room charge) is settled, not pending', () => {
    const bill = classifyBill(order({ payments: [pay('room_charge', 1000)] }));
    expect(bill.state).toBe('paid');
    expect(bill.collections.guestVisit).toBe(1000);
  });

  test('a credit bill written off on the outstanding desk leaves nothing pending', () => {
    const bill = classifyBill(order({ status: 'outstanding' }), { status: 'resolved', resolution_action: 'manager_writeoff' });
    expect(bill.state).toBe('written_off');
    expect(bill.balance).toBe(0);
    expect(bill.writtenOff).toBe(1000);
  });

  test('a credit bill transferred to AR is still pending collection', () => {
    const bill = classifyBill(order({ status: 'outstanding' }), { status: 'transferred_ar' });
    expect(bill.state).toBe('transferred_ar');
    expect(bill.isPending).toBe(true);
  });

  test('cancelled bills have no balance and are not billable', () => {
    const bill = classifyBill(order({ status: 'cancelled' }));
    expect(bill.state).toBe('cancelled');
    expect(bill.billable).toBe(false);
    expect(bill.balance).toBe(0);
    expect(describePayments(bill, fmt)).toBe('—');
  });

  test('refunded payments are not counted as collected', () => {
    const bill = classifyBill(order({ status: 'refunded', payments: [pay('cash', 1000, 'refunded')] }));
    expect(bill.state).toBe('refunded');
    expect(bill.paid).toBe(0);
    expect(bill.refunded).toBe(1000);
  });
});

describe('summarizeBills', () => {
  test('totals reconcile and cancelled/refunded bills are excluded from sales', () => {
    const bills = [
      classifyBill(order({ payments: [pay('cash', 1000)] })),
      classifyBill(order({ payments: [pay('cash', 300), pay('debit_card', 700)] })),
      classifyBill(order({ payments: [pay('mobile_payment', 1000)] })),
      classifyBill(order({ payments: [pay('room_charge', 1000)] })),
      classifyBill(order({ status: 'outstanding' })),
      classifyBill(order({ payments: [pay('cash', 600)] })),
      classifyBill(order({ status: 'outstanding' }), { status: 'written_off' }),
      classifyBill(order({ status: 'cancelled' })),
      classifyBill(order({ status: 'refunded', payments: [pay('cash', 1000, 'refunded')] })),
    ];
    const s = summarizeBills(bills);
    expect(s.bills).toBe(9);
    expect(s.total).toBe(7000);
    expect(s.cash).toBe(1900);
    expect(s.card).toBe(700);
    expect(s.upi).toBe(1000);
    expect(s.guestVisit).toBe(1000);
    expect(s.pendingCollection).toBe(1400);
    expect(s.writtenOff).toBe(1000);
    expect(s.tax).toBe(45 * 7);
    expect(s.cancelledCount).toBe(1);
    expect(s.cancelledValue).toBe(1000);
    expect(s.refundedCount).toBe(1);
    expect(reconcileSummary(s)).toBe(0);
  });

  test('overpayment is reported, not hidden', () => {
    const s = summarizeBills([classifyBill(order({ payments: [pay('cash', 1100)] }))]);
    expect(s.overpaid).toBe(100);
    expect(reconcileSummary(s)).toBe(0);
  });

  test('handles fractional amounts without floating point drift', () => {
    const bills = Array.from({ length: 10 }, () => classifyBill(order({ total_amount: '0.10', payments: [pay('cash', '0.10')] })));
    const s = summarizeBills(bills);
    expect(s.total).toBe(1);
    expect(s.cash).toBe(1);
  });
});

describe('filters and search', () => {
  const bills = [
    classifyBill(order({ order_number: '2610011', customer_name: 'Ravi Kumar', customer_phone: '+91 98765 43210', total_amount: '3661.00', payments: [pay('cash', 3661)] })),
    classifyBill(order({ order_number: '2609305', type: 'takeaway', table: null, table_number: null, total_amount: '2311.00', payments: [pay('room_charge', 2311)] })),
    classifyBill(order({ order_number: '2609304', status: 'cancelled', table_number: 'DI-12' })),
    classifyBill(order({ order_number: '2609303', status: 'outstanding', server: 7 })),
  ];

  test('search by bill number, name, mobile and amount', () => {
    expect(matchesSearch(bills[0], '#2610011')).toBe(true);
    expect(matchesSearch(bills[0], 'ravi')).toBe(true);
    expect(matchesSearch(bills[0], '98765')).toBe(true);
    expect(matchesSearch(bills[0], '3,661')).toBe(true);
    expect(matchesSearch(bills[0], '3661.00')).toBe(true);
    expect(matchesSearch(bills[1], 'ravi')).toBe(false);
  });

  test('status chips', () => {
    expect(filterBills(bills, { tab: 'sales', status: 'all' })).toHaveLength(4);
    expect(filterBills(bills, { tab: 'sales', status: 'completed' }).map((b) => b.billNo)).toEqual(['2610011', '2609305', '2609303']);
    expect(filterBills(bills, { tab: 'sales', status: 'cancelled' }).map((b) => b.billNo)).toEqual(['2609304']);
  });

  test('pending tab shows only bills awaiting collection', () => {
    expect(filterBills(bills, { tab: 'pending', status: 'all' }).map((b) => b.billNo)).toEqual(['2609303']);
  });

  test('bill type, payment, table and operator filters combine', () => {
    expect(filterBills(bills, { tab: 'sales', billType: 'takeaway' }).map((b) => b.billNo)).toEqual(['2609305']);
    expect(filterBills(bills, { tab: 'sales', payment: 'guestVisit' }).map((b) => b.billNo)).toEqual(['2609305']);
    expect(filterBills(bills, { tab: 'sales', payment: 'credit' }).map((b) => b.billNo)).toEqual(['2609303']);
    expect(filterBills(bills, { tab: 'sales', table: 'DI-12' }).map((b) => b.billNo)).toEqual(['2609304']);
    expect(filterBills(bills, { tab: 'sales', operator: '7' }).map((b) => b.billNo)).toEqual(['2609303']);
    expect(filterBills(bills, { tab: 'sales', billType: 'dine_in', status: 'cancelled', search: '2609304' })).toHaveLength(1);
  });
});

describe('items', () => {
  test('groups items saved together into rounds and excludes cancelled lines from the total', () => {
    const items = [
      { id: 1, quantity: 1, unit_price: '645.00', total_price: '645.00', created_at: '2026-10-01T07:30:00Z' },
      { id: 2, quantity: 2, unit_price: '100.00', total_price: '200.00', created_at: '2026-10-01T07:30:20Z' },
      { id: 3, quantity: 1, unit_price: '595.00', total_price: '595.00', created_at: '2026-10-01T07:50:00Z' },
      { id: 4, quantity: 1, unit_price: '50.00', total_price: '50.00', status: 'cancelled', created_at: '2026-10-01T07:50:10Z' },
    ];
    const rounds = groupItemsByRound(items);
    expect(rounds.map((r) => r.items.map((i) => i.id))).toEqual([[1, 2], [3, 4]]);
    expect(getItemsTotal(items)).toBe(1440);
  });
});

describe('dates in the restaurant time zone', () => {
  test('a day in Asia/Kolkata starts at 18:30 UTC the previous day', () => {
    expect(zonedToDate('2026-10-01', '00:00', 'Asia/Kolkata').toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  test('today and yesterday presets', () => {
    const now = new Date('2026-10-01T20:00:00Z'); // 1:30 am on 2 Oct in Kolkata
    const today = resolveDateRange({ preset: 'today' }, 'Asia/Kolkata', now);
    expect(today.fromDate).toBe('2026-10-02');
    expect(today.from.toISOString()).toBe('2026-10-01T18:30:00.000Z');
    expect(today.to.toISOString()).toBe('2026-10-02T18:30:00.000Z');
    const yesterday = resolveDateRange({ preset: 'yesterday' }, 'Asia/Kolkata', now);
    expect(yesterday.fromDate).toBe('2026-10-01');
  });

  test('custom range with times; reversed dates are swapped', () => {
    const r = resolveDateRange({ preset: 'custom', customFrom: '2026-10-02', customTo: '2026-10-01', customFromTime: '10:00', customToTime: '22:00' }, 'Asia/Kolkata');
    expect(r.from.toISOString()).toBe('2026-10-01T04:30:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-02T16:31:00.000Z');
  });

  test('DST zones resolve to the right offset', () => {
    expect(zonedToDate('2026-07-01', '00:00', 'Europe/London').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(zonedToDate('2026-01-01', '00:00', 'Europe/London').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('server fields', () => {
  test('payment channel field and closed_at', () => {
    expect(getPaymentLabel({ method: 'mobile_payment', channel: 'phonepe' })).toBe('PhonePe');
    expect(getPaymentLabel({ method: 'mobile_payment', notes: 'Paid via Paytm' })).toBe('Paytm');
    const bill = classifyBill(order({ closed_at: '2026-10-01T09:00:00Z', payments: [pay('cash', 1000)] }));
    expect(bill.closedAt).toBe('2026-10-01T09:00:00Z');
    const cancelled = classifyBill(order({ status: 'cancelled', cancelled_at: '2026-10-01T08:10:00Z' }));
    expect(cancelled.closedAt).toBe('2026-10-01T08:10:00Z');
  });
});
