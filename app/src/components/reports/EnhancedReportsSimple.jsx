import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Container,
  VStack,
  HStack,
  Flex,
  Text,
  Button,
  IconButton,
  useColorModeValue,
  useBreakpointValue,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Grid,
  GridItem,
  Skeleton,
  SkeletonText,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Divider,
  Badge,
} from '@chakra-ui/react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  ChefHat,
  Download,
  RefreshCw,
  Calendar,
  Filter,
  BarChart2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Package,
  Users,
  Clock,
  Zap,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import MinimalAnalyticsHeader from './MinimalAnalyticsHeader';
import MinimalStatCard from './cards/MinimalStatCard';
import MinimalReportGrid, { ReportSection, ChartContainer } from './MinimalReportGrid';
import MinimalSalesCard from './cards/MinimalSalesCard';
import MinimalProductCard from './cards/MinimalProductCard';
import SalesReportCard from './cards/SalesReportCard';
import KitchenPerformanceCard from './cards/KitchenPerformanceCard';
import PaymentAnalyticsCard from './cards/PaymentAnalyticsCard';
import StaffPerformanceCard from './cards/StaffPerformanceCard';
import CustomerInsightsCard from './cards/CustomerInsightsCard';
import ProductAnalyticsCard from './cards/ProductAnalyticsCard';
import RevenueChart from './charts/RevenueChart';
import OrderService from '../../services/OrderService';

/**
 * Format a Date as YYYY-MM-DD (the date_from/date_to param format the
 * orders API documents).
 */
