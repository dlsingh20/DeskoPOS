import React from 'react';
import {
  SimpleGrid,
  Box,
  VStack,
  Spinner,
  Text,
  Alert,
  AlertIcon,
  Center,
} from '@chakra-ui/react';
import MinimalOrderCard from './MinimalOrderCard';

const OrderGrid = ({ 
  orders = [], 
  viewMode = 'grid', 
  selectedOrder, 
  onOrderSelect, 
  loading = false,
  onStatusUpdate 
}) => {
  
  if (loading) {
    return (
      <Center h="400px">
        <VStack>
          <Spinner size="xl" color="pos.500" />
          <Text color="gray.600">Loading orders...</Text>
        </VStack>
      </Center>
    );
  }
  
  if (!orders || orders.length === 0) {
    return (
      <Box p={8}>
        <Alert status="info" borderRadius="lg">
          <AlertIcon />
          <VStack align="start" spacing={1}>
            <Text fontWeight="semibold">No orders found</Text>
            <Text fontSize="sm">Orders will appear here when they are created</Text>
          </VStack>
        </Alert>
      </Box>
    );
  }
  
  if (viewMode === 'list') {
    return (
      <VStack spacing={2} align="stretch">
        {orders.map((order) => (
          <MinimalOrderCard
            key={order.id}
            order={order}
            isSelected={selectedOrder?.id === order.id}
            onClick={() => onOrderSelect(order)}
            viewMode="list"
            onStatusUpdate={onStatusUpdate}
          />
        ))}
      </VStack>
    );
  }
  
  // Default grid view - optimized spacing for minimal design
  return (
    <SimpleGrid
      columns={{
        base: 1,    // Mobile: single column
        sm: 2,      // Small tablets: 2 columns
        md: 3,      // Medium tablets: 3 columns
        lg: 4,      // Desktop: 4 columns
        xl: 5,      // Large desktop: 5 columns (more compact cards allow more columns)
      }}
      spacing={{ base: 2, sm: 2, md: 3 }}
    >
      {orders.map((order) => (
        <MinimalOrderCard
          key={order.id}
          order={order}
          isSelected={selectedOrder?.id === order.id}
          onClick={() => onOrderSelect(order)}
          viewMode="grid"
          onStatusUpdate={onStatusUpdate}
        />
      ))}
    </SimpleGrid>
  );
};

export default OrderGrid;