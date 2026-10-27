import React from 'react';
import { usePOS } from '../../../context/POSContext';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  useColorModeValue,
  Icon,
  Tooltip,
  Progress,
} from '@chakra-ui/react';
import {
  Package,
  TrendingUp,
  DollarSign,
  Star,
} from 'lucide-react';

/**
 * Minimal Product Analytics Card
 * Clean design with consistent small text sizes
 */
const MinimalProductCard = ({ data, showTopItems = 5 }) => {
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const itemBg = useColorModeValue('gray.50', 'gray.800');
  const progressBg = useColorModeValue('gray.200', 'gray.700');
  
  const { formatPrice: formatCurrency } = usePOS();

  if (!data || !data.breakdown || !data.breakdown.topItems) return null;

  const { topItems } = data.breakdown;
  const displayItems = topItems.slice(0, showTopItems);

  // Calculate max values for scaling
  const maxQuantity = Math.max(...topItems.map(item => item.quantity));
  const maxRevenue = Math.max(...topItems.map(item => item.revenue));
  
  return (
    <Box
      bg={bg}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={borderColor}
      p={3}
      transition="all 0.2s"
    >
      <VStack align="stretch" spacing={3}>
        {/* Header */}
        <HStack justify="space-between">
          <HStack spacing={2}>
            <Icon as={Package} boxSize={3.5} color="orange.500" />
            <Text fontSize="sm" fontWeight="600" color={textColor}>
              Top Products
            </Text>
          </HStack>
          <Badge 
            colorScheme="orange" 
            variant="subtle"
            fontSize="xs"
            px={2}
            py={0.5}
            borderRadius="full"
          >
            {topItems.length} items
          </Badge>
        </HStack>
        
        {/* Product List */}
        <VStack align="stretch" spacing={2}>
          {displayItems.map((item, index) => {
            const quantityPercentage = (item.quantity / maxQuantity) * 100;
            const revenuePercentage = (item.revenue / maxRevenue) * 100;
            
            return (
              <Box
                key={item.name}
                p={2}
                bg={itemBg}
                borderRadius="md"
                transition="all 0.2s"
                _hover={{ transform: 'translateX(2px)' }}
              >
                <VStack align="stretch" spacing={1}>
                  {/* Product Name and Rank */}
                  <HStack justify="space-between">
                    <HStack spacing={2}>
                      <Text 
                        fontSize="xs" 
                        fontWeight="600" 
                        color={index < 3 ? 'orange.500' : mutedColor}
                      >
                        #{index + 1}
                      </Text>
                      <Text fontSize="sm" fontWeight="500" color={textColor} noOfLines={1}>
                        {item.name}
                      </Text>
                    </HStack>
                    {index === 0 && (
                      <Tooltip label="Best Seller" fontSize="xs">
                        <Icon as={Star} boxSize={3} color="yellow.500" />
                      </Tooltip>
                    )}
                  </HStack>
                  
                  {/* Metrics */}
                  <HStack spacing={4}>
                    <HStack spacing={1}>
                      <Icon as={Package} boxSize={2.5} color={mutedColor} />
                      <Text fontSize="xs" color={mutedColor}>
                        {item.quantity} sold
                      </Text>
                    </HStack>
                    <HStack spacing={1}>
                      <Icon as={DollarSign} boxSize={2.5} color="green.500" />
                      <Text fontSize="xs" color="green.500" fontWeight="500">
                        {formatCurrency(item.revenue)}
                      </Text>
                    </HStack>
                    <HStack spacing={1}>
                      <Icon as={TrendingUp} boxSize={2.5} color={mutedColor} />
                      <Text fontSize="xs" color={mutedColor}>
                        {item.orders} orders
                      </Text>
                    </HStack>
                  </HStack>
                  
                  {/* Visual Progress */}
                  <HStack spacing={1}>
                    <Progress
                      value={quantityPercentage}
                      size="xs"
                      colorScheme="blue"
                      borderRadius="full"
                      flex={1}
                      bg={progressBg}
                    />
                    <Progress
                      value={revenuePercentage}
                      size="xs"
                      colorScheme="green"
                      borderRadius="full"
                      flex={1}
                      bg={progressBg}
                    />
                  </HStack>
                </VStack>
              </Box>
            );
          })}
        </VStack>
        
        {/* Summary Stats */}
        <HStack 
          pt={2} 
          borderTop="1px solid"
          borderColor={borderColor}
          spacing={3}
        >
          <VStack align="start" spacing={0}>
            <Text fontSize="xs" color={mutedColor}>
              Total Items
            </Text>
            <Text fontSize="sm" fontWeight="600" color={textColor}>
              {topItems.reduce((sum, item) => sum + item.quantity, 0)}
            </Text>
          </VStack>
          <VStack align="start" spacing={0}>
            <Text fontSize="xs" color={mutedColor}>
              Total Revenue
            </Text>
            <Text fontSize="sm" fontWeight="600" color="green.500">
              {formatCurrency(topItems.reduce((sum, item) => sum + item.revenue, 0))}
            </Text>
          </VStack>
          <VStack align="start" spacing={0}>
            <Text fontSize="xs" color={mutedColor}>
              Avg per Item
            </Text>
            <Text fontSize="sm" fontWeight="600" color={textColor}>
              {formatCurrency(
                topItems.reduce((sum, item) => sum + item.revenue, 0) / 
                topItems.reduce((sum, item) => sum + item.quantity, 0)
              )}
            </Text>
          </VStack>
        </HStack>
      </VStack>
    </Box>
  );
};

export default MinimalProductCard;