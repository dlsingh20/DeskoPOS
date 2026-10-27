import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Box,
  Grid,
  VStack,
  Text,
  Badge,
  Skeleton,
  SkeletonText,
  useColorModeValue,
  useBreakpointValue,
  Icon,
  Tooltip,
  HStack,
  Button,
  IconButton,
  Image,
} from '@chakra-ui/react';
import { Plus, Minus, Star, Info, Ban, Check } from 'lucide-react';
import QuickAddButton from './QuickAddButton';
import { usePOS } from '../../context/POSContext';

const CompactMenuGrid = ({
  items = [],
  onAddToCart,
  isLoading = false,
  viewMode = 'grid', // 'grid' | 'list' | 'compact'
  soldOutMode = false, // Whether we're in sold out management mode
}) => {
  const { getCartItemQuantity, updateCartItem, toggleItemAvailability, formatPrice } = usePOS();
  const [imageLoadStates, setImageLoadStates] = useState({});
  const [updatingItems, setUpdatingItems] = useState(new Set()); // Track which items are being updated
  const containerRef = useRef(null);
  
  const bg = useColorModeValue('white', 'gray.500');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const priceColor = useColorModeValue('pos.600', 'pos.400');
  
  // Responsive grid columns based on screen size
  const gridColumns = useBreakpointValue({
    base: 1,    // Mobile portrait: 1 column for better touch
    sm: 2,      // Mobile landscape: 2 columns
    md: 3,      // Tablet: 3 columns
    lg: 4,      // Desktop: 4 columns
    xl: 5,      // Large desktop: 5 columns
    '2xl': 6,   // Extra large: 6 columns
  });
  
  // Card size based on view mode and screen size
  const isMobile = useBreakpointValue({ base: true, sm: false });
  const cardSize = useMemo(() => {
    switch (viewMode) {
      case 'compact':
        return { 
          w: isMobile ? '100%' : '120px', 
          h: isMobile ? '110px' : '100px' 
        };
      case 'list':
        return { w: 'full', h: isMobile ? '70px' : '60px' };
      case 'grid':
      default:
        return { 
          w: isMobile ? '100%' : '140px', 
          h: isMobile ? '130px' : '120px' 
        };
    }
  }, [viewMode, isMobile]);
  
  const handleImageLoad = (itemId) => {
    setImageLoadStates(prev => ({ ...prev, [itemId]: 'loaded' }));
  };
  
  const handleImageError = (itemId) => {
    setImageLoadStates(prev => ({ ...prev, [itemId]: 'error' }));
  };
  
  
  const handleItemClick = (item) => {
    // In sold out mode, don't add to cart on click
    if (soldOutMode || !item.is_available) return;
    
    const currentQuantity = getCartItemQuantity(item.id);
    if (currentQuantity === 0) {
      onAddToCart(item, 1);
    } else {
      updateCartItem(item.id, { quantity: currentQuantity + 1 });
    }
  };
  
  const handleToggleAvailability = async (itemId) => {
    setUpdatingItems(prev => new Set([...prev, itemId]));
    try {
      await toggleItemAvailability(itemId);
    } catch (error) {
      console.error('Failed to toggle availability:', error);
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };
  
  const renderCompactCard = (item) => {
    const hasImage = item.has_image && item.image_url;
    const imageState = imageLoadStates[item.id] || 'loading';
    const quantity = getCartItemQuantity(item.id);
    const isInCart = quantity > 0;
    
    return (
      <Box
        key={item.id}
        bg={isInCart ? 'highlight.50' : bg}
        borderWidth="1px"
        borderColor={!item.is_available ? 'red.300' : (isInCart ? 'highlight.200' : borderColor)}
        borderRadius="lg"
        p={2}
        cursor="pointer"
        transition="all 0.2s"
        onClick={() => handleItemClick(item)}
        _hover={{
          bg: isInCart ? 'highlight.100' : hoverBg,
          transform: 'translateY(-2px)',
          boxShadow: 'md',
        }}
        w={cardSize.w}
        h={cardSize.h}
        position="relative"
        opacity={item.is_available ? 1 : 0.7}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <VStack spacing={1} align="center">
          <Text
              fontSize="sm"
              fontWeight="semibold"
              noOfLines={2}
              textAlign="center"
              lineHeight="short"
              mb={1}
            >
              {item.name}
            </Text>
            
            {/* Quick info badges */}
            {item.dietary_tags && item.dietary_tags.length > 0 && (
              <HStack spacing={1} mt={1}>
                <Badge size="xs" colorScheme="green" variant="subtle">
                  {item.dietary_tags[0].slice(0, 3)}
                </Badge>
              </HStack>
            )}
          
          {/* Display quantity badge if in cart */}
          {isInCart && (
            <Box
              position="absolute"
              top="2"
              right="2"
              bg="highlight.500"
              color="white"
              borderRadius="full"
              minW="24px"
              h="24px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontWeight="bold"
              fontSize="sm"
            >
              {quantity}
            </Box>
          )}
          
          {!item.is_available && (
            <Badge 
              position="absolute" 
              top="1" 
              left="1" 
              colorScheme="red" 
              variant="solid"
              fontSize="xs"
            >
              SOLD OUT
            </Badge>
          )}
          
          {/* Sold Out Toggle Button */}
          {soldOutMode && (
            <Tooltip label={item.is_available ? "Mark as sold out" : "Mark as available"} fontSize="xs">
              <IconButton
                position="absolute"
                bottom="1"
                right="1"
                icon={item.is_available ? <Ban /> : <Check />}
                size="xs"
                colorScheme={item.is_available ? "gray" : "green"}
                variant="solid"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAvailability(item.id);
                }}
                isLoading={updatingItems.has(item.id)}
                zIndex={2}
              />
            </Tooltip>
          )}
        </VStack>
      </Box>
    );
  };
  
  const renderListCard = (item) => {
    const hasImage = item.has_image && item.image_url;
    const quantity = getCartItemQuantity(item.id);
    const isInCart = quantity > 0;
    
    return (
      <Box
        key={item.id}
        bg={isInCart ? 'highlight.50' : bg}
        borderWidth="1px"
        borderColor={!item.is_available ? 'red.300' : (isInCart ? 'highlight.200' : borderColor)}
        borderRadius="lg"
        p={3}
        transition="all 0.2s"
        _hover={{
          bg: isInCart ? 'highlight.100' : hoverBg,
          boxShadow: 'sm',
        }}
        h={cardSize.h}
        opacity={item.is_available ? 1 : 0.7}
      >
        <HStack spacing={3} h="full" align="center" justify="space-between">
          {/* Item Details */}
          <VStack align="start" spacing={0} flex={1}>
            <Text fontSize={{ base: 'md', sm: 'sm' }} fontWeight="semibold" noOfLines={1}>
              {item.name}
            </Text>
            <Text fontSize={{ base: 'sm', sm: 'xs' }} fontWeight="medium" color={priceColor}>
              {formatPrice(item.price)}
            </Text>
          </VStack>
          
          {/* Quick Add Button with +/- for list view */}
          {item.is_available && (
            <QuickAddButton
              item={item}
              onAddToCart={onAddToCart}
              size="md"
              compact={true}
            />
          )}
          
          {!item.is_available && (
            <Badge colorScheme="red" variant="solid" fontSize="xs">
              SOLD OUT
            </Badge>
          )}
          
          {/* Sold Out Toggle in list mode */}
          {soldOutMode && (
            <Tooltip label={item.is_available ? "Mark as sold out" : "Mark as available"} fontSize="xs">
              <IconButton
                icon={item.is_available ? <Ban /> : <Check />}
                size="sm"
                colorScheme={item.is_available ? "gray" : "green"}
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAvailability(item.id);
                }}
                isLoading={updatingItems.has(item.id)}
              />
            </Tooltip>
          )}
        </HStack>
      </Box>
    );
  };
  
  const renderGridCard = (item) => {
    const hasImage = item.has_image && item.image_url;
    const quantity = getCartItemQuantity(item.id);
    const isInCart = quantity > 0;
    
    return (
      <Box
        key={item.id}
        bg={isInCart ? 'highlight.50' : bg}
        borderWidth="1px"
        borderColor={!item.is_available ? 'red.300' : (isInCart ? 'highlight.500' : borderColor)}
        borderRadius="lg"
        p={3}
        cursor="pointer"
        transition="all 0.2s"
        onClick={() => handleItemClick(item)}
        _hover={{
          bg: isInCart ? 'highlight.100' : hoverBg,
          transform: 'translateY(-2px)',
          boxShadow: 'lg',
        }}
        h={cardSize.h}
        opacity={item.is_available ? 1 : 0.7}
        position="relative"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <VStack spacing={2} align="center">
          <Text
              fontSize="md"
              fontWeight="semibold"
              noOfLines={2}
              textAlign="center"
              lineHeight="short"
            >
              {item.name}
            </Text>
            
            {/* Info Row */}
            {item.dietary_tags?.length > 0 && (
              <HStack spacing={1} justify="center">
                {item.dietary_tags?.slice(0, 2).map((tag, idx) => (
                  <Badge key={idx} size="xs" colorScheme="green" variant="subtle">
                    {tag.slice(0, 3)}
                  </Badge>
                ))}
              </HStack>
            )}
          
          {/* Display quantity badge if in cart */}
          {isInCart && (
            <Box
              position="absolute"
              top="2"
              right="2"
              bg="highlight.500"
              color="white"
              borderRadius="full"
              minW="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontWeight="bold"
              fontSize="md"
            >
              {quantity}
            </Box>
          )}
          
          {!item.is_available && (
            <Badge 
              position="absolute" 
              top="2" 
              left="2" 
              colorScheme="red" 
              variant="solid"
              fontSize="sm"
            >
              SOLD OUT
            </Badge>
          )}
          
          {/* Sold Out Toggle Button for Grid */}
          {soldOutMode && (
            <Tooltip label={item.is_available ? "Mark as sold out" : "Mark as available"} fontSize="xs">
              <IconButton
                position="absolute"
                bottom="2"
                right="2"
                icon={item.is_available ? <Ban /> : <Check />}
                size="sm"
                colorScheme={item.is_available ? "gray" : "green"}
                variant="solid"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAvailability(item.id);
                }}
                isLoading={updatingItems.has(item.id)}
                zIndex={2}
              />
            </Tooltip>
          )}
        </VStack>
      </Box>
    );
  };
  
  // Loading skeleton
  if (isLoading) {
    return (
      <Grid
        templateColumns={`repeat(${gridColumns}, 1fr)`}
        gap={3}
        p={4}
      >
        {[...Array(12)].map((_, index) => (
          <Box
            key={index}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="lg"
            p={3}
            h={{ base: '100px', sm: cardSize.h }}
          >
            <VStack spacing={2}>
              <SkeletonText noOfLines={2} spacing={2} w="full" />
              <Skeleton h="30px" w="full" />
            </VStack>
          </Box>
        ))}
      </Grid>
    );
  }
  
  // No items
  if (!items || items.length === 0) {
    return (
      <Box p={8} textAlign="center">
        <Text color="gray.300" fontSize="lg">
          No menu items available
        </Text>
      </Box>
    );
  }
  
  // Render based on view mode
  if (viewMode === 'list') {
    return (
      <VStack spacing={2} p={3} align="stretch">
        {items.map(item => renderListCard(item))}
      </VStack>
    );
  }
  
  if (viewMode === 'compact') {
    return (
      <Box p={3}>
        <Grid
          templateColumns={`repeat(auto-fill, minmax(${cardSize.w}, 1fr))`}
          gap={2}
          justifyItems="center"
        >
          {items.map(item => renderCompactCard(item))}
        </Grid>
      </Box>
    );
  }
  
  // Default grid view
  return (
    <Box p={4} ref={containerRef}>
      <Grid
        templateColumns={{
          base: 'repeat(1, 1fr)',  // Mobile portrait: 1 column
          sm: 'repeat(2, 1fr)',    // Mobile landscape: 2 columns
          md: 'repeat(3, 1fr)',    // Tablet: 3 columns
          lg: 'repeat(4, 1fr)',    // Desktop: 4 columns
          xl: 'repeat(5, 1fr)',    // Large: 5 columns
          '2xl': 'repeat(6, 1fr)', // XL: 6 columns
        }}
        gap={{ base: 2, sm: 3 }}
      >
        {items.map(item => renderGridCard(item))}
      </Grid>
    </Box>
  );
};

export default CompactMenuGrid;