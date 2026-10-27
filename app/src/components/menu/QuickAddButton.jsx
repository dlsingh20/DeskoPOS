import React, { useState, useEffect } from 'react';
import {
  Box,
  HStack,
  IconButton,
  Button,
  Text,
  useColorModeValue,
  useBreakpointValue,
  Fade,
  ScaleFade,
} from '@chakra-ui/react';
import { Plus, Minus, Check } from 'lucide-react';
import { usePOS } from '../../context/POSContext';

const QuickAddButton = ({
  item,
  onAddToCart,
  onUpdateCart,
  size = 'md',
  compact = false,
}) => {
  const { getCartItemQuantity, updateCartItem } = usePOS();
  const quantity = getCartItemQuantity(item.id);
  const [justAdded, setJustAdded] = useState(false);
  
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const successBg = useColorModeValue('green.50', 'green.900');
  const successColor = useColorModeValue('green.600', 'green.300');
  
  // Responsive button sizes for better touch targets on mobile
  const buttonSize = useBreakpointValue({ base: 'md', md: size });
  const iconButtonSize = useBreakpointValue({ base: 'sm', md: 'xs' });
  
  useEffect(() => {
    if (justAdded) {
      const timer = setTimeout(() => {
        setJustAdded(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [justAdded]);
  
  const handleMinus = () => {
    if (quantity > 1) {
      updateCartItem(item.id, { quantity: quantity - 1 });
    } else if (quantity === 1) {
      updateCartItem(item.id, { quantity: 0 }); // This will remove item from cart
    }
  };
  
  const handlePlus = () => {
    if (quantity === 0) {
      onAddToCart(item, 1);
    } else {
      updateCartItem(item.id, { quantity: quantity + 1 });
    }
    setJustAdded(true);
  };
  
  const handleQuickAdd = () => {
    if (quantity === 0) {
      onAddToCart(item, 1);
    } else {
      updateCartItem(item.id, { quantity: quantity + 1 });
    }
    setJustAdded(true);
  };
  
  // Compact mode for minimal space
  if (compact && size === 'sm') {
    if (quantity === 0) {
      return (
        <IconButton
          icon={justAdded ? <Check /> : <Plus />}
          size={{ base: 'md', md: 'sm' }}
          colorScheme={justAdded ? 'green' : 'highlight'}
          variant={justAdded ? 'solid' : 'outline'}
          onClick={handleQuickAdd}
          borderRadius="full"
          transition="all 0.2s"
          _hover={{ transform: 'scale(1.1)' }}
          minW={{ base: '44px', md: 'auto' }}
          minH={{ base: '44px', md: 'auto' }}
        />
      );
    }
    
    return (
      <ScaleFade in={quantity > 0} initialScale={0.9}>
        <HStack spacing={0} bg={bg} borderWidth="1px" borderColor={borderColor} borderRadius="full" p="1px">
          <IconButton
            icon={<Minus size={16} strokeWidth={3} />}
            size={{ base: 'sm', md: 'xs' }}
            variant="solid"
            bg="gray.300"
            color="black"
            _hover={{ bg: 'gray.400' }}
            onClick={handleMinus}
            isDisabled={quantity <= 0}
            borderRadius="full"
            minW={{ base: '32px', md: '24px' }}
            h={{ base: '32px', md: '24px' }}
          />
          <Text
            fontSize={{ base: 'sm', md: 'xs' }}
            fontWeight="bold"
            minW="20px"
            textAlign="center"
            color={justAdded ? successColor : 'inherit'}
          >
            {quantity}
          </Text>
          <IconButton
            icon={<Plus size={16} strokeWidth={3} />}
            size={{ base: 'sm', md: 'xs' }}
            variant="solid"
            bg="highlight.500"
            color="black"
            _hover={{ bg: 'highlight.600' }}
            onClick={handlePlus}
            borderRadius="full"
            minW={{ base: '32px', md: '24px' }}
            h={{ base: '32px', md: '24px' }}
          />
        </HStack>
      </ScaleFade>
    );
  }
  
  // Standard button with quantity controls
  if (quantity > 0) {
    return (
      <Box
        borderWidth="1px"
        borderColor={justAdded ? successColor : borderColor}
        borderRadius="lg"
        px={0}
        py={0.5}
        bg={ bg}
        transition="all 0.2s"
      >
        <HStack spacing={0} justify="space-between">
          <Button
            size={{ base: 'md', md: size === 'sm' ? 'sm' : 'md' }}
            variant="solid"
            bg="gray.300"
            color="white"
            fontSize={{ base: 'xl', md: 'lg' }}
            fontWeight="bold"
            _hover={{ bg: 'gray.400' }}
            onClick={handleMinus}
            isDisabled={quantity <= 0}
            minW={{ base: '40px', md: size === 'sm' ? '28px' : '42px' }}
            h={{ base: '40px', md: size === 'sm' ? '28px' : '42px' }}
            p={0}
          >
            −
          </Button>
          <Text
            fontSize={size === 'sm' ? 'xs' : 'sm'}
            fontWeight="bold"
            color={justAdded ? successColor : 'inherit'}
            minW="20px"
            textAlign="center"
          >
            {quantity}
          </Text>
          <Button
            size={{ base: 'md', md: size === 'sm' ? 'sm' : 'md' }}
            variant="solid"
            bg="highlight.500"
            color="white"
            fontSize={{ base: 'xl', md: 'lg' }}
            fontWeight="bold"
            _hover={{ bg: 'highlight.400' }}
            onClick={handlePlus}
            minW={{ base: '40px', md: size === 'sm' ? '28px' : '42px' }}
            h={{ base: '40px', md: size === 'sm' ? '28px' : '42px' }}
            p={0}
          >
            +
          </Button>
        </HStack>
      </Box>
    );
  }
  
  // Initial add button
  return (
    <Button
      size={size}
      colorScheme={justAdded ? 'green' : 'pos'}
      variant={justAdded ? 'solid' : 'outline'}
      leftIcon={justAdded ? <Check /> : <Plus />}
      onClick={handleQuickAdd}
      w={compact ? (size === 'sm' ? '80px' : '100px') : 'full'} // Fixed width when compact
      transition="all 0.2s"
      _hover={{
        transform: 'translateY(-1px)',
        boxShadow: 'md',
      }}
    >
      {justAdded ? 'Added' : 'Add'}
    </Button>
  );
};

export default QuickAddButton;