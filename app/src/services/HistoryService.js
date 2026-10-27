import ApiClient from './ApiClient';
import orderService from './OrderService';
import { CLOSED_ORDER_STATUSES, getCloseTime } from '../utils/historyUtils';

const BASE = '/api/pos/api';
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // 5,000 orders per range before the result is marked truncated
const DETAIL_CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
// Bills are reported on the day they close; open orders older than this are not looked for
const CLOSE_LOOKBACK_DAYS = 7;

/** Keep only path + query so the request goes through ApiClient's base URL */
const toRelative = (next) => {
  const url = new URL(next, window.location.origin);
  return `${url.pathname}${url.search}`;
};

const toDay = (date) => date.toISOString().slice(0, 10);

const orderTimeOf = (order) => new Date(order.order_time || order.created_at || 0).getTime();

/**
 * Read-only data access for the HISTORY module.
 */
class HistoryService {
  /**
   * Candidate closed orders (completed, outstanding, cancelled, refunded) for bills *closed* in [from, to).
   *
   * A bill belongs to the day it was settled, but the server filters and sorts by order time, so orders
   * are read from `lookbackDays` before `from`. Orders whose list entry already shows a close time
   * outside the range are dropped; the rest are confirmed by getClosedBills after loading full details.
   * Restaurant and date filters are re-checked here in case the server ignores them. Pages come newest
   * first, so paging stops once orders are older than the look-back; if the server does not sort, every
   * page up to MAX_PAGES is read and `truncated` reports it.
   *
   * @returns {Promise<{orders: Array, truncated: boolean}>}
   */
  async getClosedOrders({ restaurantId, from, to, lookbackDays = CLOSE_LOOKBACK_DAYS }) {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const earliestMs = fromMs - lookbackDays * DAY_MS;
    const params = new URLSearchParams({
      restaurant_id: restaurantId,
      ordering: '-order_time',
      page_size: PAGE_SIZE,
      // Widened by a day on each side: the server may interpret dates in another time zone
      date_from: toDay(new Date(earliestMs - DAY_MS)),
      date_to: toDay(new Date(toMs + DAY_MS)),
    });
    let url = `${BASE}/orders/?${params.toString()}`;
    const collected = new Map();
    let truncated = false;

    for (let page = 0; url; page += 1) {
      if (page >= MAX_PAGES) {
        truncated = true;
        break;
      }
      const response = await ApiClient.get(url);
      const data = response.data;
      const results = Array.isArray(data) ? data : (data.results || []);

      results.forEach((order) => {
        if (!CLOSED_ORDER_STATUSES.includes(order.status)) return;
        if (order.restaurant !== undefined && order.restaurant !== null && String(order.restaurant) !== String(restaurantId)) return;
        // A bill cannot close before it was ordered, nor (for this report) more than lookbackDays later
        const ordered = orderTimeOf(order);
        if (ordered < earliestMs || ordered >= toMs) return;
        const closed = getCloseTime(order);
        if (closed) {
          const closedMs = new Date(closed).getTime();
          if (closedMs < fromMs || closedMs >= toMs) return;
        }
        collected.set(order.id, order);
      });

      const times = results.map(orderTimeOf);
      const sortedDesc = times.every((t, i) => i === 0 || t <= times[i - 1]);
      const oldest = times.length ? Math.min(...times) : null;
      // Newest-first pages: nothing further back can have closed inside the range
      if (sortedDesc && oldest !== null && oldest < earliestMs) break;

      url = !Array.isArray(data) && data.next ? toRelative(data.next) : null;
    }

    return { orders: Array.from(collected.values()), truncated };
  }

  /**
   * Bills closed in [from, to) with full details: candidates from getClosedOrders, details loaded,
   * then kept only when their close time (closed_at, last payment or last update) is in the range.
   *
   * @returns {Promise<{orders: Array, truncated: boolean, failed: number}>}
   */
  async getClosedBills({ restaurantId, from, to, onProgress }) {
    const { orders, truncated } = await this.getClosedOrders({ restaurantId, from, to });
    const hydrated = await this.hydrateOrders(orders, onProgress);
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const inRange = hydrated.orders.filter((o) => {
      const closed = getCloseTime(o);
      // No close time at all (should not happen with full details): keep it by its order time
      const t = new Date(closed || o.order_time || o.created_at || 0).getTime();
      return t >= fromMs && t < toMs;
    });
    return { orders: inRange, truncated, failed: hydrated.failed };
  }

