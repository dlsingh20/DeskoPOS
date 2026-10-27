import discountService, {
  DiscountError,
  buildDiscountNote,
  computeDiscount,
  getDiscountInfo,
  parseDiscountNote,
} from './DiscountService';
import orderService from './OrderService';
import ApiClient from './ApiClient';
import historyService from './HistoryService';

jest.mock('./OrderService', () => ({ __esModule: true, default: { getOrder: jest.fn() } }));
jest.mock('./HistoryService', () => ({
  __esModule: true,
  default: { getCurrentUser: jest.fn() },
}));
jest.mock('./ApiClient', () => ({ __esModule: true, default: { patch: jest.fn(), post: jest.fn(), delete: jest.fn() } }));

const notFound = () => Promise.reject(Object.assign(new Error('Not found'), { response: { status: 404 } }));

/**
 * In-memory order: tax 5% and service charge 10% on the discounted subtotal,
 * so totals change the way a recalculating server would.
 */
const setupServer = ({ subtotal = 1200, discount = 0, status = 'served', payments = [], notes = 'Window seat', recalc = true } = {}) => {
  const server = { order: null, patches: [] };
  const build = (disc, orderNotes) => {
    const taxable = subtotal - disc;
    const service = Math.round(taxable * 0.1 * 100) / 100;
    const tax = Math.round(taxable * 0.05 * 100) / 100;
    return {
      id: 1,
      order_number: 'ORD-1',
      status,
      subtotal: subtotal.toFixed(2),
      discount_amount: disc.toFixed(2),
      service_charge: service.toFixed(2),
      tax_amount: tax.toFixed(2),
      total_amount: (taxable + service + tax).toFixed(2),
      notes: orderNotes,
      payments,
    };
  };
  server.order = build(discount, notes);
  const originalTotal = server.order.total_amount;
  orderService.getOrder.mockImplementation(async () => JSON.parse(JSON.stringify(server.order)));
  ApiClient.patch.mockImplementation(async (url, body) => {
    server.patches.push(body);
    const disc = parseFloat(body.discount_amount);
    server.order = build(disc, body.notes);
    if (!recalc) server.order.total_amount = originalTotal;
    return { data: server.order };
  });
  return server;
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: a backend without apply_discount / discount endpoints (PATCH path)
  ApiClient.post.mockImplementation(notFound);
  ApiClient.delete.mockImplementation(notFound);
  historyService.getCurrentUser.mockResolvedValue({ first_name: 'Nushrath', last_name: '' });
});

describe('computeDiscount', () => {
  test('percent is taken on the subtotal and rounded to paise', () => {
    expect(computeDiscount({ type: 'percent', value: '10', subtotal: '1200.00' })).toEqual({ amount: 120, percent: 10, error: null });
    expect(computeDiscount({ type: 'percent', value: '12.5', subtotal: '999.99' }).amount).toBe(125);
  });

  test('fixed amount', () => {
    expect(computeDiscount({ type: 'fixed', value: '150', subtotal: 1200 })).toMatchObject({ amount: 150, error: null });
    expect(computeDiscount({ type: 'fixed', value: '150', subtotal: 1200 }).percent).toBe(12.5);
  });

  test('rejects invalid values', () => {
    expect(computeDiscount({ type: 'percent', value: '0', subtotal: 1200 }).error).toMatch(/greater than zero/);
    expect(computeDiscount({ type: 'percent', value: '101', subtotal: 1200 }).error).toMatch(/100%/);
    expect(computeDiscount({ type: 'fixed', value: '1300', subtotal: 1200 }).error).toMatch(/more than the subtotal/);
    expect(computeDiscount({ type: 'fixed', value: '10.555', subtotal: 1200 }).error).toMatch(/2 decimal/);
    expect(computeDiscount({ type: 'fixed', value: '10', subtotal: 0 }).error).toMatch(/no subtotal/);
  });

  test('optional cap', () => {
    expect(computeDiscount({ type: 'percent', value: 25, subtotal: 1000, maxPercent: 20 }).error).toMatch(/limit is 20%/);
    expect(computeDiscount({ type: 'fixed', value: '250', subtotal: 1000, maxPercent: 20 }).error).toMatch(/limit is 20%/);
    expect(computeDiscount({ type: 'percent', value: 20, subtotal: 1000, maxPercent: 20 }).error).toBeNull();
  });
});

