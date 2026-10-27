/**
 * Hotel Service for POS System
 * 
 * Handles hotel settings and configuration data from the backend API.
 * Provides hotel-specific settings including currency, timezone, and operational settings.
 */

import ApiClient from './ApiClient.js';
import { IS_DESKOPOS } from './backend';

class HotelService {
  constructor() {
    this.baseURL = '/api/hotels';
    this.cachedSettings = null;
    this.cacheTimestamp = null;
    this.cacheExpiry = 5 * 60 * 1000; // Cache for 5 minutes
  }

  /**
   * Get current hotel settings for the authenticated user
   * @param {boolean} forceRefresh - Force refresh from API ignoring cache
   * @returns {Promise<Object>} Hotel settings object
   */
  async getCurrentHotelSettings(forceRefresh = false) {
    try {
      // Return cached data if available and not expired
      if (!forceRefresh && this.cachedSettings && this._isCacheValid()) {
        return this.cachedSettings;
      }

      console.log('[HotelService] Fetching hotel settings from API');
      // DeskoPOS: the client's settings stand in for the hotel (name, currency, time zone)
      const response = await ApiClient.get(IS_DESKOPOS ? '/api/pos/api/settings/' : `${this.baseURL}/my-hotel/`);
      
      if (response.data) {
        this.cachedSettings = response.data;
        this.cacheTimestamp = Date.now();
        
        console.log('[HotelService] Hotel settings loaded:', {
          hotelName: response.data.name,
          currency: response.data.currency,
          timezone: response.data.timezone
        });
        
        return response.data;
      } else {
        throw new Error('No hotel data received');
      }
    } catch (error) {
      console.error('[HotelService] Error fetching hotel settings:', error);
      
      // Return cached data if available, even if expired, as fallback
      if (this.cachedSettings) {
        console.warn('[HotelService] Using cached hotel settings as fallback');
        return this.cachedSettings;
      }
      
      // Return default settings as last resort
      return this._getDefaultSettings();
    }
  }

  /**
   * Get only the currency for the current hotel
   * @returns {Promise<string>} Currency code (e.g., 'USD', 'INR')
   */
  async getCurrentHotelCurrency() {
    try {
      const settings = await this.getCurrentHotelSettings();
      return settings.currency || 'USD';
    } catch (error) {
      console.error('[HotelService] Error getting hotel currency:', error);
      return 'USD'; // Default fallback
    }
  }

  /**
   * Get basic hotel information (name, code, etc.)
   * @returns {Promise<Object>} Basic hotel info
   */
  async getCurrentHotelInfo() {
    try {
      const settings = await this.getCurrentHotelSettings();
      return {
        id: settings.id,
        name: settings.name,
        code: settings.code,
        description: settings.description,
        currency: settings.currency,
        timezone: settings.timezone,
        city: settings.city,
        country: settings.country,
        phone: settings.phone,
        email: settings.email
      };
    } catch (error) {
      console.error('[HotelService] Error getting hotel info:', error);
      return this._getDefaultHotelInfo();
    }
  }

  /**
   * Get operational settings (check-in/out times, tax rates, etc.)
   * @returns {Promise<Object>} Operational settings
   */
  async getOperationalSettings() {
    try {
      const settings = await this.getCurrentHotelSettings();
      return {
        checkInTime: settings.check_in_time,
        checkOutTime: settings.check_out_time,
        taxRate: settings.tax_rate,
        taxCalculationMode: settings.tax_calculation_mode,
        displayTaxBreakdown: settings.display_tax_breakdown,
        lateCheckoutFee: settings.late_checkout_fee,
        cancellationHours: settings.cancellation_hours,
        currency: settings.currency,
        timezone: settings.timezone
      };
    } catch (error) {
      console.error('[HotelService] Error getting operational settings:', error);
      return this._getDefaultOperationalSettings();
    }
  }

