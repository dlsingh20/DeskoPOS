import React from 'react';
import {
  VStack,
  HStack,
  Text,
  Badge,
  Box,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { AlertTriangle, Store } from 'lucide-react';

const LowStockAlerts = ({ alerts }) => {
  const borderColor = useColorModeValue('orange.100', 'orange.800');
  const hoverBg = useColorModeValue('orange.50', 'gray.700');

  if (!alerts || alerts.length === 0) return null;

  return (
    <VStack spacing={2} align="stretch">
      {alerts.map((alert, idx) => (
        <HStack
          key={`${alert.ingredient_id}-${alert.restaurant_id}-${idx}`}
          p={3}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
          _hover={{ bg: hoverBg }}
          transition="background 0.2s"
          justify="space-between"
        >
          <HStack spacing={3}>
            <Icon as={AlertTriangle} color="orange.400" boxSize={4} />
            <Box>
              <Text fontSize="sm" fontWeight="500">{alert.ingredient_name}</Text>
              <HStack spacing={2}>
                <Icon as={Store} boxSize={3} color="gray.400" />
                <Text fontSize="xs" color="gray.500">{alert.restaurant_name}</Text>
              </HStack>
            </Box>
          </HStack>
          <HStack spacing={3}>
            <Box textAlign="right">
              <Text fontSize="sm" fontWeight="600" color="orange.500">
                {parseFloat(alert.current_quantity).toFixed(1)} {alert.unit}
              </Text>
              <Text fontSize="xs" color="gray.400">
                Reorder at {parseFloat(alert.reorder_point).toFixed(1)}
              </Text>
            </Box>
            {alert.preferred_vendor_name && (
              <Badge colorScheme="blue" fontSize="xs" borderRadius="full">
                {alert.preferred_vendor_name}
              </Badge>
            )}
          </HStack>
        </HStack>
      ))}
    </VStack>
  );
};

export default LowStockAlerts;
