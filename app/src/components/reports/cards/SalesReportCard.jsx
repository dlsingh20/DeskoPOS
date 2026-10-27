import React from 'react';
import { usePOS } from '../../../context/POSContext';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Progress,
  useColorModeValue,
  Divider,
  Grid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
} from '@chakra-ui/react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Clock,
  Users,
  Package,
} from 'lucide-react';

const SalesReportCard = ({ data, detailed = false }) => {
  const { formatPrice } = usePOS();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  
  if (!data) return null;
  
  const { summary, breakdown, trends } = data;
  
  // Calculate peak hours
  const peakHours = breakdown.hourlyDistribution
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  
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
            <Icon as={DollarSign} boxSize={5} color="green.500" />
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              Sales Report
            </Text>
          </HStack>
          <Badge colorScheme="green" variant="subtle">
            Live
          </Badge>
        </HStack>
        
        <Divider />
        
        {/* Key Metrics Grid */}
        <Grid templateColumns={detailed ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)'} gap={4}>
          <Stat>
            <StatLabel>Total Revenue</StatLabel>
            <StatNumber color="green.500">
              {formatPrice(summary.totalRevenue)}
            </StatNumber>
            <StatHelpText>
              <StatArrow type={trends.revenue > 0 ? 'increase' : 'decrease'} />
              {Math.abs(trends.revenue).toFixed(1)}%
            </StatHelpText>
          </Stat>
          
          <Stat>
            <StatLabel>Orders</StatLabel>
            <StatNumber color="blue.500">
              {summary.totalOrders}
            </StatNumber>
            <StatHelpText>
              <StatArrow type={trends.orders > 0 ? 'increase' : 'decrease'} />
              {Math.abs(trends.orders).toFixed(1)}%
            </StatHelpText>
          </Stat>
          
          {detailed && (
            <Stat>
              <StatLabel>Avg Order</StatLabel>
              <StatNumber color="purple.500">
                {formatPrice(summary.averageOrderValue)}
              </StatNumber>
              <StatHelpText>
                <StatArrow type={trends.avgOrder > 0 ? 'increase' : 'decrease'} />
                {Math.abs(trends.avgOrder).toFixed(1)}%
              </StatHelpText>
            </Stat>
          )}
        </Grid>
        
        {/* Order Type Breakdown */}
        <VStack align="stretch" spacing={2}>
          <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
            Order Types
          </Text>
          {Object.entries(breakdown.orderTypes).map(([type, count]) => {
            const percentage = (count / summary.totalOrders) * 100;
            const typeLabel = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return (
              <Box key={type}>
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="sm">{typeLabel}</Text>
                  <Text fontSize="sm" color={mutedColor}>
                    {count} ({percentage.toFixed(1)}%)
                  </Text>
                </HStack>
                <Progress
                  value={percentage}
                  size="sm"
                  colorScheme={getOrderTypeColor(type)}
                  borderRadius="md"
                />
              </Box>
            );
          })}
        </VStack>
        
        {detailed && (
          <>
            <Divider />
            
            {/* Peak Hours */}
            <VStack align="stretch" spacing={2}>
              <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
                Peak Hours
              </Text>
              <HStack spacing={4}>
                {peakHours.map(({ hour, count }) => (
                  <HStack key={hour} spacing={2}>
                    <Icon as={Clock} boxSize={4} color="orange.500" />
                    <Text fontSize="sm">
                      {formatHour(hour)}: <strong>{count}</strong> orders
                    </Text>
                  </HStack>
                ))}
              </HStack>
            </VStack>
            
            <Divider />
            
            {/* Performance Indicators */}
            <Grid templateColumns="repeat(2, 1fr)" gap={4}>
              <Box>
                <Text fontSize="xs" color={mutedColor} mb={1}>
                  Completion Rate
                </Text>
                <HStack spacing={2}>
                  <Progress
                    value={summary.completionRate}
                    size="sm"
                    colorScheme="green"
                    borderRadius="md"
                    flex={1}
                  />
                  <Text fontSize="sm" fontWeight="bold">
                    {summary.completionRate.toFixed(1)}%
                  </Text>
                </HStack>
              </Box>
              
              <Box>
                <Text fontSize="xs" color={mutedColor} mb={1}>
                  Cancellation Rate
                </Text>
                <HStack spacing={2}>
                  <Progress
                    value={summary.cancellationRate}
                    size="sm"
                    colorScheme="red"
                    borderRadius="md"
                    flex={1}
                  />
                  <Text fontSize="sm" fontWeight="bold">
                    {summary.cancellationRate.toFixed(1)}%
                  </Text>
                </HStack>
              </Box>
            </Grid>
          </>
        )}
      </VStack>
    </Box>
  );
};

// Helper functions
const getOrderTypeColor = (type) => {
  const colors = {
    dine_in: 'blue',
    takeaway: 'orange',
    delivery: 'green',
    room_service: 'purple',
  };
  return colors[type] || 'gray';
};

const formatHour = (hour) => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default SalesReportCard;