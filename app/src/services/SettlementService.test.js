import settlementService, { SETTLEMENT_METHODS, AmountChangedError } from './SettlementService';
import orderService from './OrderService';
import tableService from './TableService';
import ApiClient from './ApiClient';

jest.mock('./OrderService', () => ({
  __esModule: true,
  default: {
    getOrder: jest.fn(),
    getOrders: jest.fn(),
    processFlexiblePayment: jest.fn(),
    updateOrderStatus: jest.fn(),
  },
}));
jest.mock('./TableService', () => ({
  __esModule: true,
  default: { getTable: jest.fn(), updateTableStatus: jest.fn() },
}));
jest.mock('./ApiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const method = (key) => SETTLEMENT_METHODS.find((m) => m.key === key);

const notFound = () => Promise.reject(Object.assign(new Error('Not found'), { response: { status: 404, data: { detail: 'Not found.' } } }));

/** ApiClient.post for a backend without /settle/; other URLs go to handler */
const postWithoutSettle = (handler = async () => ({ data: {} })) => async (url, ...rest) => (url.endsWith('/settle/') ? notFound() : handler(url, ...rest));

/**
 * Minimal in-memory server: one order, payments and status, so the service
 * can be exercised end to end without a network.
 */
const setupServer = ({ total = '3661.00', status = 'served', payments = [], table = 7 } = {}) => {
  const server = {
    order: { id: 1, order_number: 'ORD-001', restaurant: 2, table, type: table ? 'dine_in' : 'takeaway', status, total_amount: total, payments: [...payments] },
    tableStatus: 'occupied',
  };
  orderService.getOrder.mockImplementation(async () => JSON.parse(JSON.stringify(server.order)));
  orderService.getOrders.mockResolvedValue([]);
  orderService.processFlexiblePayment.mockImplementation(async (id, payload) => {
    const payment = { id: server.order.payments.length + 1, method: payload.method, amount: payload.amount, status: 'completed', notes: payload.notes };
    server.order.payments.push(payment);
    return payment;
  });
  orderService.updateOrderStatus.mockImplementation(async (id, next) => {
    server.order.status = next;
    return server.order;
  });
  tableService.getTable.mockImplementation(async () => ({ id: table, status: server.tableStatus }));
  tableService.updateTableStatus.mockImplementation(async (id, next) => {
    server.tableStatus = next;
  });
  ApiClient.post.mockImplementation(postWithoutSettle());
  return server;
};

beforeEach(() => jest.clearAllMocks());

describe('SettlementService.settle (step by step, backend without /settle/)', () => {
  test('cash: records the exact amount due, completes the order and frees the table', async () => {
    const server = setupServer();
    const result = await settlementService.settle({
      orderId: 1,
      expectedAmountDue: 3661,
      method: method('cash'),
      notes: 'Cash received 4000.00, change returned 339.00',
    });

    expect(orderService.processFlexiblePayment).toHaveBeenCalledTimes(1);
    expect(orderService.processFlexiblePayment).toHaveBeenCalledWith(1, expect.objectContaining({ method: 'cash', amount: '3661.00' }));
    expect(server.order.status).toBe('completed');
    expect(server.tableStatus).toBe('available');
    expect(result.steps).toEqual({ paymentRecorded: true, orderClosed: true, tableReleased: true });
  });

  test('only charges the remaining balance after a partial payment', async () => {
    setupServer({ payments: [{ id: 9, amount: '1000.00', status: 'completed' }] });
    await settlementService.settle({ orderId: 1, expectedAmountDue: 2661, method: method('cash') });
    expect(orderService.processFlexiblePayment).toHaveBeenCalledWith(1, expect.objectContaining({ amount: '2661.00' }));
  });

  test('stops without paying when the bill changed since the popup opened', async () => {
    setupServer({ total: '4000.00' });
    await expect(
      settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') })
    ).rejects.toBeInstanceOf(AmountChangedError);
    expect(orderService.processFlexiblePayment).not.toHaveBeenCalled();
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('UPI: sends mobile_payment with the transaction reference', async () => {
    setupServer();
    await settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('upi'), reference: 'UTR123456', notes: 'Paid via UPI' });
    expect(orderService.processFlexiblePayment).toHaveBeenCalledWith(1, expect.objectContaining({ method: 'mobile_payment', transaction_id: 'UTR123456' }));
  });

  test('debit card maps to debit_card', async () => {
    setupServer();
    await settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('card'), cardType: 'debit', reference: '004512' });
    expect(orderService.processFlexiblePayment).toHaveBeenCalledWith(1, expect.objectContaining({ method: 'debit_card' }));
  });

  test('a pending payment does not close the order', async () => {
    const server = setupServer();
    orderService.processFlexiblePayment.mockResolvedValueOnce({ id: 5, status: 'pending' });
    await expect(
      settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('card'), reference: '004512' })
    ).rejects.toThrow(/pending/);
    expect(server.order.status).toBe('served');
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('a failed payment request leaves the order open', async () => {
    const server = setupServer();
    orderService.processFlexiblePayment.mockRejectedValueOnce(new Error('Network Error'));
    await expect(
      settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') })
    ).rejects.toThrow('Network Error');
    expect(server.order.status).toBe('served');
    expect(server.tableStatus).toBe('occupied');
  });

  test('retry after the close step failed does not record a second payment', async () => {
    const server = setupServer();
    orderService.updateOrderStatus.mockRejectedValueOnce(new Error('Invalid status transition'));

    const first = settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') });
    await expect(first).rejects.toMatchObject({ paymentSaved: true });
    expect(server.order.payments).toHaveLength(1);

    await settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') });
    expect(orderService.processFlexiblePayment).toHaveBeenCalledTimes(1);
    expect(server.order.payments).toHaveLength(1);
    expect(server.order.status).toBe('completed');
  });

  test('an already completed order is reported as settled without new calls', async () => {
    setupServer({ status: 'completed' });
    const result = await settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') });
    expect(result.alreadySettled).toBe(true);
    expect(orderService.processFlexiblePayment).not.toHaveBeenCalled();
  });

  test('cancelled orders cannot be settled', async () => {
    setupServer({ status: 'cancelled' });
    await expect(
      settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') })
    ).rejects.toThrow(/cancelled/);
  });

  test('keeps the table occupied while another order is open on it', async () => {
    const server = setupServer();
    orderService.getOrders.mockResolvedValue([{ id: 2, status: 'preparing' }]);
    await settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') });
    expect(server.order.status).toBe('completed');
    expect(server.tableStatus).toBe('occupied');
  });

  test('Guest Visit charges the room folio and does not create a cash payment', async () => {
    const server = setupServer();
    ApiClient.post.mockImplementation(postWithoutSettle(async () => {
      server.order.payments.push({ id: 3, method: 'room_charge', amount: '3661.00', status: 'completed', created_at: new Date().toISOString() });
      return { data: { success: true } };
    }));
    ApiClient.patch.mockResolvedValue({ data: {} });

    await settlementService.settle({
      orderId: 1,
      expectedAmountDue: 3661,
      method: method('guest_visit'),
      guest: { guest_id: 44, guest_name: 'A. Guest', room_number: '204' },
      notes: 'Tip 50.00 via Cash',
    });

    expect(ApiClient.post).toHaveBeenCalledWith('/api/pos/api/orders/1/charge_to_room/', { guest_id: 44, amount: '3661.00' });
    expect(orderService.processFlexiblePayment).not.toHaveBeenCalled();
    expect(ApiClient.patch).toHaveBeenCalledWith('/api/pos/api/order-payments/3/', { notes: 'Tip 50.00 via Cash' });
    expect(server.order.status).toBe('completed');
  });

  test('Guest Visit requires a guest', async () => {
    setupServer();
    await expect(
      settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('guest_visit') })
    ).rejects.toThrow(/guest/);
  });

  test('Credit Pay marks the order outstanding and creates one outstanding record, without any payment', async () => {
    const server = setupServer();
    ApiClient.get.mockResolvedValue({ data: { results: [] } });
    ApiClient.post.mockImplementation(postWithoutSettle(async () => ({ data: { id: 10 } })));

    await settlementService.settle({
      orderId: 1,
      expectedAmountDue: 3661,
      method: method('credit_pay'),
      customer: { name: 'R. Kumar', phone: '9876543210' },
    });

    expect(orderService.processFlexiblePayment).not.toHaveBeenCalled();
    expect(server.order.status).toBe('outstanding');
    const outstandingCalls = ApiClient.post.mock.calls.filter(([url]) => url === '/api/pos/api/outstanding-orders/');
    expect(outstandingCalls).toHaveLength(1);
    expect(outstandingCalls[0][1]).toEqual(expect.objectContaining({ order: 1, customer_phone: '9876543210' }));
  });

  test('Credit Pay does not duplicate an outstanding record the server already created', async () => {
    setupServer();
    ApiClient.get.mockResolvedValue({ data: { results: [{ id: 10, order: 1 }] } });
    await settlementService.settle({
      orderId: 1,
      expectedAmountDue: 3661,
      method: method('credit_pay'),
      customer: { name: 'R. Kumar', phone: '9876543210' },
    });
    expect(ApiClient.post.mock.calls.filter(([url]) => url === '/api/pos/api/outstanding-orders/')).toHaveLength(0);
  });

  test('Credit Pay requires customer name and phone', async () => {
    setupServer();
    await expect(
      settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('credit_pay'), customer: { name: '', phone: '' } })
    ).rejects.toThrow(/name and phone/);
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
  });
});

