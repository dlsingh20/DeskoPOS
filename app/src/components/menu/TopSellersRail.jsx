import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  HStack,
  Text,
  Button,
  Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import { TrendingUp } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import ReportService from '../../services/ReportService';

// YYYY-MM-DD for the report date params.
const ymd = (d) => d.toISOString().slice(0, 10);

/**
 * TopSellersRail — a horizontal quick-add rail of the most-ordered items,
 * driven by the real reports API (top_items over the trailing 30 days).
 * Renders nothing until there is genuine sales history, so it never shows a
 * misleading empty rail.
 */
const TopSellersRail = ({ onAdd }) => {
  const { state, formatPrice, getCartItemQuantity } = usePOS();
  const [topIds, setTopIds] = useState([]);

  const bg = useColorModeValue('gray.50', 'gray.900');
  const chipBg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.700');
  const accent = useColorModeValue('green.600', 'green.300');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const restaurantId = state.selectedRestaurant?.id;

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) { setTopIds([]); return undefined; }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    ReportService.getTopSellingItems(ymd(start), ymd(end), 8)
      .then((res) => {
        const payload = res?.data ?? res;
        const items = payload?.items || [];
        if (!cancelled) setTopIds(items.map((i) => i.menu_item_id).filter(Boolean));
      })
      .catch(() => { if (!cancelled) setTopIds([]); });

    return () => { cancelled = true; };
  }, [restaurantId]);

  // Resolve the ranked ids to real, currently-available menu items on this menu.
  const topItems = useMemo(() => {
    if (topIds.length === 0) return [];
    const byId = new Map((state.menuItems || []).map((m) => [m.id, m]));
    return topIds
      .map((id) => byId.get(id))
      .filter((m) => m && (m.is_available === undefined || m.is_available));
  }, [topIds, state.menuItems]);

  if (topItems.length === 0) return null;

  return (
    <Box bg={bg} borderBottomWidth="1px" borderColor={border} px={3} py={2}>
      <HStack spacing={1} mb={1.5} color={accent}>
        <TrendingUp size={13} />
        <Text fontSize="11px" fontWeight="700" textTransform="uppercase" letterSpacing="0.08em">
          Top Sellers
        </Text>
        <Text fontSize="10px" color={muted} fontWeight="500">· last 30 days · tap to add</Text>
      </HStack>
      <HStack spacing={2} overflowX="auto" pb={1} css={{
        '&::-webkit-scrollbar': { height: '4px' },
        '&::-webkit-scrollbar-thumb': { background: 'rgba(150,150,150,0.4)', borderRadius: '4px' },
      }}>
        {topItems.map((item) => {
          const qty = getCartItemQuantity(item.id);
          return (
            <Button
              key={item.id}
              flexShrink={0}
              size="sm"
              variant="outline"
              bg={chipBg}
              borderColor={border}
              h="auto"
              py={1.5}
              px={2.5}
              onClick={() => onAdd(item)}
              _hover={{ borderColor: accent }}
              position="relative"
            >
              <HStack spacing={2}>
                <Text fontSize="xs" fontWeight="600" noOfLines={1} maxW="120px">
                  {item.name}
                </Text>
                <Text fontSize="xs" color={accent} fontWeight="700">
                  {formatPrice(item.price)}
                </Text>
              </HStack>
              {qty > 0 && (
                <Badge
                  position="absolute"
                  top="-6px"
                  right="-6px"
                  colorScheme="green"
                  borderRadius="full"
                  fontSize="10px"
                  minW="18px"
                  textAlign="center"
                >
                  {qty}
                </Badge>
              )}
            </Button>
          );
        })}
      </HStack>
    </Box>
  );
};

export default TopSellersRail;
