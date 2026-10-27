import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { RestaurantService, TableService, MenuService, OrderService, HotelService, CurrencyService } from '../services';
import ApiClient from '../services/ApiClient';
import { IS_DESKOPOS } from '../services/backend';
import useUserActivity from '../hooks/useUserActivity';
import useWebSocket from '../hooks/useWebSocket';
import SmartRefreshService from '../services/SmartRefreshService';

// Helper function to detect changes between old and new orders
const detectOrderChanges = (oldOrders, newOrders) => {
  if (!oldOrders || !newOrders) return true;
  if (oldOrders.length !== newOrders.length) return true;
  
  // Create maps for efficient comparison
  const oldOrderMap = new Map(oldOrders.map(order => [order.id, order]));
  const newOrderMap = new Map(newOrders.map(order => [order.id, order]));
  
  // Check for new orders
  for (const newOrder of newOrders) {
    const oldOrder = oldOrderMap.get(newOrder.id);
    if (!oldOrder) {
      console.log(`New order detected: ${newOrder.id}`);
      return true;
    }
    
    // Check key fields that indicate meaningful changes
    const keyFields = ['status', 'total_amount', 'updated_at'];
    for (const field of keyFields) {
      if (oldOrder[field] !== newOrder[field]) {
        console.log(`Order ${newOrder.id} changed: ${field} from ${oldOrder[field]} to ${newOrder[field]}`);
        return true;
      }
    }
  }
  
  // Check for removed orders
  for (const oldOrder of oldOrders) {
    if (!newOrderMap.has(oldOrder.id)) {
      console.log(`Order removed: ${oldOrder.id}`);
      return true;
    }
  }
  
  return false;
};

// Initial state for POS system
const initialState = {
  // Selection state
  selectedRestaurant: null,
  selectedTable: null,
  selectedOrder: null,
  
  // Data state
  restaurants: [],
  tables: [],
  menuItems: [],
  orders: [],
  kitchenStats: null,
  heldOrders: [],
  lowStockCount: 0,
  
  // Hotel and currency state
  hotelSettings: null,
  currency: 'INR', // Default currency
  
  // Cart state
  cart: [],
  cartTotal: 0,
  
  // UI state
  loading: {
    restaurants: false,
    tables: false,
    menuItems: false,
    orders: false,
    kitchenStats: false,
    payment: false,
    hotelSettings: false,
  },
  error: null,
  
  // Refresh control
  refreshControl: {
    pauseAutoRefresh: false,
    activeModal: null,
    lastUpdateTimestamp: null,
    pendingChanges: []
  },
  
  // Settings
  settings: {
    autoRefreshInterval: 30000, // 30 seconds
    defaultTaxRate: 0,
    defaultServiceChargeRate: 0,
  }
};

// Action types
const actionTypes = {
  // Loading actions
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  
  // Selection actions
  SELECT_RESTAURANT: 'SELECT_RESTAURANT',
  SELECT_TABLE: 'SELECT_TABLE',
  SELECT_ORDER: 'SELECT_ORDER',
  CLEAR_RESTAURANT_SELECTION: 'CLEAR_RESTAURANT_SELECTION',
  CLEAR_TABLE_SELECTION: 'CLEAR_TABLE_SELECTION',
  
  // Data actions
  SET_RESTAURANTS: 'SET_RESTAURANTS',
  SET_TABLES: 'SET_TABLES',
  SET_MENU_ITEMS: 'SET_MENU_ITEMS',
  UPDATE_ITEM_AVAILABILITY: 'UPDATE_ITEM_AVAILABILITY',
  SET_ORDERS: 'SET_ORDERS',
  SET_KITCHEN_STATS: 'SET_KITCHEN_STATS',
  SET_HELD_ORDERS: 'SET_HELD_ORDERS',
  ADD_HELD_ORDER: 'ADD_HELD_ORDER',
  REMOVE_HELD_ORDER: 'REMOVE_HELD_ORDER',
  
  // Hotel and currency actions
  SET_HOTEL_SETTINGS: 'SET_HOTEL_SETTINGS',
  SET_CURRENCY: 'SET_CURRENCY',
  
  // Cart actions
  ADD_TO_CART: 'ADD_TO_CART',
  REMOVE_FROM_CART: 'REMOVE_FROM_CART',
  UPDATE_CART_ITEM: 'UPDATE_CART_ITEM',
  CLEAR_CART: 'CLEAR_CART',
  
  // Order actions
  CREATE_ORDER: 'CREATE_ORDER',
  UPDATE_ORDER: 'UPDATE_ORDER',
  UPSERT_ORDER: 'UPSERT_ORDER',
  UPDATE_SINGLE_ORDER: 'UPDATE_SINGLE_ORDER',
  ADD_NEW_ORDER: 'ADD_NEW_ORDER',
  REMOVE_ORDER: 'REMOVE_ORDER',
  MERGE_ORDERS: 'MERGE_ORDERS',
  
  // Refresh control actions
  PAUSE_AUTO_REFRESH: 'PAUSE_AUTO_REFRESH',
  RESUME_AUTO_REFRESH: 'RESUME_AUTO_REFRESH',
  SET_ACTIVE_MODAL: 'SET_ACTIVE_MODAL',
  CLEAR_ACTIVE_MODAL: 'CLEAR_ACTIVE_MODAL',
  
  // Inventory actions
  SET_LOW_STOCK_COUNT: 'SET_LOW_STOCK_COUNT',

  // Settings actions
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
};

