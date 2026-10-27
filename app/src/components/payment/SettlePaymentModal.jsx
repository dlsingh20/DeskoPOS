import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalFooter,
  Box,
  Flex,
  HStack,
  VStack,
  SimpleGrid,
  Text,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Checkbox,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Alert,
  AlertIcon,
  AlertDescription,
  Divider,
  Spinner,
  Center,
  ButtonGroup,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { usePOS } from '../../context/POSContext';
import { useAccess } from '../../context/AccessContext';
import { useModal } from '../../hooks/useModal';
import orderService from '../../services/OrderService';
import staffService from '../../services/StaffService';
import settlementService, { SETTLEMENT_METHODS, TIP_METHODS, AmountChangedError, newIdempotencyKey } from '../../services/SettlementService';
import { getRemainingAmount, calculatePaidAmount } from '../../utils/orderUtils';
import { getShortOrderNumber } from '../../utils/fineDineUtils';
import GuestSelector from './GuestSelector';
import DiscountLine from '../discount/DiscountLine';
import PrintService from '../../services/PrintService';
import printSettingsService from '../../services/PrintSettingsService';
import { getDiscountInfo } from '../../services/DiscountService';
import { useCashCounter } from '../../context/CashCounterContext';

const SectionLabel = ({ children }) => (
  <Text fontSize="xs" fontWeight="800" letterSpacing="0.06em" color="gray.500" textTransform="uppercase" mb={2}>
    {children}
  </Text>
);

const parseAmount = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

const round2 = (n) => Math.round(n * 100) / 100;

// A full card number must never be stored as a reference
const looksLikeCardNumber = (value) => /^\d{13,19}$/.test(value.replace(/[\s-]/g, ''));

const quickCashAmounts = (due) => {
  if (!(due > 0)) return [];
  const steps = [100, 500, 2000];
  const values = [Math.ceil(due), ...steps.map((s) => Math.ceil(due / s) * s)];
  return [...new Set(values)].filter((v) => v >= due).slice(0, 4);
};

/**
 * Complete Payment popup: collect payment, record tip, settle and close the order.
 */
