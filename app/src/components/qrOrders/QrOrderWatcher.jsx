import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { usePOS } from '../../context/POSContext';
import orderService from '../../services/OrderService';
import { IS_DESKOPOS } from '../../services/backend';
import PrintService from '../../services/PrintService';
import printSettingsService from '../../services/PrintSettingsService';
import { buildKOTData, KITCHEN_PENDING_STATUS } from '../../utils/fineDineUtils';
import { pendingQrItems } from '../../utils/tableQr';

const POLL_MS = 15000;
const HANDLED_LIMIT = 3000;
// On the first check after the app opens, older unsent QR items are treated as already handled
const BACKLOG_MS = 30 * 60 * 1000;

const handledKey = (restaurantId) => `pos_qr_handled:${restaurantId}`;

const loadHandled = (restaurantId) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(handledKey(restaurantId)) || '[]').map(String));
  } catch (error) {
    return new Set();
  }
};

const saveHandled = (restaurantId, set) => {
  try {
    localStorage.setItem(handledKey(restaurantId), JSON.stringify(Array.from(set).slice(-HANDLED_LIMIT)));
  } catch (error) {
    // Private mode: items may alert again after a reload
  }
};

const beep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch (error) {
    // Sound is optional
  }
};

const tableText = (order) => (order.table_number ? `Table ${order.table_number}` : `Order ${order.order_number}`);

/**
 * Watches open orders for items guests placed by scanning a table QR code.
 *
 * Every device shows an alert. The device set to handle QR orders (Tables → QR ordering) also:
 *  - auto mode: prints the KOT for the new items and sends a pending order to the kitchen;
 *  - accept mode: asks the cashier to Accept (print KOT, send to kitchen) or Reject (remove the items).
 *
 * QR items are recognised by the order/item `source` the backend sets for QR orders; until the
 * backend sends it, nothing is detected (see docs/MISSING_APIS.md → QR table ordering).
 */
