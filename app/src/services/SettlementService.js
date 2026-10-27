import ApiClient from './ApiClient';
import orderService from './OrderService';
import tableService from './TableService';
import { getRemainingAmount } from '../utils/orderUtils';
import { ACTIVE_ORDER_STATUSES } from '../utils/fineDineUtils';

const BASE = '/api/pos/api';
const AMOUNT_TOLERANCE = 0.01;

/**
 * Payment methods shown in the payment popup.
 * `kind` decides how the settlement is recorded on the server:
 *  - payment:     POST order-payments/create_flexible_payment (money received)
 *  - room_charge: POST orders/{id}/charge_to_room (hotel guest folio)
 *  - outstanding: order moves to 'outstanding' + outstanding-orders record (no money received)
 */
export const SETTLEMENT_METHODS = [
  { key: 'cash', label: 'Cash', kind: 'payment', backendMethod: 'cash' },
  { key: 'card', label: 'Card', kind: 'payment', backendMethod: 'credit_card', needsReference: true },
  { key: 'upi', label: 'UPI', kind: 'payment', backendMethod: 'mobile_payment', needsReference: true, channel: 'UPI' },
  { key: 'paytm', label: 'Paytm', kind: 'payment', backendMethod: 'mobile_payment', needsReference: true, channel: 'Paytm' },
  { key: 'phonepe', label: 'PhonePe', kind: 'payment', backendMethod: 'mobile_payment', needsReference: true, channel: 'PhonePe' },
  { key: 'guest_visit', label: 'Guest Visit', kind: 'room_charge', backendMethod: 'room_charge' },
  { key: 'credit_pay', label: 'Credit Pay', kind: 'outstanding', backendMethod: 'pay_later' },
];

// Methods a tip can be received by (money only)
export const TIP_METHODS = SETTLEMENT_METHODS.filter((m) => m.kind === 'payment');

export class AmountChangedError extends Error {
  constructor(order, amountDue) {
    super('The bill changed since the payment screen was opened. Check the new amount and try again.');
    this.name = 'AmountChangedError';
    this.order = order;
    this.amountDue = amountDue;
  }
}

const describe = (error) =>
  error?.response?.data?.message || error?.response?.data?.detail || error?.response?.data?.error || error?.message || 'Request failed';

/** True when the server has no such endpoint (older backend): use the step-by-step path */
const isMissingEndpoint = (error) => [404, 405, 501].includes(error?.response?.status);

/**
 * Send the Idempotency-Key header only when the API allows it in CORS (CORS_ALLOW_HEADERS).
 * Browsers block requests carrying a header the server has not allowed, which shows as
 * "Network Error". The key is always sent in the body as idempotency_key as well.
 */
const SEND_IDEMPOTENCY_HEADER = process.env.REACT_APP_IDEMPOTENCY_HEADER === 'true';

const money2 = (n) => (Number(n) || 0).toFixed(2);