// Reducer function
function posReducer(state, action) {
  switch (action.type) {
    case actionTypes.SET_LOADING:
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload.key]: action.payload.value,
        },
      };
      
    case actionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: Object.keys(state.loading).reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {}),
      };
      
    case actionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
      
    case actionTypes.SELECT_RESTAURANT:
      return {
        ...state,
        selectedRestaurant: action.payload,
        selectedTable: null, // Clear table when restaurant changes
        tables: [], // Clear tables when restaurant changes
        cart: [], // Clear cart when restaurant changes
        cartTotal: 0,
      };
      
    case actionTypes.SELECT_TABLE:
      return {
        ...state,
        selectedTable: action.payload,
      };
      
    case actionTypes.SELECT_ORDER:
      return {
        ...state,
        selectedOrder: action.payload,
      };
      
    case actionTypes.CLEAR_RESTAURANT_SELECTION:
      return {
        ...state,
        selectedRestaurant: null,
        selectedTable: null,
        selectedOrder: null,
        tables: [],
        menuItems: [],
        cart: [],
        cartTotal: 0,
      };
      
    case actionTypes.CLEAR_TABLE_SELECTION:
      return {
        ...state,
        selectedTable: null,
        cart: [],
        cartTotal: 0,
      };
      
    case actionTypes.SET_RESTAURANTS:
      return {
        ...state,
        restaurants: action.payload,
      };
      
    case actionTypes.SET_TABLES:
      return {
        ...state,
        tables: action.payload,
      };
      
    case actionTypes.SET_MENU_ITEMS:
      return {
        ...state,
        menuItems: action.payload,
      };
      
    case actionTypes.UPDATE_ITEM_AVAILABILITY:
      return {
        ...state,
        menuItems: state.menuItems.map(item =>
          item.id === action.payload.itemId
            ? { ...item, is_available: action.payload.isAvailable }
            : item
        ),
      };
      
    case actionTypes.SET_ORDERS:
      return {
        ...state,
        orders: action.payload,
      };
      
    case actionTypes.SET_KITCHEN_STATS:
      return {
        ...state,
        kitchenStats: action.payload,
      };
      
    case actionTypes.SET_HELD_ORDERS:
      return {
        ...state,
        heldOrders: action.payload,
      };

    case actionTypes.SET_LOW_STOCK_COUNT:
      return {
        ...state,
        lowStockCount: action.payload,
      };
      
    case actionTypes.ADD_HELD_ORDER:
      return {
        ...state,
        heldOrders: [...state.heldOrders, action.payload],
      };
      
    case actionTypes.REMOVE_HELD_ORDER:
      return {
        ...state,
        heldOrders: state.heldOrders.filter((_, index) => index !== action.payload),
      };
      
    case actionTypes.SET_HOTEL_SETTINGS:
      return {
        ...state,
        hotelSettings: action.payload,
        currency: action.payload?.currency || state.currency,
      };
      
    case actionTypes.SET_CURRENCY:
      return {
        ...state,
        currency: action.payload,
      };
      
    case actionTypes.ADD_TO_CART:
      const existingItemIndex = state.cart.findIndex(
        item => item.menuItem.id === action.payload.menuItem.id
      );
      
      let newCart;
      if (existingItemIndex >= 0) {
        // Update existing item
        newCart = state.cart.map((item, index) =>
          index === existingItemIndex
            ? {
                ...item,
                quantity: item.quantity + action.payload.quantity,
                subtotal: (item.quantity + action.payload.quantity) * parseFloat(item.menuItem.price)
              }
            : item
        );
      } else {
        // Add new item
        newCart = [...state.cart, {
          ...action.payload,
          subtotal: action.payload.quantity * parseFloat(action.payload.menuItem.price)
        }];
      }
      
      const newTotal = newCart.reduce((total, item) => total + item.subtotal, 0);
      
      return {
        ...state,
        cart: newCart,
        cartTotal: newTotal,
      };
      
    case actionTypes.REMOVE_FROM_CART:
      const filteredCart = state.cart.filter(item => item.menuItem.id !== action.payload);
      const filteredTotal = filteredCart.reduce((total, item) => total + item.subtotal, 0);
      
      return {
        ...state,
        cart: filteredCart,
        cartTotal: filteredTotal,
      };
      
    case actionTypes.UPDATE_CART_ITEM:
      let updatedCart = state.cart.map(item =>
        item.menuItem.id === action.payload.itemId
          ? {
              ...item,
              ...action.payload.updates,
              subtotal: (action.payload.updates.quantity || item.quantity) * parseFloat(item.menuItem.price)
            }
          : item
      );
      
      // Remove items with zero or negative quantity
      updatedCart = updatedCart.filter(item => item.quantity > 0);
      
      const updatedTotal = updatedCart.reduce((total, item) => total + item.subtotal, 0);
      
      return {
        ...state,
        cart: updatedCart,
        cartTotal: updatedTotal,
      };
      
    case actionTypes.CLEAR_CART:
      return {
        ...state,
        cart: [],
        cartTotal: 0,
      };
      
    case actionTypes.CREATE_ORDER:
      return {
        ...state,
        orders: [action.payload, ...state.orders],
        selectedOrder: action.payload,
        cart: [],
        cartTotal: 0,
      };
      
    case actionTypes.UPDATE_ORDER:
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.id ? action.payload : order
        ),
        selectedOrder: state.selectedOrder?.id === action.payload.id ? action.payload : state.selectedOrder,
      };

    // Real-time upsert from the WebSocket: replace an existing order or add a
    // new one, WITHOUT touching the cart/selection (unlike CREATE_ORDER).
    case actionTypes.UPSERT_ORDER: {
      const incoming = action.payload;
      if (!incoming?.id) return state;
      const exists = state.orders.some(o => o.id === incoming.id);
      return {
        ...state,
        orders: exists
          ? state.orders.map(o => (o.id === incoming.id ? incoming : o))
          : [incoming, ...state.orders],
        selectedOrder: state.selectedOrder?.id === incoming.id ? incoming : state.selectedOrder,
      };
    }

    // New delta update actions
    case actionTypes.UPDATE_SINGLE_ORDER:
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.id ? { ...order, ...action.payload } : order
        ),
        selectedOrder: state.selectedOrder?.id === action.payload.id 
          ? { ...state.selectedOrder, ...action.payload } 
          : state.selectedOrder,
      };
      
    case actionTypes.ADD_NEW_ORDER:
      return {
        ...state,
        orders: [action.payload, ...state.orders],
      };
      
    case actionTypes.REMOVE_ORDER:
      return {
        ...state,
        orders: state.orders.filter(order => order.id !== action.payload),
        selectedOrder: state.selectedOrder?.id === action.payload ? null : state.selectedOrder,
      };
      
    case actionTypes.MERGE_ORDERS:
      const existingOrderIds = new Set(state.orders.map(o => o.id));
      const newOrders = action.payload.filter(order => !existingOrderIds.has(order.id));
      const updatedOrders = state.orders.map(existingOrder => {
        const updatedOrder = action.payload.find(o => o.id === existingOrder.id);
        return updatedOrder ? updatedOrder : existingOrder;
      });
      return {
        ...state,
        orders: [...updatedOrders, ...newOrders],
        refreshControl: {
          ...state.refreshControl,
          lastUpdateTimestamp: Date.now(),
        }
      };
      
    // Refresh control actions
    case actionTypes.PAUSE_AUTO_REFRESH:
      return {
        ...state,
        refreshControl: {
          ...state.refreshControl,
          pauseAutoRefresh: true,
        }
      };
      
    case actionTypes.RESUME_AUTO_REFRESH:
      return {
        ...state,
        refreshControl: {
          ...state.refreshControl,
          pauseAutoRefresh: false,
        }
      };
      
    case actionTypes.SET_ACTIVE_MODAL:
      return {
        ...state,
        refreshControl: {
          ...state.refreshControl,
          activeModal: action.payload,
          pauseAutoRefresh: true,
        }
      };
      
    case actionTypes.CLEAR_ACTIVE_MODAL:
      return {
        ...state,
        refreshControl: {
          ...state.refreshControl,
          activeModal: null,
          pauseAutoRefresh: false,
        }
      };
      
    case actionTypes.UPDATE_SETTINGS:
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
        },
      };
      
    case 'NO_UPDATE':
      // No-op action for smart refresh when no changes detected
      return state;
      
    default:
      return state;
  }
}

