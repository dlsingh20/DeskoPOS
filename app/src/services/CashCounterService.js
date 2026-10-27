import ApiClient from './ApiClient';
import { summarizePosPayments } from '../utils/cashCounterUtils';

const BASE = '/api/accounting';

const toRelative = (next) => {
  const url = new URL(next, window.location.origin);
  return `${url.pathname}${url.search}`;
};

const rowsOf = (data) => (Array.isArray(data) ? data : (data?.results || []));

/** 403/404/405/501: the hotel has cash counters switched off, or the server has no such endpoint */
const isUnavailable = (error) => [403, 404, 405, 501].includes(error?.response?.status);

/**
 * Cash counters (Admin setup) and cashier shifts on them.
 * GET/POST /api/accounting/cash-counters/, /api/accounting/cash-register/ (open, current, close),
 * /api/accounting/shift-templates/. Only reachable while the hotel has cash counters switched on.
 */
class CashCounterService {
  async _all(url) {
    const rows = [];
    for (let page = 0; url && page < 10; page += 1) {
      const response = await ApiClient.get(url);
      rows.push(...rowsOf(response.data));
      url = !Array.isArray(response.data) && response.data?.next ? toRelative(response.data.next) : null;
    }
    return rows;
  }

  /** @returns {Promise<{available: boolean, counters: Array}>} */
  async listCounters() {
    try {
      return { available: true, counters: await this._all(`${BASE}/cash-counters/?page_size=200`) };
    } catch (error) {
      if (isUnavailable(error)) return { available: false, counters: [] };
      throw error;
    }
  }

  async createCounter({ name, sort_order = 0, is_active = true }) {
    const response = await ApiClient.post(`${BASE}/cash-counters/`, { name: name.trim(), sort_order: Number(sort_order) || 0, is_active });
    return response.data;
  }

  async updateCounter(id, patch) {
    const body = { ...patch };
    if (typeof body.name === 'string') body.name = body.name.trim();
    const response = await ApiClient.patch(`${BASE}/cash-counters/${id}/`, body);
    return response.data;
  }

  /** Named shift windows (Morning / Evening); [] when none or not readable */
  async listShiftTemplates() {
    try {
      return (await this._all(`${BASE}/shift-templates/?page_size=100`)).filter((t) => t.is_active !== false);
    } catch (error) {
      return [];
    }
  }

  /** The signed-in user's open shift, or null */
  async getCurrentShift() {
    try {
      const response = await ApiClient.get(`${BASE}/cash-register/current/`);
      const data = response.data;
      return data && data.id ? data : null;
    } catch (error) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  }

  /** One shift with its live totals */
  async getShift(id) {
    const response = await ApiClient.get(`${BASE}/cash-register/${id}/`);
    return response.data;
  }

  /**
   * Fresh copy of a shift before showing its money: the shift itself, else the user's current shift
   * (cashiers may not read other shifts), else what we already have.
   */
  async refreshShift(shift) {
    if (!shift?.id) return shift;
    try {
      return await this.getShift(shift.id);
    } catch (error) {
      const current = await this.getCurrentShift().catch(() => null);
      return current && current.id === shift.id ? current : shift;
    }
  }

  /**
   * POS bill payments since `from`, newest first (stops paging once older than `from`).
   * GET /api/pos/api/order-payments/ has no date filter, so this walks the newest pages.
   */
  async listPosPaymentsSince(from) {
    const start = new Date(from).getTime();
    const rows = [];
    let url = `/api/pos/api/order-payments/?${new URLSearchParams({ ordering: '-processed_at', page_size: 200 })}`;
    for (let page = 0; url && page < 20; page += 1) {
      const response = await ApiClient.get(url);
      const batch = rowsOf(response.data);
      rows.push(...batch);
      const oldest = batch.length ? new Date(batch[batch.length - 1].processed_at || batch[batch.length - 1].created_at).getTime() : -Infinity;
      url = oldest >= start && !Array.isArray(response.data) && response.data?.next ? toRelative(response.data.next) : null;
    }
    return rows;
  }

  /**
   * A fresh shift plus the POS bills its cashier took while it was open (shift.posTakings),
   * which the server's totals don't include yet. Without access to POS payments, posTakings is null.
   */
  async loadShiftWithTakings(shift, { cashierUserId = null } = {}) {
    const fresh = await this.refreshShift(shift);
    if (!fresh?.opened_at) return fresh;
    try {
      const payments = await this.listPosPaymentsSince(fresh.opened_at);
      return {
        ...fresh,
        // Payments record the user who took them: the signed-in cashier, else who opened the shift
        posTakings: summarizePosPayments(payments, {
          cashierId: cashierUserId ?? fresh.opened_by ?? fresh.cashier,
          from: fresh.opened_at,
          to: fresh.closed_at || null,
        }),
      };
    } catch (error) {
      return { ...fresh, posTakings: null };
    }
  }

  /** Recent shifts, newest first (open ones are filtered by the caller) */
  async listShifts({ limit = 100 } = {}) {
    const response = await ApiClient.get(`${BASE}/cash-register/`, { params: { ordering: '-opened_at', page_size: limit } });
    return rowsOf(response.data);
  }

  /**
   * Pre-fill for the open form: { opening_balance, shift_template: {id, …} | null, carried_from: {cashier, …} | null }.
   * The opening cash is what the last shift on this counter left in the drawer.
   */
  async getOpenDefaults(counterId) {
    try {
      const response = await ApiClient.get(`${BASE}/cash-register/open_defaults/`, { params: counterId != null ? { counter_id: counterId } : {} });
      return response.data || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Opens a shift for the signed-in user on a counter (same body as the hotel's accounting screen).
   * @param {Object} args - { counterId, shiftTemplateId, openingBalance, notes }
   */
  async openShift({ counterId, shiftTemplateId = null, openingBalance, notes = '' }) {
    const body = { counter_id: counterId, opening_balance: openingBalance, notes };
    if (shiftTemplateId != null) body.shift_template_id = shiftTemplateId;
    const response = await ApiClient.post(`${BASE}/cash-register/open/`, body);
    return response.data;
  }

  /** Closes a shift with the counted cash; a Manager may close someone else's */
  async closeShift(id, { physicalCount, notes = '' }) {
    const response = await ApiClient.post(`${BASE}/cash-register/${id}/close/`, { physical_count: physicalCount, notes });
    return response.data;
  }
}

const cashCounterService = new CashCounterService();
export default cashCounterService;
