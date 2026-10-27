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
  Switch,
  Button,
  VStack,
  HStack,
  SimpleGrid,
} from '@chakra-ui/react';

const CATEGORIES = [
  { value: 'protein', label: 'Protein' },
  { value: 'vegetable', label: 'Vegetable' },
  { value: 'fruit', label: 'Fruit' },
  { value: 'grain', label: 'Grain' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'spice', label: 'Spice' },
  { value: 'oil_fat', label: 'Oil & Fat' },
  { value: 'sauce', label: 'Sauce' },
  { value: 'beverage', label: 'Beverage' },
  { value: 'dry_goods', label: 'Dry Goods' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'other', label: 'Other' },
];

const UNITS = [
  { value: 'pieces', label: 'Pieces' },
  { value: 'grams', label: 'Grams' },
  { value: 'kilograms', label: 'Kilograms' },
  { value: 'liters', label: 'Liters' },
  { value: 'milliliters', label: 'Milliliters' },
  { value: 'cups', label: 'Cups' },
  { value: 'portions', label: 'Portions' },
];

const IngredientFormModal = ({ isOpen, onClose, onSave, ingredient }) => {
  const [form, setForm] = useState({
    name: '',
    category: 'other',
    unit: 'grams',
    cost_per_unit: '',
    reorder_point: '',
    reorder_quantity: '',
    is_perishable: false,
    shelf_life_days: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ingredient) {
      setForm({
        name: ingredient.name || '',
        category: ingredient.category || 'other',
        unit: ingredient.unit || 'grams',
        cost_per_unit: ingredient.cost_per_unit || '',
        reorder_point: ingredient.reorder_point || '',
        reorder_quantity: ingredient.reorder_quantity || '',
        is_perishable: ingredient.is_perishable || false,
        shelf_life_days: ingredient.shelf_life_days || '',
      });
    } else {
      setForm({
        name: '',
        category: 'other',
        unit: 'grams',
        cost_per_unit: '',
        reorder_point: '',
        reorder_quantity: '',
        is_perishable: false,
        shelf_life_days: '',
      });
    }
  }, [ingredient, isOpen]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    await onSave({
      ...form,
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      reorder_point: parseFloat(form.reorder_point) || 0,
      reorder_quantity: parseFloat(form.reorder_quantity) || 0,
      shelf_life_days: form.is_perishable ? parseInt(form.shelf_life_days) || null : null,
    });
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader>{ingredient ? 'Edit Ingredient' : 'Add Ingredient'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Name</FormLabel>
              <Input
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Chicken Breast"
                size="sm"
              />
            </FormControl>

            <SimpleGrid columns={2} spacing={4} w="full">
              <FormControl>
                <FormLabel fontSize="sm">Category</FormLabel>
                <Select
                  value={form.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  size="sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Unit</FormLabel>
                <Select
                  value={form.unit}
                  onChange={(e) => handleChange('unit', e.target.value)}
                  size="sm"
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel fontSize="sm">Cost per Unit</FormLabel>
              <Input
                type="number"
                step="0.01"
                value={form.cost_per_unit}
                onChange={(e) => handleChange('cost_per_unit', e.target.value)}
                placeholder="0.00"
                size="sm"
              />
            </FormControl>

            <SimpleGrid columns={2} spacing={4} w="full">
              <FormControl>
                <FormLabel fontSize="sm">Reorder Point</FormLabel>
                <Input
                  type="number"
                  step="0.1"
                  value={form.reorder_point}
                  onChange={(e) => handleChange('reorder_point', e.target.value)}
                  placeholder="Minimum stock level"
                  size="sm"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Reorder Quantity</FormLabel>
                <Input
                  type="number"
                  step="0.1"
                  value={form.reorder_quantity}
                  onChange={(e) => handleChange('reorder_quantity', e.target.value)}
                  placeholder="Suggested order amount"
                  size="sm"
                />
              </FormControl>
            </SimpleGrid>

            <HStack w="full" justify="space-between">
              <FormControl display="flex" alignItems="center" w="auto">
                <FormLabel fontSize="sm" mb={0} mr={3}>Perishable</FormLabel>
                <Switch
                  isChecked={form.is_perishable}
                  onChange={(e) => handleChange('is_perishable', e.target.checked)}
                  size="sm"
                />
              </FormControl>

              {form.is_perishable && (
                <FormControl maxW="200px">
                  <FormLabel fontSize="sm">Shelf Life (days)</FormLabel>
                  <Input
                    type="number"
                    value={form.shelf_life_days}
                    onChange={(e) => handleChange('shelf_life_days', e.target.value)}
                    placeholder="Days"
                    size="sm"
                  />
                </FormControl>
              )}
            </HStack>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSubmit}
            isLoading={saving}
            isDisabled={!form.name}
            size="sm"
          >
            {ingredient ? 'Update' : 'Create'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default IngredientFormModal;