  /**
   * Clear cached settings (useful when hotel context changes)
   */
  clearCache() {
    this.cachedSettings = null;
    this.cacheTimestamp = null;
    console.log('[HotelService] Cache cleared');
  }

  /**
   * Refresh hotel settings from API
   * @returns {Promise<Object>} Refreshed hotel settings
   */
  async refreshSettings() {
    return this.getCurrentHotelSettings(true);
  }

  /**
   * Check if cached data is still valid
   * @returns {boolean} True if cache is valid, false if expired
   * @private
   */
  _isCacheValid() {
    if (!this.cacheTimestamp) {
      return false;
    }
    
    const now = Date.now();
    const isValid = (now - this.cacheTimestamp) < this.cacheExpiry;
    
    if (!isValid) {
      console.log('[HotelService] Cache expired, will fetch fresh data');
    }
    
    return isValid;
  }

  /**
   * Get default hotel settings as fallback
   * @returns {Object} Default settings object
   * @private
   */
  _getDefaultSettings() {
    console.warn('[HotelService] Using default hotel settings');
    return {
      id: 1,
      name: 'Default Hotel',
      code: 'DEFAULT',
      description: 'Default hotel configuration',
      currency: 'USD',
      timezone: 'UTC',
      tax_rate: '0.00',
      tax_calculation_mode: 'inclusive',
      display_tax_breakdown: true,
      check_in_time: '15:00',
      check_out_time: '11:00',
      late_checkout_fee: '0.00',
      cancellation_hours: 24,
      city: 'Unknown',
      country: 'Unknown',
      phone: '',
      email: '',
      is_active: true,
      is_accepting_reservations: true
    };
  }

  /**
   * Get default hotel info as fallback
   * @returns {Object} Default hotel info
   * @private
   */
  _getDefaultHotelInfo() {
    return {
      id: 1,
      name: 'Default Hotel',
      code: 'DEFAULT',
      description: 'Default hotel configuration',
      currency: 'USD',
      timezone: 'UTC',
      city: 'Unknown',
      country: 'Unknown',
      phone: '',
      email: ''
    };
  }

  /**
   * Get default operational settings as fallback
   * @returns {Object} Default operational settings
   * @private
   */
  _getDefaultOperationalSettings() {
    return {
      checkInTime: '15:00',
      checkOutTime: '11:00',
      taxRate: '0.00',
      taxCalculationMode: 'inclusive',
      displayTaxBreakdown: true,
      lateCheckoutFee: '0.00',
      cancellationHours: 24,
      currency: 'USD',
      timezone: 'UTC'
    };
  }

  /**
   * Get cache status for debugging
   * @returns {Object} Cache status information
   */
  getCacheStatus() {
    return {
      cached: !!this.cachedSettings,
      timestamp: this.cacheTimestamp,
      valid: this._isCacheValid(),
      expiresIn: this.cacheTimestamp 
        ? Math.max(0, this.cacheExpiry - (Date.now() - this.cacheTimestamp))
        : 0
    };
  }

  /**
   * Update hotel settings (admin function)
   * @param {Object} settingsData - Settings data to update
   * @returns {Promise<Object>} Updated settings
   */
  async updateHotelSettings(settingsData) {
    try {
      console.log('[HotelService] Updating hotel settings:', settingsData);
      
      const response = await ApiClient.patch(`${this.baseURL}/my-hotel/`, settingsData);
      
      // Clear cache to force refresh on next access
      this.clearCache();
      
      console.log('[HotelService] Hotel settings updated successfully');
      return response.data;
    } catch (error) {
      console.error('[HotelService] Error updating hotel settings:', error);
      
      // Format error message for user display
      if (error.response?.data) {
        const errorDetails = Object.entries(error.response.data)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('\n');
        throw new Error(`Settings update failed:\n${errorDetails}`);
      }
      
      throw new Error('Failed to update hotel settings. Please try again.');
    }
  }
}

// Create and export a singleton instance
const hotelService = new HotelService();
export default hotelService;