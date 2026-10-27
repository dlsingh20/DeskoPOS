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
  Skeleton,
  SkeletonText,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Divider,
  Badge,
  Tooltip,
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
  PieChart,
  Activity,
  Users,
  Package,
  Clock,
  FileText,
  Mail,
  Printer,
  ChevronDown,
  Settings,
  Eye,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Target,
  Award,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import ReportService from '../../services/ReportService';
import SalesReportCard from './cards/SalesReportCard';
import KitchenPerformanceCard from './cards/KitchenPerformanceCard';
import PaymentAnalyticsCard from './cards/PaymentAnalyticsCard';
import StaffPerformanceCard from './cards/StaffPerformanceCard';
import CustomerInsightsCard from './cards/CustomerInsightsCard';
import ProductAnalyticsCard from './cards/ProductAnalyticsCard';
import RevenueChart from './charts/RevenueChart';
import DateRangePicker from './filters/DateRangePicker';
import ReportFilters from './filters/ReportFilters';

/**
 * Enhanced Reports View with modern UI and comprehensive analytics
 */
const EnhancedReportsView = () => {
  const {
    state,
    loadOrders,
    loadKitchenStats,
    formatCurrency,
  } = usePOS();
  
  const toast = useToast();
  
  // Responsive values
  const isMobile = useBreakpointValue({ base: true, md: false });
  const containerPadding = useBreakpointValue({ base: 4, md: 6, lg: 8 });
  const cardSpacing = useBreakpointValue({ base: 4, md: 6 });
  const titleSize = useBreakpointValue({ base: '2xl', md: '3xl', lg: '4xl' });
  const subtitleSize = useBreakpointValue({ base: 'md', md: 'lg' });
  const tabSize = useBreakpointValue({ base: 'sm', md: 'md' });
  
  // Color schemes
  const bg = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  const accentColor = 'pos.500';
  
  // State management
  const [dateRange, setDateRange] = useState({
    startDate: new Date(),
    endDate: new Date(),
    preset: 'today'
  });
  
  const [filters, setFilters] = useState({
    restaurant: 'all',
    orderType: 'all',
    paymentStatus: 'all',
    staff: 'all'
  });
  
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [exportLoading, setExportLoading] = useState(false);
  
  // Auto-refresh interval
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  
  /**
   * Load comprehensive report data
   */
  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      // Format dates for API
      const startStr = dateRange.startDate.toISOString().split('T')[0];
      const endStr = dateRange.endDate.toISOString().split('T')[0];
      
      // Fetch all report data in parallel
      const [
        orders,
        kitchenStats,
        paymentSummary,
        prepTimes,
      ] = await Promise.all([
        loadOrders(),
        loadKitchenStats(),
        ReportService.getPaymentSummary(startStr, endStr).catch(() => null),
        ReportService.getPreparationTimes().catch(() => null),
      ]);
      
      // Process and aggregate data
      const processedData = processReportData(orders, {
        kitchenStats,
        paymentSummary,
        prepTimes,
        dateRange,
        filters
      });
      
      setReportData(processedData);
    } catch (error) {
      console.error('Failed to load report data:', error);
      toast({
        title: 'Failed to load reports',
        description: error.message || 'Please try again',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [dateRange, filters, loadOrders, loadKitchenStats, toast]);
  
  /**
   * Process raw data into report format
   */
  const processReportData = (orders, additionalData) => {
    if (!orders || !Array.isArray(orders)) {
      return null;
    }
    
    const { dateRange, filters } = additionalData;
    
    // Filter orders based on date range and filters
    let filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.order_time || order.created_at);
      return orderDate >= dateRange.startDate && orderDate <= dateRange.endDate;
    });
    
    // Apply additional filters
    if (filters.orderType !== 'all') {
      filteredOrders = filteredOrders.filter(o => o.type === filters.orderType);
    }
    if (filters.paymentStatus !== 'all') {
      filteredOrders = filteredOrders.filter(o => o.payment_status === filters.paymentStatus);
    }
    
    // Calculate metrics
    const totalRevenue = filteredOrders.reduce((sum, order) => 
      sum + parseFloat(order.total_amount || 0), 0
    );
    
    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    const completedOrders = filteredOrders.filter(o => 
      ['served', 'completed'].includes(o.status)
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
    
    // Payment method breakdown
    const paymentBreakdown = filteredOrders.reduce((acc, order) => {
      if (order.payments && Array.isArray(order.payments)) {
        order.payments.forEach(payment => {
          const method = payment.method || 'unknown';
          acc[method] = (acc[method] || 0) + parseFloat(payment.amount || 0);
        });
      }
      return acc;
    }, {});
    
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
    
    // Calculate trends (compare with previous period)
    const revenueTrend = calculateTrend(totalRevenue, 0); // TODO: Add previous period data
    const orderTrend = calculateTrend(totalOrders, 0);
    const avgOrderTrend = calculateTrend(averageOrderValue, 0);
    
    return {
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
        revenue: revenueTrend,
        orders: orderTrend,
        avgOrder: avgOrderTrend,
      },
      breakdown: {
        orderTypes: orderTypeBreakdown,
        hourlyDistribution,
        paymentMethods: paymentBreakdown,
        topItems,
      },
      kitchen: additionalData.kitchenStats,
      payments: additionalData.paymentSummary,
      prepTimes: additionalData.prepTimes,
    };
  };
  
  /**
   * Calculate trend percentage
   */
  const calculateTrend = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };
  
  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReportData();
    setRefreshing(false);
    
    toast({
      title: 'Reports refreshed',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  }, [loadReportData, toast]);
  
  /**
   * Handle export
   */
  const handleExport = async (format) => {
    setExportLoading(true);
    try {
      const startStr = dateRange.startDate.toISOString().split('T')[0];
      const endStr = dateRange.endDate.toISOString().split('T')[0];
      
      const response = await ReportService.exportReport(
        'comprehensive',
        format,
        startStr,
        endStr,
        filters
      );
      
      // Handle download
      if (format === 'pdf') {
        const blob = new Blob([response], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${startStr}_${endStr}.pdf`;
        a.click();
      } else {
        // Handle Excel/CSV
        const blob = new Blob([JSON.stringify(response)], { 
          type: format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv' 
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${startStr}_${endStr}.${format === 'excel' ? 'xlsx' : 'csv'}`;
        a.click();
      }
      
      toast({
        title: 'Report exported',
        description: `Report exported as ${format.toUpperCase()}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error.message || 'Failed to export report',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setExportLoading(false);
    }
  };
  
  // Load data on mount and when dependencies change
  useEffect(() => {
    loadReportData();
  }, [dateRange, filters]); // loadReportData is intentionally not included
  
  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      handleRefresh();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, handleRefresh]);
  
  /**
   * Render loading skeleton
   */
  const renderSkeleton = () => (
    <VStack spacing={cardSpacing} align="stretch">
      <Grid templateColumns={{ base: '1fr', lg: 'repeat(4, 1fr)' }} gap={cardSpacing}>
        {[1, 2, 3, 4].map(i => (
          <Box key={i} p={6} bg={cardBg} borderRadius="xl" borderWidth="1px" borderColor={borderColor}>
            <Skeleton height="20px" width="60%" mb={3} />
            <SkeletonText noOfLines={3} spacing={2} />
          </Box>
        ))}
      </Grid>
      <Box p={6} bg={cardBg} borderRadius="xl" borderWidth="1px" borderColor={borderColor}>
        <Skeleton height="300px" />
      </Box>
    </VStack>
  );
  
  return (
    <Box minH="100vh" bg={bg}>
      <Container maxW="container.2xl" py={containerPadding}>
        <VStack spacing={cardSpacing} align="stretch">
          {/* Header Section */}
          <Flex
            direction={{ base: 'column', lg: 'row' }}
            justify="space-between"
            align={{ base: 'stretch', lg: 'center' }}
            gap={4}
          >
            <Box>
              <HStack spacing={3} mb={2}>
                <Icon as={BarChart2} boxSize={8} color={accentColor} />
                <Text
                  fontSize={titleSize}
                  fontWeight="bold"
                  bgGradient="linear(to-r, pos.400, pos.600)"
                  bgClip="text"
                >
                  Analytics Dashboard
                </Text>
              </HStack>
              <Text fontSize={subtitleSize} color={mutedColor}>
                Comprehensive insights and performance metrics
              </Text>
            </Box>
            
            <HStack spacing={3} flexWrap="wrap">
              {/* Date Range Picker */}
              <DateRangePicker
                dateRange={dateRange}
                onChange={setDateRange}
              />
              
              {/* Filters */}
              <ReportFilters
                filters={filters}
                onChange={setFilters}
              />
              
              {/* Auto Refresh Toggle */}
              <Tooltip label={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}>
                <IconButton
                  icon={<RefreshCw />}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  colorScheme={autoRefresh ? 'green' : 'gray'}
                  variant={autoRefresh ? 'solid' : 'outline'}
                  size="md"
                />
              </Tooltip>
              
              {/* Manual Refresh */}
              <IconButton
                icon={<RefreshCw />}
                onClick={handleRefresh}
                isLoading={refreshing}
                colorScheme="pos"
                variant="ghost"
                size="md"
              />
              
              {/* Export Menu */}
              <Menu>
                <MenuButton
                  as={Button}
                  rightIcon={<ChevronDown />}
                  leftIcon={<Download />}
                  colorScheme="pos"
                  variant="outline"
                  size="md"
                  isLoading={exportLoading}
                >
                  Export
                </MenuButton>
                <MenuList>
                  <MenuItem icon={<FileText />} onClick={() => handleExport('pdf')}>
                    Export as PDF
                  </MenuItem>
                  <MenuItem icon={<FileText />} onClick={() => handleExport('excel')}>
                    Export as Excel
                  </MenuItem>
                  <MenuItem icon={<FileText />} onClick={() => handleExport('csv')}>
                    Export as CSV
                  </MenuItem>
                  <Divider />
                  <MenuItem icon={<Mail />}>
                    Email Report
                  </MenuItem>
                  <MenuItem icon={<Printer />}>
                    Print Report
                  </MenuItem>
                </MenuList>
              </Menu>
              
              {/* Settings */}
              <IconButton
                icon={<Settings />}
                variant="ghost"
                size="md"
              />
            </HStack>
          </Flex>
          
          {/* Main Content */}
          {loading ? (
            renderSkeleton()
          ) : reportData ? (
            <Tabs
              index={activeTab}
              onChange={setActiveTab}
              variant="soft-rounded"
              colorScheme="pos"
            >
              <TabList
                overflowX="auto"
                overflowY="hidden"
                whiteSpace="nowrap"
                pb={2}
                css={{
                  '&::-webkit-scrollbar': {
                    height: '4px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: 'transparent',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: borderColor,
                    borderRadius: '4px',
                  },
                }}
              >
                <Tab size={tabSize}>
                  <HStack spacing={2}>
                    <TrendingUp size={16} />
                    <Text>Overview</Text>
                  </HStack>
                </Tab>
                <Tab size={tabSize}>
                  <HStack spacing={2}>
                    <DollarSign size={16} />
                    <Text>Sales</Text>
                  </HStack>
                </Tab>
                <Tab size={tabSize}>
                  <HStack spacing={2}>
                    <ChefHat size={16} />
                    <Text>Kitchen</Text>
                  </HStack>
                </Tab>
                <Tab size={tabSize}>
                  <HStack spacing={2}>
                    <Activity size={16} />
                    <Text>Payments</Text>
                  </HStack>
                </Tab>
                <Tab size={tabSize}>
                  <HStack spacing={2}>
                    <Users size={16} />
                    <Text>Staff</Text>
                  </HStack>
                </Tab>
                <Tab size={tabSize}>
                  <HStack spacing={2}>
                    <Package size={16} />
                    <Text>Products</Text>
                  </HStack>
                </Tab>
                <Tab size={tabSize}>
                  <HStack spacing={2}>
                    <Users size={16} />
                    <Text>Customers</Text>
                  </HStack>
                </Tab>
              </TabList>
              
              <TabPanels>
                {/* Overview Tab */}
                <TabPanel px={0}>
                  <VStack spacing={cardSpacing} align="stretch">
                    {/* Key Metrics Grid */}
                    <Grid
                      templateColumns={{
                        base: '1fr',
                        md: 'repeat(2, 1fr)',
                        lg: 'repeat(4, 1fr)',
                      }}
                      gap={cardSpacing}
                    >
                      <MetricCard
                        title="Total Revenue"
                        value={formatCurrency(reportData.summary.totalRevenue)}
                        trend={reportData.trends.revenue}
                        icon={DollarSign}
                        color="green"
                      />
                      <MetricCard
                        title="Total Orders"
                        value={reportData.summary.totalOrders}
                        trend={reportData.trends.orders}
                        icon={ShoppingCart}
                        color="blue"
                      />
                      <MetricCard
                        title="Average Order"
                        value={formatCurrency(reportData.summary.averageOrderValue)}
                        trend={reportData.trends.avgOrder}
                        icon={TrendingUp}
                        color="purple"
                      />
                      <MetricCard
                        title="Completion Rate"
                        value={`${reportData.summary.completionRate.toFixed(1)}%`}
                        trend={0}
                        icon={CheckCircle}
                        color="orange"
                      />
                    </Grid>
                    
                    {/* Revenue Chart */}
                    <RevenueChart data={reportData} />
                    
                    {/* Report Cards Grid */}
                    <Grid
                      templateColumns={{
                        base: '1fr',
                        lg: 'repeat(2, 1fr)',
                      }}
                      gap={cardSpacing}
                    >
                      <SalesReportCard data={reportData} />
                      <ProductAnalyticsCard data={reportData} />
                    </Grid>
                  </VStack>
                </TabPanel>
                
                {/* Sales Tab */}
                <TabPanel px={0}>
                  <SalesReportCard data={reportData} detailed />
                </TabPanel>
                
                {/* Kitchen Tab */}
                <TabPanel px={0}>
                  <KitchenPerformanceCard data={reportData} />
                </TabPanel>
                
                {/* Payments Tab */}
                <TabPanel px={0}>
                  <PaymentAnalyticsCard data={reportData} />
                </TabPanel>
                
                {/* Staff Tab */}
                <TabPanel px={0}>
                  <StaffPerformanceCard data={reportData} />
                </TabPanel>
                
                {/* Products Tab */}
                <TabPanel px={0}>
                  <ProductAnalyticsCard data={reportData} detailed />
                </TabPanel>
                
                {/* Customers Tab */}
                <TabPanel px={0}>
                  <CustomerInsightsCard data={reportData} />
                </TabPanel>
              </TabPanels>
            </Tabs>
          ) : (
            <Box
              p={12}
              bg={cardBg}
              borderRadius="xl"
              borderWidth="1px"
              borderColor={borderColor}
              textAlign="center"
            >
              <Icon as={AlertCircle} boxSize={12} color={mutedColor} mb={4} />
              <Text fontSize="lg" color={textColor} mb={2}>
                No Data Available
              </Text>
              <Text color={mutedColor}>
                Select a date range and filters to view reports
              </Text>
              <Button
                mt={4}
                colorScheme="pos"
                onClick={loadReportData}
                leftIcon={<RefreshCw />}
              >
                Load Reports
              </Button>
            </Box>
          )}
        </VStack>
      </Container>
    </Box>
  );
};

/**
 * Metric Card Component
 */
const MetricCard = ({ title, value, trend, icon: IconComponent, color }) => {
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const trendColor = trend > 0 ? 'green' : trend < 0 ? 'red' : 'gray';
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Activity;
  
  return (
    <Box
      p={6}
      bg={bg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      position="relative"
      overflow="hidden"
      transition="all 0.3s"
      _hover={{
        transform: 'translateY(-2px)',
        boxShadow: 'lg',
      }}
    >
      <Box
        position="absolute"
        top={0}
        right={0}
        w="100px"
        h="100px"
        bg={`${color}.100`}
        borderRadius="full"
        transform="translate(30px, -30px)"
        opacity={0.3}
      />
      
      <VStack align="stretch" spacing={3} position="relative">
        <HStack justify="space-between">
          <Icon as={IconComponent} boxSize={6} color={`${color}.500`} />
          {trend !== 0 && (
            <HStack spacing={1}>
              <Icon as={TrendIcon} boxSize={4} color={`${trendColor}.500`} />
              <Text fontSize="sm" color={`${trendColor}.500`} fontWeight="bold">
                {Math.abs(trend).toFixed(1)}%
              </Text>
            </HStack>
          )}
        </HStack>
        
        <Box>
          <Text fontSize="sm" color="gray.500" mb={1}>
            {title}
          </Text>
          <Text fontSize="2xl" fontWeight="bold" color={`${color}.600`}>
            {value}
          </Text>
        </Box>
      </VStack>
    </Box>
  );
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default EnhancedReportsView;