/**
 * Third Party Service - Integration point for aggregator platforms (Zomato, Swiggy)
 *
 * The backend does not expose any aggregator endpoints yet, so this service
 * reports "not configured" and never invents orders. When the backend adds
 * the endpoints described in docs/FINE_DINE_BACKEND_REQUIREMENTS.md, implement
 * the methods below with ApiClient calls; the UI already handles both states.
 */
class ThirdPartyService {
  constructor() {
    this.baseURL = '/api/pos/api';
    this.supportedPlatforms = [
      { key: 'zomato', label: 'Zomato' },
      { key: 'swiggy', label: 'Swiggy' },
    ];
  }

  /**
   * Get integration status for the restaurant
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<{configured: boolean, platforms: Array}>}
   */
  async getIntegrationStatus(restaurantId) {
    // Backend endpoint not available yet: GET /third-party/integrations/?restaurant_id=X
    return { configured: false, platforms: [] };
  }

  /**
   * Get live (incoming / in-progress) third-party orders
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Live orders
   */
  async getLiveOrders(restaurantId) {
    const status = await this.getIntegrationStatus(restaurantId);
    if (!status.configured) return [];
    // Backend endpoint not available yet: GET /third-party/orders/?restaurant_id=X&status=live
    return [];
  }
}

const thirdPartyService = new ThirdPartyService();
export default thirdPartyService;
