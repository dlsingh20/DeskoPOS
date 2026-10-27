import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Center,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { MoreVertical, Pencil, Plus, Power, Printer, RefreshCw, Wallet } from 'lucide-react';
import cashCounterService from '../../services/CashCounterService';
import { describeApiError } from '../../services/UserService';
import PrintService from '../../services/PrintService';
import { useAccess } from '../../context/AccessContext';
import { useCashCounter } from '../../context/CashCounterContext';
import { usePOS } from '../../context/POSContext';
import CloseCounterDialog from './CloseCounterDialog';
import {
  buildShiftReportHtml,
  canEditCounters,
  describeVariance,
  isOpenShift,
  isStaleShift,
  shiftCounterId,
  shiftCounterName,
  shiftFigures,
  sortCounters,
  summarizePosPayments,
} from '../../utils/cashCounterUtils';
import { formatDateTime, resolveTimeZone } from '../../utils/historyUtils';
import { resolveRegionalFormat } from '../../utils/regionalFormat';

const CounterDialog = ({ isOpen, onClose, counter, counters, onSaved }) => {
  const [name, setName] = useState('');
  const [order, setOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(counter?.name || '');
    setOrder(String(counter?.sort_order ?? counters.length));
    setActive(counter ? counter.is_active !== false : true);
    setShowErrors(false);
    setError(null);
  }, [isOpen, counter, counters.length]);

  const trimmed = name.trim();
  const nameError = !trimmed ? 'Enter a name.'
    : trimmed.length > 50 ? 'Use at most 50 characters.'
      : counters.some((c) => c.id !== counter?.id && String(c.name).trim().toLowerCase() === trimmed.toLowerCase()) ? 'A counter with this name already exists.' : null;
  const orderError = /^\d{1,4}$/.test(order.trim()) ? null : 'Enter a whole number.';

  const save = async () => {
    setShowErrors(true);
    if (nameError || orderError || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = { name: trimmed, sort_order: Number(order), is_active: active };
      const saved = counter ? await cashCounterService.updateCounter(counter.id, body) : await cashCounterService.createCounter(body);
      onSaved(saved, !!counter);
      onClose();
    } catch (err) {
      setError(describeApiError(err, 'Could not save the counter.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} isCentered size="sm">
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{counter ? `Edit ${counter.name}` : 'Add cash counter'}</ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <FormControl isRequired isInvalid={showErrors && !!nameError}>
              <FormLabel fontSize="sm">Name</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus placeholder="e.g. Counter 1, Bar counter" />
              <FormErrorMessage>{nameError}</FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={showErrors && !!orderError} maxW="160px">
              <FormLabel fontSize="sm">Display order</FormLabel>
              <Input value={order} onChange={(e) => setOrder(e.target.value)} inputMode="numeric" />
              <FormErrorMessage>{orderError}</FormErrorMessage>
            </FormControl>
            <FormControl display="flex" alignItems="center" gap={3}>
              <Switch id="counter-active" isChecked={active} onChange={(e) => setActive(e.target.checked)} />
              <FormLabel htmlFor="counter-active" mb={0} fontSize="sm">Active (staff can open it)</FormLabel>
            </FormControl>
            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={saving}>Cancel</Button>
          <Button colorScheme="blue" onClick={save} isLoading={saving}>{counter ? 'Save' : 'Add counter'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/**
 * Settings → Cash Counters: counters (Administrators add and change them), shifts open right now
 * (a Manager can close one left open), and recent closes with over/short.
 */
const CashCountersView = () => {
  const toast = useToast();
  const { access, userName, user } = useAccess();
  const meId = user?.id ?? null;
  const { reload: reloadMine, shift: myShift } = useCashCounter();
  const { state, formatPrice, getCurrencySymbol } = usePOS();
  const timeZone = resolveTimeZone(state.hotelSettings?.timezone);
  const region = useMemo(() => resolveRegionalFormat(state.hotelSettings), [state.hotelSettings]);
  const editable = canEditCounters(access);
  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const headBg = useColorModeValue('gray.50', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [counters, setCounters] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [shiftsError, setShiftsError] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null); // { counter }
  const [closing, setClosing] = useState(null); // shift

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await cashCounterService.listCounters();
      setAvailable(result.available);
      setCounters(sortCounters(result.counters));
      if (result.available) {
        try {
          let rows = await cashCounterService.listShifts({ limit: 100 });
          // Add the POS bills each cashier took during their shift (not in the server's totals yet)
          const shown = [...rows.filter(isOpenShift), ...rows.filter((s) => !isOpenShift(s)).slice(0, 30)];
          const earliest = shown.map((s) => s.opened_at).filter(Boolean).sort()[0];
          if (earliest) {
            try {
              const payments = await cashCounterService.listPosPaymentsSince(earliest);
              rows = rows.map((s) => (s.opened_at ? {
                ...s,
                posTakings: summarizePosPayments(payments, { cashierId: s.opened_by ?? s.cashier, from: s.opened_at, to: s.closed_at || null }),
              } : s));
            } catch (err) { /* without POS payments the server figures are shown */ }
          }
          setShifts(rows);
          setShiftsError(null);
        } catch (err) {
          setShifts([]);
          setShiftsError(describeApiError(err, 'Could not load the shifts.'));
        }
      }
    } catch (err) {
      setError(describeApiError(err, 'Could not load the cash counters.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); reloadMine(); };
  const openShifts = shifts.filter(isOpenShift);
  const closedShifts = shifts.filter((s) => !isOpenShift(s)).slice(0, 30);
  const fmt = (v) => formatDateTime(v, timeZone);
  const currencySymbol = getCurrencySymbol ? getCurrencySymbol() : '';

  const toggleActive = async (c) => {
    try {
      await cashCounterService.updateCounter(c.id, { is_active: c.is_active === false });
      toast({ title: c.is_active === false ? 'Counter active' : 'Counter inactive', description: c.name, status: 'success', duration: 2500 });
      changed();
    } catch (err) {
      toast({ title: 'Could not change the counter', description: describeApiError(err), status: 'error', duration: 5000, isClosable: true });
    }
  };

  const printReport = (s) => PrintService.printHtml(buildShiftReportHtml({
    shift: s, kind: isOpenShift(s) ? 'X' : 'Z', counterName: shiftCounterName(s, counters), hotelName: state.hotelSettings?.name || '',
    formatPrice, formatTime: fmt, printedBy: userName,
  })).catch((err) => toast({ title: 'Report print failed', description: err.message, status: 'error', duration: 5000, isClosable: true }));

  if (loading) return <Center h="full" bg={pageBg}><Spinner /></Center>;

  return (
    <Box h="full" overflowY="auto" bg={pageBg}>
      <Box px={{ base: 4, md: 6 }} py={4} maxW="1200px">
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2} mb={4}>
          <Box>
            <Text fontSize="xl" fontWeight="700">Cash Counters</Text>
            <Text fontSize="sm" color={muted}>Staff who settle bills open a counter after signing in. Cash they collect is recorded on it, in their name.</Text>
          </Box>
          <HStack>
            <Tooltip label="Reload"><IconButton aria-label="Reload" icon={<RefreshCw size={16} />} size="sm" variant="outline" onClick={load} /></Tooltip>
            {editable && available && <Button size="sm" colorScheme="blue" leftIcon={<Plus size={14} />} onClick={() => setDialog({ counter: null })}>Add counter</Button>}
          </HStack>
        </Flex>

        {error && <Alert status="error" borderRadius="12px" mb={4}><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}

        {!available ? (
          <Alert status="info" borderRadius="12px" alignItems="flex-start" py={4}>
            <AlertIcon mt={1} />
            <Box>
              <AlertTitle>Cash counters are switched off</AlertTitle>
              <AlertDescription display="block" fontSize="sm">
                The hotel has cash counters turned off, or your account can't read them. An Administrator switches them on in the
                hotel's accounting settings (cash counter enabled). Until then nobody is asked to open a counter.
              </AlertDescription>
            </Box>
          </Alert>
        ) : (
          <VStack align="stretch" spacing={6}>
            {/* Counters */}
            <Box>
              <Text fontWeight="700" mb={2}>Counters</Text>
              <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
                {counters.length === 0 ? (
                  <Center py={10} px={4}>
                    <VStack spacing={1} textAlign="center">
                      <Text fontWeight="600">No counters yet</Text>
                      <Text fontSize="sm" color={muted}>
                        {editable ? 'Add one counter per cash drawer, e.g. Counter 1 and Bar counter. Staff are asked to open one as soon as the first counter exists.' : 'An Administrator adds the counters.'}
                      </Text>
                    </VStack>
                  </Center>
                ) : (
                  <Table size="sm" minW="560px">
                    <Thead bg={headBg}><Tr><Th>Counter</Th><Th>In use by</Th><Th isNumeric>Order</Th><Th>Status</Th>{editable && <Th w="48px" />}</Tr></Thead>
                    <Tbody>
                      {counters.map((c) => {
                        const open = openShifts.find((s) => shiftCounterId(s) === Number(c.id));
                        return (
                          <Tr key={c.id} opacity={c.is_active === false ? 0.6 : 1}>
                            <Td fontWeight="600">{c.name}</Td>
                            <Td fontSize="sm">{open ? `${open.cashier_name || 'Someone'} · since ${fmt(open.opened_at)}` : <Text as="span" color={muted}>Free</Text>}</Td>
                            <Td isNumeric>{c.sort_order ?? 0}</Td>
                            <Td><Badge colorScheme={c.is_active === false ? 'gray' : 'green'}>{c.is_active === false ? 'Inactive' : 'Active'}</Badge></Td>
                            {editable && (
                              <Td>
                                <Menu placement="bottom-end">
                                  <MenuButton as={IconButton} size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label={`Actions for ${c.name}`} />
                                  <MenuList fontSize="sm">
                                    <MenuItem icon={<Pencil size={14} />} onClick={() => setDialog({ counter: c })}>Edit</MenuItem>
                                    <MenuItem icon={<Power size={14} />} onClick={() => toggleActive(c)}>{c.is_active === false ? 'Make active' : 'Make inactive'}</MenuItem>
                                  </MenuList>
                                </Menu>
                              </Td>
                            )}
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                )}
              </Box>
            </Box>

            {shiftsError && <Alert status="warning" borderRadius="12px" fontSize="sm"><AlertIcon /><AlertDescription>{shiftsError}</AlertDescription></Alert>}

            {/* Open now */}
            <Box>
              <Text fontWeight="700" mb={2}>Open now ({openShifts.length})</Text>
              <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
                {openShifts.length === 0 ? (
                  <Text fontSize="sm" color={muted} px={4} py={4}>No counter is open.</Text>
                ) : (
                  <Table size="sm" minW="640px">
                    <Thead bg={headBg}><Tr><Th>Counter</Th><Th>Cashier</Th><Th>Opened</Th><Th isNumeric>Opening cash</Th><Th isNumeric>Expected now</Th><Th /></Tr></Thead>
                    <Tbody>
                      {openShifts.map((s) => {
                        const f = shiftFigures(s);
                        return (
                          <Tr key={s.id}>
                            <Td fontWeight="600">{shiftCounterName(s, counters)}</Td>
                            <Td>{s.cashier_name || '—'}</Td>
                            <Td fontSize="sm">{fmt(s.opened_at)}{isStaleShift(s) && <Badge ml={2} colorScheme="orange">Left open</Badge>}</Td>
                            <Td isNumeric>{formatPrice(f.opening)}</Td>
                            <Td isNumeric fontWeight="600">{formatPrice(f.expected)}</Td>
                            <Td>
                              <HStack justify="flex-end" spacing={1}>
                                <Tooltip label="Shift report so far"><IconButton aria-label="Print shift report" icon={<Printer size={14} />} size="sm" variant="ghost" onClick={() => printReport(s)} /></Tooltip>
                                <Button size="sm" leftIcon={<Wallet size={14} />} onClick={() => setClosing(s)}>Close</Button>
                              </HStack>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                )}
              </Box>
            </Box>

            {/* Recent closes */}
            <Box>
              <Text fontWeight="700" mb={2}>Recently closed</Text>
              <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
                {closedShifts.length === 0 ? (
                  <Text fontSize="sm" color={muted} px={4} py={4}>No closed shifts yet.</Text>
                ) : (
                  <Table size="sm" minW="820px">
                    <Thead bg={headBg}><Tr><Th>Closed</Th><Th>Counter</Th><Th>Cashier</Th><Th isNumeric>Expected</Th><Th isNumeric>Counted</Th><Th>Difference</Th><Th>Closed by</Th><Th w="48px" /></Tr></Thead>
                    <Tbody>
                      {closedShifts.map((s) => {
                        const f = shiftFigures(s);
                        const off = f.variance != null && Math.abs(f.variance) >= 0.005;
                        return (
                          <Tr key={s.id}>
                            <Td fontSize="sm">{fmt(s.closed_at || s.register_date)}</Td>
                            <Td>{shiftCounterName(s, counters)}</Td>
                            <Td>{s.cashier_name || '—'}</Td>
                            <Td isNumeric>{formatPrice(f.expected)}</Td>
                            <Td isNumeric>{f.counted != null ? formatPrice(f.counted) : '—'}</Td>
                            <Td><Text as="span" color={off ? (f.variance < 0 ? 'red.500' : 'orange.500') : 'green.600'} fontWeight="600">{describeVariance(f.variance, formatPrice)}</Text></Td>
                            <Td fontSize="sm">{s.closed_by_name && s.closed_by_name !== s.cashier_name ? <>{s.closed_by_name} <Badge ml={1}>for cashier</Badge></> : (s.closed_by_name || '—')}</Td>
                            <Td><IconButton aria-label="Print shift report" icon={<Printer size={14} />} size="sm" variant="ghost" onClick={() => printReport(s)} /></Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                )}
              </Box>
            </Box>
          </VStack>
        )}
      </Box>

      <CounterDialog
        isOpen={!!dialog}
        onClose={() => setDialog(null)}
        counter={dialog?.counter || null}
        counters={counters}
        onSaved={(saved, isEdit) => {
          toast({ title: isEdit ? 'Counter updated' : 'Counter added', description: saved?.name, status: 'success', duration: 2500 });
          changed();
        }}
      />

      <CloseCounterDialog
        isOpen={!!closing}
        onClose={() => setClosing(null)}
        shift={closing}
        counterName={closing ? shiftCounterName(closing, counters) : ''}
        showExpected
        supervisor={!!closing && closing.id !== myShift?.id}
        formatPrice={formatPrice}
        timeZone={timeZone}
        decimals={region.decimals}
        currency={state.currency}
        currencySymbol={currencySymbol}
        hotelName={state.hotelSettings?.name || ''}
        userName={userName}
        cashierId={closing ? (closing.id === myShift?.id ? meId : (closing.opened_by ?? closing.cashier ?? null)) : null}
        onClosed={() => { setClosing(null); changed(); }}
      />
    </Box>
  );
};

export default CashCountersView;
