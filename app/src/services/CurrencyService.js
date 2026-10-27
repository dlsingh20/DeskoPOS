/**
 * Currency Service for POS System
 * 
 * Provides currency formatting and symbol management for different hotel currencies.
 * Integrates with hotel settings to use the appropriate currency for each hotel.
 */

class CurrencyService {
  /**
   * Currency configuration mapping
   * Maps currency codes to their display properties
   */
  static currencyConfig = {
    'USD': {
      symbol: '$',
      locale: 'en-US',
      position: 'before', // symbol position: 'before' or 'after'
      decimals: 2,
      name: 'US Dollar'
    },
    'INR': {
      symbol: '₹',
      locale: 'en-IN',
      position: 'before',
      decimals: 2,
      name: 'Indian Rupee'
    },
    'EUR': {
      symbol: '€',
      locale: 'de-DE',
      position: 'before',
      decimals: 2,
      name: 'Euro'
    },
    'GBP': {
      symbol: '£',
      locale: 'en-GB',
      position: 'before',
      decimals: 2,
      name: 'British Pound'
    },
    'CAD': {
      symbol: 'C$',
      locale: 'en-CA',
      position: 'before',
      decimals: 2,
      name: 'Canadian Dollar'
    },
    'AUD': {
      symbol: 'A$',
      locale: 'en-AU',
      position: 'before',
      decimals: 2,
      name: 'Australian Dollar'
    },
    'JPY': {
      symbol: '¥',
      locale: 'ja-JP',
      position: 'before',
      decimals: 0,
      name: 'Japanese Yen'
    },
    'CNY': {
      symbol: '¥',
      locale: 'zh-CN',
      position: 'before',
      decimals: 2,
      name: 'Chinese Yuan'
    },
    'SGD': {
      symbol: 'S$',
      locale: 'en-SG',
      position: 'before',
      decimals: 2,
      name: 'Singapore Dollar'
    },
    'AED': {
      symbol: 'د.إ',
      locale: 'ar-AE',
      position: 'before',
      decimals: 2,
      name: 'UAE Dirham'
    },
    'SAR': {
      symbol: 'ر.س',
      locale: 'ar-SA',
      position: 'before',
      decimals: 2,
      name: 'Saudi Riyal'
    },
    'JOD': {
      symbol: 'JD',
      locale: 'en-JO',
      position: 'before',
      decimals: 2, // officially 3 (fils), but platform storage is 2dp
      name: 'Jordanian Dinar'
    },
    'IDR': {
      symbol: 'Rp',
      locale: 'id-ID',
      position: 'before',
      decimals: 0, // Rupiah is conventionally shown without decimals
      name: 'Indonesian Rupiah'
    },
    'MYR': {
      symbol: 'RM',
      locale: 'ms-MY',
      position: 'before',
      decimals: 2,
      name: 'Malaysian Ringgit'
    },
    'DOP': {
      symbol: 'RD$',
      locale: 'es-DO',
      position: 'before',
      decimals: 2,
      name: 'Dominican Peso'
    }
  };

  /**
   * Default currency to use when none is specified
   */
  static DEFAULT_CURRENCY = 'USD';

  /**
   * Get currency configuration for a given currency code
   * @param {string} currencyCode - The currency code (e.g., 'USD', 'INR')
   * @returns {Object} Currency configuration object
   */
  static getCurrencyConfig(currencyCode = this.DEFAULT_CURRENCY) {
    const currency = currencyCode?.toUpperCase();
    return this.currencyConfig[currency] || {
      ...this.currencyConfig[this.DEFAULT_CURRENCY],
      symbol: currency || '$',
      name: `${currency || 'Unknown'} Currency`
    };
  }

  /**
   * Get currency symbol for a given currency code
   * @param {string} currencyCode - The currency code
   * @returns {string} Currency symbol
   */
  static getSymbol(currencyCode) {
    return this.getCurrencyConfig(currencyCode).symbol;
  }

