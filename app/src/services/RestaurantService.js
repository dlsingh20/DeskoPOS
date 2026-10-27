import ApiClient from './ApiClient';

/**
 * Restaurant Service - Handle restaurant-related API calls
 * Integrates with the Room99 POS backend API
 */
class RestaurantService {
  constructor() {
    this.baseURL = '/api/pos/api';
  }

  /**
   * Get all restaurants for the current hotel
   * @returns {Promise<Array>} List of restaurants
   */
  async getRestaurants() {
    try {
      const response = await ApiClient.get(`${this.baseURL}/restaurants/`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching restaurants:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get a specific restaurant by ID
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Restaurant details
   */
  async getRestaurant(restaurantId) {
    try {
      const response = await ApiClient.get(`${this.baseURL}/restaurants/${restaurantId}/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching restaurant:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Create a new restaurant
   * @param {Object} restaurantData - Restaurant data
   * @returns {Promise<Object>} Created restaurant
   */
  async createRestaurant(restaurantData) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/restaurants/`, restaurantData);
      return response.data;
    } catch (error) {
      console.error('Error creating restaurant:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update an existing restaurant
   * @param {number} restaurantId - Restaurant ID
   * @param {Object} restaurantData - Updated restaurant data
   * @returns {Promise<Object>} Updated restaurant
   */
  async updateRestaurant(restaurantId, restaurantData) {
    try {
      const response = await ApiClient.put(`${this.baseURL}/restaurants/${restaurantId}/`, restaurantData);
      return response.data;
    } catch (error) {
      console.error('Error updating restaurant:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Delete a restaurant
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<void>}
   */
  async deleteRestaurant(restaurantId) {
    try {
      await ApiClient.delete(`${this.baseURL}/restaurants/${restaurantId}/`);
    } catch (error) {
      console.error('Error deleting restaurant:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get restaurant statistics
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Restaurant statistics
   */
  async getRestaurantStats(restaurantId) {
    try {
      const response = await ApiClient.get(`${this.baseURL}/restaurants/${restaurantId}/tables/`);
      const tables = Array.isArray(response.data) ? response.data : (response.data?.results || []);
      const byStatus = tables.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});
      return {
        total_tables: tables.length,
        available_tables: byStatus.available || 0,
        occupied_tables: byStatus.occupied || 0,
        reserved_tables: byStatus.reserved || 0,
        tables_by_status: byStatus,
      };
    } catch (error) {
      console.error('Error fetching restaurant stats:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get restaurants with table availability
   * @returns {Promise<Array>} List of restaurants with table counts
   */
  async getRestaurantsWithAvailability() {
    try {
      const restaurants = await this.getRestaurants();
      
      // The API already includes total_tables and available_tables
      return restaurants.map(restaurant => ({
        ...restaurant,
        occupancyRate: restaurant.total_tables > 0 
          ? ((restaurant.total_tables - restaurant.available_tables) / restaurant.total_tables * 100).toFixed(1)
          : 0
      }));
    } catch (error) {
      console.error('Error fetching restaurants with availability:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get active restaurants only
   * @returns {Promise<Array>} List of active restaurants
   */
  async getActiveRestaurants() {
    try {
      const restaurants = await this.getRestaurants();
      return restaurants.filter(restaurant => restaurant.is_active);
    } catch (error) {
      console.error('Error fetching active restaurants:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Search restaurants by name or type
   * @param {string} query - Search query
   * @param {string} type - Restaurant type filter
   * @returns {Promise<Array>} Filtered restaurants
   */
  async searchRestaurants(query = '', type = '') {
    try {
      const params = new URLSearchParams();
      if (query) params.append('search', query);
      if (type) params.append('type', type);

      const url = `${this.baseURL}/restaurants/?${params.toString()}`;
      const response = await ApiClient.get(url);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error searching restaurants:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get restaurant types for filtering
   * @returns {Array} Available restaurant types
   */
  getRestaurantTypes() {
    return [
      { value: '', label: 'All Types' },
      { value: 'restaurant', label: 'Restaurant' },
      { value: 'bar', label: 'Bar' },
      { value: 'cafe', label: 'Cafe' },
      { value: 'room_service', label: 'Room Service' }
    ];
  }

  /**
   * Toggle restaurant active status
   * @param {number} restaurantId - Restaurant ID
   * @param {boolean} isActive - New active status
   * @returns {Promise<Object>} Updated restaurant
   */
  async toggleRestaurantStatus(restaurantId, isActive) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/restaurants/${restaurantId}/`, {
        is_active: isActive
      });
      return response.data;
    } catch (error) {
      console.error('Error toggling restaurant status:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Handle API errors consistently
   * @private
   * @param {Error} error - API error
   * @returns {Error} Formatted error
   */
  _handleError(error) {
    if (error.response?.data) {
      const apiError = error.response.data;
      if (apiError.message) {
        return new Error(apiError.message);
      }
      if (apiError.detail) {
        return new Error(apiError.detail);
      }
      if (typeof apiError === 'string') {
        return new Error(apiError);
      }
      // Handle validation errors
      if (apiError.errors) {
        const errorMessages = Object.entries(apiError.errors)
          .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
          .join('; ');
        return new Error(errorMessages);
      }
    }
    return new Error(error.message || 'An error occurred while processing the request');
  }
}

const restaurantService = new RestaurantService();
export default restaurantService;