import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  IconButton,
  Badge,
  Divider,
  Input,
  Select,
  Alert,
  AlertIcon,
  Icon,
  SimpleGrid,
  useColorModeValue,
  useToast,
  useDisclosure,
  ButtonGroup,
  Tooltip,
} from '@chakra-ui/react';
import { usePOS } from '../../context/POSContext';
import PaymentModal from '../payment/PaymentModal';
import HeldOrdersModal from './HeldOrdersModal';
import PrintService from '../../services/PrintService';
import orderService from '../../services/OrderService';
import { IS_DESKOPOS } from '../../services/backend';
import { Printer, Save, FileText, Send, FolderOpen, ChefHat, CreditCard, RefreshCw } from 'lucide-react';

const TabbedCartPanel = () => {
  const {
    state,
    removeFromCart,
    updateCartItem,
    clearCart,
    createOrder,
    formatPrice,
    selectTable,
    loadTables,
    holdOrder,
    loadHeldOrders,
  } = usePOS();
  
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [orderType, setOrderType] = useState(null); // No default selection
  const [showQuickInfo, setShowQuickInfo] = useState(false); // For showing table/customer info
  const [printingKOT, setPrintingKOT] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  
  // Auto-update order type when table selection changes
  useEffect(() => {
    if (state.selectedTable) {
      setOrderType('dine_in');
    }
  }, [state.selectedTable]);
  
  // Load tables when component mounts or restaurant changes
  useEffect(() => {
    if (state.selectedRestaurant && (!state.tables || state.tables.length === 0)) {
      loadTables();
    }
  }, [state.selectedRestaurant, state.tables, loadTables]);
  const [loading, setLoading] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  const { isOpen: isPaymentOpen, onOpen: onPaymentOpen, onClose: onPaymentClose } = useDisclosure();
  const { isOpen: isHeldOpen, onOpen: onHeldOpen, onClose: onHeldClose } = useDisclosure();
  const toast = useToast();
  
  // Keyboard shortcut for held orders
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ctrl+H or Cmd+H to open held orders
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        if (state.heldOrders && state.heldOrders.length > 0) {
          onHeldOpen();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [state.heldOrders, onHeldOpen]);
  
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const itemBg = useColorModeValue('gray.50', 'gray.700');
  
  // Calculate totals
  const subtotal = state.cart.reduce((total, item) => {
    const price = parseFloat(item.menuItem?.price) || 0;
    const quantity = parseInt(item.quantity) || 0;
    return total + (price * quantity);
  }, 0);
  // Per-category tax calculation
  const taxAmount = state.cart.reduce((totalTax, item) => {
    const price = parseFloat(item.menuItem?.price) || 0;
    const quantity = parseInt(item.quantity) || 0;
    const categoryTaxRate = parseFloat(item.menuItem?.category_tax_rate ?? item.menuItem?.category?.tax_rate ?? 0) / 100;
    return totalTax + (price * quantity * categoryTaxRate);
  }, 0);
  const total = subtotal + taxAmount;
  
  // Handle quantity update
  const handleQuantityChange = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      updateCartItem(itemId, { quantity: 0 }); // This will remove the item due to our context update
    } else {
      updateCartItem(itemId, { quantity: newQuantity });
    }
  };
  
  // Validate the cart is ready to become an order (shared by both CTAs).
  const validateReady = () => {
    if (state.cart.length === 0) {
      toast({
        title: 'Cart is Empty',
        description: 'Please add items to cart before creating order',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return false;
    }
    if (!orderType) {
      toast({
        title: 'Select Order Type',
        description: 'Choose Dine In or Takeaway first',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return false;
    }
    if (orderType === 'dine_in' && !state.selectedTable) {
      setShowQuickInfo(true);
      toast({
        title: 'Table Required',
        description: 'Please select a table for dine-in orders',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return false;
    }
    return true;
  };

  // Build the create-order payload from the current cart.
  const buildOrderData = () => ({
    restaurant: state.selectedRestaurant.id,
    table: orderType === 'dine_in' ? state.selectedTable?.id : null,
    type: orderType,
    customer_name: customerInfo.name.trim() || null,
    customer_phone: customerInfo.phone.trim() || null,
    customer_email: customerInfo.email.trim() || '',
    notes: customerInfo.notes.trim() || null,
    items: state.cart.map(item => ({
      menu_item: item.menuItem?.id || item.id,
      quantity: item.quantity,
      unit_price: parseFloat(item.menuItem?.price) || 0,
      special_instructions: item.specialInstructions || '',
    })),
  });

  // Reset the ticket for the next order (used after firing to the kitchen).
  const resetTicket = () => {
    clearCart();
    setCustomerInfo({ name: '', phone: '', email: '', notes: '' });
    setOrderType(null);
    setShowQuickInfo(false);
    selectTable(null);
  };

  // CTA 1 — Send to Kitchen: create the order (it enters the kitchen queue),
  // fire the physical KOT if a printer is connected, keep service moving.
  const handleSendToKitchen = async () => {
    if (!validateReady()) return;
    setLoading(true);
    try {
      const order = await createOrder(buildOrderData());
      setCreatedOrder(order);

      // DeskoPOS: send it to the kitchen on KOT 1 (a new order waits until it is sent)
      let kot = null;
      if (IS_DESKOPOS) {
        try {
          kot = await orderService.sendKot(order.id);
        } catch (sendErr) {
          toast({ title: 'Order saved, not sent to the kitchen', description: `${sendErr.message}. Send it from the order.`, status: 'warning', duration: 6000, isClosable: true });
        }
      }

      // Fire the KOT to the printer. Optional hardware — never block the
      // order (it's already in the kitchen queue) if no printer is present.
      try {
        await PrintService.printKOT({
          order_number: order.order_number,
          kotNumber: kot?.kot_number ?? null,
          items: (order.items || state.cart).map(item => ({
            quantity: item.quantity,
            menu_item_name: item.menu_item_name || item.menuItem?.name || item.name,
            special_instructions: item.special_instructions || item.specialInstructions || '',
          })),
          table_number: state.selectedTable?.table_number,
          customer_name: customerInfo.name,
          status: 'pending',
          order_time: order.order_time || new Date().toISOString(),
        });
      } catch (printErr) {
        // Printer not connected — the order still reached the kitchen queue.
      }

      toast({
        title: 'Sent to Kitchen',
        description: `Order #${order.order_number} is in the kitchen queue`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      resetTicket();
    } catch (error) {
      toast({
        title: 'Failed to Send Order',
        description: error.message || 'Please try again',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // CTA 2 — Pay: create the order if needed, then open the payment modal.
  const handlePay = async () => {
    if (!validateReady()) return;
    setLoading(true);
    try {
      let order = createdOrder;
      if (!order) {
        order = await createOrder(buildOrderData());
        setCreatedOrder(order);
      }
      onPaymentOpen();
    } catch (error) {
      toast({
        title: 'Failed to Create Order',
        description: error.message || 'Please try again',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handlePaymentComplete = () => {
    clearCart();
    setCustomerInfo({ name: '', phone: '', email: '', notes: '' });
    setCreatedOrder(null);
    setOrderType(null);
    setShowQuickInfo(false);
    selectTable(null);
  };
  
  // Print KOT (Kitchen Order Ticket)
  const handlePrintKOT = async () => {
    if (state.cart.length === 0) {
      toast({
        title: 'Cart is Empty',
        description: 'Please add items before printing KOT',
        status: 'warning',
        duration: 3000,
      });
      return;
    }
    
    setPrintingKOT(true);
    try {
      const kotData = {
        order_number: `TEMP-${Date.now()}`,
        items: state.cart.map(item => ({
          quantity: item.quantity,
          menu_item_name: item.menuItem?.name || item.name,
          special_instructions: item.specialInstructions || '',
        })),
        table_number: state.selectedTable?.table_number,
        customer_name: customerInfo.name,
        status: 'pending',
        order_time: new Date().toISOString(),
      };
      
      await PrintService.printKOT(kotData);
      
      toast({
        title: 'KOT Printed',
        description: 'Kitchen order ticket sent to printer',
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Print Failed',
        description: error.message || 'Failed to print KOT',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setPrintingKOT(false);
    }
  };
  
  // Hold/Save current cart
  const handleHoldOrder = async () => {
    if (state.cart.length === 0) {
      toast({
        title: 'Cart is Empty',
        description: 'Please add items before holding order',
        status: 'warning',
        duration: 3000,
      });
      return;
    }
    
    setSavingOrder(true);
    try {
      const holdData = {
        cart: state.cart,
        orderType,
        customerInfo,
        table: state.selectedTable,
        timestamp: new Date().toISOString(),
        total,
      };
      
      // Use POSContext's holdOrder function to properly save and update state
      holdOrder(holdData);
      
      // Reload held orders to ensure state is in sync
      loadHeldOrders();
      
      toast({
        title: 'Order Held',
        description: 'Order saved for later',
        status: 'success',
        duration: 3000,
      });
      
      // Clear cart after holding
      clearCart();
      setCustomerInfo({ name: '', phone: '', email: '', notes: '' });
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: 'Failed to hold order',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setSavingOrder(false);
    }
  };
  
  // Print Bill
  const handlePrintBill = async () => {
    if (!createdOrder) {
      toast({
        title: 'No Order',
        description: 'Please create an order first',
        status: 'warning',
        duration: 3000,
      });
      return;
    }
    
    try {
      await PrintService.printInvoice(createdOrder);
      toast({
        title: 'Bill Printed',
        description: 'Customer bill sent to printer',
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Print Failed',
        description: error.message || 'Failed to print bill',
        status: 'error',
        duration: 5000,
      });
    }
  };
  
  // Generate E-Bill — downloads the invoice as a standalone HTML file
  const handleEBill = async () => {
    if (!createdOrder) {
      toast({
        title: 'No Order',
        description: 'Please create an order first',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    try {
      const html = PrintService.generateInvoiceHtml(createdOrder);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `e-bill-${createdOrder.order_number || createdOrder.id}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'E-Bill Downloaded',
        description: `E-bill for order #${createdOrder.order_number} saved`,
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'E-Bill Failed',
        description: error.message || 'Failed to generate e-bill',
        status: 'error',
        duration: 5000,
      });
    }
  };
  
  
  // Check if mobile/tablet to adjust layout
  const isMobile = window.innerWidth < 1024;
  
  return (
    <>
      <Box 
        h="full" 
        bg={bg} 
        borderLeftWidth="1px" 
        borderColor={borderColor} 
        display="flex" 
        flexDirection="column"
        pb={{ base: "70px", lg: "0" }} // Account for mobile bottom nav
      >
        <VStack spacing={0} h="full" align="stretch">
          {/* Persistent Held Orders Bar - Very Top */}
          <Box 
            px={3} 
            py={1.5} 
            bg={useColorModeValue('orange.50', 'orange.900')}
            borderBottomWidth="1px" 
            borderColor={borderColor}
          >
            <HStack justify="space-between">
              <Tooltip label={`View held orders (Ctrl+H) - ${state.heldOrders?.length || 0} orders`} placement="bottom">
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="orange"
                  leftIcon={<FolderOpen size={14} />}
                  onClick={onHeldOpen}
                  fontSize="xs"
                  fontWeight="medium"
                  opacity={state.heldOrders?.length > 0 ? 1 : 0.6}
                  _hover={{ 
                    opacity: 1,
                    bg: useColorModeValue('orange.100', 'orange.800')
                  }}
                >
                  Held Orders
                  {state.heldOrders?.length > 0 && (
                    <Badge
                      ml={1}
                      colorScheme="orange"
                      fontSize="xs"
                      borderRadius="full"
                    >
                      {state.heldOrders.length}
                    </Badge>
                  )}
                </Button>
              </Tooltip>
              {state.heldOrders?.length > 0 && state.cart.length === 0 && (
                <Text fontSize="xs" color="orange.600" fontStyle="italic">
                  Load a held order to continue
                </Text>
              )}
            </HStack>
          </Box>
          
          {/* Header - table/order context anchor (always shows what this ticket is for) */}
          <Box px={4} py={2.5} borderBottomWidth="1px" borderColor={borderColor}>
            {/* Row 1: which table / order type this ticket rings into */}
            <HStack justify="space-between" mb={state.cart.length > 0 ? 1.5 : 0}>
              <HStack spacing={2} flex={1} minW={0}>
                {orderType === 'dine_in' ? (
                  state.selectedTable ? (
                    <Badge colorScheme="green" fontSize="xs" px={2} py={1} borderRadius="full" display="flex" alignItems="center" gap={1}>
                      <Box as="span" w="6px" h="6px" borderRadius="full" bg="green.500" />
                      Table {state.selectedTable.table_number}
                    </Badge>
                  ) : (
                    <Badge colorScheme="orange" fontSize="xs" px={2} py={1} borderRadius="full">
                      Select a table
                    </Badge>
                  )
                ) : orderType === 'takeaway' ? (
                  <Badge colorScheme="purple" fontSize="xs" px={2} py={1} borderRadius="full">
                    Takeaway{customerInfo.name ? ` · ${customerInfo.name}` : ''}
                  </Badge>
                ) : (
                  <Text fontSize="sm" color="gray.500">No order type</Text>
                )}
                {orderType === 'dine_in' && state.selectedTable?.capacity ? (
                  <Text fontSize="xs" color="gray.500">· {state.selectedTable.capacity} seats</Text>
                ) : null}
                {createdOrder && (
                  <Text fontSize="xs" color="gray.500" noOfLines={1}>· #{createdOrder.order_number}</Text>
                )}
              </HStack>
              {orderType && (
                <Button
                  size="xs"
                  variant="ghost"
                  leftIcon={<RefreshCw size={12} />}
                  onClick={() => setShowQuickInfo(true)}
                  fontSize="xs"
                  flexShrink={0}
                >
                  Change
                </Button>
              )}
            </HStack>

            {/* Row 2: item count + clear (only when a cart exists) */}
            {state.cart.length > 0 && (
              <HStack justify="space-between">
                <Badge colorScheme="blue" fontSize="xs" px={2} borderRadius="full">
                  {state.cart.length} {state.cart.length === 1 ? 'item' : 'items'}
                </Badge>
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  onClick={clearCart}
                  fontSize="xs"
                >
                  Clear
                </Button>
              </HStack>
            )}
          </Box>
          
          {/* Main Content - Scrollable */}
          <Box flex={1} overflowY="auto" p={3}>
            {state.cart.length === 0 ? (
              <VStack spacing={4}>
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="medium">Cart is Empty</Text>
                    <Text fontSize="sm">Add items from the menu to get started</Text>
                  </Box>
                </Alert>
              </VStack>
            ) : (
              <VStack spacing={3} align="stretch">
                {/* Order Type Selection - No Label */}
                <SimpleGrid columns={2} gap={2}>
                    <Button
                      variant={orderType === 'dine_in' ? 'solid' : 'outline'}
                      colorScheme={orderType === 'dine_in' ? 'blue' : 'gray'}
                      onClick={() => { setOrderType('dine_in'); setShowQuickInfo(true); }}
                      size="sm"
                      h="40px"
                    >
                      Dine In
                    </Button>
                    <Button
                      variant={orderType === 'takeaway' ? 'solid' : 'outline'}
                      colorScheme={orderType === 'takeaway' ? 'blue' : 'gray'}
                      onClick={() => { setOrderType('takeaway'); setShowQuickInfo(true); }}
                      size="sm"
                      h="40px"
                    >
                      Takeaway
                    </Button>
                </SimpleGrid>
                
                {/* Quick Info - Table Selection Grid with Scroll */}
                {showQuickInfo && orderType === 'dine_in' && (
                  <Box 
                    borderWidth="1px" 
                    borderColor={borderColor} 
                    borderRadius="md" 
                    p={2}
                    maxH="88px" 
                    overflowY="auto"
                    css={{
                      '&::-webkit-scrollbar': {
                        width: '4px',
                      },
                      '&::-webkit-scrollbar-track': {
                        bg: 'transparent',
                      },
                      '&::-webkit-scrollbar-thumb': {
                        bg: borderColor,
                        borderRadius: '4px',
                      },
                    }}
                  >
                    <SimpleGrid columns={4} gap={1}>
                      {state.tables.map((table) => (
                        <Button
                          key={table.id}
                          size="sm"
                          variant={state.selectedTable?.id === table.id ? 'solid' : 'outline'}
                          colorScheme={state.selectedTable?.id === table.id ? 'blue' : 'gray'}
                          onClick={() => selectTable(table)}
                          isDisabled={!table.is_available && state.selectedTable?.id !== table.id}
                          h="36px"
                          fontSize="xs"
                        >
                          {table.table_number}
                        </Button>
                      ))}
                    </SimpleGrid>
                  </Box>
                )}
                
                {showQuickInfo && orderType === 'takeaway' && (
                  <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" p={2}>
                    <VStack spacing={2}>
                      <Input
                        size="sm"
                        placeholder="Customer Name"
                        value={customerInfo.name}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <Input
                        size="sm"
                        placeholder="Phone Number"
                        value={customerInfo.phone}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                        type="tel"
                      />
                    </VStack>
                  </Box>
                )}
                
                {/* Action Buttons Row */}
                {state.cart.length > 0 && (
                  <HStack spacing={2} justify="space-between">
                    <ButtonGroup size="sm" variant="outline">
                      <Tooltip label="Print KOT for kitchen">
                        <IconButton
                          icon={<Printer />}
                          onClick={handlePrintKOT}
                          isLoading={printingKOT}
                          aria-label="Print KOT"
                        />
                      </Tooltip>
                      <Tooltip label="Save order for later">
                        <IconButton
                          icon={<Save />}
                          onClick={handleHoldOrder}
                          isLoading={savingOrder}
                          aria-label="Hold Order"
                        />
                      </Tooltip>
                    </ButtonGroup>
                    
                    {createdOrder && (
                      <ButtonGroup size="sm" variant="outline">
                        <Tooltip label="Print customer bill">
                          <IconButton
                            icon={<FileText />}
                            onClick={handlePrintBill}
                            aria-label="Print Bill"
                          />
                        </Tooltip>
                        <Tooltip label="Send e-bill">
                          <IconButton
                            icon={<Send />}
                            onClick={handleEBill}
                            aria-label="E-Bill"
                          />
                        </Tooltip>
                      </ButtonGroup>
                    )}
                  </HStack>
                )}
                
                <Divider />
                
                {/* Cart Items */}
                <VStack spacing={2} align="stretch">
                      {state.cart.map((item, index) => (
                        <Box
                          key={`${item.menuItem?.id || item.id}-${index}`}
                          p={3}
                          borderRadius="lg"
                          bg={itemBg}
                          transition="all 0.2s"
                          _hover={{ transform: 'translateY(-1px)', shadow: 'sm' }}
                        >
                          <HStack spacing={2} align="center" justify="space-between">
                            <HStack flex={1} spacing={2}>
                              <Text fontWeight="semibold" fontSize="sm" noOfLines={1} flex={1}>
                                {item.name || item.menuItem?.name}
                              </Text>
                              <Text fontSize="sm" color="highlight.600" fontWeight="bold">
                                {formatPrice((parseFloat(item.menuItem?.price) || 0) * (item.quantity || 0))}
                              </Text>
                            </HStack>
                            
                            <HStack spacing={1}>
                              <Button
                                size="sm"
                                onClick={() => handleQuantityChange(item.menuItem?.id || item.id, item.quantity - 1)}
                                variant="solid"
                                bg="gray.300"
                                color="white"
                                _hover={{ bg: 'gray.600' }}
                                minW="32px"
                                h="32px"
                                p={0}
                                fontSize="lg"
                                fontWeight="bold"
                              >
                                −
                              </Button>
                              <Text minW="24px" textAlign="center" fontSize="sm" fontWeight="bold">
                                {item.quantity}
                              </Text>
                              <Button
                                size="sm"
                                onClick={() => handleQuantityChange(item.menuItem?.id || item.id, item.quantity + 1)}
                                variant="solid"
                                bg="highlight.500"
                                color="white"
                                _hover={{ bg: 'highlight.600' }}
                                minW="32px"
                                h="32px"
                                p={0}
                                fontSize="lg"
                                fontWeight="bold"
                              >
                                +
                              </Button>
                            </HStack>
                          </HStack>
                        </Box>
                      ))}
                </VStack>
                
              </VStack>
            )}
          </Box>
          
          {/* Fixed Bottom Action with Total - Always visible */}
          <Box 
            borderTopWidth="1px" 
            borderColor={borderColor}
            bg={bg}
          >
            {state.cart.length > 0 && (
              <VStack spacing={2} p={3}>
                {/* Compact Total Display */}
                <VStack spacing={1} w="full">
                  <HStack justify="space-between" w="full" fontSize="xs" color="gray.500">
                    <HStack spacing={4}>
                      <Text>Subtotal: {formatPrice(subtotal)}</Text>
                      <Text>Tax: {formatPrice(taxAmount)}</Text>
                    </HStack>
                  </HStack>
                  <Divider />
                  <HStack justify="space-between" w="full">
                    <Text fontSize="sm" fontWeight="600">Total</Text>
                    <Text fontSize="md" fontWeight="bold" color="blue.600">
                      {formatPrice(total)}
                    </Text>
                  </HStack>
                </VStack>
                
                {/* Two primary actions — fire to kitchen, or settle payment.
                    These are the two distinct moments in table service. */}
                {(() => {
                  const notReady = !orderType || (orderType === 'dine_in' && !state.selectedTable);
                  const hint = !orderType
                    ? 'Select an order type above'
                    : orderType === 'dine_in' && !state.selectedTable
                    ? 'Select a table above'
                    : null;
                  return (
                    <VStack spacing={2} w="full">
                      <SimpleGrid columns={2} gap={2} w="full">
                        <Button
                          colorScheme="green"
                          size="lg"
                          leftIcon={<ChefHat size={18} />}
                          onClick={handleSendToKitchen}
                          isLoading={loading}
                          loadingText="Sending..."
                          isDisabled={notReady}
                          h="48px"
                          fontSize="sm"
                        >
                          Send to Kitchen
                        </Button>
                        <Button
                          colorScheme="blue"
                          size="lg"
                          leftIcon={<CreditCard size={18} />}
                          onClick={handlePay}
                          isLoading={loading}
                          loadingText="Opening..."
                          isDisabled={notReady}
                          h="48px"
                          fontSize="sm"
                        >
                          Pay
                        </Button>
                      </SimpleGrid>
                      {hint && (
                        <Text fontSize="xs" color="orange.500">{hint}</Text>
                      )}
                    </VStack>
                  );
                })()}
              </VStack>
            )}
            
            {state.cart.length === 0 && (
              <Box p={4}>
                <Button
                  w="full"
                  colorScheme="gray"
                  size="lg"
                  isDisabled
                  h="48px"
                  fontSize="md"
                >
                  Cart is Empty
                </Button>
              </Box>
            )}
          </Box>
        </VStack>
      </Box>
      
      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={onPaymentClose}
        order={createdOrder}
        onPaymentComplete={handlePaymentComplete}
      />
      
      {/* Held Orders Modal */}
      <HeldOrdersModal
        isOpen={isHeldOpen}
        onClose={onHeldClose}
      />
    </>
  );
};

export default TabbedCartPanel;

