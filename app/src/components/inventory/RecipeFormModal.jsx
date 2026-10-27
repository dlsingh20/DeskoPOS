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
  Button,
  VStack,
  HStack,
  Box,
  Text,
  IconButton,
  Textarea,
  Divider,
  useToast,
  Spinner,
} from '@chakra-ui/react';
import { Plus, Trash2 } from 'lucide-react';
import InventoryService from '../../services/InventoryService';
import { MenuService } from '../../services';

const UNITS = [
  { value: 'pieces', label: 'Pieces' },
  { value: 'grams', label: 'Grams' },
  { value: 'kilograms', label: 'Kilograms' },
  { value: 'liters', label: 'Liters' },
  { value: 'milliliters', label: 'Milliliters' },
  { value: 'cups', label: 'Cups' },
  { value: 'portions', label: 'Portions' },
];

const emptyLine = { ingredient: '', quantity: '', unit: 'grams', is_optional: false };

const RecipeFormModal = ({ isOpen, onClose, onSave, recipe }) => {
  const [menuItems, setMenuItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [menuItemId, setMenuItemId] = useState('');
  const [yieldQuantity, setYieldQuantity] = useState('1');
  const [yieldUnit, setYieldUnit] = useState('portions');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (recipe) {
      setMenuItemId(recipe.menu_item);
      setYieldQuantity(recipe.yield_quantity || '1');
      setYieldUnit(recipe.yield_unit || 'portions');
      setNotes(recipe.notes || '');
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        setLines(recipe.ingredients.map((ri) => ({
          ingredient: ri.ingredient,
          quantity: ri.quantity,
          unit: ri.unit,
          is_optional: ri.is_optional,
        })));
      } else {
        setLines([{ ...emptyLine }]);
      }
    } else {
      setMenuItemId('');
      setYieldQuantity('1');
      setYieldUnit('portions');
      setNotes('');
      setLines([{ ...emptyLine }]);
    }
  }, [recipe, isOpen]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [menuRes, ingRes] = await Promise.all([
        MenuService.getMenuItems(),
        InventoryService.getIngredients({ is_active: 'true' }),
      ]);
      setMenuItems(menuRes.data.results || menuRes.data);
      setIngredients(ingRes.data.results || ingRes.data);
    } catch (err) {
      console.error('Failed to load form data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const updateLine = (index, field, value) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, { ...emptyLine }]);
  };

  const removeLine = (index) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!menuItemId) {
      toast({ title: 'Select a menu item', status: 'warning', duration: 2000 });
      return;
    }
    const validLines = lines.filter((l) => l.ingredient && l.quantity);
    if (validLines.length === 0) {
      toast({ title: 'Add at least one ingredient', status: 'warning', duration: 2000 });
      return;
    }

    setSaving(true);
    try {
      const data = {
        menu_item: menuItemId,
        yield_quantity: parseFloat(yieldQuantity) || 1,
        yield_unit: yieldUnit,
        notes,
        ingredients: validLines.map((l) => ({
          ingredient: parseInt(l.ingredient),
          quantity: parseFloat(l.quantity),
          unit: l.unit,
          is_optional: l.is_optional,
        })),
      };

      if (recipe) {
        await InventoryService.updateRecipe(recipe.id, data);
        toast({ title: 'Recipe updated', status: 'success', duration: 2000 });
      } else {
        await InventoryService.createRecipe(data);
        toast({ title: 'Recipe created', status: 'success', duration: 2000 });
      }
      onSave();
    } catch (err) {
      const msg = err.response?.data?.menu_item?.[0] || 'Failed to save recipe';
      toast({ title: msg, status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
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
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent borderRadius="xl" maxH="85vh" overflow="auto">
        <ModalHeader>{recipe ? 'Edit Recipe' : 'Create Recipe'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Menu Item</FormLabel>
              <Select
                value={menuItemId}
                onChange={(e) => setMenuItemId(e.target.value)}
                placeholder="Select menu item"
                size="sm"
                isDisabled={!!recipe}
              >
                {menuItems.map((mi) => (
                  <option key={mi.id} value={mi.id}>{mi.name}</option>
                ))}
              </Select>
            </FormControl>

            <HStack w="full" spacing={4}>
              <FormControl>
                <FormLabel fontSize="sm">Yield Quantity</FormLabel>
                <Input
                  type="number"
                  value={yieldQuantity}
                  onChange={(e) => setYieldQuantity(e.target.value)}
                  size="sm"
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Yield Unit</FormLabel>
                <Select value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} size="sm">
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </Select>
              </FormControl>
            </HStack>

            <Divider />

            <Box w="full">
              <HStack justify="space-between" mb={2}>
                <Text fontSize="sm" fontWeight="600">Ingredients</Text>
                <Button size="xs" leftIcon={<Plus size={12} />} onClick={addLine} variant="ghost">
                  Add Line
                </Button>
              </HStack>

              <VStack spacing={2} align="stretch">
                {lines.map((line, idx) => (
                  <HStack key={idx} spacing={2}>
                    <Select
                      value={line.ingredient}
                      onChange={(e) => updateLine(idx, 'ingredient', e.target.value)}
                      placeholder="Ingredient"
                      size="sm"
                      flex="2"
                    >
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit_display})</option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      step="0.001"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                      placeholder="Qty"
                      size="sm"
                      flex="1"
                    />
                    <Select
                      value={line.unit}
                      onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                      size="sm"
                      flex="1"
                    >
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </Select>
                    <IconButton
                      icon={<Trash2 size={14} />}
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => removeLine(idx)}
                      isDisabled={lines.length <= 1}
                      aria-label="Remove"
                    />
                  </HStack>
                ))}
              </VStack>
            </Box>

            <FormControl>
              <FormLabel fontSize="sm">Notes</FormLabel>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Recipe notes..."
                size="sm"
                rows={2}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} size="sm">Cancel</Button>
          <Button
            colorScheme="blue"
            onClick={handleSubmit}
            isLoading={saving}
            size="sm"
          >
            {recipe ? 'Update' : 'Create'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RecipeFormModal;
