import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Center,
  Flex,
  Grid,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Progress,
  Select,
  SimpleGrid,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Tfoot,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { ArrowDown, ArrowUp, BarChart3, CalendarDays, FileSpreadsheet, Inbox, RefreshCw, Search } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useAccess } from '../../context/AccessContext';
import historyService from '../../services/HistoryService';
import staffService from '../../services/StaffService';
import printSettingsService from '../../services/PrintSettingsService';
import { downloadXlsx } from '../../utils/xlsxWriter';
import { resolveRegionalFormat } from '../../utils/regionalFormat';
import {
  BILL_TYPES,
  PAYMENT_FILTERS,
  classifyBill,
  describePayments,
  formatDateTime,
  resolveTimeZone,
} from '../../utils/historyUtils';
import {
  REPORTS,
  REPORT_DATE_PRESETS,
  STATUS_OPTIONS,
  computeTotals,
  effectiveStatus,
  filterReportBills,
  resolveReportRange,
} from '../../utils/reportUtils';

const DEFAULT_FILTERS = { status: '', billType: 'all', payment: 'all', table: 'all', server: 'all', category: 'all', search: '' };
const DEFAULT_DATES = { preset: 'yesterday', customFrom: '', customTo: '', customFromTime: '00:00', customToTime: '23:59' };
const GROUPS = Array.from(new Set(REPORTS.map((r) => r.group)));

