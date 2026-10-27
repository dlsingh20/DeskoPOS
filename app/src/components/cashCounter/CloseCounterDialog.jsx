import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Collapse,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputLeftAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Spinner,
  Text,
  Textarea,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { Printer, RefreshCw } from 'lucide-react';
import cashCounterService from '../../services/CashCounterService';
import { describeApiError } from '../../services/UserService';
import PrintService from '../../services/PrintService';
import {
  VARIANCE_LIMIT,
  buildShiftReportHtml,
  denominationTotal,
  denominationsFor,
  describeVariance,
  methodLabel,
  num,
  round2,
  shiftFigures,
  validateAmount,
} from '../../utils/cashCounterUtils';
import { formatDateTime } from '../../utils/historyUtils';

const Line = ({ label, value, bold }) => (
  <Flex justify="space-between" fontWeight={bold ? '700' : '400'}><Text>{label}</Text><Text>{value}</Text></Flex>
);

/**
 * Count the cash and close a shift. Cashiers count blind (no expected amount); Managers and
 * Administrators see expected, counted and the difference, and give a reason above the limit.
 * `supervisor`: a Manager closing someone else's shift.
 */
const CloseCounterDialog = ({
  isOpen, onClose, shift, counterName, showExpected, supervisor = false, currency, decimals = 2, currencySymbol = '',
  formatPrice, timeZone, hotelName, userName, onClosed, cashierId = null,
}) => {
  const toast = useToast();
  const [counted, setCounted] = useState('');
  const [byNotes, setByNotes] = useState(false);
  const [counts, setCounts] = useState({});
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [closed, setClosed] = useState(null);
  const [live, setLive] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const boxBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  // The shift we were handed may be hours old: reload it for today's takings
  const refresh = useCallback(() => {
    if (!shift) return undefined;
    let cancelled = false;
    setRefreshing(true);
    cashCounterService.loadShiftWithTakings(shift, { cashierUserId: cashierId })
      .then((fresh) => { if (!cancelled) setLive(fresh); })
      .finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [shift, cashierId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setCounted('');
    setByNotes(false);
    setCounts({});
    setOther('');
    setNotes('');
    setShowErrors(false);
    setError(null);
    setClosed(null);
    setLive(null);
    return refresh();
  }, [isOpen, refresh]);

  if (!shift) return null;

  const current = live || shift;
  const figures = shiftFigures(current);
  const amountText = byNotes ? denominationTotal(counts, other).toFixed(decimals) : counted;
  const amountError = validateAmount(amountText, decimals);
  const difference = amountError ? null : round2(num(amountText) - figures.expected);
  const needsReason = showExpected && difference != null && Math.abs(difference) > VARIANCE_LIMIT + 0.004;
  const notesError = needsReason && !notes.trim() ? 'Give a reason for the difference.' : null;
  const fmtTime = (v) => formatDateTime(v, timeZone);

  const submit = async () => {
    setShowErrors(true);
    if (amountError || notesError || saving) return;
    setSaving(true);
    setError(null);
    // Keep the POS cash on the server's record while its totals don't include POS bills
    const posNote = figures.posByMethod.length
      ? `POS bills: ${figures.posByMethod.map((m) => `${methodLabel(m.method)} ${m.total.toFixed(decimals)} (${m.count})`).join(', ')}; expected in drawer incl. POS cash ${figures.expected.toFixed(decimals)}`
      : '';
    try {
      const result = await cashCounterService.closeShift(shift.id, {
        physicalCount: num(amountText).toFixed(decimals),
        notes: [notes.trim(), posNote].filter(Boolean).join(' | '),
      });
      setClosed({ ...current, ...result, physical_count: result?.physical_count ?? num(amountText).toFixed(decimals) });
    } catch (err) {
      setError(describeApiError(err, 'Could not close the counter.'));
    } finally {
      setSaving(false);
    }
  };

  const printReport = (s) => PrintService.printHtml(buildShiftReportHtml({
    shift: s, kind: 'Z', counterName, hotelName, formatPrice, formatTime: fmtTime, showExpected, printedBy: userName,
  })).catch((err) => toast({ title: 'Report print failed', description: err.message, status: 'error', duration: 6000, isClosable: true }));

  const finish = () => {
    const done = closed;
    onClose();
    onClosed?.(done);
  };

  if (closed) {
    const f = shiftFigures(closed);
    return (
      <Modal isOpen={isOpen} onClose={finish} isCentered size="md" closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent borderRadius="16px" mx={4}>
          <ModalHeader>{counterName} closed</ModalHeader>
          <ModalBody>
            <VStack align="stretch" spacing={1} bg={boxBg} borderRadius="10px" px={4} py={3} fontSize="sm">
              <Line label="Cashier" value={closed.cashier_name || '—'} />
              <Line label="Counted" value={formatPrice(f.counted ?? num(amountText))} bold />
              {showExpected && <Line label="Expected" value={formatPrice(f.expected)} />}
              {showExpected && <Line label="Difference" value={describeVariance(f.variance, formatPrice)} bold />}
            </VStack>
            {!showExpected && <Text fontSize="xs" color="gray.500" mt={2}>A Manager checks the count against the takings.</Text>}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="outline" leftIcon={<Printer size={16} />} onClick={() => printReport(closed)}>Print report</Button>
            <Button colorScheme="blue" onClick={finish}>Done</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} isCentered size="lg" closeOnOverlayClick={false} scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>
          Close {counterName}
          <Text fontSize="sm" fontWeight="400" color="gray.500">
            {supervisor ? `${shift.cashier_name || 'Cashier'}'s shift · ` : ''}opened {fmtTime(shift.opened_at)}
          </Text>
        </ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            {showExpected && (
              <VStack align="stretch" spacing={1} bg={boxBg} borderRadius="10px" px={4} py={3} fontSize="sm" opacity={refreshing && !live ? 0.5 : 1}>
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontSize="xs" fontWeight="700" color="gray.500" textTransform="uppercase">Takings this shift</Text>
                  <Button size="xs" variant="ghost" leftIcon={refreshing ? <Spinner size="xs" /> : <RefreshCw size={12} />} onClick={refresh} isDisabled={refreshing}>
                    {refreshing ? 'Updating' : 'Refresh'}
                  </Button>
                </Flex>
                {figures.byMethod.map((m) => (
                  <Line key={m.method} label={`${methodLabel(m.method)}${m.count != null ? ` (${m.count})` : ''}`} value={formatPrice(m.total)} />
                ))}
                {figures.posByMethod.map((m) => (
                  <Line key={`pos-${m.method}`} label={`POS bills · ${methodLabel(m.method)} (${m.count})`} value={formatPrice(m.total)} />
                ))}
                {figures.grandTotal != null && <Line label="All methods" value={formatPrice(figures.grandTotal)} bold />}
                {(figures.byMethod.length > 0 || figures.posByMethod.length > 0 || figures.grandTotal != null) && <Box borderTop="1px dashed" borderColor="gray.300" my={1} />}
                {live && live.posTakings === null && (
                  <Text fontSize="xs" color="orange.500">POS bill payments could not be read, so they are not included.</Text>
                )}
                <Line label="Opening cash" value={formatPrice(figures.opening)} />
                <Line label="Cash received" value={formatPrice(figures.received)} />
                <Line label="Cash paid out" value={formatPrice(figures.paidOut)} />
                <Line label="Expected in drawer" value={formatPrice(figures.expected)} bold />
              </VStack>
            )}

            <FormControl isRequired isInvalid={showErrors && !!amountError}>
              <FormLabel fontSize="sm">Cash counted in the drawer</FormLabel>
              {!byNotes && (
                <InputGroup>
                  {currencySymbol && <InputLeftAddon>{currencySymbol}</InputLeftAddon>}
                  <Input value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" autoFocus />
                </InputGroup>
              )}
              <Button variant="link" size="sm" mt={1} onClick={() => setByNotes((v) => !v)}>
                {byNotes ? 'Type the total instead' : 'Count by notes and coins'}
              </Button>
              <Collapse in={byNotes} animateOpacity>
                <SimpleGrid columns={{ base: 2, sm: 3 }} spacing={2} mt={2}>
                  {denominationsFor(currency).map((d) => (
                    <HStack key={d} spacing={1}>
                      <Text fontSize="sm" minW="56px" textAlign="right">{currencySymbol}{d} ×</Text>
                      <Input size="sm" value={counts[d] ?? ''} inputMode="numeric" aria-label={`Number of ${d}`}
                        onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value.replace(/\D/g, '') }))} />
                    </HStack>
                  ))}
                  <HStack spacing={1}>
                    <Text fontSize="sm" minW="56px" textAlign="right">Other</Text>
                    <Input size="sm" value={other} inputMode="decimal" aria-label="Other coins and cash"
                      onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ''))} />
                  </HStack>
                </SimpleGrid>
                <Text fontSize="sm" fontWeight="700" mt={2}>Total {formatPrice(denominationTotal(counts, other))}</Text>
              </Collapse>
              {showErrors && amountError
                ? <FormErrorMessage>{amountError}</FormErrorMessage>
                : !showExpected && <FormHelperText fontSize="xs">Count everything in the drawer, including the opening cash.</FormHelperText>}
            </FormControl>

            {showExpected && difference != null && (
              <Alert status={Math.abs(difference) < 0.005 ? 'success' : 'warning'} borderRadius="10px" fontSize="sm">
                <AlertIcon /><AlertDescription>{describeVariance(difference, formatPrice)}</AlertDescription>
              </Alert>
            )}

            <FormControl isInvalid={showErrors && !!notesError}>
              <FormLabel fontSize="sm">Notes{needsReason ? ' (reason for the difference)' : ''}</FormLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} placeholder={needsReason ? 'e.g. change given twice to table 4' : 'Optional'} />
              <FormErrorMessage>{notesError}</FormErrorMessage>
            </FormControl>

            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Box flex={1}>
            {showExpected && (
              <Button variant="ghost" size="sm" leftIcon={<Printer size={14} />} onClick={() => PrintService.printHtml(buildShiftReportHtml({
                shift: current, kind: 'X', counterName, hotelName, formatPrice, formatTime: fmtTime, printedBy: userName,
              })).catch(() => {})}>Shift report so far</Button>
            )}
          </Box>
          <Button variant="ghost" onClick={onClose} isDisabled={saving}>Cancel</Button>
          <Button colorScheme="blue" onClick={submit} isLoading={saving} loadingText="Closing">Close counter</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CloseCounterDialog;
