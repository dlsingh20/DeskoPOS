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
  Select,
  useColorModeValue,
  useToast,
  useDisclosure,
  Spacer,
  ButtonGroup,
} from '@chakra-ui/react';
import {
  Plus,
  Minus,
  X,
  Coffee,
  ShoppingBag,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import PaymentModal from '../payment/PaymentModal';

/**
 * MinimalWebCart Component
 * Ultra-minimalistic cart for web/desktop view with clean design
 */
const MinimalWebCart = () => {
  const {
    state,
    removeFromCart,
    updateCartItem,
    clearCart,
    createOrder,
    formatPrice,
    selectTable,
    loadTables,
  } = usePOS();
  
  const [orderType, setOrderType] = useState('dine_in');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  
  const { isOpen: isPaymentOpen, onOpen: onPaymentOpen, onClose: onPaymentClose } = useDisclosure();
  const toast = useToast();
  
  // Colors
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.700');
  const textMuted = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'gray.800');
  
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
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  
  // Load tables when restaurant is selected
  useEffect(() => {
    if (state.selectedRestaurant && (!state.tables || state.tables.length === 0)) {
      loadTables();
    }
  }, [state.selectedRestaurant, state.tables, loadTables]);
  
  // Auto-select table if one is already selected
  useEffect(() => {
    if (state.selectedTable) {
      setSelectedTableId(state.selectedTable.id.toString());
      setOrderType('dine_in');
    }
  }, [state.selectedTable]);
  
  // Handle quantity change
  const handleQuantityChange = (itemId, delta) => {
    const item = state.cart.find(i => (i.menuItem?.id || i.id) === itemId);
    if (!item) return;
    
    const newQuantity = item.quantity + delta;
    if (newQuantity <= 0) {
      removeFromCart(itemId);
    } else {
      updateCartItem(itemId, { ...item, quantity: newQuantity });
    }
  };
  
  // Create order
  const handleCreateOrder = async () => {
    if (state.cart.length === 0) {
      toast({
        title: 'Cart is empty',
        status: 'warning',
        duration: 2000,
      });
      return;
    }
    
    // Validate table for dine-in
    if (orderType === 'dine_in' && !selectedTableId) {
      toast({
        title: 'Please select a table',
        status: 'warning',
        duration: 2000,
      });
      return;
    }
    
    setLoading(true);
    try {
      // Select table if dine-in
      if (orderType === 'dine_in' && selectedTableId) {
        const table = state.tables.find(t => t.id === parseInt(selectedTableId));
        if (table) selectTable(table);
      }
      
      const orderData = {
        restaurant: state.selectedRestaurant?.id,
        table: orderType === 'dine_in' ? parseInt(selectedTableId) : null,
        type: orderType === 'dine_in' ? 'dine_in' : 'takeaway',
        items: state.cart.map(item => ({
          menu_item: item.menuItem?.id || item.id,
          quantity: item.quantity,
          unit_price: parseFloat(item.menuItem?.price) || 0,
          special_instructions: item.specialInstructions || '',
        }))
      };
      
      const order = await createOrder(orderData);
      setCreatedOrder(order);
      
      toast({
        title: `Order #${order.order_number} created`,
        status: 'success',
        duration: 2000,
      });
      
      onPaymentOpen();
    } catch (error) {
      toast({
        title: 'Failed to create order',
        description: error.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handlePaymentComplete = () => {
    clearCart();
    setCreatedOrder(null);
    setSelectedTableId('');
    setOrderType('dine_in');
  };
  
  const isEmpty = state.cart.length === 0;
  
  return (
    <>
      <Box 
        h="full" 
        bg={bg} 
        display="flex" 
        flexDirection="column"
        borderLeftWidth="1px"
        borderColor={borderColor}
      >
        {/* Minimal Header */}
        <HStack px={4} py={3} borderBottomWidth="1px" borderColor={borderColor}>
          <Text fontSize="md" fontWeight="600">Cart</Text>
          {!isEmpty && (
            <Badge
              bg="blue.500"
              color="white"
              borderRadius="full"
              px={2}
              fontSize="xs"
            >
              {itemCount}
            </Badge>
          )}
          <Spacer />
          {!isEmpty && (
            <Button
              size="xs"
              variant="ghost"
              onClick={clearCart}
              color={textMuted}
              _hover={{ color: 'red.500' }}
            >
              Clear
            </Button>
          )}
        </HStack>
        
        {/* Main Content */}
        <Box flex={1} overflowY="auto">
          {isEmpty ? (
            <VStack spacing={3} py={20}>
              <Text fontSize="sm" color={textMuted}>
                Cart is empty
              </Text>
              <Text fontSize="xs" color={textMuted}>
                Add items from menu
              </Text>
            </VStack>
          ) : (
            <VStack spacing={0} align="stretch">
              {/* Order Type Toggle */}
              <Box px={4} py={3}>
                <ButtonGroup size="sm" isAttached w="full">
                  <Button
                    flex={1}
                    variant={orderType === 'dine_in' ? 'solid' : 'ghost'}
                    colorScheme={orderType === 'dine_in' ? 'blue' : 'gray'}
                    onClick={() => setOrderType('dine_in')}
                    leftIcon={<Coffee size={14} />}
                    fontSize="xs"
                  >
                    Dine In
                  </Button>
                  <Button
                    flex={1}
                    variant={orderType === 'takeaway' ? 'solid' : 'ghost'}
                    colorScheme={orderType === 'takeaway' ? 'blue' : 'gray'}
                    onClick={() => setOrderType('takeaway')}
                    leftIcon={<ShoppingBag size={14} />}
                    fontSize="xs"
                  >
                    Takeaway
                  </Button>
                </ButtonGroup>
              </Box>
              
              {/* Table Selection - Minimal */}
              {orderType === 'dine_in' && (
                <Box px={4} pb={3}>
                  <Select
                    size="sm"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    placeholder="Select table"
                    fontSize="xs"
                    variant="filled"
                  >
                    {state.tables
                      ?.filter(table => table.is_available || table.id === state.selectedTable?.id)
                      .map(table => (
                        <option key={table.id} value={table.id}>
                          Table {table.table_number}
                        </option>
                      ))}
                  </Select>
                </Box>
              )}
              
              <Divider />
              
              {/* Cart Items - Ultra Minimal */}
              <VStack spacing={0} align="stretch" py={2}>
                {state.cart.map((item, index) => (
                  <Box
                    key={`${item.menuItem?.id || item.id}-${index}`}
                    px={4}
                    py={2}
                    _hover={{ bg: hoverBg }}
                    transition="background 0.2s"
                  >
                    <HStack spacing={2}>
                      {/* Quantity Controls - Compact */}
                      <HStack spacing={1}>
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<Minus size={12} />}
                          onClick={() => handleQuantityChange(item.menuItem?.id || item.id, -1)}
                          aria-label="Decrease"
                          minW="20px"
                          h="20px"
                        />
                        <Text fontSize="xs" minW="20px" textAlign="center" fontWeight="500">
                          {item.quantity}
                        </Text>
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<Plus size={12} />}
                          onClick={() => handleQuantityChange(item.menuItem?.id || item.id, 1)}
                          aria-label="Increase"
                          minW="20px"
                          h="20px"
                        />
                      </HStack>
                      
                      {/* Item Name */}
                      <Text fontSize="xs" flex={1} noOfLines={1}>
                        {item.menuItem?.name || item.name}
                      </Text>
                      
                      {/* Price */}
                      <Text fontSize="xs" fontWeight="500">
                        {formatPrice((parseFloat(item.menuItem?.price) || 0) * item.quantity)}
                      </Text>
                      
                      {/* Remove */}
                      <IconButton
                        size="xs"
                        variant="ghost"
                        icon={<X size={12} />}
                        onClick={() => removeFromCart(item.menuItem?.id || item.id)}
                        aria-label="Remove"
                        color={textMuted}
                        _hover={{ color: 'red.500' }}
                        minW="20px"
                        h="20px"
                      />
                    </HStack>
                    
                    {/* Special Instructions - Only if present */}
                    {item.specialInstructions && (
                      <Text fontSize="xs" color={textMuted} pl={12} mt={1} fontStyle="italic">
                        {item.specialInstructions}
                      </Text>
                    )}
                  </Box>
                ))}
              </VStack>
            </VStack>
          )}
        </Box>
        
        {/* Footer with Total and Action */}
        {!isEmpty && (
          <Box borderTopWidth="1px" borderColor={borderColor} p={4}>
            <VStack spacing={3}>
              {/* Simple Total */}
              <HStack w="full" justify="space-between">
                <Text fontSize="sm" color={textMuted}>Total</Text>
                <Text fontSize="lg" fontWeight="600">
                  {formatPrice(total)}
                </Text>
              </HStack>
              
              {/* Place Order Button */}
              <Button
                w="full"
                size="md"
                colorScheme="blue"
                onClick={handleCreateOrder}
                isLoading={loading}
                loadingText="Creating..."
                isDisabled={orderType === 'dine_in' && !selectedTableId}
                fontSize="sm"
              >
                Place Order
              </Button>
            </VStack>
          </Box>
        )}
      </Box>
      
      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={onPaymentClose}
        order={createdOrder}
        onPaymentComplete={handlePaymentComplete}
      />
    </>
  );
};

export default MinimalWebCart;