/** Random key so a retried settle request is applied only once on the server */
export const newIdempotencyKey = () => {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch (error) {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

/**
 * Settles an order in safe, re-runnable steps:
 * 1. Re-read the order and check the amount due still matches what the cashier saw.
 * 2. Record the payment / room charge / outstanding entry (skipped if nothing is due any more).
 * 3. Re-read the order and confirm it is fully paid before closing it.
 * 4. Close the order, then release the table when no other open order remains.
 *
 * A retry after any failure never records a second payment, because step 2 only
 * runs while the server still reports an amount due.
 */
class SettlementService {
  /**
   * @param {Object} args
   * @param {Object} [args.tip] - { amount, method (backend method), staffId }
   * @param {Object} [args.cash] - { received, change } for cash payments
   * @param {string} [args.approvalId] - manager approval (Credit Pay without permission)
   * @param {string} [args.idempotencyKey] - same key for retries of the same settlement
   * @param {number} [args.cashRegisterId] - the cashier's open counter shift, so the takings count toward it
   */
  async settle(args) {
    try {
      return await this._settleOnServer(args);
    } catch (error) {
      if (!isMissingEndpoint(error)) throw error;
      return this._settleInSteps(args);
    }
  }

  /**
   * POST orders/{id}/settle/: payments, tip, completion, invoice number and table in one transaction.
   */
  async _settleOnServer({
    orderId, expectedAmountDue, method, reference = '', cardType = 'credit', guest = null, customer = null, notes = '',
    tip = null, cash = null, approvalId = null, idempotencyKey = newIdempotencyKey(), cashRegisterId = null,
  }) {
    if (method.kind === 'room_charge' && !guest?.guest_id) throw new Error('Choose the in-house guest to charge.');
    if (method.kind === 'outstanding' && (!customer?.name?.trim() || !customer?.phone?.trim())) {
      throw new Error('Customer name and phone are required for Credit Pay.');
    }

    const amount = money2(expectedAmountDue);
    const body = {
      expected_amount_due: amount,
      payments: [],
      tip: tip && Number(tip.amount) > 0
        ? { amount: money2(tip.amount), method: tip.method, staff_id: tip.staffId ? Number(tip.staffId) : null }
        : null,
      room_charge: method.kind === 'room_charge' ? { guest_id: guest.guest_id } : null,
      credit: method.kind === 'outstanding' ? { customer_name: customer.name.trim(), customer_phone: customer.phone.trim() } : null,
      notes,
      approval_id: approvalId,
      idempotency_key: idempotencyKey,
    };
    if (cashRegisterId != null) body.cash_register = cashRegisterId;
    if (method.kind === 'payment' && Number(expectedAmountDue) > AMOUNT_TOLERANCE) {
      body.payments.push({
        method: method.key === 'card' && cardType === 'debit' ? 'debit_card' : method.backendMethod,
        amount,
        reference: reference.trim(),
        channel: method.channel ? method.channel.toLowerCase() : null,
        card_type: method.key === 'card' ? cardType : null,
        amount_received: cash ? money2(cash.received) : null,
        change_returned: cash ? money2(cash.change) : null,
      });
    }

    let data;
    try {
      const config = SEND_IDEMPOTENCY_HEADER ? { headers: { 'Idempotency-Key': idempotencyKey } } : {};
      const response = await ApiClient.post(`${BASE}/orders/${orderId}/settle/`, body, config);
      data = response.data || {};
    } catch (error) {
      const payload = error?.response?.data || {};
      if (error?.response?.status === 409 && payload.code === 'amount_changed') {
        const fresh = await orderService.getOrder(orderId).catch(() => null);
        throw new AmountChangedError(fresh, Number(payload.amount_due ?? (fresh ? getRemainingAmount(fresh) : 0)));
      }
      if (error?.response?.status === 409 && payload.code === 'already_settled') {
        const fresh = await orderService.getOrder(orderId);
        return { order: fresh, steps: { paymentRecorded: false, orderClosed: true, tableReleased: false }, warnings: [], alreadySettled: true };
      }
      // Readable message; keep the response so settle() can tell a missing endpoint apart
      const wrapped = new Error(error?.response
        ? describe(error)
        : 'Could not reach the server (network error). Check the connection, then reopen the bill to see whether it was settled before trying again.');
      wrapped.response = error.response;
      throw wrapped;
    }

    // The response carries a summary; read the full order for the caller
    const order = await orderService.getOrder(orderId).catch(() => data.order || data);
    return {
      order,
      steps: { paymentRecorded: true, orderClosed: true, tableReleased: data.table?.status === 'available' },
      warnings: [],
      alreadySettled: false,
      invoiceNumber: data.order?.invoice_number || order?.invoice_number || null,
    };
  }

  /**
   * Older backends without /settle/: safe, re-runnable steps (see class comment).
   */
  async _settleInSteps({ orderId, expectedAmountDue, method, reference = '', cardType = 'credit', guest = null, customer = null, notes = '' }) {
    const steps = { paymentRecorded: false, orderClosed: false, tableReleased: false };
    const warnings = [];

    // 1. Fresh server state
    let order = await orderService.getOrder(orderId);
    const status = order.status?.toLowerCase();
    if (['cancelled', 'refunded'].includes(status)) {
      throw new Error(`This order is ${status} and cannot be settled.`);
    }
    if (['completed', 'outstanding'].includes(status)) {
      return { order, steps: { ...steps, orderClosed: true }, warnings, alreadySettled: true };
    }

    const amountDue = getRemainingAmount(order);
    if (amountDue > AMOUNT_TOLERANCE && Math.abs(amountDue - expectedAmountDue) > AMOUNT_TOLERANCE) {
      throw new AmountChangedError(order, amountDue);
    }

    // 2. Record the settlement
    if (method.kind === 'outstanding') {
      order = await this._markOutstanding(order, { customer, notes, amountDue });
      steps.paymentRecorded = true;
      steps.orderClosed = true;
    } else {
      if (amountDue > AMOUNT_TOLERANCE) {
        if (method.kind === 'room_charge') {
          await this._chargeToRoom(order, guest, amountDue, notes);
        } else {
          const backendMethod = method.key === 'card' && cardType === 'debit' ? 'debit_card' : method.backendMethod;
          const payment = await orderService.processFlexiblePayment(order.id, {
            method: backendMethod,
            amount: amountDue.toFixed(2),
            transaction_id: reference.trim(),
            notes,
          });
          const paymentStatus = (payment?.status || payment?.payment?.status || '').toLowerCase();
          if (['pending', 'failed'].includes(paymentStatus)) {
            throw new Error(`The payment was recorded as ${paymentStatus}. The order stays open until it is completed.`);
          }
        }
        steps.paymentRecorded = true;
      }

      // 3. Only close a fully paid order
      order = await orderService.getOrder(order.id);
      const stillDue = getRemainingAmount(order);
      if (stillDue > AMOUNT_TOLERANCE) {
        const error = new Error(`The server still shows ${stillDue.toFixed(2)} due on this order, so it was not closed.`);
        error.order = order;
        error.steps = steps;
        throw error;
      }

      // 4. Close the order
      if (order.status !== 'completed') {
        try {
          await orderService.updateOrderStatus(order.id, 'completed');
          order = await orderService.getOrder(order.id);
        } catch (error) {
          const wrapped = new Error(`Payment is recorded, but the order could not be closed: ${describe(error)}`);
          wrapped.order = order;
          wrapped.steps = steps;
          wrapped.paymentSaved = true;
          throw wrapped;
        }
      }
      steps.orderClosed = true;
    }

    // 5. Release the table when nothing else is open on it
    if (order.table) {
      try {
        steps.tableReleased = await this._releaseTableIfFree(order);
      } catch (error) {
        warnings.push(`The table could not be marked available: ${describe(error)}`);
      }
    }

    return { order, steps, warnings, alreadySettled: false };
  }

  async _chargeToRoom(order, guest, amountDue, notes) {
    if (!guest?.guest_id) throw new Error('Choose the in-house guest to charge.');
    let response;
    try {
      response = await ApiClient.post(`${BASE}/orders/${order.id}/charge_to_room/`, {
        guest_id: guest.guest_id,
        amount: amountDue.toFixed(2),
      });
    } catch (error) {
      throw new Error(`Room charge failed: ${describe(error)}`);
    }
    if (response.data && response.data.success === false) {
      throw new Error(response.data.message || 'Room charge was not accepted.');
    }

    // charge_to_room has no notes field; attach the tip / audit notes to the payment it created
    if (notes) {
      try {
        const fresh = await orderService.getOrder(order.id);
        const roomPayment = [...(fresh.payments || [])]
          .filter((p) => p.method === 'room_charge')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (roomPayment) {
          await ApiClient.patch(`${BASE}/order-payments/${roomPayment.id}/`, {
            notes: [roomPayment.notes, notes].filter(Boolean).join(' | '),
          });
        }
      } catch (error) {
        console.error('Could not attach notes to room charge payment:', error);
      }
    }
  }

  async _markOutstanding(order, { customer, notes, amountDue }) {
    if (!customer?.name?.trim() || !customer?.phone?.trim()) {
      throw new Error('Customer name and phone are required for Credit Pay.');
    }

    try {
      await orderService.updateOrderStatus(order.id, 'outstanding');
    } catch (error) {
      throw new Error(`Could not move the order to Credit Pay: ${describe(error)}`);
    }

    // The server may create the outstanding record itself; only create one if it is missing
    const existing = await ApiClient.get(`${BASE}/outstanding-orders/`, { params: { search: order.order_number } })
      .then((r) => (r.data.results || r.data).find((o) => String(o.order) === String(order.id) || o.order_number === order.order_number))
      .catch(() => null);

    if (!existing) {
      try {
        await ApiClient.post(`${BASE}/outstanding-orders/`, {
          order: order.id,
          customer_name: customer.name.trim(),
          customer_phone: customer.phone.trim(),
          priority: 'medium',
          internal_notes: [`Credit Pay from POS, ${amountDue.toFixed(2)} due`, notes].filter(Boolean).join(' | '),
        });
      } catch (error) {
        const wrapped = new Error(`The order is marked as Credit Pay, but the outstanding record could not be created: ${describe(error)}`);
        wrapped.paymentSaved = true;
        throw wrapped;
      }
    }

    return orderService.getOrder(order.id);
  }

  async _releaseTableIfFree(order) {
    const others = await orderService.getOrders({ table_id: order.table, restaurant_id: order.restaurant });
    const stillOpen = others.filter((o) => o.id !== order.id && ACTIVE_ORDER_STATUSES.includes(o.status));
    if (stillOpen.length > 0) return false;

    const table = await tableService.getTable(order.table);
    if (table.status !== 'occupied') return table.status === 'available';
    await tableService.updateTableStatus(order.table, 'available');
    return true;
  }

  /** Frees the order's table when no other order is open on it (used after cancelling too) */
  releaseTableIfFree(order) {
    return order?.table ? this._releaseTableIfFree(order) : Promise.resolve(false);
  }
}

const settlementService = new SettlementService();
export default settlementService;
