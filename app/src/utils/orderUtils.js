/**
 * Order Utility Functions
 * Payment validation and status checking utilities
 */

/**
 * Check if an order has any completed payments
 * @param {Object} order - Order object
 * @returns {boolean} True if order has completed payments
 */
export const hasCompletedPayments = (order) => {
  if (!order?.payments || !Array.isArray(order.payments)) {
    return false;
  }
  
  return order.payments.some(payment => 
    payment.status === 'completed' && parseFloat(payment.amount || 0) > 0
  );
};

/**
 * Calculate total paid amount from completed payments
 * @param {Object} order - Order object
 * @returns {number} Total paid amount
 */
export const calculatePaidAmount = (order) => {
  if (!order?.payments || !Array.isArray(order.payments)) {
    return 0;
  }
  
  return order.payments
    .filter(payment => {
      // Accept payment if status is completed, or if no status field exists (backward compatibility)
      // Also check for lowercase/uppercase variations
      const status = payment.status?.toLowerCase();
      return !payment.status || status === 'completed' || status === 'success' || status === 'paid';
    })
    .reduce((total, payment) => total + parseFloat(payment.amount || 0), 0);
};

/**
 * Check if an order is fully paid
 * @param {Object} order - Order object
 * @returns {boolean} True if order is fully paid
 */
export const isOrderFullyPaid = (order) => {
  if (!order?.total_amount) {
    return false;
  }
  
  const totalAmount = parseFloat(order.total_amount || 0);
  const paidAmount = calculatePaidAmount(order);
  
  // Consider fully paid if paid amount equals or exceeds total (accounting for floating point precision)
  // Use a small epsilon for floating point comparison
  return paidAmount >= (totalAmount - 0.01);
};

/**
 * Get payment status of an order
 * @param {Object} order - Order object
 * @returns {string} Payment status: 'unpaid', 'partial', 'paid'
 */
export const getPaymentStatus = (order) => {
  const paidAmount = calculatePaidAmount(order);
  
  if (paidAmount === 0) {
    return 'unpaid';
  }
  
  if (isOrderFullyPaid(order)) {
    return 'paid';
  }
  
  return 'partial';
};

/**
 * Check if an order can accept new payments
 * @param {Object} order - Order object
 * @returns {boolean} True if order can accept payments
 */
export const canAcceptPayment = (order) => {
  if (!order) {
    return false;
  }
  
  // Cannot accept payment if order is cancelled or refunded
  if (['cancelled', 'refunded'].includes(order.status?.toLowerCase())) {
    return false;
  }
  
  // Cannot accept payment if already fully paid
  if (isOrderFullyPaid(order)) {
    return false;
  }
  
  // Allow payment at any order status (except cancelled/refunded)
  // This enables prepayment, payment during preparation, etc.
  return true;
};

/**
 * Get remaining amount to be paid
 * @param {Object} order - Order object
 * @returns {number} Remaining amount to be paid
 */
export const getRemainingAmount = (order) => {
  if (!order?.total_amount) {
    return 0;
  }
  
  const totalAmount = parseFloat(order.total_amount || 0);
  const paidAmount = calculatePaidAmount(order);
  
  const remaining = totalAmount - paidAmount;
  
  // If remaining is less than 0.01, consider it fully paid
  if (remaining < 0.01) {
    return 0;
  }
  
  return Math.max(0, remaining);
};

/**
 * Get payment status color scheme for UI
 * @param {Object} order - Order object
 * @returns {string} Color scheme for Chakra UI
 */
export const getPaymentStatusColor = (order) => {
  const status = getPaymentStatus(order);
  
  switch (status) {
    case 'paid':
      return 'green';
    case 'partial':
      return 'yellow';
    case 'unpaid':
    default:
      return 'red';
  }
};

/**
 * Get payment status display text
 * @param {Object} order - Order object
 * @returns {string} Display text for payment status
 */
export const getPaymentStatusText = (order) => {
  const status = getPaymentStatus(order);
  
  switch (status) {
    case 'paid':
      return 'PAID';
    case 'partial':
      return 'PARTIAL';
    case 'unpaid':
    default:
      return 'UNPAID';
  }
};