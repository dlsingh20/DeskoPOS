import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  HStack,
  Menu,
  MenuButton,
  MenuDivider,
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
  Text,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { LogOut, Monitor, Printer, Wallet } from 'lucide-react';
import { useAccess } from './AccessContext';
import { usePOS } from './POSContext';
import cashCounterService from '../services/CashCounterService';
import { describeApiError } from '../services/UserService';
import PrintService from '../services/PrintService';
import OpenCounterForm from '../components/cashCounter/OpenCounterForm';
import CloseCounterDialog from '../components/cashCounter/CloseCounterDialog';
import {
  buildShiftReportHtml,
  counterRequirement,
  isOpenShift,
  isStaleShift,
  seesExpectedCash,
  shiftCounterName,
} from '../utils/cashCounterUtils';
import { formatDateTime, resolveTimeZone } from '../utils/historyUtils';
import { resolveRegionalFormat } from '../utils/regionalFormat';

/** Without the provider (tests, screens outside the app shell) nothing is gated */
const OFF = {
  enabled: false, shift: null, counters: [], counterName: '', ensureCounter: () => true, signOut: null,
  openCounter: () => {}, closeCounter: () => {}, reload: () => {}, money: null,
};
const CashCounterContext = createContext(OFF);

/**
 * Cash counter shifts for the signed-in user.
 * - Users who must open a counter see the "Open your counter" screen until they do (Administrators may skip).
 * - ensureCounter() blocks payments and refunds while no counter is open.
 * - signOut() asks whether to close the counter first; a counter left open stays on the cashier's name.
 * Switched off (nothing gated) while the hotel has no active counters or cash counters are off.
 */
export const CashCounterProvider = ({ children, onLogout }) => {
  const { access, user, userName } = useAccess();
  const { state, formatPrice, getCurrencySymbol } = usePOS();
  const toast = useToast();
  const { required, canSkip } = counterRequirement(access);
  const involved = required || canSkip;
  const timeZone = resolveTimeZone(state.hotelSettings?.timezone);
  const region = useMemo(() => resolveRegionalFormat(state.hotelSettings), [state.hotelSettings]);
  const money = useMemo(() => ({
    formatPrice, timeZone, decimals: region.decimals, currency: state.currency, currencySymbol: getCurrencySymbol ? getCurrencySymbol() : '',
    hotelName: state.hotelSettings?.name || '', userName,
  }), [formatPrice, timeZone, region.decimals, state.currency, getCurrencySymbol, state.hotelSettings, userName]);

  const [status, setStatus] = useState(involved ? 'loading' : 'off'); // loading | off | ready | error
  const [counters, setCounters] = useState([]);
  const [shift, setShift] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [skipped, setSkipped] = useState(false);
  const [openAsked, setOpenAsked] = useState(false);
  const [signOutAsked, setSignOutAsked] = useState(false);
  const [closing, setClosing] = useState(null); // { thenSignOut }

  const reload = useCallback(async () => {
    if (!involved) { setStatus('off'); return; }
    setLoadError(null);
    try {
      const { available, counters: list } = await cashCounterService.listCounters();
      setCounters(list);
      if (!available || !list.some((c) => c.is_active !== false)) {
        setShift(null);
        setStatus('off');
        return;
      }
      setShift(await cashCounterService.getCurrentShift());
      setStatus('ready');
    } catch (error) {
      setLoadError(describeApiError(error, 'Could not load the cash counters.'));
      setStatus('error');
    }
  }, [involved]);

  useEffect(() => { reload(); }, [reload]);

  const enabled = status === 'ready';
  const hasShift = isOpenShift(shift);
  const counterName = hasShift ? shiftCounterName(shift, counters) : '';

  const ensureCounter = useCallback(() => {
    if (!enabled || hasShift) return true;
    setOpenAsked(true);
    toast({ title: 'Open a cash counter first', description: 'Payments and refunds are recorded on your counter.', status: 'info', duration: 4000 });
    return false;
  }, [enabled, hasShift, toast]);

  const signOut = useCallback(() => {
    if (enabled && hasShift) setSignOutAsked(true);
    else onLogout();
  }, [enabled, hasShift, onLogout]);

  const opened = (newShift) => {
    setShift(newShift);
    setOpenAsked(false);
    toast({ title: `${shiftCounterName(newShift, counters)} is open`, status: 'success', duration: 2500 });
  };

  const value = useMemo(() => ({
    enabled,
    shift: hasShift ? shift : null,
    counters,
    counterName,
    canSkip,
    ensureCounter,
    signOut,
    openCounter: () => setOpenAsked(true),
    closeCounter: () => hasShift && setClosing({ thenSignOut: false }),
    reload,
    money,
  }), [enabled, hasShift, shift, counters, counterName, canSkip, ensureCounter, signOut, reload, money]);

  if (involved && status === 'loading') {
    return <Center h="100vh"><Spinner size="lg" /></Center>;
  }
  if (involved && status === 'error') {
    return (
      <Center h="100vh" px={4}>
        <VStack spacing={3} textAlign="center" maxW="420px">
          <Text fontWeight="700">Could not check your cash counter</Text>
          <Text fontSize="sm" color="gray.500">{loadError}</Text>
          <Button onClick={() => { setStatus('loading'); reload(); }}>Try again</Button>
          <Button variant="ghost" onClick={onLogout}>Sign out</Button>
        </VStack>
      </Center>
    );
  }

  // Before anything else: open (or skip, for Administrators) a counter
  if (enabled && !hasShift && (required || (canSkip && !skipped))) {
    return (
      <Center minH="100vh" px={4} py={8} bg="gray.50" _dark={{ bg: 'gray.900' }}>
        <Box w="full" maxW="560px" bg="white" _dark={{ bg: 'gray.800' }} borderRadius="16px" boxShadow="lg" p={{ base: 5, md: 7 }}>
          <HStack spacing={2} mb={1}><Wallet size={20} /><Text fontSize="xl" fontWeight="700">Open your cash counter</Text></HStack>
          <Text fontSize="sm" color="gray.500" mb={5}>
            Hi {userName || 'there'}. Payments, bills and refunds you take today are recorded on this counter, in your name.
          </Text>
          <OpenCounterForm
            counters={counters}
            userId={user?.id}
            decimals={money.decimals}
            currencySymbol={money.currencySymbol}
            formatPrice={formatPrice}
            onOpened={opened}
            footer={(
              <HStack spacing={1}>
                {canSkip && <Button variant="ghost" size="sm" onClick={() => setSkipped(true)}>Continue without a counter</Button>}
                <Button variant="ghost" size="sm" leftIcon={<LogOut size={14} />} onClick={onLogout}>Sign out</Button>
              </HStack>
            )}
          />
        </Box>
      </Center>
    );
  }

  return (
    <CashCounterContext.Provider value={value}>
      {children}

      {/* Opened from a blocked payment or the header (Administrators who skipped) */}
      <Modal isOpen={openAsked && enabled && !hasShift} onClose={() => setOpenAsked(false)} size="lg" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius="16px" mx={4}>
          <ModalHeader>Open a cash counter</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <OpenCounterForm counters={counters} userId={user?.id} decimals={money.decimals}
              currencySymbol={money.currencySymbol} formatPrice={formatPrice} onOpened={opened} />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Sign out: close the counter now, or leave it open on your name */}
      <Modal isOpen={signOutAsked} onClose={() => setSignOutAsked(false)} isCentered size="md">
        <ModalOverlay />
        <ModalContent borderRadius="16px" mx={4}>
          <ModalHeader>Close {counterName} before signing out?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">
              If you keep it open, the cash collected stays on your name. You continue this shift at your next sign-in,
              or a Manager closes it for you.
            </Text>
          </ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            <Button variant="ghost" onClick={() => setSignOutAsked(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => { setSignOutAsked(false); onLogout(); }}>Sign out, keep open</Button>
            <Button colorScheme="blue" onClick={() => { setSignOutAsked(false); setClosing({ thenSignOut: true }); }}>Count cash & close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <CloseCounterDialog
        isOpen={!!closing && hasShift}
        onClose={() => setClosing(null)}
        shift={shift}
        counterName={counterName}
        showExpected={seesExpectedCash(access)}
        cashierId={user?.id}
        {...money}
        onClosed={() => {
          const thenSignOut = closing?.thenSignOut;
          setShift(null);
          setClosing(null);
          if (thenSignOut) onLogout();
        }}
      />
    </CashCounterContext.Provider>
  );
};

