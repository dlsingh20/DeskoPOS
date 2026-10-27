import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  Box,
  HStack,
  VStack,
  Text,
  IconButton,
  useColorModeValue,
  Tooltip,
  useBreakpointValue,
  Flex,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import {
  Clock,
  User,
  DollarSign,
  MapPin,
  CheckCircle,
  ChefHat,
  Package,
  Truck,
  Archive,
  Hash,
  ChevronRight,
  CreditCard,
} from 'lucide-react';

const MotionBox = motion(Box);

/**
 * Minimal Order Card Component
 * Ultra-clean design with consistent small text sizes
 */
const MinimalOrderCard = ({ 
  order, 
  isSelected = false, 
  onClick, 
  viewMode = 'grid',
  onStatusUpdate,
  compact = false 
}) => {
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const selectedBg = useColorModeValue('blue.50', 'gray.800');
  const selectedBorder = useColorModeValue('blue.400', 'blue.600');
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'gray.800');
  const hoverBorderColor = useColorModeValue('gray.300', 'gray.600');
  const statusBgLight = useColorModeValue('100', '900');
  
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [isUpdating, setIsUpdating] = useState(false);
  const { formatPrice } = usePOS();

  // Status configuration with minimal styling
  const statusConfig = {
    pending: { icon: Clock, color: 'yellow.500', label: 'Pending' },
    confirmed: { icon: CheckCircle, color: 'blue.500', label: 'Confirmed' },
    preparing: { icon: ChefHat, color: 'orange.500', label: 'Preparing' },
    ready: { icon: Package, color: 'green.500', label: 'Ready' },
    served: { icon: Truck, color: 'purple.500', label: 'Served' },
    completed: { icon: Archive, color: 'gray.500', label: 'Completed' },
    cancelled: { icon: Clock, color: 'red.500', label: 'Cancelled' },
  };
  
  // Payment status indicators
  const getPaymentIcon = () => {
    if (order.payment_status === 'paid') return CheckCircle;
    if (order.payment_status === 'partial') return CreditCard;
    return DollarSign;
  };
  
  const getPaymentColor = () => {
    if (order.payment_status === 'paid') return 'green.500';
    if (order.payment_status === 'partial') return 'yellow.500';
    return 'orange.500';
  };
  
  const currentStatus = statusConfig[order.status?.toLowerCase()] || statusConfig.pending;
  const PaymentIcon = getPaymentIcon();
  
  // Calculate time elapsed
  const getTimeElapsed = () => {
    const orderTime = order.order_time || order.created_at;
    if (!orderTime) return 'now';
    
    const created = new Date(orderTime);
    const now = new Date();
    const diffMinutes = Math.floor((now - created) / 1000 / 60);
    
    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
    return `${Math.floor(diffMinutes / 1440)}d`;
  };
  
  // Get next action
  const getNextAction = () => {
    const actions = {
      pending: { status: 'confirmed', icon: CheckCircle },
      confirmed: { status: 'preparing', icon: ChefHat },
      preparing: { status: 'ready', icon: Package },
      ready: { status: 'served', icon: Truck },
      served: order.payment_status === 'paid' 
        ? { status: 'completed', icon: Archive }
        : null,
    };
    return actions[order.status?.toLowerCase()];
  };
  
  const nextAction = getNextAction();
  
  const handleQuickAction = async (e) => {
    e.stopPropagation();
    if (!nextAction || !onStatusUpdate) return;
    
    setIsUpdating(true);
    try {
      await onStatusUpdate(order.id, nextAction.status);
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Format order number to show last 3 digits
  const formatOrderNumber = (orderNum) => {
    const numStr = orderNum?.toString() || '';
    return `#${numStr.slice(-3).padStart(3, '0')}`;
  };
  
  // Get items as comma-separated string
  const getItemsList = () => {
    if (!order.items || order.items.length === 0) return 'No items';
    const validItems = order.items
      .map(item => {
        const quantity = item.quantity || 1;
        const name = item.menu_item_name || item.name || 'Item';
        return `${quantity}x ${name}`;
      })
      .filter(item => item && item.trim()); // Filter out any empty strings
    
    return validItems.length > 0 ? validItems.join(', ') : 'No items';
  };
  
  // List View - Horizontal minimal layout
  if (viewMode === 'list') {
    return (
      <MotionBox
        whileHover={{ x: 2 }}
        transition={{ duration: 0.2 }}
      >
        <Box
          p={isMobile ? 2 : 3}
          bg={isSelected ? selectedBg : bg}
          borderWidth="1px"
          borderColor={isSelected ? selectedBorder : borderColor}
          borderRadius="lg"
          cursor="pointer"
          onClick={onClick}
          transition="all 0.2s"
          _hover={{ bg: hoverBg }}
        >
          <Flex align="center" justify="space-between">
            {/* Left: Order Info */}
            <HStack spacing={4} flex={1}>
              <VStack align="start" spacing={0}>
                <HStack spacing={1}>
                  <Hash size={12} color={mutedColor} />
                  <Text fontSize="sm" fontWeight="600" color={textColor}>
                    {formatOrderNumber(order.order_number)}
                  </Text>
                </HStack>
                <HStack spacing={2}>
                  <HStack spacing={1}>
                    <Clock size={10} color={mutedColor} />
                    <Text fontSize="xs" color={mutedColor}>{getTimeElapsed()}</Text>
                  </HStack>
                  {order.table_number && (
                    <>
                      <Text fontSize="xs" color={mutedColor}>•</Text>
                      <HStack spacing={1}>
                        <MapPin size={10} color={mutedColor} />
                        <Text fontSize="xs" color={mutedColor}>T{order.table_number}</Text>
                      </HStack>
                    </>
                  )}
                </HStack>
              </VStack>
              
              <VStack align="start" spacing={0} flex={1}>
                <Text fontSize="xs" color={mutedColor}>
                  {order.customer_name || 'Guest'}
                </Text>
                <Text fontSize="xs" color={textColor} noOfLines={1}>
                  {getItemsList()}
                </Text>
              </VStack>
            </HStack>
            
            {/* Right: Status, Payment, Price */}
            <HStack spacing={3}>
              {/* Status Dot */}
              <Tooltip label={currentStatus.label} fontSize="xs">
                <Box>
                  <currentStatus.icon size={16} color={currentStatus.color} />
                </Box>
              </Tooltip>
              
              {/* Payment Status */}
              <Tooltip label={order.payment_status} fontSize="xs">
                <Box>
                  <PaymentIcon size={16} color={getPaymentColor()} />
                </Box>
              </Tooltip>
              
              {/* Price */}
              <Text fontSize="sm" fontWeight="600" color={textColor} minW="60px" textAlign="right">
                {formatPrice(order.total_amount)}
              </Text>
              
              {/* Action */}
              {nextAction && (
                <Tooltip label={`Next: ${nextAction.status}`} fontSize="xs">
                  <IconButton
                    size="xs"
                    icon={<nextAction.icon size={14} />}
                    onClick={handleQuickAction}
                    isLoading={isUpdating}
                    variant="ghost"
                    colorScheme="blue"
                    aria-label="Next action"
                  />
                </Tooltip>
              )}
              
              <ChevronRight size={14} color={mutedColor} />
            </HStack>
          </Flex>
        </Box>
      </MotionBox>
    );
  }
  
  // Compact/Kanban View - Ultra minimal
  if (viewMode === 'compact' || viewMode === 'kanban' || compact) {
    return (
      <MotionBox
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <Box
          p={2}
          bg={isSelected ? selectedBg : bg}
          borderWidth="1px"
          borderColor={isSelected ? selectedBorder : borderColor}
          borderRadius="md"
          cursor="pointer"
          onClick={onClick}
          transition="all 0.2s"
        >
          <VStack spacing={1.5} align="stretch">
            {/* Header */}
            <HStack justify="space-between">
              <HStack spacing={1}>
                <Text fontSize="sm" fontWeight="600" color={textColor}>
                  {formatOrderNumber(order.order_number)}
                </Text>
                {order.table_number && (
                  <Text fontSize="xs" color={mutedColor}>
                    T{order.table_number}
                  </Text>
                )}
              </HStack>
              <HStack spacing={1}>
                <Clock size={10} color={mutedColor} />
                <Text fontSize="xs" color={mutedColor}>{getTimeElapsed()}</Text>
              </HStack>
            </HStack>
            
            {/* Customer and items */}
            <VStack align="start" spacing={0}>
              <Text fontSize="xs" color={mutedColor}>
                {order.customer_name || 'Guest'}
              </Text>
              <Text fontSize="xs" color={textColor} noOfLines={1}>
                {getItemsList()}
              </Text>
            </VStack>
            
            {/* Footer */}
            <HStack justify="space-between" align="center">
              <HStack spacing={2}>
                <Box w="6px" h="6px" borderRadius="full" bg={currentStatus.color} />
                <Box w="6px" h="6px" borderRadius="full" bg={getPaymentColor()} />
              </HStack>
              <Text fontSize="sm" fontWeight="600" color={textColor}>
                {formatPrice(order.total_amount)}
              </Text>
            </HStack>
          </VStack>
        </Box>
      </MotionBox>
    );
  }
  
  // Default Grid View - Clean and minimal
  return (
    <MotionBox
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Box
        p={isMobile ? 2 : 3}
        bg={isSelected ? selectedBg : bg}
        borderWidth="1px"
        borderColor={isSelected ? selectedBorder : borderColor}
        borderRadius="lg"
        cursor="pointer"
        onClick={onClick}
        transition="all 0.2s"
        _hover={{ borderColor: hoverBorderColor }}
      >
        <VStack spacing={2} align="stretch">
          {/* Header */}
          <HStack justify="space-between">
            <HStack spacing={2}>
              <Text fontSize="sm" fontWeight="600" color={textColor}>
                {formatOrderNumber(order.order_number)}
              </Text>
              {order.table_number && (
                <HStack spacing={1}>
                  <MapPin size={12} color={mutedColor} />
                  <Text fontSize="xs" color={mutedColor}>T{order.table_number}</Text>
                </HStack>
              )}
            </HStack>
            <HStack spacing={1}>
              <Clock size={12} color={mutedColor} />
              <Text fontSize="xs" color={mutedColor}>{getTimeElapsed()}</Text>
            </HStack>
          </HStack>
          
          {/* Customer Info */}
          {order.customer_name && (
            <HStack spacing={1}>
              <User size={12} color={mutedColor} />
              <Text fontSize="xs" color={mutedColor} noOfLines={1}>
                {order.customer_name}
              </Text>
            </HStack>
          )}
          
          {/* Items list */}
          <Text fontSize="xs" color={textColor} noOfLines={2}>
            {getItemsList()}
          </Text>
          
          {/* Divider line */}
          <Box h="1px" bg={borderColor} mx={-2} />
          
          {/* Footer */}
          <HStack justify="space-between" align="center">
            <HStack spacing={2}>
              {/* Status indicator */}
              <Tooltip label={currentStatus.label} fontSize="xs">
                <Box
                  p={1}
                  borderRadius="full"
                  bg={currentStatus.color.replace('500', statusBgLight)}
                >
                  <currentStatus.icon size={12} color={currentStatus.color} />
                </Box>
              </Tooltip>
              
              {/* Payment indicator */}
              <Tooltip label={`Payment: ${order.payment_status}`} fontSize="xs">
                <Box>
                  <PaymentIcon size={14} color={getPaymentColor()} />
                </Box>
              </Tooltip>
            </HStack>
            
            <HStack spacing={2}>
              <Text fontSize="sm" fontWeight="700" color={textColor}>
                {formatPrice(order.total_amount)}
              </Text>
              
              {/* Quick action button - only show on hover for desktop */}
              {nextAction && !isMobile && (
                <IconButton
                  size="xs"
                  icon={<nextAction.icon size={12} />}
                  onClick={handleQuickAction}
                  isLoading={isUpdating}
                  variant="ghost"
                  colorScheme="blue"
                  aria-label="Next action"
                  opacity={isSelected ? 1 : 0}
                  _groupHover={{ opacity: 1 }}
                  transition="opacity 0.2s"
                />
              )}
            </HStack>
          </HStack>
        </VStack>
      </Box>
    </MotionBox>
  );
};

export default MinimalOrderCard;