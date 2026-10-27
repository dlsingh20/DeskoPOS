import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  CardBody,
  VStack,
  HStack,
  Box,
  Text,
  Button,
  IconButton,
  Badge,
  Icon,
  Image,
  Skeleton,
  useColorModeValue,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Collapse,
  useDisclosure,
  Tooltip,
} from '@chakra-ui/react';
import { 
  Plus, 
  Minus, 
  Clock, 
  Star, 
  Info,
  ShoppingCart,
  Ban,
  Check
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * MenuItemCard Component
 * Responsive menu item card optimized for all screen sizes
 */
const MenuItemCard = ({ 
  item, 
  onAddToCart,
  isCompact = false, // Use compact mode for mobile
  viewMode = 'standard' // 'standard' | 'compact' | 'ultra-compact'
}) => {
  const [quantity, setQuantity] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { isOpen: showDetails, onToggle } = useDisclosure();
  const imageRef = useRef(null);
  const { toggleItemAvailability, formatPrice } = usePOS();
  
  // Lazy loading with Intersection Observer
  useEffect(() => {
    const imageElement = imageRef.current;
    if (!imageElement || !item.has_image || !item.image_url) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px' // Start loading 50px before image comes into view
      }
    );
    
    observer.observe(imageElement);
    
    return () => {
      observer.disconnect();
    };
  }, [item.has_image, item.image_url]);
  
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const priceColor = useColorModeValue('pos.600', 'pos.400');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  
  if (!item) return null;

  const handleAddToCart = () => {
    if (onAddToCart && item.is_available) {
      onAddToCart(item, quantity);
      setQuantity(1); // Reset quantity after adding
    }
  };

  const handleToggleAvailability = async () => {
    setIsUpdating(true);
    try {
      await toggleItemAvailability(item.id);
    } catch (error) {
      console.error('Failed to toggle availability:', error);
    } finally {
      setIsUpdating(false);
    }
  };


  // Handle image loading states
  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(true);
  };

  // Render image or fallback
  const renderImage = (size) => {
    const hasValidImage = item.has_image && item.image_url && !imageError;
    
    if (hasValidImage) {
      return (
        <>
          {!imageLoaded && (
            <Skeleton
              width={size.w}
              height={size.h}
              borderRadius={size.borderRadius}
              position="absolute"
              top={0}
              left={0}
            />
          )}
          {/* Only load image when it's in view */}
          {isInView && (
            <Image
              src={item.image_url}
              alt={item.image_alt_text || item.name}
              width={size.w}
              height={size.h}
              objectFit="cover"
              borderRadius={size.borderRadius}
              onLoad={handleImageLoad}
              onError={handleImageError}
              opacity={imageLoaded ? 1 : 0}
              transition="opacity 0.3s ease"
              loading="lazy" // Native lazy loading as fallback
            />
          )}
        </>
      );
    }
    
    // Fallback to placeholder
    return (
      <Icon 
        as={Star} 
        boxSize={isCompact ? 5 : 8} 
        color="gray.300" 
      />
    );
  };

  // Ultra-compact card for maximum density
  if (viewMode === 'ultra-compact') {
    return (
      <Card
        bg={cardBg}
        borderColor={item.is_available ? borderColor : 'red.300'}
        borderWidth="1px"
        cursor="pointer"
        opacity={item.is_available ? 1 : 0.7}
        transition="all 0.2s"
        _hover={{ 
          borderColor: item.is_available ? 'pos.300' : 'red.400',
          shadow: 'sm',
          transform: 'translateY(-1px)' 
        }}
        size="xs"
        position="relative"
      >
        {/* Sold Out Overlay Badge */}
        {!item.is_available && (
          <Badge
            position="absolute"
            top="-1"
            right="-1"
            colorScheme="red"
            variant="solid"
            fontSize="xs"
            zIndex={1}
            borderRadius="md"
          >
            SOLD OUT
          </Badge>
        )}
        <CardBody p={2}>
          <HStack spacing={2} align="center">
            {/* Tiny Image */}
            <Box
              ref={imageRef}
              w="30px"
              h="30px"
              bg="gray.50"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
              overflow="hidden"
            >
              {renderImage({ w: '30px', h: '30px', borderRadius: 'md' })}
            </Box>

            {/* Name and Price */}
            <VStack align="start" spacing={0} flex={1} minW={0}>
              <Text 
                fontWeight="semibold" 
                fontSize="xs"
                noOfLines={1}
                color="gray.800"
              >
                {item.name}
              </Text>
              <Text 
                fontSize="xs" 
                color={priceColor} 
                fontWeight="bold"
              >
                {formatPrice(item.price)}
              </Text>
            </VStack>

            {/* Toggle availability button */}
            <Tooltip label={item.is_available ? "Mark as sold out" : "Mark as available"} fontSize="xs">
              <IconButton
                icon={item.is_available ? <Ban /> : <Check />}
                size="xs"
                colorScheme={item.is_available ? "gray" : "green"}
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAvailability();
                }}
                isLoading={isUpdating}
                borderRadius="full"
              />
            </Tooltip>
          </HStack>
        </CardBody>
      </Card>
    );
  }
  
  // Compact card for mobile
  if (isCompact || viewMode === 'compact') {
    return (
      <Card
        bg={cardBg}
        borderColor={item.is_available ? borderColor : 'red.300'}
        borderWidth="1px"
        cursor="pointer"
        opacity={item.is_available ? 1 : 0.8}
        transition="all 0.2s"
        _hover={{ 
          borderColor: item.is_available ? 'pos.300' : 'red.400',
          shadow: 'md' 
        }}
        size="sm"
        position="relative"
      >
        {/* Sold Out Badge */}
        {!item.is_available && (
          <Badge
            position="absolute"
            top="1"
            right="1"
            colorScheme="red"
            variant="solid"
            fontSize="xs"
            zIndex={1}
          >
            SOLD OUT
          </Badge>
        )}
        <CardBody p={3}>
          <HStack spacing={3} align="start">
            {/* Item Image */}
            <Box
              ref={imageRef}
              w="60px"
              h="60px"
              bg="gray.50"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="1px solid"
              borderColor="gray.200"
              flexShrink={0}
              position="relative"
              overflow="hidden"
            >
              {renderImage({ w: '60px', h: '60px', borderRadius: 'md' })}
            </Box>

            {/* Item Details */}
            <VStack align="start" spacing={1} flex={1} minW={0}>
              <Text 
                fontWeight="bold" 
                fontSize="sm"
                noOfLines={1}
                color="gray.800"
              >
                {item.name}
              </Text>
              
              <Text 
                fontSize="xs" 
                color={priceColor} 
                fontWeight="bold"
              >
                {formatPrice(item.price)}
              </Text>

              {/* Low stock indicator */}
              {item.track_inventory && item.current_stock !== null && item.current_stock <= 5 && item.current_stock > 0 && (
                <Badge colorScheme="orange" fontSize="9px" borderRadius="full" variant="subtle">
                  Low stock
                </Badge>
              )}
              {item.track_inventory && item.current_stock === 0 && (
                <Badge colorScheme="red" fontSize="9px" borderRadius="full" variant="subtle">
                  Out of stock
                </Badge>
              )}

              {/* Dietary badges - compact */}
              {item.dietary_tags && item.dietary_tags.length > 0 && (
                <HStack spacing={1}>
                  {item.dietary_tags.slice(0, 2).map((tag, index) => (
                    <Badge
                      key={index}
                      size="sm"
                      colorScheme="green"
                      variant="subtle"
                      fontSize="xs"
                    >
                      {tag.slice(0, 3)}
                    </Badge>
                  ))}
                </HStack>
              )}

              {/* Prep time - compact */}
              {item.preparation_time_minutes && (
                <HStack spacing={1} color="gray.300">
                  <Icon as={Clock} boxSize={3} />
                  <Text fontSize="xs">{item.preparation_time_minutes}m</Text>
                </HStack>
              )}
            </VStack>

            {/* Add to Cart & Toggle - Compact */}
            <VStack spacing={2} align="end">
              {/* Toggle Availability Button */}
              <Tooltip label={item.is_available ? "Mark as sold out" : "Mark as available"} fontSize="xs">
                <IconButton
                  icon={item.is_available ? <Ban /> : <Check />}
                  size="xs"
                  colorScheme={item.is_available ? "gray" : "green"}
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleAvailability();
                  }}
                  isLoading={isUpdating}
                />
              </Tooltip>
              
              {item.is_available ? (
                <>
                  <HStack spacing={1}>
                    <IconButton
                      icon={<Minus />}
                      size="xs"
                      variant="outline"
                      colorScheme="gray"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      isDisabled={quantity <= 1}
                    />
                    <Text fontSize="sm" fontWeight="medium" minW="20px" textAlign="center">
                      {quantity}
                    </Text>
                    <IconButton
                      icon={<Plus />}
                      size="xs"
                      variant="outline"
                      colorScheme="pos"
                      onClick={() => setQuantity(quantity + 1)}
                    />
                  </HStack>
                  <IconButton
                    icon={<ShoppingCart />}
                    size="sm"
                    colorScheme="pos"
                    onClick={handleAddToCart}
                    borderRadius="full"
                  />
                </>
              ) : (
                <Text fontSize="xs" color="red.500" fontWeight="medium">
                  Sold Out
                </Text>
              )}
            </VStack>
          </HStack>

          {/* Expandable description for mobile */}
          {item.description && (
            <> 
              <Button
                size="xs"
                variant="ghost"
                leftIcon={<Info size={12} />}
                onClick={onToggle}
                mt={2}
                fontSize="xs"
                h="auto"
                p={1}
              >
                Details
              </Button>
              <Collapse in={showDetails}>
                <Text fontSize="xs" color={descColor} mt={2}>
                  {item.description}
                </Text>
              </Collapse>
            </>
          )}
        </CardBody>
      </Card>
    );
  }

  // Full card for tablet/desktop
  return (
    <Card
      bg={cardBg}
      borderColor={item.is_available ? borderColor : 'red.300'}
      borderWidth="1px"
      cursor="pointer"
      opacity={item.is_available ? 1 : 0.85}
      transition="all 0.2s"
      _hover={{ 
        borderColor: item.is_available ? 'pos.300' : 'red.400',
        shadow: 'lg',
        transform: 'translateY(-2px)' 
      }}
      h="full"
      position="relative"
    >
      {/* Sold Out Overlay */}
      {!item.is_available && (
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          bottom="0"
          bg="blackAlpha.200"
          zIndex={1}
          borderRadius="md"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Badge
            colorScheme="red"
            variant="solid"
            fontSize="lg"
            px={4}
            py={2}
          >
            SOLD OUT
          </Badge>
        </Box>
      )}
      
      {/* Availability Toggle Button */}
      <Tooltip label={item.is_available ? "Mark as sold out" : "Mark as available"}>
        <IconButton
          position="absolute"
          top={2}
          right={2}
          icon={item.is_available ? <Ban /> : <Check />}
          size="sm"
          colorScheme={item.is_available ? "gray" : "green"}
          variant="solid"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleAvailability();
          }}
          isLoading={isUpdating}
          zIndex={2}
        />
      </Tooltip>
      
      <CardBody p={4}>
        <VStack align="stretch" spacing={4} h="full">
          {/* Item Image */}
          <Box
            ref={imageRef}
            w="full"
            h={{ base: "100px", md: "120px" }}
            bg="gray.50"
            borderRadius="lg"
            display="flex"
            alignItems="center"
            justifyContent="center"
            border="1px solid"
            borderColor="gray.200"
            position="relative"
            overflow="hidden"
          >
            {renderImage({ w: 'full', h: { base: '100px', md: '120px' }, borderRadius: 'lg' })}
          </Box>

          {/* Item Details */}
          <VStack align="start" spacing={3} flex={1}>
            <Text 
              fontWeight="bold" 
              fontSize={{ base: "md", lg: "lg" }}
              noOfLines={2} 
              color="gray.800"
              lineHeight="short"
            >
              {item.name}
            </Text>
            
            {item.description && (
              <Text 
                fontSize="sm"
                color={descColor} 
                noOfLines={3}
                lineHeight="normal"
              >
                {item.description}
              </Text>
            )}

            {/* Price and Prep Time */}
            <HStack justify="space-between" w="full">
              <HStack spacing={2}>
                <Text
                  fontWeight="bold"
                  color={priceColor}
                  fontSize={{ base: "lg", lg: "xl" }}
                >
                  {formatPrice(item.price)}
                </Text>
                {item.track_inventory && item.current_stock !== null && item.current_stock <= 5 && item.current_stock > 0 && (
                  <Badge colorScheme="orange" fontSize="xs" borderRadius="full" variant="subtle">
                    Low stock
                  </Badge>
                )}
                {item.track_inventory && item.current_stock === 0 && (
                  <Badge colorScheme="red" fontSize="xs" borderRadius="full" variant="subtle">
                    Out of stock
                  </Badge>
                )}
              </HStack>

              {item.preparation_time_minutes && (
                <HStack spacing={1} color="gray.300">
                  <Icon as={Clock} boxSize={3} />
                  <Text fontSize="xs" fontWeight="medium">
                    {item.preparation_time_minutes}m
                  </Text>
                </HStack>
              )}
            </HStack>

            {/* Dietary Tags */}
            {item.dietary_tags && item.dietary_tags.length > 0 && (
              <HStack spacing={2} flexWrap="wrap">
                {item.dietary_tags.slice(0, 3).map((tag, index) => (
                  <Badge
                    key={index}
                    size="sm"
                    colorScheme="green"
                    variant="subtle"
                    borderRadius="md"
                    fontSize="xs"
                  >
                    {tag}
                  </Badge>
                ))}
                {item.dietary_tags.length > 3 && (
                  <Text fontSize="xs" color="gray.300">
                    +{item.dietary_tags.length - 3}
                  </Text>
                )}
              </HStack>
            )}
          </VStack>

          {/* Add to Cart Section */}
          <VStack spacing={3}>
            {item.is_available ? (
              <>
                {/* Quantity Selector */}
                <HStack spacing={3} justify="center">
                  <Text fontSize="sm" fontWeight="medium">Qty:</Text>
                  <NumberInput
                    size="sm"
                    value={quantity}
                    min={1}
                    max={99}
                    onChange={(_, value) => setQuantity(value || 1)}
                    w="80px"
                  >
                    <NumberInputField textAlign="center" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </HStack>

                {/* Add to Cart Button */}
                <Button
                  w="full"
                  colorScheme="pos"
                  leftIcon={<Icon as={Plus} boxSize={4} />}
                  onClick={handleAddToCart}
                  size="md"
                  fontSize="md"
                  fontWeight="medium"
                  borderRadius="lg"
                  transition="all 0.2s"
                  _hover={{ transform: 'translateY(-1px)' }}
                >
                  Add to Cart
                </Button>
              </>
            ) : (
              <Button
                w="full"
                variant="outline"
                colorScheme="gray"
                isDisabled
                size="md"
              >
                Sold Out
              </Button>
            )}
          </VStack>
        </VStack>
      </CardBody>
    </Card>
  );
};

export default MenuItemCard;