import React from 'react';
import {
  Box,
  Flex,
  Button,
  HStack,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Grid3x3,
  Menu,
  ShoppingCart,
  ChefHat,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * POS Navigation Component
 * Main navigation for the POS system
 */
const POSNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, clearRestaurantSelection, clearTableSelection } = usePOS();
  
  const navBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  
  const navigationItems = [
    {
      path: '/',
      label: 'Restaurants',
      icon: Home,
      badge: state.restaurants.length || null,
      enabled: true,
    },
    {
      path: '/table-management',
      label: 'Tables',
      icon: Grid3x3,
      badge: state.selectedRestaurant ? `${state.tables.filter(t => !t.is_available).length}/${state.tables.length}` : null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/menu',
      label: 'Menu',
      icon: Menu,
      badge: state.menuItems.length || null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/orders',
      label: 'Orders',
      icon: ShoppingCart,
      badge: state.cart.length || null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/kitchen',
      label: 'Kitchen',
      icon: ChefHat,
      badge: state.kitchenStats?.pending_orders || null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: BarChart3,
      badge: null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/outstanding',
      label: 'Outstanding',
      icon: AlertTriangle,
      badge: null, // TODO: Add outstanding count from state
      enabled: !!state.selectedRestaurant,
    },
  ];
  
  const isActivePath = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };
  
  const handleNavigate = (path, enabled) => {
    if (enabled) {
      // Clear selections when navigating to previous steps
      if (path === '/' && state.selectedRestaurant) {
        // Going to restaurants - clear everything
        clearRestaurantSelection();
      } else if (path === '/tables' && state.selectedTable) {
        // Going to tables - clear table selection but keep restaurant
        clearTableSelection();
      }
      
      navigate(path);
    }
  };

  return (
    <Box
      bg={navBg}
      borderBottom="2px"
      borderColor={borderColor}
      px={{ base: 4, md: 6, lg: 8 }}
      py={{ base: 3, md: 4 }}
      boxShadow="md"
    >
      <Flex justify="center">
        <HStack spacing={{ base: 2, md: 3, lg: 4 }} maxW="container.2xl" flexWrap="wrap" justify="center">
          {navigationItems.map((item) => {
            const isActive = isActivePath(item.path);
            const isEnabled = item.enabled;
            
            return (
              <Button
                key={item.path}
                variant={isActive ? 'touchPrimary' : 'touchSecondary'}
                size={{ base: 'md', md: 'touch' }}
                leftIcon={<Icon as={item.icon} boxSize={{ base: 4, md: 5 }} />}
                onClick={() => handleNavigate(item.path, isEnabled)}
                isDisabled={!isEnabled}
                opacity={isEnabled ? 1 : 0.5}
                cursor={isEnabled ? 'pointer' : 'not-allowed'}
                position="relative"
                minW={{ base: '100px', md: '120px', lg: '140px' }}
                borderRadius="xl"
                fontSize={{ base: 'sm', md: 'md', lg: 'lg' }}
                _hover={isEnabled ? {
                  transform: 'translateY(-2px)',
                  boxShadow: 'xl',
                } : {}}
                _active={isEnabled ? {
                  transform: 'scale(0.98)',
                } : {}}
                transition="all 0.2s ease-in-out"
              >
                {item.label}
                
                {/* Badge for counts */}
                {item.badge && item.badge > 0 && (
                  <Box
                    position="absolute"
                    top="-6px"
                    right="-6px"
                    bg={isActive ? 'white' : 'pos.500'}
                    color={isActive ? 'pos.500' : 'white'}
                    borderRadius="full"
                    fontSize="sm"
                    fontWeight="bold"
                    minW="24px"
                    h="24px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    border="3px solid"
                    borderColor={navBg}
                    boxShadow="md"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </Box>
                )}
              </Button>
            );
          })}
        </HStack>
      </Flex>
      
      {/* Progress Indicator */}
      {state.selectedRestaurant && (
        <Box mt={{ base: 3, md: 4 }} px={{ base: 4, md: 6 }}>
          <Flex justify="center" align="center">
            <HStack spacing={{ base: 4, md: 6 }}>
              {/* Step indicators */}
              <Box
                w={4}
                h={4}
                borderRadius="full"
                bg="pos.500"
                position="relative"
                boxShadow="md"
                border="2px solid"
                borderColor="white"
              >
                {/* Restaurant selected */}
              </Box>
              
              <Box
                w="60px"
                h="3px"
                bg={state.selectedTable ? 'pos.500' : 'gray.300'}
                borderRadius="full"
                transition="all 0.3s ease-in-out"
              />
              
              <Box
                w={4}
                h={4}
                borderRadius="full"
                bg={state.selectedTable ? 'pos.500' : 'gray.300'}
                position="relative"
                boxShadow={state.selectedTable ? "md" : "none"}
                border="2px solid"
                borderColor="white"
                transition="all 0.3s ease-in-out"
              >
                {/* Table selected */}
              </Box>
              
              <Box
                w="60px"
                h="3px"
                bg={state.cart.length > 0 ? 'pos.500' : 'gray.300'}
                borderRadius="full"
                transition="all 0.3s ease-in-out"
              />
              
              <Box
                w={4}
                h={4}
                borderRadius="full"
                bg={state.cart.length > 0 ? 'pos.500' : 'gray.300'}
                position="relative"
                boxShadow={state.cart.length > 0 ? "md" : "none"}
                border="2px solid"
                borderColor="white"
                transition="all 0.3s ease-in-out"
              >
                {/* Cart has items */}
              </Box>
            </HStack>
          </Flex>
        </Box>
      )}
    </Box>
  );
};

export default POSNavigation;