describe('discount note', () => {
  test('round trips type, percent, reason and operator', () => {
    const line = buildDiscountNote({ type: 'percent', value: '10', amount: 120, reason: 'Regular customer', by: 'Nushrath', at: new Date('2026-10-11T10:00:00Z') });
    expect(line).toBe('[Disc] 10% = 120.00 | Reason: Regular customer | By: Nushrath | At: 2026-10-11T10:00:00.000Z');
    expect(parseDiscountNote(`Window seat\n${line}`)).toEqual({
      type: 'percent', percent: 10, amount: 120, reason: 'Regular customer', by: 'Nushrath', approvedBy: '', at: '2026-10-11T10:00:00.000Z',
    });
  });

  test('records the approving manager', () => {
    const line = buildDiscountNote({ type: 'percent', value: '25', amount: 300, reason: 'Staff', by: 'Cashier A', approvedBy: 'Manager B', at: new Date('2026-10-11T10:00:00Z') });
    expect(line).toBe('[Disc] 25% = 300.00 | Reason: Staff | By: Cashier A | Approved: Manager B | At: 2026-10-11T10:00:00.000Z');
    expect(parseDiscountNote(line)).toMatchObject({ percent: 25, by: 'Cashier A', approvedBy: 'Manager B' });
  });

  test('flags a percent discount that no longer matches the subtotal', () => {
    const notes = buildDiscountNote({ type: 'percent', value: 10, amount: 120, reason: 'Staff', by: 'A' });
    expect(getDiscountInfo({ subtotal: '1200.00', discount_amount: '120.00', notes }).stale).toBe(false);
    const changed = getDiscountInfo({ subtotal: '1500.00', discount_amount: '120.00', notes });
    expect(changed.stale).toBe(true);
    expect(changed.expectedAmount).toBe(150);
  });

  test('a fixed discount is never stale', () => {
    const notes = buildDiscountNote({ type: 'fixed', value: '100', amount: 100, reason: 'Staff', by: 'A' });
    expect(getDiscountInfo({ subtotal: '1500.00', discount_amount: '100.00', notes })).toMatchObject({ type: 'fixed', stale: false });
  });
});

describe('applyDiscount (backend without apply_discount: PATCH and check)', () => {
  test('saves the amount and an audit line, keeping existing notes', async () => {
    const server = setupServer();
    const updated = await discountService.applyDiscount({ orderId: 1, type: 'percent', value: '10', reason: 'Regular customer', expectedSubtotal: '1200.00' });
    expect(server.patches).toHaveLength(1);
    expect(server.patches[0].discount_amount).toBe('120.00');
    expect(server.patches[0].notes).toMatch(/^Window seat\n\[Disc\] 10% = 120\.00 \| Reason: Regular customer \| By: Nushrath/);
    expect(updated.discount_amount).toBe('120.00');
    expect(parseFloat(updated.total_amount)).toBeLessThan(1380);
  });

  test('editing replaces the previous audit line', async () => {
    const old = buildDiscountNote({ type: 'fixed', value: '50', amount: 50, reason: 'Staff', by: 'A' });
    const server = setupServer({ discount: 50, notes: `Window seat\n${old}` });
    await discountService.applyDiscount({ orderId: 1, type: 'fixed', value: '100', reason: 'Complaint / service recovery', expectedSubtotal: 1200 });
    const notes = server.patches[0].notes;
    expect(notes.match(/\[Disc\]/g)).toHaveLength(1);
    expect(notes).toContain('Fixed 100.00');
  });

  test('removing clears the amount and the audit line', async () => {
    const old = buildDiscountNote({ type: 'fixed', value: '50', amount: 50, reason: 'Staff', by: 'A' });
    const server = setupServer({ discount: 50, notes: `Window seat\n${old}` });
    await discountService.removeDiscount({ orderId: 1, expectedSubtotal: 1200 });
    expect(server.patches[0]).toEqual({ discount_amount: '0.00', notes: 'Window seat' });
  });

  test('rejects closed orders without calling the server', async () => {
    const server = setupServer({ status: 'completed' });
    await expect(discountService.applyDiscount({ orderId: 1, type: 'percent', value: 10, reason: 'Staff' })).rejects.toThrow(/open bills/);
    expect(server.patches).toHaveLength(0);
  });

  test('rejects when the subtotal changed since the dialog opened', async () => {
    const server = setupServer();
    await expect(discountService.applyDiscount({ orderId: 1, type: 'percent', value: 10, reason: 'Staff', expectedSubtotal: 1000 }))
      .rejects.toThrow(/bill changed/);
    expect(server.patches).toHaveLength(0);
  });

  test('requires a reason', async () => {
    setupServer();
    await expect(discountService.applyDiscount({ orderId: 1, type: 'percent', value: 10, reason: ' ' })).rejects.toBeInstanceOf(DiscountError);
  });

  test('restores the previous discount when the server does not recalculate the total', async () => {
    const server = setupServer({ recalc: false });
    await expect(discountService.applyDiscount({ orderId: 1, type: 'percent', value: 10, reason: 'Staff', expectedSubtotal: 1200 }))
      .rejects.toThrow(/did not recalculate/);
    expect(server.patches).toHaveLength(2);
    expect(server.patches[1]).toEqual({ discount_amount: '0.00', notes: 'Window seat' });
  });

  test('restores the previous discount when the total would drop below the amount paid', async () => {
    const server = setupServer({ payments: [{ id: 1, method: 'cash', amount: '1300.00', status: 'completed' }] });
    await expect(discountService.applyDiscount({ orderId: 1, type: 'percent', value: 20, reason: 'Staff', expectedSubtotal: 1200 }))
      .rejects.toThrow(/already paid/);
    expect(server.patches[1].discount_amount).toBe('0.00');
  });
});