const ReportsView = () => {
  const { state, formatPrice } = usePOS();
  const { userName } = useAccess();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const reportKey = REPORTS.some((r) => r.key === searchParams.get('report')) ? searchParams.get('report') : 'summary';
  const report = REPORTS.find((r) => r.key === reportKey);

  const [dates, setDates] = useState(DEFAULT_DATES);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dataset, setDataset] = useState({ key: null, orders: [], truncated: false, failed: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [outstanding, setOutstanding] = useState(new Map());
  const [categories, setCategories] = useState(new Map());
  const [staff, setStaff] = useState([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [sort, setSort] = useState(null); // { key, dir }
  const requestRef = useRef(0);

  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  const activeBg = useColorModeValue('blue.50', 'whiteAlpha.100');
  const activeColor = useColorModeValue('blue.700', 'blue.200');
  const headBg = useColorModeValue('gray.50', 'gray.700');
  const sectionBg = useColorModeValue('gray.50', 'whiteAlpha.50');

  const restaurant = state.selectedRestaurant;
  const timeZone = resolveTimeZone(state.hotelSettings?.timezone);
  const region = useMemo(() => resolveRegionalFormat(state.hotelSettings), [state.hotelSettings]);
  const range = useMemo(() => resolveReportRange(dates, timeZone), [dates, timeZone]);
  const rangeKey = restaurant ? `${restaurant.id}|${range.from.toISOString()}|${range.to.toISOString()}|${reloadToken}` : null;
  const deferredSearch = useDeferredValue(filters.search);

  /* ---------------- data ---------------- */

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
        if (requestId === requestRef.current) setLoadError(error.message || 'Could not load bills.');
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

  useEffect(() => {
    if (!restaurant) return;
    historyService.getOutstandingRecords().then(setOutstanding).catch(() => setOutstanding(new Map()));
    historyService.getItemCategories(restaurant.id).then(setCategories).catch(() => setCategories(new Map()));
  }, [restaurant, reloadToken]);

  useEffect(() => {
    staffService.getAllStaff().then(setStaff).catch(() => setStaff([]));
  }, []);

  /* ---------------- derived ---------------- */

  const staffNames = useMemo(() => new Map(staff.map((s) => [String(s.id), s.name])), [staff]);
  const staffName = useCallback((id) => (id == null ? '' : staffNames.get(String(id)) || `Staff #${id}`), [staffNames]);
  const itemCategory = useCallback((menuItemId) => categories.get(menuItemId) || '', [categories]);

  const bills = useMemo(() => dataset.orders.map((o) => classifyBill(o, outstanding.get(o.id) || null)), [dataset.orders, outstanding]);
  const status = effectiveStatus(report, filters.status);
  const activeFilters = useMemo(() => ({
    status,
    billType: report.filters.includes('billType') ? filters.billType : 'all',
    payment: report.filters.includes('payment') ? filters.payment : 'all',
    table: report.filters.includes('table') ? filters.table : 'all',
    server: report.filters.includes('server') ? filters.server : 'all',
    category: report.filters.includes('category') ? filters.category : 'all',
    search: report.filters.includes('search') ? deferredSearch : '',
  }), [report, status, filters, deferredSearch]);

  const taxSettings = useMemo(() => (restaurant ? printSettingsService.get(restaurant.id, region.country).tax : null), [restaurant, region.country]);

  const result = useMemo(() => {
    const list = filterReportBills(bills, activeFilters);
    return report.compute(list, {
      timeZone,
      staffName,
      itemCategory,
      taxSettings,
      filters: activeFilters,
      describePayments: (b) => describePayments(b, formatPrice),
      now: new Date(),
    });
  }, [bills, activeFilters, report, timeZone, staffName, itemCategory, taxSettings, formatPrice]);

  const totals = useMemo(() => computeTotals(result), [result]);

  const rows = useMemo(() => {
    if (!sort) return result.rows;
    const column = result.columns.find((c) => c.key === sort.key);
    if (!column) return result.rows;
    const value = (r) => {
      const v = r[sort.key];
      if (column.type === 'datetime' || column.type === 'date') return v ? new Date(v).getTime() : 0;
      return v ?? '';
    };
    return [...result.rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [result, sort]);

  const tableOptions = useMemo(() => Array.from(new Set(bills.map((b) => b.tableLabel).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [bills]);
  const serverOptions = useMemo(() => Array.from(new Set(bills.map((b) => b.serverId).filter((id) => id != null).map(String)))
    .map((id) => ({ id, name: staffName(id) })).sort((a, b) => a.name.localeCompare(b.name)), [bills, staffName]);
  const categoryOptions = useMemo(() => Array.from(new Set(categories.values())).sort(), [categories]);

  /* ---------------- formatting ---------------- */

  const formatCell = (column, value, row) => {
    if (value === null || value === undefined || value === '') return column.type === 'text' ? '' : '—';
    const type = column.key === 'value' && row?.valueType ? row.valueType : column.type;
    switch (type) {
      case 'money': return formatPrice(value);
      case 'number': return Number(value).toLocaleString(region.locale);
      case 'percent': return `${Number(value).toLocaleString(region.locale, { maximumFractionDigits: 2 })}%`;
      case 'datetime': return formatDateTime(value, timeZone);
      case 'date': {
        const [y, m, d] = String(value).split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(region.locale, { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      }
      default: return String(value);
    }
  };
  const isNumeric = (column) => ['money', 'number', 'percent'].includes(column.type);

  /* ---------------- actions ---------------- */

  const selectReport = (key) => {
    setSearchParams({ report: key }, { replace: true });
    setSort(null);
  };
  const setFilter = (key) => (event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  const setDate = (patch) => setDates((prev) => {
    const next = { ...prev, ...patch };
    if (patch.preset === 'custom' && !prev.customFrom) {
      next.customFrom = range.fromDate;
      next.customTo = range.toDate;
    }
    return next;
  });
  const toggleSort = (key) => setSort((prev) => (prev?.key === key ? (prev.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }));

  const filterSummary = () => {
    const parts = [];
    if (report.filters.includes('status')) parts.push(`Status: ${STATUS_OPTIONS.find((s) => s.key === status)?.label}`);
    if (activeFilters.billType !== 'all') parts.push(`Bill type: ${BILL_TYPES.find((t) => t.key === activeFilters.billType)?.label}`);
    if (activeFilters.payment !== 'all') parts.push(`Payment: ${PAYMENT_FILTERS.find((p) => p.key === activeFilters.payment)?.label}`);
    if (activeFilters.table !== 'all') parts.push(`Table: ${activeFilters.table}`);
    if (activeFilters.server !== 'all') parts.push(`Server: ${activeFilters.server === 'none' ? 'No server' : staffName(activeFilters.server)}`);
    if (activeFilters.category !== 'all') parts.push(`Category: ${activeFilters.category}`);
    if (activeFilters.search) parts.push(`Search: "${activeFilters.search}"`);
    return parts.join('; ') || 'None';
  };

  const exportExcel = () => {
    const excelValue = (column, value, row) => {
      if (value === null || value === undefined) return null;
      const type = column.key === 'value' && row?.valueType ? row.valueType : column.type;
      if (type === 'money' || type === 'number' || type === 'percent') return value;
      if (type === 'datetime') return formatDateTime(value, timeZone);
      return value;
    };
    const header = { cells: result.columns.map((c) => c.label), style: 'header' };
    const body = rows.map((r) => result.columns.map((c) => excelValue(c, r[c.key], r)));
    const totalRow = totals ? [{ cells: result.columns.map((c) => (totals[c.key] ?? null)), style: 'header' }] : [];
    const moneyColumns = result.columns.map((c, i) => (c.type === 'money' ? i : -1)).filter((i) => i >= 0);
    const info = [
      { cells: ['Report', report.label], style: 'header' },
      ['Restaurant', restaurant?.name || ''],
      ['Period', range.label],
      ['Time zone', timeZone],
      ['Currency', region.currency || ''],
      ['Filters', filterSummary()],
      ['Bills in period', bills.length],
      ['Generated at', formatDateTime(new Date().toISOString(), timeZone)],
      ['Generated by', userName || ''],
      ...(result.kpis || []).map((k) => [k.label, k.value]),
      ...(result.notes || []).map((n) => ['Note', n]),
      ...(dataset.truncated ? [['Warning', 'More than 5,000 orders in this period; only the newest were included.']] : []),
    ];
    try {
      downloadXlsx(`${report.key}-${range.fromDate}${range.toDate !== range.fromDate ? `_to_${range.toDate}` : ''}.xlsx`, [
        { name: 'Report Info', rows: info, columnWidths: [24, 70] },
        { name: report.label.slice(0, 31), rows: [header, ...body, ...totalRow], freezeRow: 1, moneyColumns, columnWidths: result.columns.map((c) => (c.type === 'text' ? 24 : 16)) },
      ]);
      toast({ title: 'Excel file ready', description: `${report.label}: ${rows.length} rows.`, status: 'success', duration: 3000 });
    } catch (error) {
      toast({ title: 'Export failed', description: error.message, status: 'error', duration: 5000, isClosable: true });
    }
  };

  if (!restaurant) {
    return <Center h="full" bg={pageBg}><Text color={muted}>Select a restaurant to see reports.</Text></Center>;
  }

  const hasData = dataset.key === rangeKey;
  const show = (key) => report.filters.includes(key);

  return (
    <Grid h="full" bg={pageBg} templateColumns={{ base: '1fr', lg: '250px minmax(0, 1fr)' }} minH={0}>
      {/* Report list */}
      <Box display={{ base: 'none', lg: 'block' }} borderRight="1px solid" borderColor={lineColor} bg={panelBg} overflowY="auto" py={3}>
        <HStack px={4} mb={2} spacing={2}>
          <Icon as={BarChart3} boxSize={5} />
          <Text fontWeight="700" fontSize="lg">Reports</Text>
        </HStack>
        {GROUPS.map((group) => (
          <Box key={group} mb={2}>
            <Text px={4} py={1} fontSize="xs" fontWeight="700" color={muted} textTransform="uppercase" letterSpacing="0.05em">{group}</Text>
            {REPORTS.filter((r) => r.group === group).map((r) => (
              <Box
                key={r.key}
                as="button"
                display="block"
                w="full"
                textAlign="left"
                px={4}
                py={1.5}
                fontSize="sm"
                fontWeight={r.key === reportKey ? '700' : '500'}
                bg={r.key === reportKey ? activeBg : 'transparent'}
                color={r.key === reportKey ? activeColor : undefined}
                borderLeft="3px solid"
                borderColor={r.key === reportKey ? 'blue.500' : 'transparent'}
                aria-current={r.key === reportKey ? 'page' : undefined}
                onClick={() => selectReport(r.key)}
              >
                {r.label}
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      <Flex direction="column" minH={0} overflow="hidden">
        {/* Header and filters */}
        <Box px={{ base: 3, md: 5 }} pt={4} pb={3} borderBottom="1px solid" borderColor={lineColor} bg={panelBg}>
          <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap" mb={3}>
            <Box>
              <Select display={{ base: 'block', lg: 'none' }} mb={2} value={reportKey} onChange={(e) => selectReport(e.target.value)} aria-label="Report">
                {GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {REPORTS.filter((r) => r.group === g).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </optgroup>
                ))}
              </Select>
              <Text fontSize="xl" fontWeight="700">{report.label}</Text>
              <Text fontSize="sm" color={muted}>{report.description}</Text>
            </Box>
            <HStack>
              <Tooltip label="Reload data">
                <IconButton aria-label="Reload data" icon={<RefreshCw size={16} />} variant="outline" size="sm" onClick={() => setReloadToken((t) => t + 1)} isLoading={isLoading} />
              </Tooltip>
              <Button size="sm" colorScheme="green" leftIcon={<FileSpreadsheet size={15} />} onClick={exportExcel} isDisabled={!hasData || isLoading || rows.length === 0}>
                Export Excel
              </Button>
            </HStack>
          </Flex>

          <Flex gap={2} wrap="wrap" align="center">
            <InputGroup size="sm" w="auto" minW="230px">
              <InputLeftElement pointerEvents="none"><CalendarDays size={14} /></InputLeftElement>
              <Select size="sm" pl={8} borderRadius="8px" value={dates.preset} onChange={(e) => setDate({ preset: e.target.value })} aria-label="Date range">
                {REPORT_DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
            </InputGroup>
            {dates.preset === 'custom' && (
              <HStack spacing={1} wrap="wrap">
                <Input type="date" size="sm" w="140px" borderRadius="8px" value={dates.customFrom} onChange={(e) => setDate({ customFrom: e.target.value })} aria-label="From date" />
                <Input type="time" size="sm" w="105px" borderRadius="8px" value={dates.customFromTime} onChange={(e) => setDate({ customFromTime: e.target.value || '00:00' })} aria-label="From time" />
                <Text fontSize="sm">to</Text>
                <Input type="date" size="sm" w="140px" borderRadius="8px" value={dates.customTo} onChange={(e) => setDate({ customTo: e.target.value })} aria-label="To date" />
                <Input type="time" size="sm" w="105px" borderRadius="8px" value={dates.customToTime} onChange={(e) => setDate({ customToTime: e.target.value || '23:59' })} aria-label="To time" />
              </HStack>
            )}
            {show('status') && (
              <Select size="sm" w="auto" borderRadius="8px" value={status} onChange={setFilter('status')} aria-label="Bill status">
                {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            )}
            {show('billType') && (
              <Select size="sm" w="auto" borderRadius="8px" value={filters.billType} onChange={setFilter('billType')} aria-label="Bill type">
                {BILL_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            )}
            {show('payment') && (
              <Select size="sm" w="auto" borderRadius="8px" value={filters.payment} onChange={setFilter('payment')} aria-label="Payment method">
                <option value="all">All payment modes</option>
                {PAYMENT_FILTERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
            )}
            {show('table') && (
              <Select size="sm" w="auto" borderRadius="8px" value={filters.table} onChange={setFilter('table')} aria-label="Table">
                <option value="all">All tables</option>
                {tableOptions.map((t) => <option key={t} value={t}>Table {t}</option>)}
              </Select>
            )}
            {show('server') && (
              <Select size="sm" w="auto" borderRadius="8px" value={filters.server} onChange={setFilter('server')} aria-label="Server">
                <option value="all">All servers</option>
                <option value="none">No server</option>
                {serverOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            {show('category') && (
              <Select size="sm" w="auto" borderRadius="8px" value={filters.category} onChange={setFilter('category')} aria-label="Category">
                <option value="all">All categories</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="Uncategorised">Uncategorised</option>
              </Select>
            )}
            {show('search') && (
              <InputGroup size="sm" maxW="240px">
                <InputLeftElement pointerEvents="none"><Search size={14} /></InputLeftElement>
                <Input borderRadius="8px" placeholder="Bill number, amount, name…" value={filters.search} onChange={setFilter('search')} aria-label="Search bills" />
              </InputGroup>
            )}
            <Button size="sm" variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>
          </Flex>
          <Text fontSize="xs" color={muted} mt={2}>
            {range.label} · {timeZone}{hasData ? ` · ${bills.length} closed bills in the period` : ''}
          </Text>
        </Box>

        {/* Body */}
        <Box flex={1} minH={0} overflowY="auto" px={{ base: 3, md: 5 }} py={4}>
          {hasData && dataset.truncated && (
            <Alert status="warning" borderRadius="8px" mb={3} py={2}><AlertIcon /><AlertDescription fontSize="sm">This period has more than 5,000 orders, so only the newest were loaded. Choose a shorter period for complete figures.</AlertDescription></Alert>
          )}
          {hasData && dataset.failed > 0 && (
            <Alert status="warning" borderRadius="8px" mb={3} py={2}><AlertIcon /><AlertDescription fontSize="sm">{dataset.failed} bill(s) could not be fully loaded. Reload to try again.</AlertDescription></Alert>
          )}

          {isLoading && (
            <Center py={16}>
              <VStack w="260px">
                <Spinner color="blue.500" />
                <Text fontSize="sm" color={muted}>{progress ? `Loading bill details ${progress.done} of ${progress.total}…` : 'Loading bills…'}</Text>
                {progress && <Progress value={(progress.done / progress.total) * 100} size="xs" w="full" borderRadius="full" />}
              </VStack>
            </Center>
          )}
          {!isLoading && loadError && (
            <Center py={16}>
              <VStack>
                <Text color="red.500" fontWeight="600">Could not load the report</Text>
                <Text fontSize="sm" color={muted}>{loadError}</Text>
                <Button size="sm" onClick={() => setReloadToken((t) => t + 1)}>Try again</Button>
              </VStack>
            </Center>
          )}

          {!isLoading && !loadError && hasData && (
            <>
              {result.kpis && (
                <SimpleGrid columns={{ base: 2, md: 4, xl: result.kpis.length }} spacing={3} mb={4}>
                  {result.kpis.map((k) => (
                    <Box key={k.label} bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" px={4} py={3}>
                      <Text fontSize="xs" fontWeight="600" color={muted} textTransform="uppercase">{k.label}</Text>
                      <Text fontSize="xl" fontWeight="700" noOfLines={1}>{formatCell({ type: k.type }, k.value)}</Text>
                    </Box>
                  ))}
                </SimpleGrid>
              )}

              {rows.length === 0 ? (
                <Center py={16}>
                  <VStack spacing={2}>
                    <Icon as={Inbox} boxSize={8} color={muted} />
                    <Text fontWeight="600">No data for this report</Text>
                    <Text fontSize="sm" color={muted}>Try another period or clear the filters.</Text>
                  </VStack>
                </Center>
              ) : (
                <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflow="auto" maxH="calc(100vh - 330px)">
                  <Table size="sm">
                    <Thead position="sticky" top={0} zIndex={1} bg={headBg}>
                      <Tr>
                        {result.columns.map((c) => (
                          <Th key={c.key} isNumeric={isNumeric(c)} cursor="pointer" whiteSpace="nowrap" onClick={() => toggleSort(c.key)}
                            aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} py={3}>
                            <HStack spacing={1} justify={isNumeric(c) ? 'flex-end' : 'flex-start'}>
                              <span>{c.label}</span>
                              {sort?.key === c.key && <Icon as={sort.dir === 'asc' ? ArrowUp : ArrowDown} boxSize={3} />}
                            </HStack>
                          </Th>
                        ))}
                      </Tr>
                    </Thead>
                    <Tbody>
                      {rows.map((r, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <Tr key={`${r.id ?? ''}-${i}`} opacity={r.muted ? 0.55 : 1} bg={r.bold ? sectionBg : undefined}>
                          {result.columns.map((c) => (
                            <Td key={c.key} isNumeric={isNumeric(c)} whiteSpace={c.key === 'payment' || c.key === 'note' ? 'normal' : 'nowrap'} fontWeight={r.bold ? '700' : undefined}>
                              {formatCell(c, r[c.key], r)}
                            </Td>
                          ))}
                        </Tr>
                      ))}
                    </Tbody>
                    {totals && (
                      <Tfoot position="sticky" bottom={0} bg={headBg}>
                        <Tr>
                          {result.columns.map((c) => (
                            <Th key={c.key} isNumeric={isNumeric(c)} fontSize="sm" color="inherit" textTransform="none" py={3}>
                              {totals[c.key] === undefined ? '' : (typeof totals[c.key] === 'string' ? totals[c.key] : formatCell(c, totals[c.key]))}
                            </Th>
                          ))}
                        </Tr>
                      </Tfoot>
                    )}
                  </Table>
                </Box>
              )}
              <Text fontSize="xs" color={muted} mt={2}>{rows.length} row(s). Click a column heading to sort.</Text>
              {(result.notes || []).map((n) => <Text key={n} fontSize="xs" color={muted}>{n}</Text>)}
            </>
          )}
        </Box>
      </Flex>
    </Grid>
  );
};

export default ReportsView;
