import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardBody,
  Text,
  Badge,
  Icon,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  VStack,
  HStack,
  Container,
} from '@chakra-ui/react';
import { Utensils, Clock, Users, CheckCircle } from 'lucide-react';

/**
 * Format opening hours object into readable string
 * @param {Object} openingHours - Object with day keys and open/close times
 * @returns {string} Formatted hours string
 */
const formatOpeningHours = (openingHours) => {
  if (!openingHours || typeof openingHours !== 'object') {
    return 'Hours not available';
  }

  // Get today's hours
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayName = dayNames[new Date().getDay()];
  
  const todayHours = openingHours[todayName];
  if (todayHours && todayHours.open && todayHours.close) {
    return `Today: ${todayHours.open} - ${todayHours.close}`;
  }

  // Fallback: show first available day's hours
  const firstDay = Object.keys(openingHours)[0];
  const firstHours = openingHours[firstDay];
  if (firstHours && firstHours.open && firstHours.close) {
    return `${firstDay}: ${firstHours.open} - ${firstHours.close}`;
  }

  return 'Hours vary';
};

/**
 * RestaurantSelector Component
 * Displays available restaurants with stats and allows selection
 * Based on actual API response structure from backend testing
 */
const RestaurantSelector = ({
  restaurants = [],
  selectedRestaurant = null,
  onRestaurantSelect,
  loading = false
}) => {
  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack spacing={4}>
          <Spinner size="xl" color="pos.500" />
          <Text color="gray.600" fontSize="lg">Loading restaurants...</Text>
        </VStack>
      </Container>
    );
  }

  if (!restaurants || restaurants.length === 0) {
    return (
      <Container maxW="container.xl" py={8}>
        <Alert status="info" borderRadius="xl" p={6}>
          <AlertIcon boxSize={6} />
          <Box>
            <AlertTitle fontSize="lg">No Restaurants Available</AlertTitle>
            <AlertDescription fontSize="md" mt={2}>
              No active restaurants found for this hotel. Please contact your administrator.
            </AlertDescription>
          </Box>
        </Alert>
      </Container>
    );
  }

  const getRestaurantIcon = (type) => {
    switch (type) {
      case 'restaurant':
        return Utensils;
      case 'bar':
        return Utensils;
      case 'cafe':
        return Utensils;
      case 'room_service':
        return Utensils;
      default:
        return Utensils;
    }
  };

  const getRestaurantTypeLabel = (type) => {
    const typeLabels = {
      restaurant: 'Restaurant',
      bar: 'Bar',
      cafe: 'Cafe',
      room_service: 'Room Service'
    };
    return typeLabels[type] || 'Restaurant';
  };

  const getOccupancyColor = (availableTables, totalTables) => {
    if (totalTables === 0) return 'gray';
    
    const occupancyRate = ((totalTables - availableTables) / totalTables) * 100;
    
    if (occupancyRate >= 90) return 'red';
    if (occupancyRate >= 70) return 'orange';
    if (occupancyRate >= 50) return 'yellow';
    return 'green';
  };

  return (
    <Container maxW="container.xl" py={{ base: 6, md: 8 }}>
      <VStack spacing={{ base: 6, md: 8 }} align="stretch">
        <Box>
          <Text 
            fontSize={{ base: '2xl', md: '3xl' }} 
            fontWeight="bold" 
            color="pos.600"
            mb={2}
          >
            Select Restaurant
          </Text>
          <Text color="gray.600" fontSize="lg">
            Choose your restaurant to begin service
          </Text>
        </Box>
        
        <Grid
          templateColumns={{
            base: '1fr',
            md: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)'
          }}
          gap={{ base: 4, md: 6 }}
        >
        {restaurants.map((restaurant) => {
          const isSelected = selectedRestaurant?.id === restaurant.id;
          const occupancyColor = getOccupancyColor(
            restaurant.available_tables,
            restaurant.total_tables
          );
          
          return (
            <Card
              key={restaurant.id}
              variant={isSelected ? 'professionalTableSelected' : 'professionalTableAvailable'}
              cursor="pointer"
              onClick={() => onRestaurantSelect(restaurant)}
              transition="all 0.2s"
              _hover={{ borderColor: 'pos.300' }}
              _active={{ transform: 'scale(0.98)' }}
            >
              <CardBody p={6}>
                <VStack align="stretch" spacing={4}>
                  {/* Header */}
                  <HStack justify="space-between">
                    <HStack spacing={3}>
                      <Icon
                        as={getRestaurantIcon(restaurant.type)}
                        boxSize={5}
                        color="pos.500"
                      />
                      <VStack align="start" spacing={1}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                          {restaurant.name}
                        </Text>
                        <Badge 
                          size="sm" 
                          colorScheme="blue" 
                          variant="subtle" 
                          borderRadius="md"
                        >
                          {getRestaurantTypeLabel(restaurant.type)}
                        </Badge>
                      </VStack>
                    </HStack>
                    
                    {restaurant.is_active && (
                      <Box
                        w={3}
                        h={3}
                        bg="green.400"
                        borderRadius="full"
                        title="Active"
                      />
                    )}
                  </HStack>
                  
                  {/* Description */}
                  {restaurant.description && (
                    <Text fontSize="sm" color="gray.600" lineHeight="1.5">
                      {restaurant.description}
                    </Text>
                  )}
                  
                  {/* Stats */}
                  <Grid templateColumns="1fr 1fr" gap={4}>
                    <VStack align="start" spacing={1}>
                      <HStack spacing={2} color="gray.500">
                        <Icon as={Clock} boxSize={3} />
                        <Text fontSize="xs" fontWeight="medium">Hours</Text>
                      </HStack>
                      <Text fontSize="sm" fontWeight="medium" color="gray.700">
                        {formatOpeningHours(restaurant.opening_hours)}
                      </Text>
                    </VStack>
                    
                    <VStack align="start" spacing={1}>
                      <HStack spacing={2} color="gray.500">
                        <Icon as={Users} boxSize={3} />
                        <Text fontSize="xs" fontWeight="medium">Tables</Text>
                      </HStack>
                      <HStack spacing={2}>
                        <Text fontSize="sm" fontWeight="medium" color="gray.700">
                          {restaurant.total_tables}
                        </Text>
                        <Text fontSize="xs" color={`${occupancyColor}.600`}>
                          ({restaurant.available_tables} free)
                        </Text>
                      </HStack>
                    </VStack>
                  </Grid>
                  
                  {/* Occupancy Indicator */}
                  <HStack justify="space-between">
                    <Text fontSize="xs" color="gray.500" fontWeight="medium">
                      Occupancy
                    </Text>
                    <HStack spacing={2}>
                      <Box
                        w={2}
                        h={2}
                        bg={`${occupancyColor}.400`}
                        borderRadius="full"
                      />
                      <Text fontSize="xs" color="gray.600" fontWeight="medium">
                        {restaurant.total_tables > 0 
                          ? `${Math.round(((restaurant.total_tables - restaurant.available_tables) / restaurant.total_tables) * 100)}%`
                          : '0%'
                        }
                      </Text>
                    </HStack>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          );
        })}
        </Grid>
        
        {selectedRestaurant && (
          <Card variant="professionalTableSelected" bg="pos.25">
            <CardBody p={4}>
              <HStack spacing={3}>
                <Icon as={CheckCircle} boxSize={5} color="pos.600" />
                <VStack align="start" spacing={1}>
                  <Text fontSize="lg" fontWeight="bold" color="pos.800">
                    Selected: {selectedRestaurant.name}
                  </Text>
                  <Text fontSize="sm" color="pos.600">
                    {selectedRestaurant.description} • {getRestaurantTypeLabel(selectedRestaurant.type)}
                  </Text>
                </VStack>
              </HStack>
            </CardBody>
          </Card>
        )}
      </VStack>
    </Container>
  );
};

export default RestaurantSelector;