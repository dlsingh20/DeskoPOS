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
  Text,
  Spinner,
  Select,
  HStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import InventoryService from '../../services/InventoryService';

const UsageReport = ({ restaurantId }) => {
  const { formatPrice } = usePOS();
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const cardBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('gray.50', 'gray.700');

  useEffect(() => {
    loadReport();
  }, [restaurantId, days]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await InventoryService.getUsageReport(restaurantId, days);
      setReport(res.data);
    } catch (err) {
      console.error('Failed to load usage report:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Box textAlign="center" py={8}><Spinner size="md" color="blue.500" /></Box>;
  }

  const chartData = report.slice(0, 10).map((r) => ({
    name: r.ingredient_name.length > 15 ? r.ingredient_name.slice(0, 15) + '...' : r.ingredient_name,
    used: parseFloat(r.total_used),
    cost: parseFloat(r.total_cost),
  }));

  return (
    <Box>
      <HStack mb={4} justify="flex-end">
        <Select value={days} onChange={(e) => setDays(parseInt(e.target.value))} maxW="150px" size="sm">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </Select>
      </HStack>

      {report.length === 0 ? (
        <Card bg={cardBg} borderRadius="xl" boxShadow="sm">
          <CardBody textAlign="center" py={8}>
            <Text color="gray.500">No usage data for this period</Text>
          </CardBody>
        </Card>
      ) : (
        <>
          {chartData.length > 0 && (
            <Card bg={cardBg} boxShadow="sm" borderRadius="xl" mb={4}>
              <CardBody>
                <Text fontSize="sm" fontWeight="600" mb={3}>Top Ingredients by Usage Cost</Text>
                <Box h="250px">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" fontSize={10} angle={-30} textAnchor="end" height={60} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="cost" fill="#4299e1" name="Cost ($)" radius={[4, 4, 0, 0]} />
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
                      <Th>Ingredient</Th>
                      <Th>Unit</Th>
                      <Th isNumeric>Total Used</Th>
                      <Th isNumeric>Total Cost</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {report.map((r) => (
                      <Tr key={r.ingredient_id} _hover={{ bg: headerBg }}>
                        <Td fontWeight="500">{r.ingredient_name}</Td>
                        <Td fontSize="sm" color="gray.500">{r.unit}</Td>
                        <Td isNumeric>{parseFloat(r.total_used).toFixed(1)}</Td>
                        <Td isNumeric>{formatPrice(parseFloat(r.total_cost))}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </CardBody>
          </Card>
        </>
      )}
    </Box>
  );
};

export default UsageReport;
