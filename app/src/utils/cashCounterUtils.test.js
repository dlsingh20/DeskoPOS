import {
  busyCounters,
  buildShiftReportHtml,
  counterRequirement,
  denominationTotal,
  describeVariance,
  isStaleShift,
  seesExpectedCash,
  shiftCounterName,
  shiftFigures,
  sortCounters,
  summarizePosPayments,
  validateAmount,
} from './cashCounterUtils';

const access = (role, permissions = ['bill.settle']) => ({ role, permissions: new Set(permissions) });

describe('who opens a counter', () => {
  test('cashiers and managers must, administrators may skip, others never', () => {
    expect(counterRequirement(access('cashier'))).toEqual({ required: true, canSkip: false });
    expect(counterRequirement(access('manager'))).toEqual({ required: true, canSkip: false });
    expect(counterRequirement(access('administrator'))).toEqual({ required: false, canSkip: true });
    expect(counterRequirement(access('cashier', []))).toEqual({ required: false, canSkip: false });
    expect(counterRequirement(null)).toEqual({ required: false, canSkip: false });
  });

  test('only managers and administrators see the expected cash', () => {
    expect(seesExpectedCash(access('cashier'))).toBe(false);
    expect(seesExpectedCash(access('manager'))).toBe(true);
    expect(seesExpectedCash(access('administrator'))).toBe(true);
  });
});

describe('counters and shifts', () => {
  const shifts = [
    { id: 1, status: 'open', counter_ref: 1, cashier: 42 },
    { id: 2, status: 'open', counter_ref: 2, cashier: 7 },
    { id: 3, status: 'closed', counter_ref: 3, cashier: 7 },
  ];

  test('counters open by someone else are busy; your own and closed ones are not', () => {
    const busy = busyCounters(shifts, 42);
    expect([...busy.keys()]).toEqual([2]);
    expect(busy.get(2).id).toBe(2);
  });

  test('display order, then name', () => {
    expect(sortCounters([{ name: 'B', sort_order: 1 }, { name: 'A', sort_order: 1 }, { name: 'Z', sort_order: 0 }]).map((c) => c.name)).toEqual(['Z', 'A', 'B']);
  });

  test('counter name from the list, then the shift snapshot', () => {
    expect(shiftCounterName({ counter_ref: 1 }, [{ id: 1, name: 'Bar' }])).toBe('Bar');
    expect(shiftCounterName({ counter_ref: 9, counter_snapshot: 'Old counter' }, [])).toBe('Old counter');
  });

  test('a shift open longer than 14 hours is flagged', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(isStaleShift({ status: 'open', opened_at: '2026-10-19T20:00:00Z' }, now)).toBe(true);
    expect(isStaleShift({ status: 'open', opened_at: '2026-10-20T08:00:00Z' }, now)).toBe(false);
    expect(isStaleShift({ status: 'closed', opened_at: '2026-10-18T08:00:00Z' }, now)).toBe(false);
  });
});

describe('cash figures', () => {
  test('expected = opening + received − paid out when the server has not worked it out', () => {
    const f = shiftFigures({ opening_balance: '2000.00', cash_receipts: '13500.00', cash_payments: '500.00', physical_count: '14980.00' });
    expect(f).toEqual({ opening: 2000, received: 13500, paidOut: 500, expected: 15000, counted: 14980, variance: -20, byMethod: [], grandTotal: null, posByMethod: [] });
  });

  test('live totals from the server: expected cash, cash line and the split by method', () => {
    const f = shiftFigures({
      opening_balance: '2000.00',
      totals: {
        expected_cash: '3500.00',
        grand_total: '4700.00',
        by_method: [{ payment_method: 'cash', total: '1500.00', count: 3 }, { payment_method: 'mobile_payment', total: '3200.00', count: 2 }],
      },
    });
    expect(f.expected).toBe(3500);
    expect(f.received).toBe(1500);
    expect(f.grandTotal).toBe(4700);
    expect(f.byMethod).toEqual([{ method: 'cash', total: 1500, count: 3 }, { method: 'mobile_payment', total: 3200, count: 2 }]);
  });

  test('totals sent as JSON text; no cash line → cash received from expected', () => {
    const f = shiftFigures({ opening_balance: '100', cash_payments: '20', totals: '{"expected_cash":"580.00","by_method":[]}' });
    expect(f.expected).toBe(580);
    expect(f.received).toBe(500);
  });

  test('the server figures win when present', () => {
    const f = shiftFigures({ opening_balance: '0', calculated_closing: '100.00', physical_count: '90.00', variance: '-10.00' });
    expect(f.expected).toBe(100);
    expect(f.variance).toBe(-10);
  });

  test('not counted yet → no difference', () => {
    expect(shiftFigures({ opening_balance: '100' }).variance).toBeNull();
  });

  test('describe the difference', () => {
    expect(describeVariance(0)).toBe('Balanced');
    expect(describeVariance(20)).toBe('Over 20.00');
    expect(describeVariance(-5.5)).toBe('Short 5.50');
    expect(describeVariance(null)).toBe('—');
  });

  test('count by denomination', () => {
    expect(denominationTotal({ 500: 3, 100: '2', 10: 4 }, '7.50')).toBe(1747.5);
    expect(denominationTotal({ 500: -1, 100: 1.9 })).toBe(100);
  });

  test('amount validation', () => {
    expect(validateAmount('')).toMatch(/Enter/);
    expect(validateAmount('', 2, { required: false })).toBeNull();
    expect(validateAmount('10.5')).toBeNull();
    expect(validateAmount('10.555')).toMatch(/2 decimals/);
    expect(validateAmount('10.5', 0)).toMatch(/whole/);
    expect(validateAmount('-1')).toBeTruthy();
  });
});

