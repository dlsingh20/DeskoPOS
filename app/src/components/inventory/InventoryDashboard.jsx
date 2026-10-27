import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  Box,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Text,
  VStack,
  HStack,
  Badge,
  Button,
  Spinner,
  useColorModeValue,
  Icon,
} from '@chakra-ui/react';
import { Package, AlertTriangle, DollarSign, Trash2 } from 'lucide-react';
import InventoryService from '../../services/InventoryService';
import LowStockAlerts from './LowStockAlerts';

const StatCard = ({ label, value, helpText, icon, color }) => {
  const bg = useColorModeValue('white', 'gray.800');
  const iconBg = useColorModeValue(`${color}.50`, `${color}.900`);
  const iconColor = useColorModeValue(`${color}.600`, `${color}.300`);

  return (
    <Card bg={bg} boxShadow="sm" borderRadius="xl">
      <CardBody>
        <HStack spacing={4}>
          <Box p={3} bg={iconBg} borderRadius="lg">
            <Icon as={icon} boxSize={5} color={iconColor} />
          </Box>
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">{label}</StatLabel>
            <StatNumber fontSize="xl">{value}</StatNumber>
            {helpText && <StatHelpText fontSize="xs" mb={0}>{helpText}</StatHelpText>}
          </Stat>
        </HStack>
      </CardBody>
    </Card>
  );
};

const InventoryDashboard = ({ restaurantId }) => {
  const { formatPrice } = usePOS();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const cardBg = useColorModeValue('white', 'gray.800');

  useEffect(() => {
    loadDashboard();
  }, [restaurantId]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [statsRes, alertsRes] = await Promise.all([
        InventoryService.getDashboardStats(restaurantId),
        InventoryService.getLowStockIngredients(restaurantId),
      ]);
      setStats(statsRes.data);
      setAlerts(alertsRes.data);
    } catch (err) {
      console.error('Failed to load inventory dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="lg" color="blue.500" />
        <Text mt={3} color="gray.500" fontSize="sm">Loading inventory data...</Text>
      </Box>
    );
  }

  return (
    <VStack spacing={4} align="stretch">
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
        <StatCard
          label="Total Ingredients"
          value={stats?.total_ingredients || 0}
          icon={Package}
          color="blue"
        />
        <StatCard
          label="Low Stock Items"
          value={stats?.low_stock_count || 0}
          helpText={stats?.low_stock_count > 0 ? 'Need attention' : 'All good'}
          icon={AlertTriangle}
          color={stats?.low_stock_count > 0 ? 'orange' : 'green'}
        />
        <StatCard
          label="Total Stock Value"
          value={formatPrice(parseFloat(stats?.total_stock_value || 0))}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          label="Waste This Month"
          value={formatPrice(parseFloat(stats?.waste_this_month || 0))}
          icon={Trash2}
          color="red"
        />
      </SimpleGrid>

      {alerts.length > 0 && (
        <Card bg={cardBg} boxShadow="sm" borderRadius="xl">
          <CardHeader pb={2}>
            <HStack justify="space-between">
              <Heading size="sm">Low Stock Alerts</Heading>
              <Badge colorScheme="orange" borderRadius="full" px={2}>
                {alerts.length}
              </Badge>
            </HStack>
          </CardHeader>
          <CardBody pt={0}>
            <LowStockAlerts alerts={alerts} onRefresh={loadDashboard} />
          </CardBody>
        </Card>
      )}

      {alerts.length === 0 && (
        <Card bg={cardBg} boxShadow="sm" borderRadius="xl">
          <CardBody textAlign="center" py={8}>
            <Icon as={Package} boxSize={8} color="green.400" mb={3} />
            <Text fontWeight="500" color="gray.600">All stock levels are healthy</Text>
            <Text fontSize="sm" color="gray.400">No items below reorder point</Text>
          </CardBody>
        </Card>
      )}
    </VStack>
  );
};

export default InventoryDashboard;
