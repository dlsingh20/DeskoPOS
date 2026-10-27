import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Divider,
  useColorModeValue,
  useToast,
  IconButton,
  Flex,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Progress,
  Avatar,
  Tooltip,
  useDisclosure,
  Alert,
  AlertIcon,
  Spacer,
  Circle,
  Stat,
  Spinner,
  Center,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Grid,
  GridItem,
  Input,
  InputGroup,
  InputLeftElement,
  ButtonGroup,
  Collapse,
  Fade,
  ScaleFade,
  Slide,
  SlideFade,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  TagCloseButton,
  useBreakpointValue,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  SimpleGrid,
  InputRightElement,
} from '@chakra-ui/react';
import {
  X,
  CreditCard,
  Printer,
  CheckCircle,
  Clock,
  ChefHat,
  Truck,
  XCircle,
  Receipt,
  DollarSign,
  User,
  MapPin,
  ShoppingBag,
  AlertCircle,
  Package,
  Timer,
  Calendar,
  Hash,
  Edit,
  Coffee,
  Star,
  MessageSquare,
  TrendingUp,
  Copy,
  Share2,
  MoreVertical,
  Plus,
  Minus,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
  FileText,
  Users,
  Utensils,
  History,
  Gift,
  Percent,
  Volume2,
  Mic,
  Send,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePOS } from '../../context/POSContext';
import PaymentModal from '../payment/PaymentModal';
import PrintPreview from '../print/PrintPreview';
import GuestSelector from '../payment/GuestSelector';
import MenuService from '../../services/MenuService';
import ApiClient from '../../services/ApiClient';
import { 
  getPaymentStatus, 
  calculatePaidAmount, 
  getRemainingAmount,
  getPaymentStatusColor,
  getPaymentStatusText
} from '../../utils/orderUtils';

const MotionBox = motion(Box);

