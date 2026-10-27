import ApiClient from './ApiClient';

/**
 * Menu Service - Handle menu-related API calls
 * Manages menus, categories, and menu items
 */
class MenuService {
  constructor() {
    this.baseURL = '/api/pos/api';
  }

  /**
   * Get all menu items (tested endpoint)
   * @returns {Promise<Array>} List of menu items
   */
  async getMenuItems() {
    try {
      const response = await ApiClient.get(`${this.baseURL}/menu-items/`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching menu items:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get menu items by restaurant
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Array>} List of menu items for the restaurant
   */
  async getMenuItemsByRestaurant(restaurantId) {
    try {
      const params = new URLSearchParams({ restaurant_id: restaurantId });
      const response = await ApiClient.get(`${this.baseURL}/menu-items/?${params.toString()}`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching menu items by restaurant:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get available menu items only
   * @param {number} restaurantId - Optional restaurant filter
   * @returns {Promise<Array>} List of available menu items
   */
  async getAvailableMenuItems(restaurantId = null) {
    try {
      let items;
      if (restaurantId) {
        items = await this.getMenuItemsByRestaurant(restaurantId);
      } else {
        items = await this.getMenuItems();
      }
      
      return items.filter(item => item.is_available);
    } catch (error) {
      console.error('Error fetching available menu items:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get a specific menu item by ID
   * @param {number} itemId - Menu item ID
   * @returns {Promise<Object>} Menu item details
   */
  async getMenuItem(itemId) {
    try {
      const response = await ApiClient.get(`${this.baseURL}/menu-items/${itemId}/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching menu item:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Create a new menu item
   * @param {Object} itemData - Menu item data
   * @returns {Promise<Object>} Created menu item
   */
  async createMenuItem(itemData) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/menu-items/`, itemData);
      return response.data;
    } catch (error) {
      console.error('Error creating menu item:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update a menu item
   * @param {number} itemId - Menu item ID
   * @param {Object} itemData - Updated menu item data
   * @returns {Promise<Object>} Updated menu item
   */
  async updateMenuItem(itemId, itemData) {
    try {
      const response = await ApiClient.put(`${this.baseURL}/menu-items/${itemId}/`, itemData);
      return response.data;
    } catch (error) {
      console.error('Error updating menu item:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Delete a menu item
   * @param {number} itemId - Menu item ID
   * @returns {Promise<void>}
   */
  async deleteMenuItem(itemId) {
    try {
      await ApiClient.delete(`${this.baseURL}/menu-items/${itemId}/`);
    } catch (error) {
      console.error('Error deleting menu item:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Toggle menu item availability
   * @param {number} itemId - Menu item ID
   * @param {boolean} isAvailable - New availability status
   * @returns {Promise<Object>} Updated menu item
   */
  async toggleItemAvailability(itemId, isAvailable) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/menu-items/${itemId}/`, {
        is_available: isAvailable
      });
      return response.data;
    } catch (error) {
      console.error('Error toggling item availability:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Search menu items by name, description, or dietary tags
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Filtered menu items
   */
  async searchMenuItems(query = '', filters = {}) {
    try {
      const params = new URLSearchParams();
      if (query) params.append('search', query);
      
      // Add dietary filters
      if (filters.vegetarian) params.append('is_vegetarian', 'true');
      if (filters.vegan) params.append('is_vegan', 'true');
      if (filters.glutenFree) params.append('is_gluten_free', 'true');
      if (filters.spicy) params.append('is_spicy', 'true');
      
      // Add availability filter
      if (filters.availableOnly !== undefined) {
        params.append('is_available', filters.availableOnly.toString());
      }
      
      // Add restaurant filter
      if (filters.restaurantId) {
        params.append('restaurant_id', filters.restaurantId.toString());
      }

      const url = `${this.baseURL}/menu-items/?${params.toString()}`;
      const response = await ApiClient.get(url);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error searching menu items:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get menu items grouped by category
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Menu items grouped by category
   */
  async getMenuItemsByCategory(restaurantId) {
    try {
      // Get all menu categories for the restaurant
      const categories = await this.getMenuCategories(restaurantId);
      const items = await this.getMenuItemsByRestaurant(restaurantId);
      
      // Group items by category
      const grouped = {};
      
      categories.forEach(category => {
        grouped[category.name] = {
          category: category,
          items: items.filter(item => item.category === category.id)
        };
      });
      
      // Add items without category
      const uncategorizedItems = items.filter(item => 
        !categories.some(cat => cat.id === item.category)
      );
      
      if (uncategorizedItems.length > 0) {
        grouped['Other'] = {
          category: { id: null, name: 'Other', description: 'Uncategorized items' },
          items: uncategorizedItems
        };
      }
      
      return grouped;
    } catch (error) {
      console.error('Error fetching menu items by category:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get menu categories
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Array>} List of menu categories
   */
  async getMenuCategories(restaurantId = null) {
    try {
      const params = new URLSearchParams();
      if (restaurantId) params.append('restaurant_id', restaurantId);
      
      const url = `${this.baseURL}/menu-categories/?${params.toString()}`;
      const response = await ApiClient.get(url);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching menu categories:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get popular menu items (based on order frequency)
   * @param {number} restaurantId - Restaurant ID
   * @param {number} limit - Number of items to return
   * @returns {Promise<Array>} Popular menu items
   */
  async getPopularMenuItems(restaurantId, limit = 10) {
    try {
      const params = new URLSearchParams({
        restaurant_id: restaurantId,
        ordering: '-popularity',
        limit: limit.toString()
      });
      
      const url = `${this.baseURL}/menu-items/popular/?${params.toString()}`;
      const response = await ApiClient.get(url);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching popular menu items:', error);
      // Fallback to regular menu items if popular endpoint doesn't exist
      const items = await this.getAvailableMenuItems(restaurantId);
      return items.slice(0, limit);
    }
  }

  /**
   * Get dietary filter options for UI
   * @returns {Array} Available dietary filters
   */
  getDietaryFilters() {
    return [
      { key: 'vegetarian', label: 'Vegetarian', icon: '🌿' },
      { key: 'vegan', label: 'Vegan', icon: '🌱' },
      { key: 'glutenFree', label: 'Gluten-Free', icon: '🌾' },
      { key: 'spicy', label: 'Spicy', icon: '🌶️' }
    ];
  }

  /**
   * Format price for display
   * @param {string|number} price - Price value
   * @param {string} currencyCode - Currency code (e.g., 'USD', 'INR')
   * @returns {string} Formatted price
   * @deprecated Use CurrencyService.formatPrice() or POS context formatPrice() instead
   */
  formatPrice(price, currencyCode = 'USD') {
    console.warn('MenuService.formatPrice is deprecated. Use CurrencyService.formatPrice() or POS context formatPrice() instead.');
    
    // Import CurrencyService dynamically to avoid circular imports
    const CurrencyService = require('./CurrencyService').default;
    return CurrencyService.formatPrice(price, currencyCode);
  }

  /**
   * Calculate preparation time for multiple items
   * @param {Array} items - Array of menu items with quantities
   * @returns {number} Total estimated preparation time in minutes
   */
  calculatePreparationTime(items) {
    if (!items || items.length === 0) return 0;
    
    // Get the maximum preparation time (assuming parallel cooking)
    const maxTime = Math.max(...items.map(item => {
      const prepTime = item.menuItem?.preparation_time_minutes || item.preparation_time_minutes || 0;
      return prepTime;
    }));
    
    // Add 2 minutes for each additional item (coordination overhead)
    const coordinationTime = Math.max(0, (items.length - 1) * 2);
    
    return maxTime + coordinationTime;
  }

  /**
   * Get menu item nutrition info
   * @param {number} itemId - Menu item ID
   * @returns {Promise<Object>} Nutrition information
   */
  async getMenuItemNutrition(itemId) {
    try {
      const response = await ApiClient.get(`${this.baseURL}/menu-items/${itemId}/nutrition/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching menu item nutrition:', error);
      // Return basic info from main item data if nutrition endpoint doesn't exist
      const item = await this.getMenuItem(itemId);
      return {
        calories: item.calories || null,
        allergens: item.allergens || null,
        dietary_tags: item.dietary_tags || []
      };
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
          .map(([field, messages]) => {
            const messageArray = Array.isArray(messages) ? messages : [messages];
            const validMessages = messageArray.filter(msg => msg && msg.toString().trim());
            return validMessages.length > 0 ? `${field}: ${validMessages.join(', ')}` : null;
          })
          .filter(msg => msg) // Remove empty messages
          .join('; ');
        return new Error(errorMessages || 'Validation error occurred');
      }
    }
    return new Error(error.message || 'An error occurred while processing the request');
  }
}

const menuService = new MenuService();
export default menuService;