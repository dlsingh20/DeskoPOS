import React, { useState, useEffect } from 'react';
import {
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  VStack,
  HStack,
  Box,
  Text,
  Button,
  IconButton,
  Badge,
  Divider,
  useColorModeValue,
  Collapse,
  Input,
  Fade,
  ScaleFade,
  Spacer,
  Select,
  ButtonGroup,
} from '@chakra-ui/react';
import {
  Plus,
  Minus,
  X,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Coffee,
  ShoppingBag,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * MinimalCartDrawer Component
 * Ultra-minimalistic design focused on clarity and simplicity
 */
const MinimalCartDrawer = ({ isOpen, onClose }) => {
  const {
    state,
    updateCartItem,
    removeFromCart,
    clearCart,
    formatPrice,
    createOrder,
    loadTables,
    selectTable,
  } = usePOS();

  const [expandedItems, setExpandedItems] = useState({});
  const [orderNote, setOrderNote] = useState('');
  const [orderType, setOrderType] = useState('dine-in'); // 'dine-in' or 'takeaway'
  const [selectedTableId, setSelectedTableId] = useState(state.selectedTable?.id || '');

  // Colors
  const bg = useColorModeValue('white', 'gray.900');
  const secondaryBg = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.100', 'gray.700');
  const textMuted = useColorModeValue('gray.600', 'gray.400');
  const accentColor = useColorModeValue('blue.600', 'blue.400');
  const hoverBg = useColorModeValue('blue.700', 'blue.500');

  // Calculate totals
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = state.cart.reduce(
    (sum, item) => sum + (parseFloat(item.menuItem.price || 0) * item.quantity),
    0
  );
  // Per-category tax calculation
  const tax = state.cart.reduce((totalTax, item) => {
    const price = parseFloat(item.menuItem.price || 0);
    const categoryTaxRate = parseFloat(item.menuItem?.category_tax_rate ?? item.menuItem?.category?.tax_rate ?? 0) / 100;
    return totalTax + (price * item.quantity * categoryTaxRate);
  }, 0);
  const total = subtotal + tax;

  const toggleItemExpand = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleQuantityChange = (cartItemId, delta) => {
    const item = state.cart.find(i => i.id === cartItemId);
    if (!item) return;
    
    const newQuantity = item.quantity + delta;
    if (newQuantity < 1) {
      removeFromCart(cartItemId);
    } else {
      // Update cart item with new quantity
      const updates = { ...item, quantity: newQuantity };
      updateCartItem(cartItemId, updates);
    }
  };

  const handlePlaceOrder = async () => {
    try {
      // Select table if dine-in and table selected
      if (orderType === 'dine-in' && selectedTableId) {
        const table = state.tables.find(t => t.id === parseInt(selectedTableId));
        if (table) {
          selectTable(table);
        }
      }
      
      // Create order with proper structure
      const orderData = {
        items: state.cart.map(cartItem => ({
          menu_item: cartItem.menuItem?.id,
          quantity: cartItem.quantity,
          special_instructions: cartItem.specialInstructions || '',
        })),
        notes: orderNote,
        table: orderType === 'dine-in' ? (selectedTableId || state.selectedTable?.id) : null,
        restaurant: state.selectedRestaurant?.id,
        order_type: orderType,
      };
      
      await createOrder(orderData);
      setOrderNote('');
      setOrderType('dine-in');
      setSelectedTableId('');
      clearCart();
      onClose();
    } catch (error) {
      console.error('Failed to create order:', error);
    }
  };

  const isEmpty = state.cart.length === 0;
  
  // Load tables when restaurant is selected
  useEffect(() => {
    if (state.selectedRestaurant?.id && state.tables.length === 0) {
      loadTables(state.selectedRestaurant.id);
    }
  }, [state.selectedRestaurant, loadTables, state.tables.length]);
  
  // Update selected table when context changes
  useEffect(() => {
    if (state.selectedTable?.id) {
      setSelectedTableId(state.selectedTable.id);
    }
  }, [state.selectedTable]);

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
      <DrawerOverlay backdropFilter="blur(4px)" />
      <DrawerContent bg={bg}>
        <DrawerCloseButton />
        
        {/* Minimal Header */}
        <DrawerHeader pb={2} px={6}>
          <HStack spacing={3}>
            <ShoppingCart size={20} />
            <Text fontSize="lg" fontWeight="600">Cart</Text>
            {!isEmpty && (
              <Badge
                bg={accentColor}
                color="white"
                borderRadius="full"
                px={2}
                fontSize="xs"
              >
                {itemCount}
              </Badge>
            )}
          </HStack>
        </DrawerHeader>

        <Divider />

        <DrawerBody px={0} py={0}>
          {isEmpty ? (
            // Empty State - Minimal
            <VStack spacing={4} py={20}>
              <Box
                p={4}
                borderRadius="full"
                bg={secondaryBg}
              >
                <ShoppingCart size={32} color={textMuted} />
              </Box>
              <Text fontSize="md" color={textMuted}>
                Cart is empty
              </Text>
            </VStack>
          ) : (
            <VStack spacing={0} align="stretch">
              {/* Order Type Selection */}
              <Box
                px={6}
                py={4}
                borderBottomWidth="1px"
                borderColor={borderColor}
              >
                <VStack spacing={3} align="stretch">
                  {/* Order Type Toggle */}
                  <ButtonGroup size="sm" isAttached w="full">
                    <Button
                      flex={1}
                      variant={orderType === 'dine-in' ? 'solid' : 'outline'}
                      colorScheme={orderType === 'dine-in' ? 'blue' : 'gray'}
                      leftIcon={<Coffee size={16} />}
                      onClick={() => setOrderType('dine-in')}
                    >
                      Dine In
                    </Button>
                    <Button
                      flex={1}
                      variant={orderType === 'takeaway' ? 'solid' : 'outline'}
                      colorScheme={orderType === 'takeaway' ? 'blue' : 'gray'}
                      leftIcon={<ShoppingBag size={16} />}
                      onClick={() => setOrderType('takeaway')}
                    >
                      Takeaway
                    </Button>
                  </ButtonGroup>
                  
                  {/* Table Selection for Dine In */}
                  {orderType === 'dine-in' && (
                    <Select
                      size="sm"
                      placeholder="Select a table"
                      value={selectedTableId}
                      onChange={(e) => setSelectedTableId(e.target.value)}
                      variant="filled"
                    >
                      {state.tables
                        .filter(table => table.is_available || table.id === state.selectedTable?.id)
                        .map(table => (
                          <option key={table.id} value={table.id}>
                            Table {table.table_number} - {table.capacity} seats
                            {!table.is_available && ' (Occupied)'}
                          </option>
                        ))
                      }
                    </Select>
                  )}
                </VStack>
              </Box>

              {/* Cart Items - Minimal Design */}
              <VStack spacing={0} align="stretch" py={4}>
                {state.cart.map((item, index) => (
                  <Box key={item.id}>
                    <Box
                      px={6}
                      py={3}
                      transition="all 0.2s"
                      _hover={{ bg: secondaryBg }}
                    >
                      {/* Main Item Row */}
                      <HStack spacing={4} align="start">
                        {/* Quantity Controls - Inline Minimal */}
                        <HStack spacing={1}>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            icon={<Minus size={14} />}
                            onClick={() => handleQuantityChange(item.id, -1)}
                            aria-label="Decrease quantity"
                          />
                          <Text
                            fontSize="sm"
                            fontWeight="500"
                            minW="20px"
                            textAlign="center"
                          >
                            {item.quantity}
                          </Text>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            icon={<Plus size={14} />}
                            onClick={() => handleQuantityChange(item.id, 1)}
                            aria-label="Increase quantity"
                          />
                        </HStack>

                        {/* Item Details */}
                        <VStack align="start" spacing={0.5} flex={1}>
                          <Text fontSize="sm" fontWeight="500">
                            {item.menuItem.name}
                          </Text>
                          {item.specialInstructions && (
                            <Text fontSize="xs" color={textMuted} fontStyle="italic">
                              "{item.specialInstructions}"
                            </Text>
                          )}
                        </VStack>

                        {/* Price */}
                        <Text fontSize="sm" fontWeight="500">
                          {formatPrice(parseFloat(item.menuItem.price || 0) * item.quantity)}
                        </Text>

                        {/* Remove Button */}
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<X size={14} />}
                          onClick={() => removeFromCart(item.id)}
                          aria-label="Remove item"
                          color={textMuted}
                          _hover={{ color: 'red.500' }}
                        />
                      </HStack>

                      {/* Expandable Notes Section */}
                      <Collapse in={expandedItems[item.id]} animateOpacity>
                        <Box pt={2}>
                          <Input
                            size="sm"
                            placeholder="Add special instructions..."
                            value={item.specialInstructions || ''}
                            onChange={(e) => updateCartItem(item.id, { 
                              specialInstructions: e.target.value 
                            })}
                            variant="filled"
                            borderRadius="md"
                            fontSize="xs"
                          />
                        </Box>
                      </Collapse>

                      {/* Toggle Notes Button */}
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => toggleItemExpand(item.id)}
                        mt={1}
                        color={textMuted}
                        fontSize="xs"
                        leftIcon={
                          expandedItems[item.id] ? 
                          <ChevronUp size={12} /> : 
                          <ChevronDown size={12} />
                        }
                      >
                        {expandedItems[item.id] ? 'Hide' : 'Add'} note
                      </Button>
                    </Box>

                    {/* Separator */}
                    {index < state.cart.length - 1 && (
                      <Divider />
                    )}
                  </Box>
                ))}
              </VStack>

              {/* Order Note Section */}
              <Box
                px={6}
                py={4}
                borderTopWidth="1px"
                borderColor={borderColor}
                bg={secondaryBg}
              >
                <Input
                  size="sm"
                  placeholder="Add order note..."
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  variant="unstyled"
                  fontSize="sm"
                />
              </Box>
            </VStack>
          )}
        </DrawerBody>

        {!isEmpty && (
          <DrawerFooter px={6} py={4} borderTopWidth="1px" borderColor={borderColor}>
            <VStack spacing={4} w="full">
              {/* Minimal Price Summary */}
              <VStack spacing={2} w="full">
                <HStack justify="space-between" w="full">
                  <Text fontSize="sm" color={textMuted}>
                    Subtotal
                  </Text>
                  <Text fontSize="sm">
                    {formatPrice(subtotal)}
                  </Text>
                </HStack>
                
                <HStack justify="space-between" w="full">
                  <Text fontSize="sm" color={textMuted}>
                    Tax
                  </Text>
                  <Text fontSize="sm">
                    {formatPrice(tax)}
                  </Text>
                </HStack>

                <Divider />
                
                <HStack justify="space-between" w="full">
                  <Text fontSize="md" fontWeight="600">
                    Total
                  </Text>
                  <Text fontSize="md" fontWeight="600">
                    {formatPrice(total)}
                  </Text>
                </HStack>
              </VStack>

              {/* Action Buttons */}
              <HStack spacing={2} w="full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  color={textMuted}
                >
                  Clear
                </Button>
                <Spacer />
                <Button
                  size="md"
                  bg={accentColor}
                  color="white"
                  onClick={handlePlaceOrder}
                  isDisabled={orderType === 'dine-in' ? !selectedTableId : false}
                  isLoading={state.loading.orders}
                  loadingText="Placing..."
                  _hover={{ bg: hoverBg }}
                  px={8}
                >
                  Place Order
                </Button>
              </HStack>

              {/* Warning if no table selected for dine-in */}
              {orderType === 'dine-in' && !selectedTableId && (
                <HStack spacing={2} justify="center" w="full">
                  <AlertCircle size={14} color={textMuted} />
                  <Text fontSize="xs" color={textMuted}>
                    Please select a table for dine-in
                  </Text>
                </HStack>
              )}
            </VStack>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default MinimalCartDrawer;