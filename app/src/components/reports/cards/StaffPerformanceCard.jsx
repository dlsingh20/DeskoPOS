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
} from '@chakra-ui/react';
import { Users, Award, TrendingUp, Info } from 'lucide-react';

/**
 * Aggregate real per-staff order metrics from the orders passed in.
 * The orders list endpoint (OrderSimpleSerializer) does not currently
 * expose a staff/server/created_by field, so this normally returns null.
 * The lookup is written defensively so it starts working automatically
 * if the backend adds staff attribution to the orders response later -
 * we never invent staff names to fill the gap.
 */
const buildStaffMetrics = (orders) => {
  const staffKey = (order) =>
    order.server_name || order.created_by_name || order.waiter_name ||
    order.server || order.created_by || order.waiter || null;

  const attributed = orders.filter((order) => staffKey(order));
  if (attributed.length === 0) return null;

  const byStaff = new Map();
  attributed.forEach((order) => {
    const key = staffKey(order);
    const label = typeof key === 'string' && Number.isNaN(Number(key))
      ? key
      : `Staff #${key}`;
    if (!byStaff.has(label)) {
      byStaff.set(label, { name: label, orders: 0, revenue: 0 });
    }
    const entry = byStaff.get(label);
    entry.orders += 1;
    entry.revenue += parseFloat(order.total_amount || 0);
  });

  return Array.from(byStaff.values()).sort((a, b) => b.revenue - a.revenue);
};

const StaffPerformanceCard = ({ data }) => {
  const { formatPrice } = usePOS();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const emptyIconColor = useColorModeValue('gray.300', 'gray.600');

  if (!data) return null;

  const orders = data.orders || [];
  const staffMetrics = buildStaffMetrics(orders);

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
            <Icon as={Users} boxSize={5} color="blue.500" />
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              Staff Performance
            </Text>
          </HStack>
          {staffMetrics && (
            <Badge colorScheme="blue" variant="subtle">
              {staffMetrics.length} Active
            </Badge>
          )}
        </HStack>

        <Divider />

        {!staffMetrics ? (
          <VStack spacing={2} py={6} textAlign="center">
            <Icon as={Info} boxSize={6} color={emptyIconColor} />
            <Text fontSize="sm" fontWeight="semibold" color={textColor}>
              Staff attribution not yet available
            </Text>
            <Text fontSize="xs" color={mutedColor} maxW="sm">
              Orders in this system aren't linked to the staff member who
              took them yet, so we can't show per-staff performance. Ask
              your engineer to enable staff/server tracking on orders.
            </Text>
          </VStack>
        ) : (
          <VStack align="stretch" spacing={3}>
            {staffMetrics.map((staff, index) => (
              <Box
                key={staff.name}
                p={3}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={borderColor}
                transition="all 0.2s"
                _hover={{
                  bg: hoverBg,
                }}
              >
                <HStack justify="space-between" mb={2}>
                  <HStack spacing={3}>
                    <Avatar name={staff.name} size="sm" />
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold">
                        {staff.name}
                      </Text>
                      <Text fontSize="xs" color={mutedColor}>
                        {staff.orders} orders
                      </Text>
                    </VStack>
                  </HStack>
                  {index === 0 && (
                    <Badge colorScheme="yellow" variant="solid">
                      <Icon as={Award} boxSize={3} /> Top
                    </Badge>
                  )}
                </HStack>

                <HStack spacing={4} fontSize="xs">
                  <HStack>
                    <Icon as={TrendingUp} boxSize={3} color="green.500" />
                    <Text>{formatPrice(staff.revenue)}</Text>
                  </HStack>
                </HStack>
              </Box>
            ))}
          </VStack>
        )}
      </VStack>
    </Box>
  );
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default StaffPerformanceCard;
