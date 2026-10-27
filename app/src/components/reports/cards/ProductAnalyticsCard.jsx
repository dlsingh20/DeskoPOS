import React from 'react';
import { usePOS } from '../../../context/POSContext';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  useColorModeValue,
  Divider,
  Progress,
} from '@chakra-ui/react';
import { Package, TrendingUp, TrendingDown, Star } from 'lucide-react';

const ProductAnalyticsCard = ({ data, detailed = false }) => {
  const { formatPrice } = usePOS();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  
  if (!data || !data.breakdown) return null;
  
  const { topItems = [] } = data.breakdown;
  const maxQuantity = Math.max(...topItems.map(item => item.quantity), 1);
  
  return (
    <Box
      bg={bg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      p={6}
      boxShadow="sm"
      transition="all 0.3s"
      _hover={{
        boxShadow: 'lg',
        transform: 'translateY(-2px)',
      }}
    >
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between">
          <HStack spacing={2}>
            <Icon as={Package} boxSize={5} color="purple.500" />
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              Product Analytics
            </Text>
          </HStack>
          <Badge colorScheme="purple" variant="subtle">
            Top {topItems.length}
          </Badge>
        </HStack>
        
        <Divider />
        
        {/* Top Products */}
        <VStack align="stretch" spacing={3}>
          <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
            Best Sellers
          </Text>
          
          {topItems.slice(0, detailed ? 10 : 5).map((item, index) => {
            const percentage = (item.quantity / maxQuantity) * 100;
            const isTrending = item.quantity > (item.previousQuantity || 0);
            
            return (
              <Box key={item.name}>
                <HStack justify="space-between" mb={1}>
                  <HStack spacing={2} flex={1}>
                    <Badge
                      colorScheme={index === 0 ? 'yellow' : 'gray'}
                      variant={index === 0 ? 'solid' : 'subtle'}
                      minW="24px"
                      textAlign="center"
                    >
                      {index + 1}
                    </Badge>
                    <Text fontSize="sm" noOfLines={1} flex={1}>
                      {item.name}
                    </Text>
                    {index === 0 && (
                      <Icon as={Star} boxSize={3} color="yellow.500" />
                    )}
                  </HStack>
                  <HStack spacing={2}>
                    <Badge colorScheme="green" variant="subtle">
                      {item.quantity} sold
                    </Badge>
                    {detailed && (
                      <Badge colorScheme="blue" variant="subtle">
                        {formatPrice(item.revenue || 0)}
                      </Badge>
                    )}
                    {isTrending ? (
                      <Icon as={TrendingUp} boxSize={3} color="green.500" />
                    ) : (
                      <Icon as={TrendingDown} boxSize={3} color="red.500" />
                    )}
                  </HStack>
                </HStack>
                <Progress
                  value={percentage}
                  size="xs"
                  colorScheme={index === 0 ? 'yellow' : 'purple'}
                  borderRadius="md"
                />
              </Box>
            );
          })}
          
          {topItems.length === 0 && (
            <Text fontSize="sm" color={mutedColor} textAlign="center">
              No product data available
            </Text>
          )}
        </VStack>
        
        {detailed && topItems.length > 0 && (
          <>
            <Divider />
            
            {/* Product Insights */}
            <VStack align="stretch" spacing={2}>
              <Text fontSize="sm" fontWeight="semibold" color={mutedColor}>
                Insights
              </Text>
              <HStack spacing={4}>
                <VStack align="start" spacing={1}>
                  <Text fontSize="xs" color={mutedColor}>
                    Total Items Sold
                  </Text>
                  <Text fontSize="md" fontWeight="bold" color="purple.500">
                    {topItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </Text>
                </VStack>
                <VStack align="start" spacing={1}>
                  <Text fontSize="xs" color={mutedColor}>
                    Unique Products
                  </Text>
                  <Text fontSize="md" fontWeight="bold" color="blue.500">
                    {topItems.length}
                  </Text>
                </VStack>
                <VStack align="start" spacing={1}>
                  <Text fontSize="xs" color={mutedColor}>
                    Avg Items/Order
                  </Text>
                  <Text fontSize="md" fontWeight="bold" color="green.500">
                    {(topItems.reduce((sum, item) => sum + item.quantity, 0) / 
                      Math.max(topItems.reduce((sum, item) => sum + item.orders, 0), 1)).toFixed(1)}
                  </Text>
                </VStack>
              </HStack>
            </VStack>
          </>
        )}
      </VStack>
    </Box>
  );
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default ProductAnalyticsCard;