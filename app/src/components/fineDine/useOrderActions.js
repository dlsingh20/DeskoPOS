import { useCallback, useState } from 'react';
import { useToast } from '@chakra-ui/react';
import orderService from '../../services/OrderService';
import PrintService from '../../services/PrintService';
import {
  buildKOTData,
  getShortOrderNumber,
  KITCHEN_PENDING_STATUS,
  KITCHEN_SENT_STATUS,
} from '../../utils/fineDineUtils';

// Shared across every component using the hook, so the same order cannot be
// sent to the kitchen twice from the card and the popup at the same time.
const inFlight = new Set();

const describePrintError = (error) => {
  if (error?.message === 'Popup blocked') {
    return 'The browser blocked the print window. Allow pop-ups for this site, or switch to the Companion App in Settings.';
  }
  return error?.message || 'The printer did not respond. Check the printer connection and try again.';
};

/**
 * KOT printing and kitchen transfer actions with busy-state tracking.
 * busy maps orderId -> 'print' | 'kitchen'
 */
const useOrderActions = ({ onOrderChanged } = {}) => {
  const toast = useToast();
  const [busy, setBusy] = useState({});

  const setOrderBusy = (orderId, action) =>
    setBusy((prev) => {
      const next = { ...prev };
      if (action) next[orderId] = action;
      else delete next[orderId];
      return next;
    });

  /**
   * Print a KOT for the order. Pass `items` to print only those lines, and `kotNumber` when
   * they are on a numbered KOT.
   */
  const printKOT = useCallback(async (order, items = null, kotNumber = null) => {
    const key = `print-${order.id}`;
    if (inFlight.has(key)) return false;

    const kotData = buildKOTData(order, items, kotNumber);
    if (kotData.items.length === 0) {
      toast({ title: 'Nothing to print', description: 'This order has no items yet.', status: 'warning', duration: 3000 });
      return false;
    }

    inFlight.add(key);
    setOrderBusy(order.id, 'print');
    try {
      await PrintService.printKOT(kotData);
      toast({
        title: 'KOT sent to printer',
        description: `${getShortOrderNumber(order)} · ${kotData.tableNumber}`,
        status: 'success',
        duration: 2500,
      });
      return true;
    } catch (error) {
      toast({ title: 'KOT print failed', description: describePrintError(error), status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      inFlight.delete(key);
      setOrderBusy(order.id, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  /**
   * Send a pending order to the kitchen (pending -> confirmed).
   * Refuses orders that were already sent, and ignores repeated clicks.
   */
  const sendToKitchen = useCallback(async (order) => {
    const key = `kitchen-${order.id}`;
    if (inFlight.has(key)) return null;

    if (order.status !== KITCHEN_PENDING_STATUS) {
      toast({ title: 'Already in the kitchen', description: `${getShortOrderNumber(order)} is ${order.status}.`, status: 'info', duration: 3000 });
      return null;
    }

    inFlight.add(key);
    setOrderBusy(order.id, 'kitchen');
    try {
      // Re-read the order so a second terminal's transfer is not repeated
      const latest = await orderService.getOrder(order.id);
      if (latest.status !== KITCHEN_PENDING_STATUS) {
        toast({ title: 'Already in the kitchen', description: `${getShortOrderNumber(latest)} is ${latest.status}.`, status: 'info', duration: 3000 });
        onOrderChanged?.(latest);
        return latest;
      }

      await orderService.updateOrderStatus(order.id, KITCHEN_SENT_STATUS);
      const updated = await orderService.getOrder(order.id);
      toast({
        title: 'Sent to kitchen',
        description: `${getShortOrderNumber(updated)}${updated.table_number ? ` · Table ${updated.table_number}` : ''}`,
        status: 'success',
        duration: 2500,
      });
      onOrderChanged?.(updated);
      return updated;
    } catch (error) {
      toast({ title: 'Could not send to kitchen', description: error.message, status: 'error', duration: 6000, isClosable: true });
      return null;
    } finally {
      inFlight.delete(key);
      setOrderBusy(order.id, null);
    }
  }, [toast, onOrderChanged]);

  /**
   * Print the customer bill in the saved bill format. The order is re-read first
   * so the bill shows the latest items, discount and payments.
   */
  const printBill = useCallback(async (order, { duplicate = false } = {}) => {
    const key = `bill-${order.id}`;
    if (inFlight.has(key)) return false;
    inFlight.add(key);
    setOrderBusy(order.id, 'bill');
    try {
      const printed = await PrintService.printBillById(order.id, { duplicate });
      toast({ title: 'Bill sent to printer', description: getShortOrderNumber(printed), status: 'success', duration: 2500 });
      return true;
    } catch (error) {
      toast({ title: 'Bill print failed', description: describePrintError(error), status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      inFlight.delete(key);
      setOrderBusy(order.id, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  return { busy, printKOT, printBill, sendToKitchen };
};

export default useOrderActions;
