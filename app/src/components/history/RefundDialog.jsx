import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Textarea,
  VStack,
  useToast,
} from '@chakra-ui/react';
import orderService from '../../services/OrderService';
import { newIdempotencyKey } from '../../services/SettlementService';
import { describeApiError } from '../../services/UserService';
import { useAccess } from '../../context/AccessContext';
import { useCashCounter } from '../../context/CashCounterContext';
import { getPaymentLabel, money } from '../../utils/historyUtils';
import { REFUND_REASONS, refundablePayments, round2 } from '../../utils/refunds';

/**
 * Refund all or part of a settled bill (DeskoPOS). Each payment is refunded up to what is left on
 * it; cash comes out of the open counter. Needs bill.refund or a manager's approval.
 */
const RefundDialog = ({ isOpen, onClose, bill, formatPrice, onRefunded }) => {
  const toast = useToast();
  const { requestApproval } = useAccess();
  const { ensureCounter, shift } = useCashCounter();
  const [lines, setLines] = useState({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const keyRef = useRef(null);

  const available = bill ? refundablePayments(bill.payments) : [];

  useEffect(() => {
    if (!isOpen || !bill) return;
    // Everything left on every payment, ready to trim
    setLines(Object.fromEntries(refundablePayments(bill.payments)
      .map(({ payment, left }) => [payment.id, { checked: true, amount: left.toFixed(2), reference: '' }])));
    setReason('');
    setNote('');
    setError(null);
    keyRef.current = newIdempotencyKey();
  }, [isOpen, bill]);

  if (!bill) return null;

  const setLine = (id, patch) => setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const chosen = available.filter(({ payment }) => lines[payment.id]?.checked);
  const total = round2(chosen.reduce((sum, { payment }) => sum + (parseFloat(lines[payment.id]?.amount) || 0), 0));
  const reasonLabel = REFUND_REASONS.find((r) => r.key === reason)?.label || '';

  const problem = () => {
    if (!chosen.length) return 'Choose a payment to refund.';
    for (const { payment, left } of chosen) {
      const amount = parseFloat(lines[payment.id].amount);
      if (!(amount > 0)) return `Enter the amount to refund on ${getPaymentLabel(payment)}.`;
      if (amount > left + 0.004) return `At most ${formatPrice(left)} can be refunded on ${getPaymentLabel(payment)}.`;
    }
    if (!reason) return 'Choose a reason.';
    if (reason === 'other' && !note.trim()) return 'Say why the bill is refunded.';
    return null;
  };

  const confirm = async () => {
    const message = problem();
    if (message) {
      setError(message);
      return;
    }
    if (chosen.some(({ payment }) => payment.method === 'cash') && !ensureCounter()) return;
    setBusy(true);
    setError(null);
    try {
      const approver = await requestApproval({
        permission: 'bill.refund',
        title: `Refund bill #${String(bill.billNo).replace(/^#/, '')}`,
        detail: `${formatPrice(total)} back to the guest. Reason: ${reasonLabel}.`,
        orderId: bill.id,
        context: { amount: total.toFixed(2), reason },
      });
      if (!approver) return;
      const result = await orderService.refundOrder(bill.id, {
        refunds: chosen.map(({ payment }) => ({
          payment_id: payment.id,
          amount: round2(parseFloat(lines[payment.id].amount)).toFixed(2),
          reference: lines[payment.id].reference.trim(),
        })),
        reason,
        note: note.trim(),
        approvalId: approver.approvalId || null,
        cashRegisterId: shift?.id ?? null,
        idempotencyKey: keyRef.current,
      });
      toast({
        title: `Refunded ${formatPrice(total)}`,
        description: `Credit note ${result.refund?.credit_note_number || ''}${result.status === 'refunded' ? ' · the bill is fully refunded' : ''}.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      onRefunded?.(result);
      onClose();
    } catch (err) {
      setError(describeApiError(err, 'Could not refund the bill.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>Refund bill #{String(bill.billNo).replace(/^#/, '')}</ModalHeader>
        <ModalCloseButton isDisabled={busy} />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            {available.length === 0 ? (
              <Alert status="info" borderRadius="10px" fontSize="sm">
                <AlertIcon />
                <AlertDescription>Nothing on this bill can be refunded here. Credit Pay and Guest Visit payments are not refunded from the POS.</AlertDescription>
              </Alert>
            ) : (
              <>
                <Text fontSize="sm" color="gray.500">Choose what goes back to the guest. Cash comes out of your open counter; for card and UPI, refund on the terminal or app first and enter its reference.</Text>
                {available.map(({ payment, left }) => {
                  const line = lines[payment.id] || {};
                  return (
                    <Box key={payment.id} borderWidth="1px" borderRadius="10px" p={3}>
                      <Flex justify="space-between" align="center" mb={line.checked ? 2 : 0}>
                        <Checkbox isChecked={!!line.checked} onChange={(e) => setLine(payment.id, { checked: e.target.checked })}>
                          <Text as="span" fontWeight="600">{getPaymentLabel(payment)}</Text>
                        </Checkbox>
                        <Text fontSize="sm" color="gray.500">{formatPrice(left)} left of {formatPrice(money(payment.amount))}</Text>
                      </Flex>
                      {line.checked && (
                        <Flex gap={2}>
                          <Input size="sm" type="number" inputMode="decimal" min="0" step="0.01" value={line.amount}
                            aria-label={`Amount to refund on ${getPaymentLabel(payment)}`}
                            onChange={(e) => setLine(payment.id, { amount: e.target.value })} />
                          {payment.method !== 'cash' && (
                            <Input size="sm" placeholder="Refund reference" value={line.reference} maxLength={100}
                              aria-label={`Refund reference for ${getPaymentLabel(payment)}`}
                              onChange={(e) => setLine(payment.id, { reference: e.target.value })} />
                          )}
                        </Flex>
                      )}
                    </Box>
                  );
                })}
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Reason</FormLabel>
                  <Select placeholder="Choose a reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REFUND_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </Select>
                </FormControl>
                <FormControl isRequired={reason === 'other'}>
                  <FormLabel fontSize="sm">Note</FormLabel>
                  <Textarea size="sm" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)}
                    placeholder={reason === 'other' ? 'Why is the bill refunded?' : 'Optional'} />
                </FormControl>
                <Flex justify="space-between" fontWeight="700">
                  <Text>Refund total</Text><Text>{formatPrice(total)}</Text>
                </Flex>
              </>
            )}
            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={busy}>Close</Button>
          <Button colorScheme="purple" onClick={confirm} isLoading={busy} loadingText="Refunding" isDisabled={available.length === 0}>
            Refund {formatPrice(total)}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RefundDialog;
