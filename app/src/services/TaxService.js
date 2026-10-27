import ApiClient from './ApiClient';

const BASE = '/api/pos/api';

const toRelative = (next) => {
  const url = new URL(next, window.location.origin);
  return `${url.pathname}${url.search}`;
};

const isMissing = (error) => [404, 405, 501].includes(error?.response?.status);

/** Thrown when the backend has no tax endpoints yet */
export class TaxesUnavailableError extends Error {
  constructor() {
    super('The server does not support taxes yet.');
    this.name = 'TaxesUnavailableError';
  }
}

/**
 * Tax master: /api/pos/api/taxes/ (contract in docs/MISSING_APIS.md → "Tax master").
 * Category taxes are saved on the category as tax_ids.
 */
class TaxService {
  /**
   * @returns {Promise<{available: boolean, taxes: Array}>}
   */
  async listTaxes(restaurantId) {
    const taxes = [];
    let url = `${BASE}/taxes/?${new URLSearchParams({ restaurant_id: restaurantId, page_size: 200 })}`;
    try {
      for (let page = 0; url && page < 10; page += 1) {
        const response = await ApiClient.get(url);
        const data = response.data;
        taxes.push(...(Array.isArray(data) ? data : (data.results || [])));
        url = !Array.isArray(data) && data.next ? toRelative(data.next) : null;
      }
    } catch (error) {
      if (isMissing(error)) return { available: false, taxes: [] };
      throw error;
    }
    return { available: true, taxes };
  }

  async createTax(restaurantId, payload) {
    try {
      const response = await ApiClient.post(`${BASE}/taxes/`, { ...payload, restaurant: restaurantId });
      return response.data;
    } catch (error) {
      if (isMissing(error)) throw new TaxesUnavailableError();
      throw error;
    }
  }

  async updateTax(id, payload) {
    try {
      const response = await ApiClient.patch(`${BASE}/taxes/${id}/`, payload);
      return response.data;
    } catch (error) {
      if (isMissing(error)) throw new TaxesUnavailableError();
      throw error;
    }
  }

  setTaxActive(id, isActive) {
    return this.updateTax(id, { is_active: isActive });
  }
}

const taxService = new TaxService();
export default taxService;
