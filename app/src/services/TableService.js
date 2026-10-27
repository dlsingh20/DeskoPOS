import ApiClient from './ApiClient';

/**
 * Table Service - Handle table-related API calls
 * Manages table status, availability, and assignments
 */
class TableService {
  constructor() {
    this.baseURL = '/api/pos/api';
  }

  /**
   * Get all tables for the current hotel
   * @returns {Promise<Array>} List of tables
   */
  async getTables() {
    try {
      const response = await ApiClient.get(`${this.baseURL}/tables/`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching tables:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get tables by restaurant ID (tested endpoint)
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Array>} List of tables for the restaurant
   */
  async getTablesByRestaurant(restaurantId) {
    try {
      const response = await ApiClient.get(`${this.baseURL}/tables/by_restaurant/?restaurant_id=${restaurantId}`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching tables by restaurant:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get a specific table by ID
   * @param {number} tableId - Table ID
   * @returns {Promise<Object>} Table details
   */
  async getTable(tableId) {
    try {
      const response = await ApiClient.get(`${this.baseURL}/tables/${tableId}/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Create a new table
   * @param {Object} tableData - Table data
   * @returns {Promise<Object>} Created table
   */
  async createTable(tableData) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/tables/`, tableData);
      return response.data;
    } catch (error) {
      console.error('Error creating table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update table information
   * @param {number} tableId - Table ID
   * @param {Object} tableData - Updated table data
   * @returns {Promise<Object>} Updated table
   */
  async updateTable(tableId, tableData) {
    try {
      const response = await ApiClient.put(`${this.baseURL}/tables/${tableId}/`, tableData);
      return response.data;
    } catch (error) {
      console.error('Error updating table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update table status
   * @param {number} tableId - Table ID
   * @param {string} status - New status (available, occupied, reserved, cleaning, maintenance)
   * @returns {Promise<Object>} Updated table
   */
  async updateTableStatus(tableId, status) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/tables/${tableId}/update_status/`, { status });
      return response.data;
    } catch (error) {
      console.error('Error updating table status:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Delete a table
   * @param {number} tableId - Table ID
   * @returns {Promise<void>}
   */
  async deleteTable(tableId) {
    try {
      await ApiClient.delete(`${this.baseURL}/tables/${tableId}/`);
    } catch (error) {
      console.error('Error deleting table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get available tables for a restaurant
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Array>} List of available tables
   */
  async getAvailableTables(restaurantId) {
    try {
      const tables = await this.getTablesByRestaurant(restaurantId);
      return tables.filter(table => table.is_available);
    } catch (error) {
      console.error('Error fetching available tables:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get tables grouped by status
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Tables grouped by status
   */
  async getTablesGroupedByStatus(restaurantId) {
    try {
      const tables = await this.getTablesByRestaurant(restaurantId);
      
      const grouped = tables.reduce((acc, table) => {
        if (!acc[table.status]) {
          acc[table.status] = [];
        }
        acc[table.status].push(table);
        return acc;
      }, {});

      return {
        available: grouped.available || [],
        occupied: grouped.occupied || [],
        reserved: grouped.reserved || [],
        cleaning: grouped.cleaning || [],
        maintenance: grouped.maintenance || [],
        total: tables.length
      };
    } catch (error) {
      console.error('Error fetching tables grouped by status:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Reserve a table
   * @param {number} tableId - Table ID
   * @param {Object} reservationData - Reservation details
   * @returns {Promise<Object>} Updated table
   */
  async reserveTable(tableId, reservationData = {}) {
    try {
      return await this.updateTableStatus(tableId, 'reserved');
    } catch (error) {
      console.error('Error reserving table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Occupy a table (when order is placed)
   * @param {number} tableId - Table ID
   * @returns {Promise<Object>} Updated table
   */
  async occupyTable(tableId) {
    try {
      return await this.updateTableStatus(tableId, 'occupied');
    } catch (error) {
      console.error('Error occupying table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Free up a table (after order completion)
   * @param {number} tableId - Table ID
   * @returns {Promise<Object>} Updated table
   */
  async freeTable(tableId) {
    try {
      return await this.updateTableStatus(tableId, 'available');
    } catch (error) {
      console.error('Error freeing table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Mark table for cleaning
   * @param {number} tableId - Table ID
   * @returns {Promise<Object>} Updated table
   */
  async markTableForCleaning(tableId) {
    try {
      return await this.updateTableStatus(tableId, 'cleaning');
    } catch (error) {
      console.error('Error marking table for cleaning:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Mark table for maintenance
   * @param {number} tableId - Table ID
   * @returns {Promise<Object>} Updated table
   */
  async markTableForMaintenance(tableId) {
    try {
      return await this.updateTableStatus(tableId, 'maintenance');
    } catch (error) {
      console.error('Error marking table for maintenance:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Change some table fields (PATCH)
   * @param {number} tableId - Table ID
   * @param {Object} fields - Fields to change
   * @returns {Promise<Object>} Updated table
   */
  async patchTable(tableId, fields) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/tables/${tableId}/`, fields);
      return response.data;
    } catch (error) {
      console.error('Error updating table:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Generate a new QR code for a table; printed copies of the old one stop working
   * once the guest app validates the code.
   * @param {number} tableId - Table ID
   * @returns {Promise<Object>} Table with the new qr_code / qr_code_url
   */
  async regenerateQrCode(tableId) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/tables/${tableId}/generate_qr_code/`, {});
      return response.data;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Makes sure a (new) table has a QR code: asks the server to generate one when the table came back
   * without qr_code / qr_code_url. Never throws; returns the best table record available.
   * @param {Object} table - Table as returned by createTable
   */
  async ensureQrCode(table) {
    if (!table?.id || table.qr_code || table.qr_code_url) return table;
    try {
      return { ...table, ...(await this.regenerateQrCode(table.id)) };
    } catch (error) {
      return table;
    }
  }

  /**
   * Get table QR code URL
   * @param {number} tableId - Table ID
   * @returns {Promise<string>} QR code URL
   */
  async getTableQRCode(tableId) {
    try {
      const table = await this.getTable(tableId);
      return table.qr_code_url || table.qr_code;
    } catch (error) {
      console.error('Error fetching table QR code:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Search tables by number or name
   * @param {number} restaurantId - Restaurant ID
   * @param {string} query - Search query
   * @returns {Promise<Array>} Filtered tables
   */
  async searchTables(restaurantId, query) {
    try {
      const tables = await this.getTablesByRestaurant(restaurantId);
      
      if (!query) return tables;
      
      const searchTerm = query.toLowerCase();
      return tables.filter(table => 
        table.table_number.toLowerCase().includes(searchTerm) ||
        table.name.toLowerCase().includes(searchTerm) ||
        (table.location && table.location.toLowerCase().includes(searchTerm))
      );
    } catch (error) {
      console.error('Error searching tables:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get table capacity statistics
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Capacity statistics
   */
  async getCapacityStats(restaurantId) {
    try {
      const tables = await this.getTablesByRestaurant(restaurantId);
      
      const stats = tables.reduce((acc, table) => {
        acc.totalTables += 1;
        acc.totalCapacity += table.capacity;
        
        if (table.is_available) {
          acc.availableTables += 1;
          acc.availableCapacity += table.capacity;
        }
        
        if (table.status === 'occupied') {
          acc.occupiedTables += 1;
          acc.occupiedCapacity += table.capacity;
        }
        
        return acc;
      }, {
        totalTables: 0,
        totalCapacity: 0,
        availableTables: 0,
        availableCapacity: 0,
        occupiedTables: 0,
        occupiedCapacity: 0
      });

      stats.occupancyRate = stats.totalTables > 0 
        ? (stats.occupiedTables / stats.totalTables * 100).toFixed(1)
        : 0;

      return stats;
    } catch (error) {
      console.error('Error fetching capacity stats:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get table status options for UI
   * @returns {Array} Available table statuses
   */
  getTableStatuses() {
    return [
      { value: 'available', label: 'Available', color: 'green' },
      { value: 'occupied', label: 'Occupied', color: 'red' },
      { value: 'reserved', label: 'Reserved', color: 'yellow' },
      { value: 'cleaning', label: 'Cleaning', color: 'blue' },
      { value: 'maintenance', label: 'Maintenance', color: 'orange' }
    ];
  }

  /**
   * Free tables with stale orders (from previous days) for a restaurant
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Result with freed tables count and details
   */
  async freeStaleTablesByRestaurant(restaurantId) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/tables/free_stale_tables/`, {
        restaurant_id: restaurantId
      });
      return response.data;
    } catch (error) {
      console.error('Error freeing stale tables:', error);
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

const tableService = new TableService();
export default tableService;