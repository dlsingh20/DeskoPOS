import ApiClient from './ApiClient';
import orderService from './OrderService';
import historyService from './HistoryService';
import { calculatePaidAmount } from '../utils/orderUtils';
import { isActiveOrder } from '../utils/fineDineUtils';
import { NOTE_TAG, getDiscountInfo, parseDiscountNote, round2 } from '../utils/discountUtils';

export { getDiscountInfo, parseDiscountNote, round2 };

const BASE = '/api/pos/api';
const isMissingEndpoint = (error) => [404, 405, 501].includes(error?.response?.status);
const TOLERANCE = 0.01;

export const DISCOUNT_REASONS = [
  'Regular customer',
  'Staff',
  'Complaint / service recovery',
  'Manager approval',
  'Promotion / offer',
  'Other',
];

export const QUICK_PERCENTS = [5, 10, 15, 20];

/** Optional cap from REACT_APP_MAX_DISCOUNT_PERCENT (e.g. "20"); null when not set */
export const MAX_DISCOUNT_PERCENT = (() => {
  const value = parseFloat(process.env.REACT_APP_MAX_DISCOUNT_PERCENT);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
})();

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Discount amount for a percent or fixed discount on the food subtotal
 * (before service charge and tax).
 * @returns {{amount: number, percent: number, error: string|null}}
 */
export const computeDiscount = ({ type, value, subtotal, maxPercent = MAX_DISCOUNT_PERCENT }) => {
  const v = typeof value === 'number' ? value : parseFloat(value);
  const base = round2(num(subtotal));
  if (!Number.isFinite(v) || v <= 0) return { amount: 0, percent: 0, error: 'Enter a discount greater than zero.' };
  if (base <= 0) return { amount: 0, percent: 0, error: 'This bill has no subtotal to discount.' };

  let amount;
  if (type === 'percent') {
    if (v > 100) return { amount: 0, percent: v, error: 'A percent discount cannot be more than 100%.' };
    amount = round2((base * v) / 100);
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(String(value).trim())) return { amount: 0, percent: 0, error: 'Use at most 2 decimal places.' };
    amount = round2(v);
    if (amount > base + TOLERANCE) return { amount, percent: 0, error: 'The discount cannot be more than the subtotal.' };
  }
  const percent = round2((amount / base) * 100);
  if (maxPercent && percent > maxPercent + TOLERANCE) {
    return { amount, percent, error: `The discount limit is ${maxPercent}% of the subtotal.` };
  }
  return { amount, percent, error: null };
};

/* ------------------------------------------------------------------ */
/* Audit note                                                          */
/* The API stores only discount_amount, so the type, percent, reason   */
/* and operator are kept in one tagged line of the order notes.        */
/* ------------------------------------------------------------------ */

const stripDiscountLines = (notes) => String(notes || '')
  .split('\n')
  .filter((line) => !line.trim().startsWith(NOTE_TAG))
  .join('\n')
  .trim();

export const buildDiscountNote = ({ type, value, amount, reason, by, approvedBy = '', at = new Date() }) => {
  const what = type === 'percent' ? `${round2(num(value))}% = ${amount.toFixed(2)}` : `Fixed ${amount.toFixed(2)}`;
  return `${NOTE_TAG} ${what} | Reason: ${reason} | By: ${by || 'Unknown'}${approvedBy ? ` | Approved: ${approvedBy}` : ''} | At: ${at.toISOString()}`;
};

export class DiscountError extends Error {
  constructor(message, order = null) {
    super(message);
    this.name = 'DiscountError';
    this.order = order;
  }
}

class DiscountService {
  constructor() {
    this.operatorName = null;
  }

  async _operatorName() {
    if (this.operatorName) return this.operatorName;
    try {
      const me = await historyService.getCurrentUser();
      this.operatorName = [me.first_name, me.last_name].filter(Boolean).join(' ').trim() || me.username || me.email || null;
    } catch (error) {
      this.operatorName = null;
    }
    return this.operatorName || 'Unknown';
  }

  _patch(orderId, body) {
    return ApiClient.patch(`${BASE}/orders/${orderId}/`, body);
  }

  /**
   * Applies a bill discount with POST orders/{id}/apply_discount/: the server stores type, percent,
   * reason and approver, recalculates the totals and enforces the user's limit.
   * Falls back to the PATCH-and-check path on backends without the endpoint.
   *
   * @param {string} [approvalId] - from a manager approval, when above the user's limit
   * @returns {Promise<Object>} the updated order
   */
  async applyDiscount({ orderId, type, value, reason, expectedSubtotal, approvedBy = '', approvalId = null }) {
    if (type === 'none') return this.removeDiscount({ orderId, expectedSubtotal });
    if (!reason || !reason.trim()) throw new DiscountError('Choose a reason for the discount.');
    if (expectedSubtotal !== undefined) {
      const check = computeDiscount({ type, value, subtotal: expectedSubtotal });
      if (check.error) throw new DiscountError(check.error);
    }
    try {
      await ApiClient.post(`${BASE}/orders/${orderId}/apply_discount/`, {
        type,
        value: round2(num(value)).toFixed(2),
        reason: reason.trim(),
        expected_subtotal: expectedSubtotal !== undefined ? round2(num(expectedSubtotal)).toFixed(2) : null,
        approval_id: approvalId,
      });
    } catch (error) {
      if (isMissingEndpoint(error)) return this._applyByPatch({ orderId, type, value, reason, expectedSubtotal, approvedBy });
      throw await this._serverError(error, orderId);
    }
    return orderService.getOrder(orderId);
  }