// Create contexts
const POSContext = createContext();
const POSDispatchContext = createContext();

// Provider component
export function POSProvider({ children }) {
  const [state, dispatch] = useReducer(posReducer, initialState);
  const stateRef = useRef(state);

  // Keep ref updated with current state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- Real-time order sync over WebSocket -------------------------------
  // Connect per selected restaurant. Incoming order_update events upsert into
  // the shared order list so every page reflects the latest order instantly
  // (polling remains a fallback if the socket is unavailable).
  const selectedRestaurantId = state.selectedRestaurant?.id;
  // WS host: explicit env var wins. In local dev fall back to localhost; in a
  // production build require the env var so the HTTPS site never tries to open
  // a bad localhost socket (it just stays on polling until the host is set).
  // DeskoPOS has no socket yet: stay on polling rather than reach the StayDesko host
  const wsBase = IS_DESKOPOS ? null : (process.env.REACT_APP_WEBSOCKET_URL
    || (process.env.NODE_ENV !== 'production' ? 'ws://localhost:8000/ws/pos' : null));
  const wsUrl = (selectedRestaurantId && wsBase)
    ? `${wsBase.replace(/\/$/, '')}/restaurant/${selectedRestaurantId}/`
    : null;

  const handleWsMessage = useCallback((data) => {
    if (!data || !data.type) return;
    if (data.type === 'order_update' && data.order_data?.id) {
      dispatch({ type: actionTypes.UPSERT_ORDER, payload: data.order_data });
    }
  }, []);

  const ws = useWebSocket(wsUrl, { onMessage: handleWsMessage });

  // Join the restaurant group once connected so broadcasts reach this client.
  useEffect(() => {
    if (ws.isConnected && selectedRestaurantId) {
      const hotelId = ApiClient.getHotelContext?.();
      ws.joinRestaurant(selectedRestaurantId, hotelId, ApiClient.getAuthToken?.());
    }
  }, [ws.isConnected, selectedRestaurantId]); // eslint-disable-line react-hooks/exhaustive-deps


  // Load restaurants
  const loadRestaurants = useCallback(async () => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'restaurants', value: true } });
    try {
      const restaurants = await RestaurantService.getActiveRestaurants();
      dispatch({ type: actionTypes.SET_RESTAURANTS, payload: restaurants });
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'restaurants', value: false } });
    }
  }, []);
  
  // Load tables for selected restaurant
  const loadTables = async (restaurantId) => {
    if (!restaurantId) return;
    
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'tables', value: true } });
    try {
      const tables = await TableService.getTablesByRestaurant(restaurantId);
      dispatch({ type: actionTypes.SET_TABLES, payload: tables });
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'tables', value: false } });
    }
  };
  
  // Load menu items
  const loadMenuItems = async (restaurantId) => {
    if (!restaurantId) return;
    
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'menuItems', value: true } });
    try {
      const menuItems = await MenuService.getAvailableMenuItems(restaurantId);
      dispatch({ type: actionTypes.SET_MENU_ITEMS, payload: menuItems });
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'menuItems', value: false } });
    }
  };
  
  // Load orders
  const loadOrders = useCallback(async (filters = {}) => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'orders', value: true } });
    try {
      const orders = await OrderService.getOrders(filters);
      dispatch({ type: actionTypes.SET_ORDERS, payload: orders });
    } catch (error) {
      // Don't show cancelled request errors to user
      if (error.message !== 'Request cancelled' && error.message !== 'canceled') {
        dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
      }
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'orders', value: false } });
    }
  }, []);

  // Smart refresh orders - only updates what changed
  const smartRefreshOrders = useCallback(async (filters = {}) => {
    try {
      // Use debounced version for auto-refresh to prevent rapid successive calls
      const orders = await OrderService.getOrdersDebounced(filters, 500);
      
      // Use ref to get current orders and avoid stale closure
      const currentOrders = stateRef.current.orders;
      const hasChanges = detectOrderChanges(currentOrders, orders);
      
      if (hasChanges) {
        console.log('Order changes detected, updating...');
        dispatch({ type: actionTypes.MERGE_ORDERS, payload: orders });
      } else {
        console.log('No order changes detected, skipping update');
      }
    } catch (error) {
      if (error.message !== 'Request cancelled') {
        console.error('Smart refresh failed:', error);
      }
      // Don't show error UI for background refresh failures
    }
  }, []); // Remove state.orders dependency to prevent infinite loops
  
  // Load kitchen stats
  const loadKitchenStats = useCallback(async () => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'kitchenStats', value: true } });
    try {
      const stats = await OrderService.getKitchenStats();
      dispatch({ type: actionTypes.SET_KITCHEN_STATS, payload: stats });
    } catch (error) {
      console.error('Error loading kitchen stats:', error);
      // Don't show error for kitchen stats as it's background data
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'kitchenStats', value: false } });
    }
  }, []);
  
  // Load hotel settings
  const loadHotelSettings = useCallback(async (forceRefresh = false) => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'hotelSettings', value: true } });
    try {
      const settings = await HotelService.getCurrentHotelSettings(forceRefresh);
      dispatch({ type: actionTypes.SET_HOTEL_SETTINGS, payload: settings });
      
      console.log('[POSContext] Hotel settings loaded:', {
        hotelName: settings.name,
        currency: settings.currency
      });
      
      return settings;
    } catch (error) {
      console.error('Error loading hotel settings:', error);
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
      
      // Set default currency if hotel settings fail
      dispatch({ type: actionTypes.SET_CURRENCY, payload: 'USD' });
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'hotelSettings', value: false } });
    }
  }, []);
  
  // Get hotel currency
  const getHotelCurrency = useCallback(async () => {
    try {
      const currency = await HotelService.getCurrentHotelCurrency();
      dispatch({ type: actionTypes.SET_CURRENCY, payload: currency });
      return currency;
    } catch (error) {
      console.error('Error getting hotel currency:', error);
      return state.currency || 'USD';
    }
  }, [state.currency]);
  
  // Create order from cart
  const createOrder = async (orderData) => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'orders', value: true } });
    try {
      // Use the items provided by OrderCart, or fall back to cart data
      const items = orderData.items || state.cart.map(cartItem => ({
        menu_item: cartItem.menuItem?.id || cartItem.id,
        quantity: cartItem.quantity,
        unit_price: cartItem.menuItem?.price || cartItem.price,
        special_instructions: cartItem.specialInstructions || '',
      }));
      
      const fullOrderData = {
        ...orderData,
        items,
      };
      
      const newOrder = await OrderService.createOrder(fullOrderData);
      dispatch({ type: actionTypes.CREATE_ORDER, payload: newOrder });
      
      return newOrder;
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
      throw error;
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'orders', value: false } });
    }
  };
  
  // Update order status
  const updateOrderStatus = async (orderId, status) => {
    try {
      const updatedOrder = await OrderService.updateOrderStatus(orderId, status);
      dispatch({ type: actionTypes.UPDATE_ORDER, payload: updatedOrder });
      return updatedOrder;
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
      throw error;
    }
  };
  
  // Process payment
  const processPayment = async (orderId, paymentData) => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'payment', value: true } });
    try {
      const paymentResult = await OrderService.processPayment(orderId, paymentData);
      
      // Refresh the order to get updated payment status
      const updatedOrder = await OrderService.getOrder(orderId);
      dispatch({ type: actionTypes.UPDATE_ORDER, payload: updatedOrder });
      
      return paymentResult;
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
      throw error;
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'payment', value: false } });
    }
  };
  
  // Process flexible payment at any order stage
  const processFlexiblePayment = async (orderId, paymentData) => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'payment', value: true } });
    try {
      const paymentResult = await OrderService.processFlexiblePayment(orderId, paymentData);
      
      // Refresh the order to get updated payment status
      const updatedOrder = await OrderService.getOrder(orderId);
      dispatch({ type: actionTypes.UPDATE_ORDER, payload: updatedOrder });
      
      return paymentResult;
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
      throw error;
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'payment', value: false } });
    }
  };
  
  // Cancel order
  const cancelOrder = async (orderId, reason = 'Cancelled from payment modal') => {
    dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'orders', value: true } });
    try {
      const cancelledOrder = await OrderService.cancelOrder(orderId, reason);
      dispatch({ type: actionTypes.UPDATE_ORDER, payload: cancelledOrder });
      return cancelledOrder;
    } catch (error) {
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
      throw error;
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: { key: 'orders', value: false } });
    }
  };
  
  // Track last refresh time to prevent rapid calls
  const lastRefreshTimeRef = useRef(0);
  
  // Smart auto-refresh functionality - Fixed dependencies to prevent loops
  useEffect(() => {
    let interval;
    
    // Only start auto-refresh if restaurant is selected
    if (state.selectedRestaurant?.id && !state.refreshControl.pauseAutoRefresh) {
      console.log('Setting up auto-refresh interval for restaurant:', state.selectedRestaurant.id);
      
      interval = setInterval(() => {
        // Double-check conditions inside interval
        if (state.refreshControl.pauseAutoRefresh || state.refreshControl.activeModal) {
          console.log('Auto-refresh paused:', { 
            pauseAutoRefresh: state.refreshControl.pauseAutoRefresh,
            activeModal: state.refreshControl.activeModal 
          });
          return;
        }
        
        // Prevent rapid successive calls
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
        if (timeSinceLastRefresh < 5000) { // Don't refresh more than once per 5 seconds
          console.log('Skipping refresh - too soon since last refresh:', timeSinceLastRefresh);
          return;
        }
        
        lastRefreshTimeRef.current = now;
        console.log('Auto-refreshing orders and kitchen stats at:', new Date().toLocaleTimeString());
        
        // Always refresh kitchen stats (lightweight)
        loadKitchenStats();
        
        // Use smart refresh for orders (no dependency on orders.length)
        smartRefreshOrders();
      }, state.settings.autoRefreshInterval);
    } else {
      console.log('Auto-refresh not started:', {
        restaurantId: state.selectedRestaurant?.id,
        pauseAutoRefresh: state.refreshControl.pauseAutoRefresh
      });
    }
    
    return () => {
      if (interval) {
        console.log('Clearing auto-refresh interval');
        clearInterval(interval);
      }
    };
  }, [
    state.selectedRestaurant?.id, // Only depend on restaurant ID to prevent unnecessary re-runs
    state.settings.autoRefreshInterval,
    state.refreshControl.pauseAutoRefresh,
    state.refreshControl.activeModal,
    loadKitchenStats,
    smartRefreshOrders
  ]); // Removed state.orders.length to prevent recursive loops

  // Initialize hotel settings on mount
  useEffect(() => {
    loadHotelSettings();
  }, [loadHotelSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel all active requests when component unmounts
      OrderService.cancelAllRequests();
    };
  }, []);
  
  // Memoized refresh control actions to prevent infinite re-renders
  const setActiveModal = useCallback((modalName) => {
    dispatch({ type: actionTypes.SET_ACTIVE_MODAL, payload: modalName });
  }, []);

  const clearActiveModal = useCallback(() => {
    dispatch({ type: actionTypes.CLEAR_ACTIVE_MODAL });
  }, []);

  const pauseAutoRefresh = useCallback(() => {
    dispatch({ type: actionTypes.PAUSE_AUTO_REFRESH });
  }, []);

  const resumeAutoRefresh = useCallback(() => {
    dispatch({ type: actionTypes.RESUME_AUTO_REFRESH });
  }, []);

  // Currency formatting helpers
  const formatPrice = useCallback((price, options = {}) => {
    return CurrencyService.formatPrice(price, state.currency, options);
  }, [state.currency]);

  const formatCurrency = useCallback((amount, options = {}) => {
    return CurrencyService.formatPrice(amount, state.currency, options);
  }, [state.currency]);

  const getCurrencySymbol = useCallback(() => {
    return CurrencyService.getSymbol(state.currency);
  }, [state.currency]);

  const parsePrice = useCallback((priceString) => {
    return CurrencyService.parsePrice(priceString);
  }, []);

  // Update order item quantity or other properties
  const updateOrderItem = useCallback(async (orderId, itemId, updates) => {
    try {
      let response;
      if (updates.quantity !== undefined) {
        // Use OrderService for quantity updates
        response = await OrderService.updateOrderItemQuantity(orderId, itemId, updates.quantity);
      } else if (updates.status !== undefined) {
        // Use OrderService for status updates
        response = await OrderService.updateOrderItemStatus(orderId, itemId, updates.status);
      } else {
        // For other updates, use a PATCH to the order item directly
        const patchResponse = await ApiClient.patch(
          `/api/pos/api/order-items/${itemId}/`,
          updates
        );
        response = patchResponse.data;
      }
      
      // Refresh the order to get updated totals
      await smartRefreshOrders([orderId]);
      
      return response;
    } catch (error) {
      console.error('Error updating order item:', error);
      throw error;
    }
  }, [smartRefreshOrders]);

  // Remove an item from an order
  const removeOrderItem = useCallback(async (orderId, itemId) => {
    try {
      // Use ApiClient to make the DELETE request
      await ApiClient.delete(`/api/pos/api/order-items/${itemId}/`);
      
      // Refresh the order to get updated totals
      await smartRefreshOrders([orderId]);
      
      return true;
    } catch (error) {
      console.error('Error removing order item:', error);
      throw error;
    }
  }, [smartRefreshOrders]);

  // Add item to existing order
  const addItemToOrder = useCallback(async (orderId, menuItemId, quantity, specialInstructions = '', unitPrice = null) => {
    try {
      // Use OrderService's addItemsToOrder method which handles proper API calls
      const items = [{
        menu_item_id: menuItemId,
        quantity: quantity,
        special_instructions: specialInstructions,
        unit_price: unitPrice
      }];
      const response = await OrderService.addItemsToOrder(orderId, items);
      
      // Refresh the order to get updated totals
      await smartRefreshOrders([orderId]);
      
      return response[0]; // Return the first (and only) item added
    } catch (error) {
      console.error('Error adding item to order:', error);
      throw error;
    }
  }, [smartRefreshOrders]);

  // Context value
  const contextValue = {
    state,
    dispatch,
    
    // Actions
    loadRestaurants,
    loadTables,
    loadMenuItems,
    loadOrders,
    smartRefreshOrders,
    loadKitchenStats,
    loadHotelSettings,
    getHotelCurrency,
    createOrder,
    updateOrderStatus,
    processPayment,
    processFlexiblePayment,
    cancelOrder,
    updateOrderItem,
    removeOrderItem,
    addItemToOrder,
    
    // Currency helpers
    formatPrice,
    formatCurrency,
    getCurrencySymbol,
    parsePrice,
    
    // Refresh control actions
    pauseAutoRefresh,
    resumeAutoRefresh,
    setActiveModal,
    clearActiveModal,
    
    // Convenience actions
    selectRestaurant: (restaurant) => {
      dispatch({ type: actionTypes.SELECT_RESTAURANT, payload: restaurant });
      if (restaurant) {
        // Free stale tables once per day (first load of the day)
        const today = new Date().toISOString().slice(0, 10);
        const staleKey = `stale_tables_cleared_${restaurant.id}`;
        if (localStorage.getItem(staleKey) !== today) {
          TableService.freeStaleTablesByRestaurant(restaurant.id)
            .then((result) => {
              localStorage.setItem(staleKey, today);
              if (result.freed_tables_count > 0) {
                console.log(`Freed ${result.freed_tables_count} stale tables`, result);
              }
            })
            .catch((err) => console.error('Error freeing stale tables:', err));
        }
        loadTables(restaurant.id);
        loadMenuItems(restaurant.id);
        // Fetch low stock count (lightweight, non-blocking)
        import('../services/InventoryService').then(({ default: InventoryService }) => {
          InventoryService.getLowStockCount(restaurant.id)
            .then((res) => dispatch({ type: actionTypes.SET_LOW_STOCK_COUNT, payload: res.data.count }))
            .catch(() => {});
        });
      }
    },
    
    selectTable: (table) => {
      dispatch({ type: actionTypes.SELECT_TABLE, payload: table });
    },
    
    clearRestaurantSelection: () => {
      dispatch({ type: actionTypes.CLEAR_RESTAURANT_SELECTION });
    },
    
    clearTableSelection: () => {
      dispatch({ type: actionTypes.CLEAR_TABLE_SELECTION });
    },
    
    addToCart: (menuItem, quantity = 1, specialInstructions = '') => {
      dispatch({
        type: actionTypes.ADD_TO_CART,
        payload: { menuItem, quantity, specialInstructions }
      });
    },
    
    removeFromCart: (itemId) => {
      dispatch({ type: actionTypes.REMOVE_FROM_CART, payload: itemId });
    },
    
    toggleItemAvailability: async (itemId) => {
      try {
        const item = state.menuItems.find(i => i.id === itemId);
        if (!item) {
          console.error('Item not found:', itemId);
          return;
        }
        
        const newStatus = !item.is_available;
        
        // Optimistic update
        dispatch({ 
          type: actionTypes.UPDATE_ITEM_AVAILABILITY, 
          payload: { itemId, isAvailable: newStatus }
        });
        
        // Update backend
        await MenuService.toggleItemAvailability(itemId, newStatus);
        
        // Success notification handled by caller
        return newStatus;
      } catch (error) {
        console.error('Error toggling item availability:', error);
        
        // Revert on error
        const item = state.menuItems.find(i => i.id === itemId);
        if (item) {
          dispatch({ 
            type: actionTypes.UPDATE_ITEM_AVAILABILITY, 
            payload: { itemId, isAvailable: item.is_available }
          });
        }
        
        throw error;
      }
    },
    
    updateCartItem: (itemId, updates) => {
      dispatch({
        type: actionTypes.UPDATE_CART_ITEM,
        payload: { itemId, updates }
      });
    },
    
    clearCart: () => {
      dispatch({ type: actionTypes.CLEAR_CART });
    },
    
    // Helper to get cart quantity for a menu item
    getCartItemQuantity: (menuItemId) => {
      const cartItem = state.cart.find(item => 
        (item.menuItem?.id || item.id) === menuItemId
      );
      return cartItem ? cartItem.quantity : 0;
    },
    
    clearError: () => {
      dispatch({ type: actionTypes.CLEAR_ERROR });
    },
    
    // Hold order functions
    loadHeldOrders: () => {
      try {
        const held = JSON.parse(localStorage.getItem('heldOrders') || '[]');
        dispatch({ type: actionTypes.SET_HELD_ORDERS, payload: held });
      } catch (error) {
        console.error('Error loading held orders:', error);
      }
    },
    
    holdOrder: (orderData) => {
      const holdData = {
        ...orderData,
        id: `HOLD-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
      
      dispatch({ type: actionTypes.ADD_HELD_ORDER, payload: holdData });
      
      // Save to localStorage
      const currentHeld = JSON.parse(localStorage.getItem('heldOrders') || '[]');
      currentHeld.push(holdData);
      localStorage.setItem('heldOrders', JSON.stringify(currentHeld));
      
      return holdData;
    },
    
    resumeHeldOrder: (index) => {
      const order = state.heldOrders[index];
      if (!order) return;
      
      // Load order data back into cart
      order.cart?.forEach(item => {
        dispatch({ type: actionTypes.ADD_TO_CART, payload: item });
      });
      
      // Remove from held orders
      dispatch({ type: actionTypes.REMOVE_HELD_ORDER, payload: index });
      
      // Update localStorage
      const currentHeld = state.heldOrders.filter((_, i) => i !== index);
      localStorage.setItem('heldOrders', JSON.stringify(currentHeld));
      
      return order;
    },
    
    deleteHeldOrder: (index) => {
      // Update state
      dispatch({ type: actionTypes.REMOVE_HELD_ORDER, payload: index });
      
      // Update localStorage
      const currentHeld = state.heldOrders.filter((_, i) => i !== index);
      localStorage.setItem('heldOrders', JSON.stringify(currentHeld));
    },
  };
  
  // Initialize held orders on mount
  useEffect(() => {
    try {
      const held = JSON.parse(localStorage.getItem('heldOrders') || '[]');
      dispatch({ type: actionTypes.SET_HELD_ORDERS, payload: held });
    } catch (error) {
      console.error('Error loading held orders:', error);
    }
  }, []);
  
  return (
    <POSContext.Provider value={contextValue}>
      <POSDispatchContext.Provider value={dispatch}>
        {children}
      </POSDispatchContext.Provider>
    </POSContext.Provider>
  );
}

// Custom hooks
export function usePOS() {
  const context = useContext(POSContext);
  if (context === undefined) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
}

export function usePOSDispatch() {
  const context = useContext(POSDispatchContext);
  if (context === undefined) {
    throw new Error('usePOSDispatch must be used within a POSProvider');
  }
  return context;
}