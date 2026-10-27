import React from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  IconButton,
  Badge,
  useColorModeValue,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
  VStack,
  Button,
  Divider,
} from '@chakra-ui/react';
import { Menu, ShoppingCart, User, LogOut } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import RestaurantDropdown from '../restaurant/RestaurantDropdown';

/**
 * Mobile Header Component
 * Compact header for mobile devices with essential navigation
 */
const MobileHeader = ({ onLogout, onOpenCart }) => {
  const { state } = usePOS();
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  
  // Calculate cart count
  const cartItemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  
  return (
    <>
      <Box
        as="header"
        bg={bg}
        borderBottom="1px solid"
        borderColor={borderColor}
        px={3}
        py={2}
        position="sticky"
        top={0}
        zIndex={100}
        display={{ base: 'block', lg: 'none' }} // Only show on mobile
      >
        <Flex align="center" justify="space-between" h={12}>
          {/* Left: Menu Button */}
          <IconButton
            icon={<Menu />}
            variant="ghost"
            size="md"
            onClick={onOpen}
            aria-label="Open menu"
          />
          
          {/* Center: Restaurant Selector or App Name */}
          <Box flex="1" mx={2}>
            {state.selectedRestaurant ? (
              <RestaurantDropdown compact />
            ) : (
              <Text fontSize="lg" fontWeight="bold" textAlign="center">
                DeskoPOS
              </Text>
            )}
          </Box>
          
          {/* Right: Cart Button */}
          <Box position="relative">
            <IconButton
              icon={<ShoppingCart />}
              variant="ghost"
              size="md"
              onClick={onOpenCart}
              aria-label="Open cart"
            />
            {cartItemCount > 0 && (
              <Badge
                position="absolute"
                top="-2px"
                right="-2px"
                borderRadius="full"
                bg="highlight.500"
                color="white"
                fontSize="xs"
                minW="20px"
                h="20px"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {cartItemCount}
              </Badge>
            )}
          </Box>
        </Flex>
      </Box>
      
      {/* Mobile Menu Drawer */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose} size="xs">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Menu</DrawerHeader>
          
          <DrawerBody>
            <VStack spacing={4} align="stretch">
              {/* User Info */}
              <Box p={3} bg="gray.50" borderRadius="md">
                <HStack spacing={3}>
                  <Box p={2} bg="highlight.500" borderRadius="full">
                    <User size={20} color="white" />
                  </Box>
                  <Box flex="1">
                    <Text fontWeight="bold">John Doe</Text>
                    <Text fontSize="sm" color="gray.600">Server</Text>
                  </Box>
                </HStack>
              </Box>
              
              <Divider />
              
              {/* Quick Actions */}
              <VStack align="stretch" spacing={2}>
                <Button
                  leftIcon={<LogOut />}
                  variant="ghost"
                  justifyContent="flex-start"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  colorScheme="red"
                >
                  Sign Out
                </Button>
              </VStack>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default MobileHeader;