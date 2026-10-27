import React, { useRef, useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  IconButton,
  Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import { Users, ShoppingBag, Truck, Home, Printer, Clock } from 'lucide-react';

const KOTReceiptCard = ({ order, onClick, onDoubleClick, zIndex = 5, onHover, isPinned = false, onPinToggle, onPrint, onDragStart, onDragEnd, isDragging = false, cardHeight, rowSpan = 1 }) => {
  const clickTimer = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [remainingTime, setRemainingTime] = useState(null);
  
  // Background colors based on status
  const statusBackgrounds = {
    pending: { light: '#FEF3C7', dark: '#78350F' },
    confirmed: { light: '#DBEAFE', dark: '#1E3A8A' },
    preparing: { light: '#FED7AA', dark: '#7C2D12' },
    ready: { light: '#D1FAE5', dark: '#064E3B' },
    served: { light: '#E9D5FF', dark: '#4C1D95' },
    completed: { light: '#F3F4F6', dark: '#374151' },
  };
  
  const status = order.status?.toLowerCase() || 'pending';
  const bgColor = useColorModeValue(
    statusBackgrounds[status]?.light || '#F3F4F6',
    statusBackgrounds[status]?.dark || '#374151'
  );
  
  const borderColor = useColorModeValue('gray.400', 'gray.600');
  const textColor = useColorModeValue('gray.800', 'white');
  
  // Format order number to show last 3 digits
  const formatOrderNumber = (num) => {
    const str = (num || '').toString();
    return str.slice(-3).padStart(3, '0');
  };
  
  // Get icon based on order type
  const getOrderIcon = () => {
    if (order.table_number) {
      return Users; // Table icon for dine-in
    }
    switch(order.type) {
      case 'takeaway':
        return ShoppingBag;
      case 'delivery':
        return Truck;
      case 'room_service':
        return Home;
      default:
        return ShoppingBag;
    }
  };
  
  // Countdown timer from pending through preparing status
  useEffect(() => {
    // Show timer for pending, confirmed, and preparing statuses
    if (status === 'pending' || status === 'confirmed' || status === 'preparing') {
      // Use order's created_at as the start time (when order was placed)
      const orderStartTime = order.created_at || order.order_time;
      
      const updateTimer = () => {
        const now = Date.now();
        const startTime = new Date(orderStartTime).getTime();
        const elapsed = now - startTime;
        const targetTime = 15 * 60 * 1000; // 15 minutes in milliseconds
        const remaining = targetTime - elapsed;
        
        if (remaining > 0) {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setRemainingTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        } else {
          // Overdue - show negative time
          const overdueMs = Math.abs(remaining);
          const minutes = Math.floor(overdueMs / 60000);
          const seconds = Math.floor((overdueMs % 60000) / 1000);
          setRemainingTime(`-${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      };
      
      updateTimer(); // Initial update
      const interval = setInterval(updateTimer, 1000);
      
      return () => clearInterval(interval);
    } else {
      setRemainingTime(null);
    }
  }, [status, order.created_at, order.order_time]);
  
  // Get timer color based on remaining time
  const getTimerColor = () => {
    if (!remainingTime) return 'gray';
    if (remainingTime.startsWith('-')) return 'red'; // Overdue
    const [minutes] = remainingTime.split(':').map(Number);
    if (minutes >= 10) return 'green';
    if (minutes >= 5) return 'yellow';
    return 'orange';
  };
  
  // Handle click events with timer to distinguish single vs double click
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (clickTimer.current) {
      // Double click detected
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      if (onDoubleClick) {
        onDoubleClick();
      }
    } else {
      // First click - wait to see if double click
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        if (onClick) {
          onClick();
        }
      }, 250);
    }
  };
  
  return (
    <Box
      w="140px"
      h={cardHeight ? `${cardHeight}px` : 'fit-content'}
      overflowY="auto"
      bg={bgColor}
      borderWidth={isPinned ? "2px" : "1px"}
      borderColor={isPinned ? "blue.500" : borderColor}
      borderStyle="solid"
      borderRadius="md"
      p={1}
      cursor={isDragging ? "grabbing" : "grab"}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        if (onDragStart) onDragStart(order.id);
      }}
      onDragEnd={(e) => {
        if (onDragEnd) onDragEnd();
      }}
      onClick={handleClick}
      onMouseEnter={() => {
        setIsHovered(true);
        if (onHover) onHover(order.id, true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        if (onHover) onHover(order.id, false);
      }}
      transition="all 0.2s"
      transform={isHovered || isPinned ? 'translateY(-2px)' : 'translateY(0)'}
      boxShadow={isPinned ? 'xl' : (isHovered ? 'lg' : 'sm')}
      opacity={isDragging ? 0.5 : 1}
      zIndex={isPinned ? 2000 : (isHovered ? zIndex : 5)}
      position="relative"
      fontSize="xs"
      userSelect="none"
      title="Drag to move between rows • Double-click to advance status"
    >
      <VStack spacing={0} align="stretch">
        {/* Order Number with Icon and Table - Last 3 digits */}
        <HStack 
          justify="space-between"
          borderBottomWidth="1px" 
          borderColor={borderColor} 
          pb={0}
          mb={0}
        >
          <HStack spacing={0.5}>
            <Icon as={getOrderIcon()} boxSize={3} />
            <Text 
              fontWeight="bold" 
              fontSize="sm"
              cursor="pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onPinToggle) onPinToggle(order.id);
              }}
              textDecoration={isPinned ? "underline" : "none"}
              color={isPinned ? "blue.600" : textColor}
              _hover={{ textDecoration: "underline" }}
              title={isPinned ? "Click to unpin" : "Click to pin"}
            >
              #{formatOrderNumber(order.order_number)}
            </Text>
            {order.table_number && (
              <Text fontSize="xs" fontWeight="600" color={textColor}>
                T{order.table_number}
              </Text>
            )}
            {/* Countdown timer for pending through preparing status */}
            {(status === 'pending' || status === 'confirmed' || status === 'preparing') && remainingTime && (
              <Badge 
                colorScheme={getTimerColor()} 
                size="sm" 
                variant="solid"
                fontSize="xs"
                px={1}
              >
                <HStack spacing={0.5}>
                  <Icon as={Clock} boxSize={2.5} />
                  <Text>{remainingTime}</Text>
                </HStack>
              </Badge>
            )}
          </HStack>
          
          <IconButton
            icon={<Icon as={Printer} boxSize={4} />}
            size="xs"
            variant="ghost"
            colorScheme="gray"
            onClick={(e) => {
              e.stopPropagation();
              if (onPrint) onPrint(order);
            }}
            aria-label="Print KOT"
            title="Print KOT"
            _hover={{ bg: 'gray.200' }}
          />
        </HStack>
        
        {/* Items List - Show all items */}
        {order.items && order.items.length > 0 && (
          <VStack 
            spacing={0} 
            align="stretch" 
            pt={0}
          >
            {order.items.map((item, idx) => (
              <Text 
                key={idx} 
                fontSize="xs" 
                noOfLines={1}
                color={textColor}
                fontWeight="500"
              >
                {item.quantity}x {item.menu_item_name || item.name}
              </Text>
            ))}
          </VStack>
        )}
      </VStack>
    </Box>
  );
};

export default KOTReceiptCard;