const OrderDetailPanel = ({ order: initialOrder, isOpen, onClose, onRefresh, onOrderUpdate, width = '500px', position = 'right' }) => {
  const {
    updateOrderStatus,
    formatPrice,
    addItemToOrder,
    updateOrderItem,
    removeOrderItem,
    processFlexiblePayment,
  } = usePOS();
  
  // Local order state to ensure UI updates
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [itemQuantities, setItemQuantities] = useState({});
  
  // Payment state
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [transactionId, setTransactionId] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showGuestSelector, setShowGuestSelector] = useState(false);
  
  const toast = useToast();
  
  const { isOpen: isPaymentOpen, onOpen: onPaymentOpen, onClose: onPaymentClose } = useDisclosure();
  const { isOpen: isPrintOpen, onOpen: onPrintOpen, onClose: onPrintClose } = useDisclosure();
  const { isOpen: isItemSelectorOpen, onOpen: onItemSelectorOpen, onClose: onItemSelectorClose } = useDisclosure();
  
  // Item selector state
  const [menuItems, setMenuItems] = useState([]);
  const [loadingMenuItems, setLoadingMenuItems] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTimer, setSearchTimer] = useState(null);
  
  // Color scheme
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const cardBg = useColorModeValue('gray.50', 'gray.700');
  const accentBg = useColorModeValue('blue.50', 'blue.900');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const greenAccent = useColorModeValue('green.500', 'green.300');
  const redAccent = useColorModeValue('red.500', 'red.300');
  const blueAccent = useColorModeValue('blue.600', 'blue.300');
  
  // Responsive
  const isMobile = useBreakpointValue({ base: true, md: false });
  const panelWidth = useBreakpointValue({ base: '100%', md: width });
  
  // Function to refresh order data from API
  const refreshOrderData = async (orderId = order?.id) => {
    if (!orderId) return;
    
    try {
      const response = await ApiClient.get(`/api/pos/api/orders/${orderId}/`);
      if (response.data) {
        console.log('Fetched order details:', {
          id: response.data.id,
          order_number: response.data.order_number,
          total_amount: response.data.total_amount,
          payments: response.data.payments,
          payment_count: response.data.payments?.length || 0,
          status: response.data.status
        });
        setOrder(response.data);
        return response.data;
      }
    } catch (error) {
      console.error('Failed to refresh order data:', error);
    }
    return null;
  };
  
  // Update local order state when initialOrder prop changes
  useEffect(() => {
    if (initialOrder && JSON.stringify(initialOrder) !== JSON.stringify(order)) {
      console.log('Updating local order from prop:', initialOrder);
      setOrder(initialOrder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrder]);

  // Fetch complete order data when panel opens or order changes
  useEffect(() => {
    if (isOpen && initialOrder?.id) {
      // Always fetch fresh order data to get payments
      setLoading(true);
      refreshOrderData(initialOrder.id).finally(() => {
        setLoading(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialOrder?.id]);
  
  useEffect(() => {
    if (order) {
      // Set item quantities
      if (order.items) {
        const quantities = {};
        order.items.forEach(item => {
          quantities[item.id] = item.quantity;
        });
        setItemQuantities(quantities);
      }
      
      // Set payment amount to remaining balance
      const remainingAmount = getRemainingAmount(order);
      const paidAmount = calculatePaidAmount(order);
      const paymentStatus = getPaymentStatus(order);
      
      console.log('Payment calculations:', {
        order_number: order.order_number,
        total_amount: order.total_amount,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        payment_status: paymentStatus,
        payments: order.payments
      });
      
      setPaymentAmount(remainingAmount || 0);
    }
  }, [order]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimer) {
        clearTimeout(searchTimer);
      }
    };
  }, [searchTimer]);
  
  if (!order && !loading) return null;
  
  // Show loading state while fetching order
  if (loading && !order) {
    return (
      <Center h="400px">
        <VStack spacing={4}>
          <Spinner size="lg" color="blue.500" />
          <Text color="gray.500">Loading order details...</Text>
        </VStack>
      </Center>
    );
  }
  
  if (!order) return null;
  
  // Status configuration
  const statusConfig = {
    pending: { icon: AlertCircle, color: 'yellow', label: 'Pending' },
    confirmed: { icon: CheckCircle, color: 'blue', label: 'Confirmed' },
    preparing: { icon: ChefHat, color: 'orange', label: 'Preparing' },
    ready: { icon: Package, color: 'green', label: 'Ready' },
    served: { icon: Truck, color: 'purple', label: 'Served' },
    completed: { icon: CheckCircle, color: 'green', label: 'Completed' },
    cancelled: { icon: XCircle, color: 'red', label: 'Cancelled' },
  };
  
  const currentStatus = statusConfig[order.status?.toLowerCase()] || statusConfig.pending;
  
  // Calculate metrics
  const calculateDuration = () => {
    const orderTime = order.order_time || order.created_at;
    if (!orderTime) return { text: 'Just now', minutes: 0 };
    
    const created = new Date(orderTime);
    const now = new Date();
    const diffMinutes = Math.floor((now - created) / 1000 / 60);
    
    if (diffMinutes < 1) return { text: 'Just now', minutes: 0 };
    if (diffMinutes < 60) return { text: `${diffMinutes}m`, minutes: diffMinutes };
    return { text: `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m`, minutes: diffMinutes };
  };
  
  const duration = calculateDuration();
  const isUrgent = duration.minutes > 30 && ['pending', 'confirmed', 'preparing'].includes(order.status);
  
  // Get next action
  const getNextAction = () => {
    const actions = {
      pending: { label: 'Confirm', status: 'confirmed', icon: CheckCircle, color: 'blue' },
      confirmed: { label: 'Start Preparing', status: 'preparing', icon: ChefHat, color: 'orange' },
      preparing: { label: 'Ready', status: 'ready', icon: Package, color: 'green' },
      ready: { label: 'Serve', status: 'served', icon: Truck, color: 'purple' },
      served: getPaymentStatus(order) === 'paid' 
        ? { label: 'Complete', status: 'completed', icon: CheckCircle, color: 'green' }
        : null,
    };
    return actions[order.status?.toLowerCase()];
  };
  
  const nextAction = getNextAction();
  
  const handleStatusUpdate = async (newStatus) => {
    setLoading(true);
    try {
      await updateOrderStatus(order.id, newStatus);
      
      // Refresh order data to get updated status and payment info (including payments array)
      const updatedOrder = await refreshOrderData(order.id);
      
      // Ensure local state is updated
      if (updatedOrder) {
        setOrder(updatedOrder);
        console.log('Order status updated:', {
          order_number: updatedOrder.order_number,
          new_status: updatedOrder.status,
          payments: updatedOrder.payments,
          payment_status: getPaymentStatus(updatedOrder)
        });
      }
      
      toast({
        title: 'Status Updated',
        description: `Order #${order.order_number} is now ${newStatus}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // Call both refresh callbacks to update parent UI
      if (onRefresh) onRefresh();
      if (onOrderUpdate && updatedOrder) onOrderUpdate(updatedOrder);
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update order status',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleQuantityChange = async (itemId, newQuantity) => {
    if (newQuantity < 1) {
      // Remove item if quantity is 0
      await handleRemoveItem(itemId);
      return;
    }
    
    setItemQuantities(prev => ({ ...prev, [itemId]: newQuantity }));
    
    if (editMode) {
      try {
        await updateOrderItem(order.id, itemId, { quantity: newQuantity });
        
        // Refresh order data to get updated totals and items
        const updatedOrder = await refreshOrderData(order.id);
        
        toast({
          title: 'Item Updated',
          status: 'success',
          duration: 2000,
        });
        
        // Update parent components
        if (onRefresh) onRefresh();
        if (onOrderUpdate && updatedOrder) onOrderUpdate(updatedOrder);
        
      } catch (error) {
        toast({
          title: 'Update Failed',
          status: 'error',
          duration: 3000,
        });
      }
    }
  };
  
  const handleRemoveItem = async (itemId) => {
    try {
      await removeOrderItem(order.id, itemId);
      
      // Refresh order data to get updated totals and items
      const updatedOrder = await refreshOrderData(order.id);
      
      toast({
        title: 'Item Removed',
        status: 'success',
        duration: 2000,
      });
      
      // Update parent components
      if (onRefresh) onRefresh();
      if (onOrderUpdate && updatedOrder) onOrderUpdate(updatedOrder);
      
    } catch (error) {
      toast({
        title: 'Failed to remove item',
        status: 'error',
        duration: 3000,
      });
    }
  };
  
  const handlePaymentComplete = async (paymentResult) => {
    // Refresh order data after payment to get updated payment status (with payments array)
    const updatedOrder = await refreshOrderData(order.id);
    
    // Reset payment form based on new remaining amount
    const newRemainingAmount = updatedOrder ? getRemainingAmount(updatedOrder) : 0;
    setPaymentAmount(newRemainingAmount);
    setReceivedAmount(newRemainingAmount);
    setTransactionId('');
    
    if (onRefresh) onRefresh();
    if (onOrderUpdate && updatedOrder) onOrderUpdate(updatedOrder);
  };
  
  // Handle inline payment processing
  const handleInlinePayment = async () => {
    if (!paymentAmount || paymentAmount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount',
        status: 'error',
        duration: 3000,
      });
      return;
    }
    
    if ((paymentMethod === 'card' || paymentMethod === 'digital_wallet') && !transactionId) {
      toast({
        title: 'Transaction ID Required',
        description: 'Please enter a transaction ID for online payment',
        status: 'error',
        duration: 3000,
      });
      return;
    }
    
    setIsProcessingPayment(true);
    
    try {
      let result;
      
      if (paymentMethod === 'room_charge') {
        // Handle room charge
        if (!selectedGuest) {
          toast({
            title: 'Guest Required',
            description: 'Please select a guest for room charge',
            status: 'error',
            duration: 3000,
          });
          setIsProcessingPayment(false);
          return;
        }
        
        const response = await ApiClient.post(`/api/pos/api/orders/${order.id}/charge_to_room/`, {
          guest_id: selectedGuest.guest_id,
          amount: paymentAmount,
        });
        
        result = response.data;
      } else {
        // Handle cash, card, digital wallet payments
        // Map frontend payment methods to backend expected values
        const methodMapping = {
          'cash': 'cash',
          'card': 'credit_card',
          'digital_wallet': 'mobile_payment',
          'room_charge': 'room_charge'
        };
        
        const paymentPayload = {
          order_id: order.id,
          method: methodMapping[paymentMethod] || paymentMethod,
          amount: paymentAmount,
          transaction_id: transactionId,
          notes: paymentMethod === 'cash' ? `Received: ${formatPrice(receivedAmount)}` : '',
          received_amount: paymentMethod === 'cash' ? receivedAmount : paymentAmount,
        };
        
        result = await processFlexiblePayment(order.id, paymentPayload);
      }
      
      // Calculate change for cash payment
      const changeAmount = paymentMethod === 'cash' ? receivedAmount - paymentAmount : 0;
      
      toast({
        title: 'Payment Successful',
        description: changeAmount > 0 
          ? `Payment processed. Change: ${formatPrice(changeAmount)}`
          : 'Payment processed successfully',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      
      // Refresh order data to get updated payment status (with payments array)
      const updatedOrder = await refreshOrderData(order.id);
      
      // Reset payment fields based on new remaining amount
      const newRemainingAmount = updatedOrder ? getRemainingAmount(updatedOrder) : 0;
      setPaymentAmount(newRemainingAmount);
      setReceivedAmount(newRemainingAmount);
      setTransactionId('');
      setSelectedGuest(null);
      
      // Refresh order data
      if (onRefresh) onRefresh();
      if (onOrderUpdate && updatedOrder) onOrderUpdate(updatedOrder);
      
    } catch (error) {
      toast({
        title: 'Payment Failed',
        description: error.response?.data?.message || error.message || 'Failed to process payment',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };
  
  // Load menu items with search (debounced)
  const loadMenuItems = async (query = '') => {
    setLoadingMenuItems(true);
    try {
      let items;
      if (query.trim()) {
        // Use search API when there's a query
        items = await MenuService.searchMenuItems(query, {
          restaurantId: order.restaurant,
          availableOnly: true
        });
      } else {
        // Load all items when no query
        const response = await ApiClient.get('/api/pos/api/menu-items/', {
          params: {
            restaurant_id: order.restaurant,
            is_available: true
          }
        });
        items = response.data.results || response.data;
      }
      setMenuItems(items);
    } catch (error) {
      console.error('Failed to load menu items:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to load menu items';
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoadingMenuItems(false);
    }
  };

  // Debounced search handler
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    
    // Clear existing timer
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    
    // Set new timer for debounced search
    const newTimer = setTimeout(() => {
      loadMenuItems(value);
    }, 300); // 300ms debounce
    
    setSearchTimer(newTimer);
  };
  
  // Handle opening item selector
  const handleOpenItemSelector = () => {
    setSearchQuery(''); // Reset search
    setSelectedMenuItem(null); // Reset selection
    setItemQuantity(1); // Reset quantity
    loadMenuItems(); // Load initial items
    onItemSelectorOpen();
  };
  
  // Handle adding item to order
  const handleAddItemToOrder = async () => {
    if (!selectedMenuItem || itemQuantity < 1) {
      toast({
        title: 'Invalid Selection',
        description: 'Please select an item and quantity',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    setLoading(true);
    try {
      // Use the addItemToOrder function from context
      await addItemToOrder(
        order.id,
        selectedMenuItem.id,
        itemQuantity,
        '', // special instructions
        selectedMenuItem.price // pass the unit price
      );
      
      // Refresh order data to get updated items list
      const updatedOrder = await refreshOrderData(order.id);
      
      toast({
        title: 'Item Added',
        description: `Added ${itemQuantity}x ${selectedMenuItem.name} to order`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // Reset selection and close modal
      setSelectedMenuItem(null);
      setItemQuantity(1);
      setSearchQuery('');
      setMenuItems([]); // Clear cached items
      onItemSelectorClose();
      
      // Update parent component
      if (onOrderUpdate && updatedOrder) onOrderUpdate(updatedOrder);
      
    } catch (error) {
      console.error('Failed to add item:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add item to order',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };
  
  // No need to filter locally anymore - search is handled server-side
  const filteredMenuItems = menuItems;
  
  // Quick amount buttons for cash payment
  const quickAmounts = [10, 20, 50, 100];
  
  // Calculate change for cash payments
  const calculateChange = () => {
    if (paymentMethod === 'cash' && receivedAmount > paymentAmount) {
      return receivedAmount - paymentAmount;
    }
    return 0;
  };
  
  const handleShare = () => {
    navigator.clipboard.writeText(`Order #${order.order_number}`);
    toast({
      title: 'Order number copied',
      status: 'success',
      duration: 2000,
    });
  };
  
  // Mobile drawer for full screen on mobile
  if (isMobile) {
    return (
      <>
        <Drawer isOpen={isOpen} onClose={onClose} size="full" placement="right">
          <DrawerOverlay />
          <DrawerContent>
            <DrawerHeader borderBottomWidth="1px">
              <HStack justify="space-between">
                <HStack>
                  <IconButton
                    icon={<ArrowLeft />}
                    variant="ghost"
                    onClick={onClose}
                    aria-label="Back"
                  />
                  <Text fontSize="lg" fontWeight="bold">
                    Order #{order.order_number}
                  </Text>
                </HStack>
                <HStack>
                  <IconButton
                    icon={<Share2 />}
                    size="sm"
                    variant="ghost"
                    onClick={handleShare}
                  />
                  <IconButton
                    icon={<Printer />}
                    size="sm"
                    variant="ghost"
                    onClick={onPrintOpen}
                  />
                </HStack>
              </HStack>
            </DrawerHeader>
            <DrawerBody p={0}>
              {renderContent()}
            </DrawerBody>
          </DrawerContent>
        </Drawer>
        <PaymentModal
          isOpen={isPaymentOpen}
          onClose={onPaymentClose}
          order={order}
          onPaymentComplete={handlePaymentComplete}
        />
        <PrintPreview
          isOpen={isPrintOpen}
          onClose={onPrintClose}
          order={order}
          type="invoice"
        />
        <GuestSelector
          isOpen={showGuestSelector}
          onClose={() => setShowGuestSelector(false)}
          onGuestSelect={(guest) => {
            setSelectedGuest(guest);
            setShowGuestSelector(false);
          }}
        />
      </>
    );
  }
  
  function renderContent() {
    return (
      <Flex direction="column" h="full" overflow="hidden">
        {/* Fixed Header */}
        <Box w="full" p={4} borderBottomWidth="1px" borderColor={borderColor} bg={bg} flexShrink={0}>
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <HStack spacing={3}>
                <Circle 
                  size="36px" 
                  bg={`${currentStatus.color}.100`}
                  position="relative"
                >
                  <currentStatus.icon size={18} color={`${currentStatus.color}.600`} />
                  {['preparing', 'ready'].includes(order.status) && (
                    <Circle
                      size="10px"
                      bg={currentStatus.color}
                      position="absolute"
                      top="-2px"
                      right="-2px"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.5, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '50%',
                          backgroundColor: 'currentColor',
                        }}
                      />
                    </Circle>
                  )}
                </Circle>
                <VStack align="start" spacing={0}>
                  <HStack>
                    <Text fontWeight="bold" fontSize="md">
                      #{order.order_number}
                    </Text>
                    {isUrgent && (
                      <Badge colorScheme="red" variant="solid" fontSize="xs">
                        Urgent
                      </Badge>
                    )}
                  </HStack>
                  <HStack spacing={2}>
                    <Badge colorScheme={currentStatus.color} fontSize="xs">
                      {currentStatus.label}
                    </Badge>
                    <HStack spacing={1} fontSize="xs" color={mutedColor}>
                      <Timer size={12} />
                      <Text>{duration.text}</Text>
                    </HStack>
                  </HStack>
                </VStack>
              </HStack>
              
              {!isMobile && (
                <HStack>
                  <IconButton
                    icon={editMode ? <EyeOff /> : <Edit />}
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditMode(!editMode)}
                    aria-label={editMode ? "View mode" : "Edit mode"}
                  />
                  <IconButton
                    icon={<X />}
                    size="sm"
                    variant="ghost"
                    onClick={onClose}
                    aria-label="Close"
                  />
                </HStack>
              )}
            </HStack>
            
            {/* Quick Stats */}
            <Grid templateColumns="repeat(3, 1fr)" gap={2}>
              <GridItem>
                <Stat size="sm">
                  <StatLabel fontSize="xs">Items</StatLabel>
                  <StatNumber fontSize="md">{order.items?.length || 0}</StatNumber>
                </Stat>
              </GridItem>
              <GridItem>
                <Stat size="sm">
                  <StatLabel fontSize="xs">Total</StatLabel>
                  <StatNumber fontSize="md">{formatPrice(order.total_amount)}</StatNumber>
                </Stat>
              </GridItem>
              <GridItem>
                <Stat size="sm">
                  <StatLabel fontSize="xs">Payment</StatLabel>
                  <StatNumber fontSize="md">
                    <Badge
                      colorScheme={getPaymentStatusColor(order)}
                      fontSize="xs"
                    >
                      {getPaymentStatusText(order)}
                    </Badge>
                  </StatNumber>
                </Stat>
              </GridItem>
            </Grid>
          </VStack>
        </Box>
        
        {/* Scrollable Content Area */}
        <Tabs 
          index={activeTab} 
          onChange={setActiveTab} 
          variant="enclosed" 
          colorScheme="blue"
          size="sm"
          w="full"
          flex={1}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          <TabList px={4} pt={2} flexShrink={0}>
            <Tab fontSize="xs">
              <HStack spacing={1}>
                <ShoppingBag size={14} />
                <Text>Items</Text>
              </HStack>
            </Tab>
            <Tab fontSize="xs">
              <HStack spacing={1}>
                <User size={14} />
                <Text>Customer</Text>
              </HStack>
            </Tab>
            <Tab fontSize="xs">
              <HStack spacing={1}>
                <Receipt size={14} />
                <Text>Payment</Text>
              </HStack>
            </Tab>
          </TabList>
          
          <TabPanels flex={1} overflowY="auto" overflowX="hidden">
            {/* Items Tab */}
            <TabPanel p={4}>
              <VStack spacing={3} align="stretch">
                {editMode && (
                  <Button
                    size="sm"
                    leftIcon={<Plus size={16} />}
                    variant="outline"
                    colorScheme="blue"
                    w="full"
                    onClick={handleOpenItemSelector}
                  >
                    Add Item
                  </Button>
                )}
                
                {order.items?.map((item, index) => (
                  <Box
                    key={item.id || index}
                    p={3}
                    bg={cardBg}
                    borderRadius="lg"
                    borderWidth="1px"
                    borderColor={borderColor}
                  >
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={1} flex={1}>
                        <HStack>
                          <Circle size="28px" bg={accentBg}>
                            <Coffee size={14} />
                          </Circle>
                          <Text fontWeight="medium" fontSize="sm">
                            {item.menu_item_name || 'Item'}
                          </Text>
                        </HStack>
                        
                        {item.special_instructions && (
                          <Alert status="info" size="sm" borderRadius="md" p={2}>
                            <AlertIcon boxSize={3} />
                            <Text fontSize="xs">{item.special_instructions}</Text>
                          </Alert>
                        )}
                        
                        <HStack spacing={2}>
                          <Text fontSize="xs" color={mutedColor}>
                            {formatPrice(item.unit_price)} each
                          </Text>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <Wrap>
                              {item.modifiers.map((mod, i) => (
                                <WrapItem key={i}>
                                  <Tag size="sm" variant="outline">
                                    {mod}
                                  </Tag>
                                </WrapItem>
                              ))}
                            </Wrap>
                          )}
                        </HStack>
                      </VStack>
                      
                      <VStack align="end" spacing={1}>
                        {editMode ? (
                          <HStack>
                            <NumberInput
                              size="sm"
                              min={0}
                              max={99}
                              value={itemQuantities[item.id] || item.quantity}
                              onChange={(value) => handleQuantityChange(item.id, parseInt(value))}
                              w="80px"
                            >
                              <NumberInputField />
                              <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                              </NumberInputStepper>
                            </NumberInput>
                            <IconButton
                              icon={<XCircle />}
                              size="sm"
                              colorScheme="red"
                              variant="ghost"
                              onClick={() => handleRemoveItem(item.id)}
                            />
                          </HStack>
                        ) : (
                          <Badge colorScheme="blue" variant="subtle">
                            Qty: {item.quantity}
                          </Badge>
                        )}
                        <Text fontWeight="bold" fontSize="sm">
                          {formatPrice(item.subtotal || item.quantity * item.unit_price)}
                        </Text>
                      </VStack>
                    </HStack>
                  </Box>
                ))}
                
                {order.notes && (
                  <Alert status="warning" borderRadius="lg">
                    <AlertIcon />
                    <Box>
                      <Text fontSize="sm" fontWeight="bold">Special Instructions</Text>
                      <Text fontSize="sm">{order.notes}</Text>
                    </Box>
                  </Alert>
                )}
              </VStack>
            </TabPanel>
            
            {/* Customer Tab */}
            <TabPanel p={4}>
              <VStack spacing={4} align="stretch">
                <Box p={4} bg={cardBg} borderRadius="lg">
                  <HStack spacing={3} mb={3}>
                    <Avatar name={order.customer_name || 'Guest'} size="md" />
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="medium">{order.customer_name || 'Walk-in Guest'}</Text>
                      <Text fontSize="sm" color={mutedColor}>Customer</Text>
                    </VStack>
                  </HStack>
                  
                  <VStack align="stretch" spacing={2}>
                    {order.table_number && (
                      <HStack justify="space-between">
                        <HStack>
                          <MapPin size={14} />
                          <Text fontSize="sm">Table</Text>
                        </HStack>
                        <Text fontSize="sm" fontWeight="medium">
                          {order.table_number}
                        </Text>
                      </HStack>
                    )}
                    
                    <HStack justify="space-between">
                      <HStack>
                        <Users size={14} />
                        <Text fontSize="sm">Party Size</Text>
                      </HStack>
                      <Text fontSize="sm" fontWeight="medium">
                        {order.party_size || '1'} guests
                      </Text>
                    </HStack>
                    
                    <HStack justify="space-between">
                      <HStack>
                        <Clock size={14} />
                        <Text fontSize="sm">Visit Time</Text>
                      </HStack>
                      <Text fontSize="sm" fontWeight="medium">
                        {new Date(order.created_at).toLocaleTimeString()}
                      </Text>
                    </HStack>
                  </VStack>
                </Box>
                
                {/* Customer History */}
                <Box>
                  <Text fontSize="sm" fontWeight="bold" mb={2}>Previous Orders</Text>
                  <Text fontSize="xs" color={mutedColor}>No previous orders found</Text>
                </Box>
              </VStack>
            </TabPanel>
            
            {/* Payment Tab - Enhanced with inline payment processing */}
            <TabPanel p={3}>
              <VStack spacing={3} align="stretch">
                {/* Compact Payment Summary */}
                <Box p={2} bg={cardBg} borderRadius="md">
                  <HStack justify="space-between" align="center">
                    <VStack align="start" spacing={0}>
                      <HStack spacing={3}>
                        <Text fontSize="xs" color={mutedColor}>Total: <Text as="span" fontWeight="bold">{formatPrice(order.total_amount)}</Text></Text>
                        {calculatePaidAmount(order) > 0 && (
                          <Text fontSize="xs" color="green.500">Paid: -{formatPrice(calculatePaidAmount(order))}</Text>
                        )}
                      </HStack>
                      {getPaymentStatus(order) !== 'paid' && (
                        <Text fontSize="sm" fontWeight="bold">
                          Balance: {formatPrice(getRemainingAmount(order))}
                        </Text>
                      )}
                    </VStack>
                    <Badge 
                      colorScheme={getPaymentStatusColor(order)}
                      fontSize="xs"
                    >
                      {getPaymentStatusText(order)}
                    </Badge>
                  </HStack>
                </Box>
                
                {getPaymentStatus(order) !== 'paid' ? (
                  <>
                    {/* Compact Payment Method Selection */}
                    <HStack spacing={1} justify="center">
                      <Button
                        size="xs"
                        variant={paymentMethod === 'cash' ? 'solid' : 'ghost'}
                        colorScheme={paymentMethod === 'cash' ? 'green' : 'gray'}
                        leftIcon={<DollarSign size={14} />}
                        onClick={() => setPaymentMethod('cash')}
                      >
                        Cash
                      </Button>
                      <Button
                        size="xs"
                        variant={paymentMethod === 'card' ? 'solid' : 'ghost'}
                        colorScheme={paymentMethod === 'card' ? 'blue' : 'gray'}
                        leftIcon={<CreditCard size={14} />}
                        onClick={() => setPaymentMethod('card')}
                      >
                        Card
                      </Button>
                      <Button
                        size="xs"
                        variant={paymentMethod === 'digital_wallet' ? 'solid' : 'ghost'}
                        colorScheme={paymentMethod === 'digital_wallet' ? 'purple' : 'gray'}
                        leftIcon={<Volume2 size={14} />}
                        onClick={() => setPaymentMethod('digital_wallet')}
                      >
                        Digital
                      </Button>
                      <Button
                        size="xs"
                        variant={paymentMethod === 'room_charge' ? 'solid' : 'ghost'}
                        colorScheme={paymentMethod === 'room_charge' ? 'orange' : 'gray'}
                        leftIcon={<Users size={14} />}
                        onClick={() => setPaymentMethod('room_charge')}
                      >
                        Room
                      </Button>
                    </HStack>
                    
                    {/* Simplified Payment Form */}
                    <Box p={2} bg={cardBg} borderRadius="md">
                      <VStack spacing={2} align="stretch">
                        {/* Single Payment Amount Field */}
                        <InputGroup size="sm">
                          <InputLeftElement>
                            <DollarSign size={14} />
                          </InputLeftElement>
                          <Input
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                            placeholder="Payment Amount"
                          />
                        </InputGroup>
                      
                        {(paymentMethod === 'card' || paymentMethod === 'digital_wallet') && (
                          <HStack spacing={2}>
                            <InputGroup size="sm" flex={1}>
                              <InputLeftElement>
                                <Hash size={14} />
                              </InputLeftElement>
                              <Input
                                value={transactionId}
                                onChange={(e) => setTransactionId(e.target.value)}
                                placeholder="Transaction ID"
                              />
                            </InputGroup>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setTransactionId(`TXN-${Date.now()}`)}
                            >
                              Auto
                            </Button>
                          </HStack>
                        )}
                      
                        {paymentMethod === 'room_charge' && (
                          <Button
                            size="sm"
                            variant="outline"
                            w="full"
                            onClick={() => setShowGuestSelector(true)}
                            fontSize="xs"
                          >
                            {selectedGuest 
                              ? `${selectedGuest.guest_name} - Rm ${selectedGuest.room_number}`
                              : 'Select Guest'}
                          </Button>
                        )}
                      </VStack>
                    </Box>
                    
                    {/* Compact Process Payment Button */}
                    <Button
                      size="sm"
                      w="full"
                      colorScheme="green"
                      leftIcon={<CreditCard size={14} />}
                      onClick={handleInlinePayment}
                      isLoading={isProcessingPayment}
                      isDisabled={
                        !paymentAmount || 
                        paymentAmount <= 0 ||
                        ((paymentMethod === 'card' || paymentMethod === 'digital_wallet') && !transactionId) ||
                        (paymentMethod === 'room_charge' && !selectedGuest)
                      }
                    >
                      Process Payment
                    </Button>
                  </>
                ) : (
                  <Alert status="success">
                    <AlertIcon />
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="bold">Order Fully Paid</Text>
                      <Text fontSize="xs">No payment required</Text>
                    </VStack>
                  </Alert>
                )}
                
                {/* Payment History */}
                {order.payments && order.payments.length > 0 && (
                  <Box>
                    <Text fontSize="sm" fontWeight="bold" mb={2}>Payment History</Text>
                    <VStack align="stretch" spacing={2}>
                      {order.payments.map((payment, index) => (
                        <HStack
                          key={index}
                          p={2}
                          bg={cardBg}
                          borderRadius="md"
                          justify="space-between"
                        >
                          <HStack>
                            <CreditCard size={14} />
                            <Text fontSize="sm">{payment.method || payment.payment_method}</Text>
                            {payment.status && (
                              <Badge size="xs" colorScheme={payment.status === 'completed' ? 'green' : 'yellow'}>
                                {payment.status}
                              </Badge>
                            )}
                          </HStack>
                          <Text fontSize="sm" fontWeight="bold">
                            {formatPrice(payment.amount)}
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                )}
              </VStack>
            </TabPanel>
          </TabPanels>
        </Tabs>
        
        {/* Fixed Action Footer */}
        <Box w="full" p={4} borderTopWidth="1px" borderColor={borderColor} bg={bg} flexShrink={0}>
          <VStack spacing={3}>
            {nextAction && (
              <Button
                w="full"
                size="md"
                colorScheme={nextAction.color}
                leftIcon={<nextAction.icon size={18} />}
                onClick={() => handleStatusUpdate(nextAction.status)}
                isLoading={loading}
              >
                {nextAction.label}
              </Button>
            )}
            
            <HStack w="full" spacing={2}>
              <Button
                flex={1}
                size="sm"
                variant="outline"
                leftIcon={<Printer size={14} />}
                onClick={onPrintOpen}
              >
                Print
              </Button>
              <Button
                flex={1}
                size="sm"
                variant="outline"
                leftIcon={<Send size={14} />}
              >
                Send
              </Button>
              {order.status === 'pending' && (
                <Button
                  flex={1}
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  leftIcon={<XCircle size={14} />}
                  onClick={() => handleStatusUpdate('cancelled')}
                >
                  Cancel
                </Button>
              )}
            </HStack>
          </VStack>
        </Box>
      </Flex>
    );
  }
  
  // Desktop side panel
  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <MotionBox
            position="fixed"
            right={0}
            top={0}
            h="100vh"
            w={panelWidth}
            bg={bg}
            boxShadow="xl"
            zIndex={1000}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            borderLeftWidth="1px"
            borderColor={borderColor}
          >
            {renderContent()}
          </MotionBox>
        )}
      </AnimatePresence>
      
      {/* Backdrop for desktop */}
      {isOpen && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.300"
          zIndex={999}
          onClick={onClose}
        />
      )}
      
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={onPaymentClose}
        order={order}
        onPaymentComplete={handlePaymentComplete}
      />
      
      <PrintPreview
        isOpen={isPrintOpen}
        onClose={onPrintClose}
        order={order}
        type="invoice"
      />
      
      {/* Guest Selector Modal for Room Charge */}
      <GuestSelector
        isOpen={showGuestSelector}
        onClose={() => setShowGuestSelector(false)}
        onGuestSelect={(guest) => {
          setSelectedGuest(guest);
          setShowGuestSelector(false);
        }}
      />
      
      {/* Item Selector Modal */}
      <Modal isOpen={isItemSelectorOpen} onClose={onItemSelectorClose} size="xl">
        <ModalOverlay />
        <ModalContent maxH="80vh">
          <ModalHeader>
            <VStack align="start" spacing={1}>
              <Text>Add Item to Order</Text>
              <Text fontSize="sm" color="gray.500">
                Order #{order?.order_number}
              </Text>
            </VStack>
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Search Bar */}
              <InputGroup>
                <InputLeftElement pointerEvents="none">
                  <Search size={16} />
                </InputLeftElement>
                <Input
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
                {searchQuery && (
                  <InputRightElement>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<X size={14} />}
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    />
                  </InputRightElement>
                )}
              </InputGroup>
              
              {/* Menu Items Grid */}
              {loadingMenuItems ? (
                <Center py={8}>
                  <Spinner size="lg" />
                </Center>
              ) : filteredMenuItems.length === 0 ? (
                <Alert status="info">
                  <AlertIcon />
                  {searchQuery ? 'No items match your search' : 'No menu items available'}
                </Alert>
              ) : (
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} maxH="400px" overflowY="auto">
                  {filteredMenuItems.map((item) => (
                    <Box
                      key={item.id}
                      p={3}
                      borderWidth="1px"
                      borderRadius="lg"
                      borderColor={selectedMenuItem?.id === item.id ? 'blue.500' : borderColor}
                      bg={selectedMenuItem?.id === item.id ? accentBg : 'transparent'}
                      cursor="pointer"
                      onClick={() => setSelectedMenuItem(item)}
                      _hover={{ bg: cardBg }}
                      transition="all 0.2s"
                    >
                      <HStack justify="space-between">
                        <VStack align="start" spacing={0} flex={1}>
                          <Text fontWeight="medium">{item.name}</Text>
                          {item.description && (
                            <Text fontSize="xs" color="gray.500" noOfLines={1}>
                              {item.description}
                            </Text>
                          )}
                        </VStack>
                        <Badge colorScheme="blue">
                          {formatPrice(parseFloat(item.price || 0))}
                        </Badge>
                      </HStack>
                    </Box>
                  ))}
                </SimpleGrid>
              )}
              
              {/* Selected Item and Quantity */}
              {selectedMenuItem && (
                <Box p={4} bg={cardBg} borderRadius="lg">
                  <VStack spacing={3} align="stretch">
                    <HStack justify="space-between">
                      <Text fontWeight="medium">Selected: {selectedMenuItem.name}</Text>
                      <Text fontWeight="bold">{formatPrice(parseFloat(selectedMenuItem.price || 0))}</Text>
                    </HStack>
                    
                    <HStack>
                      <Text>Quantity:</Text>
                      <NumberInput
                        value={itemQuantity}
                        onChange={(_, value) => setItemQuantity(value)}
                        min={1}
                        max={99}
                        size="sm"
                        w="100px"
                      >
                        <NumberInputField />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                      <Spacer />
                      <Text fontWeight="bold">
                        Total: {formatPrice(parseFloat(selectedMenuItem.price || 0) * itemQuantity)}
                      </Text>
                    </HStack>
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>
          
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onItemSelectorClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleAddItemToOrder}
              isDisabled={!selectedMenuItem || itemQuantity < 1}
              isLoading={loading}
            >
              Add to Order
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default OrderDetailPanel;