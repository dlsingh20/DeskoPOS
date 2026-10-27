import React, { useState } from 'react';
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useColorModeValue,
} from '@chakra-ui/react';
import { usePOS } from '../../context/POSContext';
import InventoryDashboard from './InventoryDashboard';
import IngredientsPanel from './IngredientsPanel';
import RecipePanel from './RecipePanel';
import StockLevelsPanel from './StockLevelsPanel';
import InventoryReports from './InventoryReports';

const InventoryView = () => {
  const { state } = usePOS();
  const [tabIndex, setTabIndex] = useState(0);
  const restaurantId = state.selectedRestaurant?.id;

  const bg = useColorModeValue('gray.50', 'gray.900');
  const tabBg = useColorModeValue('white', 'gray.800');

  return (
    <Box h="full" bg={bg} overflow="auto">
      <Box maxW="1400px" mx="auto" p={4}>
        <Tabs
          index={tabIndex}
          onChange={setTabIndex}
          variant="soft-rounded"
          colorScheme="blue"
          isLazy
        >
          <TabList
            bg={tabBg}
            p={2}
            borderRadius="xl"
            boxShadow="sm"
            mb={4}
            overflowX="auto"
            flexWrap="nowrap"
          >
            <Tab fontSize="sm" fontWeight="500">Dashboard</Tab>
            <Tab fontSize="sm" fontWeight="500">Ingredients</Tab>
            <Tab fontSize="sm" fontWeight="500">Recipes</Tab>
            <Tab fontSize="sm" fontWeight="500">Stock</Tab>
            <Tab fontSize="sm" fontWeight="500">Reports</Tab>
          </TabList>

          <TabPanels>
            <TabPanel p={0}>
              <InventoryDashboard restaurantId={restaurantId} />
            </TabPanel>
            <TabPanel p={0}>
              <IngredientsPanel />
            </TabPanel>
            <TabPanel p={0}>
              <RecipePanel restaurantId={restaurantId} />
            </TabPanel>
            <TabPanel p={0}>
              <StockLevelsPanel restaurantId={restaurantId} />
            </TabPanel>
            <TabPanel p={0}>
              <InventoryReports restaurantId={restaurantId} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Box>
  );
};

export default InventoryView;
