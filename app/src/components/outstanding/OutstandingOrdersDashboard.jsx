import React, { useState, useEffect, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Grid,
  Card,
  CardBody,
  Icon,
  useToast,
  Spinner,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Flex,
  Container,
} from '@chakra-ui/react';
import {
  Clock,
  DollarSign,
  Calendar,
  Search,
  TrendingUp,
  CheckCircle,
  HandHeart,
} from 'lucide-react';
import ApiClient from '../../services/ApiClient';
import OutstandingOrderCard from './OutstandingOrderCard';
import OutstandingOrderModal from './OutstandingOrderModal';
import QuickPaymentModal from './QuickPaymentModal';

/**
 * Outstanding Orders Dashboard Component
 * Manages and displays unpaid orders after service
 */
const OutstandingOrdersDashboard = () => {
  const toast = useToast();
  const { formatPrice } = usePOS();

  // State management
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [outstandingOrders, setOutstandingOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [quickPaymentOrder, setQuickPaymentOrder] = useState(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [activeTab, setActiveTab] = useState(0);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // Load stats and outstanding orders in parallel
      const [statsResponse, ordersResponse] = await Promise.all([
        ApiClient.get('/api/pos/api/outstanding-orders/dashboard_stats/'),
        ApiClient.get('/api/pos/api/outstanding-orders/')
      ]);

      setStats(statsResponse.data);
      setOutstandingOrders(ordersResponse.data.results || ordersResponse.data || []);
      
    } catch (error) {
      console.error('Failed to load outstanding orders:', error);
      toast({
        title: 'Error Loading Data',
        description: 'Failed to load outstanding orders data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const applyFilters = useCallback(() => {
    let filtered = [...outstandingOrders];

    // Tab-based filtering
    switch (activeTab) {
      case 0: // All
        break;
      case 1: // Pending
        filtered = filtered.filter(order => order.status === 'pending');
        break;
      case 2: // Overdue
        filtered = filtered.filter(order => order.is_overdue);
        break;
      case 3: // High Priority
        filtered = filtered.filter(order => 
          order.priority === 'high' || order.priority === 'urgent'
        );
        break;
      case 4: // Resolved
        filtered = filtered.filter(order => order.is_resolved);
        break;
      default:
        break;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.customer_name.toLowerCase().includes(query) ||
        order.order_number.toLowerCase().includes(query) ||
        order.customer_phone.toLowerCase().includes(query) ||
        order.room_number.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(order => order.priority === priorityFilter);
    }

    setFilteredOrders(filtered);
  }, [outstandingOrders, searchQuery, statusFilter, priorityFilter, activeTab]);

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Filter orders when search/filter changes
  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleOrderSelect = (order) => {
    setSelectedOrder(order);
    setShowModal(true);
  };

  const handleQuickPayment = (order) => {
    setQuickPaymentOrder(order);
    setShowQuickPayment(true);
  };

  const handleOrderUpdate = () => {
    // Refresh data when order is updated
    loadDashboardData();
    setShowModal(false);
    setSelectedOrder(null);
  };

  const handlePaymentComplete = () => {
    // Refresh data when payment is collected
    loadDashboardData();
    setShowQuickPayment(false);
    setQuickPaymentOrder(null);
  };



  if (loading && !stats) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack spacing={6}>
          <Spinner size="xl" color="pos.500" thickness="4px" />
          <Text color="gray.600" fontSize="lg" fontWeight="medium">
            Loading payment dashboard...
          </Text>
        </VStack>
      </Container>
    );
  }

  return (
    <>
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        {/* Header */}
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
          <Box>
            <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" color="pos.600" mb={2}>
              Customer Payments
            </Text>
            <Text color="gray.600" fontSize="lg">
              Quick payment collection for served orders
            </Text>
          </Box>
          <Button
            leftIcon={<Icon as={TrendingUp} boxSize={4} />}
            colorScheme="pos"
            size="md"
            onClick={loadDashboardData}
            isLoading={loading}
            borderRadius="lg"
          >
            Refresh Data
          </Button>
        </Flex>

        {/* Stats */}
        {stats && (
          <Grid templateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap={6}>
            <Card variant="professionalTableAvailable">
              <CardBody p={6}>
                <VStack align="start" spacing={3}>
                  <HStack spacing={2}>
                    <Icon as={HandHeart} color="teal.500" boxSize={5} />
                    <Text fontSize="sm" color="gray.600" fontWeight="medium">
                      Pending Payments
                    </Text>
                  </HStack>
                  <Text fontSize="3xl" fontWeight="bold" color="pos.600">
                    {stats.total_outstanding || 0}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Orders awaiting payment
                  </Text>
                </VStack>
              </CardBody>
            </Card>

            <Card variant="professionalTableAvailable">
              <CardBody p={6}>
                <VStack align="start" spacing={3}>
                  <HStack spacing={2}>
                    <Icon as={DollarSign} color="green.500" boxSize={5} />
                    <Text fontSize="sm" color="gray.600" fontWeight="medium">
                      Total Amount
                    </Text>
                  </HStack>
                  <Text fontSize="3xl" fontWeight="bold" color="green.600">
                    {formatPrice(parseFloat(stats.total_amount) || 0)}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Amount to collect
                  </Text>
                </VStack>
              </CardBody>
            </Card>

            <Card variant="professionalTableAvailable">
              <CardBody p={6}>
                <VStack align="start" spacing={3}>
                  <HStack spacing={2}>
                    <Icon as={Clock} color="orange.500" boxSize={5} />
                    <Text fontSize="sm" color="gray.600" fontWeight="medium">
                      Follow-up Needed
                    </Text>
                  </HStack>
                  <Text fontSize="3xl" fontWeight="bold" color="orange.600">
                    {stats.overdue_count || 0}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Needs gentle reminder
                  </Text>
                </VStack>
              </CardBody>
            </Card>

            <Card variant="professionalTableAvailable">
              <CardBody p={6}>
                <VStack align="start" spacing={3}>
                  <HStack spacing={2}>
                    <Icon as={Calendar} color="blue.500" boxSize={5} />
                    <Text fontSize="sm" color="gray.600" fontWeight="medium">
                      Average Age
                    </Text>
                  </HStack>
                  <Text fontSize="3xl" fontWeight="bold" color="blue.600">
                    {stats.avg_age_days || 0}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Days outstanding
                  </Text>
                </VStack>
              </CardBody>
            </Card>
          </Grid>
        )}

        {/* Search and Filters */}
        <Card variant="professionalTableAvailable">
          <CardBody p={6}>
            <VStack spacing={4}>
              <InputGroup>
                <InputLeftElement>
                  <Icon as={Search} color="gray.400" boxSize={4} />
                </InputLeftElement>
                <Input
                  placeholder="Search by customer, order, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  fontSize="md"
                  borderRadius="lg"
                />
              </InputGroup>

              <HStack spacing={4} wrap="wrap" w="full">
                <VStack spacing={1} align="start">
                  <Text fontSize="xs" fontWeight="medium" color="gray.500">Status</Text>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    size="sm"
                    minW="150px"
                    borderRadius="lg"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="contacted">Contacted</option>
                    <option value="payment_promised">Payment Promised</option>
                    <option value="resolved">Resolved</option>
                    <option value="written_off">Written Off</option>
                  </Select>
                </VStack>

                <VStack spacing={1} align="start">
                  <Text fontSize="xs" fontWeight="medium" color="gray.500">Priority</Text>
                  <Select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    size="sm"
                    minW="150px"
                    borderRadius="lg"
                  >
                    <option value="all">All Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                </VStack>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Tabs */}
        <Tabs index={activeTab} onChange={setActiveTab}>
          <TabList border="none" gap={2}>
            <Tab 
              fontSize="md" 
              fontWeight="medium" 
              px={4}
              py={2}
              borderRadius="lg"
              border="1px solid"
              borderColor="gray.200"
              _selected={{ 
                bg: 'pos.500', 
                color: 'white',
                borderColor: 'pos.500'
              }}
              _hover={{ borderColor: 'pos.300' }}
              transition="all 0.2s"
            >
              All ({outstandingOrders.length})
            </Tab>
            <Tab 
              fontSize="md" 
              fontWeight="medium" 
              px={4}
              py={2}
              borderRadius="lg"
              border="1px solid"
              borderColor="gray.200"
              _selected={{ 
                bg: 'pos.500', 
                color: 'white',
                borderColor: 'pos.500'
              }}
              _hover={{ borderColor: 'pos.300' }}
              transition="all 0.2s"
            >
              Pending ({outstandingOrders.filter(o => o.status === 'pending').length})
            </Tab>
            <Tab 
              fontSize="md" 
              fontWeight="medium" 
              px={4}
              py={2}
              borderRadius="lg"
              border="1px solid"
              borderColor="gray.200"
              _selected={{ 
                bg: 'pos.500', 
                color: 'white',
                borderColor: 'pos.500'
              }}
              _hover={{ borderColor: 'pos.300' }}
              transition="all 0.2s"
            >
              Follow-up ({outstandingOrders.filter(o => o.is_overdue).length})
            </Tab>
            <Tab 
              fontSize="md" 
              fontWeight="medium" 
              px={4}
              py={2}
              borderRadius="lg"
              border="1px solid"
              borderColor="gray.200"
              _selected={{ 
                bg: 'pos.500', 
                color: 'white',
                borderColor: 'pos.500'
              }}
              _hover={{ borderColor: 'pos.300' }}
              transition="all 0.2s"
            >
              Priority ({outstandingOrders.filter(o => 
                o.priority === 'high' || o.priority === 'urgent'
              ).length})
            </Tab>
            <Tab 
              fontSize="md" 
              fontWeight="medium" 
              px={4}
              py={2}
              borderRadius="lg"
              border="1px solid"
              borderColor="gray.200"
              _selected={{ 
                bg: 'pos.500', 
                color: 'white',
                borderColor: 'pos.500'
              }}
              _hover={{ borderColor: 'pos.300' }}
              transition="all 0.2s"
            >
              Collected ({outstandingOrders.filter(o => o.is_resolved).length})
            </Tab>
          </TabList>

          <TabPanels mt={6}>
            <TabPanel px={0} py={0}>
              <OutstandingOrdersList 
                orders={filteredOrders}
                onOrderSelect={handleOrderSelect}
                onQuickPayment={handleQuickPayment}
                loading={loading}
              />
            </TabPanel>
            <TabPanel px={0} py={0}>
              <OutstandingOrdersList 
                orders={filteredOrders}
                onOrderSelect={handleOrderSelect}
                onQuickPayment={handleQuickPayment}
                loading={loading}
              />
            </TabPanel>
            <TabPanel px={0} py={0}>
              <OutstandingOrdersList 
                orders={filteredOrders}
                onOrderSelect={handleOrderSelect}
                onQuickPayment={handleQuickPayment}
                loading={loading}
              />
            </TabPanel>
            <TabPanel px={0} py={0}>
              <OutstandingOrdersList 
                orders={filteredOrders}
                onOrderSelect={handleOrderSelect}
                onQuickPayment={handleQuickPayment}
                loading={loading}
              />
            </TabPanel>
            <TabPanel px={0} py={0}>
              <OutstandingOrdersList 
                orders={filteredOrders}
                onOrderSelect={handleOrderSelect}
                onQuickPayment={handleQuickPayment}
                loading={loading}
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </VStack>
    </Container>

      {/* Outstanding Order Modal */}
      {selectedOrder && (
        <OutstandingOrderModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          order={selectedOrder}
          onUpdate={handleOrderUpdate}
        />
      )}
      
      {/* Quick Payment Modal */}
      {quickPaymentOrder && (
        <QuickPaymentModal
          isOpen={showQuickPayment}
          onClose={() => setShowQuickPayment(false)}
          order={quickPaymentOrder}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </>
  );
};

// Outstanding Orders List Component - Optimized
const OutstandingOrdersList = ({ orders, onOrderSelect, onQuickPayment, loading }) => {
  if (loading) {
    return (
      <VStack spacing={6} py={16}>
        <Spinner size="xl" color="pos.500" thickness="4px" />
        <Text fontSize="lg" color="gray.600" fontWeight="medium">
          Loading payment records...
        </Text>
      </VStack>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Card variant="professionalTableAvailable">
        <CardBody p={12} textAlign="center">
          <VStack spacing={4}>
            <Icon as={CheckCircle} boxSize={12} color="green.400" />
            <Text fontWeight="bold" fontSize="xl" color="green.600">
              All caught up!
            </Text>
            <Text fontSize="lg" color="gray.600">
              No pending payments match your current filters.
            </Text>
          </VStack>
        </CardBody>
      </Card>
    );
  }

  return (
    <Grid 
      templateColumns={{
        base: '1fr',
        lg: 'repeat(2, 1fr)',
        xl: 'repeat(3, 1fr)',
      }} 
      gap={6}
    >
      {orders.map((order) => (
        <OutstandingOrderCard
          key={order.id}
          order={order}
          onClick={() => onOrderSelect(order)}
          onQuickPayment={onQuickPayment}
        />
      ))}
    </Grid>
  );
};

export default OutstandingOrdersDashboard;