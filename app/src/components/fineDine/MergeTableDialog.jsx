import React, { useEffect, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Radio,
  RadioGroup,
  VStack,
  HStack,
  Text,
  Box,
  Alert,
  AlertIcon,
  useColorModeValue,
} from '@chakra-ui/react';
import BackendRequiredNotice from './BackendRequiredNotice';
import { getItemCount, getTableLabel } from '../../utils/fineDineUtils';

// Flip to true once POST /orders/merge/ exists, and implement onMerge in the dashboard
export const MERGE_SUPPORTED = false;

/**
 * Review and confirm merging the selected tables into one target table.
 */
const MergeTableDialog = ({ isOpen, onClose, selectedTables, ordersByTable, formatPrice, onMerge }) => {
  const [targetId, setTargetId] = useState('');
  const rowBg = useColorModeValue('gray.50', 'gray.700');

  const withOrders = selectedTables.filter((t) => ordersByTable[t.id]?.length);

  useEffect(() => {
    if (isOpen) setTargetId(String((withOrders[0] || selectedTables[0])?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const errors = [];
  if (selectedTables.length < 2) errors.push('Select at least two tables.');
  if (withOrders.length === 0) errors.push('None of the selected tables has an open order to merge.');

  const totalItems = withOrders.reduce((sum, t) => sum + ordersByTable[t.id].reduce((s, o) => s + getItemCount(o), 0), 0);
  const totalAmount = withOrders.reduce(
    (sum, t) => sum + ordersByTable[t.id].reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0),
    0
  );
  const target = selectedTables.find((t) => String(t.id) === targetId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>Merge tables</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>Keep the combined order on:</Text>
              <RadioGroup value={targetId} onChange={setTargetId}>
                <VStack align="stretch" spacing={2}>
                  {selectedTables.map((table) => {
                    const orders = ordersByTable[table.id] || [];
                    return (
                      <HStack key={table.id} bg={rowBg} borderRadius="10px" px={3} py={2} justify="space-between">
                        <Radio value={String(table.id)}>
                          <Text fontWeight="600">Table {getTableLabel(table)}</Text>
                        </Radio>
                        <Text fontSize="sm" color="gray.500">
                          {orders.length
                            ? `${orders.reduce((s, o) => s + getItemCount(o), 0)} items · ${formatPrice(orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0))}`
                            : 'No order'}
                        </Text>
                      </HStack>
                    );
                  })}
                </VStack>
              </RadioGroup>
            </Box>

            {errors.length > 0 ? (
              <Alert status="warning" borderRadius="10px" fontSize="sm">
                <AlertIcon />
                {errors.join(' ')}
              </Alert>
            ) : (
              <Text fontSize="sm">
                All {totalItems} items ({formatPrice(totalAmount)}) will be combined on{' '}
                <strong>Table {getTableLabel(target)}</strong>. Quantities, prices and kitchen notes are kept;
                taxes are recalculated by the server.
              </Text>
            )}

            {!MERGE_SUPPORTED && <BackendRequiredNotice action="Merging tables" endpoint="POST /api/pos/api/orders/merge/" />}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            colorScheme="purple"
            isDisabled={!MERGE_SUPPORTED || errors.length > 0 || !target}
            onClick={() => onMerge?.(target, selectedTables)}
          >
            Merge into Table {getTableLabel(target)}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default MergeTableDialog;
