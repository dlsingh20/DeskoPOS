import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardBody,
  CardHeader,
  Text,
  Badge,
  VStack,
  HStack,
  Button,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  Container,
  Icon,
  Flex,
  Select,
  Stat,
  StatLabel,
  StatNumber,
  Progress,
} from '@chakra-ui/react';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  ChefHat,
  Download,
  RefreshCw
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * Reports and Analytics Dashboard Component
 * Displays key metrics and reports for restaurant operations
 */
const ReportsView = () => {
  const {
    state,
    loadOrders,
    loadKitchenStats,
    formatCurrency,
  } = usePOS();

  const [timeRange, setTimeRange] = useState('today');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Calculate metrics from order data
  const calculateMetrics = () => {
    if (!state.orders) {
      setReportData(null);
      return;
    }

    const now = new Date();
    let filteredOrders = state.orders;

    // Filter by time range
    switch (timeRange) {
      case 'today':
        filteredOrders = state.orders.filter(order => {
          const orderDate = new Date(order.order_time);
          return orderDate.toDateString() === now.toDateString();
        });
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredOrders = state.orders.filter(order => {
          const orderDate = new Date(order.order_time);
          return orderDate >= weekAgo;
        });
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredOrders = state.orders.filter(order => {
          const orderDate = new Date(order.order_time);
          return orderDate >= monthAgo;
        });
        break;
      default:
        break;
    }

    // Calculate metrics
    const totalRevenue = filteredOrders.reduce((sum, order) => 
      sum + parseFloat(order.total_amount || 0), 0
    );

    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const completedOrders = filteredOrders.filter(order => 
      order.status === 'served'
    ).length;

    const pendingOrders = filteredOrders.filter(order => 
      ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)
    ).length;

    // Order type breakdown
    const orderTypes = filteredOrders.reduce((acc, order) => {
      const type = order.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    // Hourly distribution
    const hourlyDistribution = filteredOrders.reduce((acc, order) => {
      const hour = new Date(order.order_time).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    // Popular items
    const itemFrequency = {};
    filteredOrders.forEach(order => {
      if (order.items) {
        order.items.forEach(item => {
          const name = item.menu_item_name;
          itemFrequency[name] = (itemFrequency[name] || 0) + item.quantity;
        });
      }
    });

    const popularItems = Object.entries(itemFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    setReportData({
      totalRevenue,
      totalOrders,
      averageOrderValue,
      completedOrders,
      pendingOrders,
      orderTypes,
      hourlyDistribution,
      popularItems,
      completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0
    });
  };

  // Load data when timeRange changes
  useEffect(() => {
    const loadReportData = async () => {
      setLoading(true);
      try {
        await Promise.all([loadOrders(), loadKitchenStats()]);
      } catch (error) {
        console.error('Failed to load report data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadReportData();
  }, [timeRange, loadOrders, loadKitchenStats]);

  // Calculate metrics when orders or timeRange changes
  useEffect(() => {
    if (state.orders) {
      calculateMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.orders, timeRange]); // calculateMetrics not included to prevent infinite loop

  // Get period label
  const getPeriodLabel = () => {
    switch (timeRange) {
      case 'today': return "Today's";
      case 'week': return "This Week's";
      case 'month': return "This Month's";
      default: return "Period";
    }
  };

  // Format currency - using POS context formatCurrency helper
  // Local variable renamed to avoid naming conflict with POS context function
  const formatCurrencyLocal = formatCurrency;

  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack spacing={4}>
          <Spinner size="xl" color="pos.500" />
          <Text color="gray.600" fontSize="lg">Loading reports...</Text>
        </VStack>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        {/* Header */}
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
          <Box>
            <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" color="pos.600" mb={2}>
              Reports & Analytics
            </Text>
            <Text color="gray.600" fontSize="lg">
              {getPeriodLabel()} Performance Overview
            </Text>
          </Box>

          <HStack spacing={3}>
            <Select
              size="md"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              w="180px"
              borderRadius="lg"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </Select>
            
            <Button
              size="md"
              colorScheme="pos"
              leftIcon={<Icon as={RefreshCw} boxSize={4} />}
              onClick={() => {
                loadOrders();
                loadKitchenStats();
                calculateMetrics();
              }}
              borderRadius="lg"
            >
              Refresh
            </Button>
            
            <Button
              size="md"
              variant="outline"
              colorScheme="pos"
              leftIcon={<Icon as={Download} boxSize={4} />}
              borderRadius="lg"
            >
              Export
            </Button>
          </HStack>
        </Flex>

        {!reportData ? (
          <Alert status="info" borderRadius="xl" p={6}>
            <AlertIcon boxSize={6} />
            <Box>
              <AlertTitle fontSize="lg">No Data Available</AlertTitle>
              <Text fontSize="md" mt={2}>No orders found for the selected time period.</Text>
            </Box>
          </Alert>
        ) : (
          <>
            {/* Key Metrics */}
            <Grid
              templateColumns={{
                base: '1fr',
                md: 'repeat(2, 1fr)',
                lg: 'repeat(4, 1fr)',
              }}
              gap={6}
            >
              {/* Total Revenue */}
              <Card variant="professionalTableAvailable">
                <CardBody p={6}>
                  <VStack align="start" spacing={3}>
                    <HStack spacing={2}>
                      <Icon as={DollarSign} boxSize={5} color="green.500" />
                      <Text fontSize="sm" color="gray.600" fontWeight="medium">
                        Total Revenue
                      </Text>
                    </HStack>
                    <Text fontSize="2xl" fontWeight="bold" color="green.600">
                      {formatCurrencyLocal(reportData.totalRevenue)}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {reportData.totalOrders} orders
                    </Text>
                  </VStack>
                </CardBody>
              </Card>

              {/* Total Orders */}
              <Card variant="professionalTableAvailable">
                <CardBody p={6}>
                  <VStack align="start" spacing={3}>
                    <HStack spacing={2}>
                      <Icon as={ShoppingCart} boxSize={5} color="blue.500" />
                      <Text fontSize="sm" color="gray.600" fontWeight="medium">
                        Total Orders
                      </Text>
                    </HStack>
                    <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                      {reportData.totalOrders}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {reportData.completedOrders} completed
                    </Text>
                  </VStack>
                </CardBody>
              </Card>

              {/* Average Order Value */}
              <Card variant="professionalTableAvailable">
                <CardBody p={6}>
                  <VStack align="start" spacing={3}>
                    <HStack spacing={2}>
                      <Icon as={TrendingUp} boxSize={5} color="purple.500" />
                      <Text fontSize="sm" color="gray.600" fontWeight="medium">
                        Avg Order Value
                      </Text>
                    </HStack>
                    <Text fontSize="2xl" fontWeight="bold" color="purple.600">
                      {formatCurrencyLocal(reportData.averageOrderValue)}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      Per order
                    </Text>
                  </VStack>
                </CardBody>
              </Card>

              {/* Completion Rate */}
              <Card variant="professionalTableAvailable">
                <CardBody p={6}>
                  <VStack align="start" spacing={3}>
                    <HStack spacing={2}>
                      <Icon as={ChefHat} boxSize={5} color="orange.500" />
                      <Text fontSize="sm" color="gray.600" fontWeight="medium">
                        Completion Rate
                      </Text>
                    </HStack>
                    <Text fontSize="2xl" fontWeight="bold" color="orange.600">
                      {reportData.completionRate.toFixed(1)}%
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {reportData.pendingOrders} pending
                    </Text>
                  </VStack>
                </CardBody>
              </Card>
            </Grid>

            {/* Detailed Analytics */}
            <Grid
              templateColumns={{
                base: '1fr',
                lg: 'repeat(2, 1fr)',
              }}
              gap={6}
            >
              {/* Order Types Breakdown */}
              <Card variant="professionalTableAvailable">
                <CardHeader>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    Order Types
                  </Text>
                </CardHeader>
                <CardBody>
                  <VStack align="stretch" spacing={3}>
                    {Object.entries(reportData.orderTypes).map(([type, count]) => {
                      const percentage = (count / reportData.totalOrders) * 100;
                      const typeLabel = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                      
                      return (
                        <Box key={type}>
                          <Flex justify="space-between" mb={1}>
                            <Text fontSize="sm" fontWeight="medium">
                              {typeLabel}
                            </Text>
                            <Text fontSize="sm" color="gray.600">
                              {count} ({percentage.toFixed(1)}%)
                            </Text>
                          </Flex>
                          <Progress
                            value={percentage}
                            size="sm"
                            colorScheme="pos"
                            borderRadius="md"
                          />
                        </Box>
                      );
                    })}
                  </VStack>
                </CardBody>
              </Card>

              {/* Popular Items */}
              <Card variant="professionalTableAvailable">
                <CardHeader>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    Top Selling Items
                  </Text>
                </CardHeader>
                <CardBody>
                  <VStack align="stretch" spacing={3}>
                    {reportData.popularItems.map(([item, count], index) => (
                      <Flex key={item} justify="space-between" align="center">
                        <HStack spacing={3}>
                          <Badge
                            colorScheme="pos"
                            variant="solid"
                            borderRadius="full"
                            px={2}
                          >
                            {index + 1}
                          </Badge>
                          <Text fontSize="sm" fontWeight="medium">
                            {item}
                          </Text>
                        </HStack>
                        <Badge colorScheme="gray" variant="subtle">
                          {count} sold
                        </Badge>
                      </Flex>
                    ))}
                    
                    {reportData.popularItems.length === 0 && (
                      <Text fontSize="sm" color="gray.500" textAlign="center">
                        No items data available
                      </Text>
                    )}
                  </VStack>
                </CardBody>
              </Card>
            </Grid>

            {/* Kitchen Performance */}
            {state.kitchenStats && (
              <Card variant="professionalTableAvailable">
                <CardHeader>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    Kitchen Performance
                  </Text>
                </CardHeader>
                <CardBody>
                  <Grid templateColumns={{ base: '1fr', md: 'repeat(4, 1fr)' }} gap={4}>
                    <Stat textAlign="center">
                      <StatLabel>Pending</StatLabel>
                      <StatNumber color="yellow.600">
                        {state.kitchenStats.pending_orders || 0}
                      </StatNumber>
                    </Stat>
                    <Stat textAlign="center">
                      <StatLabel>Preparing</StatLabel>
                      <StatNumber color="orange.600">
                        {state.kitchenStats.preparing_orders || 0}
                      </StatNumber>
                    </Stat>
                    <Stat textAlign="center">
                      <StatLabel>Ready</StatLabel>
                      <StatNumber color="green.600">
                        {state.kitchenStats.ready_orders || 0}
                      </StatNumber>
                    </Stat>
                    <Stat textAlign="center">
                      <StatLabel>Avg Prep Time</StatLabel>
                      <StatNumber color="blue.600">
                        {state.kitchenStats.average_prep_time || 0}m
                      </StatNumber>
                    </Stat>
                  </Grid>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </VStack>
    </Container>
  );
};

export default ReportsView;