export const useCashCounter = () => useContext(CashCounterContext);

/** Header chip: the open counter with its actions, or "Open counter" for Administrators who skipped */
export const CashCounterBadge = () => {
  const { enabled, shift, counterName, canSkip, openCounter, closeCounter, money } = useCashCounter();
  const { access, user } = useAccess();
  const bg = useColorModeValue('teal.50', 'rgba(56,178,172,0.15)');
  const stale = isStaleShift(shift);
  if (!enabled) return null;
  if (!shift) {
    return canSkip
      ? <Button size="xs" variant="outline" leftIcon={<Monitor size={12} />} onClick={openCounter}>Open counter</Button>
      : null;
  }
  const showExpected = seesExpectedCash(access);
  return (
    <Menu placement="bottom-end">
      <MenuButton as={Box} cursor="pointer" aria-label={`Cash counter: ${counterName}`}>
        <HStack spacing={1.5} px={2.5} py={1} borderRadius="full" bg={stale ? 'orange.100' : bg} color={stale ? 'orange.700' : 'teal.700'} _dark={{ color: stale ? 'orange.200' : 'teal.200' }}>
          <Monitor size={14} />
          <Text fontSize="xs" fontWeight="700" maxW="120px" isTruncated>{counterName}</Text>
        </HStack>
      </MenuButton>
      <MenuList fontSize="sm" borderRadius="12px" p={2} minW="230px">
        <Box px={3} py={1.5}>
          <Text fontWeight="600">{counterName}</Text>
          <Text fontSize="xs" color="gray.500">Opened {formatDateTime(shift.opened_at, money.timeZone)}</Text>
          {stale && <Badge colorScheme="orange" mt={1}>Open since yesterday or longer</Badge>}
        </Box>
        <MenuDivider />
        {showExpected && (
          <MenuItem icon={<Printer size={14} />} borderRadius="8px" onClick={() => cashCounterService.loadShiftWithTakings(shift, { cashierUserId: user?.id }).then((fresh) => PrintService.printHtml(buildShiftReportHtml({
            shift: fresh, kind: 'X', counterName, hotelName: money.hotelName, formatPrice: money.formatPrice,
            formatTime: (v) => formatDateTime(v, money.timeZone), printedBy: money.userName,
          }))).catch(() => {})}>
            Shift report so far
          </MenuItem>
        )}
        <MenuItem icon={<Wallet size={14} />} borderRadius="8px" onClick={closeCounter}>Count cash & close counter</MenuItem>
      </MenuList>
    </Menu>
  );
};
