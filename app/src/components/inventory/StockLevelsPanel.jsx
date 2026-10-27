import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  Box,
  Card,
  CardBody,
  HStack,
  VStack,
  Text,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  useDisclosure,
  useColorModeValue,
  Icon,
} from '@chakra-ui/react';
import { ClipboardCheck, Trash2, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import InventoryService from '../../services/InventoryService';
import StockAdjustmentModal from './StockAdjustmentModal';
import WasteRecordModal from './WasteRecordModal';
import StockTransferModal from './StockTransferModal';

const StockLevelsPanel = ({ restaurantId }) => {
  const { formatPrice } = usePOS();
  const [stockLevels, setStockLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStock, setSelectedStock] = useState(null);

  const adjustModal = useDisclosure();
  const wasteModal = useDisclosure();
  const transferModal = useDisclosure();

  const cardBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('gray.50', 'gray.700');
  const lowStockBg = useColorModeValue('orange.50', 'orange.900');

  useEffect(() => {
    loadStock();
  }, [restaurantId]);

  const loadStock = async () => {
    setLoading(true);
    try {
      const params = {};
      if (restaurantId) params.restaurant_id = restaurantId;
      const res = await InventoryService.getStockLevels(params);
      setStockLevels(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load stock levels:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAdjust = (stock) => {
    setSelectedStock(stock);
    adjustModal.onOpen();
  };

  const openWaste = (stock) => {
    setSelectedStock(stock);
    wasteModal.onOpen();
  };

  const openTransfer = (stock) => {
    setSelectedStock(stock);
    transferModal.onOpen();
  };

  return (
    <VStack spacing={4} align="stretch">
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Text fontSize="sm" color="gray.500">
          {stockLevels.length} stock records
          {restaurantId ? '' : ' across all restaurants'}
        </Text>
        <HStack spacing={2}>
          <Button
            leftIcon={<ArrowLeftRight size={14} />}
            size="sm"
            variant="outline"
            onClick={() => { setSelectedStock(null); transferModal.onOpen(); }}
          >
            Transfer
          </Button>
        </HStack>
      </HStack>

      <Card bg={cardBg} boxShadow="sm" borderRadius="xl" overflow="hidden">
        <CardBody p={0}>
          {loading ? (
            <Box textAlign="center" py={8}>
              <Spinner size="md" color="blue.500" />
            </Box>
          ) : stockLevels.length === 0 ? (
            <Box textAlign="center" py={8}>
              <Text color="gray.500">No stock records yet</Text>
              <Text fontSize="sm" color="gray.400">
                Stock levels are created when you adjust or receive inventory
              </Text>
            </Box>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead bg={headerBg}>
                  <Tr>
                    <Th>Ingredient</Th>
                    <Th>Category</Th>
                    <Th>Restaurant</Th>
                    <Th isNumeric>Current Qty</Th>
                    <Th isNumeric>Reorder Point</Th>
                    <Th isNumeric>Value</Th>
                    <Th>Status</Th>
                    <Th>Last Count</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {stockLevels.map((sl) => (
                    <Tr
                      key={sl.id}
                      bg={sl.is_low_stock ? lowStockBg : undefined}
                      _hover={{ bg: headerBg }}
                    >
                      <Td fontWeight="500">{sl.ingredient_name}</Td>
                      <Td>
                        <Badge colorScheme="gray" fontSize="xs" borderRadius="full">
                          {sl.ingredient_category}
                        </Badge>
                      </Td>
                      <Td fontSize="sm">{sl.restaurant_name}</Td>
                      <Td isNumeric fontWeight="600">
                        {parseFloat(sl.current_quantity).toFixed(1)} {sl.ingredient_unit}
                      </Td>
                      <Td isNumeric fontSize="sm" color="gray.500">
                        {parseFloat(sl.reorder_point).toFixed(1)}
                      </Td>
                      <Td isNumeric fontSize="sm">
                        {formatPrice(parseFloat(sl.stock_value))}
                      </Td>
                      <Td>
                        {sl.is_low_stock ? (
                          <Badge colorScheme="orange" fontSize="xs" borderRadius="full">
                            <HStack spacing={1}>
                              <Icon as={AlertTriangle} boxSize={3} />
                              <Text>Low</Text>
                            </HStack>
                          </Badge>
                        ) : (
                          <Badge colorScheme="green" fontSize="xs" borderRadius="full">
                            OK
                          </Badge>
                        )}
                      </Td>
                      <Td fontSize="xs" color="gray.500">
                        {sl.last_counted_at
                          ? new Date(sl.last_counted_at).toLocaleDateString()
                          : '-'}
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <Button size="xs" variant="ghost" onClick={() => openAdjust(sl)}>
                            <Icon as={ClipboardCheck} boxSize={3.5} />
                          </Button>
                          <Button size="xs" variant="ghost" colorScheme="red" onClick={() => openWaste(sl)}>
                            <Icon as={Trash2} boxSize={3.5} />
                          </Button>
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>

      <StockAdjustmentModal
        isOpen={adjustModal.isOpen}
        onClose={adjustModal.onClose}
        stock={selectedStock}
        onSave={loadStock}
      />

      <WasteRecordModal
        isOpen={wasteModal.isOpen}
        onClose={wasteModal.onClose}
        stock={selectedStock}
        onSave={loadStock}
      />

      <StockTransferModal
        isOpen={transferModal.isOpen}
        onClose={transferModal.onClose}
        stock={selectedStock}
        onSave={loadStock}
      />
    </VStack>
  );
};

export default StockLevelsPanel;
