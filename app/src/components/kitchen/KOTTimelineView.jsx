import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  useColorModeValue,
  useToast,
  Button,
  Select,
} from '@chakra-ui/react';
import { usePOS } from '../../context/POSContext';
import KOTReceiptCard from './KOTReceiptCard';
import TimelineGrid from './TimelineGrid';
import OrderDetailPanel from '../orders/OrderDetailPanel';
import orderService from '../../services/OrderService';
import PrintService from '../../services/PrintService';

const KOTTimelineView = () => {
  const { state, formatPrice } = usePOS();
  const toast = useToast();
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  
  // Colors
  const bg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  
  // State
  const [orders, setOrders] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [timeRange, setTimeRange] = useState(() => {
    // Load from localStorage or default to 90 minutes
    const saved = localStorage.getItem('kotTimelineRange');
    return saved ? parseInt(saved) : 90;
  });
  const [loading, setLoading] = useState(false);
  const [hoveredOrderId, setHoveredOrderId] = useState(null);
  const [hoverCounter, setHoverCounter] = useState(0);
  const [pinnedOrders, setPinnedOrders] = useState(new Map()); // Map to track pin order
  const [manualRowAssignments, setManualRowAssignments] = useState(new Map()); // Map orderId to row index
  const [draggingOrderId, setDraggingOrderId] = useState(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  
  // Calculate container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);
  
  // Load orders
  const loadOrders = useCallback(async () => {
    if (!state.selectedRestaurant) return;
    
    setLoading(true);
    try {
      // Get orders from the last 3 hours (we'll filter them client-side)
      const cutoffTime = new Date(Date.now() - 180 * 60 * 1000); // 3 hours in milliseconds
      
      const ordersData = await orderService.getOrders({
        restaurant_id: state.selectedRestaurant.id,
        created_after: cutoffTime.toISOString(),
        status: ['pending', 'confirmed', 'preparing', 'ready', 'served'],
      });
      
      // Filter out orders older than the selected time range
      const cutoff = new Date(Date.now() - timeRange * 60 * 1000);
      const filteredOrders = (ordersData || []).filter(order => {
        const orderTime = new Date(order.created_at || order.order_time);
        return orderTime >= cutoff;
      });
      
      setOrders(filteredOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast({
        title: 'Error loading orders',
        description: error.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [state.selectedRestaurant, toast, timeRange]);
  
  // Load orders on mount and refresh
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);
  
  // Auto refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);
  
  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Calculate position for an order
  const calculatePosition = (orderTime) => {
    const orderDate = new Date(orderTime);
    const elapsed = (currentTime - orderDate) / 60000; // minutes elapsed
    
    // Don't show orders older than the selected time range
    if (elapsed > timeRange) {
      return -200; // Position off-screen to the left
    }
    
    const position = (elapsed / timeRange) * containerWidth;
    return Math.max(0, Math.min(containerWidth - 140, position)); // 140px is card width
  };
  
  // Calculate card height based on number of items
  const calculateCardHeight = (order) => {
    const baseHeight = 20; // Reduced header height for compact layout
    const itemHeight = 14; // Reduced height per item line
    const padding = 4; // Minimal padding
    
    const itemCount = order.items?.length || 0;
    const calculatedHeight = baseHeight + (itemCount * itemHeight) + padding;
    
    // Return calculated height without capping
    return calculatedHeight;
  };
  
  // Check if two orders overlap visually (based on card positions)
  const hasTimeOverlap = (order1, order2) => {
    const time1 = new Date(order1.created_at || order1.order_time);
    const time2 = new Date(order2.created_at || order2.order_time);
    const pos1 = calculatePosition(time1);
    const pos2 = calculatePosition(time2);
    const cardWidth = 140; // Width of KOT card
    
    // Check if cards would overlap horizontally (with 15px margin for safety)
    return Math.abs(pos1 - pos2) < (cardWidth + 15);
  };
  
  // Calculate how many rows an order needs based on item count
  const calculateRowsNeeded = (order) => {
    const ROW_HEIGHT = 26; // Height of each row
    const HEADER_HEIGHT = 22; // Height needed for order header (including border)
    const ITEM_HEIGHT = 12; // Actual height needed per item with xs font
    const PADDING = 10; // Minimal padding (p={1} = 4px total)
    
    const itemCount = order.items?.length || 0;
    
    // Calculate total height needed
    const totalHeightNeeded = HEADER_HEIGHT + (itemCount * ITEM_HEIGHT) + PADDING;
    
    // Calculate how many rows we need
    let rowsNeeded = Math.ceil(totalHeightNeeded / ROW_HEIGHT);
    //if (order.items>10)rowsNeeded+=2;
    return Math.max(1, rowsNeeded); // At least 1 row
  };
  
  // Assign orders to rows to avoid overlap and respect manual assignments
  const assignOrdersToRows = () => {
    const rows = [];
    const orderPlacements = new Map(); // Track where each order is placed and how many rows it spans
    const MIN_ROWS = 25; // More rows since they're smaller now
    const FIXED_ROW_HEIGHT = 35; // Reduced row height for more efficient space usage
    
    // Process each order
    orders.forEach(order => {
      const rowsNeeded = calculateRowsNeeded(order);
      
      // Check for manual assignment
      if (manualRowAssignments.has(order.id)) {
        const startRow = manualRowAssignments.get(order.id);
        // Ensure rows exist
        while (rows.length < startRow + rowsNeeded) {
          rows.push([]);
        }
        // Place order in start row (it will span multiple rows visually)
        rows[startRow].push(order);
        // Track placement
        orderPlacements.set(order.id, {
          startRow: startRow,
          rowSpan: rowsNeeded
        });
        return;
      }
      
      // Auto-assign: find consecutive rows that can fit this order
      let placed = false;
      
      for (let i = 0; i <= rows.length; i++) {
        let canFit = true;
        
        // Check if we can place the order starting at row i
        // Need to check all rows it would span for time conflicts
        for (let j = 0; j < rowsNeeded; j++) {
          const targetRow = rows[i + j] || [];
          
          for (const existingOrder of targetRow) {
            if (hasTimeOverlap(order, existingOrder)) {
              canFit = false;
              break;
            }
          }
          
          // Also check if any existing order spans into this row
          for (const [existingId, placement] of orderPlacements) {
            const existingEnd = placement.startRow + placement.rowSpan - 1;
            if (i + j >= placement.startRow && i + j <= existingEnd) {
              // This row is occupied by a spanning order
              const spanningOrder = orders.find(o => o.id === existingId);
              if (spanningOrder && hasTimeOverlap(order, spanningOrder)) {
                canFit = false;
                break;
              }
            }
          }
          
          if (!canFit) break;
        }
        
        if (canFit) {
          // Ensure rows exist
          while (rows.length < i + rowsNeeded) {
            rows.push([]);
          }
          // Place order in start row
          rows[i].push(order);
          // Track placement
          orderPlacements.set(order.id, {
            startRow: i,
            rowSpan: rowsNeeded
          });
          placed = true;
          break;
        }
      }
      
      if (!placed) {
        // Add new rows at the end
        const startRow = rows.length;
        for (let i = 0; i < rowsNeeded; i++) {
          rows.push(i === 0 ? [order] : []);
        }
        orderPlacements.set(order.id, {
          startRow: startRow,
          rowSpan: rowsNeeded
        });
      }
    });
    
    // Ensure minimum number of rows
    while (rows.length < MIN_ROWS) {
      rows.push([]);
    }
    
    // Create array of consistent row heights
    const rowHeights = new Array(rows.length).fill(FIXED_ROW_HEIGHT);
    
    return { rows, rowHeights, orderPlacements };
  };
  
  const { rows: orderRows, rowHeights, orderPlacements } = assignOrdersToRows();
  
  // Handle hover to manage z-index
  const handleOrderHover = (orderId, isHovering) => {
    if (isHovering) {
      setHoveredOrderId(orderId);
      setHoverCounter(prev => prev + 1);
    } else {
      if (hoveredOrderId === orderId) {
        setHoveredOrderId(null);
      }
    }
  };
  
  // Handle pin toggle
  const handlePinToggle = (orderId) => {
    setPinnedOrders(prev => {
      const newPinned = new Map(prev);
      if (newPinned.has(orderId)) {
        newPinned.delete(orderId);
      } else {
        // Add with timestamp to track pin order
        newPinned.set(orderId, Date.now());
      }
      return newPinned;
    });
  };
  
  // Handle print KOT via PrintService (supports both browser and companion app mode)
  const handlePrintKOT = (order) => {
    PrintService.printKOT({
      orderNumber: order.order_number,
      order_number: order.order_number,
      tableNumber: order.table_number || order.type?.replace('_', ' ').toUpperCase() || 'TAKEAWAY',
      table_number: order.table_number || '',
      timestamp: order.created_at || order.order_time || new Date(),
      items: (order.items || []).filter((item) => item.status !== 'cancelled'),
      special_requests: order.special_requests || undefined,
      restaurantId: order.restaurant,
      serverId: order.server ?? null,
      orderType: order.type,
    });

    toast({
      title: 'Printing KOT',
      description: `Order #${order.order_number?.toString().slice(-3).padStart(3, '0')}`,
      status: 'info',
      duration: 2000,
      isClosable: true,
    });
  };
  
  // Handle drag start
  const handleDragStart = (orderId) => {
    setDraggingOrderId(orderId);
  };
  
  // Handle drag over row
  const handleDragOverRow = (e, rowIndex) => {
    e.preventDefault(); // Allow drop
    setDragOverRowIndex(rowIndex);
  };
  
  // Handle drop on row
  const handleDropOnRow = (e, rowIndex) => {
    e.preventDefault();
    
    if (draggingOrderId) {
      setManualRowAssignments(prev => {
        const newAssignments = new Map(prev);
        newAssignments.set(draggingOrderId, rowIndex);
        return newAssignments;
      });
      
      toast({
        title: 'Order moved',
        description: `Moved to row ${rowIndex + 1}`,
        status: 'success',
        duration: 1500,
        isClosable: true,
      });
    }
    
    setDraggingOrderId(null);
    setDragOverRowIndex(null);
  };
  
  // Handle drag end
  const handleDragEnd = () => {
    setDraggingOrderId(null);
    setDragOverRowIndex(null);
  };
  
  // Handle order click
  const handleOrderClick = (order) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };
  
  // Handle double-click to advance status
  const handleOrderDoubleClick = async (order) => {
    const statusFlow = {
      'pending': 'confirmed',
      'confirmed': 'preparing',
      'preparing': 'ready',
      'ready': 'served',
      'served': 'completed',
      'completed': null,
    };
    
    const currentStatus = order.status?.toLowerCase();
    const nextStatus = statusFlow[currentStatus];
    
    if (nextStatus) {
      await handleStatusUpdate(order.id, nextStatus);
    }
  };
  
  // Handle status update
  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await orderService.updateOrderStatus(orderId, newStatus);
      toast({
        title: 'Status Updated',
        description: `Order moved to ${newStatus}`,
        status: 'success',
        duration: 1500,
        isClosable: true,
      });
      loadOrders();
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };
  
  // Format time for display
  const formatTimeMarker = (minutesFromNow) => {
    const time = new Date(currentTime.getTime() - minutesFromNow * 60000);
    return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <Box h="full" bg={bg}>
      {/* Timeline Controls */}
      <HStack p={2} borderBottomWidth="1px" borderColor={borderColor}>
        <Text fontSize="sm" fontWeight="600">Timeline Range:</Text>
        <Select
          size="sm"
          value={timeRange}
          onChange={(e) => {
            const newRange = Number(e.target.value);
            setTimeRange(newRange);
            localStorage.setItem('kotTimelineRange', newRange.toString());
          }}
          w="150px"
        >
          <option value={45}>45 minutes</option>
          <option value={90}>90 minutes</option>
          <option value={150}>2.5 hours</option>
          <option value={180}>3 hours</option>
        </Select>
      </HStack>
      
      {/* Timeline Container - Adjusted height with header */}
      <Box
        ref={scrollRef}
        h="calc(100% - 48px)"
        overflowX="auto"
        overflowY="auto"
        position="relative"
      >
        <Box
          ref={containerRef}
          position="relative"
          minW="100%"
          minH="400px"
          p={2}
        >
          {/* Timeline Grid Background */}
          <TimelineGrid
            width={containerWidth}
            timeRange={timeRange}
            currentTime={currentTime}
          />
          
          {/* Time Markers */}
          <HStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            h="20px"
            spacing={0}
            px={2}
          >
            {(() => {
              // Generate all 5-minute markers
              const allMarkers = [];
              for (let i = 0; i <= timeRange; i += 5) {
                allMarkers.push(i);
              }
              
              // Define which markers should have labels (every 15 minutes for compact view)
              const labelInterval = timeRange <= 45 ? 10 : timeRange <= 90 ? 15 : timeRange <= 150 ? 20 : 30;
              const labelMarkers = [];
              for (let i = 0; i <= timeRange; i += labelInterval) {
                labelMarkers.push(i);
              }
              
              return (
                <>
                  {/* 5-minute vertical lines */}
                  {allMarkers.map(minutes => (
                    <Box
                      key={`line-${minutes}`}
                      position="absolute"
                      left={`${(minutes / timeRange) * 100}%`}
                      top="20px"
                      bottom={0}
                      w="1px"
                      bg={labelMarkers.includes(minutes) ? "gray.400" : "gray.200"}
                      opacity={labelMarkers.includes(minutes) ? 0.5 : 0.3}
                    />
                  ))}
                  
                  {/* Time labels at regular intervals */}
                  {labelMarkers.map(minutes => (
                    <Box
                      key={`label-${minutes}`}
                      position="absolute"
                      left={`${(minutes / timeRange) * 100}%`}
                      transform="translateX(-50%)"
                    >
                      <Text fontSize="xs" color="gray.600" fontWeight="600">
                        {minutes === 0 ? 'NOW' : `-${minutes}m`}
                      </Text>
                    </Box>
                  ))}
                </>
              );
            })()}
          </HStack>
          
          {/* Current Time Indicator */}
          <Box
            position="absolute"
            left={`${(0 / timeRange) * 100}%`}
            top="20px"
            bottom={0}
            w="2px"
            bg="red.500"
            zIndex={10}
          >
            <Badge
              position="absolute"
              top="-16px"
              left="50%"
              transform="translateX(-50%)"
              colorScheme="red"
              fontSize="xs"
            >
              NOW
            </Badge>
          </Box>
          
          {/* Order Rows */}
          <VStack
            spacing={0}
            align="stretch"
            mt="25px"
            position="relative"
            pl={8}
          >
            {orderRows.map((row, rowIndex) => (
              <Box
                key={rowIndex}
                position="relative"
                minH={`${rowHeights[rowIndex]}px`}
                w="100%"
                onDragOver={(e) => handleDragOverRow(e, rowIndex)}
                onDrop={(e) => handleDropOnRow(e, rowIndex)}
                onDragLeave={() => setDragOverRowIndex(null)}
                bg={dragOverRowIndex === rowIndex ? 'blue.50' : (row.length === 0 ? 'gray.50' : 'transparent')}
                borderRadius="md"
                borderWidth={row.length === 0 ? "1px" : "0"}
                borderColor="gray.200"
                borderStyle={row.length === 0 ? "dashed" : "solid"}
                transition="all 0.2s"
                _dark={{
                  bg: dragOverRowIndex === rowIndex ? 'blue.900' : (row.length === 0 ? 'gray.800' : 'transparent'),
                  borderColor: 'gray.700'
                }}
              >
                {/* Row label */}
                <Text
                  position="absolute"
                  left="-25px"
                  top="50%"
                  transform="translateY(-50%)"
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="600"
                >
                  {rowIndex + 1}
                </Text>
                
                {/* Empty row indicator removed per user request */}
                
                {row.map(order => {
                  const isHovered = hoveredOrderId === order.id;
                  const isPinned = pinnedOrders.has(order.id);
                  const isDragging = draggingOrderId === order.id;
                  const pinTimestamp = pinnedOrders.get(order.id) || 0;
                  const baseZIndex = 5;
                  
                  // Get placement info for this order
                  const placement = orderPlacements.get(order.id);
                  const rowSpan = placement?.rowSpan || 1;
                  const cardHeight = rowSpan * 35 - 3; // Small margin for visual separation
                  
                  // Calculate z-index: pinned cards get 2000 base + their timestamp to ensure recent pins are on top
                  let zIndex = baseZIndex;
                  if (isPinned) {
                    // Use timestamp as additional z-index boost for pinned cards
                    // More recent pins get higher z-index
                    zIndex = 2000 + Math.floor(pinTimestamp / 1000);
                  } else if (isHovered) {
                    zIndex = 1000 + hoverCounter;
                  }
                  if (isDragging) {
                    zIndex = 3000; // Dragging card on top
                  }
                  
                  return (
                    <Box
                      key={order.id}
                      position="absolute"
                      left={`${calculatePosition(order.created_at || order.order_time)}px`}
                      top="0"
                      h={`${cardHeight}px`}
                      transition="left 1s ease-out"
                      zIndex={zIndex}
                    >
                      <KOTReceiptCard
                        order={order}
                        onClick={() => handleOrderClick(order)}
                        onDoubleClick={() => handleOrderDoubleClick(order)}
                        onHover={handleOrderHover}
                        onPinToggle={handlePinToggle}
                        onPrint={handlePrintKOT}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        isDragging={isDragging}
                        isPinned={isPinned}
                        zIndex={zIndex}
                        cardHeight={cardHeight}
                        rowSpan={rowSpan}
                      />
                    </Box>
                  );
                })}
              </Box>
            ))}
          </VStack>
        </Box>
      </Box>
      
      {/* Order Detail Panel - Shows when order is clicked */}
      {selectedOrder && (
        <OrderDetailPanel
          isOpen={showOrderDetails}
          onClose={() => {
            setShowOrderDetails(false);
            setSelectedOrder(null);
          }}
          order={selectedOrder}
          onRefresh={loadOrders}
        />
      )}
    </Box>
  );
};

export default KOTTimelineView;