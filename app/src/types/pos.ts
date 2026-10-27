// POS System TypeScript Interfaces
// Based on actual API response structures from backend testing

export interface Restaurant {
  id: number;
  name: string;
  description: string;
  type: 'restaurant' | 'bar' | 'cafe' | 'room_service';
  location?: string;
  capacity?: number;
  opening_hours: string;
  contact_phone?: string;
  contact_email?: string;
  is_active: boolean;
  sort_order: number;
  total_tables: number;
  available_tables: number;
  created_at: string;
  updated_at: string;
}

export interface Table {
  id: number;
  table_number: string;
  name: string;
  capacity: number;
  location?: string;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance';
  qr_code: string;
  qr_code_url?: string;
  is_outdoor: boolean;
  has_view: boolean;
  accessibility?: string;
  restaurant: number;
  restaurant_name: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuCategory {
  id: number;
  name: string;
  description: string;
  sort_order: number;
  is_available: boolean;
  total_items: number;
  available_items: number;
  items?: MenuItem[];
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: string;
  formatted_price: string;
  is_available: boolean;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  is_spicy: boolean;
  allergens?: string;
  calories?: number;
  sort_order: number;
  preparation_time_minutes: number;
  kitchen_notes?: string;
  dietary_tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Menu {
  id: number;
  name: string;
  description: string;
  restaurant: number;
  restaurant_name: string;
  is_available: boolean;
  available_from?: string;
  available_until?: string;
  available_days?: string;
  sort_order: number;
  total_categories: number;
  total_items: number;
  is_available_now: boolean;
  categories: MenuCategory[];
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  menu_item: number;
  menu_item_name: string;
  menu_item_price: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
  special_instructions?: string;
  kitchen_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderPayment {
  id: number;
  method: 'cash' | 'card' | 'room_charge' | 'digital_wallet' | 'upi';
  amount: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transaction_id?: string;
  processed_at?: string;
  processed_by?: number;
  notes?: string;
  created_at: string;
}

export interface Order {
  id: number;
  order_number: string;
  restaurant: number;
  restaurant_name: string;
  table?: number;
  table_number?: string;
  type: 'dine_in' | 'takeaway' | 'delivery' | 'room_service';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  guest?: number;
  room_number?: string;
  delivery_instructions?: string;
  order_time: string;
  requested_time?: string;
  confirmed_time?: string;
  ready_time?: string;
  served_time?: string;
  subtotal: string;
  tax_amount: string;
  service_charge: string;
  discount_amount: string;
  total_amount: string;
  notes?: string;
  kitchen_notes?: string;
  server?: number;
  total_items: number;
  estimated_preparation_time: number;
  estimated_ready_time?: string;
  items: OrderItem[];
  payments: OrderPayment[];
  created_at: string;
  updated_at: string;
}

export interface KitchenStats {
  total_orders: number;
  pending_orders: number;
  orders_by_restaurant: Array<{
    restaurant__name: string;
    count: number;
  }>;
}

// Payment utility types
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentStatusColor = 'red' | 'yellow' | 'green';

// Extended Order interface with computed payment properties
export interface OrderWithPaymentStatus extends Order {
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
  remainingAmount?: number;
  canAcceptPayment?: boolean;
}

// Request interfaces for API calls
export interface CreateOrderRequest {
  restaurant: number;
  table?: number;
  type: Order['type'];
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  guest?: number;
  room_number?: string;
  delivery_instructions?: string;
  requested_time?: string;
  discount_amount?: string;
  notes?: string;
  kitchen_notes?: string;
  items: CreateOrderItemRequest[];
}

export interface CreateOrderItemRequest {
  menu_item: number;
  quantity: number;
  unit_price?: string;
  special_instructions?: string;
  kitchen_notes?: string;
}

export interface UpdateOrderStatusRequest {
  status: Order['status'];
}

// UI State interfaces
export interface POSState {
  selectedRestaurant: Restaurant | null;
  selectedTable: Table | null;
  currentMenu: Menu | null;
  menuItems: MenuItem[];
  cart: CartItem[];
  currentOrder: Order | null;
  isProcessingPayment: boolean;
  kitchenStats: KitchenStats | null;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
  subtotal: number;
}

export interface PaymentRequest {
  order_id: number;
  method: OrderPayment['method'];
  amount: string;
  notes?: string;
}

// Component Props interfaces
export interface RestaurantSelectorProps {
  restaurants: Restaurant[];
  selectedRestaurant: Restaurant | null;
  onRestaurantSelect: (restaurant: Restaurant) => void;
  loading?: boolean;
}

export interface TableViewProps {
  tables: Table[];
  selectedTable: Table | null;
  onTableSelect: (table: Table) => void;
  restaurant: Restaurant;
  loading?: boolean;
}

export interface MenuItemGridProps {
  menuItems: MenuItem[];
  onItemAdd: (item: MenuItem) => void;
  cart: CartItem[];
  loading?: boolean;
}

export interface OrderCartProps {
  cart: CartItem[];
  onQuantityChange: (itemId: number, quantity: number) => void;
  onItemRemove: (itemId: number) => void;
  onSpecialInstructionsChange: (itemId: number, instructions: string) => void;
  onCheckout: () => void;
  total: number;
  loading?: boolean;
}

export interface KitchenDisplayProps {
  orders: Order[];
  onStatusUpdate: (orderId: number, status: Order['status']) => void;
  kitchenStats: KitchenStats | null;
  loading?: boolean;
}

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onPaymentProcess: (payment: PaymentRequest) => Promise<void>;
  loading?: boolean;
}

export interface OrderHistoryProps {
  orders: Order[];
  onOrderSelect: (order: Order) => void;
  loading?: boolean;
  pagination?: {
    current: number;
    total: number;
    pageSize: number;
    onPageChange: (page: number) => void;
  };
}

// API Response interfaces
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface APIError {
  message: string;
  errors?: Record<string, string[]>;
  status: number;
}