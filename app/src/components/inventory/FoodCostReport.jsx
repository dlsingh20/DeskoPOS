import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  Box,
  Card,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Text,
  Spinner,
  useColorModeValue,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  HStack,
  Icon,
} from '@chakra-ui/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import InventoryService from '../../services/InventoryService';

const FoodCostReport = ({ restaurantId }) => {
  const { formatPrice } = usePOS();
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  const cardBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('gray.50', 'gray.700');

  useEffect(() => {
    loadReport();
  }, [restaurantId]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await InventoryService.getFoodCostReport(restaurantId);
      setReport(res.data);
    } catch (err) {
      console.error('Failed to load food cost report:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Box textAlign="center" py={8}><Spinner size="md" color="blue.500" /></Box>;
  }

  if (report.length === 0) {
    return (
      <Card bg={cardBg} borderRadius="xl" boxShadow="sm">
        <CardBody textAlign="center" py={8}>
          <Text color="gray.500">No recipes with cost data found</Text>
          <Text fontSize="sm" color="gray.400">Create recipes to see food cost analysis</Text>
        </CardBody>
      </Card>
    );
  }

  const avgCost = report.reduce((sum, r) => sum + parseFloat(r.food_cost_percentage), 0) / report.length;
  const totalProfit = report.reduce((sum, r) => sum + parseFloat(r.profit_margin), 0);

  const chartData = report.slice(0, 15).map((r) => ({
    name: r.menu_item_name.length > 12 ? r.menu_item_name.slice(0, 12) + '...' : r.menu_item_name,
    cost: parseFloat(r.food_cost_percentage),
    price: parseFloat(r.selling_price),
    ingredientCost: parseFloat(r.ingredient_cost),
  }));

  const getCostColor = (pct) => {
    if (pct <= 30) return 'green';
    if (pct <= 40) return 'yellow';
    return 'red';
  };

  return (
    <Box>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={4}>
        <Card bg={cardBg} boxShadow="sm" borderRadius="xl">
          <CardBody>
            <Stat>
              <StatLabel fontSize="xs">Avg Food Cost %</StatLabel>
              <StatNumber fontSize="lg" color={avgCost > 35 ? 'red.500' : 'green.500'}>
                {avgCost.toFixed(1)}%
              </StatNumber>
            </Stat>
          </CardBody>
        </Card>
        <Card bg={cardBg} boxShadow="sm" borderRadius="xl">
          <CardBody>
            <Stat>
              <StatLabel fontSize="xs">Items Tracked</StatLabel>
              <StatNumber fontSize="lg">{report.length}</StatNumber>
            </Stat>
          </CardBody>
        </Card>
        <Card bg={cardBg} boxShadow="sm" borderRadius="xl">
          <CardBody>
            <Stat>
              <StatLabel fontSize="xs">Total Profit Margin</StatLabel>
              <StatNumber fontSize="lg" color="green.500">
                {formatPrice(totalProfit)}
              </StatNumber>
            </Stat>
          </CardBody>
        </Card>
      </SimpleGrid>

      {chartData.length > 0 && (
        <Card bg={cardBg} boxShadow="sm" borderRadius="xl" mb={4}>
          <CardBody>
            <Text fontSize="sm" fontWeight="600" mb={3}>Food Cost % by Item</Text>
            <Box h="250px">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={10} angle={-30} textAnchor="end" height={60} />
                  <YAxis fontSize={10} unit="%" />
                  <Tooltip />
                  <Bar dataKey="cost" fill="#f6ad55" name="Food Cost %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </CardBody>
        </Card>
      )}

      <Card bg={cardBg} boxShadow="sm" borderRadius="xl" overflow="hidden">
        <CardBody p={0}>
          <Box overflowX="auto">
            <Table size="sm">
              <Thead bg={headerBg}>
                <Tr>
                  <Th>Menu Item</Th>
                  <Th isNumeric>Selling Price</Th>
                  <Th isNumeric>Ingredient Cost</Th>
                  <Th isNumeric>Food Cost %</Th>
                  <Th isNumeric>Profit Margin</Th>
                </Tr>
              </Thead>
              <Tbody>
                {report.map((r) => {
                  const pct = parseFloat(r.food_cost_percentage);
                  return (
                    <Tr key={r.menu_item_id} _hover={{ bg: headerBg }}>
                      <Td fontWeight="500">{r.menu_item_name}</Td>
                      <Td isNumeric>{formatPrice(parseFloat(r.selling_price))}</Td>
                      <Td isNumeric>{formatPrice(parseFloat(r.ingredient_cost))}</Td>
                      <Td isNumeric>
                        <Badge colorScheme={getCostColor(pct)} borderRadius="full" fontSize="xs">
                          {pct.toFixed(1)}%
                        </Badge>
                      </Td>
                      <Td isNumeric>
                        <HStack spacing={1} justify="flex-end">
                          <Icon
                            as={parseFloat(r.profit_margin) >= 0 ? TrendingUp : TrendingDown}
                            boxSize={3}
                            color={parseFloat(r.profit_margin) >= 0 ? 'green.500' : 'red.500'}
                          />
                          <Text color={parseFloat(r.profit_margin) >= 0 ? 'green.600' : 'red.600'}>
                            {formatPrice(parseFloat(r.profit_margin))}
                          </Text>
                        </HStack>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    </Box>
  );
};

export default FoodCostReport;
