import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  Button,
  VStack,
  Text,
  useToast,
} from '@chakra-ui/react';
import InventoryService from '../../services/InventoryService';

const WASTE_REASONS = [
  'Expired',
  'Spoiled',
  'Damaged',
  'Overproduction',
  'Returned by customer',
  'Dropped/spilled',
  'Quality issue',
  'Other',
];

const WasteRecordModal = ({ isOpen, onClose, stock, onSave }) => {
  const [quantity, setQuantity] = useState('');
  const [wasteReason, setWasteReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setQuantity('');
      setWasteReason('');
      setNotes('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!quantity || !wasteReason) {
      toast({ title: 'Fill in quantity and reason', status: 'warning', duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      await InventoryService.recordWaste({
        ingredient: stock.ingredient,
        restaurant: stock.restaurant,
        quantity: parseFloat(quantity),
        waste_reason: wasteReason,
        notes,
      });
      toast({ title: 'Waste recorded', status: 'success', duration: 2000 });
      onSave();
      onClose();
    } catch (err) {
      toast({ title: 'Failed to record waste', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader>Record Waste</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            {stock && (
              <Text fontSize="sm" color="gray.500" w="full">
                {stock.ingredient_name} at {stock.restaurant_name}
                {' '} (current: {parseFloat(stock.current_quantity).toFixed(1)} {stock.ingredient_unit})
              </Text>
            )}
            <FormControl isRequired>
              <FormLabel fontSize="sm">Quantity Wasted</FormLabel>
              <Input
                type="number"
                step="0.1"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Amount wasted"
                size="sm"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Reason</FormLabel>
              <Select
                value={wasteReason}
                onChange={(e) => setWasteReason(e.target.value)}
                placeholder="Select reason"
                size="sm"
              >
                {WASTE_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Notes</FormLabel>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional details..."
                size="sm"
                rows={2}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} size="sm">Cancel</Button>
          <Button
            colorScheme="red"
            onClick={handleSubmit}
            isLoading={saving}
            isDisabled={!quantity || !wasteReason}
            size="sm"
          >
            Record Waste
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default WasteRecordModal;
