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
import { getItemCount, getTableLabel } from '../../utils/fineDineUtils';

/**
 * Review and confirm merging the selected tables onto one bill held by the target table.
 * The tables keep taking orders and their KOTs keep their names (POST orders/merge/).
 */
const MergeTableDialog = ({ isOpen, onClose, selectedTables, ordersByTable, formatPrice, onMerge }) => {
  const [targetId, setTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const rowBg = useColorModeValue('gray.50', 'gray.700');

  const withOrders = selectedTables.filter((t) => ordersByTable[t.id]?.length);

  useEffect(() => {
    if (isOpen) setTargetId(String((withOrders[0] || selectedTables[0])?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const errors = [];
  if (selectedTables.length < 2) errors.push('Select at least two tables.');
  if (withOrders.length === 0) errors.push('None of the selected tables has an open order to merge.');

  // Tables already merged share one order: count it once
  const orders = [...new Map(withOrders.flatMap((t) => ordersByTable[t.id]).map((o) => [o.id, o])).values()];
  const totalItems = orders.reduce((sum, o) => sum + getItemCount(o), 0);
  const totalAmount = orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
  const target = selectedTables.find((t) => String(t.id) === targetId);

  const confirm = async () => {
    setMerging(true);
    try {
      await onMerge?.(target, selectedTables);
    } finally {
      setMerging(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>Merge tables</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>Keep the bill on:</Text>
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
                All {totalItems} items ({formatPrice(totalAmount)}) go on one bill on{' '}
                <strong>Table {getTableLabel(target)}</strong>. Every table keeps taking orders, and its KOTs print
                with its own table name. You can unmerge a table before the bill is settled.
              </Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={merging}>Cancel</Button>
          <Button
            colorScheme="purple"
            isDisabled={errors.length > 0 || !target}
            isLoading={merging}
            onClick={confirm}
          >
            Merge into Table {getTableLabel(target)}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default MergeTableDialog;
