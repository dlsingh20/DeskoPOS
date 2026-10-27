import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  HStack,
  useColorModeValue,
  Flex,
  useToast,
  Button,
  Badge,
  Text,
  SimpleGrid,
  Icon,
  Input,
  IconButton,
} from '@chakra-ui/react';
import {
  Clock,
  ChefHat,
  CheckCircle,
  AlertCircle,
  Package,
  Truck,
  Archive,
  RefreshCw,
  MapPin,
  X,
  ChevronRight,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import OrderDetailPanel from './OrderDetailPanel';

const STATUS_FILTERS = [
  { id: 'all', label: 'All', color: 'gray' },
  { id: 'pending', label: 'Pending', color: 'yellow', icon: AlertCircle },
  { id: 'confirmed', label: 'Confirmed', color: 'blue', icon: CheckCircle },
  { id: 'preparing', label: 'Preparing', color: 'orange', icon: ChefHat },
  { id: 'ready', label: 'Ready', color: 'green', icon: Package },
  { id: 'served', label: 'Served', color: 'purple', icon: Truck },
  { id: 'completed', label: 'Completed', color: 'gray', icon: Archive },
];

const STATUS_CONFIG = {
  pending: { icon: AlertCircle, color: 'yellow.500', label: 'Pending' },
  confirmed: { icon: CheckCircle, color: 'blue.500', label: 'Confirmed' },
  preparing: { icon: ChefHat, color: 'orange.500', label: 'Preparing' },
  ready: { icon: Package, color: 'green.500', label: 'Ready' },
  served: { icon: Truck, color: 'purple.500', label: 'Served' },
  completed: { icon: Archive, color: 'gray.500', label: 'Completed' },
  cancelled: { icon: X, color: 'red.500', label: 'Cancelled' },
};

const UnifiedOrderView = () => {
  const {
    state,
    loadOrders,
    loadKitchenStats,
    formatPrice,
  } = usePOS();

  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  // The single canonical order view/edit surface, opened from any order tile.
  const [detailOrder, setDetailOrder] = useState(null);

  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const tileBg = useColorModeValue('white', 'gray.900');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const textColor = useColorModeValue('gray.900', 'white');
  const expandedBg = useColorModeValue('gray.50', 'gray.800');

  useEffect(() => {
    loadOrders();
    loadKitchenStats();
  }, [loadOrders, loadKitchenStats]);

  // Filter to today's orders, apply search and status filter
  const filteredOrders = useMemo(() => {
    if (!state.orders) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let orders = state.orders.filter(order => {
      const orderDate = new Date(order.order_time || order.created_at);
      return orderDate >= today && orderDate < tomorrow;
    });

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      orders = orders.filter(o =>
        o.order_number?.toLowerCase().includes(query) ||
        o.customer_name?.toLowerCase().includes(query) ||
        o.table_number?.toString().includes(query)
      );
    }

    if (activeFilter !== 'all') {
      orders = orders.filter(o => {
        if (activeFilter === 'served') return o.status === 'served' || o.status === 'outstanding';
        return o.status === activeFilter;
      });
    }

    return orders;
  }, [state.orders, searchQuery, activeFilter]);

  // Count per status for badges
  const statusCounts = useMemo(() => {
    if (!state.orders) return {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrders = state.orders.filter(order => {
      const orderDate = new Date(order.order_time || order.created_at);
      return orderDate >= today && orderDate < tomorrow;
    });

    const counts = { all: todayOrders.length };
    for (const f of STATUS_FILTERS) {
      if (f.id === 'all') continue;
      if (f.id === 'served') {
        counts[f.id] = todayOrders.filter(o => o.status === 'served' || o.status === 'outstanding').length;
      } else {
        counts[f.id] = todayOrders.filter(o => o.status === f.id).length;
      }
    }
    return counts;
  }, [state.orders]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadOrders(), loadKitchenStats()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadOrders, loadKitchenStats]);

  const formatOrderNumber = (orderNum) => {
    const numStr = orderNum?.toString() || '';
    return `#${numStr.slice(-3).padStart(3, '0')}`;
  };

  const getTimeElapsed = (order) => {
    const orderTime = order.order_time || order.created_at;
    if (!orderTime) return 'now';
    const created = new Date(orderTime);
    const now = new Date();
    const diffMinutes = Math.floor((now - created) / 1000 / 60);
    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
    return `${Math.floor(diffMinutes / 1440)}d`;
  };

  const getItemsSummary = (order) => {
    if (!order.items || order.items.length === 0) return 'No items';
    return order.items
      .map(item => `${item.quantity || 1}x ${item.menu_item_name || item.name || 'Item'}`)
      .filter(Boolean)
      .join(', ');
  };

  const getPaymentColor = (order) => {
    if (order.payment_status === 'paid') return 'green';
    if (order.payment_status === 'partial') return 'yellow';
    return 'orange';
  };

  const getPaymentLabel = (order) => {
    if (order.payment_status === 'paid') return 'Paid';
    if (order.payment_status === 'partial') return 'Partial';
    return 'Unpaid';
  };

  return (
    <Box h="full" bg={bg} display="flex" flexDirection="column">
      {/* Search bar */}
      <Box p={3} borderBottomWidth="1px" borderColor={borderColor}>
        <HStack spacing={2}>
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
            flex={1}
          />
          <IconButton
            size="sm"
            icon={<Icon as={RefreshCw} boxSize={4} />}
            onClick={handleRefresh}
            isLoading={isRefreshing || state.loading?.orders}
            aria-label="Refresh"
            variant="outline"
          />
        </HStack>
      </Box>

      {/* Status filter chips - horizontal scroll */}
      <Box
        px={3}
        py={2}
        borderBottomWidth="1px"
        borderColor={borderColor}
        overflowX="auto"
        css={{
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        <HStack spacing={2} minW="max-content">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.id}
              size="sm"
              variant={activeFilter === filter.id ? 'solid' : 'outline'}
              colorScheme={activeFilter === filter.id ? filter.color : 'gray'}
              onClick={() => setActiveFilter(filter.id)}
              borderRadius="full"
              fontSize="xs"
              px={3}
              h="30px"
              flexShrink={0}
              rightIcon={
                <Badge
                  colorScheme={activeFilter === filter.id ? 'whiteAlpha' : filter.color}
                  borderRadius="full"
                  fontSize="2xs"
                  ml={-1}
                >
                  {statusCounts[filter.id] || 0}
                </Badge>
              }
            >
              {filter.label}
            </Button>
          ))}
        </HStack>
      </Box>

      {/* Order tiles grid */}
      <Box flex={1} overflowY="auto" p={3}>
        {filteredOrders.length === 0 ? (
          <Flex justify="center" align="center" h="200px">
            <Text color={mutedColor}>No orders found</Text>
          </Flex>
        ) : (
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={3}>
            {filteredOrders.map((order) => {
              const status = STATUS_CONFIG[order.status?.toLowerCase()] || STATUS_CONFIG.pending;

              return (
                <Box
                  key={order.id}
                  bg={tileBg}
                  borderWidth="1px"
                  borderColor={borderColor}
                  borderRadius="lg"
                  overflow="hidden"
                  transition="all 0.2s"
                >
                  {/* Tile summary — tap opens the canonical order panel */}
                  <Box
                    p={3}
                    cursor="pointer"
                    onClick={() => setDetailOrder(order)}
                    _hover={{ bg: expandedBg }}
                    transition="background 0.15s"
                  >
                    <HStack justify="space-between" mb={1.5}>
                      <HStack spacing={2}>
                        <Text fontSize="sm" fontWeight="700" color={textColor}>
                          {formatOrderNumber(order.order_number)}
                        </Text>
                        {order.table_number && (
                          <HStack spacing={0.5}>
                            <MapPin size={11} color={mutedColor} />
                            <Text fontSize="xs" color={mutedColor}>T{order.table_number}</Text>
                          </HStack>
                        )}
                      </HStack>
                      <HStack spacing={1.5}>
                        <Clock size={11} color={mutedColor} />
                        <Text fontSize="xs" color={mutedColor}>{getTimeElapsed(order)}</Text>
                        <Icon as={ChevronRight} boxSize={3.5} color={mutedColor} />
                      </HStack>
                    </HStack>

                    <Text fontSize="xs" color={textColor} noOfLines={1} mb={1.5}>
                      {getItemsSummary(order)}
                    </Text>

                    <HStack justify="space-between" align="center">
                      <HStack spacing={2}>
                        <Box w="7px" h="7px" borderRadius="full" bg={status.color} />
                        <Text fontSize="2xs" color={mutedColor}>{status.label}</Text>
                        <Badge
                          size="sm"
                          colorScheme={getPaymentColor(order)}
                          fontSize="2xs"
                          borderRadius="full"
                          px={1.5}
                        >
                          {getPaymentLabel(order)}
                        </Badge>
                      </HStack>
                      <Text fontSize="sm" fontWeight="700" color={textColor}>
                        {formatPrice(order.total_amount)}
                      </Text>
                    </HStack>
                  </Box>
                </Box>
              );
            })}
          </SimpleGrid>
        )}
      </Box>

      {/* Canonical order view/edit panel — same surface used on every page */}
      {detailOrder && (
        <OrderDetailPanel
          order={detailOrder}
          isOpen={!!detailOrder}
          onClose={() => {
            setDetailOrder(null);
            handleRefresh();
          }}
          onRefresh={handleRefresh}
        />
      )}
    </Box>
  );
};

export default UnifiedOrderView;
