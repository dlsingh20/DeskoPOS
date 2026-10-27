import ApiClient from './ApiClient';

const BASE = '/api/pos/api';

const InventoryService = {
  // Ingredients
  getIngredients(params = {}) {
    return ApiClient.get(`${BASE}/ingredients/`, { params });
  },
  getIngredient(id) {
    return ApiClient.get(`${BASE}/ingredients/${id}/`);
  },
  createIngredient(data) {
    return ApiClient.post(`${BASE}/ingredients/`, data);
  },
  updateIngredient(id, data) {
    return ApiClient.put(`${BASE}/ingredients/${id}/`, data);
  },
  deleteIngredient(id) {
    return ApiClient.delete(`${BASE}/ingredients/${id}/`);
  },
  getIngredientsByCategory() {
    return ApiClient.get(`${BASE}/ingredients/by_category/`);
  },
  getLowStockIngredients(restaurantId) {
    const params = restaurantId ? { restaurant_id: restaurantId } : {};
    return ApiClient.get(`${BASE}/ingredients/low_stock/`, { params });
  },

  // Recipes
  getRecipes(params = {}) {
    return ApiClient.get(`${BASE}/recipes/`, { params });
  },
  getRecipe(id) {
    return ApiClient.get(`${BASE}/recipes/${id}/`);
  },
  getRecipeByMenuItem(menuItemId) {
    return ApiClient.get(`${BASE}/recipes/by_menu_item/`, { params: { menu_item_id: menuItemId } });
  },
  createRecipe(data) {
    return ApiClient.post(`${BASE}/recipes/`, data);
  },
  updateRecipe(id, data) {
    return ApiClient.put(`${BASE}/recipes/${id}/`, data);
  },
  deleteRecipe(id) {
    return ApiClient.delete(`${BASE}/recipes/${id}/`);
  },
  getRecipeFoodCost(id) {
    return ApiClient.get(`${BASE}/recipes/${id}/food_cost/`);
  },

  // Stock Levels
  getStockLevels(params = {}) {
    return ApiClient.get(`${BASE}/stock-levels/`, { params });
  },
  getStockByRestaurant(restaurantId) {
    return ApiClient.get(`${BASE}/stock-levels/by_restaurant/`, { params: { restaurant_id: restaurantId } });
  },
  adjustStock(data) {
    return ApiClient.post(`${BASE}/stock-levels/adjust/`, data);
  },
  transferStock(data) {
    return ApiClient.post(`${BASE}/stock-levels/transfer/`, data);
  },
  recordWaste(data) {
    return ApiClient.post(`${BASE}/stock-levels/record_waste/`, data);
  },
  bulkCount(items) {
    return ApiClient.post(`${BASE}/stock-levels/count/`, { items });
  },

  // Stock Movements
  getStockMovements(params = {}) {
    return ApiClient.get(`${BASE}/stock-movements/`, { params });
  },

  // Reports
  getDashboardStats(restaurantId) {
    const params = restaurantId ? { restaurant_id: restaurantId } : {};
    return ApiClient.get(`${BASE}/inventory-reports/dashboard_stats/`, { params });
  },
  getFoodCostReport(restaurantId) {
    const params = restaurantId ? { restaurant_id: restaurantId } : {};
    return ApiClient.get(`${BASE}/inventory-reports/food_cost_report/`, { params });
  },
  getUsageReport(restaurantId, days = 30) {
    const params = { days };
    if (restaurantId) params.restaurant_id = restaurantId;
    return ApiClient.get(`${BASE}/inventory-reports/usage_report/`, { params });
  },
  getWasteReport(restaurantId, days = 30) {
    const params = { days };
    if (restaurantId) params.restaurant_id = restaurantId;
    return ApiClient.get(`${BASE}/inventory-reports/waste_report/`, { params });
  },
  getPurchaseSuggestions() {
    return ApiClient.get(`${BASE}/inventory-reports/purchase_suggestions/`);
  },
  getLowStockCount(restaurantId) {
    const params = restaurantId ? { restaurant_id: restaurantId } : {};
    return ApiClient.get(`${BASE}/inventory-reports/low_stock_count/`, { params });
  },
};

export default InventoryService;
