import React, { useEffect, useState } from 'react';
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Badge,
  Spinner,
  Center,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { Globe, PlugZap } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import thirdPartyService from '../../services/ThirdPartyService';

/**
 * Third Party tab: incoming aggregator orders (Zomato, Swiggy).
 * Shows a clear "not set up" state until the backend integration exists.
 */
const LiveOrdersView = () => {
  const { state } = usePOS();
  const [status, setStatus] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const bg = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');

  const restaurantId = state.selectedRestaurant?.id;

  useEffect(() => {
    if (!restaurantId) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const [integration, live] = await Promise.all([
          thirdPartyService.getIntegrationStatus(restaurantId),
          thirdPartyService.getLiveOrders(restaurantId),
        ]);
        if (!cancelled) {
          setStatus(integration);
          setOrders(live);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [restaurantId]);

  return (
    <Box h="full" overflowY="auto" bg={bg} px={{ base: 3, md: 6 }} py={5}>
      <HStack spacing={3} mb={4}>
        <Box w="4px" h="18px" bg="cyan.500" borderRadius="full" />
        <Text fontSize="sm" fontWeight="700" letterSpacing="0.06em">LIVE ORDERS</Text>
        {status?.configured && <Badge borderRadius="full" px={2}>{orders.length}</Badge>}
      </HStack>

      {loading ? (
        <Center py={20}><Spinner color="cyan.500" /></Center>
      ) : !status?.configured ? (
        <Center py={16}>
          <VStack spacing={3} maxW="420px" textAlign="center" bg={cardBg} borderWidth="1px" borderColor={borderColor} borderRadius="16px" p={8}>
            <Icon as={PlugZap} boxSize={10} color={mutedColor} />
            <Text fontWeight="700" fontSize="lg">No delivery platform connected</Text>
            <Text fontSize="sm" color={mutedColor}>
              Zomato and Swiggy orders will appear here once the integration is set up on the server.
              Until then, no third-party orders are shown.
            </Text>
            <HStack spacing={2} pt={1}>
              {thirdPartyService.supportedPlatforms.map((p) => (
                <Badge key={p.key} variant="outline" colorScheme="gray">{p.label}</Badge>
              ))}
            </HStack>
          </VStack>
        </Center>
      ) : orders.length === 0 ? (
        <Center py={16}>
          <VStack spacing={2} color={mutedColor}>
            <Icon as={Globe} boxSize={8} />
            <Text fontSize="sm">No live orders right now.</Text>
          </VStack>
        </Center>
      ) : (
        <VStack align="stretch" spacing={2}>
          {orders.map((order) => (
            <Flex key={order.id} bg={cardBg} borderWidth="1px" borderColor={borderColor} borderRadius="12px" p={3} justify="space-between">
              <Text fontWeight="600">{order.platform} · {order.order_number}</Text>
              <Badge>{order.status}</Badge>
            </Flex>
          ))}
        </VStack>
      )}
    </Box>
  );
};

export default LiveOrdersView;