const SettlePaymentModal = ({ isOpen, onClose, orderId, onSettled }) => {
  const { formatPrice, getCurrencySymbol } = usePOS();
  const { can, requestApproval } = useAccess();
  const { ensureCounter, shift: cashShift } = useCashCounter();
  const toast = useToast();
  useModal(isOpen, 'SettlePaymentModal');

  const headerBg = useColorModeValue('white', 'gray.800');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const methodBg = useColorModeValue('gray.50', 'gray.700');
  const methodBorder = useColorModeValue('gray.200', 'gray.600');
  const selectedBg = useColorModeValue('blue.600', 'blue.500');
  const returnBg = useColorModeValue('green.50', 'rgba(72,187,120,0.15)');
  const returnBorder = useColorModeValue('green.200', 'green.700');
  const summaryBg = useColorModeValue('gray.50', 'gray.900');
  const totalColor = useColorModeValue('green.600', 'green.300');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [methodKey, setMethodKey] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [reference, setReference] = useState('');
  const [cardType, setCardType] = useState('credit');
  const [confirmed, setConfirmed] = useState(false);
  const [guest, setGuest] = useState(null);
  const [guestSelectorOpen, setGuestSelectorOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [tipAmount, setTipAmount] = useState('');
  const [tipWaiterId, setTipWaiterId] = useState('');
  const [tipMethodKey, setTipMethodKey] = useState('');
  const [staff, setStaff] = useState([]);
  const [staffError, setStaffError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const submittingRef = useRef(false);
  // One key per settlement attempt: retries reuse it so the server never records the payment twice
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  // A Credit Pay approval is kept for retries of the same settlement
  const creditApprovalRef = useRef(null);
  const cashInputRef = useRef(null);

  const currency = getCurrencySymbol();
  const method = SETTLEMENT_METHODS.find((m) => m.key === methodKey);

  // ---- Load ------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen || !orderId) return undefined;
    let cancelled = false;

    setMethodKey('cash');
    setCashReceived('');
    idempotencyKeyRef.current = newIdempotencyKey();
    creditApprovalRef.current = null;
    setReference('');
    setCardType('credit');
    setConfirmed(false);
    setGuest(null);
    setTipAmount('');
    setTipMethodKey('');
    setSubmitError(null);
    setPaymentSaved(false);
    setShowErrors(false);
    setLoadError(null);
    setLoading(true);

    orderService.getOrder(orderId)
      .then((fresh) => {
        if (cancelled) return;
        setOrder(fresh);
        setCustomerName(fresh.customer_name || '');
        setCustomerPhone(fresh.customer_phone || '');
        setTipWaiterId(fresh.server ? String(fresh.server) : '');
      })
      .catch((error) => !cancelled && setLoadError(error.message))
      .finally(() => !cancelled && setLoading(false));

    staffService.getActiveStaff()
      .then((list) => {
        if (cancelled) return;
        setStaff(list);
        setStaffError(null);
      })
      .catch(() => {
        if (!cancelled) setStaffError('Staff list is unavailable for this login.');
      });

    return () => { cancelled = true; };
  }, [isOpen, orderId]);

  // ---- Amounts ---------------------------------------------------------------

  const grandTotal = parseFloat(order?.total_amount || 0);
  const alreadyPaid = order ? calculatePaidAmount(order) : 0;
  const amountDue = order ? getRemainingAmount(order) : 0;

  const tip = parseAmount(tipAmount);
  const tipValue = tip > 0 ? round2(tip) : 0;
  const tipMethod = TIP_METHODS.find((m) => m.key === tipMethodKey);
  const cashTip = methodKey === 'cash' && tipMethodKey === 'cash' ? tipValue : 0;

  const received = parseAmount(cashReceived);
  const cashChange = methodKey === 'cash' && received !== null && !Number.isNaN(received)
    ? round2(received - amountDue - cashTip)
    : null;

  const billCollected = method?.kind === 'payment' ? amountDue : 0;
  const totalCollected = round2(billCollected + tipValue);

  const discountStale = order ? getDiscountInfo(order).stale : false;

  // ---- Validation ------------------------------------------------------------

  const errors = useMemo(() => {
    const e = {};
    if (!method) e.method = 'Choose a payment method.';
    if (methodKey === 'cash' && amountDue > 0) {
      if (received === null) e.cash = 'Enter the cash received.';
      else if (Number.isNaN(received) || received < 0) e.cash = 'Enter a valid amount.';
      else if (cashChange < 0) {
        e.cash = `${formatPrice(-cashChange)} short${cashTip ? ' (bill + cash tip)' : ''}.`;
      }
    }
    if (method?.needsReference && amountDue > 0) {
      const ref = reference.trim();
      if (ref.length < 4) e.reference = 'Enter the transaction / approval reference (at least 4 characters).';
      else if (methodKey === 'card' && looksLikeCardNumber(ref)) e.reference = 'Do not enter the card number. Use the approval code from the terminal slip.';
      if (!confirmed) e.confirmed = 'Confirm the payment was received.';
    }
    if (methodKey === 'guest_visit' && amountDue > 0 && !guest) e.guest = 'Choose the in-house guest to charge.';
    if (methodKey === 'credit_pay') {
      if (!customerName.trim()) e.customerName = 'Customer name is required.';
      if (!/^\+?[\d\s-]{7,15}$/.test(customerPhone.trim())) e.customerPhone = 'Enter a valid phone number.';
    } else if (customerPhone.trim() && !/^\+?[\d\s-]{7,15}$/.test(customerPhone.trim())) {
      // Guest details are optional on a paid bill, but a phone that is entered must be valid
      e.customerPhone = 'Enter a valid phone number, or leave it empty.';
    }
    if (tipAmount !== '') {
      if (Number.isNaN(tip) || tip < 0) e.tip = 'Tip must be zero or more.';
      else if (tip > 0) {
        if (!tipMethodKey) e.tipMethod = 'Choose how the tip was paid.';
        if (!tipWaiterId && staff.length > 0) e.tipWaiter = 'Choose the waiter.';
      }
    }
    if (discountStale) e.discount = 'Re-apply or keep the discount before settling.';
    return e;
  }, [discountStale, method, methodKey, amountDue, received, cashChange, cashTip, reference, confirmed, guest, customerName, customerPhone, tipAmount, tip, tipMethodKey, tipWaiterId, staff.length, formatPrice]);

  const isValid = Object.keys(errors).length === 0;
  const shown = (key) => (showErrors || key === 'cash' ? errors[key] : null);

  const isDirty = cashReceived !== '' || reference !== '' || tipAmount !== '' || !!guest || methodKey !== 'cash';

  // ---- Notes for the audit trail -----------------------------------------------

  const buildNotes = () => {
    const parts = [];
    if (method?.channel) parts.push(`Paid via ${method.channel}`);
    if (methodKey === 'card') parts.push(`${cardType === 'debit' ? 'Debit' : 'Credit'} card`);
    if (methodKey === 'cash' && received !== null) {
      parts.push(`Cash received ${received.toFixed(2)}, change returned ${Math.max(0, cashChange).toFixed(2)}`);
    }
    if (methodKey === 'guest_visit' && guest) parts.push(`Guest Visit: ${guest.guest_name}, Room ${guest.room_number}`);
    if (tipValue > 0) {
      const waiter = staff.find((s) => String(s.id) === tipWaiterId);
      parts.push(`Tip ${tipValue.toFixed(2)} via ${tipMethod?.label || 'n/a'}${waiter ? ` for ${waiter.name} (staff #${waiter.id})` : ''}`);
    }
    return parts.join(' | ');
  };

  // ---- Actions ---------------------------------------------------------------

  const handleSettle = async () => {
    if (submittingRef.current) return;
    setShowErrors(true);
    if (!isValid || !order) return;
    if (!can('bill.settle')) {
      setSubmitError('Your role cannot settle bills. Ask a Manager.');
      return;
    }
    // Payments are recorded on the cashier's open counter
    if (!ensureCounter()) return;

    // Credit Pay without the permission needs a manager's approval, recorded in the notes
    let approval = methodKey === 'credit_pay' ? creditApprovalRef.current : null;
    if (methodKey === 'credit_pay' && !paymentSaved && !can('payment.credit') && !approval) {
      submittingRef.current = true;
      approval = await requestApproval({
        permission: 'payment.credit',
        title: `Credit Pay of ${formatPrice(amountDue)}`,
        detail: `Bill #${order.order_number}${customerName ? ` for ${customerName}` : ''}.`,
        orderId: order.id,
        context: { amount: amountDue.toFixed(2), customer_name: customerName, customer_phone: customerPhone },
      });
      submittingRef.current = false;
      if (!approval) return;
      creditApprovalRef.current = approval;
    }
    const approvalNote = approval && !approval.self ? `Credit Pay approved by ${approval.name}` : '';

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Guest name / phone go on the order before settling, so the printed bill carries them
      if (customerName.trim() !== (order.customer_name || '') || customerPhone.trim() !== (order.customer_phone || '')) {
        try {
          setOrder(await orderService.updateOrderCustomer(order.id, { name: customerName, phone: customerPhone }));
        } catch (error) {
          throw new Error(`Could not save the guest details: ${error.message}`);
        }
      }

      const result = await settlementService.settle({
        orderId: order.id,
        expectedAmountDue: amountDue,
        method,
        reference,
        cardType,
        guest,
        customer: { name: customerName, phone: customerPhone },
        notes: [buildNotes(), approvalNote].filter(Boolean).join(' | '),
        tip: tipValue > 0 ? { amount: tipValue, method: tipMethod?.backendMethod || tipMethodKey, staffId: tipWaiterId || null } : null,
        cash: methodKey === 'cash' && received !== null && !Number.isNaN(received) ? { received, change: Math.max(0, cashChange || 0) } : null,
        approvalId: approval?.approvalId || null,
        idempotencyKey: idempotencyKeyRef.current,
        cashRegisterId: cashShift?.id ?? null,
      });

      const label = order.table_number ? `Table ${order.table_number}` : getShortOrderNumber(order);
      const title = methodKey === 'credit_pay' ? 'Moved to Credit Pay' : result.alreadySettled ? 'Order already settled' : 'Payment complete';
      const description = methodKey === 'credit_pay'
        ? `${label}: ${formatPrice(amountDue)} recorded as outstanding.`
        : `${label} settled${cashChange > 0 ? `. Return ${formatPrice(cashChange)} to the customer` : ''}${tipValue > 0 ? `. Tip ${formatPrice(tipValue)} recorded` : ''}.`;
      const settledOrderId = order.id;
      const printReceipt = () => PrintService.printBillById(settledOrderId).catch((error) => toast({
        title: 'Receipt print failed', description: error.message || 'The printer did not respond.', status: 'error', duration: 6000, isClosable: true,
      }));

      if (printSettingsService.get(order.restaurant).autoPrintBill) {
        toast({ title, description: `${description} Printing the receipt…`, status: 'success', duration: 6000, isClosable: true });
        printReceipt();
      } else {
        toast({
          duration: 9000,
          isClosable: true,
          render: ({ onClose: closeToast }) => (
            <Box bg="green.500" color="white" p={3} borderRadius="8px" boxShadow="lg" maxW="420px">
              <HStack justify="space-between" align="flex-start" spacing={3}>
                <Box>
                  <Text fontWeight="700">{title}</Text>
                  <Text fontSize="sm">{description}</Text>
                </Box>
                <Button size="sm" bg="white" color="green.700" _hover={{ bg: 'green.50' }} flexShrink={0}
                  onClick={() => { closeToast(); printReceipt(); }}>
                  Print receipt
                </Button>
              </HStack>
            </Box>
          ),
        });
      }
      result.warnings.forEach((warning) => toast({ title: 'Check table status', description: warning, status: 'warning', duration: 7000, isClosable: true }));

      onSettled?.(result.order);
      onClose();
    } catch (error) {
      if (error instanceof AmountChangedError) {
        if (error.order) setOrder(error.order);
        setCashReceived('');
        // A new amount is a new settlement
        idempotencyKeyRef.current = newIdempotencyKey();
        setSubmitError(`${error.message} New amount due: ${formatPrice(error.amountDue)}.`);
      } else {
        if (error.order) setOrder(error.order);
        if (error.paymentSaved || error.steps?.paymentRecorded) setPaymentSaved(true);
        setSubmitError(error.message);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (submitting) return;
    if (isDirty && !paymentSaved && !window.confirm('Discard the payment details you entered? The order stays open.')) return;
    onClose();
  };

  const selectMethod = (key) => {
    if (submitting) return;
    setMethodKey(key);
    setReference('');
    setConfirmed(false);
    setShowErrors(false);
    setSubmitError(null);
    if (key === 'guest_visit' && !guest) setGuestSelectorOpen(true);
    if (key === 'cash') setTimeout(() => cashInputRef.current?.focus(), 50);
  };

  // ---- Render ----------------------------------------------------------------

  const isTakeaway = order && order.type !== 'dine_in';
  const settleLabel = paymentSaved ? 'Retry closing order' : methodKey === 'credit_pay' ? 'Move to Credit Pay' : 'Settle & Close Order';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCancel}
        isCentered
        size="xl"
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={!submitting}
      >
        <ModalOverlay bg="blackAlpha.500" backdropFilter="blur(2px)" />
        <ModalContent borderRadius="20px" overflow="hidden" mx={3}>
          {/* Header */}
          <Flex px={6} pt={5} pb={4} bg={headerBg} borderBottomWidth="1px" justify="space-between" align="flex-start" gap={4}>
            <Box>
              <Text fontSize="xl" fontWeight="800">Complete Payment</Text>
              <Text fontSize="sm" color={mutedColor}>
                {isTakeaway ? 'Settle takeaway bill & record tips' : 'Settle table invoice & record tips'}
              </Text>
              {order && (
                <Text fontSize="xs" color={mutedColor} mt={1} fontWeight="600">
                  {order.table_number ? `Table ${order.table_number} · ` : ''}Order {order.order_number}
                </Text>
              )}
            </Box>
            <Box textAlign="right">
              <Text fontSize="xs" color={mutedColor} fontWeight="600">Grand Total</Text>
              <Text fontSize="2xl" fontWeight="800" color={totalColor} textDecoration="underline" textUnderlineOffset="4px" aria-live="polite">
                {order ? formatPrice(grandTotal) : '—'}
              </Text>
              {alreadyPaid > 0 && (
                <Text fontSize="xs" color={mutedColor}>Due now: {formatPrice(amountDue)}</Text>
              )}
            </Box>
          </Flex>

          <ModalBody px={6} py={5}>
            {loading ? (
              <Center py={16}><Spinner color="blue.500" /></Center>
            ) : loadError ? (
              <Alert status="error" borderRadius="10px"><AlertIcon />{loadError}</Alert>
            ) : order && (
              <VStack align="stretch" spacing={5}>
                {/* Payment method */}
                <Box as="fieldset" aria-label="Select payment method">
                  <SectionLabel>Select payment method</SectionLabel>
                  <SimpleGrid columns={{ base: 2, sm: 3 }} spacing={2.5} role="radiogroup">
                    {SETTLEMENT_METHODS.map((m) => {
                      const selected = m.key === methodKey;
                      return (
                        <Button
                          key={m.key}
                          role="radio"
                          aria-checked={selected}
                          h="48px"
                          borderRadius="12px"
                          fontWeight="700"
                          bg={selected ? selectedBg : methodBg}
                          color={selected ? 'white' : undefined}
                          borderWidth="1px"
                          borderColor={selected ? selectedBg : methodBorder}
                          boxShadow={selected ? 'md' : 'none'}
                          _hover={{ bg: selected ? selectedBg : methodBorder }}
                          onClick={() => selectMethod(m.key)}
                          isDisabled={submitting}
                        >
                          {m.label}
                        </Button>
                      );
                    })}
                  </SimpleGrid>
                </Box>

                {/* Method details */}
                {amountDue <= 0 && method?.kind !== 'outstanding' ? (
                  <Alert status="success" borderRadius="10px" fontSize="sm">
                    <AlertIcon />
                    This bill is already fully paid. Settle to close the order.
                  </Alert>
                ) : methodKey === 'cash' ? (
                  <Box>
                    <SimpleGrid columns={2} spacing={3}>
                      <FormControl isInvalid={!!shown('cash') && received !== null}>
                        <FormLabel fontSize="xs" fontWeight="800" letterSpacing="0.06em" color={mutedColor} mb={1}>CASH RECEIVED</FormLabel>
                        <InputGroup size="lg">
                          <InputLeftElement pointerEvents="none" color={mutedColor}>{currency}</InputLeftElement>
                          <Input
                            ref={cashInputRef}
                            autoFocus
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={cashReceived}
                            onChange={(e) => setCashReceived(e.target.value.replace(/^-/, ''))}
                            onKeyDown={(e) => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                            placeholder={amountDue.toFixed(2)}
                            aria-label="Cash received"
                            fontWeight="700"
                            borderRadius="12px"
                          />
                        </InputGroup>
                        <FormErrorMessage>{errors.cash}</FormErrorMessage>
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs" fontWeight="800" letterSpacing="0.06em" color={mutedColor} mb={1}>RETURN CASH</FormLabel>
                        <Flex
                          h="48px"
                          align="center"
                          px={4}
                          borderRadius="12px"
                          bg={returnBg}
                          borderWidth="1px"
                          borderColor={returnBorder}
                          fontWeight="800"
                          fontSize="lg"
                          color={cashChange !== null && cashChange < 0 ? 'red.500' : 'green.700'}
                          aria-live="polite"
                          aria-label="Return cash"
                        >
                          {cashChange === null ? `${currency} 0` : cashChange < 0 ? `Short ${formatPrice(-cashChange)}` : formatPrice(cashChange)}
                        </Flex>
                      </FormControl>
                    </SimpleGrid>
                    <HStack spacing={2} mt={2} flexWrap="wrap">
                      {quickCashAmounts(amountDue + cashTip).map((value) => (
                        <Button key={value} size="xs" variant="outline" borderRadius="full" onClick={() => setCashReceived(String(value))}>
                          {formatPrice(value)}
                        </Button>
                      ))}
                    </HStack>
                    {cashTip > 0 && (
                      <Text fontSize="xs" color={mutedColor} mt={1}>Cash tip is kept from the cash received, so it is not returned as change.</Text>
                    )}
                  </Box>
                ) : method?.needsReference ? (
                  <VStack align="stretch" spacing={3}>
                    {methodKey === 'card' && (
                      <ButtonGroup size="sm" isAttached variant="outline">
                        <Button onClick={() => setCardType('credit')} colorScheme={cardType === 'credit' ? 'blue' : 'gray'} variant={cardType === 'credit' ? 'solid' : 'outline'}>Credit card</Button>
                        <Button onClick={() => setCardType('debit')} colorScheme={cardType === 'debit' ? 'blue' : 'gray'} variant={cardType === 'debit' ? 'solid' : 'outline'}>Debit card</Button>
                      </ButtonGroup>
                    )}
                    <FormControl isInvalid={!!shown('reference')}>
                      <FormLabel fontSize="xs" fontWeight="800" letterSpacing="0.06em" color={mutedColor} mb={1}>
                        {methodKey === 'card' ? 'APPROVAL CODE / TERMINAL REFERENCE' : `${method.label.toUpperCase()} TRANSACTION ID / UTR`}
                      </FormLabel>
                      <Input
                        autoFocus
                        value={reference}
                        maxLength={40}
                        autoComplete="off"
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={methodKey === 'card' ? 'e.g. 004512' : 'e.g. 4231 8890 1123'}
                        borderRadius="12px"
                      />
                      <FormErrorMessage>{errors.reference}</FormErrorMessage>
                    </FormControl>
                    <FormControl isInvalid={!!shown('confirmed')}>
                      <Checkbox isChecked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} colorScheme="green">
                        <Text fontSize="sm">
                          {methodKey === 'card'
                            ? `The card terminal approved ${formatPrice(amountDue)}`
                            : `${formatPrice(amountDue)} received in the ${method.label} app`}
                        </Text>
                      </Checkbox>
                      <FormErrorMessage>{errors.confirmed}</FormErrorMessage>
                    </FormControl>
                  </VStack>
                ) : methodKey === 'guest_visit' ? (
                  <FormControl isInvalid={!!shown('guest')}>
                    <Flex align="center" justify="space-between" p={3} borderRadius="12px" borderWidth="1px" borderColor={methodBorder} gap={3}>
                      {guest ? (
                        <Box>
                          <Text fontWeight="700">{guest.guest_name}</Text>
                          <Text fontSize="sm" color={mutedColor}>Room {guest.room_number} · {formatPrice(amountDue)} will be added to the room folio</Text>
                        </Box>
                      ) : (
                        <Text fontSize="sm" color={mutedColor}>Charge this bill to an in-house guest's room.</Text>
                      )}
                      <Button size="sm" onClick={() => setGuestSelectorOpen(true)}>{guest ? 'Change' : 'Choose guest'}</Button>
                    </Flex>
                    <FormErrorMessage>{errors.guest}</FormErrorMessage>
                  </FormControl>
                ) : methodKey === 'credit_pay' ? (
                  <VStack align="stretch" spacing={3}>
                    <Alert status="warning" borderRadius="10px" fontSize="sm">
                      <AlertIcon />
                      <AlertDescription>
                        {formatPrice(amountDue)} is recorded as <strong>outstanding</strong>. No money is marked as received.
                      </AlertDescription>
                    </Alert>
                    <SimpleGrid columns={2} spacing={3}>
                      <FormControl isInvalid={!!shown('customerName')} isRequired>
                        <FormLabel fontSize="xs" mb={1}>Customer name</FormLabel>
                        <Input value={customerName} maxLength={100} onChange={(e) => setCustomerName(e.target.value)} borderRadius="10px" />
                        <FormErrorMessage>{errors.customerName}</FormErrorMessage>
                      </FormControl>
                      <FormControl isInvalid={!!shown('customerPhone')} isRequired>
                        <FormLabel fontSize="xs" mb={1}>Phone</FormLabel>
                        <Input type="tel" value={customerPhone} maxLength={15} onChange={(e) => setCustomerPhone(e.target.value)} borderRadius="10px" />
                        <FormErrorMessage>{errors.customerPhone}</FormErrorMessage>
                      </FormControl>
                    </SimpleGrid>
                  </VStack>
                ) : null}

                {/* Guest details for the bill (optional; Credit Pay asks for them above) */}
                {methodKey !== 'credit_pay' && (
                  <Box>
                    <SectionLabel>Guest details (optional)</SectionLabel>
                    <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2.5}>
                      <FormControl>
                        <Input
                          placeholder="Guest name"
                          aria-label="Guest name"
                          value={customerName}
                          maxLength={100}
                          onChange={(e) => setCustomerName(e.target.value)}
                          isDisabled={submitting || paymentSaved}
                          borderRadius="10px"
                        />
                      </FormControl>
                      <FormControl isInvalid={!!shown('customerPhone')}>
                        <Input
                          type="tel"
                          inputMode="tel"
                          placeholder="Mobile number"
                          aria-label="Guest mobile number"
                          value={customerPhone}
                          maxLength={15}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          isDisabled={submitting || paymentSaved}
                          borderRadius="10px"
                        />
                        <FormErrorMessage>{errors.customerPhone}</FormErrorMessage>
                      </FormControl>
                    </SimpleGrid>
                  </Box>
                )}

                {/* Tip */}
                <Box>
                  <Divider mb={4} />
                  <SectionLabel>Tip &amp; waiter attribution</SectionLabel>
                  <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={2.5}>
                    <FormControl isInvalid={!!shown('tip')}>
                      <InputGroup>
                        <InputLeftElement pointerEvents="none" color={mutedColor}>{currency}</InputLeftElement>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          placeholder="Tip Amount"
                          aria-label="Tip amount"
                          value={tipAmount}
                          onChange={(e) => setTipAmount(e.target.value.replace(/^-/, ''))}
                          onKeyDown={(e) => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                          borderRadius="10px"
                        />
                      </InputGroup>
                      <FormErrorMessage>{errors.tip}</FormErrorMessage>
                    </FormControl>
                    <FormControl isInvalid={!!shown('tipWaiter')}>
                      <Select
                        placeholder={staffError ? 'Staff list unavailable' : 'Tip Waiter'}
                        aria-label="Tip waiter"
                        value={tipWaiterId}
                        onChange={(e) => setTipWaiterId(e.target.value)}
                        isDisabled={!!staffError || staff.length === 0}
                        borderRadius="10px"
                      >
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}</option>
                        ))}
                      </Select>
                      <FormErrorMessage>{errors.tipWaiter}</FormErrorMessage>
                    </FormControl>
                    <FormControl isInvalid={!!shown('tipMethod')}>
                      <Select
                        placeholder="Tip Method"
                        aria-label="Tip method"
                        value={tipMethodKey}
                        onChange={(e) => setTipMethodKey(e.target.value)}
                        borderRadius="10px"
                      >
                        {TIP_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </Select>
                      <FormErrorMessage>{errors.tipMethod}</FormErrorMessage>
                    </FormControl>
                  </SimpleGrid>
                </Box>

                {/* Summary */}
                <Box bg={summaryBg} borderRadius="12px" px={4} py={3} fontSize="sm">
                  <VStack align="stretch" spacing={1}>
                    <Row label="Subtotal" value={formatPrice(order.subtotal || 0)} />
                    <DiscountLine
                      order={order}
                      formatPrice={formatPrice}
                      getCurrencySymbol={getCurrencySymbol}
                      canEdit={!['completed', 'outstanding', 'cancelled', 'refunded'].includes(order.status)}
                      onOrderUpdated={(updated) => { setOrder(updated); setSubmitError(null); }}
                      isDisabled={submitting || paymentSaved}
                      disabledReason="The payment is already saved"
                    />
                    {parseFloat(order.service_charge) > 0 && <Row label="Service charge" value={formatPrice(order.service_charge)} />}
                    {parseFloat(order.tax_amount) > 0 && <Row label="Taxes" value={formatPrice(order.tax_amount)} />}
                    <Row label="Grand total" value={formatPrice(grandTotal)} strong />
                    {alreadyPaid > 0 && <Row label="Already paid" value={`− ${formatPrice(alreadyPaid)}`} />}
                    <Row label="Amount due" value={formatPrice(amountDue)} strong />
                    <Divider my={1} />
                    {methodKey === 'cash' && received !== null && !Number.isNaN(received) && (
                      <>
                        <Row label="Cash received" value={formatPrice(received)} />
                        <Row label="Change to return" value={formatPrice(Math.max(0, cashChange || 0))} color="green.600" />
                      </>
                    )}
                    {methodKey === 'credit_pay' && <Row label="On credit (outstanding)" value={formatPrice(amountDue)} color="orange.500" />}
                    {methodKey === 'guest_visit' && <Row label="Charged to room" value={formatPrice(amountDue)} />}
                    {tipValue > 0 && <Row label={`Tip${tipMethod ? ` (${tipMethod.label})` : ''}`} value={formatPrice(tipValue)} />}
                    <Row label="Total collected now" value={formatPrice(totalCollected)} strong color={totalColor} />
                  </VStack>
                </Box>

                {submitError && (
                  <Alert status={paymentSaved ? 'warning' : 'error'} borderRadius="10px" fontSize="sm">
                    <AlertIcon />
                    <AlertDescription>
                      {submitError}
                      {paymentSaved && ' The payment is saved. Retrying will not charge again.'}
                    </AlertDescription>
                  </Alert>
                )}
              </VStack>
            )}
          </ModalBody>

          <ModalFooter px={6} py={4} gap={3} borderTopWidth="1px">
            <Button flex={1} h="48px" variant="outline" borderRadius="12px" onClick={handleCancel} isDisabled={submitting}>
              Cancel
            </Button>
            <Button
              flex={1}
              h="48px"
              colorScheme={methodKey === 'credit_pay' ? 'orange' : 'green'}
              borderRadius="12px"
              fontWeight="800"
              onClick={handleSettle}
              isLoading={submitting}
              loadingText="Processing…"
              isDisabled={!order || loading || discountStale || (showErrors && !isValid)}
            >
              {settleLabel}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {guestSelectorOpen && (
        <GuestSelector
          isOpen={guestSelectorOpen}
          onClose={() => setGuestSelectorOpen(false)}
          order={order}
          onGuestSelect={(selected) => {
            setGuest(selected);
            setGuestSelectorOpen(false);
          }}
        />
      )}
    </>
  );
};

const Row = ({ label, value, strong, color }) => (
  <Flex justify="space-between" fontWeight={strong ? '700' : '500'} color={color}>
    <Text>{label}</Text>
    <Text>{value}</Text>
  </Flex>
);

export default SettlePaymentModal;
