import React, { useEffect } from 'react';
import {
  Select,
  HStack,
  VStack,
  Text,
  Box,
  Badge,
  Icon,
  Spinner,
  useColorModeValue,
} from '@chakra-ui/react';
import { Store, MapPin, Clock } from 'lucide-react';
import { usePOS } from '../../context/POSContext';

const RestaurantDropdown = () => {
  const {
    state,
    selectRestaurant,
    loadRestaurants,
  } = usePOS();
  
  // All hooks must be called before any early returns
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const activeBg = useColorModeValue('green.50', 'green.900');
  const iconColor = useColorModeValue('gray.600', 'gray.400');
  const selectBg = useColorModeValue('gray.50', 'gray.800');
  const textColor = useColorModeValue('gray.700', 'gray.200');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');
  
  // Load restaurants on mount
  useEffect(() => {
    if (state.restaurants.length === 0) {
      loadRestaurants();
    }
  }, [loadRestaurants, state.restaurants.length]);
  
  // Auto-select first restaurant if none selected
  useEffect(() => {
    if (state.restaurants.length > 0 && !state.selectedRestaurant) {
      selectRestaurant(state.restaurants[0]);
    }
  }, [state.restaurants, state.selectedRestaurant, selectRestaurant]);
  
  const handleRestaurantChange = (event) => {
    const restaurantId = event.target.value;
    const restaurant = state.restaurants.find(r => r.id.toString() === restaurantId);
    if (restaurant) {
      selectRestaurant(restaurant);
    }
  };
  
  const getRestaurantStatus = (restaurant) => {
    if (!restaurant.is_active) return 'Closed';
    
    // Check if within operating hours (simplified)
    const now = new Date();
    const currentHour = now.getHours();
    
    // Check if opening_hours exists and is a string
    if (restaurant.opening_hours && typeof restaurant.opening_hours === 'string') {
      // Parse opening hours (assuming format like "09:00-22:00")
      try {
        const parts = restaurant.opening_hours.split('-');
        if (parts.length === 2) {
          const [openTime, closeTime] = parts.map(time => {
            const [hours] = time.trim().split(':');
            return parseInt(hours);
          });
          
          if (!isNaN(openTime) && !isNaN(closeTime)) {
            if (currentHour >= openTime && currentHour < closeTime) {
              return 'Open';
            }
            return 'Closed';
          }
        }
      } catch (error) {
        console.warn('Error parsing opening hours:', error);
      }
    }
    
    return restaurant.is_active ? 'Open' : 'Closed';
  };
  
  if (state.loading.restaurants) {
    return (
      <HStack spacing={2} px={3} py={2}>
        <Spinner size="sm" color="pos.500" />
        <Text fontSize="sm">Loading restaurants...</Text>
      </HStack>
    );
  }
  
  if (!state.restaurants || state.restaurants.length === 0) {
    return (
      <HStack spacing={2} px={3} py={2}>
        <Icon as={Store} boxSize={4} color="gray.500" />
        <Text fontSize="sm" color="gray.500">No restaurants available</Text>
      </HStack>
    );
  }
  
  return (
    <HStack spacing={2} minW="200px" maxW="300px">
      <Icon as={Store} boxSize={4} color={iconColor} />
      <Box flex={1}>
        <Select
          value={state.selectedRestaurant?.id || ''}
          onChange={handleRestaurantChange}
          size="sm"
          variant="filled"
          bg={selectBg}
          px={3}
          py={2}
          borderRadius="full"
          fontSize="sm"
          fontWeight="500"
          color={textColor}
          cursor="pointer"
          placeholder="Select restaurant"
          border="none"
          _hover={{ 
            bg: hoverBg,
          }}
          _focus={{ 
            bg: bg,
            boxShadow: 'sm',
            outline: 'none',
            borderColor: 'transparent'
          }}
        >
          {!state.selectedRestaurant && (
            <option value="" disabled>Select restaurant</option>
          )}
          {state.restaurants.map((restaurant) => {
            const status = getRestaurantStatus(restaurant);
            return (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name} {status === 'Closed' ? '(Closed)' : ''}
              </option>
            );
          })}
        </Select>
      </Box>
      
      
    </HStack>
  );
};

export default RestaurantDropdown;