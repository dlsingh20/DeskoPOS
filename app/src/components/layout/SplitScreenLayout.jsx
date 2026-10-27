import React, { useState } from 'react';
import {
  Box,
  Flex,
  useColorModeValue,
  useBreakpointValue,
  IconButton,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  useDisclosure,
} from '@chakra-ui/react';
import { Menu, X } from 'lucide-react';

const SplitScreenLayout = ({
  sidebar,
  main,
  rightPanel,
  mobileDrawer,
  showSidebar = true,
  showRightPanel = true,
  sidebarWidth = '200px',
  rightPanelWidth = '350px',
  collapsedSidebarWidth = '60px',
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { isOpen: isMobileMenuOpen, onOpen, onClose } = useDisclosure();
  
  const bg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  
  // Responsive breakpoints
  const isMobile = useBreakpointValue({ base: true, md: false });
  const isTablet = useBreakpointValue({ base: false, md: true, lg: false });
  const isDesktop = useBreakpointValue({ base: false, lg: true });
  const showDesktopLayout = useBreakpointValue({ base: false, lg: true });
  
  // Calculate dynamic widths
  const currentSidebarWidth = isSidebarCollapsed ? collapsedSidebarWidth : sidebarWidth;
  const mainWidth = `calc(100% - ${showSidebar && isDesktop ? currentSidebarWidth : '0px'} - ${showRightPanel && showDesktopLayout ? rightPanelWidth : '0px'})`;
  
  // Mobile layout
  if (isMobile) {
    return (
      <Box h="full" bg={bg} position="relative">
        {/* Mobile Header with Menu Button */}
        <Box
          position="fixed"
          top="60px"
          left="10px"
          zIndex={1000}
        >
          <IconButton
            icon={<Menu />}
            onClick={onOpen}
            colorScheme="pos"
            size="md"
            borderRadius="full"
            shadow="lg"
          />
        </Box>
        
        {/* Main Content */}
        <Box h="full" overflowY="auto">
          {main}
        </Box>
        
        {/* Mobile Drawer for Categories */}
        <Drawer isOpen={isMobileMenuOpen} placement="left" onClose={onClose}>
          <DrawerOverlay />
          <DrawerContent maxW="280px">
            <DrawerCloseButton />
            <DrawerBody p={0}>
              {sidebar}
            </DrawerBody>
          </DrawerContent>
        </Drawer>
        
        {/* Mobile Bottom Drawer/Modal for Cart */}
        {mobileDrawer}
      </Box>
    );
  }
  
  // Tablet layout
  if (isTablet && !isDesktop) {
    return (
      <Flex h="full" bg={bg}>
        {/* Main Content */}
        <Box flex={1} overflowY="auto">
          {main}
        </Box>
        
        {/* Right Panel (Cart) */}
        {showRightPanel && (
          <Box
            w={rightPanelWidth}
            borderLeftWidth="1px"
            borderColor={borderColor}
            bg="white"
            h="full"
            display="flex"
            flexDirection="column"
          >
            {rightPanel}
          </Box>
        )}
      </Flex>
    );
  }
  
  // Desktop layout
  return (
    <Flex h="full" bg={bg}>
      {/* Left Sidebar (Categories) */}
      {showSidebar && isDesktop && (
        <Box
          w={currentSidebarWidth}
          borderRightWidth="1px"
          borderColor={borderColor}
          bg="white"
          transition="width 0.3s ease"
          position="relative"
        >
          {React.cloneElement(sidebar, {
            isCollapsed: isSidebarCollapsed,
            onToggleCollapse: () => setIsSidebarCollapsed(!isSidebarCollapsed),
          })}
        </Box>
      )}
      
      {/* Main Content Area */}
      <Box
        flex={1}
        w={mainWidth}
        overflowY="auto"
        bg={bg}
      >
        {main}
      </Box>
      
      {/* Right Panel (Cart) - Desktop layout */}
      {showRightPanel && showDesktopLayout && (
        <Box
          w={rightPanelWidth}
          borderLeftWidth="1px"
          borderColor={borderColor}
          overflowY="auto"
          bg="white"
        >
          {rightPanel}
        </Box>
      )}
    </Flex>
  );
};

export default SplitScreenLayout;