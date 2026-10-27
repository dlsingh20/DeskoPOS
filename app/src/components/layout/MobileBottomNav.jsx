import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Icon,
  Text,
  Badge,
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
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';

/**
 * MobileBottomNav Component
 * Fixed bottom navigation for mobile and tablet devices
 */
const MobileBottomNav = () => {
  const { state, clearRestaurantSelection, clearTableSelection } = usePOS();
  const navigate = useNavigate();
  const location = useLocation();
  
  const bg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.500');
  const activeBg = useColorModeValue('highlight.50', 'highlight.800');
  
  // Core navigation items for mobile - simplified
  const getActiveOrdersCount = () => {
    if (!state.orders) return 0;
    return state.orders.filter(o => 
      ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
    ).length;
  };

  const mobileNavigationItems = [
    {
      path: '/menu',
      label: 'Menu',
      icon: Menu,
      badge: state.cart.length || null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/table-management',
      label: 'Tables',
      icon: Grid3x3,
      badge: state.tables ? state.tables.filter(t => !t.is_available).length || null : null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/orders',
      label: 'Orders',
      icon: ShoppingCart,
      badge: getActiveOrdersCount() || null,
      enabled: !!state.selectedRestaurant,
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: BarChart3,
      badge: null,
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
        clearRestaurantSelection();
      } else if (path === '/tables' && state.selectedTable) {
        clearTableSelection();
      }
      navigate(path);
    }
  };

  return (
    <>
      {/* Bottom Navigation Bar */}
      <Box
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        bg={bg}
        borderTop="1px solid"
        borderColor={borderColor}
        px={2}
        py={1}
        zIndex={1000}
        display={{ base: 'block', lg: 'none' }} // Hide on desktop
        boxShadow="0 -2px 10px rgba(0,0,0,0.1)"
      >
        <HStack spacing={0} justify="space-around">
          {mobileNavigationItems.map((item) => {
            const isActive = isActivePath(item.path);
            const isEnabled = item.enabled;
            
            return (
              <VStack
                key={item.path}
                spacing={1}
                flex={1}
                py={2}
                px={1}
                cursor={isEnabled ? 'pointer' : 'not-allowed'}
                onClick={() => isEnabled && handleNavigate(item.path, isEnabled)}
                bg={isActive ? activeBg : 'transparent'}
                borderRadius="lg"
                transition="all 0.2s ease"
                opacity={isEnabled ? 1 : 0.4}
                position="relative"
                minH="60px"
                justify="center"
              >
                <Box position="relative">
                  <Icon
                    as={item.icon}
                    boxSize={6}
                    color={isActive ? 'highlight.600' : (isEnabled ? 'gray.600' : 'gray.400')}
                  />
                  
                  {/* Badge for counts */}
                  {item.badge && item.badge > 0 && (
                    <Badge
                      position="absolute"
                      top="-8px"
                      right="-8px"
                      borderRadius="full"
                      bg={isActive ? 'highlight.600' : 'red.500'}
                      color="white"
                      fontSize="xs"
                      minW="18px"
                      h="18px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      border="2px solid"
                      borderColor={bg}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </Badge>
                  )}
                </Box>
                
                <Text
                  fontSize="xs"
                  fontWeight={isActive ? '600' : '500'}
                  color={isActive ? 'highlight.700' : (isEnabled ? 'gray.700' : 'gray.400')}
                  noOfLines={1}
                  textAlign="center"
                >
                  {item.label}
                </Text>
                
                {/* Active indicator line */}
                {isActive && (
                  <Box
                    position="absolute"
                    top={0}
                    left="50%"
                    transform="translateX(-50%)"
                    w="24px"
                    h="3px"
                    bg="highlight.600"
                    borderRadius="full"
                  />
                )}
              </VStack>
            );
          })}
        </HStack>
      </Box>
      
      {/* Spacer to push content above bottom nav */}
      <Box 
        h="70px" 
        display={{ base: 'block', lg: 'none' }} 
        flexShrink={0}
      />
    </>
  );
};

export default MobileBottomNav;