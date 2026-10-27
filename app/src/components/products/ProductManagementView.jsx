import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Center,
  Flex,
  HStack,
  Icon,
  IconButton,
  Spinner,
  Text,
  Tooltip,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { Boxes, FileSpreadsheet, Percent, RefreshCw, Tags } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import productService, { describeProductError } from '../../services/ProductService';
import { resolveRegionalFormat } from '../../utils/regionalFormat';
import ProductsPanel from './ProductsPanel';
import CategoriesPanel from './CategoriesPanel';
import TaxesPanel from './TaxesPanel';
import taxService from '../../services/TaxService';
import ImportExportPanel from './ImportExportPanel';

const TABS = [
  { key: 'products', label: 'Products', icon: Boxes },
  { key: 'categories', label: 'Categories', icon: Tags },
  { key: 'taxes', label: 'Taxes', icon: Percent },
  { key: 'import', label: 'Import / Export', icon: FileSpreadsheet },
];

/**
 * Product Management (Managers and Administrators): products, categories and
 * import / export for the selected restaurant. Changes refresh the ordering menu.
 */
const ProductManagementView = () => {
  const { state, formatPrice, getCurrencySymbol, loadMenuItems } = usePOS();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'products';
  const restaurant = state.selectedRestaurant;
  const region = useMemo(() => resolveRegionalFormat(state.hotelSettings), [state.hotelSettings]);

  const [data, setData] = useState({ products: [], categories: [], menus: [], taxState: { available: false, taxes: [] } });
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const tabBarBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  const activeColor = useColorModeValue('blue.600', 'blue.300');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!restaurant) return;
    const id = ++requestRef.current;
    if (quiet) setReloading(true); else setLoading(true);
    setError(null);
    try {
      const [products, categories, menus, taxState] = await Promise.all([
        productService.getProducts(restaurant.id),
        productService.getCategories(restaurant.id),
        productService.getMenus(restaurant.id).catch(() => []),
        // listTaxes already reports a missing endpoint as unavailable; anything else is a real error
        taxService.listTaxes(restaurant.id).catch((err) => ({ available: false, taxes: [], error: describeProductError(err, 'Could not load the taxes.') })),
      ]);
      if (id === requestRef.current) setData({ products, categories, menus, taxState });
    } catch (err) {
      if (id === requestRef.current) setError(describeProductError(err, 'Could not load products.'));
    } finally {
      if (id === requestRef.current) { setLoading(false); setReloading(false); }
    }
  }, [restaurant]);

  useEffect(() => { load(); }, [load]);

  /** After any change: reload this screen and the menu used for taking orders */
  const changed = useCallback(() => {
    load({ quiet: true });
    if (restaurant && loadMenuItems) loadMenuItems(restaurant.id);
  }, [load, restaurant, loadMenuItems]);

  if (!restaurant) {
    return <Center h="full" bg={pageBg}><Text color={muted}>Select a restaurant to manage its products.</Text></Center>;
  }

  const common = { products: data.products, categories: data.categories, taxState: data.taxState, formatPrice, onChanged: changed };

  return (
    <Box h="full" overflowY="auto" bg={pageBg}>
      <Box bg={tabBarBg} borderBottom="1px solid" borderColor={lineColor} px={{ base: 4, md: 6 }} pt={4}>
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2}>
          <Box>
            <Text fontSize="xl" fontWeight="700">Product Management</Text>
            <Text fontSize="sm" color={muted}>{restaurant.name} · prices in {region.currency || 'the hotel currency'}</Text>
          </Box>
          <Tooltip label="Reload">
            <IconButton aria-label="Reload products" icon={<RefreshCw size={16} />} size="sm" variant="outline" onClick={() => load({ quiet: true })} isLoading={reloading} />
          </Tooltip>
        </Flex>
        <HStack spacing={1} mt={3} role="tablist" aria-label="Product Management sections">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Button
                key={t.key}
                role="tab"
                aria-selected={active}
                variant="ghost"
                size="sm"
                borderRadius="0"
                borderBottom="2px solid"
                borderColor={active ? activeColor : 'transparent'}
                color={active ? activeColor : undefined}
                leftIcon={<Icon as={t.icon} boxSize={4} />}
                onClick={() => setSearchParams(t.key === 'products' ? {} : { tab: t.key }, { replace: true })}
              >
                {t.label}
                {t.key === 'products' && !loading ? ` (${data.products.length})` : ''}
                {t.key === 'categories' && !loading ? ` (${data.categories.length})` : ''}
                {t.key === 'taxes' && !loading && data.taxState.available ? ` (${data.taxState.taxes.length})` : ''}
              </Button>
            );
          })}
        </HStack>
      </Box>

      <Box maxW="1300px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
        {loading && <Center py={16}><Spinner /></Center>}
        {!loading && error && (
          <Center py={16}>
            <VStack>
              <Text color="red.500" fontWeight="600">Could not load products</Text>
              <Text fontSize="sm" color={muted}>{error}</Text>
              <Button size="sm" onClick={() => load()}>Try again</Button>
            </VStack>
          </Center>
        )}
        {!loading && !error && tab === 'products' && (
          <ProductsPanel {...common} decimals={region.decimals} currencySymbol={getCurrencySymbol ? getCurrencySymbol() : ''} formatPrice={formatPrice} reloading={reloading} />
        )}
        {!loading && !error && tab === 'categories' && (
          <CategoriesPanel {...common} menus={data.menus} restaurant={restaurant} />
        )}
        {!loading && !error && tab === 'taxes' && (
          <TaxesPanel {...common} restaurant={restaurant} decimals={region.decimals} currencySymbol={getCurrencySymbol ? getCurrencySymbol() : ''} />
        )}
        {!loading && !error && tab === 'import' && (
          <ImportExportPanel {...common} menus={data.menus} restaurant={restaurant} decimals={region.decimals} />
        )}
      </Box>
    </Box>
  );
};

export default ProductManagementView;
