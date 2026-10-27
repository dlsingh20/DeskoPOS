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
} from '@chakra-ui/react';
import {
  DollarSign,
  CreditCard,
  Wallet,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';

const PaymentAnalyticsCard = ({ data }) => {
  const { formatPrice } = usePOS();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  
  if (!data) return null;
  
  const { summary, breakdown } = data;
  const paymentMethods = breakdown.paymentMethods || {};
  
  // Calculate total payments
  const totalPayments = Object.values(paymentMethods).reduce((sum, amount) => sum + amount, 0);
  
  // Payment method colors
  const methodColors = {
    cash: 'green',
    card: 'blue',
    room_charge: 'purple',
    online: 'orange',
    wallet: 'teal',
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
            <Icon as={DollarSign} boxSize={5} color="green.500" />
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              Payment Analytics
            </Text>
          </HStack>
          <Badge colorScheme="green" variant="subtle">
            {formatPrice(totalPayments)}
          </Badge>
        </HStack>
        
        <Divider />
        
        {/* Payment Method Breakdown */}
        <VStack align="stretch" spacing={3}>
          <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
            Payment Methods
          </Text>
          
          {Object.entries(paymentMethods).map(([method, amount]) => {
            const percentage = totalPayments > 0 ? (amount / totalPayments) * 100 : 0;
            const methodLabel = method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return (
              <Box key={method}>
                <HStack justify="space-between" mb={1}>
                  <HStack spacing={2}>
                    <Icon as={getMethodIcon(method)} boxSize={4} color={`${methodColors[method] || 'gray'}.500`} />
                    <Text fontSize="sm">{methodLabel}</Text>
                  </HStack>
                  <HStack spacing={2}>
                    <Text fontSize="sm" fontWeight="bold">
                      {formatPrice(amount)}
                    </Text>
                    <Badge colorScheme={methodColors[method] || 'gray'} variant="subtle">
                      {percentage.toFixed(1)}%
                    </Badge>
                  </HStack>
                </HStack>
                <Progress
                  value={percentage}
                  size="sm"
                  colorScheme={methodColors[method] || 'gray'}
                  borderRadius="md"
                />
              </Box>
            );
          })}
          
          {Object.keys(paymentMethods).length === 0 && (
            <Text fontSize="sm" color={mutedColor} textAlign="center">
              No payment data available
            </Text>
          )}
        </VStack>
        
        <Divider />
        
        {/* Payment Status */}
        <Grid templateColumns="repeat(3, 1fr)" gap={3}>
          <Stat textAlign="center">
            <StatLabel fontSize="xs">Completed</StatLabel>
            <StatNumber fontSize="lg" color="green.500">
              {summary.completedOrders}
            </StatNumber>
            <StatHelpText fontSize="xs">
              <Icon as={CheckCircle} boxSize={3} color="green.500" />
            </StatHelpText>
          </Stat>
          
          <Stat textAlign="center">
            <StatLabel fontSize="xs">Pending</StatLabel>
            <StatNumber fontSize="lg" color="orange.500">
              {summary.pendingOrders}
            </StatNumber>
            <StatHelpText fontSize="xs">
              <Icon as={Clock} boxSize={3} color="orange.500" />
            </StatHelpText>
          </Stat>
          
          <Stat textAlign="center">
            <StatLabel fontSize="xs">Failed</StatLabel>
            <StatNumber fontSize="lg" color="red.500">
              {summary.cancelledOrders}
            </StatNumber>
            <StatHelpText fontSize="xs">
              <Icon as={AlertCircle} boxSize={3} color="red.500" />
            </StatHelpText>
          </Stat>
        </Grid>
      </VStack>
    </Box>
  );
};

// Helper function to get icon for payment method
const getMethodIcon = (method) => {
  const icons = {
    cash: Wallet,
    card: CreditCard,
    room_charge: DollarSign,
    online: CreditCard,
    wallet: Wallet,
  };
  return icons[method] || DollarSign;
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default PaymentAnalyticsCard;