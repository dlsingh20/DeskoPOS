import React from 'react';
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
  CircularProgress,
  CircularProgressLabel,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from '@chakra-ui/react';
import {
  ChefHat,
  Clock,
  AlertCircle,
  CheckCircle,
  Package,
  Truck,
  Timer,
  Activity,
} from 'lucide-react';

const KitchenPerformanceCard = ({ data }) => {
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  const alertBg = useColorModeValue('red.50', 'red.900');
  const warningBg = useColorModeValue('yellow.50', 'yellow.900');
  const successBg = useColorModeValue('green.50', 'green.900');
  
  if (!data || !data.kitchen) return null;
  
  const kitchenStats = data.kitchen || {};
  
  // Calculate efficiency score
  const efficiencyScore = calculateEfficiency(kitchenStats);
  
  // Get order status distribution
  const orderStatuses = {
    pending: kitchenStats.pending_orders || 0,
    preparing: kitchenStats.preparing_orders || 0,
    ready: kitchenStats.ready_orders || 0,
    served: kitchenStats.served_orders || 0,
  };
  
  const totalActive = orderStatuses.pending + orderStatuses.preparing + orderStatuses.ready;
  
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
            <Icon as={ChefHat} boxSize={5} color="orange.500" />
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              Kitchen Performance
            </Text>
          </HStack>
          <Badge
            colorScheme={totalActive > 10 ? 'red' : totalActive > 5 ? 'yellow' : 'green'}
            variant="subtle"
          >
            {totalActive} Active
          </Badge>
        </HStack>
        
        <Divider />
        
        {/* Efficiency Gauge */}
        <HStack spacing={6} justify="center">
          <VStack>
            <Text fontSize="sm" color={mutedColor}>
              Efficiency Score
            </Text>
            <CircularProgress
              value={efficiencyScore}
              size="100px"
              thickness="8px"
              color={getEfficiencyColor(efficiencyScore)}
            >
              <CircularProgressLabel fontSize="xl" fontWeight="bold">
                {efficiencyScore}%
              </CircularProgressLabel>
            </CircularProgress>
          </VStack>
          
          <VStack align="start" spacing={2}>
            <HStack spacing={2}>
              <Icon as={Timer} boxSize={4} color="blue.500" />
              <Text fontSize="sm">
                Avg Prep Time: <strong>{kitchenStats.average_prep_time || 0}m</strong>
              </Text>
            </HStack>
            <HStack spacing={2}>
              <Icon as={Clock} boxSize={4} color="orange.500" />
              <Text fontSize="sm">
                Est. Wait Time: <strong>{kitchenStats.estimated_wait_time || 0}m</strong>
              </Text>
            </HStack>
            <HStack spacing={2}>
              <Icon as={Activity} boxSize={4} color="green.500" />
              <Text fontSize="sm">
                Orders/Hour: <strong>{kitchenStats.orders_per_hour || 0}</strong>
              </Text>
            </HStack>
          </VStack>
        </HStack>
        
        <Divider />
        
        {/* Order Pipeline */}
        <VStack align="stretch" spacing={3}>
          <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
            Order Pipeline
          </Text>
          
          <Grid templateColumns="repeat(4, 1fr)" gap={3}>
            <OrderStatusBox
              status="Pending"
              count={orderStatuses.pending}
              icon={AlertCircle}
              color="yellow"
              bg={warningBg}
            />
            <OrderStatusBox
              status="Preparing"
              count={orderStatuses.preparing}
              icon={ChefHat}
              color="orange"
              bg={warningBg}
            />
            <OrderStatusBox
              status="Ready"
              count={orderStatuses.ready}
              icon={Package}
              color="green"
              bg={successBg}
            />
            <OrderStatusBox
              status="Served"
              count={orderStatuses.served}
              icon={CheckCircle}
              color="blue"
              bg={successBg}
            />
          </Grid>
        </VStack>
        
        {/* Preparation Times by Item */}
        {data.prepTimes && data.prepTimes.length > 0 && (
          <>
            <Divider />
            <VStack align="stretch" spacing={2}>
              <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
                Avg Preparation Times
              </Text>
              {data.prepTimes.slice(0, 5).map((item) => (
                <HStack key={item.name} justify="space-between">
                  <Text fontSize="sm" noOfLines={1} flex={1}>
                    {item.name}
                  </Text>
                  <Badge colorScheme={getPrepTimeColor(item.avg_time)} variant="subtle">
                    {item.avg_time}m
                  </Badge>
                </HStack>
              ))}
            </VStack>
          </>
        )}
        
        {/* Alerts */}
        {kitchenStats.overdue_orders > 0 && (
          <Box
            bg={alertBg}
            p={3}
            borderRadius="md"
            borderWidth="1px"
            borderColor="red.300"
          >
            <HStack spacing={2}>
              <Icon as={AlertCircle} boxSize={4} color="red.500" />
              <Text fontSize="sm" color="red.600" fontWeight="semibold">
                {kitchenStats.overdue_orders} orders are overdue
              </Text>
            </HStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

// Order Status Box Component
const OrderStatusBox = ({ status, count, icon: IconComponent, color, bg }) => {
  return (
    <VStack
      bg={bg}
      p={3}
      borderRadius="lg"
      spacing={1}
      transition="all 0.3s"
      _hover={{
        transform: 'scale(1.05)',
      }}
    >
      <Icon as={IconComponent} boxSize={5} color={`${color}.500`} />
      <Text fontSize="xl" fontWeight="bold" color={`${color}.600`}>
        {count}
      </Text>
      <Text fontSize="xs" color="gray.500">
        {status}
      </Text>
    </VStack>
  );
};

// Helper functions
const calculateEfficiency = (stats) => {
  // Calculate efficiency based on various metrics
  let score = 100;
  
  // Deduct points for overdue orders
  if (stats.overdue_orders > 0) {
    score -= stats.overdue_orders * 5;
  }
  
  // Deduct points for high average prep time
  if (stats.average_prep_time > 30) {
    score -= 10;
  } else if (stats.average_prep_time > 20) {
    score -= 5;
  }
  
  // Deduct points for high pending orders
  if (stats.pending_orders > 10) {
    score -= 15;
  } else if (stats.pending_orders > 5) {
    score -= 5;
  }
  
  return Math.max(0, Math.min(100, score));
};

const getEfficiencyColor = (score) => {
  if (score >= 80) return 'green.400';
  if (score >= 60) return 'yellow.400';
  return 'red.400';
};

const getPrepTimeColor = (time) => {
  if (time <= 10) return 'green';
  if (time <= 20) return 'yellow';
  return 'red';
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default KitchenPerformanceCard;