  /**
   * Format a price value with currency symbol
   * @param {number|string} price - The price value to format
   * @param {string} currencyCode - The currency code (defaults to USD)
   * @param {Object} options - Additional formatting options
   * @returns {string} Formatted price string
   */
  static format(price, currencyCode = this.DEFAULT_CURRENCY, options = {}) {
    const numPrice = parseFloat(price);
    
    // Handle invalid or zero prices
    if (isNaN(numPrice)) {
      const config = this.getCurrencyConfig(currencyCode);
      return `${config.symbol}0.${'0'.repeat(config.decimals)}`;
    }

    const config = this.getCurrencyConfig(currencyCode);
    const decimals = options.decimals !== undefined ? options.decimals : config.decimals;
    
    // Format the number with appropriate decimal places
    const formattedNumber = numPrice.toFixed(decimals);
    
    // Add currency symbol based on position
    if (config.position === 'after') {
      return `${formattedNumber}${config.symbol}`;
    } else {
      return `${config.symbol}${formattedNumber}`;
    }
  }

  /**
   * Format currency using Intl.NumberFormat for locale-aware formatting
   * @param {number|string} price - The price value to format
   * @param {string} currencyCode - The currency code
   * @param {Object} options - Additional Intl.NumberFormat options
   * @returns {string} Locale-formatted currency string
   */
  static formatLocalized(price, currencyCode = this.DEFAULT_CURRENCY, options = {}) {
    const numPrice = parseFloat(price);
    
    if (isNaN(numPrice)) {
      return this.format(0, currencyCode);
    }

    const config = this.getCurrencyConfig(currencyCode);
    
    try {
      const formatter = new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: currencyCode.toUpperCase(),
        minimumFractionDigits: options.minimumFractionDigits || config.decimals,
        maximumFractionDigits: options.maximumFractionDigits || config.decimals,
        ...options
      });
      
      return formatter.format(numPrice);
    } catch (error) {
      // Fallback to simple format if Intl.NumberFormat fails
      console.warn(`Currency formatting failed for ${currencyCode}:`, error);
      return this.format(price, currencyCode, options);
    }
  }

  /**
   * Parse a price string and extract the numeric value
   * @param {string} priceString - The formatted price string
   * @returns {number} Numeric price value
   */
  static parsePrice(priceString) {
    if (typeof priceString === 'number') {
      return priceString;
    }

    if (!priceString || typeof priceString !== 'string') {
      return 0;
    }

    // Remove currency symbols and non-numeric characters except decimal points
    const numericString = priceString.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(numericString);
    
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Check if a currency code is supported
   * @param {string} currencyCode - The currency code to check
   * @returns {boolean} True if supported, false otherwise
   */
  static isSupported(currencyCode) {
    return !!this.currencyConfig[currencyCode?.toUpperCase()];
  }

  /**
   * Get all supported currencies
   * @returns {Array} Array of currency objects with code, symbol, and name
   */
  static getSupportedCurrencies() {
    return Object.entries(this.currencyConfig).map(([code, config]) => ({
      code,
      symbol: config.symbol,
      name: config.name,
      locale: config.locale
    }));
  }

  /**
   * Format a price for display in components (main formatting function)
   * @param {number|string} price - The price value
   * @param {string} currencyCode - The currency code
   * @param {Object} options - Formatting options
   * @returns {string} Formatted price string
   */
  static formatPrice(price, currencyCode = this.DEFAULT_CURRENCY, options = {}) {
    // Use localized formatting by default for better international support
    if (options.useSimpleFormat) {
      return this.format(price, currencyCode, options);
    }
    
    return this.formatLocalized(price, currencyCode, options);
  }

  /**
   * Calculate total with proper decimal precision
   * @param {Array} items - Array of price values to sum
   * @returns {number} Total with proper precision
   */
  static calculateTotal(items) {
    const total = items.reduce((sum, price) => {
      const numPrice = typeof price === 'number' ? price : this.parsePrice(price);
      return sum + numPrice;
    }, 0);

    // Round to 2 decimal places to avoid floating point precision issues
    return Math.round(total * 100) / 100;
  }

  /**
   * Convert price from one currency to another (placeholder for future enhancement)
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number>} Converted amount (currently returns original amount)
   */
  static async convertCurrency(amount, fromCurrency, toCurrency) {
    // TODO: Implement currency conversion using exchange rate API
    // For now, return the original amount
    console.warn('Currency conversion not implemented yet');
    return amount;
  }
}

export default CurrencyService;