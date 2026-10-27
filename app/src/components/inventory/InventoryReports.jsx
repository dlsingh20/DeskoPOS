import React, { useState } from 'react';
import {
  VStack,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  useColorModeValue,
} from '@chakra-ui/react';
import FoodCostReport from './FoodCostReport';
import UsageReport from './UsageReport';
import WasteReport from './WasteReport';
import PurchaseSuggestions from './PurchaseSuggestions';

const InventoryReports = ({ restaurantId }) => {
  const [tabIndex, setTabIndex] = useState(0);
  const tabBg = useColorModeValue('gray.50', 'gray.700');

  return (
    <VStack spacing={4} align="stretch">
      <Tabs
        index={tabIndex}
        onChange={setTabIndex}
        variant="enclosed"
        colorScheme="blue"
        size="sm"
        isLazy
      >
        <TabList bg={tabBg} borderRadius="lg" p={1}>
          <Tab borderRadius="md" fontSize="xs">Food Cost</Tab>
          <Tab borderRadius="md" fontSize="xs">Usage</Tab>
          <Tab borderRadius="md" fontSize="xs">Waste</Tab>
          <Tab borderRadius="md" fontSize="xs">Purchase Suggestions</Tab>
        </TabList>
        <TabPanels>
          <TabPanel p={0} pt={4}>
            <FoodCostReport restaurantId={restaurantId} />
          </TabPanel>
          <TabPanel p={0} pt={4}>
            <UsageReport restaurantId={restaurantId} />
          </TabPanel>
          <TabPanel p={0} pt={4}>
            <WasteReport restaurantId={restaurantId} />
          </TabPanel>
          <TabPanel p={0} pt={4}>
            <PurchaseSuggestions />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
};

export default InventoryReports;
