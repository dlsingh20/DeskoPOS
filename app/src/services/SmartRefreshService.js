/**
 * SmartRefreshService - Manages intelligent API refresh intervals
 * Optimizes refresh frequency based on user activity and endpoint priority
 */

class SmartRefreshService {
  constructor() {
    this.strategies = new Map();
    this.lastRefreshTimes = new Map();
    this.etags = new Map();
  }

  /**
   * Set refresh strategy for an endpoint
   * @param {string} endpoint - API endpoint path
   * @param {Object} strategy - Refresh strategy configuration
   */
  setRefreshStrategy(endpoint, strategy) {
    this.strategies.set(endpoint, {
      minInterval: strategy.minInterval || 5000,
      maxInterval: strategy.maxInterval || 60000,
      exponentialBackoff: strategy.exponentialBackoff ?? true,
      activityBasedRefresh: strategy.activityBasedRefresh ?? true,
      conditionalRequests: strategy.conditionalRequests ?? true,
      priority: strategy.priority || 'normal',
      currentInterval: strategy.minInterval || 5000,
      consecutiveNoChanges: 0
    });
  }

  /**
   * Get the strategy for an endpoint
   * @param {string} endpoint - API endpoint path
   */
  getStrategy(endpoint) {
    return this.strategies.get(endpoint) || {
      minInterval: 10000,
      maxInterval: 60000,
      exponentialBackoff: true,
      activityBasedRefresh: true,
      conditionalRequests: true,
      priority: 'normal',
      currentInterval: 10000,
      consecutiveNoChanges: 0
    };
  }

  /**
   * Calculate next refresh interval based on strategy and conditions
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Request parameters
   */
  getNextRefreshInterval(endpoint, params = {}) {
    const strategy = this.getStrategy(endpoint);
    const key = this.getEndpointKey(endpoint, params);

    let interval = strategy.currentInterval;

    // Apply priority multiplier
    if (strategy.priority === 'high') {
      interval = Math.max(strategy.minInterval, interval * 0.5);
    } else if (strategy.priority === 'low') {
      interval = Math.min(strategy.maxInterval, interval * 1.5);
    }

    return Math.min(Math.max(interval, strategy.minInterval), strategy.maxInterval);
  }

  /**
   * Check if we should refresh based on strategy
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Request parameters
   * @param {boolean} isActive - Whether user is active
   * @param {boolean} isVisible - Whether page is visible
   */
  shouldRefresh(endpoint, params = {}, isActive = true, isVisible = true) {
    const strategy = this.getStrategy(endpoint);
    const key = this.getEndpointKey(endpoint, params);
    const lastRefresh = this.lastRefreshTimes.get(key) || 0;
    const timeSinceLastRefresh = Date.now() - lastRefresh;

    // Always allow first refresh
    if (lastRefresh === 0) {
      return true;
    }

    // If page not visible, use max interval
    if (!isVisible) {
      return timeSinceLastRefresh >= strategy.maxInterval;
    }

    // If user inactive and activity-based refresh enabled, extend interval
    if (!isActive && strategy.activityBasedRefresh) {
      const inactiveInterval = Math.min(strategy.currentInterval * 2, strategy.maxInterval);
      return timeSinceLastRefresh >= inactiveInterval;
    }

    // Normal refresh check
    return timeSinceLastRefresh >= strategy.currentInterval;
  }

  /**
   * Record that a refresh was performed
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Request parameters
   * @param {boolean} hadChanges - Whether the refresh detected changes
   */
  recordRefresh(endpoint, params = {}, hadChanges = true) {
    const key = this.getEndpointKey(endpoint, params);
    const strategy = this.getStrategy(endpoint);

    this.lastRefreshTimes.set(key, Date.now());

    if (strategy.exponentialBackoff) {
      if (hadChanges) {
        // Reset to min interval on changes
        strategy.currentInterval = strategy.minInterval;
        strategy.consecutiveNoChanges = 0;
      } else {
        // Increase interval on no changes
        strategy.consecutiveNoChanges++;
        strategy.currentInterval = Math.min(
          strategy.currentInterval * 1.5,
          strategy.maxInterval
        );
      }
      this.strategies.set(endpoint, strategy);
    }
  }

  /**
   * Store ETag for conditional requests
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Request parameters
   * @param {string} etag - ETag value
   */
  setEtag(endpoint, params = {}, etag) {
    const key = this.getEndpointKey(endpoint, params);
    this.etags.set(key, etag);
  }

  /**
   * Get stored ETag for conditional requests
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Request parameters
   */
  getEtag(endpoint, params = {}) {
    const key = this.getEndpointKey(endpoint, params);
    return this.etags.get(key);
  }

  /**
   * Generate unique key for endpoint + params combination
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Request parameters
   */
  getEndpointKey(endpoint, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&');
    return `${endpoint}?${sortedParams}`;
  }

  /**
   * Reset all tracking data
   */
  reset() {
    this.lastRefreshTimes.clear();
    this.etags.clear();
    this.strategies.forEach((strategy, key) => {
      strategy.currentInterval = strategy.minInterval;
      strategy.consecutiveNoChanges = 0;
    });
  }
}

// Export singleton instance
export default new SmartRefreshService();
