import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Grid,
  Card,
  CardBody,
  Text,
  Badge,
  VStack,
  HStack,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  Container,
  useDisclosure,
  useBreakpointValue,
  ButtonGroup,
  IconButton,
  Tooltip,
  Input,
  InputGroup,
  InputLeftElement,
  Switch,
  FormControl,
  FormLabel,
} from '@chakra-ui/react';
import { Grid3x3, List, LayoutGrid, Search, Ban } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import TabbedCartPanel from '../cart/TabbedCartPanel';
import CategorySidebar from './CategorySidebar';
import CompactMenuGrid from './CompactMenuGrid';
import TopSellersRail from './TopSellersRail';
import MenuItemCard from './MenuItemCard';
import SplitScreenLayout from '../layout/SplitScreenLayout';
import OpenTicketsRail from '../cart/OpenTicketsRail';
import MobileBottomNav from '../layout/MobileBottomNav';
import MobileHeader from '../layout/MobileHeader';
import FloatingCartButton from '../cart/FloatingCartButton';
import MinimalCartDrawer from '../cart/MinimalCartDrawer';

/**
 * Sidebar pane for the menu page: the open-tickets switcher stacked above the
 * category list. Receives isCollapsed/onToggleCollapse from SplitScreenLayout
 * (via cloneElement) and forwards them to CategorySidebar rather than letting
 * them leak onto a DOM node.
 */
const MenuSidebarPane = ({ isCollapsed = false, onToggleCollapse, ...categoryProps }) => (
  <Box h="full" display="flex" flexDirection="column" overflow="hidden">
    {!isCollapsed && <OpenTicketsRail />}
    <Box flex="1" overflowY="auto">
      <CategorySidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        {...categoryProps}
      />
    </Box>
  </Box>
);

/**
 * Menu View Component
 * Displays menu items grouped by categories for the selected restaurant
 */
