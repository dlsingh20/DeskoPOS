import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Select,
  FormControl,
  FormLabel,
  VStack,
  HStack,
  Flex,
  Text,
  IconButton,
  Alert,
  AlertIcon,
  useColorModeValue,
} from '@chakra-ui/react';
import { DIALOG_CONTENT, useDialogSize } from './responsive';
import { Plus, Minus } from 'lucide-react';
import BackendRequiredNotice from './BackendRequiredNotice';
import { getBillableItems, getTableLabel } from '../../utils/fineDineUtils';

// Flip to true once POST /orders/{id}/move_items/ exists, and implement onMove in the dashboard
export const MOVE_ITEMS_SUPPORTED = false;

/**
 * Pick items (and how many of each) from one table's order and a destination table.
 */
const MoveItemsDialog = ({ isOpen, onClose, tables, ordersByTable, initialSourceId, formatPrice, onMove }) => {
  const size = useDialogSize('xl');
  const [sourceId, setSourceId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [quantities, setQuantities] = useState({});
  const rowBg = useColorModeValue('gray.50', 'gray.700');

  const occupiedTables = tables.filter((t) => ordersByTable[t.id]?.length);
  const sourceOrder = ordersByTable[sourceId]?.[0] || null;
  const items = useMemo(() => getBillableItems(sourceOrder), [sourceOrder]);

  useEffect(() => {
    if (!isOpen) return;
    setSourceId(String(initialSourceId ?? occupiedTables[0]?.id ?? ''));
    setDestinationId('');
    setQuantities({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => setQuantities({}), [sourceId]);

  const setQty = (item, qty) =>
    setQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, Math.min(item.quantity, qty)) }));

  const selectedLines = items.filter((item) => quantities[item.id] > 0);
  const movingUnits = selectedLines.reduce((sum, item) => sum + quantities[item.id], 0);
  const movesEverything = items.length > 0 && items.every((item) => quantities[item.id] === item.quantity);
  const destinations = tables.filter((t) => String(t.id) !== sourceId && t.status !== 'out_of_order');
  const destination = tables.find((t) => String(t.id) === destinationId);

  const errors = [];
  if (!sourceOrder) errors.push('Choose a table that has an open order.');
  else if (movingUnits === 0) errors.push('Choose at least one item to move.');
  if (!destination) errors.push('Choose where to move the items.');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={size} scrollBehavior="inside" isCentered>
      <ModalOverlay />
      <ModalContent {...DIALOG_CONTENT}>
        <ModalHeader>Move items</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            {occupiedTables.length === 0 ? (
              <Alert status="info" borderRadius="10px" fontSize="sm">
                <AlertIcon />
                No table has an open order right now.
              </Alert>
            ) : (
              <>
                <HStack spacing={3} align="flex-end">
                  <FormControl>
                    <FormLabel fontSize="sm">From</FormLabel>
                    <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                      {occupiedTables.map((t) => (
                        <option key={t.id} value={t.id}>Table {getTableLabel(t)}</option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">To</FormLabel>
                    <Select placeholder="Choose table" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                      {destinations.map((t) => (
                        <option key={t.id} value={t.id}>
                          Table {getTableLabel(t)}{ordersByTable[t.id]?.length ? ' (has order)' : ''}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </HStack>

                <VStack align="stretch" spacing={2}>
                  <Flex justify="space-between" align="center">
                    <Text fontSize="sm" fontWeight="600">Items to move</Text>
                    {items.length > 0 && (
                      <Button
                        size="xs"
                        variant="link"
                        onClick={() => setQuantities(Object.fromEntries(items.map((i) => [i.id, i.quantity])))}
                      >
                        Select all
                      </Button>
                    )}
                  </Flex>
                  {items.length === 0 && <Text fontSize="sm" color="gray.500">This order has no items.</Text>}
                  {items.map((item) => {
                    const qty = quantities[item.id] || 0;
                    return (
                      <Flex key={item.id} bg={rowBg} borderRadius="10px" px={3} py={2} align="center" gap={3}>
                        <ItemLabel item={item} formatPrice={formatPrice} />
                        <HStack spacing={1}>
                          <IconButton aria-label={`Move one less ${item.menu_item_name}`} icon={<Minus size={13} />} size="xs" variant="outline" onClick={() => setQty(item, qty - 1)} isDisabled={qty === 0} />
                          <Text minW="44px" textAlign="center" fontSize="sm" fontWeight="700">{qty} / {item.quantity}</Text>
                          <IconButton aria-label={`Move one more ${item.menu_item_name}`} icon={<Plus size={13} />} size="xs" variant="outline" onClick={() => setQty(item, qty + 1)} isDisabled={qty === item.quantity} />
                        </HStack>
                      </Flex>
                    );
                  })}
                </VStack>

                {errors.length === 0 && (
                  <Text fontSize="sm">
                    Move {movingUnits} {movingUnits === 1 ? 'item' : 'items'} to <strong>Table {getTableLabel(destination)}</strong>
                    {ordersByTable[destination.id]?.length ? ' and add them to its open order.' : ' as a new order.'}
                    {movesEverything && ' The source order will be left empty.'}
                  </Text>
                )}
              </>
            )}

            {!MOVE_ITEMS_SUPPORTED && <BackendRequiredNotice action="Moving items" endpoint="POST /api/pos/api/orders/{id}/move_items/" />}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            colorScheme="yellow"
            isDisabled={!MOVE_ITEMS_SUPPORTED || errors.length > 0}
            onClick={() => onMove?.({
              sourceOrder,
              destinationTable: destination,
              items: selectedLines.map((item) => ({ order_item_id: item.id, quantity: quantities[item.id] })),
            })}
          >
            Move {movingUnits || ''} {movingUnits === 1 ? 'item' : 'items'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const ItemLabel = ({ item, formatPrice }) => (
  <VStack align="start" spacing={0} flex={1} minW={0}>
    <Text fontSize="sm" fontWeight="600" noOfLines={1}>{item.menu_item_name}</Text>
    <Text fontSize="xs" color="gray.500">
      {formatPrice(item.unit_price || 0)} each{item.status && item.status !== 'pending' ? ` · ${item.status}` : ''}
    </Text>
  </VStack>
);

export default MoveItemsDialog;