describe('POS bills on a shift', () => {
  const payments = [
    { id: 1, method: 'cash', amount: '500.00', processed_by: 42, processed_at: '2026-10-20T10:00:00Z', status: 'completed' },
    { id: 2, method: 'cash', amount: '300.00', refunded_amount: '100.00', processed_by: 42, processed_at: '2026-10-20T11:00:00Z', status: 'partially_refunded' },
    { id: 3, method: 'mobile_payment', amount: '700.00', processed_by: 42, processed_at: '2026-10-20T11:30:00Z', status: 'completed' },
    { id: 4, method: 'cash', amount: '999.00', processed_by: 7, processed_at: '2026-10-20T10:00:00Z', status: 'completed' },
    { id: 5, method: 'cash', amount: '50.00', processed_by: 42, processed_at: '2026-10-20T08:00:00Z', status: 'completed' },
    { id: 6, method: 'cash', amount: '80.00', processed_by: 42, processed_at: '2026-10-20T10:30:00Z', status: 'failed' },
  ];

  test("only this cashier's completed payments while the shift was open, net of refunds", () => {
    const pos = summarizePosPayments(payments, { cashierId: 42, from: '2026-10-20T09:00:00Z' });
    expect(pos.cash).toBe(700);
    expect(pos.byMethod).toEqual([{ method: 'cash', total: 700, count: 2 }, { method: 'mobile_payment', total: 700, count: 1 }]);
    expect(pos.linked).toBe(false);
    expect(summarizePosPayments(payments, { cashierId: 42, from: '2026-10-20T09:00:00Z', to: '2026-10-20T10:30:00Z' }).cash).toBe(500);
  });

  test('POS cash is added to cash received and the expected cash; the difference is worked out here', () => {
    const pos = summarizePosPayments(payments, { cashierId: 42, from: '2026-10-20T09:00:00Z' });
    const f = shiftFigures({ opening_balance: '1000.00', totals: { expected_cash: '1000.00', grand_total: '0.00', by_method: [] }, physical_count: '1690.00', variance: '690.00', posTakings: pos });
    expect(f.received).toBe(700);
    expect(f.expected).toBe(1700);
    expect(f.variance).toBe(-10);
    expect(f.grandTotal).toBe(1400);
    expect(f.posByMethod).toHaveLength(2);
  });

  test('once payments carry cash_register the server counts them and nothing is added', () => {
    const pos = summarizePosPayments([{ ...payments[0], cash_register: 311 }], { cashierId: 42, from: '2026-10-20T09:00:00Z' });
    expect(pos.linked).toBe(true);
    expect(shiftFigures({ opening_balance: '1000.00', totals: { expected_cash: '1500.00' }, posTakings: pos }).expected).toBe(1500);
  });
});

describe('shift report', () => {
  const shift = {
    cashier_name: 'Asha <K>', opening_balance: '2000', cash_receipts: '13500', cash_payments: '0',
    physical_count: '15480', opened_at: '2026-10-20T03:30:00Z', closed_at: '2026-10-20T12:00:00Z', closed_by_name: 'Asha K',
  };

  test('Z report with expected cash and the difference, names escaped', () => {
    const html = buildShiftReportHtml({ shift, counterName: 'Counter 1' });
    expect(html).toContain('SHIFT CLOSE (Z REPORT)');
    expect(html).toContain('Expected in drawer');
    expect(html).toContain('Short 20.00');
    expect(html).toContain('Asha &lt;K&gt;');
  });

  test('blind report shows only opening cash and the count', () => {
    const html = buildShiftReportHtml({ shift, counterName: 'Counter 1', showExpected: false });
    expect(html).not.toContain('Expected in drawer');
    expect(html).not.toContain('Short');
    expect(html).toContain('Counted');
  });
});