describe('SettlementService.settle (single /settle/ call)', () => {
  const settled = (overrides = {}) => ({ id: 1, order_number: 'ORD-001', status: 'completed', total_amount: '3661.00', payments: [], invoice_number: 'INV/26-27/000731', ...overrides });

  beforeEach(() => {
    orderService.getOrder.mockResolvedValue(settled());
  });

  test('cash with tip, cash received and change, sent once with an idempotency key in the body', async () => {
    ApiClient.post.mockResolvedValue({ data: { order: { id: 1, invoice_number: 'INV/26-27/000731' }, table: { id: 7, status: 'available' } } });
    const result = await settlementService.settle({
      orderId: 1,
      expectedAmountDue: 3661,
      method: method('cash'),
      notes: 'Cash received 4000.00, change returned 289.00',
      tip: { amount: 50, method: 'cash', staffId: '12' },
      cash: { received: 4000, change: 289 },
      idempotencyKey: 'key-1',
    });
    expect(ApiClient.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = ApiClient.post.mock.calls[0];
    expect(url).toBe('/api/pos/api/orders/1/settle/');
    // The key travels in the body; the header is off until the API allows it in CORS
    expect(config).toEqual({});
    expect(body.idempotency_key).toBe('key-1');
    expect(body).toEqual(expect.objectContaining({
      expected_amount_due: '3661.00',
      payments: [{ method: 'cash', amount: '3661.00', reference: '', channel: null, card_type: null, amount_received: '4000.00', change_returned: '289.00' }],
      tip: { amount: '50.00', method: 'cash', staff_id: 12 },
      room_charge: null,
      credit: null,
      approval_id: null,
    }));
    expect(result).toMatchObject({ alreadySettled: false, invoiceNumber: 'INV/26-27/000731', steps: { paymentRecorded: true, orderClosed: true, tableReleased: true } });
    expect(orderService.processFlexiblePayment).not.toHaveBeenCalled();
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('wallet channel and debit card type', async () => {
    ApiClient.post.mockResolvedValue({ data: {} });
    await settlementService.settle({ orderId: 1, expectedAmountDue: 500, method: method('paytm'), reference: 'UTR1' });
    expect(ApiClient.post.mock.calls[0][1].payments[0]).toMatchObject({ method: 'mobile_payment', channel: 'paytm', reference: 'UTR1' });
    ApiClient.post.mockClear();
    await settlementService.settle({ orderId: 1, expectedAmountDue: 500, method: method('card'), cardType: 'debit', reference: '0045' });
    expect(ApiClient.post.mock.calls[0][1].payments[0]).toMatchObject({ method: 'debit_card', card_type: 'debit' });
  });

  test('Guest Visit and Credit Pay send no payments; Credit Pay carries the approval', async () => {
    ApiClient.post.mockResolvedValue({ data: {} });
    await settlementService.settle({ orderId: 1, expectedAmountDue: 100, method: method('guest_visit'), guest: { guest_id: 44 } });
    expect(ApiClient.post.mock.calls[0][1]).toMatchObject({ payments: [], room_charge: { guest_id: 44 } });
    ApiClient.post.mockClear();
    await settlementService.settle({ orderId: 1, expectedAmountDue: 100, method: method('credit_pay'), customer: { name: 'R. Kumar', phone: '98765' }, approvalId: 'apr_1' });
    expect(ApiClient.post.mock.calls[0][1]).toMatchObject({ payments: [], credit: { customer_name: 'R. Kumar', customer_phone: '98765' }, approval_id: 'apr_1' });
  });

  test('validates before calling the server', async () => {
    await expect(settlementService.settle({ orderId: 1, expectedAmountDue: 100, method: method('guest_visit') })).rejects.toThrow(/guest/);
    await expect(settlementService.settle({ orderId: 1, expectedAmountDue: 100, method: method('credit_pay'), customer: { name: '', phone: '' } })).rejects.toThrow(/name and phone/);
    expect(ApiClient.post).not.toHaveBeenCalled();
  });

  test('amount changed on the server', async () => {
    orderService.getOrder.mockResolvedValue(settled({ status: 'served', total_amount: '4000.00' }));
    ApiClient.post.mockRejectedValue({ response: { status: 409, data: { code: 'amount_changed', amount_due: '4000.00' } } });
    const error = await settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') }).catch((e) => e);
    expect(error).toBeInstanceOf(AmountChangedError);
    expect(error.amountDue).toBe(4000);
  });

  test('already settled elsewhere', async () => {
    ApiClient.post.mockRejectedValue({ response: { status: 409, data: { code: 'already_settled' } } });
    const result = await settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') });
    expect(result.alreadySettled).toBe(true);
  });

  test('other server errors are shown and do not fall back to the step-by-step path', async () => {
    ApiClient.post.mockRejectedValue({ response: { status: 422, data: { code: 'overpayment', detail: 'Payments exceed the amount due by 100.00.' } } });
    await expect(settlementService.settle({ orderId: 1, expectedAmountDue: 3661, method: method('cash') })).rejects.toThrow('Payments exceed the amount due by 100.00.');
    expect(orderService.processFlexiblePayment).not.toHaveBeenCalled();
  });
});
