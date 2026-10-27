import React from 'react';
import {
  Box,
  IconButton,
  Badge,
  Text,
  VStack,
  useColorModeValue,
  Slide,
} from '@chakra-ui/react';
import { ShoppingCart } from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * FloatingCartButton Component
 * Floating action button for mobile cart access with item count and total
 */
const FloatingCartButton = ({ onOpenCart, isVisible = true }) => {
  const { state, formatPrice } = usePOS();
  
  const bg = useColorModeValue('highlight.500', 'highlight.600');
  const hoverBg = useColorModeValue('highlight.600', 'highlight.700');
  const shadowColor = useColorModeValue('rgba(0,0,0,0.15)', 'rgba(0,0,0,0.3)');
  
  // Calculate cart totals
  const cartItemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = state.cart.reduce((sum, item) => sum + (parseFloat(item.menuItem.price || 0) * item.quantity), 0);
  
  // Don't show if cart is empty or not visible
  if (!isVisible || cartItemCount === 0) {
    return null;
  }

  return (
    <Slide
      direction="bottom"
      in={cartItemCount > 0}
      style={{ zIndex: 1000 }}
    >
      <Box
        position="fixed"
        bottom={{ base: '100px', lg: '30px' }} // Above mobile nav on mobile, normal on desktop
        right="20px"
        zIndex={1000}
        display={{ base: 'block', lg: 'none' }} // Only show on mobile/tablet
      >
        <Box
          bg={bg}
          borderRadius="full"
          boxShadow={`0 4px 20px ${shadowColor}`}
          cursor="pointer"
          onClick={onOpenCart}
          transition="all 0.3s ease"
          _hover={{
            bg: hoverBg,
            transform: 'scale(1.05)',
            boxShadow: `0 6px 24px ${shadowColor}`,
          }}
          _active={{
            transform: 'scale(0.95)',
          }}
          p={3}
          minW="120px"
          position="relative"
        >
          <VStack spacing={1}>
            <Box position="relative">
              <IconButton
                icon={<ShoppingCart />}
                variant="unstyled"
                color="white"
                fontSize="24px"
                size="lg"
                pointerEvents="none"
                minW="auto"
                h="auto"
              />
              
              {/* Item count badge */}
              <Badge
                position="absolute"
                top="-8px"
                right="-8px"
                borderRadius="full"
                bg="white"
                color={bg}
                fontSize="xs"
                fontWeight="bold"
                minW="20px"
                h="20px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                border="2px solid"
                borderColor={bg}
              >
                {cartItemCount > 99 ? '99+' : cartItemCount}
              </Badge>
            </Box>
            
            {/* Cart total */}
            <Text
              color="white"
              fontSize="sm"
              fontWeight="bold"
              textAlign="center"
              lineHeight="1"
            >
              {formatPrice(cartTotal)}
            </Text>
          </VStack>
        </Box>
        
        {/* Pulse animation for new items */}
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          bottom="0"
          borderRadius="full"
          bg={bg}
          opacity={0.4}
          animation="pulse 2s infinite"
          pointerEvents="none"
          sx={{
            '@keyframes pulse': {
              '0%': {
                transform: 'scale(1)',
                opacity: 0.4,
              },
              '50%': {
                transform: 'scale(1.1)',
                opacity: 0.2,
              },
              '100%': {
                transform: 'scale(1)',
                opacity: 0.4,
              },
            },
          }}
        />
      </Box>
    </Slide>
  );
};

export default FloatingCartButton;