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
  Button,
  VStack,
  Text,
  useToast,
} from '@chakra-ui/react';
import InventoryService from '../../services/InventoryService';

const StockAdjustmentModal = ({ isOpen, onClose, stock, onSave }) => {
  const [newQuantity, setNewQuantity] = useState('');
  const [reason, setReason] = useState('Physical count');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (stock) {
      setNewQuantity(parseFloat(stock.current_quantity).toString());
      setReason('Physical count');
    }
  }, [stock, isOpen]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await InventoryService.adjustStock({
        ingredient: stock.ingredient,
        restaurant: stock.restaurant,
        new_quantity: parseFloat(newQuantity),
        reason,
      });
      toast({ title: 'Stock adjusted', status: 'success', duration: 2000 });
      onSave();
      onClose();
    } catch (err) {
      toast({ title: 'Failed to adjust stock', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader>Adjust Stock</ModalHeader>
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
              <FormLabel fontSize="sm">New Quantity</FormLabel>
              <Input
                type="number"
                step="0.1"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                size="sm"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Reason</FormLabel>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                size="sm"
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} size="sm">Cancel</Button>
          <Button colorScheme="blue" onClick={handleSubmit} isLoading={saving} size="sm">
            Adjust
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default StockAdjustmentModal;