describe('applyDiscount / removeDiscount on the server', () => {
  test('POSTs type, value, reason, expected subtotal and approval', async () => {
    orderService.getOrder.mockResolvedValue({ id: 1, discount_type: 'percent', discount_percent: '25.00', discount_amount: '300.00', total_amount: '1035.00' });
    ApiClient.post.mockResolvedValue({ data: {} });
    const order = await discountService.applyDiscount({ orderId: 1, type: 'percent', value: '25', reason: 'Staff', expectedSubtotal: '1200.00', approvalId: 'apr_9' });
    expect(ApiClient.post).toHaveBeenCalledWith('/api/pos/api/orders/1/apply_discount/', {
      type: 'percent', value: '25.00', reason: 'Staff', expected_subtotal: '1200.00', approval_id: 'apr_9',
    });
    expect(ApiClient.patch).not.toHaveBeenCalled();
    expect(order.discount_percent).toBe('25.00');
  });

  test('server limit: error says a manager must approve', async () => {
    orderService.getOrder.mockResolvedValue({ id: 1 });
    ApiClient.post.mockRejectedValue({ response: { status: 403, data: { code: 'permission_denied', detail: 'Discounts above 10% need a manager approval.', approval_required: true } } });
    const error = await discountService.applyDiscount({ orderId: 1, type: 'percent', value: '25', reason: 'Staff', expectedSubtotal: 1200 }).catch((e) => e);
    expect(error).toBeInstanceOf(DiscountError);
    expect(error.approvalRequired).toBe(true);
    expect(error.message).toMatch(/manager approval/);
  });

  test('subtotal changed', async () => {
    orderService.getOrder.mockResolvedValue({ id: 1, subtotal: '1350.00' });
    ApiClient.post.mockRejectedValue({ response: { status: 409, data: { code: 'subtotal_changed' } } });
    await expect(discountService.applyDiscount({ orderId: 1, type: 'fixed', value: '100', reason: 'Staff', expectedSubtotal: 1200 })).rejects.toThrow(/bill changed/);
  });

  test('local checks run before the request', async () => {
    await expect(discountService.applyDiscount({ orderId: 1, type: 'fixed', value: '1300', reason: 'Staff', expectedSubtotal: 1200 })).rejects.toThrow(/more than the subtotal/);
    await expect(discountService.applyDiscount({ orderId: 1, type: 'fixed', value: '10', reason: '', expectedSubtotal: 1200 })).rejects.toThrow(/reason/);
    expect(ApiClient.post).not.toHaveBeenCalled();
  });

  test('remove uses DELETE', async () => {
    orderService.getOrder.mockResolvedValue({ id: 1, discount_amount: '0.00' });
    ApiClient.delete.mockResolvedValue({ status: 204 });
    await discountService.removeDiscount({ orderId: 1 });
    expect(ApiClient.delete).toHaveBeenCalledWith('/api/pos/api/orders/1/discount/');
    expect(ApiClient.patch).not.toHaveBeenCalled();
  });
});

describe('getDiscountInfo with server fields', () => {
  test('uses discount_type, percent, reason and people; never stale', () => {
    const info = getDiscountInfo({
      subtotal: '1500.00', discount_amount: '150.00', discount_type: 'percent', discount_percent: '10.00',
      discount_reason: 'Regular customer', discounted_by: { id: 4, name: 'Asha K' }, discount_approved_by: 'Meera S',
    });
    expect(info).toMatchObject({ type: 'percent', percent: 10, stale: false, note: { reason: 'Regular customer', by: 'Asha K', approvedBy: 'Meera S' } });
  });
});
