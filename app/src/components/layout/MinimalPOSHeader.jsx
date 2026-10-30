import React, { useState, useEffect } from 'react';
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
  Badge,
  useColorModeValue,
  Tooltip,
  IconButton,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  Radio,
  RadioGroup,
  Divider,
  Button,
  useDisclosure,
} from '@chakra-ui/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  Settings,
  LogOut,
  ShoppingBag,
  Users,
  Archive,
  TrendingUp,
  ChevronDown,
  Circle,
  Clock,
  BarChart3,
  Package,
  Printer,
  Menu as MenuIcon,
  UtensilsCrossed,
  History,
  Globe,
  Wifi,
  WifiOff,
  UserCog,
  Wallet,
  Boxes,
  Monitor,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import RestaurantDropdown from '../restaurant/RestaurantDropdown';
import PrintService from '../../services/PrintService';
import printSettingsService from '../../services/PrintSettingsService';
import { useAccess } from '../../context/AccessContext';
import { CashCounterBadge, useCashCounter } from '../../context/CashCounterContext';


/**
 * Minimalistic High-Quality POS Header
 * Premium design with subtle animations and clean interface
 */
const MinimalPOSHeader = ({ onLogout }) => {
  const { state } = usePOS();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { isOpen: isSettingsOpen, onOpen: onSettingsOpen, onClose: onSettingsClose } = useDisclosure();
  const { isOpen: isMobileMenuOpen, onOpen: onMobileMenuOpen, onClose: onMobileMenuClose } = useDisclosure();
  const [companionMode, setCompanionMode] = useState(PrintService.isCompanionMode());
  const [printMode, setPrintMode] = useState(PrintService.getPrintMode() || 'browser');

  // Color values for minimalistic theme
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'gray.800');
  const activeBg = useColorModeValue('gray.100', 'gray.700');
  const accentColor = useColorModeValue('blue.600', 'blue.400');
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const tabBg = useColorModeValue('gray.50', 'gray.800');
  const activeTabBg = useColorModeValue('blue.600', 'blue.500');
  const onlineBg = useColorModeValue('green.50', 'rgba(72,187,120,0.15)');
  const offlineBg = useColorModeValue('red.50', 'rgba(245,101,101,0.15)');

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Track network connectivity
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  
  // Print jobs without a restaurant id use the selected restaurant's print settings
  useEffect(() => {
    if (!state.selectedRestaurant) return;
    printSettingsService.setActiveRestaurant(state.selectedRestaurant.id);
    // DeskoPOS: bring this device up to date with the restaurant's shared settings
    printSettingsService.loadShared(state.selectedRestaurant.id).catch(() => {});
  }, [state.selectedRestaurant]);

  // Signed-in operator and their POS role
  const { userName, access, can } = useAccess();
  // Sign out asks whether to close the cash counter first
  const { signOut } = useCashCounter();
  const handleSignOut = signOut || onLogout;
  const currentUser = {
    name: userName || 'Staff',
    role: access?.roleLabel || '',
    avatar: null,
  };
  const canArchive = can('history.full');
  const canReports = can('reports.view');
  const canSetup = can('settings.manage');
  const supportPhone = process.env.REACT_APP_SUPPORT_PHONE;
  
  // Primary module tabs
  const moduleTabs = [
    { path: '/fine-dine', label: 'Fine Dine', icon: UtensilsCrossed },
    { path: '/history', label: 'History', icon: History },
    { path: '/third-party', label: 'Third Party', icon: Globe },
  ];

  // Side navigation (opened from the hamburger menu). Orders are taken on Fine Dine (dine-in and
  // takeaway); the menu itself is managed in Product Management.
  const navigationItems = [
    {
      path: '/reports',
      label: 'Reports',
      icon: TrendingUp,
      isActive: false,
      permission: 'reports.view',
    },
    {
      path: '/tables',
      label: 'Tables & QR Codes',
      icon: Users,
      isActive: false,
      permission: 'settings.manage',
    },
    {
      path: '/orders',
      label: 'Orders',
      icon: ShoppingBag,
      badge: state.orders?.filter(o => ['pending', 'preparing'].includes(o.status))?.length || 0,
    },
    {
      path: '/kot-timeline',
      label: 'KOT Timeline',
      icon: Clock,
      isActive: false,
    },
    {
      path: '/outstanding',
      label: 'Outstanding',
      icon: Wallet,
      isActive: false,
    },
    {
      path: '/products',
      label: 'Product Management',
      icon: Boxes,
      isActive: false,
      permission: 'settings.manage',
    },
    {
      path: '/settings/printing',
      label: 'Bill & KOT Printing',
      icon: Printer,
      isActive: false,
      permission: 'settings.manage',
    },
    {
      path: '/settings/cash-counters',
      label: 'Cash Counters',
      icon: Monitor,
      isActive: false,
      permission: 'settings.manage',
    },
    {
      path: '/users',
      label: 'Users & Roles',
      icon: UserCog,
      isActive: false,
      permission: 'users.manage',
    },
  ].filter((item) => !item.permission || can(item.permission));
  
  const isActivePath = (path) => {
    if (path === '/fine-dine' && location.pathname === '/') return true;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };
  
  const handleNavigate = (path) => {
    if (state.selectedRestaurant) {
      navigate(path);
    }
  };
  
  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={1000}
      bg={bg}
      boxShadow={scrolled ? 'sm' : 'none'}
      backdropFilter={scrolled ? 'blur(10px)' : 'none'}
      transition="all 0.3s ease"
      borderBottom="1px solid"
      borderColor={scrolled ? 'transparent' : borderColor}
    >
      <Flex
        align="center"
        justify="space-between"
        h="56px"
        maxW="100%"
        px={6}
      >
        {/* Left: side menu, brand, restaurant */}
        <HStack spacing={3} flexShrink={0}>
          <IconButton
            icon={<Icon as={MenuIcon} boxSize={5} />}
            variant="ghost"
            size="sm"
            borderRadius="10px"
            color={textColor}
            aria-label="Open navigation menu"
            aria-expanded={isMobileMenuOpen}
            onClick={onMobileMenuOpen}
          />
          <HStack spacing={2} cursor="pointer" onClick={() => navigate('/')} display={{ base: 'none', sm: 'flex' }}>
            {/* Minimalist Logo */}
            <Box
              w="28px"
              h="28px"
              bg={accentColor}
              borderRadius="8px"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text color="white" fontSize="sm" fontWeight="bold">
                R
              </Text>
            </Box>
            <Text
              fontSize="md"
              fontWeight="600"
              color={textColor}
              letterSpacing="-0.02em"
              display={{ base: 'none', xl: 'block' }}
            >
              DeskoPOS
            </Text>
          </HStack>

          {/* Restaurant Dropdown - Integrated */}
          <Box flex="0 0 auto">
            <RestaurantDropdown />
          </Box>
        </HStack>

        {/* Module tabs: Fine Dine / History / Third Party */}
        <HStack as="nav" aria-label="POS modules" spacing={1} bg={tabBg} p={1} borderRadius="12px" mx={2} overflowX="auto">
          {moduleTabs.map((tab) => {
            const isActive = isActivePath(tab.path);
            const isEnabled = !!state.selectedRestaurant;
            return (
              <Box
                key={tab.path}
                as="button"
                onClick={() => handleNavigate(tab.path)}
                disabled={!isEnabled}
                aria-current={isActive ? 'page' : undefined}
                px={{ base: 2.5, md: 3.5 }}
                py={1.5}
                borderRadius="9px"
                bg={isActive ? activeTabBg : 'transparent'}
                color={isActive ? 'white' : mutedColor}
                fontWeight={isActive ? '700' : '600'}
                cursor={isEnabled ? 'pointer' : 'not-allowed'}
                opacity={isEnabled ? 1 : 0.4}
                transition="background 0.15s ease, color 0.15s ease"
                _hover={isEnabled && !isActive ? { bg: hoverBg, color: textColor } : {}}
                _focusVisible={{ outline: '2px solid', outlineColor: accentColor, outlineOffset: '1px' }}
              >
                <HStack spacing={2}>
                  <Icon as={tab.icon} boxSize={4} />
                  <Text fontSize="sm" textTransform="uppercase" letterSpacing="0.03em" whiteSpace="nowrap" display={{ base: 'none', md: 'block' }}>
                    {tab.label}
                  </Text>
                </HStack>
              </Box>
            );
          })}
        </HStack>

        {/* User Section */}
        <HStack spacing={3} justify="flex-end" flexShrink={0}>
          {/* Open cash counter (or "Open counter" for Administrators who skipped) */}
          <CashCounterBadge />

          {/* Connection Status */}
          <Tooltip label={isOnline ? 'Connected to the network' : 'No network connection'}>
            <HStack
              spacing={1.5}
              px={2.5}
              py={1}
              borderRadius="full"
              bg={isOnline ? onlineBg : offlineBg}
              color={isOnline ? 'green.600' : 'red.600'}
              role="status"
            >
              <Icon as={isOnline ? Wifi : WifiOff} boxSize={3.5} />
              <Text fontSize="xs" fontWeight="600" display={{ base: 'none', lg: 'block' }}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </HStack>
          </Tooltip>

          {/* Support contact, set with REACT_APP_SUPPORT_PHONE */}
          {supportPhone && (
            <Box as="a" href={`tel:${supportPhone.replace(/[^\d+]/g, '')}`} display={{ base: 'none', xl: 'block' }} lineHeight="1.1" px={2} py={1} borderRadius="8px" border="1px solid" borderColor={borderColor}>
              <Text fontSize="2xs" fontWeight="700" color={mutedColor} letterSpacing="0.05em">SUPPORT</Text>
              <Text fontSize="sm" fontWeight="700" color={textColor}>{supportPhone}</Text>
            </Box>
          )}

          {/* User Menu - Desktop only (hidden on mobile) */}
          <Box display={{ base: 'none', md: 'flex' }}>
            <Menu>
              <MenuButton
                as={Box}
                cursor="pointer"
                borderRadius="full"
                transition="all 0.2s"
                _hover={{ opacity: 0.8 }}
              >
                <HStack spacing={2}>
                  <Avatar
                    size="sm"
                    name={currentUser.name}
                    src={currentUser.avatar}
                    bg={accentColor}
                    color="white"
                    fontSize="xs"
                    borderWidth="2px"
                    borderColor={bg}
                  />
                  <Text fontSize="sm" fontWeight="600" color={textColor} display={{ base: 'none', lg: 'block' }} maxW="140px" isTruncated>
                    {currentUser.name}
                  </Text>
                  <Icon
                    as={ChevronDown}
                    boxSize={3}
                    color={mutedColor}
                  />
                </HStack>
              </MenuButton>

              <MenuList
                borderRadius="12px"
                boxShadow="xl"
                border="none"
                p={2}
                minW="220px"
              >
                {/* User Info */}
                <Box px={3} py={2} mb={1}>
                  <Text fontSize="sm" fontWeight="600" color={textColor}>
                    {currentUser.name}
                  </Text>
                  <Text fontSize="xs" color={mutedColor}>
                    {currentUser.role}
                  </Text>
                </Box>

                <MenuDivider />

                <MenuItem
                  icon={<User size={16} />}
                  fontSize="sm"
                  borderRadius="8px"
                  _hover={{ bg: hoverBg }}
                  py={2}
                >
                  Profile
                </MenuItem>

                <MenuItem
                  icon={<Settings size={16} />}
                  fontSize="sm"
                  borderRadius="8px"
                  _hover={{ bg: hoverBg }}
                  py={2}
                  onClick={onSettingsOpen}
                >
                  Settings
                </MenuItem>

                <MenuItem
                  icon={<Archive size={16} />}
                  fontSize="sm"
                  borderRadius="8px"
                  _hover={{ bg: hoverBg }}
                  py={2}
                  display={canArchive ? undefined : 'none'}
                  onClick={() => state.selectedRestaurant && navigate('/archive')}
                  isDisabled={!state.selectedRestaurant}
                >
                  Archive
                </MenuItem>

                <MenuItem
                  icon={<BarChart3 size={16} />}
                  fontSize="sm"
                  borderRadius="8px"
                  _hover={{ bg: hoverBg }}
                  py={2}
                  display={canReports ? undefined : 'none'}
                  onClick={() => state.selectedRestaurant && navigate('/analytics')}
                  isDisabled={!state.selectedRestaurant}
                >
                  Analytics
                </MenuItem>

                <MenuItem
                  icon={<Package size={16} />}
                  fontSize="sm"
                  borderRadius="8px"
                  _hover={{ bg: hoverBg }}
                  py={2}
                  display={canSetup ? undefined : 'none'}
                  onClick={() => navigate('/inventory')}
                  isDisabled={!state.selectedRestaurant}
                >
                  <HStack justify="space-between" w="full">
                    <Text>Inventory</Text>
                    {state.lowStockCount > 0 && (
                      <Badge
                        colorScheme="orange"
                        borderRadius="full"
                        fontSize="xs"
                        minW="20px"
                        textAlign="center"
                      >
                        {state.lowStockCount}
                      </Badge>
                    )}
                  </HStack>
                </MenuItem>

                <MenuDivider />

                <MenuItem
                  icon={<LogOut size={16} />}
                  fontSize="sm"
                  borderRadius="8px"
                  color="red.500"
                  _hover={{ bg: 'red.50' }}
                  py={2}
                  onClick={handleSignOut}
                >
                  Sign out
                </MenuItem>
              </MenuList>
            </Menu>
          </Box>
        </HStack>
      </Flex>

      {/* Side Navigation Drawer (hamburger menu) */}
      <Drawer isOpen={isMobileMenuOpen} onClose={onMobileMenuClose} placement="left" size="xs">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px">
            <HStack spacing={3}>
              <Avatar
                size="sm"
                name={currentUser.name}
                src={currentUser.avatar}
                bg={accentColor}
                color="white"
                fontSize="xs"
              />
              <Box>
                <Text fontSize="sm" fontWeight="600">{currentUser.name}</Text>
                <Text fontSize="xs" color={mutedColor}>{currentUser.role}</Text>
              </Box>
            </HStack>
          </DrawerHeader>
          <DrawerBody py={4}>
            <VStack spacing={1} align="stretch">
              {[...moduleTabs.slice(0, 1), ...navigationItems].map((item) => {
                const isActive = isActivePath(item.path);
                const isEnabled = !!state.selectedRestaurant;
                return (
                  <Flex
                    key={item.path}
                    as="button"
                    align="center"
                    justify="space-between"
                    px={3}
                    py={2.5}
                    w="full"
                    borderRadius="8px"
                    fontSize="sm"
                    fontWeight={isActive ? '600' : '400'}
                    color={isActive ? accentColor : textColor}
                    bg={isActive ? activeBg : 'transparent'}
                    opacity={isEnabled ? 1 : 0.4}
                    cursor={isEnabled ? 'pointer' : 'not-allowed'}
                    aria-current={isActive ? 'page' : undefined}
                    _hover={{ bg: isEnabled ? hoverBg : 'transparent' }}
                    onClick={() => {
                      if (!isEnabled) return;
                      onMobileMenuClose();
                      navigate(item.path);
                    }}
                  >
                    <HStack spacing={3}>
                      <Icon as={item.icon} boxSize={4} color={isActive ? accentColor : mutedColor} />
                      <Text>{item.label}</Text>
                    </HStack>
                    {item.badge > 0 && (
                      <Badge colorScheme="red" borderRadius="full" fontSize="xs" minW="20px" textAlign="center">
                        {item.badge}
                      </Badge>
                    )}
                  </Flex>
                );
              })}

              <Divider my={2} />

              <Flex
                as="button"
                align="center"
                gap={3}
                px={3}
                py={2.5}
                w="full"
                borderRadius="8px"
                fontSize="sm"
                color={textColor}
                _hover={{ bg: hoverBg }}
                onClick={() => { onMobileMenuClose(); }}
              >
                <Icon as={User} boxSize={4} color={mutedColor} />
                <Text>Profile</Text>
              </Flex>

              <Flex
                as="button"
                align="center"
                gap={3}
                px={3}
                py={2.5}
                w="full"
                borderRadius="8px"
                fontSize="sm"
                color={textColor}
                _hover={{ bg: hoverBg }}
                onClick={() => { onMobileMenuClose(); setTimeout(onSettingsOpen, 300); }}
              >
                <Icon as={Settings} boxSize={4} color={mutedColor} />
                <Text>Settings</Text>
              </Flex>

              <Flex
                as="button"
                align="center"
                gap={3}
                px={3}
                py={2.5}
                w="full"
                borderRadius="8px"
                fontSize="sm"
                color={textColor}
                opacity={state.selectedRestaurant ? 1 : 0.4}
                cursor={state.selectedRestaurant ? 'pointer' : 'not-allowed'}
                display={canArchive ? 'flex' : 'none'}
                _hover={{ bg: state.selectedRestaurant ? hoverBg : 'transparent' }}
                onClick={() => {
                  if (state.selectedRestaurant) {
                    onMobileMenuClose();
                    navigate('/archive');
                  }
                }}
              >
                <Icon as={Archive} boxSize={4} color={mutedColor} />
                <Text>Archive</Text>
              </Flex>

              <Flex
                as="button"
                align="center"
                gap={3}
                px={3}
                py={2.5}
                w="full"
                borderRadius="8px"
                fontSize="sm"
                color={textColor}
                opacity={state.selectedRestaurant ? 1 : 0.4}
                cursor={state.selectedRestaurant ? 'pointer' : 'not-allowed'}
                display={canReports ? 'flex' : 'none'}
                _hover={{ bg: state.selectedRestaurant ? hoverBg : 'transparent' }}
                onClick={() => {
                  if (state.selectedRestaurant) {
                    onMobileMenuClose();
                    navigate('/analytics');
                  }
                }}
              >
                <Icon as={BarChart3} boxSize={4} color={mutedColor} />
                <Text>Analytics</Text>
              </Flex>

              <Flex
                as="button"
                align="center"
                justify="space-between"
                px={3}
                py={2.5}
                w="full"
                borderRadius="8px"
                fontSize="sm"
                color={textColor}
                opacity={state.selectedRestaurant ? 1 : 0.4}
                cursor={state.selectedRestaurant ? 'pointer' : 'not-allowed'}
                display={canSetup ? 'flex' : 'none'}
                _hover={{ bg: state.selectedRestaurant ? hoverBg : 'transparent' }}
                onClick={() => {
                  if (state.selectedRestaurant) {
                    onMobileMenuClose();
                    navigate('/inventory');
                  }
                }}
              >
                <HStack spacing={3}>
                  <Icon as={Package} boxSize={4} color={mutedColor} />
                  <Text>Inventory</Text>
                </HStack>
                {state.lowStockCount > 0 && (
                  <Badge
                    colorScheme="orange"
                    borderRadius="full"
                    fontSize="xs"
                    minW="20px"
                    textAlign="center"
                  >
                    {state.lowStockCount}
                  </Badge>
                )}
              </Flex>

              <Divider my={2} />

              <Flex
                as="button"
                align="center"
                gap={3}
                px={3}
                py={2.5}
                w="full"
                borderRadius="8px"
                fontSize="sm"
                color="red.500"
                _hover={{ bg: 'red.50' }}
                onClick={() => { onMobileMenuClose(); handleSignOut(); }}
              >
                <Icon as={LogOut} boxSize={4} />
                <Text>Sign out</Text>
              </Flex>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Settings Drawer */}
      <Drawer isOpen={isSettingsOpen} onClose={onSettingsClose} placement="right" size="sm">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px">
            <HStack spacing={2}>
              <Icon as={Settings} boxSize={5} />
              <Text>Settings</Text>
            </HStack>
          </DrawerHeader>
          <DrawerBody py={6}>
            <VStack spacing={6} align="stretch">
              {/* Printing Section */}
              <Box>
                <HStack spacing={2} mb={3}>
                  <Icon as={Printer} boxSize={4} color={mutedColor} />
                  <Text fontSize="sm" fontWeight="600" textTransform="uppercase" color={mutedColor} letterSpacing="0.05em">
                    Printing
                  </Text>
                </HStack>

                <Box
                  p={4}
                  borderRadius="12px"
                  bg={useColorModeValue('gray.50', 'gray.800')}
                >
                  <Text fontSize="sm" fontWeight="500" mb={3}>Print Method</Text>
                  <RadioGroup
                    value={printMode}
                    onChange={(value) => {
                      setPrintMode(value);
                      PrintService.setPrintMode(value);
                    }}
                  >
                    <VStack align="stretch" spacing={3}>
                      <Box>
                        <Radio value="browser" colorScheme="blue" size="sm">
                          <Text fontSize="sm" fontWeight="500">Browser Print</Text>
                        </Radio>
                        <Text fontSize="xs" color={mutedColor} ml={6}>
                          Opens print dialog in browser
                        </Text>
                      </Box>
                      <Box>
                        <Radio value="companion" colorScheme="blue" size="sm">
                          <Text fontSize="sm" fontWeight="500">Companion App</Text>
                        </Radio>
                        <Text fontSize="xs" color={mutedColor} ml={6}>
                          Direct silent printing via Bluetooth thermal printer
                        </Text>
                      </Box>
                    </VStack>
                  </RadioGroup>
                </Box>

                {printMode === 'companion' && (
                  <Box mt={3} p={3} borderRadius="8px" bg="blue.50" borderLeft="3px solid" borderColor="blue.400">
                    <Text fontSize="xs" color="blue.700">
                      Make sure the POS Print Companion app is running and connected to a Bluetooth printer. Prints are sent directly — no dialog needed.
                    </Text>
                  </Box>
                )}
              </Box>

              <Button
                leftIcon={<Icon as={Printer} boxSize={4} />}
                variant="outline"
                justifyContent="flex-start"
                isDisabled={!state.selectedRestaurant}
                display={canSetup ? undefined : 'none'}
                onClick={() => {
                  onSettingsClose();
                  navigate('/settings/printing');
                }}
              >
                Bill &amp; KOT formats
              </Button>

              <Divider />
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
};

export default MinimalPOSHeader;