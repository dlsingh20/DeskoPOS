import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  useColorModeValue,
  Flex,
  useToast,
  Button,
} from '@chakra-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import OrderGrid from '../orders/OrderGrid';
import OrderDetailPanel from '../orders/OrderDetailPanel';
import MinimalArchiveHeader from './MinimalArchiveHeader';
import CompactArchiveTable from './CompactArchiveTable';
import CompactStatsBar from './CompactStatsBar';

/**
 * Archive View Component
 * Displays historical orders with date filtering and search
 */
const ArchiveView = () => {
  const {
    state,
    loadOrders,
    formatPrice,
  } = usePOS();
  
  const toast = useToast();
  
  // State management
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('table'); // Default to table view for maximum density
  const [orderLimit] = useState('50'); // Default to 50 orders
  const [dateRange, setDateRange] = useState('yesterday');
  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() - 86400000).toISOString().split('T')[0]); // Yesterday by default
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [archivedOrders, setArchivedOrders] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showExpandedStats, setShowExpandedStats] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  
  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (dateRange) {
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          from: yesterday.toISOString().split('T')[0],
          to: yesterday.toISOString().split('T')[0]
        };
      
      case 'last7days':
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        return {
          from: week.toISOString().split('T')[0],
          to: new Date(today.getTime() - 1).toISOString().split('T')[0] // Exclude today
        };
      
      case 'last30days':
        const month = new Date(today);
        month.setDate(month.getDate() - 30);
        return {
          from: month.toISOString().split('T')[0],
          to: new Date(today.getTime() - 1).toISOString().split('T')[0]
        };
      
      case 'thisMonth':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          from: startOfMonth.toISOString().split('T')[0],
          to: new Date(today.getTime() - 1).toISOString().split('T')[0]
        };
      
      case 'lastMonth':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          from: lastMonthStart.toISOString().split('T')[0],
          to: lastMonthEnd.toISOString().split('T')[0]
        };
      
      case 'custom':
        return {
          from: customDateFrom,
          to: customDateTo
        };
      
      default:
        return null;
    }
  };
  
  // Load archived orders
  const loadArchivedOrders = async () => {
    setIsLoading(true);
    try {
      const dateParams = getDateRange();
      if (!dateParams) return;
      
      const filters = {
        date_from: dateParams.from,
        date_to: dateParams.to,
        restaurant_id: state.selectedRestaurant?.id,
      };
      
      // Add limit if not "all"
      if (orderLimit !== 'all') {
        filters.limit = parseInt(orderLimit);
      }
      
      await loadOrders(filters);
    } catch (error) {
      toast({
        title: 'Error loading archived orders',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load orders on mount and when filters change
  useEffect(() => {
    if (state.selectedRestaurant) {
      loadArchivedOrders();
    }
  }, [state.selectedRestaurant, dateRange, customDateFrom, customDateTo, orderLimit]);
  
  // Filter loaded orders based on selected date
  const filteredOrders = useMemo(() => {
    if (!state.orders || state.orders.length === 0) return [];
    
    // Filter by selected date
    const selectedDateObj = new Date(selectedDate + 'T00:00:00');
    selectedDateObj.setHours(0, 0, 0, 0);
    const nextDay = new Date(selectedDateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    
    let orders = state.orders.filter(order => {
      const orderDate = new Date(order.order_time || order.created_at);
      return orderDate >= selectedDateObj && orderDate < nextDay;
    });
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      orders = orders.filter(o =>
        o.order_number?.toLowerCase().includes(query) ||
        o.customer_name?.toLowerCase().includes(query) ||
        o.table_number?.toString().includes(query)
      );
    }
    
    // Sort by date descending (newest first)
    orders.sort((a, b) => new Date(b.order_time || b.created_at) - new Date(a.order_time || a.created_at));
    
    return orders;
  }, [state.orders, searchQuery, selectedDate]);
  
  // Calculate paginated orders
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredOrders.slice(startIndex, endIndex);
  }, [filteredOrders, currentPage]);
  
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  
  // Calculate stats
  const stats = useMemo(() => {
    const totalRevenue = filteredOrders
      .filter(o => o.payment_status === 'paid')
      .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    
    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter(o => o.status === 'completed').length;
    const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;
    
    return {
      totalOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    };
  }, [filteredOrders]);
  
  const handleRefresh = () => {
    loadArchivedOrders();
  };
  
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      toast({
        title: 'Nothing to Export',
        description: 'No orders match the current filters',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const escapeCsv = (value) => {
      const str = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const header = ['Order #', 'Date', 'Time', 'Table', 'Customer', 'Type', 'Status', 'Payment Status', 'Items', 'Total Amount'];
    const rows = filteredOrders.map(order => {
      const orderDate = new Date(order.order_time || order.created_at);
      return [
        order.order_number,
        orderDate.toLocaleDateString(),
        orderDate.toLocaleTimeString(),
        order.table_number || '',
        order.customer_name || '',
        order.type || '',
        order.status || '',
        order.payment_status || '',
        (order.items || []).map(i => `${i.quantity}x ${i.menu_item_name || i.name}`).join('; '),
        order.total_amount || 0,
      ].map(escapeCsv).join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pos-archive-${selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Export Complete',
      description: `Exported ${filteredOrders.length} orders to CSV`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };
  
  return (
    <Box h="full" bg={bg} display="flex" flexDirection="column">
      {/* Minimal Archive Header with enhanced controls */}
      <MinimalArchiveHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
        onRefresh={handleRefresh}
        onExport={handleExportCSV}
        isRefreshing={isLoading}
        totalOrders={filteredOrders.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      
      <VStack spacing={0} flex={1}>
        {/* Compact Stats Bar */}
        <CompactStatsBar
          stats={stats}
          isExpanded={showExpandedStats}
          onToggleExpand={() => setShowExpandedStats(!showExpandedStats)}
          formatPrice={formatPrice}
        />
        
        {/* Main Content Area with reduced padding */}
        <Flex flex={1} overflow="hidden">
          {/* Order Display Area */}
          <Box flex={1} overflowY="auto" p={2}>
            <VStack spacing={2} align="stretch">
              {/* Conditional rendering based on view mode */}
              {viewMode === 'table' ? (
                <CompactArchiveTable
                  orders={paginatedOrders}
                  loading={isLoading}
                  formatPrice={formatPrice}
                  onOrderSelect={(order) => {
                    setSelectedOrder(order);
                    setIsPanelOpen(true);
                  }}
                  formatPrice={formatPrice}
                />
              ) : (
                <OrderGrid
                  orders={paginatedOrders}
                  viewMode={viewMode}
                  selectedOrder={selectedOrder}
                  onOrderSelect={(order) => {
                    setSelectedOrder(order);
                    setIsPanelOpen(true);
                  }}
                  loading={isLoading}
                  onStatusUpdate={null} // No quick actions for archived orders
                />
              )}
              
              {/* Pagination Controls with reduced padding */}
              {totalPages > 1 && (
                <HStack justify="center" spacing={4} py={2}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    isDisabled={currentPage === 1}
                    leftIcon={<ChevronLeft />}
                  >
                    Previous
                  </Button>
                  <HStack spacing={1}>
                    <Text fontSize="sm" color="gray.600">
                      Page {currentPage} of {totalPages}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      ({filteredOrders.length} total orders)
                    </Text>
                  </HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    isDisabled={currentPage === totalPages}
                    rightIcon={<ChevronRight />}
                  >
                    Next
                  </Button>
                </HStack>
              )}
            </VStack>
          </Box>
          
          {/* Removed Action Panel - Using Modal Instead */}
        </Flex>
      </VStack>
      
      {/* Canonical order view/edit panel — same surface used on every page */}
      <OrderDetailPanel
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        onRefresh={handleRefresh}
        width="450px"
      />
    </Box>
  );
};

export default ArchiveView;