  /** DELETE orders/{id}/discount/, or the PATCH path on older backends */
  async removeDiscount({ orderId, expectedSubtotal }) {
    try {
      await ApiClient.delete(`${BASE}/orders/${orderId}/discount/`);
    } catch (error) {
      if (isMissingEndpoint(error)) return this._applyByPatch({ orderId, type: 'none', expectedSubtotal });
      throw await this._serverError(error, orderId);
    }
    return orderService.getOrder(orderId);
  }

  /** Server error as a DiscountError with the fresh order; approvalRequired when a manager must approve */
  async _serverError(error, orderId) {
    const data = error?.response?.data || {};
    const fresh = await orderService.getOrder(orderId).catch(() => null);
    const messages = {
      subtotal_changed: 'The bill changed while you were applying the discount. Check the new subtotal and try again.',
      below_paid: 'The discounted total would be less than the amount already paid.',
    };
    const wrapped = new DiscountError(messages[data.code] || data.detail || error.message || 'Could not save the discount.', fresh);
    wrapped.approvalRequired = error?.response?.status === 403 && !!data.approval_required;
    return wrapped;
  }

  /**
   * Older backends: applies (or, with type "none", removes) a bill discount by PATCHing the order.
   *
   * 1. Re-reads the order; it must be open and its subtotal must match what the operator saw.
   * 2. Saves discount_amount plus a tagged audit line in notes.
   * 3. Re-reads the order and checks the server recalculated the total and that the total is
   *    not below what was already paid. Otherwise the previous discount is restored.
   *
   * @returns {Promise<Object>} the updated order
   */
  async _applyByPatch({ orderId, type, value, reason, expectedSubtotal, approvedBy = '' }) {
    const before = await orderService.getOrder(orderId);
    if (!isActiveOrder(before)) {
      throw new DiscountError(`Order is ${before.status}; discounts can only change on open bills.`, before);
    }
    const subtotal = round2(num(before.subtotal));
    if (expectedSubtotal !== undefined && Math.abs(subtotal - round2(num(expectedSubtotal))) > TOLERANCE) {
      throw new DiscountError('The bill changed while you were applying the discount. Check the new subtotal and try again.', before);
    }

    const removing = type === 'none';
    let amount = 0;
    if (!removing) {
      if (!reason || !reason.trim()) throw new DiscountError('Choose a reason for the discount.', before);
      const result = computeDiscount({ type, value, subtotal });
      if (result.error) throw new DiscountError(result.error, before);
      amount = result.amount;
    }

    const oldAmount = round2(num(before.discount_amount));
    const oldTotal = round2(num(before.total_amount));
    const paid = round2(calculatePaidAmount(before));
    const cleanNotes = stripDiscountLines(before.notes);
    const notes = removing
      ? cleanNotes
      : [cleanNotes, buildDiscountNote({ type, value, amount, reason: reason.trim(), by: await this._operatorName(), approvedBy })].filter(Boolean).join('\n');

    if (Math.abs(amount - oldAmount) <= TOLERANCE && notes === String(before.notes || '').trim()) return before;

    await this._patch(orderId, { discount_amount: amount.toFixed(2), notes });
    const after = await orderService.getOrder(orderId);

    const restore = async (message) => {
      try {
        await this._patch(orderId, { discount_amount: oldAmount.toFixed(2), notes: before.notes || '' });
      } catch (error) {
        throw new DiscountError(`${message} Restoring the previous discount also failed; check this bill before settling.`, after);
      }
      throw new DiscountError(message, await orderService.getOrder(orderId).catch(() => before));
    };

    const newAmount = round2(num(after.discount_amount));
    const newTotal = round2(num(after.total_amount));
    if (Math.abs(newAmount - amount) > TOLERANCE) {
      await restore('The server did not save the discount amount. Nothing was changed.');
    }
    // A bigger discount must lower the total; a smaller one must raise it
    const delta = amount - oldAmount;
    if (Math.abs(delta) > TOLERANCE && (delta > 0 ? newTotal >= oldTotal - TOLERANCE : newTotal <= oldTotal + TOLERANCE)) {
      await restore('The server did not recalculate the bill total after the discount, so it was undone.');
    }
    if (newTotal < paid - TOLERANCE) {
      await restore('The discounted total would be less than the amount already paid, so it was undone.');
    }
    return after;
  }

}

const discountService = new DiscountService();
export default discountService;
