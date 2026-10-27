import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  Text,
  Badge,
  SimpleGrid,
  Skeleton,
  Alert,
  AlertIcon,
  Button,
  Center,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { Plus, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePOS } from '../../context/POSContext';
import { useAccess } from '../../context/AccessContext';
import orderService from '../../services/OrderService';
import thirdPartyService from '../../services/ThirdPartyService';
import OrderActionToolbar from './OrderActionToolbar';
import TableCard from './TableCard';
import OrderModal from './OrderModal';
import MergeTableDialog from './MergeTableDialog';
import MoveItemsDialog from './MoveItemsDialog';
import AddTableDialog from './AddTableDialog';
import useOrderActions from './useOrderActions';
import SettlePaymentModal from '../payment/SettlePaymentModal';
import {
  compareTables,
  getOrderStartTime,
  getShortOrderNumber,
  getTableLabel,
  groupOrdersByTable,
  isDineInOrder,
  isTakeawayOrder,
} from '../../utils/fineDineUtils';

const REFRESH_INTERVAL_MS = 15000;
const CLOCK_INTERVAL_MS = 30000;
const GRID_MIN_CARD_WIDTH = '128px';

const SectionHeader = ({ title, count, accent }) => {
  const badgeBg = useColorModeValue('gray.100', 'gray.700');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  return (
    <HStack spacing={3} mb={4}>
      <Box w="4px" h="18px" bg={accent} borderRadius="full" />
      <Text as="h2" fontSize="sm" fontWeight="800" letterSpacing="0.08em">{title}</Text>
      <Badge bg={badgeBg} borderRadius="full" px={2} fontSize="xs" aria-label={`${count} active orders`}>{count}</Badge>
      <Box flex={1} h="1px" bg={lineColor} />
    </HStack>
  );
};

/**
 * Fine Dine home screen: Dine In tables and Take Away orders, with the action toolbar.
 */
