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
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  NumberInput,
  NumberInputField,
  VStack,
  useToast,
} from '@chakra-ui/react';
import tableService from '../../services/TableService';

/**
 * Create a table for the selected restaurant.
 */
const AddTableDialog = ({ isOpen, onClose, restaurant, existingTables, onCreated }) => {
  const toast = useToast();
  const [tableNumber, setTableNumber] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTableNumber('');
      setName('');
      setCapacity('4');
    }
  }, [isOpen]);

  const trimmed = tableNumber.trim();
  const duplicate = existingTables.some((t) => String(t.table_number).toLowerCase() === trimmed.toLowerCase());
  const capacityValue = parseInt(capacity, 10);
  const numberError = !trimmed ? 'Table number is required' : duplicate ? `Table ${trimmed} already exists` : '';
  const capacityError = !capacityValue || capacityValue < 1 || capacityValue > 50 ? 'Seats must be between 1 and 50' : '';
  const isValid = !numberError && !capacityError;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    try {
      // Every new table gets its ordering QR code
      const created = await tableService.ensureQrCode(await tableService.createTable({
        restaurant: restaurant.id,
        table_number: trimmed,
        name: name.trim() || `Table ${trimmed}`,
        capacity: capacityValue,
        status: 'available',
      }));
      toast({ title: `Table ${trimmed} added`, status: 'success', duration: 2500 });
      onCreated?.(created);
      onClose();
    } catch (error) {
      toast({ title: 'Could not add table', description: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit} borderRadius="16px">
        <ModalHeader>Add table</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired isInvalid={!!trimmed && !!numberError}>
              <FormLabel fontSize="sm">Table number</FormLabel>
              <Input autoFocus value={tableNumber} maxLength={20} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. 21 or 3-1" />
              <FormErrorMessage>{numberError}</FormErrorMessage>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Name (optional)</FormLabel>
              <Input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="e.g. Window booth" />
            </FormControl>
            <FormControl isRequired isInvalid={!!capacityError}>
              <FormLabel fontSize="sm">Seats</FormLabel>
              <NumberInput min={1} max={50} value={capacity} onChange={(value) => setCapacity(value)}>
                <NumberInputField />
              </NumberInput>
              <FormErrorMessage>{capacityError}</FormErrorMessage>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" colorScheme="blue" isLoading={saving} isDisabled={!isValid}>Add table</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddTableDialog;
