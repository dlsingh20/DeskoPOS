import ApiClient from './ApiClient';

/**
 * Service for handling POS reports and analytics
 */
class ReportService {
  constructor() {
    this.apiClient = ApiClient;
    this.baseURL = '/api/pos/api';
  }

  /**
   * Get sales report for a date range
   */
  async getSalesReport(startDate, endDate, filters = {}) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      ...filters
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/sales?${params}`);
  }

  /**
   * Get payment summary for orders
   */
  async getPaymentSummary(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/order-payments/payment_summary/?${params}`);
  }

  /**
   * Get kitchen performance statistics
   */
  async getKitchenStats() {
    return this.apiClient.get(`${this.baseURL}/orders/kitchen_stats/`);
  }

  /**
   * Get preparation time analytics
   */
  async getPreparationTimes() {
    return this.apiClient.get(`${this.baseURL}/orders/preparation_times/`);
  }

  /**
   * Get overdue orders report
   */
  async getOverdueOrders() {
    return this.apiClient.get(`${this.baseURL}/orders/overdue_orders/`);
  }

  /**
   * Get outstanding orders aging report
   */
  async getAgingReport() {
    return this.apiClient.get(`${this.baseURL}/outstanding-orders/aging_report/`);
  }

  /**
   * Get revenue breakdown by category
   */
  async getRevenueByCategory(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/revenue_by_category?${params}`);
  }

  /**
   * Get hourly sales distribution
   */
  async getHourlySales(date) {
    const params = new URLSearchParams({
      date: date
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/hourly_sales?${params}`);
  }

  /**
   * Get staff performance metrics
   */
  async getStaffPerformance(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/staff_performance?${params}`);
  }

  /**
   * Get top selling items
   */
  async getTopSellingItems(startDate, endDate, limit = 10) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      limit: limit
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/top_items?${params}`);
  }

  /**
   * Get customer insights
   */
  async getCustomerInsights(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/customer_insights?${params}`);
  }

  /**
   * Get comparison report between two periods
   */
  async getComparisonReport(period1Start, period1End, period2Start, period2End) {
    const params = new URLSearchParams({
      period1_start: period1Start,
      period1_end: period1End,
      period2_start: period2Start,
      period2_end: period2End
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/comparison?${params}`);
  }

  /**
   * Export report to specified format
   */
  async exportReport(reportType, format, startDate, endDate, filters = {}) {
    const params = new URLSearchParams({
      report_type: reportType,
      format: format,
      start_date: startDate,
      end_date: endDate,
      ...filters
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/export?${params}`, {
      responseType: format === 'pdf' ? 'blob' : 'json'
    });
  }

  /**
   * Get dashboard summary
   */
  async getDashboardSummary() {
    return this.apiClient.get(`${this.baseURL}/reports/dashboard_summary/`);
  }

  /**
   * Get order type distribution
   */
  async getOrderTypeDistribution(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/order_types?${params}`);
  }

  /**
   * Get payment method distribution
   */
  async getPaymentMethodDistribution(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/payment_methods?${params}`);
  }

  /**
   * Get void and cancellation report
   */
  async getVoidReport(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/voids_cancellations?${params}`);
  }

  /**
   * Get discount analysis
   */
  async getDiscountAnalysis(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/discounts?${params}`);
  }

  /**
   * Get table turnover analytics
   */
  async getTableTurnover(date) {
    const params = new URLSearchParams({
      date: date
    });
    
    return this.apiClient.get(`${this.baseURL}/reports/table_turnover?${params}`);
  }
}

export default new ReportService();