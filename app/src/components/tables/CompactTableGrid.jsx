import React, { useEffect } from 'react';
import {
  SimpleGrid,
  Box,
  Text,
  VStack,
  HStack,
  Badge,
  Spinner,
  Icon,
  useColorModeValue,
  Alert,
  AlertIcon,
  Tooltip,
} from '@chakra-ui/react';
import { Users, Clock, CheckCircle } from 'lucide-react';
import { usePOS } from '../../context/POSContext';

const CompactTableGrid = ({ 
  tables = [], 
  selectedTable, 
  onTableSelect, 
  loading = false 
}) => {
  const { state, loadTables } = usePOS();
  
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const availableBg = useColorModeValue('green.50', 'green.900');
  const occupiedBg = useColorModeValue('red.50', 'red.900');
  const selectedBg = useColorModeValue('pos.50', 'pos.900');
  const selectedBorder = useColorModeValue('pos.500', 'pos.300');
  
  // Load tables if not loaded
  useEffect(() => {
    if (state.selectedRestaurant && tables.length === 0) {
      loadTables();
    }
  }, [state.selectedRestaurant, tables.length, loadTables]);
  
  const getTableStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'green';
      case 'occupied':
        return 'red';
      case 'reserved':
        return 'orange';
      case 'cleaning':
        return 'yellow';
      default:
        return 'gray';
    }
  };
  
  const getTableStatusIcon = (status) => {
    switch (status) {
      case 'available':
        return CheckCircle;
      case 'occupied':
        return Users;
      case 'reserved':
      case 'cleaning':
        return Clock;
      default:
        return Users;
    }
  };
  
  const getTableBg = (table) => {
    if (selectedTable?.id === table.id) return selectedBg;
    if (table.status === 'available' || table.is_available) return availableBg;
    return occupiedBg;
  };
  
  const getTableBorder = (table) => {
    if (selectedTable?.id === table.id) return selectedBorder;
    return borderColor;
  };
  
  if (loading) {
    return (
      <VStack py={8}>
        <Spinner size="md" color="pos.500" />
        <Text fontSize="sm" color="gray.600">Loading tables...</Text>
      </VStack>
    );
  }
  
  if (!state.selectedRestaurant) {
    return (
      <Alert status="info" borderRadius="md" size="sm">
        <AlertIcon />
        <Text fontSize="sm">Please select a restaurant first</Text>
      </Alert>
    );
  }
  
  if (!tables || tables.length === 0) {
    return (
      <Alert status="warning" borderRadius="md" size="sm">
        <AlertIcon />
        <Text fontSize="sm">No tables available for this restaurant</Text>
      </Alert>
    );
  }
  
  return (
    <SimpleGrid columns={{ base: 3, md: 4 }} spacing={2}>
      {tables.map((table) => {
        const isSelected = selectedTable?.id === table.id;
        const isAvailable = table.status === 'available' || table.is_available;
        const StatusIcon = getTableStatusIcon(table.status);
        
        return (
          <Tooltip
            key={table.id}
            label={`${table.name || `Table ${table.table_number}`} - ${table.status || 'Available'}`}
            placement="top"
          >
            <Box
              p={3}
              borderWidth={isSelected ? '2px' : '1px'}
              borderColor={getTableBorder(table)}
              borderRadius="lg"
              bg={getTableBg(table)}
              cursor={isAvailable ? 'pointer' : 'not-allowed'}
              opacity={isAvailable ? 1 : 0.7}
              onClick={() => isAvailable && onTableSelect(table)}
              transition="all 0.2s"
              _hover={isAvailable ? {
                transform: 'translateY(-2px)',
                boxShadow: 'md',
              } : {}}
              position="relative"
            >
              {isSelected && (
                <Box
                  position="absolute"
                  top={-1}
                  right={-1}
                  w={2}
                  h={2}
                  borderRadius="full"
                  bg="pos.500"
                />
              )}
              
              <VStack spacing={1}>
                <Text fontWeight="bold" fontSize="lg">
                  {table.table_number || table.name}
                </Text>
                
                <Badge
                  colorScheme={getTableStatusColor(table.status || 'available')}
                  fontSize="xs"
                  variant="subtle"
                >
                  <HStack spacing={1}>
                    <Icon as={StatusIcon} boxSize={3} />
                    <Text></Text>
                  </HStack>
                </Badge>
                
                {table.capacity && (
                  <Text fontSize="xs" color="gray.600">
                    {table.capacity} seats
                  </Text>
                )}
              </VStack>
            </Box>
          </Tooltip>
        );
      })}
    </SimpleGrid>
  );
};

export default CompactTableGrid;