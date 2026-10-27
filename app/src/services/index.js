// POS Frontend Services
// Central export file for all service modules

export { default as ApiClient } from './ApiClient';
export { default as RestaurantService } from './RestaurantService';
export { default as TableService } from './TableService';
export { default as MenuService } from './MenuService';
export { default as OrderService } from './OrderService';
export { default as HotelService } from './HotelService';
export { default as CurrencyService } from './CurrencyService';
export { default as ReportService } from './ReportService';
export { default as PrintService } from './PrintService';
export { default as InventoryService } from './InventoryService';

// Re-export for convenience
export const Services = {
  ApiClient: require('./ApiClient').default,
  RestaurantService: require('./RestaurantService').default,
  TableService: require('./TableService').default,
  MenuService: require('./MenuService').default,
  OrderService: require('./OrderService').default,
  HotelService: require('./HotelService').default,
  CurrencyService: require('./CurrencyService').default,
  ReportService: require('./ReportService').default,
  PrintService: require('./PrintService').default,
  InventoryService: require('./InventoryService').default,
};