const toDateParam = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Percentage change between two totals, safe against divide-by-zero. */
const pctChange = (current, previous) => {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/** Escape a value for a CSV cell (quotes anything with a comma/quote/newline). */
const csvCell = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const RANGE_LABELS = {
  today: 'today',
  yesterday: 'yesterday',
  last7days: 'the last 7 days',
  last30days: 'the last 30 days',
  thisMonth: 'this month',
  lastMonth: 'last month',
};

/**
 * Enhanced Reports View - Simplified version
 */
const EnhancedReportsSimple = () => {
  const {
    state,
    loadKitchenStats,
    formatPrice: formatCurrency,
  } = usePOS();
  
  const toast = useToast();
  
  // Responsive values
  const containerPadding = useBreakpointValue({ base: 2, md: 3, lg: 4 });
  const cardSpacing = useBreakpointValue({ base: 2, md: 3 });
  
  // Color schemes
  const bg = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const accentColor = useColorModeValue('blue.600', 'blue.400');
  const scrollbarThumb = useColorModeValue('#CBD5E0', '#4A5568');
  const scrollbarThumbHover = useColorModeValue('#A0AEC0', '#718096');
  
  // State management
  const [selectedRange, setSelectedRange] = useState('today');
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Default to the actual start-of-today -> now, matching selectedRange
  // ('today'). Using two separate `new Date()` calls here would produce a
  // near-empty window (start and end a few ms apart) and hide today's data
  // until the user touched the date picker.
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { startDate: startOfToday, endDate: now, preset: 'today' };
  });
  
  const [filters, setFilters] = useState({
    restaurant: 'all',
    orderType: 'all',
    paymentStatus: 'all',
    staff: 'all'
  });
  
  const [reportData, setReportData] = useState(null);
  // Orders for the selected date range and for the immediately preceding
  // equal-length period (used for trend comparison). Fetched directly via
  // OrderService rather than the global POSContext state.orders, so this
  // report never mutates the live order list other screens rely on.
  const [rangeOrders, setRangeOrders] = useState([]);
  const [previousRangeOrders, setPreviousRangeOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  /**
   * Apply the current UI filters (order type / payment status) to a raw
   * order list. Date-range scoping already happened at fetch time, but we
   * re-check it here too: the backend orders endpoint documents date_from/
   * date_to (see pos/API_DESIGN.md) but OrderViewSet.get_queryset does not
   * currently implement that filter, so it can return orders outside the
   * requested range. Filtering client-side keeps the report honest either
   * way. (Backend gap flagged separately.)
   */
  const applyFilters = useCallback((orders, start, end) => {
    return orders.filter(order => {
      const orderDate = new Date(order.order_time || order.created_at);
      if (!(orderDate >= start && orderDate <= end)) return false;
      if (filters.orderType !== 'all' && order.type !== filters.orderType) return false;
      if (filters.paymentStatus !== 'all' && order.payment_status !== filters.paymentStatus) return false;
      return true;
    });
  }, [filters.orderType, filters.paymentStatus]);

  /**
   * Process report data
   */
  const processReportData = useCallback(() => {
    if (!rangeOrders || rangeOrders.length === 0) {
      setReportData(null);
      return;
    }

    const filteredOrders = applyFilters(rangeOrders, dateRange.startDate, dateRange.endDate);

    // Previous equal-length period, for trend comparison
    const rangeDurationMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const previousEndDate = new Date(dateRange.startDate.getTime() - 1);
    const previousStartDate = new Date(previousEndDate.getTime() - rangeDurationMs);
    const filteredPreviousOrders = applyFilters(previousRangeOrders, previousStartDate, previousEndDate);

    // Calculate metrics
    const totalRevenue = filteredOrders.reduce((sum, order) => 
      sum + parseFloat(order.total_amount || 0), 0
    );
    
    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    const completedOrders = filteredOrders.filter(o => 
      ['served', 'completed', 'outstanding'].includes(o.status)
    ).length;
    
    const pendingOrders = filteredOrders.filter(o => 
      ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
    ).length;
    
    const cancelledOrders = filteredOrders.filter(o => 
      o.status === 'cancelled'
    ).length;
    
    // Order type breakdown
    const orderTypeBreakdown = filteredOrders.reduce((acc, order) => {
      const type = order.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    // Hourly distribution
    const hourlyDistribution = Array(24).fill(0);
    filteredOrders.forEach(order => {
      const hour = new Date(order.order_time || order.created_at).getHours();
      hourlyDistribution[hour]++;
    });
    
    // Payment breakdown
    const paymentBreakdown = {};
    filteredOrders.forEach(order => {
      if (order.payments && Array.isArray(order.payments)) {
        order.payments.forEach(payment => {
          const method = payment.method || 'unknown';
          paymentBreakdown[method] = (paymentBreakdown[method] || 0) + parseFloat(payment.amount || 0);
        });
      }
    });
    
    // Popular items
    const itemFrequency = {};
    filteredOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const name = item.menu_item_name || 'Unknown Item';
          if (!itemFrequency[name]) {
            itemFrequency[name] = {
              quantity: 0,
              revenue: 0,
              orders: 0
            };
          }
          itemFrequency[name].quantity += item.quantity || 1;
          itemFrequency[name].revenue += parseFloat(item.total_price || 0);
          itemFrequency[name].orders++;
        });
      }
    });
    
    const topItems = Object.entries(itemFrequency)
      .sort(([,a], [,b]) => b.quantity - a.quantity)
      .slice(0, 10)
      .map(([name, data]) => ({ name, ...data }));
    
    // Real trends: compare current filtered totals against the previous
    // equal-length period actually fetched from the API (no more hardcoded 0s).
    const previousRevenue = filteredPreviousOrders.reduce((sum, order) =>
      sum + parseFloat(order.total_amount || 0), 0
    );
    const previousTotalOrders = filteredPreviousOrders.length;
    const previousAvgOrder = previousTotalOrders > 0 ? previousRevenue / previousTotalOrders : 0;

    setReportData({
      summary: {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        completedOrders,
        pendingOrders,
        cancelledOrders,
        completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
        cancellationRate: totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0,
      },
      trends: {
        revenue: pctChange(totalRevenue, previousRevenue),
        orders: pctChange(totalOrders, previousTotalOrders),
        avgOrder: pctChange(averageOrderValue, previousAvgOrder),
      },
      breakdown: {
        orderTypes: orderTypeBreakdown,
        hourlyDistribution,
        paymentMethods: paymentBreakdown,
        topItems,
      },
      kitchen: state.kitchenStats,
      // Raw filtered orders for this period - used by StaffPerformanceCard,
      // CustomerInsightsCard, and CSV export so they work off real order data
      // instead of separately-fabricated numbers.
      orders: filteredOrders,
    });
  }, [rangeOrders, previousRangeOrders, applyFilters, dateRange, state.kitchenStats]);

  /**
   * Load data: fetch orders for the selected date range directly from the
   * API (not via the global POSContext state.orders, which only ever holds
   * "current/active" orders used by the live table/order screens). Also
   * fetches the previous equal-length period so trends are real.
   */
  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      const rangeDurationMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
      const previousEndDate = new Date(dateRange.startDate.getTime() - 1);
      const previousStartDate = new Date(previousEndDate.getTime() - rangeDurationMs);

      const baseParams = {
        date_from: toDateParam(dateRange.startDate),
        date_to: toDateParam(dateRange.endDate),
      };
      if (filters.restaurant !== 'all') baseParams.restaurant_id = filters.restaurant;
      if (filters.orderType !== 'all') baseParams.type = filters.orderType;

      const [currentOrders, previousOrders] = await Promise.all([
        OrderService.getOrders(baseParams),
        OrderService.getOrders({
          ...baseParams,
          date_from: toDateParam(previousStartDate),
          date_to: toDateParam(previousEndDate),
        }),
        loadKitchenStats(),
      ]);

      setRangeOrders(currentOrders || []);
      setPreviousRangeOrders(previousOrders || []);
    } catch (error) {
      if (error.message !== 'Request cancelled') {
        console.error('Failed to load report data:', error);
        toast({
          title: 'Failed to load reports',
          description: error.message || 'Please try again',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange, filters.restaurant, filters.orderType, loadKitchenStats, toast]);
  
  /**
   * Handle refresh
   */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadReportData();
    toast({
      title: 'Reports refreshed',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
    setTimeout(() => setIsRefreshing(false), 1000);
  };
  
  /**
   * Handle date range change
   */
  const handleDateRangeChange = (range) => {
    setSelectedRange(range);
    // Update actual date range based on selection
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (range) {
      case 'today':
        setDateRange({ startDate: today, endDate: now, preset: 'today' });
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        setDateRange({ startDate: yesterday, endDate: yesterdayEnd, preset: 'yesterday' });
        break;
      case 'last7days':
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        setDateRange({ startDate: week, endDate: now, preset: 'last7days' });
        break;
      case 'last30days':
        const month = new Date(today);
        month.setDate(month.getDate() - 30);
        setDateRange({ startDate: month, endDate: now, preset: 'last30days' });
        break;
      case 'thisMonth':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        setDateRange({ startDate: monthStart, endDate: now, preset: 'thisMonth' });
        break;
      case 'lastMonth':
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        setDateRange({ startDate: lastMonthStart, endDate: lastMonthEnd, preset: 'lastMonth' });
        break;
      default:
        break;
    }
  };
  
  /**
   * Handle export. Only CSV is implemented today - it's a real client-side
   * export of the currently displayed report (summary + per-order rows).
   * PDF/Excel are not built yet; we say so instead of pretending to export.
   */
  const handleExport = (format) => {
    if (format !== 'csv') {
      toast({
        title: `${format.toUpperCase()} export isn't available yet`,
        description: 'Use "Export as CSV" for now - it opens fine in Excel.',
        status: 'info',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    if (!reportData) {
      toast({
        title: 'Nothing to export',
        description: 'Load a report first, then try exporting again.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const { summary, orders = [] } = reportData;
    const rangeLabelText = RANGE_LABELS[selectedRange] || selectedRange;
    const lines = [];

    lines.push(csvCell(`POS Report - ${rangeLabelText}`));
    lines.push(['Date range', `${toDateParam(dateRange.startDate)} to ${toDateParam(dateRange.endDate)}`].map(csvCell).join(','));
    lines.push(['Generated', new Date().toLocaleString()].map(csvCell).join(','));
    lines.push('');
    lines.push('Summary');
    lines.push(['Total Revenue', summary.totalRevenue.toFixed(2)].map(csvCell).join(','));
    lines.push(['Total Orders', summary.totalOrders].map(csvCell).join(','));
    lines.push(['Average Order Value', summary.averageOrderValue.toFixed(2)].map(csvCell).join(','));
    lines.push(['Completed Orders', summary.completedOrders].map(csvCell).join(','));
    lines.push(['Pending Orders', summary.pendingOrders].map(csvCell).join(','));
    lines.push(['Cancelled Orders', summary.cancelledOrders].map(csvCell).join(','));
    lines.push(['Completion Rate %', summary.completionRate.toFixed(1)].map(csvCell).join(','));
    lines.push('');
    lines.push('Orders');
    lines.push(['Order Number', 'Date/Time', 'Type', 'Status', 'Customer', 'Room', 'Items', 'Total'].map(csvCell).join(','));

    orders.forEach(order => {
      const itemsSummary = Array.isArray(order.items)
        ? order.items.map(item => `${item.menu_item_name || 'Item'} x${item.quantity || 1}`).join('; ')
        : '';
      lines.push([
        order.order_number || order.id,
        new Date(order.order_time || order.created_at).toLocaleString(),
        order.type || '',
        order.status || '',
        order.customer_name || '',
        order.room_number || '',
        itemsSummary,
        parseFloat(order.total_amount || 0).toFixed(2),
      ].map(csvCell).join(','));
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const filename = `pos-report-${toDateParam(new Date())}.csv`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    toast({
      title: 'Report downloaded',
      description: filename,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  // Load data on mount and whenever the selected date range or restaurant/
  // order-type filters change.
  useEffect(() => {
    loadReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, filters.restaurant, filters.orderType]);

  // Process data when the fetched orders or filters change
  useEffect(() => {
    processReportData();
  }, [processReportData]);
  
  /**
   * Prepare stats data for MinimalStatCard
   */
  const getStatsData = () => {
    if (!reportData) return [];

    const rangeLabelText = RANGE_LABELS[selectedRange] || selectedRange;

    return [
      {
        id: 'revenue',
        label: 'Revenue',
        value: reportData.summary.totalRevenue,
        icon: DollarSign,
        iconColor: 'green.500',
        format: 'currency',
        trend: reportData.trends.revenue > 0 ? 'up' : 'down',
        trendValue: `${Math.abs(reportData.trends.revenue).toFixed(1)}%`,
        subtitle: `Total sales ${rangeLabelText}`,
      },
      {
        id: 'orders',
        label: 'Orders',
        value: reportData.summary.totalOrders,
        icon: ShoppingCart,
        iconColor: 'blue.500',
        format: 'number',
        trend: reportData.trends.orders > 0 ? 'up' : 'down',
        trendValue: `${Math.abs(reportData.trends.orders).toFixed(1)}%`,
        subtitle: `${reportData.summary.completedOrders} completed`,
      },
      {
        id: 'avgOrder',
        label: 'Average Order',
        value: reportData.summary.averageOrderValue,
        icon: TrendingUp,
        iconColor: 'purple.500',
        format: 'currency',
        trend: reportData.trends.avgOrder > 0 ? 'up' : 'down',
        trendValue: `${Math.abs(reportData.trends.avgOrder).toFixed(1)}%`,
        subtitle: 'Per transaction',
      },
      {
        id: 'completion',
        label: 'Completion',
        value: reportData.summary.completionRate,
        icon: CheckCircle,
        iconColor: 'green.500',
        format: 'percentage',
        subtitle: `${reportData.summary.cancelledOrders} cancelled`,
      },
      {
        id: 'items',
        label: 'Items Sold',
        value: reportData.breakdown.topItems.reduce((sum, item) => sum + item.quantity, 0),
        icon: Package,
        iconColor: 'orange.500',
        format: 'number',
        subtitle: 'Total items',
      },
      {
        id: 'pending',
        label: 'Pending',
        value: reportData.summary.pendingOrders,
        icon: Clock,
        iconColor: 'yellow.500',
        format: 'number',
        subtitle: 'In progress',
      },
      {
        // Orders count, not a real customer count - no reliable way to
        // dedupe unique customers from the order list yet. Labeled as
        // orders served rather than "Customers" so it isn't misleading.
        id: 'customers',
        label: 'Orders Served',
        value: reportData.summary.totalOrders,
        icon: Users,
        iconColor: 'cyan.500',
        format: 'number',
        subtitle: `Served ${rangeLabelText}`,
      },
      {
        id: 'efficiency',
        label: 'Efficiency',
        value: 100 - reportData.summary.cancellationRate,
        icon: Zap,
        iconColor: 'pink.500',
        format: 'percentage',
        subtitle: 'Success rate',
      },
    ];
  };
  
  return (
    <Box h="100%" bg={bg} display="flex" flexDirection="column" position="relative">
      {/* Minimal Analytics Header - Fixed at top */}
      <Box position="sticky" top={0} zIndex={10} bg={bg}>
        <MinimalAnalyticsHeader
          onDateRangeChange={handleDateRangeChange}
          onRefresh={handleRefresh}
          onExport={handleExport}
          isRefreshing={isRefreshing}
          selectedRange={selectedRange}
        />
      </Box>
      
      {/* Scrollable Content Area */}
      <Box 
        flex={1} 
        overflowY="auto"
        overflowX="hidden"
        position="relative"
        sx={{
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
          '&::-webkit-scrollbar': {
            width: { base: '4px', md: '8px' },
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: scrollbarThumb,
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: scrollbarThumbHover,
          },
        }}
      >
        <Container maxW="container.2xl" py={containerPadding}>
          <VStack spacing={cardSpacing} align="stretch">
          
          {/* Main Content */}
          {loading ? (
            <MinimalReportGrid loading={true} />
          ) : reportData ? (
            <Tabs
              index={activeTab}
              onChange={setActiveTab}
              variant="soft-rounded"
              colorScheme="blue"
              size="sm"
            >
              <Box 
                position="sticky" 
                top={0} 
                bg={bg} 
                zIndex={5} 
                pb={2}
                pt={2}
                borderBottom="1px solid"
                borderColor={borderColor}
              >
                <TabList>
                <Tab fontSize="sm">
                  <HStack spacing={1.5}>
                    <TrendingUp size={14} />
                    <Text>Overview</Text>
                  </HStack>
                </Tab>
                <Tab fontSize="sm">
                  <HStack spacing={1.5}>
                    <DollarSign size={14} />
                    <Text>Sales</Text>
                  </HStack>
                </Tab>
                <Tab fontSize="sm">
                  <HStack spacing={1.5}>
                    <ChefHat size={14} />
                    <Text>Kitchen</Text>
                  </HStack>
                </Tab>
                <Tab fontSize="sm">
                  <HStack spacing={1.5}>
                    <ShoppingCart size={14} />
                    <Text>Products</Text>
                  </HStack>
                </Tab>
                </TabList>
              </Box>
              
              <TabPanels>
                {/* Overview Tab */}
                <TabPanel px={0}>
                  <VStack spacing={cardSpacing} align="stretch">
                    {/* Key Metrics Grid using MinimalStatCard */}
                    <ReportSection title="Key Metrics" subtitle="Today's performance overview">
                      <MinimalReportGrid
                        stats={getStatsData().slice(0, 4)}
                        columns={{ base: 1, sm: 2, md: 2, lg: 4 }}
                        gap={2}
                      />
                    </ReportSection>
                    
                    {/* Secondary Metrics */}
                    <ReportSection title="Operations" subtitle="Current status">
                      <MinimalReportGrid
                        stats={getStatsData().slice(4, 8)}
                        columns={{ base: 1, sm: 2, md: 2, lg: 4 }}
                        gap={2}
                      />
                    </ReportSection>
                    
                    {/* Charts */}
                    <ChartContainer title="Revenue Trend">
                      <RevenueChart data={reportData} minimal={true} />
                    </ChartContainer>
                    
                    {/* Additional Analytics Cards */}
                    <Grid
                      templateColumns={{
                        base: '1fr',
                        lg: 'repeat(2, 1fr)',
                      }}
                      gap={2}
                    >
                      <GridItem>
                        <MinimalSalesCard data={reportData} showDetails={true} />
                      </GridItem>
                      <GridItem>
                        <MinimalProductCard data={reportData} showTopItems={5} />
                      </GridItem>
                    </Grid>
                  </VStack>
                </TabPanel>
                
                {/* Sales Tab */}
                <TabPanel px={0}>
                  <VStack spacing={cardSpacing} align="stretch">
                    <SalesReportCard data={reportData} detailed />
                    <PaymentAnalyticsCard data={reportData} />
                    <CustomerInsightsCard data={reportData} />
                  </VStack>
                </TabPanel>
                
                {/* Kitchen Tab */}
                <TabPanel px={0}>
                  <VStack spacing={cardSpacing} align="stretch">
                    <KitchenPerformanceCard data={reportData} />
                    <StaffPerformanceCard data={reportData} />
                  </VStack>
                </TabPanel>
                
                {/* Products Tab */}
                <TabPanel px={0}>
                  <ProductAnalyticsCard data={reportData} detailed />
                </TabPanel>
              </TabPanels>
            </Tabs>
          ) : (
            <Box
              p={8}
              bg={cardBg}
              borderRadius="lg"
              borderWidth="1px"
              borderColor={borderColor}
              textAlign="center"
            >
              <Icon as={AlertCircle} boxSize={8} color="gray.400" mb={3} />
              <Text fontSize="sm" fontWeight="600" color="gray.700" mb={1}>
                No Data Available
              </Text>
              <Text fontSize="xs" color="gray.500" mb={3}>
                Select a date range and filters to view reports
              </Text>
              <Button
                size="sm"
                colorScheme="blue"
                onClick={loadReportData}
                leftIcon={<RefreshCw size={14} />}
                fontSize="sm"
              >
                Load Reports
              </Button>
            </Box>
          )}
          </VStack>
        </Container>
      </Box>
    </Box>
  );
};


// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default EnhancedReportsSimple;