const FineDineDashboard = () => {
  const { state, loadTables, formatPrice } = usePOS();
  const { can } = useAccess();
  const canSettle = can('bill.settle');
  const navigate = useNavigate();
  const restaurant = state.selectedRestaurant;

  const bg = useColorModeValue('gray.50', 'gray.900');
  const newTileBorder = useColorModeValue('gray.300', 'gray.600');
  const newTileColor = useColorModeValue('gray.500', 'gray.400');

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [liveOrders, setLiveOrders] = useState({ configured: false, count: 0 });

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [modal, setModal] = useState(null); // { table, orderType, orderId, mode }
  const [settleOrderId, setSettleOrderId] = useState(null);

  const loadingRef = useRef(false);

  // ---- Data ----------------------------------------------------------------

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!restaurant?.id || loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setLoadingOrders(true);
    try {
      const [openOrders] = await Promise.all([
        orderService.getOpenOrders(restaurant.id),
        loadTables(restaurant.id),
      ]);
      setOrders(openOrders);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (error) {
      setLoadError(error.message || 'Could not load orders');
    } finally {
      loadingRef.current = false;
      setLoadingOrders(false);
    }
    // loadTables is recreated every render by the context; restaurant id is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  useEffect(() => {
    setOrders([]);
    setLastUpdated(null);
    setMergeMode(false);
    setMergeSelection([]);
    refresh();
  }, [refresh]);

  // Background refresh; skipped while a dialog is open so data doesn't shift under the user
  const dialogOpen = !!modal || !!settleOrderId || mergeOpen || moveOpen || addTableOpen;
  useEffect(() => {
    if (dialogOpen) return undefined;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    }, REFRESH_INTERVAL_MS);
    const onFocus = () => refresh({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, dialogOpen]);

  // Ticking clock for durations
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!restaurant?.id) return;
    let cancelled = false;
    Promise.all([
      thirdPartyService.getIntegrationStatus(restaurant.id),
      thirdPartyService.getLiveOrders(restaurant.id),
    ]).then(([integration, live]) => {
      if (!cancelled) setLiveOrders({ configured: integration.configured, count: live.length });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [restaurant?.id, lastUpdated]);

  const tables = useMemo(() => [...(state.tables || [])].sort(compareTables), [state.tables]);
  const dineInOrders = useMemo(() => orders.filter(isDineInOrder), [orders]);
  const takeawayOrders = useMemo(
    () => orders.filter(isTakeawayOrder).sort((a, b) => new Date(getOrderStartTime(a)) - new Date(getOrderStartTime(b))),
    [orders]
  );
  const ordersByTable = useMemo(() => groupOrdersByTable(dineInOrders, tables), [dineInOrders, tables]);

  // ---- Actions -------------------------------------------------------------

  const handleOrderChanged = useCallback(() => refresh({ silent: true }), [refresh]);
  const { busy, printKOT, sendToKitchen } = useOrderActions({ onOrderChanged: handleOrderChanged });

  const handleTableClick = (table) => {
    if (mergeMode) {
      if (table.status === 'out_of_order') return;
      setMergeSelection((prev) => (prev.includes(table.id) ? prev.filter((id) => id !== table.id) : [...prev, table.id]));
      return;
    }
    const tableOrders = ordersByTable[table.id] || [];
    setModal({ table, orderType: 'dine_in', orderId: tableOrders[0]?.id ?? null, mode: 'edit' });
  };

  const toggleMergeMode = () => {
    setMergeMode((on) => !on);
    setMergeSelection([]);
  };

  const closeModal = () => {
    setModal(null);
    refresh({ silent: true });
  };

  // ---- Render --------------------------------------------------------------

  if (!restaurant) {
    return (
      <Center h="full" bg={bg}>
        <Alert status="info" borderRadius="12px" maxW="md">
          <AlertIcon />
          Select a restaurant from the header to see its tables.
        </Alert>
      </Center>
    );
  }

  const initialLoading = loadingOrders && !lastUpdated;

  return (
    <Flex direction="column" h="full" bg={bg}>
      <OrderActionToolbar
        mergeMode={mergeMode}
        mergeSelectionCount={mergeSelection.length}
        onToggleMerge={toggleMergeMode}
        onConfirmMerge={() => setMergeOpen(true)}
        onMoveItems={() => setMoveOpen(true)}
        liveOrders={liveOrders}
        onLiveOrders={() => navigate('/third-party')}
        onAddTable={can('settings.manage') ? () => setAddTableOpen(true) : null}
        onRefresh={() => refresh()}
        refreshing={loadingOrders}
        lastUpdated={lastUpdated}
      />

      <Box flex={1} overflowY="auto" px={{ base: 3, md: 6 }} py={5}>
        {loadError && (
          <Alert status="error" borderRadius="12px" mb={4}>
            <AlertIcon />
            <Box flex={1}>
              {lastUpdated ? 'Could not refresh — showing data from ' + lastUpdated.toLocaleTimeString() + '. ' : 'Could not load orders. '}
              {loadError}
            </Box>
            <Button size="sm" onClick={() => refresh()} ml={3}>Retry</Button>
          </Alert>
        )}

        {/* DINE IN */}
        <Box as="section" aria-label="Dine in tables" mb={8}>
          <SectionHeader title="DINE IN" count={dineInOrders.length} accent="blue.500" />
          {initialLoading && tables.length === 0 ? (
            <SimpleGrid minChildWidth={GRID_MIN_CARD_WIDTH} spacing={4}>
              {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} h="112px" borderRadius="14px" />)}
            </SimpleGrid>
          ) : tables.length === 0 ? (
            <VStack py={10} spacing={3}>
              <Text color="gray.500">This restaurant has no tables yet.</Text>
              <Button size="sm" leftIcon={<Plus size={16} />} onClick={() => setAddTableOpen(true)}>Add table</Button>
            </VStack>
          ) : (
            <SimpleGrid minChildWidth={GRID_MIN_CARD_WIDTH} spacingX={4} spacingY={3}>
              {tables.map((table) => {
                const tableOrders = ordersByTable[table.id] || [];
                return (
                  <TableCard
                    key={table.id}
                    title={getTableLabel(table)}
                    tableStatus={table.status}
                    orders={tableOrders}
                    now={now}
                    formatPrice={formatPrice}
                    selectable={mergeMode}
                    selected={mergeSelection.includes(table.id)}
                    disabled={table.status === 'out_of_order' && tableOrders.length === 0}
                    busyAction={tableOrders[0] ? busy[tableOrders[0].id] : null}
                    onClick={() => handleTableClick(table)}
                    onPrintKOT={(order) => printKOT(order)}
                    onSendToKitchen={(order) => sendToKitchen(order)}
                    onView={(order) => setModal({ table, orderType: 'dine_in', orderId: order.id, mode: 'view' })}
                    onSettle={canSettle ? (order) => setSettleOrderId(order.id) : undefined}
                  />
                );
              })}
            </SimpleGrid>
          )}
        </Box>

        {/* TAKE AWAY */}
        <Box as="section" aria-label="Take away orders" opacity={mergeMode ? 0.4 : 1} pointerEvents={mergeMode ? 'none' : 'auto'}>
          <SectionHeader title="TAKE AWAY" count={takeawayOrders.length} accent="orange.400" />
          <SimpleGrid minChildWidth={GRID_MIN_CARD_WIDTH} spacingX={4} spacingY={3}>
            <Box
              as="button"
              h="112px"
              borderWidth="1.5px"
              borderStyle="dashed"
              borderColor={newTileBorder}
              borderRadius="14px"
              color={newTileColor}
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              gap={1}
              _hover={{ borderColor: 'blue.400', color: 'blue.500' }}
              _focusVisible={{ outline: '2px solid', outlineColor: 'blue.400', outlineOffset: '2px' }}
              onClick={() => setModal({ table: null, orderType: 'takeaway', orderId: null, mode: 'edit' })}
            >
              <Plus size={20} />
              <Text fontSize="xs" fontWeight="600">New takeaway</Text>
            </Box>
            {takeawayOrders.map((order) => (
              <TableCard
                key={order.id}
                title={getShortOrderNumber(order)}
                subtitle={order.customer_name || null}
                orders={[order]}
                now={now}
                formatPrice={formatPrice}
                busyAction={busy[order.id]}
                onClick={() => setModal({ table: null, orderType: order.type, orderId: order.id, mode: 'edit' })}
                onPrintKOT={(o) => printKOT(o)}
                onSendToKitchen={(o) => sendToKitchen(o)}
                onView={(o) => setModal({ table: null, orderType: o.type, orderId: o.id, mode: 'view' })}
                onSettle={canSettle ? (o) => setSettleOrderId(o.id) : undefined}
              />
            ))}
          </SimpleGrid>
          {!initialLoading && takeawayOrders.length === 0 && (
            <HStack spacing={2} color="gray.500" mt={3} fontSize="sm">
              <ShoppingBag size={14} />
              <Text>No open takeaway orders.</Text>
            </HStack>
          )}
        </Box>
      </Box>

      {modal && (
        <OrderModal
          isOpen
          onClose={closeModal}
          restaurant={restaurant}
          table={modal.table}
          orderType={modal.orderType}
          orderId={modal.orderId}
          initialMode={modal.mode}
          onChanged={handleOrderChanged}
        />
      )}

      {settleOrderId && (
        <SettlePaymentModal
          isOpen
          orderId={settleOrderId}
          onClose={() => {
            setSettleOrderId(null);
            // A discount may have changed the bill in the payment popup
            refresh({ silent: true });
          }}
          onSettled={() => refresh({ silent: true })}
        />
      )}

      <MergeTableDialog
        isOpen={mergeOpen}
        onClose={() => setMergeOpen(false)}
        selectedTables={tables.filter((t) => mergeSelection.includes(t.id))}
        ordersByTable={ordersByTable}
        formatPrice={formatPrice}
      />

      <MoveItemsDialog
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        tables={tables}
        ordersByTable={ordersByTable}
        formatPrice={formatPrice}
      />

      <AddTableDialog
        isOpen={addTableOpen}
        onClose={() => setAddTableOpen(false)}
        restaurant={restaurant}
        existingTables={tables}
        onCreated={() => refresh({ silent: true })}
      />
    </Flex>
  );
};

export default FineDineDashboard;