const MenuView = () => {
  const {
    state,
    addToCart,
    formatPrice,
  } = usePOS();

  // Mobile cart drawer
  const { isOpen: isCartOpen, onOpen: onCartOpen, onClose: onCartClose } = useDisclosure();

  // Category filter state
  const [activeCategory, setActiveCategory] = useState(null);
  const [filteredItems, setFilteredItems] = useState([]);
  const [viewMode, setViewMode] = useState('compact'); // 'grid' | 'compact' | 'list' - default to compact
  const [searchQuery, setSearchQuery] = useState(''); // Search state
  const [soldOutMode, setSoldOutMode] = useState(false); // Sold out management mode

  // Responsive breakpoints
  const isCompactMode = useBreakpointValue({ base: true, md: false });
  const showDesktopCart = useBreakpointValue({ base: false, xl: true });
  const useSplitLayout = useBreakpointValue({ base: false, md: true });

  // Group menu items by category and calculate counts
  const groupedItems = useMemo(() => {
    return state.menuItems?.reduce((groups, item) => {
      const category = item.category?.name || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
      return groups;
    }, {}) || {};
  }, [state.menuItems]);

  // Extract unique categories data for nav bar
  const categoriesData = useMemo(() => {
    const uniqueCategories = new Map();
    state.menuItems?.forEach(item => {
      if (item.category) {
        uniqueCategories.set(item.category.name, item.category);
      }
    });
    return Array.from(uniqueCategories.values());
  }, [state.menuItems]);

  const categories = Object.keys(groupedItems);
  const itemCounts = Object.keys(groupedItems).reduce((counts, category) => {
    counts[category] = groupedItems[category].length;
    return counts;
  }, {});

  // Handle category change
  const handleCategoryChange = (category) => {
    setActiveCategory(category);
  };

  // Filter items based on active category and search query
  useEffect(() => {
    let items = state.menuItems || [];

    // Filter by category
    if (activeCategory) {
      items = groupedItems[activeCategory] || [];
    }

    // Filter by search query
    if (searchQuery) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    setFilteredItems(items);
  }, [activeCategory, searchQuery, state.menuItems, groupedItems]);

  // Show loading state
  if (state.loading.menuItems) {
    return (
      <Container maxW="container.xl" py={8}>
        <VStack spacing={4}>
          <Spinner size="xl" color="pos.500" />
          <Text color="gray.600">Loading menu items...</Text>
        </VStack>
      </Container>
    );
  }

  // Show empty state
  if (!state.menuItems || state.menuItems.length === 0) {
    return (
      <>
        <Container maxW="container.md" py={8}>
          <Alert status="warning" borderRadius="lg">
            <AlertIcon />
            <Box>
              <AlertTitle>No Menu Items Found</AlertTitle>
              <Text>No menu items available{state.selectedRestaurant ? ` for ${state.selectedRestaurant.name}` : ''}.</Text>
            </Box>
          </Alert>
        </Container>
        <MobileBottomNav />
      </>
    );
  }

  const handleAddToCart = (menuItem) => {
    // POSContext expects (menuItem, quantity, specialInstructions)
    addToCart(menuItem, 1, '');
  };

  // Main content with menu items
  const mainContent = (
    <Box h="full" display="flex" flexDirection="column">
      {/* Search and View Mode Toggle */}
      <HStack justify="space-between" px={4} py={3} borderBottomWidth="1px" borderColor="gray.100" spacing={3} flexWrap="wrap">
        {/* Search Input */}
        <InputGroup size="md" flex={1}>
          <InputLeftElement pointerEvents="none" h="40px">
            <Search size={18} color="gray" />
          </InputLeftElement>
          <Input
            placeholder="Search menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            borderRadius="md"
            h="40px"
            fontSize="sm"
          />
        </InputGroup>

        {/* View Mode Buttons */}
        <ButtonGroup size="md" isAttached variant="outline">
          <Tooltip label="Grid View">
            <IconButton
              icon={<Grid3x3 size={18} />}
              onClick={() => setViewMode('grid')}
              colorScheme={viewMode === 'grid' ? 'pos' : 'gray'}
              variant={viewMode === 'grid' ? 'solid' : 'outline'}
              h="40px"
            />
          </Tooltip>
          <Tooltip label="Compact View">
            <IconButton
              icon={<LayoutGrid size={18} />}
              onClick={() => setViewMode('compact')}
              colorScheme={viewMode === 'compact' ? 'pos' : 'gray'}
              variant={viewMode === 'compact' ? 'solid' : 'outline'}
              h="40px"
            />
          </Tooltip>
          <Tooltip label="List View">
            <IconButton
              icon={<List size={18} />}
              onClick={() => setViewMode('list')}
              colorScheme={viewMode === 'list' ? 'pos' : 'gray'}
              variant={viewMode === 'list' ? 'solid' : 'outline'}
              h="40px"
            />
          </Tooltip>
        </ButtonGroup>

        {/* Sold Out Mode Toggle */}
        <FormControl display="flex" alignItems="center" ml={2}>
          <FormLabel htmlFor="sold-out-mode" mb="0" fontSize="sm" color="gray.600">
            Manage Sold Out
          </FormLabel>
          <Switch
            id="sold-out-mode"
            colorScheme="red"
            size="md"
            isChecked={soldOutMode}
            onChange={(e) => setSoldOutMode(e.target.checked)}
          />
        </FormControl>
      </HStack>

      {/* Top sellers quick-add — hides itself when there's no sales history */}
      <TopSellersRail onAdd={handleAddToCart} />

      {/* Menu Items Grid */}
      <Box flex="1" overflow="auto">
        <CompactMenuGrid
          items={filteredItems}
          onAddToCart={handleAddToCart}
          isLoading={state.loading.menuItems}
          viewMode={viewMode}
          soldOutMode={soldOutMode}
        />
      </Box>
    </Box>
  );

  // Desktop/Tablet Split Layout
  if (useSplitLayout) {
    return (
      <Box h="full" overflow="hidden">
        <SplitScreenLayout
          sidebar={
            <MenuSidebarPane
              categories={categories}
              categoriesData={categoriesData}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              itemCounts={itemCounts}
            />
          }
          main={mainContent}
          rightPanel={<TabbedCartPanel />}
          mobileDrawer={
            <MinimalCartDrawer
              isOpen={isCartOpen}
              onClose={onCartClose}
            />
          }
          showSidebar={true}
          showRightPanel={true}
          sidebarWidth="220px"
          rightPanelWidth="350px"
        />

        {/* Mobile Components */}
        {!showDesktopCart && (
          <>
            <MobileHeader onOpenCart={onCartOpen} />
            <FloatingCartButton
              onOpenCart={onCartOpen}
              isVisible={false} // Hide floating button when header cart is visible
            />
          </>
        )}

        <MobileBottomNav />
      </Box>
    );
  }

  // Mobile Layout (fallback)
  return (
    <Box h="full" display="flex" flexDirection="column">
      {/* Mobile Header */}
      <MobileHeader onOpenCart={onCartOpen} />

      {/* Category Navigation for Mobile */}
      {/* <CategoryNavBar
        categories={categories}
        categoriesData={categoriesData}
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        itemCounts={itemCounts}
      /> */}

      {mainContent}

      {/* Mobile Components */}
      <FloatingCartButton
        onOpenCart={onCartOpen}
        isVisible={true}
      />

      <MinimalCartDrawer
        isOpen={isCartOpen}
        onClose={onCartClose}
      />

      <MobileBottomNav />
    </Box>
  );
};

export default MenuView;
