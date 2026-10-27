import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Center,
  HStack,
  Icon,
  Progress,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { Inbox } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useAccess } from '../../context/AccessContext';
import { restrictedHistoryStart } from '../../utils/posAccess';
import historyService from '../../services/HistoryService';
import staffService from '../../services/StaffService';
import HistoryToolbar from './HistoryToolbar';
import HistorySummaryCards from './HistorySummaryCards';
import BillsTable from './BillsTable';
import { exportHistoryToExcel } from './exportHistory';
import {
  BILL_TYPES,
  DATE_PRESETS,
  PAYMENT_FILTERS,
  PENDING_CATEGORY_LABELS,
  STATUS_FILTERS,
  classifyBill,
  formatDateTime,
  filterBills,
  resolveDateRange,
  resolveTimeZone,
  summarizeBills,
} from '../../utils/historyUtils';

const TABS = [
  { key: 'sales', label: 'Sales History' },
  { key: 'pending', label: 'Pending Bills' },
];

const DEFAULT_FILTERS = {
  status: 'all',
  billType: 'all',
  search: '',
  payment: 'all',
  table: 'all',
  operator: 'all',
  pendingCategory: 'all',
};

// Pending bills can be old, so that tab looks further back by default
const DEFAULT_DATES = {
  sales: { preset: 'today', customFrom: '', customTo: '', customFromTime: '00:00', customToTime: '23:59' },
  pending: { preset: 'last30', customFrom: '', customTo: '', customFromTime: '00:00', customToTime: '23:59' },
};