const QrOrderWatcher = () => {
  const { state, loadTables } = usePOS();
  const toast = useToast();
  const restaurant = state.selectedRestaurant;
  const [queue, setQueue] = useState([]); // accept mode: [{ order, items }]
  const [busy, setBusy] = useState(false);
  const handledRef = useRef(new Set());
  const firstRunRef = useRef(true);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!restaurant) return;
    handledRef.current = loadHandled(restaurant.id);
    firstRunRef.current = true;
    setQueue([]);
  }, [restaurant]);

  const markHandled = useCallback((items) => {
    items.forEach((i) => handledRef.current.add(String(i.id)));
    if (restaurant) saveHandled(restaurant.id, handledRef.current);
  }, [restaurant]);

  const sendToKitchen = useCallback(async (order, items) => {
    if (IS_DESKOPOS) {
      // The service numbers the KOT and sends a pending order to the kitchen in one step
      const kot = await orderService.sendKot(order.id);
      await PrintService.printKOT(buildKOTData(order, kot?.items?.length ? kot.items : items, kot?.kot_number));
      return;
    }
    await PrintService.printKOT(buildKOTData(order, items));
    if (order.status === KITCHEN_PENDING_STATUS) {
      await orderService.updateOrderStatus(order.id, 'confirmed').catch(() => {});
    }
  }, []);

  const check = useCallback(async () => {
    if (!restaurant || runningRef.current || document.hidden) return;
    runningRef.current = true;
    try {
      const settings = printSettingsService.get(restaurant.id).qrOrders;
      const orders = await orderService.getOpenOrders(restaurant.id);
      const now = Date.now();
      const batches = [];
      orders.forEach((order) => {
        let items = pendingQrItems(order, handledRef.current);
        if (firstRunRef.current) {
          const old = items.filter((i) => now - new Date(i.created_at || order.order_time || 0).getTime() > BACKLOG_MS);
          if (old.length) markHandled(old);
          items = items.filter((i) => !old.includes(i));
        }
        if (items.length) batches.push({ order, items });
      });
      firstRunRef.current = false;
      if (!batches.length) return;

      if (settings.sound) beep();
      for (const { order, items } of batches) {
        const qty = items.reduce((n, i) => n + (parseInt(i.quantity, 10) || 0), 0);
        if (settings.handleOnThisDevice && settings.mode === 'auto') {
          try {
            await sendToKitchen(order, items);
            toast({ title: `New QR order · ${tableText(order)}`, description: `${qty} item(s) sent to the kitchen and KOT printed.`, status: 'info', duration: 8000, isClosable: true });
          } catch (error) {
            toast({ title: `QR order · ${tableText(order)}: KOT not printed`, description: `${error.message || 'Printer error'}. Print the KOT from the table.`, status: 'error', duration: null, isClosable: true });
          }
          markHandled(items);
        } else if (settings.handleOnThisDevice && settings.mode === 'accept') {
          markHandled(items);
          setQueue((q) => [...q, { order, items }]);
        } else {
          toast({ title: `New QR order · ${tableText(order)}`, description: `${qty} item(s) from the guest's phone.`, status: 'info', duration: 8000, isClosable: true });
          markHandled(items);
        }
      }
      if (loadTables) loadTables(restaurant.id);
    } catch (error) {
      // Polling: try again next time
    } finally {
      runningRef.current = false;
    }
  }, [restaurant, toast, markHandled, sendToKitchen, loadTables]);

  useEffect(() => {
    if (!restaurant) return undefined;
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [restaurant, check]);

  const current = queue[0];

  const accept = async () => {
    setBusy(true);
    try {
      const fresh = await orderService.getOrder(current.order.id).catch(() => current.order);
      await sendToKitchen(fresh, current.items);
      toast({ title: `Accepted · ${tableText(fresh)}`, description: 'KOT printed and sent to the kitchen.', status: 'success', duration: 4000 });
      setQueue((q) => q.slice(1));
    } catch (error) {
      toast({ title: 'KOT not printed', description: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      const fresh = await orderService.getOrder(current.order.id);
      const others = (fresh.items || []).filter((i) => i.status !== 'cancelled' && !current.items.some((q) => q.id === i.id));
      if (!others.length && fresh.status === KITCHEN_PENDING_STATUS) {
        await orderService.cancelOrder(fresh.id, 'Rejected QR order');
      } else {
        for (const item of current.items) await orderService.removeItemFromOrder(fresh.id, item.id);
      }
      toast({ title: `Rejected · ${tableText(fresh)}`, status: 'info', duration: 4000 });
      setQueue((q) => q.slice(1));
      if (loadTables && restaurant) loadTables(restaurant.id);
    } catch (error) {
      toast({ title: 'Could not reject the order', description: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  if (!current) return null;
  return (
    <Modal isOpen onClose={() => {}} closeOnOverlayClick={false} closeOnEsc={false} isCentered size="md">
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>
          <HStack><Text>New QR order · {tableText(current.order)}</Text>{queue.length > 1 && <Badge colorScheme="orange">{queue.length} waiting</Badge>}</HStack>
        </ModalHeader>
        <ModalBody>
          <VStack align="stretch" spacing={2}>
            {current.items.map((i) => (
              <Box key={i.id}>
                <Text fontWeight="600">{i.quantity} × {i.menu_item_name}</Text>
                {i.special_instructions && <Text fontSize="sm" color="gray.500">{i.special_instructions}</Text>}
              </Box>
            ))}
            {current.order.customer_name && <Text fontSize="sm" color="gray.500">Guest: {current.order.customer_name}{current.order.customer_phone ? ` · ${current.order.customer_phone}` : ''}</Text>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="outline" colorScheme="red" onClick={reject} isDisabled={busy}>Reject</Button>
          <Button colorScheme="green" onClick={accept} isLoading={busy} loadingText="Printing">Accept &amp; print KOT</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default QrOrderWatcher;
