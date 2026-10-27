import ApiClient from './ApiClient';

const BASE = '/api/pos/api';

const toRelative = (next) => {
  const url = new URL(next, window.location.origin);
  return `${url.pathname}${url.search}`;
};

/** Field errors from a DRF response as one readable line */
export const describeProductError = (error, fallback = 'The request failed.') => {
  const data = error?.response?.data;
  if (!error?.response) return error?.message === 'Network Error' ? 'Could not reach the server. Check the connection.' : (error?.message || fallback);
  if (!data) return fallback;
  if (typeof data === 'string') return data.slice(0, 300);
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  const parts = [];
  Object.entries(data).forEach(([field, value]) => {
    const text = Array.isArray(value) ? value.join(' ') : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    parts.push(field === 'non_field_errors' ? text : `${field}: ${text}`);
  });
  return parts.join(' · ') || fallback;
};

/**
 * Product catalogue administration (menus, categories, menu items).
 * Reads every page so the admin screens see the whole catalogue, including unavailable items.
 */
class ProductService {
  async _all(url) {
    const out = [];
    let next = url;
    for (let page = 0; next && page < 50; page += 1) {
      const response = await ApiClient.get(next);
      const data = response.data;
      out.push(...(Array.isArray(data) ? data : (data.results || [])));
      next = !Array.isArray(data) && data.next ? toRelative(data.next) : null;
    }
    return out;
  }

  /** Every menu item of the restaurant; `category` is normalised to the category id */
  async getProducts(restaurantId) {
    const items = await this._all(`${BASE}/menu-items/?${new URLSearchParams({ restaurant_id: restaurantId, page_size: 500 })}`);
    return items.map((item) => {
      const c = item.category ?? item.category_id ?? null;
      return { ...item, category: c && typeof c === 'object' ? c.id : c };
    });
  }

  getCategories(restaurantId) {
    return this._all(`${BASE}/menu-categories/?${new URLSearchParams({ restaurant_id: restaurantId, page_size: 500 })}`);
  }

  async getMenus(restaurantId) {
    try {
      const response = await ApiClient.get(`${BASE}/menus/by_restaurant/`, { params: { restaurant_id: restaurantId } });
      const data = response.data;
      return Array.isArray(data) ? data : (data.results || []);
    } catch (error) {
      return this._all(`${BASE}/menus/?${new URLSearchParams({ restaurant_id: restaurantId })}`);
    }
  }

  async createMenu(restaurantId, name) {
    const response = await ApiClient.post(`${BASE}/menus/`, { name, restaurant: restaurantId, is_available: true });
    return response.data;
  }

  async createProduct(payload) {
    const response = await ApiClient.post(`${BASE}/menu-items/`, payload);
    return response.data;
  }

  /** PATCH: only the fields sent change */
  async updateProduct(id, payload) {
    const response = await ApiClient.patch(`${BASE}/menu-items/${id}/`, payload);
    return response.data;
  }

  setAvailability(id, isAvailable) {
    return this.updateProduct(id, { is_available: isAvailable });
  }

  async createCategory(payload) {
    const response = await ApiClient.post(`${BASE}/menu-categories/`, payload);
    return response.data;
  }

  async updateCategory(id, payload) {
    const response = await ApiClient.patch(`${BASE}/menu-categories/${id}/`, payload);
    return response.data;
  }

  /**
   * Runs one request per item, a few at a time, and reports progress.
   * @returns {Promise<{done: Array, failed: Array<{item, error}>}>}
   */
  async runEach(items, action, onProgress, concurrency = 4) {
    const done = [];
    const failed = [];
    let index = 0;
    let finished = 0;
    const worker = async () => {
      while (index < items.length) {
        const item = items[index];
        index += 1;
        try {
          done.push({ item, result: await action(item) });
        } catch (error) {
          failed.push({ item, error: describeProductError(error) });
        }
        finished += 1;
        if (onProgress) onProgress(finished, items.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return { done, failed };
  }
}

const productService = new ProductService();
export default productService;
