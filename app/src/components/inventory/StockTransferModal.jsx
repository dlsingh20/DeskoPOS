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
  Spinner,
  useToast,
} from '@chakra-ui/react';
import InventoryService from '../../services/InventoryService';
import { RestaurantService } from '../../services';

const StockTransferModal = ({ isOpen, onClose, stock, onSave }) => {
  const [ingredients, setIngredients] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [ingredientId, setIngredientId] = useState('');
  const [fromRestaurant, setFromRestaurant] = useState('');
  const [toRestaurant, setToRestaurant] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (stock) {
        setIngredientId(stock.ingredient);
        setFromRestaurant(stock.restaurant);
      } else {
        setIngredientId('');
        setFromRestaurant('');
      }
      setToRestaurant('');
      setQuantity('');
      setNotes('');
    }
  }, [isOpen, stock]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [ingRes, restRes] = await Promise.all([
        InventoryService.getIngredients({ is_active: 'true' }),
        RestaurantService.getRestaurants(),
      ]);
      setIngredients(ingRes.data.results || ingRes.data);
      setRestaurants(restRes.data.results || restRes.data);
    } catch (err) {
      console.error('Failed to load transfer data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async () => {
    if (!ingredientId || !fromRestaurant || !toRestaurant || !quantity) {
      toast({ title: 'Fill all required fields', status: 'warning', duration: 2000 });
      return;
    }
    if (fromRestaurant === toRestaurant) {
      toast({ title: 'Source and destination must differ', status: 'warning', duration: 2000 });
      return;
    }
    setSaving(true);
    try {
      await InventoryService.transferStock({
        ingredient: parseInt(ingredientId),
        from_restaurant: parseInt(fromRestaurant),
        to_restaurant: parseInt(toRestaurant),
        quantity: parseFloat(quantity),
        notes,
      });
      toast({ title: 'Stock transferred', status: 'success', duration: 2000 });
      onSave();
      onClose();
    } catch (err) {
      toast({ title: 'Transfer failed', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalBody textAlign="center" py={10}>
            <Spinner size="md" color="blue.500" />
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader>Transfer Stock</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Ingredient</FormLabel>
              <Select
                value={ingredientId}
                onChange={(e) => setIngredientId(e.target.value)}
                placeholder="Select ingredient"
                size="sm"
              >
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>{ing.name}</option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm">From Restaurant</FormLabel>
              <Select
                value={fromRestaurant}
                onChange={(e) => setFromRestaurant(e.target.value)}
                placeholder="Source"
                size="sm"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm">To Restaurant</FormLabel>
              <Select
                value={toRestaurant}
                onChange={(e) => setToRestaurant(e.target.value)}
                placeholder="Destination"
                size="sm"
              >
                {restaurants.filter((r) => String(r.id) !== String(fromRestaurant)).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm">Quantity</FormLabel>
              <Input
                type="number"
                step="0.1"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                size="sm"
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Notes</FormLabel>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Transfer notes..."
                size="sm"
                rows={2}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} size="sm">Cancel</Button>
          <Button colorScheme="blue" onClick={handleSubmit} isLoading={saving} size="sm">
            Transfer
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default StockTransferModal;
