import React from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  VStack,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  Settings,
  LogOut,
  Bell,
  Home,
  Grid3x3,
  Menu as MenuIcon,
  ShoppingCart,
  ChefHat,
  BarChart3,
  AlertTriangle,
  Archive,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import RestaurantDropdown from '../restaurant/RestaurantDropdown';

/**
 * Compact POS Header Component
 * Merged header with navigation for minimal height
 */
const POSHeader = ({ onLogout }) => {
  const { state, clearRestaurantSelection, clearTableSelection } = usePOS();
  const navigate = useNavigate();
  const location = useLocation();
  const borderColorValue = useColorModeValue('gray.200', 'gray.600');

  // Mock user data (in real app, would come from auth context)
  const currentUser = {
    name: 'John Doe',
    role: 'Server',
    avatar: null,
  };

  // System connection status (mock)
  const isOnline = true;

  // Calculate total active orders for badge
  const getActiveOrdersCount = () => {
    if (!state.orders) return 0;
    return state.orders.filter(o =>
      ['pending', 'confirmed', 'preparing', 'ready', 'served'].includes(o.status) &&
      o.status !== 'completed' && o.status !== 'cancelled'
    ).length;
  };

  // Navigation items - consolidated
  const navigationItems = [
    {
      path: '/menu',
      label: 'Menu',
      icon: MenuIcon,
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
  ];

  const isActivePath = (path) => {
    return location.pathname === path || location.pathname.startsWith(path);
  };

  const handleNavigate = (path, enabled) => {
    console.log('Navigating to:', path, 'Enabled:', enabled, 'Selected Restaurant:', state.selectedRestaurant);
    if (enabled) {
      navigate(path);
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  const handleSettings = () => {
    console.log('Settings clicked');
  };

  const handleProfile = () => {
    console.log('Profile clicked');
  };

  const handleArchive = () => {
    if (state.selectedRestaurant) {
      navigate('/archive');
    }
  };

  const handleAnalytics = () => {
    if (state.selectedRestaurant) {
      navigate('/reports');
    }
  };

  return (
    <Box
      as="header"
      role="banner"
      bg="white"
      borderBottom="1px solid"
      borderColor={borderColorValue}
      px={4}
      py={2}
      position="sticky"
      top={0}
      zIndex={100}
    >
      <Flex align="center" justify="space-between" gap={4} h={14}>
        {/* Logo and Restaurant Selector */}
        <HStack spacing={4} flex="1" maxW="40%">
          {/* Logo */}
          <Box>
            <Text
              fontSize="xl"
              fontWeight="700"
              color="gray.800"
              letterSpacing="tight"
            >
              DeskoPOS
            </Text>
            <Text fontSize="xs" color="gray.500" mt={-1}>
              POS System
            </Text>
          </Box>

          {/* Restaurant Dropdown */}
          <RestaurantDropdown />
        </HStack>

        {/* Navigation Tabs */}
        <HStack spacing={2} flex="1" justify="center">
          {navigationItems.map((item) => {
            const isActive = isActivePath(item.path);
            const isEnabled = item.enabled;

            return (
              <Box
                key={item.path}
                position="relative"
                cursor={isEnabled ? 'pointer' : 'not-allowed'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNavigate(item.path, isEnabled);
                }}
                px={{ base: 2, md: 3, lg: 4 }}
                py={3}
                borderBottom="2px solid"
                borderColor={isActive ? 'highlight.500' : 'transparent'}
                transition="all 0.2s ease"
                _hover={{
                  borderColor: isEnabled ? (isActive ? 'highlight.600' : 'highlight.300') : 'transparent',
                  bg: isEnabled ? 'gray.50' : 'transparent',
                }}
                opacity={isEnabled ? 1 : 0.4}
              >
                <HStack spacing={2} justify="center">
                  <Icon
                    as={item.icon}
                    boxSize={4}
                    color={isActive ? 'highlight.600' : (isEnabled ? 'gray.600' : 'gray.400')}
                  />
                  <Text
                    fontSize="sm"
                    fontWeight={isActive ? '600' : '500'}
                    color={isActive ? 'highlight.700' : (isEnabled ? 'gray.700' : 'gray.400')}
                    display={{ base: 'none', lg: 'block', xl: 'block' }}
                    noOfLines={1}
                  >
                    {item.label}
                  </Text>

                  {/* Clean Badge for counts */}
                  {item.badge && item.badge > 0 && (
                    <Box
                      minW="18px"
                      h="18px"
                      borderRadius="full"
                      bg={isActive ? 'highlight.600' : 'red.500'}
                      color="white"
                      fontSize="xs"
                      fontWeight="600"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      ml={1}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </Box>
                  )}
                </HStack>

                {!isEnabled && (
                  <Text
                    position="absolute"
                    top="-8px"
                    right="-8px"
                    fontSize="xs"
                    color="red.500"
                    fontWeight="600"
                    bg="white"
                    px={1}
                    borderRadius="sm"
                    display={{ base: 'none', md: 'block' }}
                  >
                    •
                  </Text>
                )}
              </Box>
            );
          })}
        </HStack>

        {/* Professional Status and User Section */}
        <HStack spacing={4} flex="1" maxW="30%" justify="flex-end">
          {/* Minimal Status Indicator */}
          <HStack spacing={2}>
            {/* Connection Status */}
            <Box
              w={2}
              h={2}
              borderRadius="full"
              bg={isOnline ? 'green.500' : 'red.500'}
              title={isOnline ? 'Online' : 'Offline'}
            />

            {/* Notification Indicator */}
            <Box position="relative">
              <Icon as={Bell} boxSize={4} color="gray.500" />
              {state.kitchenStats?.pending_orders > 0 && (
                <Box
                  position="absolute"
                  top="-2px"
                  right="-2px"
                  w={2}
                  h={2}
                  borderRadius="full"
                  bg="red.500"
                  title={`${state.kitchenStats.pending_orders} pending orders`}
                />
              )}
            </Box>
          </HStack>

          {/* Clean User Menu */}
          <Menu>
            <MenuButton
              as={Box}
              cursor="pointer"
              p={1}
              borderRadius="lg"
              _hover={{ bg: 'gray.50' }}
              transition="all 0.2s"
            >
              <HStack spacing={3}>
                <Avatar
                  size="sm"
                  name={currentUser.name}
                  src={currentUser.avatar}
                  bg="highlight.500"
                />
                <VStack spacing={0} align="start" display={{ base: 'none', lg: 'flex' }}>
                  <Text fontSize="sm" fontWeight="600" color="gray.700">
                    {currentUser.name}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    {currentUser.role}
                  </Text>
                </VStack>
              </HStack>
            </MenuButton>

            <MenuList borderRadius="lg" boxShadow="lg" minW="200px" border="1px solid" borderColor="gray.200" p={0}>
              <Box p={4} borderBottom="1px solid" borderColor="gray.100">
                <Text fontSize="sm" fontWeight="600" color="gray.800">
                  {currentUser.name}
                </Text>
                <Text fontSize="xs" color="gray.500">
                  {currentUser.role} • {isOnline ? 'Online' : 'Offline'}
                </Text>
              </Box>
              <MenuItem icon={<Icon as={User} boxSize={4} />} onClick={handleProfile} py={3} px={4} fontSize="sm" _hover={{ bg: 'gray.50' }}>
                Profile
              </MenuItem>
              <MenuItem icon={<Icon as={Settings} boxSize={4} />} onClick={handleSettings} py={3} px={4} fontSize="sm" _hover={{ bg: 'gray.50' }}>
                Settings
              </MenuItem>
              <MenuItem
                icon={<Icon as={Archive} boxSize={4} />}
                onClick={handleArchive}
                py={3}
                px={4}
                fontSize="sm"
                _hover={{ bg: 'gray.50' }}
                isDisabled={!state.selectedRestaurant}
              >
                Archive
              </MenuItem>
              <MenuItem
                icon={<Icon as={BarChart3} boxSize={4} />}
                onClick={handleAnalytics}
                py={3}
                px={4}
                fontSize="sm"
                _hover={{ bg: 'gray.50' }}
                isDisabled={!state.selectedRestaurant}
              >
                Analytics
              </MenuItem>
              <MenuDivider m={0} />
              <MenuItem
                icon={<Icon as={LogOut} boxSize={4} />}
                onClick={handleLogout}
                color="red.600"
                py={3}
                px={4}
                fontSize="sm"
                fontWeight="500"
                _hover={{ bg: 'red.50' }}
              >
                Sign Out
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>
    </Box>
  );
};

export default POSHeader;
