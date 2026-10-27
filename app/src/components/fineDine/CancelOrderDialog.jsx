import React, { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
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
  VStack,
  useToast,
} from '@chakra-ui/react';
import orderService from '../../services/OrderService';
import settlementService from '../../services/SettlementService';
import { useAccess } from '../../context/AccessContext';
import { calculatePaidAmount } from '../../utils/orderUtils';
import { formatElapsed, getBillableItems, getOrderStartTime, getShortOrderNumber } from '../../utils/fineDineUtils';

export const CANCEL_REASONS = [
  'Guest left without ordering',
  'Guest cancelled',
  'Test order',
  'Duplicate order',
  'Opened by mistake',
  'Other',
];

/**
 * Cancel an open order with a reason.
 * - Orders with payments cannot be cancelled (settle or refund them).
 * - Orders with items are a void: users without order.void_items need a manager's approval.
 * - The table is freed when no other order is open on it.
 */
const CancelOrderDialog = ({ isOpen, onClose, order, formatPrice, onCancelled }) => {
  const toast = useToast();
  const { userName, requestApproval } = useAccess();
  const [reasonChoice, setReasonChoice] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setReasonChoice('');
    setOtherReason('');
    setError(null);
  }, [isOpen]);

  if (!order) return null;
  const items = getBillableItems(order);
  const paid = calculatePaidAmount(order);
  const reason = reasonChoice === 'Other' ? otherReason.trim() : reasonChoice;
  const age = formatElapsed(getOrderStartTime(order), new Date());

  const confirm = async () => {
    if (!reason) {
      setError('Choose a reason.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Re-read: another device may have added items or taken a payment
      const fresh = await orderService.getOrder(order.id);
      if (calculatePaidAmount(fresh) > 0.009) {
        setError('This order has a payment recorded, so it cannot be cancelled. Settle it, or refund the payment first.');
        return;
      }
      let approver = null;
      if (getBillableItems(fresh).length > 0) {
        approver = await requestApproval({
          permission: 'order.void_items',
          title: `Cancel order ${getShortOrderNumber(fresh)}`,
          detail: `${getBillableItems(fresh).length} item(s) will be voided. Reason: ${reason}.`,
          orderId: fresh.id,
          context: { reason },
        });
        if (!approver) return;
      }
      const auditLine = `[Cancel] ${reason} | By: ${userName || 'Unknown'}${approver && !approver.self ? ` | Approved: ${approver.name}` : ''}`;
      await orderService.cancelOrder(fresh.id, reason, { approvalId: approver?.approvalId || null, auditLine });
      const freed = await settlementService.releaseTableIfFree(fresh).catch(() => false);
      toast({
        title: `Order ${getShortOrderNumber(fresh)} cancelled`,
        description: `${reason}.${freed ? ' The table is free.' : ''}`,
        status: 'success',
        duration: 4000,
      });
      onCancelled?.(fresh);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not cancel the order.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>Cancel order {getShortOrderNumber(order)}</ModalHeader>
        <ModalCloseButton isDisabled={busy} />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <Box fontSize="sm">
              <Text>{order.table_number ? `Table ${order.table_number}` : 'Takeaway'} · open {age}</Text>
              <Text>
                {items.length ? `${items.length} item(s), ${formatPrice(order.total_amount || 0)}` : 'No items on this order.'}
              </Text>
            </Box>
            {paid > 0.009 ? (
              <Alert status="error" borderRadius="10px" fontSize="sm">
                <AlertIcon />
                <AlertDescription>{formatPrice(paid)} has been paid on this order, so it cannot be cancelled. Settle the rest instead.</AlertDescription>
              </Alert>
            ) : (
              <>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Reason</FormLabel>
                  <Select placeholder="Choose a reason" value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)}>
                    {CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  {reasonChoice === 'Other' && (
                    <Input mt={2} placeholder="Describe the reason" value={otherReason} maxLength={120} onChange={(e) => setOtherReason(e.target.value.replace(/[|\n]/g, ' '))} />
                  )}
                </FormControl>
                {items.length > 0 && (
                  <Text fontSize="xs" color="gray.500">The items are voided and the bill is shown as Cancelled in History and Reports. A manager's approval is needed if your role cannot void items.</Text>
                )}
              </>
            )}
            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={busy}>Keep order</Button>
          <Button colorScheme="red" onClick={confirm} isLoading={busy} loadingText="Cancelling" isDisabled={paid > 0.009}>Cancel order</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CancelOrderDialog;
