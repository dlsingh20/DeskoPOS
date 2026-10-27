import React, { useState } from 'react';
import { Alert, AlertDescription, AlertIcon, Button, Flex, HStack, Text, Tooltip, useToast } from '@chakra-ui/react';
import DiscountDialog from './DiscountDialog';
import discountService, { getDiscountInfo } from '../../services/DiscountService';
import { useAccess } from '../../context/AccessContext';

/**
 * "Disc:" row for a bill summary, with Apply / Edit / Remove.
 * Warns when a percent discount no longer matches the subtotal (items changed),
 * and offers to re-apply it.
 *
 * @param {boolean} canEdit - false for closed bills: the row is shown read-only
 * @param {Function} onOrderUpdated - receives the fresh order after any change
 */
const DiscountLine = ({ order, formatPrice, getCurrencySymbol, canEdit, onOrderUpdated, mutedColor, isDisabled, disabledReason }) => {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { access, requestApproval } = useAccess();
  if (!order) return null;

  const info = getDiscountInfo(order);
  const has = info.amount > 0;
  const label = has && info.type === 'percent' && info.percent ? `Disc (${info.percent}%)` : 'Disc';

  const handleApplied = (updated, removed, failed) => {
    onOrderUpdated?.(updated);
    if (failed) return;
    const next = getDiscountInfo(updated);
    toast({
      title: removed ? 'Discount removed' : 'Discount applied',
      description: removed
        ? `New total ${formatPrice(updated.total_amount)}.`
        : `${formatPrice(next.amount)} off. New total ${formatPrice(updated.total_amount)}.`,
      status: 'success',
      duration: 3000,
    });
  };

  const run = async (action) => {
    setBusy(true);
    try {
      const updated = await action();
      handleApplied(updated, false);
    } catch (error) {
      if (error.order) onOrderUpdated?.(error.order);
      toast({ title: 'Discount not changed', description: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Re-saves the discount after the bill changed. Keeps an earlier approval; asks for one if the
   * discount is now above the user's limit and nobody approved it before.
   */
  const resave = async (type, value, percentOfSubtotal) => {
    let approvedBy = info.note?.approvedBy || '';
    let approvalId = null;
    if (!approvedBy && percentOfSubtotal > (access?.discountLimit ?? 100) + 0.001) {
      const approver = await requestApproval({
        permission: 'discount.unlimited',
        title: `Discount of ${percentOfSubtotal}% on bill #${order.order_number}`,
        detail: `Your limit is ${access.discountLimit}% of the subtotal.`,
        orderId: order.id,
        context: { discount_type: type, discount_value: String(value) },
      });
      if (!approver) return;
      approvedBy = approver.self ? '' : approver.name;
      approvalId = approver.approvalId || null;
    }
    run(() => discountService.applyDiscount({
      orderId: order.id,
      type,
      value,
      reason: info.note?.reason || 'Other',
      expectedSubtotal: order.subtotal,
      approvedBy,
      approvalId,
    }));
  };

  const subtotal = parseFloat(order.subtotal) || 0;
  const reapply = () => resave('percent', info.percent, info.percent);
  const keepAmount = () => resave('fixed', info.amount.toFixed(2), subtotal > 0 ? Math.round((info.amount / subtotal) * 10000) / 100 : 100);

  return (
    <>
      <Flex justify="space-between" align="center" fontSize="sm" fontWeight="500" color={has ? 'green.600' : mutedColor} minH="24px">
        <HStack spacing={2}>
          <Tooltip
            isDisabled={!info.note}
            label={info.note ? `${info.note.reason}${info.note.by ? ` · by ${info.note.by}` : ''}` : ''}
            fontSize="xs"
          >
            <Text>{label}:</Text>
          </Tooltip>
          {canEdit && (
            <Tooltip label={disabledReason} isDisabled={!isDisabled || !disabledReason} fontSize="xs">
              <Button
                size="xs"
                variant="link"
                colorScheme="blue"
                onClick={() => setDialogOpen(true)}
                isDisabled={isDisabled || busy}
                aria-label={has ? 'Edit discount' : 'Apply discount'}
              >
                {has ? 'Edit' : 'Apply'}
              </Button>
            </Tooltip>
          )}
        </HStack>
        <Text>{has ? `− ${formatPrice(info.amount)}` : '—'}</Text>
      </Flex>

      {canEdit && info.stale && (
        <Alert status="warning" borderRadius="8px" py={2} px={3} mt={1} fontSize="xs" alignItems="flex-start">
          <AlertIcon boxSize={4} mt={0.5} />
          <AlertDescription>
            The bill changed after the {info.percent}% discount was applied. {info.percent}% is now {formatPrice(info.expectedAmount)}, but {formatPrice(info.amount)} is applied.
            <HStack spacing={2} mt={1.5}>
              <Button size="xs" colorScheme="orange" onClick={reapply} isLoading={busy}>Re-apply {info.percent}%</Button>
              <Button size="xs" variant="outline" onClick={keepAmount} isDisabled={busy}>Keep {formatPrice(info.amount)}</Button>
            </HStack>
          </AlertDescription>
        </Alert>
      )}

      {dialogOpen && (
        <DiscountDialog
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          order={order}
          formatPrice={formatPrice}
          getCurrencySymbol={getCurrencySymbol}
          onApplied={handleApplied}
        />
      )}
    </>
  );
};

export default DiscountLine;
