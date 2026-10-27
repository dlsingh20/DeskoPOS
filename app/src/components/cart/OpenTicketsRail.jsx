import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  useColorModeValue,
  useToast,
  Divider,
} from '@chakra-ui/react';
import { PauseCircle, Utensils, ArrowRight } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import OrderDetailPanel from '../orders/OrderDetailPanel';

// Active order statuses that mean "this table still has a live ticket".
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served'];

// Compact elapsed-time label from an ISO timestamp ("just now" → "1h 20m").
const elapsedLabel = (iso, now) => {
  if (!iso) return '';
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return '';
  const mins = Math.max(0, Math.floor((now - start) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

/**
 * OpenTicketsRail — the left-rail "ticket switcher" of the service screen.
 *
 * Two honest sections:
 *  - Parked: held (unsaved) carts that resume straight back into the cart.
 *  - In service: tables with a live server order — tap to open that order in
 *    the canonical OrderDetailPanel (view/edit items, status, take payment)
 *    without leaving the menu page.
 */
const OpenTicketsRail = () => {
  const { state, resumeHeldOrder, selectTable, loadOrders, formatPrice } = usePOS();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [detailOrder, setDetailOrder] = useState(null);

  const bg = useColorModeValue('white', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.700');
  const parkedBg = useColorModeValue('orange.50', 'orange.900');
  const serviceBg = useColorModeValue('blue.50', 'blue.900');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const restaurantId = state.selectedRestaurant?.id;

  // Pull live orders for this restaurant so "In service" is accurate, then
  // keep it fresh on a light 30s cadence (matches the app's refresh rhythm).
  useEffect(() => {
    if (!restaurantId) return undefined;
    loadOrders({ restaurant_id: restaurantId });
    const id = setInterval(() => {
      loadOrders({ restaurant_id: restaurantId });
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(id);
  }, [restaurantId, loadOrders]);

  const held = state.heldOrders || [];

  // Occupied tables: newest active order per table_number.
  const inService = useMemo(() => {
    const byTable = new Map();
    (state.orders || []).forEach((order) => {
      const tableNo = order.table_number;
      if (!tableNo) return;
      if (!ACTIVE_STATUSES.includes(order.status)) return;
      const existing = byTable.get(tableNo);
      const t = new Date(order.order_time || order.created_at).getTime();
      if (!existing || t > existing._t) byTable.set(tableNo, { ...order, _t: t });
    });
    return Array.from(byTable.values()).sort((a, b) => a._t - b._t);
  }, [state.orders]);

  const handleResume = useCallback((index, ticket) => {
    resumeHeldOrder(index);
    if (ticket?.table) selectTable(ticket.table);
    toast({
      title: 'Ticket resumed',
      description: 'Held order loaded back into the cart',
      status: 'success',
      duration: 2500,
      isClosable: true,
    });
  }, [resumeHeldOrder, selectTable, toast]);

  const handleOpenOrder = useCallback((order) => {
    // Keep table context in sync, then open the order in the canonical panel.
    const table = (state.tables || []).find((t) => t.table_number === order.table_number);
    if (table) selectTable(table);
    setDetailOrder(order);
  }, [state.tables, selectTable]);

  const nothingOpen = held.length === 0 && inService.length === 0;

  return (
    <Box
      bg={bg}
      borderBottomWidth="1px"
      borderColor={border}
      px={2}
      py={2}
      maxH="42%"
      overflowY="auto"
    >
      <HStack justify="space-between" px={1} mb={1}>
        <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color={muted} textTransform="uppercase">
          Open Tickets
        </Text>
        <Badge colorScheme="gray" fontSize="10px" borderRadius="full">
          {held.length + inService.length}
        </Badge>
      </HStack>

      {nothingOpen && (
        <Text fontSize="xs" color={muted} px={1} py={2}>
          No open tickets. Held orders and occupied tables show up here.
        </Text>
      )}

      {held.length > 0 && (
        <VStack align="stretch" spacing={1.5} mb={inService.length > 0 ? 2 : 0}>
          <HStack px={1} spacing={1} color="orange.500">
            <PauseCircle size={12} />
            <Text fontSize="10px" fontWeight="600" textTransform="uppercase" letterSpacing="0.06em">
              Parked ({held.length})
            </Text>
          </HStack>
          {held.map((ticket, index) => {
            const items = ticket.cart?.length || 0;
            const label = ticket.table?.table_number
              ? `Table ${ticket.table.table_number}`
              : (ticket.orderType === 'takeaway' ? 'Takeaway' : 'Ticket');
            return (
              <Box
                key={ticket.timestamp || index}
                bg={parkedBg}
                borderWidth="1px"
                borderColor={border}
                borderRadius="md"
                px={2}
                py={1.5}
              >
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs" fontWeight="600" noOfLines={1}>{label}</Text>
                  <Text fontSize="xs" color={muted} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatPrice(ticket.total || 0)}
                  </Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="10px" color={muted}>
                    {items} {items === 1 ? 'item' : 'items'} · {elapsedLabel(ticket.timestamp, now)}
                  </Text>
                  <Button
                    size="xs"
                    variant="solid"
                    colorScheme="orange"
                    h="22px"
                    fontSize="10px"
                    onClick={() => handleResume(index, ticket)}
                  >
                    Resume
                  </Button>
                </HStack>
              </Box>
            );
          })}
        </VStack>
      )}

      {held.length > 0 && inService.length > 0 && <Divider mb={2} />}

      {inService.length > 0 && (
        <VStack align="stretch" spacing={1.5}>
          <HStack px={1} spacing={1} color="blue.500">
            <Utensils size={12} />
            <Text fontSize="10px" fontWeight="600" textTransform="uppercase" letterSpacing="0.06em">
              In service ({inService.length})
            </Text>
          </HStack>
          {inService.map((order) => (
            <Box
              key={order.id}
              as="button"
              textAlign="left"
              bg={serviceBg}
              borderWidth="1px"
              borderColor={border}
              borderRadius="md"
              px={2}
              py={1.5}
              _hover={{ borderColor: 'blue.400' }}
              onClick={() => handleOpenOrder(order)}
            >
              <HStack justify="space-between" mb={1}>
                <Text fontSize="xs" fontWeight="600" noOfLines={1}>
                  Table {order.table_number}
                </Text>
                <Text fontSize="xs" color={muted} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatPrice(order.total_amount || 0)}
                </Text>
              </HStack>
              <HStack justify="space-between">
                <Text fontSize="10px" color={muted}>
                  #{order.order_number} · {elapsedLabel(order.order_time || order.created_at, now)}
                </Text>
                <HStack spacing={0.5} color="blue.400">
                  <Text fontSize="10px" fontWeight="600">Open</Text>
                  <ArrowRight size={11} />
                </HStack>
              </HStack>
            </Box>
          ))}
        </VStack>
      )}

      {/* Canonical order view/edit panel — same surface used on every page */}
      {detailOrder && (
        <OrderDetailPanel
          order={detailOrder}
          isOpen={!!detailOrder}
          onClose={() => {
            setDetailOrder(null);
            if (restaurantId) loadOrders({ restaurant_id: restaurantId });
          }}
          onRefresh={() => { if (restaurantId) loadOrders({ restaurant_id: restaurantId }); }}
        />
      )}
    </Box>
  );
};

export default OpenTicketsRail;
