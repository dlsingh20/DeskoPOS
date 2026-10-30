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
  SimpleGrid,
  VStack,
  Text,
  Box,
  useColorModeValue,
} from '@chakra-ui/react';
import { DIALOG_CONTENT, useDialogSize } from './responsive';
import { getTableLabel, nextSplitNumber } from '../../utils/fineDineUtils';

/**
 * Choose a table to split. The new table (4-1) takes its own order and bill; any order
 * already running on the table stays where it is.
 */
const SplitTableDialog = ({ isOpen, onClose, tables, ordersByTable, onSplit }) => {
  const [tableId, setTableId] = useState('');
  const [splitting, setSplitting] = useState(false);
  const rowBg = useColorModeValue('gray.50', 'gray.700');
  const size = useDialogSize('lg');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');

  const choices = tables.filter((t) => t.status !== 'out_of_order');

  useEffect(() => {
    if (isOpen) setTableId('');
  }, [isOpen]);

  const table = choices.find((t) => String(t.id) === tableId);
  const newNumber = table ? nextSplitNumber(table, tables) : null;

  const confirm = async () => {
    setSplitting(true);
    try {
      await onSplit?.(table);
    } finally {
      setSplitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={size} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent {...DIALOG_CONTENT}>
        <ModalHeader>Split table</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Text fontSize="sm" fontWeight="600">Which table do you want to split?</Text>
            <RadioGroup value={tableId} onChange={setTableId}>
              <SimpleGrid columns={{ base: 2, md: 3 }} spacing={2}>
                {choices.map((t) => {
                  const running = (ordersByTable[t.id] || []).length > 0;
                  return (
                    <Box key={t.id} bg={rowBg} borderRadius="10px" px={3} py={2}>
                      <Radio value={String(t.id)}>
                        <Text fontWeight="600">Table {getTableLabel(t)}</Text>
                        <Text fontSize="xs" color={mutedColor}>{running ? 'Order running' : 'Free'}</Text>
                      </Radio>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </RadioGroup>
            {table && (
              <Text fontSize="sm">
                This adds <strong>Table {newNumber}</strong> for a new order and its own bill.
                {(ordersByTable[table.id] || []).length > 0
                  ? ` The order running on Table ${getTableLabel(table)} stays there.`
                  : ''}{' '}
                Table {newNumber} goes away once its bill is settled.
              </Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={splitting}>Cancel</Button>
          <Button colorScheme="purple" isDisabled={!table} isLoading={splitting} onClick={confirm}>
            {table ? `Split into Table ${newNumber}` : 'Split table'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default SplitTableDialog;