const HistoryView = () => {
  const { state, formatPrice } = usePOS();
  const { can } = useAccess();
  const fullHistory = can('history.full');
  const canExport = can('history.export');
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'pending' ? 'pending' : 'sales';

  const [filtersByTab, setFiltersByTab] = useState({ sales: DEFAULT_FILTERS, pending: DEFAULT_FILTERS });
  const [datesByTab, setDatesByTab] = useState(DEFAULT_DATES);
  const [dataset, setDataset] = useState({ key: null, orders: [], truncated: false, failed: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [outstanding, setOutstanding] = useState(new Map());
  const [categories, setCategories] = useState(new Map());
  const [staff, setStaff] = useState([]);
  const [shift, setShift] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const tabBarBg = useColorModeValue('orange.50', 'gray.800');
  const tabActiveBg = useColorModeValue('white', 'gray.700');
  const tabActiveColor = useColorModeValue('gray.900', 'white');
  const tabColor = useColorModeValue('orange.800', 'orange.200');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const tableBg = useColorModeValue('white', 'gray.800');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');

  const restaurant = state.selectedRestaurant;
  const timeZone = resolveTimeZone(state.hotelSettings?.timezone);
  const filters = filtersByTab[tab];
  const dates = datesByTab[tab];
  const deferredSearch = useDeferredValue(filters.search);

  // Without full history (cashiers): today only, starting at the last cash counter close if that was today
  const range = useMemo(() => {
    if (fullHistory) return resolveDateRange(dates, timeZone);
    const today = resolveDateRange({ preset: 'today' }, timeZone);
    const from = restrictedHistoryStart(today.from, shift?.shift?.closed_at || null);
    const sinceClose = from > today.from;
    return {
      ...today,
      from,
      restrictedLabel: sinceClose ? `since the last cash counter close (${formatDateTime(from.toISOString(), timeZone)})` : `today (${today.fromDate})`,
    };
  }, [fullHistory, dates, timeZone, shift]);
  // Restricted users wait for the shift lookup so the window is right the first time
  const rangeReady = fullHistory || shift !== null;
  const rangeKey = restaurant && rangeReady ? `${restaurant.id}|${range.from.toISOString()}|${range.to.toISOString()}|${reloadToken}` : null;

  /* ---------------- data loading ---------------- */

  useEffect(() => {
    if (!rangeKey || dataset.key === rangeKey) return;
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setLoadError(null);
    setProgress(null);

    (async () => {
      try {
        // Bills closed (settled, moved to credit, cancelled) in the period
        const { orders, truncated, failed } = await historyService.getClosedBills({
          restaurantId: restaurant.id,
          from: range.from,
          to: range.to,
          onProgress: (done, total) => {
            if (requestId === requestRef.current) setProgress({ done, total });
          },
        });
        if (requestId !== requestRef.current) return;
        setDataset({ key: rangeKey, orders, truncated, failed });
      } catch (error) {
        if (requestId !== requestRef.current) return;
        setLoadError(error.message || 'Could not load bills.');
      } finally {
        if (requestId === requestRef.current) {
          setIsLoading(false);
          setProgress(null);
        }
      }
    })();
    // range is derived from rangeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  // Reference data: credit records, categories, staff names, shift. Failures only reduce detail.
  useEffect(() => {
    if (!restaurant) return;
    historyService.getOutstandingRecords().then(setOutstanding).catch(() => setOutstanding(new Map()));
    historyService.getItemCategories(restaurant.id).then(setCategories).catch(() => setCategories(new Map()));
    historyService.getLastClosedShift().then(setShift);
  }, [restaurant, reloadToken]);

  useEffect(() => {
    staffService.getAllStaff().then(setStaff).catch(() => setStaff([]));
  }, []);

  /* ---------------- derived data ---------------- */

  const staffNames = useMemo(() => new Map(staff.map((s) => [String(s.id), s.name])), [staff]);
  const staffName = useCallback((id) => (id == null ? '—' : staffNames.get(String(id)) || `Staff #${id}`), [staffNames]);
  const itemCategory = useCallback((menuItemId) => categories.get(menuItemId) || '', [categories]);

  const allBills = useMemo(() => dataset.orders
    .map((order) => classifyBill(order, outstanding.get(order.id) || null))
    .sort((a, b) => new Date(b.closedAt || b.orderTime || 0) - new Date(a.closedAt || a.orderTime || 0)), [dataset.orders, outstanding]);

  const activeFilters = useMemo(() => ({ ...filters, search: deferredSearch, tab }), [filters, deferredSearch, tab]);
  const bills = useMemo(() => filterBills(allBills, activeFilters), [allBills, activeFilters]);
  const summary = useMemo(() => summarizeBills(bills), [bills]);


  const tableOptions = useMemo(() => Array.from(new Set(allBills.map((b) => b.tableLabel).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [allBills]);
  const operatorOptions = useMemo(() => {
    const ids = new Set();
    allBills.forEach((b) => { if (b.serverId != null) ids.add(String(b.serverId)); if (b.settledById != null) ids.add(String(b.settledById)); });
    return Array.from(ids).map((id) => ({ id, name: staffName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allBills, staffName]);

  /* ---------------- actions ---------------- */

  const setTab = (key) => setSearchParams(key === 'pending' ? { tab: 'pending' } : {}, { replace: true });
  const updateFilters = (patch) => setFiltersByTab((prev) => ({ ...prev, [tab]: { ...prev[tab], ...patch } }));
  const updateDates = (patch) => setDatesByTab((prev) => {
    const next = { ...prev[tab], ...patch };
    // Starting a custom range from the current preset's dates is less surprising than empty inputs
    if (patch.preset === 'custom' && !prev[tab].customFrom) {
      next.customFrom = range.fromDate;
      next.customTo = range.toDate;
    }
    return { ...prev, [tab]: next };
  });
  const refresh = () => setReloadToken((t) => t + 1);

  const loadDetail = async (orderId) => {
    const detail = await historyService.getOrderDetail(orderId);
    setDataset((prev) => ({ ...prev, orders: prev.orders.map((o) => (o.id === orderId ? { ...o, ...detail } : o)) }));
  };

  const filterLabel = () => {
    const parts = [];
    if (tab === 'sales' && filters.status !== 'all') parts.push(`Status: ${STATUS_FILTERS.find((s) => s.key === filters.status)?.label}`);
    if (tab === 'pending' && filters.pendingCategory !== 'all') parts.push(`Pending type: ${PENDING_CATEGORY_LABELS[filters.pendingCategory]}`);
    if (filters.billType !== 'all') parts.push(`Bill type: ${BILL_TYPES.find((t) => t.key === filters.billType)?.label}`);
    if (filters.payment !== 'all') parts.push(`Payment: ${PAYMENT_FILTERS.find((p) => p.key === filters.payment)?.label}`);
    if (filters.table !== 'all') parts.push(`Table: ${filters.table}`);
    if (filters.operator !== 'all') parts.push(`Operator: ${staffName(filters.operator)}`);
    if (filters.search) parts.push(`Search: "${filters.search}"`);
    return parts.join('; ');
  };

  const handleExport = () => {
    setIsExporting(true);
    try {
      exportHistoryToExcel({
        bills,
        summary,
        timeZone,
        staffName,
        itemCategory,
        meta: {
          tab,
          tabLabel: TABS.find((t) => t.key === tab).label,
          restaurantName: restaurant?.name,
          rangeLabel: range.label,
          fileRange: range.fromDate === range.toDate ? range.fromDate : `${range.fromDate}_to_${range.toDate}`,
          filterLabel: filterLabel(),
        },
      });
      toast({ title: 'Excel file ready', description: `${bills.length} bills exported.`, status: 'success', duration: 3000 });
    } catch (error) {
      toast({ title: 'Export failed', description: error.message, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setIsExporting(false);
    }
  };

  /* ---------------- render ---------------- */

  if (!restaurant) {
    return (
      <Center h="full" bg={pageBg}>
        <Text color={mutedColor}>Select a restaurant to see its bill history.</Text>
      </Center>
    );
  }

  const hasData = dataset.key === rangeKey;
  const presetLabel = DATE_PRESETS.find((p) => p.key === dates.preset)?.label;

  return (
    <Box h="full" bg={pageBg} display="flex" flexDirection="column" minH={0}>
      {/* Secondary tabs */}
      <HStack as="nav" aria-label="History sections" spacing={1} px={{ base: 3, md: 4 }} pt={2} bg={tabBarBg} borderBottom="1px solid" borderColor={lineColor} role="tablist">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Box
              key={t.key}
              as="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              px={4}
              py={2}
              borderTopRadius="10px"
              bg={active ? tabActiveBg : 'transparent'}
              color={active ? tabActiveColor : tabColor}
              fontWeight={active ? '700' : '600'}
              fontSize="sm"
              border="1px solid"
              borderColor={active ? lineColor : 'transparent'}
              borderBottomColor={active ? tabActiveBg : 'transparent'}
              mb="-1px"
              _focusVisible={{ outline: '2px solid', outlineColor: 'orange.400' }}
            >
              {t.label}
            </Box>
          );
        })}
      </HStack>

      <HistoryToolbar
        tab={tab}
        filters={filters}
        onChange={updateFilters}
        dateRange={dates}
        onDateChange={updateDates}
        tableOptions={tableOptions}
        operatorOptions={operatorOptions}
        onRefresh={refresh}
        isLoading={isLoading}
        onExport={handleExport}
        isExporting={isExporting}
        exportDisabled={!hasData || isLoading || bills.length === 0}
        canExport={canExport}
        dateLocked={fullHistory ? null : range.restrictedLabel}
        shift={shift}
        timeZone={timeZone}
      />

      <Text px={{ base: 3, md: 4 }} pt={2} fontSize="xs" color={mutedColor}>
        {tab === 'pending'
          ? 'Bills still awaiting collection or payment confirmation, closed '
          : 'Completed, credit, cancelled and refunded bills closed '}
        {!fullHistory ? range.restrictedLabel
          : presetLabel === 'Custom range' ? `between ${range.label}` : `${presetLabel?.toLowerCase()} (${range.fromDate === range.toDate ? range.fromDate : `${range.fromDate} to ${range.toDate}`})`}
        {` · ${timeZone}`}
      </Text>

      {hasData && dataset.truncated && (
        <Alert status="warning" mx={4} mt={2} borderRadius="8px" py={2} w="auto">
          <AlertIcon />
          <AlertDescription fontSize="sm">This range has more than 5,000 orders, so only the newest were loaded. Choose a shorter date range for complete figures.</AlertDescription>
        </Alert>
      )}
      {hasData && dataset.failed > 0 && (
        <Alert status="warning" mx={4} mt={2} borderRadius="8px" py={2} w="auto">
          <AlertIcon />
          <AlertDescription fontSize="sm">{dataset.failed} bill(s) could not be fully loaded; their payments or items may be missing. Reload to try again.</AlertDescription>
        </Alert>
      )}

      {hasData && <HistorySummaryCards summary={summary} formatPrice={formatPrice} tab={tab} statusFilter={filters.status} />}

      <Box flex={1} minH={0} mx={{ base: 3, md: 4 }} mb={3} mt={hasData ? 0 : 3} bg={tableBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflow="hidden" display="flex" flexDirection="column">
        {isLoading && (
          <Center flex={1} py={12}>
            <VStack spacing={3} w="260px">
              <Spinner color="orange.500" />
              <Text fontSize="sm" color={mutedColor}>
                {progress ? `Loading bill details ${progress.done} of ${progress.total}…` : 'Loading bills…'}
              </Text>
              {progress && <Progress value={(progress.done / progress.total) * 100} size="xs" w="full" colorScheme="orange" borderRadius="full" />}
            </VStack>
          </Center>
        )}

        {!isLoading && loadError && (
          <Center flex={1} py={12}>
            <VStack spacing={3}>
              <Text color="red.500" fontWeight="600">Could not load bills</Text>
              <Text fontSize="sm" color={mutedColor}>{loadError}</Text>
              <Button size="sm" onClick={refresh}>Try again</Button>
            </VStack>
          </Center>
        )}

        {!isLoading && !loadError && hasData && bills.length === 0 && (
          <Center flex={1} py={12}>
            <VStack spacing={2}>
              <Icon as={Inbox} boxSize={8} color={mutedColor} />
              <Text fontWeight="600">{tab === 'pending' ? 'No pending bills' : 'No bills found'}</Text>
              <Text fontSize="sm" color={mutedColor}>
                {allBills.length ? 'No bills match the selected filters.' : 'There are no closed bills in this date range.'}
              </Text>
              {allBills.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => updateFilters({ ...DEFAULT_FILTERS })}>Clear filters</Button>
              )}
            </VStack>
          </Center>
        )}

        {!isLoading && !loadError && hasData && bills.length > 0 && (
          <BillsTable
            bills={bills}
            formatPrice={formatPrice}
            timeZone={timeZone}
            staffName={staffName}
            itemCategory={itemCategory}
            onLoadDetail={loadDetail}
            resetKey={`${tab}|${rangeKey}|${JSON.stringify(activeFilters)}`}
          />
        )}
      </Box>
    </Box>
  );
};

export default HistoryView;