  /**
   * Loads the full order for bills whose list entry is incomplete (items, payments, amounts).
   * @param {Array} orders
   * @param {Function} [onProgress] (done, total)
   * @returns {Promise<{orders: Array, failed: number}>}
   */
  async hydrateOrders(orders, onProgress) {
    // The list returns a slim order (no subtotal, tax, discount, charges or close time): load the full order
    const missing = orders.filter((o) => !Array.isArray(o.items) || !Array.isArray(o.payments) || o.subtotal === undefined || o.tax_amount === undefined);
    if (!missing.length) return { orders, failed: 0 };

    const byId = new Map(orders.map((o) => [o.id, o]));
    let done = 0;
    let failed = 0;
    let index = 0;
    const worker = async () => {
      while (index < missing.length) {
        const order = missing[index];
        index += 1;
        try {
          byId.set(order.id, { ...order, ...(await orderService.getOrder(order.id)) });
        } catch (error) {
          failed += 1;
        }
        done += 1;
        if (onProgress) onProgress(done, missing.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, missing.length) }, worker));
    return { orders: orders.map((o) => byId.get(o.id)), failed };
  }

  /** Full order, for a bill expanded before its items were loaded */
  async getOrderDetail(orderId) {
    return orderService.getOrder(orderId);
  }

  /**
   * Outstanding (credit) records, keyed by order id. Used to tell resolved, written-off and
   * transferred credit bills apart from ones still awaiting collection.
   */
  async getOutstandingRecords() {
    const records = new Map();
    let url = `${BASE}/outstanding-orders/?page_size=${PAGE_SIZE}`;
    for (let page = 0; url && page < 20; page += 1) {
      const response = await ApiClient.get(url);
      const data = response.data;
      (Array.isArray(data) ? data : (data.results || [])).forEach((record) => {
        const existing = records.get(record.order);
        // Keep the most recently updated record for an order
        if (!existing || String(record.updated_at || '') > String(existing.updated_at || '')) records.set(record.order, record);
      });
      url = !Array.isArray(data) && data.next ? toRelative(data.next) : null;
    }
    return records;
  }

  /** Menu item id -> category name, from the restaurant's full menu (including unavailable items) */
  async getItemCategories(restaurantId) {
    const [itemsRes, categoriesRes] = await Promise.all([
      ApiClient.get(`${BASE}/menu-items/?${new URLSearchParams({ restaurant_id: restaurantId, page_size: 500 })}`),
      ApiClient.get(`${BASE}/menu-categories/?${new URLSearchParams({ restaurant_id: restaurantId, page_size: 200 })}`),
    ]);
    const items = itemsRes.data.results || itemsRes.data || [];
    const categories = categoriesRes.data.results || categoriesRes.data || [];
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const map = new Map();
    items.forEach((item) => {
      const name = item.category_name || categoryNames.get(item.category) || (typeof item.category === 'string' ? item.category : '');
      if (name) map.set(item.id, name);
    });
    return map;
  }

  /**
   * Most recently closed cash-register shift.
   * @returns {Promise<{available: boolean, shift: Object|null}>}
   */
  async getLastClosedShift() {
    try {
      const response = await ApiClient.get('/api/accounting/cash-register/', {
        params: { ordering: '-register_date', page_size: 10 },
      });
      const rows = response.data.results || response.data || [];
      const closed = rows
        .filter((r) => r.status === 'closed' || r.status === 'reconciled')
        .sort((a, b) => String(b.closed_at || b.register_date).localeCompare(String(a.closed_at || a.register_date)));
      return { available: true, shift: closed[0] || null };
    } catch (error) {
      return { available: false, shift: null };
    }
  }

  /** The signed-in user, for the operator name in the header */
  async getCurrentUser() {
    const response = await ApiClient.get('/api/auth/me/');
    return response.data;
  }
}

const historyService = new HistoryService();
export default historyService;
