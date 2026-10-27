import React from 'react';
import {
  Card,
  CardBody,
  VStack,
  HStack,
  Text,
  Icon,
  Button,
  Grid,
  Box,
  Flex,
} from '@chakra-ui/react';
import {
  Clock,
  User,
  Phone,
  Home,
  Calendar,
  FileText,
  CreditCard,
  HandCoins,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * Outstanding Order Card Component
 * Displays individual pending payment information
 */
const OutstandingOrderCard = ({ order, onClick, onQuickPayment }) => {
  const { formatPrice } = usePOS();
  const getPriorityColor = (priority) => {
    const colors = {
      low: 'green',
      medium: 'yellow', 
      high: 'orange',
      urgent: 'red'
    };
    return colors[priority] || 'gray';
  };


  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return 'Less than 1 hour ago';
    }
  };

  return (
    <Card
      variant="professionalTableAvailable"
      cursor="pointer"
      onClick={onClick}
      _hover={{
        transform: 'translateY(-1px)',
        shadow: 'md',
      }}
      transition="all 0.2s"
    >
      <CardBody p={6}>
        <VStack spacing={4} align="stretch">
          {/* Header - Horizontal Layout */}
          <Flex justify="space-between" align="center">
            <HStack spacing={3}>
              <Icon as={FileText} boxSize={5} color="pos.500" />
              <VStack align="start" spacing={0}>
                <Text fontWeight="bold" fontSize="lg" color="pos.600">
                  {order.order_number}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  {order.restaurant_name}
                  {order.table_number && ` • Table ${order.table_number}`}
                </Text>
              </VStack>
            </HStack>

            <VStack align="end" spacing={1}>
              <HStack spacing={2}>
                <Box w={2} h={2} bg={`${getPriorityColor(order.priority)}.400`} borderRadius="full" />
                <Text fontSize="xs" color="gray.600" fontWeight="medium" textTransform="uppercase">
                  {order.status.replace('_', ' ')}
                </Text>
                {order.is_overdue && (
                  <Box w={2} h={2} bg="red.400" borderRadius="full" />
                )}
              </HStack>
            </VStack>
          </Flex>

          {/* Payment Amount - Clean Design */}
          <HStack justify="space-between" p={4} bg="gray.50" borderRadius="lg">
            <HStack spacing={3}>
              <Icon as={HandCoins} boxSize={5} color="green.500" />
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="medium" color="gray.700">
                  Amount to Collect
                </Text>
                <Text fontSize="xs" color="gray.500">
                  of {formatPrice(parseFloat(order.original_amount) || 0)} total
                </Text>
              </VStack>
            </HStack>
            <Text fontSize="xl" fontWeight="bold" color="green.600">
              {formatPrice(parseFloat(order.outstanding_amount) || 0)}
            </Text>
          </HStack>

          {/* Customer Information - Horizontal Layout */}
          <Grid templateColumns="1fr 1fr" gap={4}>
            <VStack align="start" spacing={1}>
              <HStack spacing={2}>
                <Icon as={User} boxSize={4} color="gray.400" />
                <Text fontSize="sm" color="gray.600" fontWeight="medium">Customer</Text>
              </HStack>
              <Text fontSize="sm" fontWeight="medium" color="gray.800">
                {order.customer_name}
              </Text>
            </VStack>
            
            <VStack align="start" spacing={1}>
              <HStack spacing={2}>
                <Icon as={order.room_number ? Home : Phone} boxSize={4} color="gray.400" />
                <Text fontSize="sm" color="gray.600" fontWeight="medium">
                  {order.room_number ? 'Room' : 'Phone'}
                </Text>
              </HStack>
              <Text fontSize="sm" fontWeight="medium" color="gray.800">
                {order.room_number ? `Room ${order.room_number}` : order.customer_phone || 'Not provided'}
              </Text>
            </VStack>
          </Grid>

          {/* Time Information - Simplified */}
          <Grid templateColumns="1fr 1fr" gap={4}>
            <VStack align="start" spacing={1}>
              <HStack spacing={2}>
                <Icon as={Calendar} boxSize={4} color="gray.400" />
                <Text fontSize="sm" color="gray.600" fontWeight="medium">Order Date</Text>
              </HStack>
              <Text fontSize="sm" fontWeight="medium" color="gray.800">
                {formatDate(order.order_time)}
              </Text>
            </VStack>

            <VStack align="start" spacing={1}>
              <HStack spacing={2}>
                <Icon as={Clock} boxSize={4} color="gray.400" />
                <Text fontSize="sm" color="gray.600" fontWeight="medium">Outstanding</Text>
              </HStack>
              <Text fontSize="sm" fontWeight="medium" color={order.age_in_days > 7 ? "orange.600" : "gray.800"}>
                {order.age_in_days} days
              </Text>
            </VStack>
          </Grid>

          {/* Status Information - Minimal Design */}
          {(order.contact_attempts > 0 || order.next_follow_up_date || order.is_resolved) && (
            <VStack spacing={2}>
              {order.contact_attempts > 0 && (
                <HStack w="full" justify="space-between" fontSize="sm">
                  <Text color="gray.600" fontWeight="medium">
                    {order.contact_attempts} contact{order.contact_attempts > 1 ? 's' : ''}
                  </Text>
                  {order.last_contact_date && (
                    <Text color="gray.500">
                      Last: {getTimeAgo(order.last_contact_date)}
                    </Text>
                  )}
                </HStack>
              )}

              {order.next_follow_up_date && !order.is_resolved && (
                <HStack w="full" justify="space-between" fontSize="sm">
                  <Text color={order.is_overdue ? "red.600" : "orange.600"} fontWeight="medium">
                    {order.is_overdue ? 'Overdue Follow-up' : 'Next Follow-up'}
                  </Text>
                  <Text color="gray.600">
                    {formatDate(order.next_follow_up_date)}
                  </Text>
                </HStack>
              )}

              {order.is_resolved && (
                <HStack w="full" justify="space-between" fontSize="sm">
                  <Text color="green.600" fontWeight="medium">
                    Resolved
                  </Text>
                  <Text color="gray.600">
                    {order.resolution_action?.replace('_', ' ')}
                  </Text>
                </HStack>
              )}
            </VStack>
          )}

          {/* Action Buttons - Clean Design */}
          <HStack spacing={2}>
            {!order.is_resolved && onQuickPayment && (
              <Button
                colorScheme="green"
                size="md"
                leftIcon={<Icon as={CreditCard} boxSize={4} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickPayment(order);
                }}
                flex={1}
                borderRadius="lg"
              >
                Collect Payment
              </Button>
            )}
            <Button
              variant="outline"
              colorScheme="pos"
              size="md"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              flex={order.is_resolved ? 1 : 0}
              borderRadius="lg"
            >
              {order.is_resolved ? 'View Details' : 'Manage'}
            </Button>
          </HStack>
        </VStack>
      </CardBody>
    </Card>
  );
};

export default OutstandingOrderCard;