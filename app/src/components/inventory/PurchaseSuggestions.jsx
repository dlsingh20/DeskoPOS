import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Badge,
  Spinner,
  VStack,
  useColorModeValue,
  Icon,
} from '@chakra-ui/react';
import { ShoppingCart } from 'lucide-react';
import InventoryService from '../../services/InventoryService';

const PurchaseSuggestions = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const cardBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('gray.50', 'gray.700');

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const res = await InventoryService.getPurchaseSuggestions();
      setSuggestions(res.data);
    } catch (err) {
      console.error('Failed to load purchase suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Box textAlign="center" py={8}><Spinner size="md" color="blue.500" /></Box>;
  }

  if (suggestions.length === 0) {
    return (
      <Card bg={cardBg} borderRadius="xl" boxShadow="sm">
        <CardBody textAlign="center" py={8}>
          <Icon as={ShoppingCart} boxSize={8} color="green.400" mb={3} />
          <Text color="gray.500">No purchase suggestions</Text>
          <Text fontSize="sm" color="gray.400">All stock levels are above reorder points</Text>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card bg={cardBg} boxShadow="sm" borderRadius="xl" overflow="hidden">
      <CardBody p={0}>
        <Box overflowX="auto">
          <Table size="sm">
            <Thead bg={headerBg}>
              <Tr>
                <Th>Ingredient</Th>
                <Th>Unit</Th>
                <Th isNumeric>Suggested Qty</Th>
                <Th isNumeric>Total Deficit</Th>
                <Th>Vendor</Th>
                <Th>Restaurants Needing</Th>
              </Tr>
            </Thead>
            <Tbody>
              {suggestions.map((s) => (
                <Tr key={s.ingredient_id} _hover={{ bg: headerBg }}>
                  <Td fontWeight="500">{s.ingredient_name}</Td>
                  <Td fontSize="sm">{s.unit}</Td>
                  <Td isNumeric fontWeight="600">
                    {parseFloat(s.reorder_quantity).toFixed(1)}
                  </Td>
                  <Td isNumeric color="orange.500">
                    {parseFloat(s.total_deficit).toFixed(1)}
                  </Td>
                  <Td>
                    {s.preferred_vendor_name ? (
                      <Badge colorScheme="blue" fontSize="xs" borderRadius="full">
                        {s.preferred_vendor_name}
                      </Badge>
                    ) : (
                      <Text fontSize="xs" color="gray.400">No vendor set</Text>
                    )}
                  </Td>
                  <Td>
                    <VStack spacing={0} align="start">
                      {s.restaurants_needing.map((r) => (
                        <Text key={r.restaurant_id} fontSize="xs" color="gray.500">
                          {r.restaurant_name}: {parseFloat(r.current_quantity).toFixed(1)}
                        </Text>
                      ))}
                    </VStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </CardBody>
    </Card>
  );
};

export default PurchaseSuggestions;
