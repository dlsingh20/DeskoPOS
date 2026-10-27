import React from 'react';
import { usePOS } from '../../../context/POSContext';
import {
  Box,
  VStack,
  HStack,
  Text,
  Progress,
  useColorModeValue,
  Grid,
  Icon,
  Tooltip,
} from '@chakra-ui/react';
import {
  DollarSign,
  ShoppingCart,
  Clock,
  TrendingUp,
} from 'lucide-react';

/**
 * Minimal Sales Report Card
 * Clean design with consistent small text sizes
 */
const MinimalSalesCard = ({ data, showDetails = false }) => {
  const { formatPrice } = usePOS();
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const progressBg = useColorModeValue('gray.100', 'gray.700');
  
  if (!data) return null;
  
  const { summary, breakdown, trends } = data;
  
  // Calculate peak hours
  const peakHours = breakdown.hourlyDistribution
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  
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
    if (hour === 0) return '12AM';
    if (hour === 12) return '12PM';
    if (hour < 12) return `${hour}AM`;
    return `${hour - 12}PM`;
  };
  
  return (
    <Box
      bg={bg}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={borderColor}
      p={3}
      transition="all 0.2s"
    >
      <VStack align="stretch" spacing={3}>
        {/* Header */}
        <HStack justify="space-between">
          <HStack spacing={2}>
            <Icon as={DollarSign} boxSize={3.5} color="green.500" />
            <Text fontSize="sm" fontWeight="600" color={textColor}>
              Sales Overview
            </Text>
          </HStack>
          {trends.revenue !== 0 && (
            <HStack spacing={1}>
              <Box
                w="6px"
                h="6px"
                borderRadius="full"
                bg={trends.revenue > 0 ? 'green.500' : 'red.500'}
              />
              <Text fontSize="xs" color={trends.revenue > 0 ? 'green.500' : 'red.500'}>
                {trends.revenue > 0 ? '+' : ''}{trends.revenue.toFixed(1)}%
              </Text>
            </HStack>
          )}
        </HStack>
        
        {/* Key Metrics */}
        <Grid templateColumns="repeat(2, 1fr)" gap={2}>
          <Box>
            <Text fontSize="xs" color={mutedColor} mb={0.5}>
              Revenue
            </Text>
            <Text fontSize="sm" fontWeight="600" color="green.500">
              {formatPrice(summary.totalRevenue)}
            </Text>
          </Box>
          <Box>
            <Text fontSize="xs" color={mutedColor} mb={0.5}>
              Orders
            </Text>
            <Text fontSize="sm" fontWeight="600" color="blue.500">
              {summary.totalOrders}
            </Text>
          </Box>
          <Box>
            <Text fontSize="xs" color={mutedColor} mb={0.5}>
              Avg Order
            </Text>
            <Text fontSize="sm" fontWeight="600" color={textColor}>
              {formatPrice(summary.averageOrderValue)}
            </Text>
          </Box>
          <Box>
            <Text fontSize="xs" color={mutedColor} mb={0.5}>
              Completion
            </Text>
            <Text fontSize="sm" fontWeight="600" color={textColor}>
              {summary.completionRate.toFixed(0)}%
            </Text>
          </Box>
        </Grid>
        
        {/* Order Types - Minimal Progress Bars */}
        <VStack align="stretch" spacing={1.5}>
          <Text fontSize="xs" fontWeight="500" color={mutedColor} textTransform="uppercase" letterSpacing="wider">
            Order Types
          </Text>
          {Object.entries(breakdown.orderTypes).map(([type, count]) => {
            const percentage = (count / summary.totalOrders) * 100;
            const typeLabel = type.replace('_', ' ').charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
            
            return (
              <Box key={type}>
                <HStack justify="space-between" mb={0.5}>
                  <Text fontSize="xs" color={textColor}>
                    {typeLabel}
                  </Text>
                  <Text fontSize="xs" color={mutedColor}>
                    {count}
                  </Text>
                </HStack>
                <Progress
                  value={percentage}
                  size="xs"
                  colorScheme={getOrderTypeColor(type)}
                  borderRadius="full"
                  bg={progressBg}
                />
              </Box>
            );
          })}
        </VStack>
        
        {/* Peak Hours - Only show if details requested */}
        {showDetails && peakHours.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="500" color={mutedColor} mb={1} textTransform="uppercase" letterSpacing="wider">
              Peak Hours
            </Text>
            <HStack spacing={2}>
              {peakHours.map(({ hour, count }) => (
                <Tooltip key={hour} label={`${count} orders`} fontSize="xs">
                  <HStack spacing={1}>
                    <Icon as={Clock} boxSize={3} color="orange.500" />
                    <Text fontSize="xs" color={textColor}>
                      {formatHour(hour)}
                    </Text>
                  </HStack>
                </Tooltip>
              ))}
            </HStack>
          </Box>
        )}
        
        {/* Performance Indicators - Compact */}
        {showDetails && (
          <HStack spacing={2}>
            <Box flex={1}>
              <HStack spacing={1} mb={0.5}>
                <Box w="6px" h="6px" borderRadius="full" bg="green.500" />
                <Text fontSize="xs" color={mutedColor}>Success</Text>
              </HStack>
              <Progress
                value={summary.completionRate}
                size="xs"
                colorScheme="green"
                borderRadius="full"
                bg={progressBg}
              />
            </Box>
            <Box flex={1}>
              <HStack spacing={1} mb={0.5}>
                <Box w="6px" h="6px" borderRadius="full" bg="red.500" />
                <Text fontSize="xs" color={mutedColor}>Cancelled</Text>
              </HStack>
              <Progress
                value={summary.cancellationRate}
                size="xs"
                colorScheme="red"
                borderRadius="full"
                bg={progressBg}
              />
            </Box>
          </HStack>
        )}
      </VStack>
    </Box>
  );
};

export default MinimalSalesCard;