import React from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
  Text,
  Badge,
  IconButton,
  useColorModeValue,
  Tooltip,
  Spinner,
  Center,
  VStack,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { 
  Eye, 
  Clock, 
  User, 
  MapPin, 
  Package, 
  CreditCard,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';

const CompactArchiveTable = ({ 
  orders = [], 
  loading = false,
  onOrderSelect,
  formatPrice
}) => {
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const headerBg = useColorModeValue('gray.50', 'gray.900');
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');

  // Status colors
  const statusColors = {
    completed: 'green',
    cancelled: 'red',
    pending: 'yellow',
    confirmed: 'blue',
    preparing: 'orange',
    ready: 'green',
    served: 'purple',
  };

  // Payment status icons
  const paymentIcons = {
    paid: { icon: CheckCircle, color: 'green.500' },
    unpaid: { icon: XCircle, color: 'red.500' },
    partial: { icon: AlertCircle, color: 'yellow.500' },
  };

  // Format time
  const formatTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Get items summary with names
  const getItemsSummary = (items) => {
    if (!items || items.length === 0) return 'No items';
    const validItems = items
      .map(item => {
        const quantity = item.quantity || 1;
        const name = item.menu_item_name || item.name || 'Item';
        return `${quantity}x ${name}`;
      })
      .filter(item => item && item.trim()); // Filter out any empty strings
    
    return validItems.length > 0 ? validItems.join(', ') : 'No items';
  };

  if (loading) {
    return (
      <Center h="400px">
        <VStack>
          <Spinner size="xl" color="blue.500" />
          <Text color={mutedColor}>Loading orders...</Text>
        </VStack>
      </Center>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Box p={8}>
        <Alert status="info" borderRadius="lg">
          <AlertIcon />
          <VStack align="start" spacing={1}>
            <Text fontWeight="semibold">No orders found</Text>
            <Text fontSize="sm">Try adjusting your filters or date range</Text>
          </VStack>
        </Alert>
      </Box>
    );
  }

  return (
    <Box 
      bg={bg} 
      borderRadius="lg" 
      borderWidth="1px" 
      borderColor={borderColor}
      overflow="hidden"
    >
      <Box overflowX="auto">
        <Table variant="simple" size="sm">
          <Thead bg={headerBg}>
            <Tr>
              <Th py={2} fontSize="xs" color={mutedColor} width="80px">Order</Th>
              <Th py={2} fontSize="xs" color={mutedColor} width="70px">Time</Th>
              <Th py={2} fontSize="xs" color={mutedColor}>Customer</Th>
              <Th py={2} fontSize="xs" color={mutedColor} width="60px">Table</Th>
              <Th py={2} fontSize="xs" color={mutedColor} minWidth="200px">Items</Th>
              <Th py={2} fontSize="xs" color={mutedColor} width="80px">Status</Th>
              <Th py={2} fontSize="xs" color={mutedColor} width="60px" textAlign="center">Payment</Th>
              <Th py={2} fontSize="xs" color={mutedColor} width="80px" isNumeric>Amount</Th>
              <Th py={2} fontSize="xs" color={mutedColor} width="50px"></Th>
            </Tr>
          </Thead>
          <Tbody>
            {orders.map((order, index) => {
              const PaymentIcon = paymentIcons[order.payment_status]?.icon || AlertCircle;
              const paymentColor = paymentIcons[order.payment_status]?.color || 'gray.500';
              
              return (
                <Tr 
                  key={order.id}
                  _hover={{ bg: hoverBg }}
                  cursor="pointer"
                  onClick={() => onOrderSelect && onOrderSelect(order)}
                >
                  <Td py={1.5} fontSize="xs" fontWeight="600" color={textColor}>
                    #{order.order_number?.toString().slice(-4).padStart(4, '0')}
                  </Td>
                  <Td py={1.5} fontSize="xs" color={mutedColor}>
                    <VStack align="start" spacing={0}>
                      <Text>{formatTime(order.order_time || order.created_at)}</Text>
                      <Text fontSize="2xs">{formatDate(order.order_time || order.created_at)}</Text>
                    </VStack>
                  </Td>
                  <Td py={1.5} fontSize="xs" color={textColor}>
                    <HStack spacing={1}>
                      {order.customer_name ? (
                        <>
                          <User size={10} color={mutedColor} />
                          <Text noOfLines={1} maxW="120px">{order.customer_name}</Text>
                        </>
                      ) : (
                        <Text color={mutedColor}>Walk-in</Text>
                      )}
                    </HStack>
                  </Td>
                  <Td py={1.5} fontSize="xs" color={textColor}>
                    {order.table_number ? (
                      <HStack spacing={1}>
                        <MapPin size={10} color={mutedColor} />
                        <Text>T{order.table_number}</Text>
                      </HStack>
                    ) : (
                      <Text color={mutedColor}>-</Text>
                    )}
                  </Td>
                  <Td py={1.5} fontSize="xs" color={textColor}>
                    <Tooltip label={getItemsSummary(order.items)} fontSize="xs" hasArrow>
                      <HStack spacing={1}>
                        <Package size={10} color={mutedColor} />
                        <Text noOfLines={1} maxW="250px">
                          {getItemsSummary(order.items)}
                        </Text>
                      </HStack>
                    </Tooltip>
                  </Td>
                  <Td py={1.5}>
                    <Badge 
                      colorScheme={statusColors[order.status?.toLowerCase()] || 'gray'}
                      fontSize="2xs"
                      px={1.5}
                      py={0.5}
                    >
                      {order.status}
                    </Badge>
                  </Td>
                  <Td py={1.5} textAlign="center">
                    <Tooltip label={order.payment_status} fontSize="xs">
                      <Box display="inline-block">
                        <PaymentIcon size={14} color={paymentColor} />
                      </Box>
                    </Tooltip>
                  </Td>
                  <Td py={1.5} fontSize="xs" fontWeight="600" color={textColor} isNumeric>
                    {formatPrice(order.total_amount)}
                  </Td>
                  <Td py={1.5}>
                    <Tooltip label="View Details" fontSize="xs">
                      <IconButton
                        icon={<Eye size={12} />}
                        size="xs"
                        variant="ghost"
                        colorScheme="gray"
                        aria-label="View order"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOrderSelect && onOrderSelect(order);
                        }}
                      />
                    </Tooltip>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
};

export default CompactArchiveTable;