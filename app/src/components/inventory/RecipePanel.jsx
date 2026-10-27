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
import { Plus, Edit2, Trash2, ChefHat } from 'lucide-react';
import InventoryService from '../../services/InventoryService';
import RecipeFormModal from './RecipeFormModal';

const RecipePanel = ({ restaurantId }) => {
  const { formatPrice } = usePOS();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRecipe, setEditRecipe] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('gray.50', 'gray.700');

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const res = await InventoryService.getRecipes();
      setRecipes(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load recipes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditRecipe(null);
    onOpen();
  };

  const handleEdit = (recipe) => {
    setEditRecipe(recipe);
    onOpen();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this recipe?')) return;
    try {
      await InventoryService.deleteRecipe(id);
      toast({ title: 'Recipe deleted', status: 'success', duration: 2000 });
      loadRecipes();
    } catch (err) {
      toast({ title: 'Failed to delete', status: 'error', duration: 3000 });
    }
  };

  const handleSave = () => {
    onClose();
    loadRecipes();
  };

  const getCostColor = (pct) => {
    const val = parseFloat(pct);
    if (val <= 30) return 'green';
    if (val <= 40) return 'yellow';
    return 'red';
  };

  return (
    <VStack spacing={4} align="stretch">
      <HStack justify="space-between">
        <Text fontSize="sm" color="gray.500">
          {recipes.length} recipes linked to menu items
        </Text>
        <Button
          leftIcon={<Plus size={16} />}
          colorScheme="blue"
          size="sm"
          onClick={handleCreate}
        >
          Add Recipe
        </Button>
      </HStack>

      <Card bg={cardBg} boxShadow="sm" borderRadius="xl" overflow="hidden">
        <CardBody p={0}>
          {loading ? (
            <Box textAlign="center" py={8}>
              <Spinner size="md" color="blue.500" />
            </Box>
          ) : recipes.length === 0 ? (
            <Box textAlign="center" py={8}>
              <Icon as={ChefHat} boxSize={8} color="gray.300" mb={3} />
              <Text color="gray.500">No recipes yet</Text>
              <Text fontSize="sm" color="gray.400">Create recipes to link ingredients to menu items</Text>
            </Box>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead bg={headerBg}>
                  <Tr>
                    <Th>Menu Item</Th>
                    <Th isNumeric>Selling Price</Th>
                    <Th isNumeric>Ingredient Cost</Th>
                    <Th isNumeric>Food Cost %</Th>
                    <Th isNumeric>Ingredients</Th>
                    <Th>Yield</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {recipes.map((recipe) => {
                    const costPct = parseFloat(recipe.food_cost_percentage || 0);
                    return (
                      <Tr key={recipe.id} _hover={{ bg: headerBg }} cursor="pointer">
                        <Td fontWeight="500" onClick={() => handleEdit(recipe)}>
                          {recipe.menu_item_name}
                        </Td>
                        <Td isNumeric>{formatPrice(parseFloat(recipe.menu_item_price || 0))}</Td>
                        <Td isNumeric>{formatPrice(parseFloat(recipe.ingredient_cost || 0))}</Td>
                        <Td isNumeric>
                          <Badge
                            colorScheme={getCostColor(costPct)}
                            borderRadius="full"
                            fontSize="xs"
                          >
                            {costPct.toFixed(1)}%
                          </Badge>
                        </Td>
                        <Td isNumeric>{recipe.ingredients?.length || 0}</Td>
                        <Td fontSize="xs" color="gray.500">
                          {recipe.yield_quantity} {recipe.yield_unit}
                        </Td>
                        <Td>
                          <HStack spacing={1}>
                            <IconButton
                              icon={<Edit2 size={14} />}
                              size="xs"
                              variant="ghost"
                              aria-label="Edit"
                              onClick={() => handleEdit(recipe)}
                            />
                            <IconButton
                              icon={<Trash2 size={14} />}
                              size="xs"
                              variant="ghost"
                              colorScheme="red"
                              aria-label="Delete"
                              onClick={() => handleDelete(recipe.id)}
                            />
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>

      <RecipeFormModal
        isOpen={isOpen}
        onClose={onClose}
        onSave={handleSave}
        recipe={editRecipe}
      />
    </VStack>
  );
};

export default RecipePanel;
