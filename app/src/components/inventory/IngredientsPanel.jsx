import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  Box,
  Card,
  CardBody,
  HStack,
  VStack,
  Text,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  Spinner,
  useDisclosure,
  useColorModeValue,
  useToast,
  Icon,
} from '@chakra-ui/react';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';
import InventoryService from '../../services/InventoryService';
import IngredientFormModal from './IngredientFormModal';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
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

const IngredientsPanel = () => {
  const { formatPrice } = usePOS();
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editItem, setEditItem] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('gray.50', 'gray.700');

  useEffect(() => {
    loadIngredients();
  }, [search, category]);

  const loadIngredients = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category = category;
      const res = await InventoryService.getIngredients(params);
      setIngredients(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load ingredients:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditItem(null);
    onOpen();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    onOpen();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this ingredient?')) return;
    try {
      await InventoryService.deleteIngredient(id);
      toast({ title: 'Ingredient deleted', status: 'success', duration: 2000 });
      loadIngredients();
    } catch (err) {
      toast({ title: 'Failed to delete', status: 'error', duration: 3000 });
    }
  };

  const handleSave = async (data) => {
    try {
      if (editItem) {
        await InventoryService.updateIngredient(editItem.id, data);
        toast({ title: 'Ingredient updated', status: 'success', duration: 2000 });
      } else {
        await InventoryService.createIngredient(data);
        toast({ title: 'Ingredient created', status: 'success', duration: 2000 });
      }
      onClose();
      loadIngredients();
    } catch (err) {
      const msg = err.response?.data?.name?.[0] || 'Failed to save';
      toast({ title: msg, status: 'error', duration: 3000 });
    }
  };

  return (
    <VStack spacing={4} align="stretch">
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <HStack spacing={3} flex="1" minW="300px">
          <InputGroup maxW="300px">
            <InputLeftElement>
              <Icon as={Search} boxSize={4} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search ingredients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              bg={cardBg}
              borderRadius="lg"
              size="sm"
            />
          </InputGroup>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxW="180px"
            bg={cardBg}
            borderRadius="lg"
            size="sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </HStack>
        <Button
          leftIcon={<Plus size={16} />}
          colorScheme="blue"
          size="sm"
          onClick={handleCreate}
        >
          Add Ingredient
        </Button>
      </HStack>

      <Card bg={cardBg} boxShadow="sm" borderRadius="xl" overflow="hidden">
        <CardBody p={0}>
          {loading ? (
            <Box textAlign="center" py={8}>
              <Spinner size="md" color="blue.500" />
            </Box>
          ) : ingredients.length === 0 ? (
            <Box textAlign="center" py={8}>
              <Text color="gray.500">No ingredients found</Text>
            </Box>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead bg={headerBg}>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Category</Th>
                    <Th>Unit</Th>
                    <Th isNumeric>Cost/Unit</Th>
                    <Th isNumeric>Reorder Point</Th>
                    <Th>Perishable</Th>
                    <Th>Status</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {ingredients.map((ing) => (
                    <Tr key={ing.id} _hover={{ bg: headerBg }} cursor="pointer">
                      <Td fontWeight="500" onClick={() => handleEdit(ing)}>{ing.name}</Td>
                      <Td>
                        <Badge colorScheme="gray" borderRadius="full" fontSize="xs">
                          {ing.category_display}
                        </Badge>
                      </Td>
                      <Td>{ing.unit_display}</Td>
                      <Td isNumeric>{formatPrice(parseFloat(ing.cost_per_unit))}</Td>
                      <Td isNumeric>{parseFloat(ing.reorder_point).toFixed(1)}</Td>
                      <Td>
                        {ing.is_perishable && (
                          <Badge colorScheme="yellow" fontSize="xs">
                            {ing.shelf_life_days}d
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        <Badge
                          colorScheme={ing.is_active ? 'green' : 'gray'}
                          fontSize="xs"
                          borderRadius="full"
                        >
                          {ing.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <IconButton
                            icon={<Edit2 size={14} />}
                            size="xs"
                            variant="ghost"
                            aria-label="Edit"
                            onClick={() => handleEdit(ing)}
                          />
                          <IconButton
                            icon={<Trash2 size={14} />}
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            aria-label="Delete"
                            onClick={() => handleDelete(ing.id)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>

      <IngredientFormModal
        isOpen={isOpen}
        onClose={onClose}
        onSave={handleSave}
        ingredient={editItem}
      />
    </VStack>
  );
};

export default IngredientsPanel;
