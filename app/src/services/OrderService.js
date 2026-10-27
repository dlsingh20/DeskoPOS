import ApiClient from './ApiClient';

/**
 * Order Service - Handle order-related API calls
 * Manages order creation, updates, payments, and kitchen operations
 */
class OrderService {
  constructor() {
    this.baseURL = '/api/pos/api';
    this.activeRequests = new Map(); // Track active requests for cancellation
    this.requestTimers = new Map(); // Track debounce timers
  }

  /**
   * Cancel a pending request by key
   * @private
   * @param {string} requestKey - Request identifier
   */
  _cancelRequest(requestKey) {
    const controller = this.activeRequests.get(requestKey);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestKey);
    }
    
    const timer = this.requestTimers.get(requestKey);
    if (timer) {
      clearTimeout(timer);
      this.requestTimers.delete(requestKey);
    }
  }

  /**
   * Create AbortController for request cancellation
   * @private
   * @param {string} requestKey - Request identifier
   * @returns {AbortController} Controller for the request
   */
  _createRequestController(requestKey) {
    // Cancel any existing request with this key
    this._cancelRequest(requestKey);
    
    const controller = new AbortController();
    this.activeRequests.set(requestKey, controller);
    return controller;
  }

  /**
   * Get all orders (tested endpoint)
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} List of orders
   */
  async getOrders(filters = {}) {
    const requestKey = `getOrders-${JSON.stringify(filters)}`;
    
    try {
      const controller = this._createRequestController(requestKey);
      
      const params = new URLSearchParams();
      
      // Add filter parameters
      if (filters.restaurant_id) params.append('restaurant_id', filters.restaurant_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.table_id) params.append('table_id', filters.table_id);
      
      const url = `${this.baseURL}/orders/?${params.toString()}`;
      const response = await ApiClient.get(url, { signal: controller.signal });
      
      this.activeRequests.delete(requestKey);
      return response.data.results || response.data;
    } catch (error) {
      this.activeRequests.delete(requestKey);
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED' || error.name === 'AbortError') {
        console.log('Order request was cancelled');
        throw new Error('Request cancelled');
      }
      console.error('Error fetching orders:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Debounced version of getOrders for auto-refresh scenarios
   * @param {Object} filters - Filter options
   * @param {number} delay - Debounce delay in milliseconds
   * @returns {Promise<Array>} List of orders
   */
  async getOrdersDebounced(filters = {}, delay = 300) {
    const requestKey = `getOrdersDebounced-${JSON.stringify(filters)}`;
    
    return new Promise((resolve, reject) => {
      // Cancel any existing timer for this request
      this._cancelRequest(requestKey);
      
      // Set up new debounced request
      const timer = setTimeout(async () => {
        try {
          const orders = await this.getOrders(filters);
          resolve(orders);
        } catch (error) {
          reject(error);
        } finally {
          this.requestTimers.delete(requestKey);
        }
      }, delay);
      
      this.requestTimers.set(requestKey, timer);
    });
  }

  /**
   * Get a specific order by ID
   * @param {number} orderId - Order ID
   * @returns {Promise<Object>} Order details
   */
  async getOrder(orderId) {
    try {
      const response = await ApiClient.get(`${this.baseURL}/orders/${orderId}/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Create a new order (tested endpoint)
   * @param {Object} orderData - Order data matching CreateOrderRequest interface
   * @returns {Promise<Object>} Created order
   */
  async createOrder(orderData) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/orders/`, orderData);
      return response.data;
    } catch (error) {
      console.error('Error creating order:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update an existing order
   * @param {number} orderId - Order ID
   * @param {Object} orderData - Updated order data
   * @returns {Promise<Object>} Updated order
   */
  async updateOrder(orderId, orderData) {
    try {
      const response = await ApiClient.put(`${this.baseURL}/orders/${orderId}/`, orderData);
      return response.data;
    } catch (error) {
      console.error('Error updating order:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Void (reduce or remove) an item already sent to the kitchen, keeping a record of who, why
   * and the approver. Runs `fallback` on backends without the endpoint.
   * @param {number} itemId - Order item ID
   * @param {Object} params - { quantity (to void), reason, approvalId, fallback }
   */
  async voidOrderItem(itemId, { quantity, reason, approvalId = null, fallback = null }) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/order-items/${itemId}/void/`, {
        quantity,
        reason,
        approval_id: approvalId,
      });
      return response.data;
    } catch (error) {
      if (fallback && [404, 405, 501].includes(error?.response?.status)) return fallback();
      console.error('Error voiding item:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Add a line to the order notes (audit lines such as approvals), keeping existing notes
   * @param {number} orderId - Order ID
   * @param {string} line - Text to append
   * @returns {Promise<Object>} Updated order
   */
  async appendOrderNote(orderId, line) {
    try {
      const current = await this.getOrder(orderId);
      const notes = [String(current.notes || '').trim(), `${line} | At: ${new Date().toISOString()}`].filter(Boolean).join('\n');
      const response = await ApiClient.patch(`${this.baseURL}/orders/${orderId}/`, { notes });
      return response.data;
    } catch (error) {
      console.error('Error adding order note:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Save the guest name and phone printed on the bill (empty clears them)
   * @param {number} orderId - Order ID
   * @param {Object} customer - { name, phone }
   * @returns {Promise<Object>} Updated order
   */
  async updateOrderCustomer(orderId, { name = '', phone = '' }) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/orders/${orderId}/`, {
        customer_name: name.trim(),
        customer_phone: phone.trim(),
      });
      return response.data;
    } catch (error) {
      console.error('Error saving guest details:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update order status
   * @param {number} orderId - Order ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated order
   */
  async updateOrderStatus(orderId, status) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/orders/${orderId}/update_status/`, { status });
      return response.data;
    } catch (error) {
      console.error('Error updating order status:', error);
      throw this._handleError(error);
    }
  }

  /**
   * DeskoPOS: put the order's unsent items on the next numbered KOT (a pending order is sent to
   * the kitchen too). Returns { kot_number, items } or null when no item was waiting.
   */
  async sendKot(orderId) {
    try {
      const response = await ApiClient.post(`${this.baseURL}/orders/${orderId}/send_kot/`, {});
      return response.data;
    } catch (error) {
      if (error?.response?.status === 409 && error.response.data?.code === 'nothing_to_send') return null;
      console.error('Error sending KOT:', error);
      throw this._handleError(error);
    }
  }

  /**
   * DeskoPOS: refund all or part of a settled bill (POST orders/{id}/refund/).
   * @param {Object} refund - { refunds: [{payment_id, amount, method?, reference?}], reason, note,
   *   approvalId, cashRegisterId, idempotencyKey }
   * @returns {Promise<Object>} { status, refunded_total, refund: { credit_note_number, ... }, payments }
   */
  async refundOrder(orderId, { refunds, reason, note = '', approvalId = null, cashRegisterId = null, idempotencyKey }) {
    const response = await ApiClient.post(`${this.baseURL}/orders/${orderId}/refund/`, {
      refunds,
      reason,
      note,
      approval_id: approvalId,
      cash_register: cashRegisterId,
      idempotency_key: idempotencyKey,
    });
    return response.data;
  }

  /**
   * Cancel an order
   * @param {number} orderId - Order ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} Updated order
   */
  async cancelOrder(orderId, reason = '', { approvalId = null, auditLine = '' } = {}) {
    // Backends with POST /orders/{id}/cancel/ store the reason, who cancelled and the approver
    try {
      const response = await ApiClient.post(`${this.baseURL}/orders/${orderId}/cancel/`, { reason, approval_id: approvalId });
      return response.data;
    } catch (error) {
      if (![404, 405, 501].includes(error?.response?.status)) {
        console.error('Error cancelling order:', error);
        throw this._handleError(error);
      }
    }
    // Older backends: change the status and keep the reason in the order notes
    try {
      const response = await ApiClient.patch(`${this.baseURL}/orders/${orderId}/update_status/`, {
        status: 'cancelled'
      });
      if (reason || auditLine) {
        await this.appendOrderNote(orderId, auditLine || `[Cancel] ${reason}`).catch(() => {});
      }
      return response.data;
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get kitchen statistics (tested endpoint)
   * @returns {Promise<Object>} Kitchen statistics
   */
  async getKitchenStats() {
    try {
      const response = await ApiClient.get(`${this.baseURL}/orders/kitchen_stats/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching kitchen stats:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get orders for kitchen display
   * @param {string} status - Order status filter (optional)
   * @returns {Promise<Array>} Orders for kitchen
   */
  async getKitchenOrders(status = null) {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      
      const url = `${this.baseURL}/orders/kitchen/?${params.toString()}`;
      const response = await ApiClient.get(url);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching kitchen orders:', error);
      // Fallback to regular orders with appropriate statuses
      const statuses = status ? [status] : ['confirmed', 'preparing', 'ready'];
      const allOrders = await this.getOrders();
      return allOrders.filter(order => statuses.includes(order.status));
    }
  }

  /**
   * Get active orders for a restaurant
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Active orders
   */
  async getActiveOrders(restaurantId) {
    try {
      const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready'];
      const orders = await this.getOrders({ restaurant_id: restaurantId });
      return orders.filter(order => activeStatuses.includes(order.status));
    } catch (error) {
      console.error('Error fetching active orders:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get every open order for a restaurant, across all pages.
   * Queries each active status separately so closed orders are never downloaded.
   * @param {number} restaurantId - Restaurant ID
   * @param {Array<string>} statuses - Statuses that count as open
   * @returns {Promise<Array>} Open orders, de-duplicated
   */
  async getOpenOrders(restaurantId, statuses = ['pending', 'confirmed', 'preparing', 'ready', 'served']) {
    const MAX_PAGES = 10;

    const fetchStatus = async (status) => {
      const collected = [];
      let url = `${this.baseURL}/orders/?${new URLSearchParams({
        restaurant_id: restaurantId,
        status,
        page_size: 100,
      }).toString()}`;

      for (let page = 0; url && page < MAX_PAGES; page += 1) {
        const response = await ApiClient.get(url);
        const data = response.data;
        collected.push(...(data.results || data));
        // Keep only path + query so the request goes through ApiClient's base URL
        url = !Array.isArray(data) && data.next
          ? (() => { const next = new URL(data.next, window.location.origin); return `${next.pathname}${next.search}`; })()
          : null;
      }
      return collected;
    };

    try {
      const results = await Promise.all(statuses.map(fetchStatus));
      const unique = new Map();
      results.flat().forEach((order) => {
        // Server-side filters are re-checked here in case they are ignored
        if (!statuses.includes(order.status)) return;
        if (order.restaurant !== undefined && String(order.restaurant) !== String(restaurantId)) return;
        unique.set(order.id, order);
      });
      return Array.from(unique.values());
    } catch (error) {
      console.error('Error fetching open orders:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get orders for a specific table
   * @param {number} tableId - Table ID
   * @param {boolean} activeOnly - Only return active orders
   * @returns {Promise<Array>} Table orders
   */
  async getTableOrders(tableId, activeOnly = true) {
    try {
      const orders = await this.getOrders({ table_id: tableId });
      
      if (activeOnly) {
        const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served'];
        return orders.filter(order => activeStatuses.includes(order.status));
      }
      
      return orders;
    } catch (error) {
      console.error('Error fetching table orders:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Add items to an existing order
   * @param {number} orderId - Order ID
   * @param {Array} items - Array of order items
   * @returns {Promise<Object>} Updated order
   */
  async addItemsToOrder(orderId, items) {
    try {
      // Create each item individually using the order-items endpoint
      const promises = items.map(item => 
        ApiClient.post(`${this.baseURL}/order-items/`, {
          order: orderId,
          menu_item: item.menu_item_id,
          quantity: item.quantity,
          special_instructions: item.special_instructions || '',
          unit_price: item.unit_price || item.price
        })
      );
      
      const responses = await Promise.all(promises);
      return responses.map(response => response.data);
    } catch (error) {
      console.error('Error adding items to order:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Remove item from order
   * @param {number} orderId - Order ID
   * @param {number} itemId - Order item ID
   * @returns {Promise<Object>} Updated order
   */
  async removeItemFromOrder(orderId, itemId) {
    try {
      const response = await ApiClient.delete(`${this.baseURL}/order-items/${itemId}/`);
      return response.data;
    } catch (error) {
      console.error('Error removing item from order:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update order item quantity
   * @param {number} orderId - Order ID
   * @param {number} itemId - Order item ID
   * @param {number} quantity - New quantity
   * @returns {Promise<Object>} Updated order item
   */
  async updateOrderItemQuantity(orderId, itemId, quantity) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/order-items/${itemId}/`, {
        quantity
      });
      return response.data;
    } catch (error) {
      console.error('Error updating order item quantity:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Update order item status
   * @param {number} orderId - Order ID
   * @param {number} itemId - Order item ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated order item
   */
  async updateOrderItemStatus(orderId, itemId, status) {
    try {
      const response = await ApiClient.patch(`${this.baseURL}/order-items/${itemId}/`, {
        status
      });
      return response.data;
    } catch (error) {
      console.error('Error updating order item status:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Process payment for an order
   * @param {number} orderId - Order ID
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Payment result
   */
  async processPayment(orderId, paymentData) {
    try {
      // Use the order-payments endpoint and include order field in the payload
      const paymentPayload = {
        ...paymentData,
        order: orderId  // Backend expects 'order' field, not 'order_id'
      };
      // Remove order_id if it exists since backend expects 'order'
      delete paymentPayload.order_id;
      
      const response = await ApiClient.post(`${this.baseURL}/order-payments/`, paymentPayload);
      return response.data;
    } catch (error) {
      console.error('Error processing payment:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Process flexible payment for order at any stage
   * @param {number} orderId - Order ID
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Payment result
   */
  async processFlexiblePayment(orderId, paymentData) {
    try {
      const paymentPayload = {
        order_id: orderId,
        method: paymentData.method,
        amount: paymentData.amount,
        transaction_id: paymentData.transaction_id || '',
        notes: paymentData.notes || ''
      };
      
      const response = await ApiClient.post(`${this.baseURL}/order-payments/create_flexible_payment/`, paymentPayload);
      return response.data;
    } catch (error) {
      console.error('Error processing flexible payment:', error);
      throw this._handleError(error);
    }
  }

  /**
   * Get payment methods
   * @returns {Array} Available payment methods
   */
  getPaymentMethods() {
    return [
      { value: 'cash', label: 'Cash', icon: '💵' },
      { value: 'card', label: 'Credit/Debit Card', icon: '💳' },
      { value: 'room_charge', label: 'Room Charge', icon: '🏨' },
      { value: 'digital_wallet', label: 'Digital Wallet', icon: '📱' },
      { value: 'upi', label: 'UPI', icon: '💰' }
    ];
  }

  /**
   * Get order statuses for UI
   * @returns {Array} Available order statuses
   */
  getOrderStatuses() {
    return [
      { value: 'pending', label: 'Pending', color: 'yellow' },
      { value: 'confirmed', label: 'Confirmed', color: 'blue' },
      { value: 'preparing', label: 'Preparing', color: 'orange' },
      { value: 'ready', label: 'Ready', color: 'green' },
      { value: 'served', label: 'Served', color: 'purple' },
      { value: 'completed', label: 'Completed', color: 'gray' },
      { value: 'cancelled', label: 'Cancelled', color: 'red' }
    ];
  }

  /**
   * Get order types for UI
   * @returns {Array} Available order types
   */
  getOrderTypes() {
    return [
      { value: 'dine_in', label: 'Dine In', icon: '🍽️' },
      { value: 'takeaway', label: 'Takeaway', icon: '🥡' },
      { value: 'delivery', label: 'Delivery', icon: '🚚' },
      { value: 'room_service', label: 'Room Service', icon: '🏨' }
    ];
  }

  /**
   * Calculate order totals
   * @param {Array} items - Order items
   * @param {Object} options - Calculation options
   * @returns {Object} Order totals
   */
  calculateOrderTotals(items, options = {}) {
    const {
      taxRate = 0,
      serviceChargeRate = 0,
      discountAmount = 0
    } = options;

    const subtotal = items.reduce((sum, item) => {
      const itemTotal = parseFloat(item.unit_price || item.menuItem?.price || 0) * (item.quantity || 1);
      return sum + itemTotal;
    }, 0);

    const discountedSubtotal = Math.max(0, subtotal - parseFloat(discountAmount));
    const serviceCharge = discountedSubtotal * serviceChargeRate;
    const taxableAmount = discountedSubtotal + serviceCharge;
    const taxAmount = taxableAmount * taxRate;
    const total = taxableAmount + taxAmount;

    return {
      subtotal: subtotal.toFixed(2),
      discountAmount: parseFloat(discountAmount).toFixed(2),
      discountedSubtotal: discountedSubtotal.toFixed(2),
      serviceCharge: serviceCharge.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2)
    };
  }

  /**
   * Estimate order ready time
   * @param {Array} items - Order items
   * @param {Object} options - Options
   * @returns {Date} Estimated ready time
   */
  estimateReadyTime(items, options = {}) {
    const { baseTime = 5, kitchenLoad = 1 } = options;
    
    const maxPrepTime = Math.max(...items.map(item => 
      item.menuItem?.preparation_time_minutes || item.preparation_time_minutes || 15
    ));
    
    const totalPrepTime = maxPrepTime + baseTime + (kitchenLoad * 2);
    
    const readyTime = new Date();
    readyTime.setMinutes(readyTime.getMinutes() + totalPrepTime);
    
    return readyTime;
  }

  /**
   * Generate order number
   * @param {string} restaurantCode - Restaurant code
   * @returns {string} Generated order number
   */
  generateOrderNumber(restaurantCode = 'POS') {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const randomStr = Math.random().toString(36).substr(2, 3).toUpperCase();
    
    return `${restaurantCode}-${dateStr}-${timeStr}-${randomStr}`;
  }

  /**
   * Cancel all active requests and timers
   */
  cancelAllRequests() {
    for (const [, controller] of this.activeRequests) {
      controller.abort();
    }
    this.activeRequests.clear();
    
    for (const [, timer] of this.requestTimers) {
      clearTimeout(timer);
    }
    this.requestTimers.clear();
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

const orderService = new OrderService();
export default orderService;