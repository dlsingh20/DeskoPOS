import React from 'react';
import { usePOS } from '../../../context/POSContext';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Avatar,
  useColorModeValue,
  Divider,
  Grid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from '@chakra-ui/react';
import { Users, UtensilsCrossed, Home, ShoppingBag, Repeat2, TrendingUp } from 'lucide-react';

const ORDER_TYPE_LABELS = {
  dine_in: 'Dine-in',
  room_service: 'Room Service',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

/**
 * Derive only what's actually available from the real orders for this
 * period. The orders list endpoint gives us `type`, `customer_name` and
 * `room_number` per order - no unique guest ID, no true "new vs returning"
 * history, and no VIP flag - so those are not fabricated here.
 */
const processCustomerData = (data) => {
  const orders = data.orders || [];
  const totalOrders = orders.length;

  const typeCounts = orders.reduce((acc, order) => {
    const type = order.type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // Group by customer_name where it was actually captured on the order.
  // This is a name-based approximation (not a unique guest ID), so we
  // label it clearly rather than calling it a verified "customer" count.
  const byName = new Map();
  orders.forEach((order) => {
    const name = (order.customer_name || '').trim();
    if (!name) return;
    if (!byName.has(name)) {
      byName.set(name, { name, orders: 0, totalSpent: 0 });
    }
    const entry = byName.get(name);
    entry.orders += 1;
    entry.totalSpent += parseFloat(order.total_amount || 0);
  });

  const namedCustomers = Array.from(byName.values()).sort((a, b) => b.orders - a.orders);
  const repeatNamedCustomers = namedCustomers.filter((c) => c.orders > 1).length;
  const namedOrderCount = orders.filter((o) => (o.customer_name || '').trim()).length;

  return {
    totalOrders,
    typeCounts,
    topCustomers: namedCustomers.slice(0, 5),
    namedOrderCount,
    repeatNamedCustomers,
    avgOrderValue: data.summary?.averageOrderValue || 0,
  };
};

const CustomerInsightsCard = ({ data }) => {
  const { formatPrice } = usePOS();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');

  if (!data) return null;

  const insights = processCustomerData(data);
  const orderTypeStats = ['dine_in', 'room_service', 'takeaway'].map((type) => ({
    type,
    label: ORDER_TYPE_LABELS[type],
    count: insights.typeCounts[type] || 0,
  }));
  const orderTypeIcons = {
    dine_in: UtensilsCrossed,
    room_service: Home,
    takeaway: ShoppingBag,
  };
  const orderTypeColors = {
    dine_in: 'blue.500',
    room_service: 'purple.500',
    takeaway: 'orange.500',
  };

  return (
    <Box
      bg={bg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      p={6}
      boxShadow="sm"
      transition="all 0.3s"
      _hover={{
        boxShadow: 'lg',
        transform: 'translateY(-2px)',
      }}
    >
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between">
          <HStack spacing={2}>
            <Icon as={Users} boxSize={5} color="teal.500" />
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              Customer Insights
            </Text>
          </HStack>
          <Badge colorScheme="teal" variant="subtle">
            {insights.totalOrders} Orders
          </Badge>
        </HStack>

        <Divider />

        {/* Order Channel Split - real, derived from order.type */}
        <Grid templateColumns="repeat(3, 1fr)" gap={3}>
          {orderTypeStats.map((stat) => (
            <Stat key={stat.type} textAlign="center">
              <StatLabel fontSize="xs">{stat.label}</StatLabel>
              <StatNumber fontSize="lg" color={orderTypeColors[stat.type]}>
                {stat.count}
              </StatNumber>
              <StatHelpText fontSize="xs">
                <Icon as={orderTypeIcons[stat.type]} boxSize={3} />
              </StatHelpText>
            </Stat>
          ))}
        </Grid>

        <Divider />

        {/* Top Named Customers */}
        <VStack align="stretch" spacing={3}>
          <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
            Top Customers by Name
          </Text>
          <Text fontSize="xs" color={mutedColor} mt={-2}>
            Based on the name captured at order time ({insights.namedOrderCount} of{' '}
            {insights.totalOrders} orders had one)
          </Text>

          {insights.topCustomers.map((customer) => (
            <HStack key={customer.name} justify="space-between">
              <HStack spacing={3}>
                <Avatar name={customer.name} size="sm" />
                <VStack align="start" spacing={0}>
                  <Text fontSize="sm" fontWeight="medium">
                    {customer.name}
                  </Text>
                  <Text fontSize="xs" color={mutedColor}>
                    {customer.orders} orders
                  </Text>
                </VStack>
              </HStack>
              <Badge colorScheme="green" variant="subtle">
                {formatPrice(customer.totalSpent)}
              </Badge>
            </HStack>
          ))}

          {insights.topCustomers.length === 0 && (
            <Text fontSize="sm" color={mutedColor} textAlign="center">
              No named customer data for this period
            </Text>
          )}
        </VStack>

        <Divider />

        {/* Trends - only real, derivable metrics */}
        <VStack align="stretch" spacing={2}>
          <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
            Trends
          </Text>
          <Grid templateColumns="repeat(2, 1fr)" gap={3}>
            <Box>
              <Text fontSize="xs" color={mutedColor} mb={1}>
                Avg Order Value
              </Text>
              <HStack spacing={1}>
                <Text fontSize="md" fontWeight="bold" color="green.500">
                  {formatPrice(insights.avgOrderValue)}
                </Text>
                <Icon as={TrendingUp} boxSize={3} color="green.500" />
              </HStack>
            </Box>
            <Box>
              <Text fontSize="xs" color={mutedColor} mb={1}>
                Repeat Named Guests
              </Text>
              <HStack spacing={1}>
                <Text fontSize="md" fontWeight="bold" color="blue.500">
                  {insights.repeatNamedCustomers}
                </Text>
                <Icon as={Repeat2} boxSize={3} color="blue.500" />
              </HStack>
            </Box>
          </Grid>
        </VStack>
      </VStack>
    </Box>
  );
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default CustomerInsightsCard;
