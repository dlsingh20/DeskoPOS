import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Box,
  Flex,
  HStack,
  Text,
  Badge,
  Button,
  Input,
  Spinner,
  Center,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useBreakpointValue,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { Printer, ChefHat, Pencil, Plus, Receipt, Split, Wallet } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useAccess } from '../../context/AccessContext';
import orderService from '../../services/OrderService';
import { IS_DESKOPOS } from '../../services/backend';
import MenuItemSearch from './MenuItemSearch';
import CurrentOrderSummary from './CurrentOrderSummary';
import useOrderActions from './useOrderActions';
import SettlePaymentModal from '../payment/SettlePaymentModal';
import CancelOrderDialog from './CancelOrderDialog';
import {
  isActiveOrder,
  isEditableOrder,
  formatElapsed,
  getOrderStartTime,
  getShortOrderNumber,
  getTableLabel,
  getLinkedTables,
  getOrderTableIds,
  getOrderTablesLabel,
  isMergedOrder,
  KITCHEN_PENDING_STATUS,
} from '../../utils/fineDineUtils';

const STATUS_COLORS = {
  pending: 'yellow',
  confirmed: 'blue',
  preparing: 'orange',
  ready: 'green',
  served: 'purple',
  completed: 'gray',
  cancelled: 'red',
};

/**
 * Order popup for a table or a takeaway order.
 * - No order yet: build a draft and place it.
 * - Existing order: add, edit and remove items; print KOT; send to kitchen.
 * - View mode: read-only until the user chooses "Edit order".
 */
const OrderModal = ({
  isOpen,
  onClose,
  restaurant,
  table = null,
  orderType = 'dine_in',
  orderId = null,
  initialMode = 'edit',
  onChanged,
}) => {
  const { state, loadMenuItems, formatPrice, getCurrencySymbol } = usePOS();
  const { can, requestApproval } = useAccess();
  const toast = useToast();
  const modalSize = useBreakpointValue({ base: 'full', lg: '6xl' });
  const panelBg = useColorModeValue('gray.50', 'gray.900');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const inputBg = useColorModeValue('white', 'gray.800');

  const [order, setOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [draft, setDraft] = useState([]);
  const [query, setQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyItemId, setBusyItemId] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [unmerging, setUnmerging] = useState(false);
  const cancelRemovalRef = useRef(null);
  const submittingRef = useRef(false);

  const handleOrderChanged = useCallback((updated) => {
    if (updated) setOrder(updated);
    onChanged?.();
  }, [onChanged]);

  const { busy, printKOT, printBill, sendToKitchen } = useOrderActions({ onOrderChanged: handleOrderChanged });

  /** Find an open order already on this table, or the bill it's merged into (from any terminal) */
  const findOpenTableOrder = useCallback(async () => {
    if (!table) return null;
    const orders = await orderService.getOrders({ table_id: table.id, restaurant_id: restaurant.id });
    return orders
      .filter((o) => isActiveOrder(o)
        && (o.table === undefined || getOrderTableIds(o).some((id) => String(id) === String(table.id))))
      .sort((a, b) => new Date(getOrderStartTime(a)) - new Date(getOrderStartTime(b)))[0] || null;
  }, [table, restaurant]);

  const refreshOrder = useCallback(async (id) => {
    const fresh = await orderService.getOrder(id);
    setOrder(fresh);
    return fresh;
  }, []);

  // Reset and load whenever the popup opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setDraft([]);
    setQuery('');
    setCustomerName('');
    setMode(initialMode);
    setOrder(null);

    const load = async () => {
      setLoadingOrder(true);
      try {
        if (orderId) {
          const fresh = await orderService.getOrder(orderId);
          if (!cancelled) setOrder(fresh);
        } else if (table) {
          const existing = await findOpenTableOrder();
          if (!cancelled && existing) {
            const fresh = await orderService.getOrder(existing.id);
            if (!cancelled) setOrder(fresh);
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast({ title: 'Could not load the order', description: error.message, status: 'error', duration: 5000, isClosable: true });
        }
      } finally {
        if (!cancelled) setLoadingOrder(false);
      }
    };
    load();

    if (restaurant?.id && (!state.menuItems || state.menuItems.length === 0)) {
      loadMenuItems(restaurant.id);
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orderId, table?.id]);

  // ---- Draft editing -------------------------------------------------------

  const draftQuantities = Object.fromEntries(draft.map((line) => [line.menuItem.id, line.quantity]));

  const addToDraft = (menuItem) => {
    setDraft((prev) => {
      const existing = prev.find((line) => line.menuItem.id === menuItem.id);
      if (existing) {
        return prev.map((line) => (line.menuItem.id === menuItem.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...prev, { menuItem, quantity: 1, note: '' }];
    });
  };

  const setDraftQuantity = (menuItemId, quantity) => {
    setDraft((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.menuItem.id !== menuItemId)
        : prev.map((line) => (line.menuItem.id === menuItemId ? { ...line, quantity } : line))
    );
  };

  const setDraftNote = (menuItemId, note) => {
    setDraft((prev) => prev.map((line) => (line.menuItem.id === menuItemId ? { ...line, note } : line)));
  };

  // On a merged bill opened from one of the merged tables, new lines belong to that table
  const orderingTableId = table && order && String(order.table) !== String(table.id) ? table.id : null;

  const toOrderItem = (line) => ({
    menu_item: line.menuItem.id,
    menu_item_id: line.menuItem.id,
    quantity: line.quantity,
    unit_price: parseFloat(line.menuItem.price) || 0,
    special_instructions: line.note.trim(),
    table: orderingTableId,
  });

  // ---- Server actions ------------------------------------------------------

  const placeOrder = async (printAfter) => {
    if (submittingRef.current || draft.length === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Another terminal may have opened an order on this table meanwhile
      const existing = await findOpenTableOrder();
      if (existing) {
        await refreshOrder(existing.id);
        toast({
          title: 'This table already has an open order',
          description: 'Your items are still listed. Review them and choose "Add items" to add them to the existing order.',
          status: 'warning',
          duration: 7000,
          isClosable: true,
        });
        return;
      }

      const created = await orderService.createOrder({
        restaurant: restaurant.id,
        table: table?.id ?? null,
        type: orderType,
        customer_name: customerName.trim() || null,
        items: draft.map(({ menuItem, quantity, note }) => ({
          menu_item: menuItem.id,
          quantity,
          unit_price: parseFloat(menuItem.price) || 0,
          special_instructions: note.trim(),
        })),
      });

      setDraft([]);
      const fresh = await refreshOrder(created.id).catch(() => { setOrder(created); return created; });
      toast({ title: 'Order placed', description: `${getShortOrderNumber(fresh)}${table ? ` · Table ${getTableLabel(table)}` : ''}`, status: 'success', duration: 3000 });
      onChanged?.();
      if (printAfter) await printKOT(fresh);
    } catch (error) {
      toast({ title: 'Could not place the order', description: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const addItems = async (printAfter) => {
    if (submittingRef.current || !order || draft.length === 0) return;
    submittingRef.current = true;
    setSubmitting(true);

    // Add one line at a time and drop it from the draft as soon as it is saved,
    // so a retry after a failure never adds the same line twice.
    const added = [];
    let failure = null;
    for (const line of draft) {
      try {
        const [saved] = await orderService.addItemsToOrder(order.id, [toOrderItem(line)]);
        added.push({ ...saved, menu_item_name: saved?.menu_item_name || line.menuItem.name, special_instructions: line.note.trim() });
        setDraft((prev) => prev.filter((l) => l.menuItem.id !== line.menuItem.id));
      } catch (error) {
        failure = error;
        break;
      }
    }

    let fresh = order;
    try {
      fresh = await refreshOrder(order.id);
    } catch (error) {
      console.error('Failed to refresh order after adding items:', error);
    }
    // DeskoPOS: items added to an order the kitchen already has go on their own numbered KOT
    let kot = null;
    if (IS_DESKOPOS && added.length && fresh.status !== KITCHEN_PENDING_STATUS) {
      try {
        kot = await orderService.sendKot(order.id);
        if (kot) fresh = await refreshOrder(order.id).catch(() => fresh);
      } catch (error) {
        toast({
          title: 'KOT not recorded',
          description: `${error.message}. The items are on the order.`,
          status: 'warning',
          duration: 6000,
          isClosable: true,
        });
      }
    }
    onChanged?.();

    if (failure) {
      toast({
        title: added.length ? `Added ${added.length} of ${draft.length} items` : 'Could not add items',
        description: `${failure.message}. Items not added are still listed — try again.`,
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
    } else {
      toast({ title: `Added ${added.length} ${added.length === 1 ? 'item' : 'items'}`, status: 'success', duration: 2500 });
    }

    // A merged bill can send several KOTs (one per table): each item carries its own number then
    if (printAfter && added.length) {
      await printKOT(fresh, kot?.items?.length ? kot.items : added, kot?.kots?.length > 1 ? null : kot?.kot_number);
    }

    submittingRef.current = false;
    setSubmitting(false);
  };

  /**
   * Reducing or removing an item the kitchen already has is a void: it needs 'order.void_items'
   * (or a manager's approval) and is recorded with POST order-items/{id}/void/.
   * Items still pending use the normal quantity change / delete.
   *
   * @param {Object} item - saved order item
   * @param {number} newQuantity - 0 removes the item
   */
  const changeItem = async (item, newQuantity) => {
    const removing = newQuantity <= 0;
    const sentToKitchen = order.status !== KITCHEN_PENDING_STATUS;
    const description = removing
      ? `Remove ${item.quantity} x ${item.menu_item_name}`
      : `Reduce ${item.menu_item_name} from ${item.quantity} to ${newQuantity}`;

    let approver = null;
    if (sentToKitchen && newQuantity < item.quantity) {
      approver = await requestApproval({
        permission: 'order.void_items',
        title: description,
        detail: `${item.menu_item_name} was already sent to the kitchen.`,
        orderId: order.id,
        context: { order_item_id: item.id, quantity: item.quantity - Math.max(0, newQuantity) },
      });
      if (!approver) return;
    }

    setBusyItemId(item.id);
    try {
      if (approver) {
        await orderService.voidOrderItem(item.id, {
          quantity: item.quantity - Math.max(0, newQuantity),
          reason: description,
          approvalId: approver.approvalId,
          // Older backends: change the line and keep the approval in the order notes
          fallback: async () => {
            if (removing) await orderService.removeItemFromOrder(order.id, item.id);
            else await orderService.updateOrderItemQuantity(order.id, item.id, newQuantity);
            if (!approver.self) {
              await orderService.appendOrderNote(order.id, `[Void] ${description} | Approved: ${approver.name}`).catch(() => {});
            }
          },
        });
      } else if (removing) {
        await orderService.removeItemFromOrder(order.id, item.id);
      } else {
        await orderService.updateOrderItemQuantity(order.id, item.id, newQuantity);
      }
      await refreshOrder(order.id);
      if (removing) toast({ title: `Removed ${item.menu_item_name}`, status: 'success', duration: 2500 });
      onChanged?.();
    } catch (error) {
      toast({ title: removing ? 'Could not remove item' : 'Could not update quantity', description: error.message, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setBusyItemId(null);
    }
  };

  const changeSavedQuantity = async (item, quantity) => {
    if (quantity <= 0) {
      setPendingRemoval(item);
      return;
    }
    await changeItem(item, quantity);
  };

  const confirmRemoval = async () => {
    const item = pendingRemoval;
    setPendingRemoval(null);
    if (item) await changeItem(item, 0);
  };

  /** Take a merged table off the bill; what it ordered moves to an order of its own */
  const unmergeTable = async (linked) => {
    if (!window.confirm(`Unmerge Table ${linked.table_number}? Its items move to a separate bill for that table.`)) return;
    setUnmerging(true);
    try {
      const result = await orderService.unmergeTable(order.id, linked.id);
      toast({
        title: `Table ${linked.table_number} unmerged`,
        description: result.new_order ? `Its items are on order ${result.new_order.order_number}.` : 'It had no items, so it is free now.',
        status: 'success',
        duration: 4000,
      });
      onChanged?.();
      // Opened from the table that just left: its own order is a different one now
      if (table && String(table.id) === String(linked.id)) onClose();
      else setOrder(result.order);
    } catch (error) {
      toast({ title: 'Could not unmerge the table', description: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setUnmerging(false);
    }
  };

  const handleClose = () => {
    if (draft.length > 0 && !window.confirm('You have items that have not been added to the order. Close and discard them?')) {
      return;
    }
    onClose();
  };

  // ---- Render --------------------------------------------------------------

  const editable = mode === 'edit' && (!order || isEditableOrder(order));
  const isTakeaway = orderType !== 'dine_in' || (order && order.type !== 'dine_in');
  const title = table ? `Table ${getTableLabel(table)}` : isTakeaway ? 'Takeaway' : 'Order';
  const actionBusy = order ? busy[order.id] : null;
  const draftCount = draft.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size={modalSize}
        scrollBehavior="inside"
        closeOnOverlayClick={draft.length === 0}
      >
        <ModalOverlay bg="blackAlpha.400" backdropFilter="blur(2px)" />
        <ModalContent borderRadius={{ base: 0, lg: '16px' }} maxH={{ base: '100vh', lg: '88vh' }} overflow="hidden">
          <ModalHeader py={3} pr={14} borderBottomWidth="1px">
            <Flex align="center" gap={3} wrap="wrap">
              <Text fontSize="xl" fontWeight="700">{title}</Text>
              {order && (
                <>
                  <Badge colorScheme={STATUS_COLORS[order.status] || 'gray'} fontSize="xs" px={2} py={0.5} borderRadius="md">
                    {order.status}
                  </Badge>
                  <Text fontSize="sm" color={mutedColor} fontWeight="500">
                    Order {order.order_number} · open {formatElapsed(getOrderStartTime(order))}
                  </Text>
                  {isMergedOrder(order) && (
                    <Badge colorScheme="purple" variant="subtle" fontSize="xs" px={2} py={0.5} borderRadius="md">
                      Merged bill · Tables {getOrderTablesLabel(order)}
                    </Badge>
                  )}
                </>
              )}
              {!order && !loadingOrder && (
                <Badge colorScheme="green" fontSize="xs" px={2} py={0.5} borderRadius="md">New order</Badge>
              )}
              {mode === 'view' && order && (
                <Badge variant="outline" fontSize="xs" px={2} py={0.5} borderRadius="md">View only</Badge>
              )}
            </Flex>
          </ModalHeader>
          <ModalCloseButton top={3} />

          <ModalBody p={0} display="flex" minH={0}>
            {loadingOrder ? (
              <Center flex={1} py={20}><Spinner size="lg" color="blue.500" /></Center>
            ) : (
              <Flex flex={1} direction={{ base: 'column', lg: 'row' }} minH={0} h={{ lg: '70vh' }}>
                {editable && (
                  <Box flex={{ base: 'none', lg: '1.2' }} h={{ base: '45vh', lg: 'auto' }} p={4} borderRightWidth={{ lg: '1px' }} borderBottomWidth={{ base: '1px', lg: 0 }} minH={0}>
                    <MenuItemSearch
                      menuItems={state.menuItems || []}
                      loading={state.loading?.menuItems}
                      query={query}
                      onQueryChange={setQuery}
                      draftQuantities={draftQuantities}
                      onAdd={addToDraft}
                      onChangeQuantity={setDraftQuantity}
                      formatPrice={formatPrice}
                      isDisabled={submitting}
                    />
                  </Box>
                )}
                <Box flex="1" p={4} bg={panelBg} minH={0} display="flex" flexDirection="column">
                  {!order && isTakeaway && editable && (
                    <Input
                      size="sm"
                      mb={3}
                      bg={inputBg}
                      placeholder="Customer name (optional)"
                      aria-label="Customer name"
                      value={customerName}
                      maxLength={100}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  )}
                  <Box flex={1} minH={0}>
                    <CurrentOrderSummary
                      order={order}
                      draft={draft}
                      formatPrice={formatPrice}
                      canEdit={editable && !!order}
                      busyItemId={busyItemId}
                      onSavedQuantityChange={changeSavedQuantity}
                      onDraftQuantityChange={setDraftQuantity}
                      onDraftNoteChange={setDraftNote}
                      getCurrencySymbol={getCurrencySymbol}
                      canDiscount={!!order && isActiveOrder(order)}
                      onOrderUpdated={handleOrderChanged}
                    />
                  </Box>
                </Box>
              </Flex>
            )}
          </ModalBody>

          <ModalFooter borderTopWidth="1px" py={3} gap={2} flexWrap="wrap" justifyContent="space-between">
            <HStack spacing={2} flexWrap="wrap">
              {order && (
                <Button
                  leftIcon={<Printer size={16} />}
                  variant="outline"
                  onClick={() => printKOT(order)}
                  isLoading={actionBusy === 'print'}
                  isDisabled={submitting}
                >
                  Print KOT
                </Button>
              )}
              {order && (order.items || []).length > 0 && (
                <Button
                  leftIcon={<Receipt size={16} />}
                  variant="outline"
                  onClick={() => printBill(order)}
                  isLoading={actionBusy === 'bill'}
                  isDisabled={submitting || draft.length > 0}
                  title={draft.length > 0 ? 'Add the new items first' : undefined}
                >
                  Print bill
                </Button>
              )}
              {order?.status === KITCHEN_PENDING_STATUS && (
                <Button
                  leftIcon={<ChefHat size={16} />}
                  variant="outline"
                  colorScheme="orange"
                  onClick={() => sendToKitchen(order)}
                  isLoading={actionBusy === 'kitchen'}
                  isDisabled={submitting || draft.length > 0}
                  title={draft.length > 0 ? 'Add the new items first' : undefined}
                >
                  Send to kitchen
                </Button>
              )}
              {mode === 'view' && order && isEditableOrder(order) && (
                <Button leftIcon={<Pencil size={16} />} variant="ghost" onClick={() => setMode('edit')}>
                  Edit order
                </Button>
              )}
              {order && isActiveOrder(order) && isMergedOrder(order) && (
                <Menu placement="top-start">
                  <MenuButton
                    as={Button}
                    leftIcon={<Split size={16} />}
                    variant="ghost"
                    isLoading={unmerging}
                    isDisabled={submitting || draft.length > 0}
                  >
                    Unmerge
                  </MenuButton>
                  <MenuList>
                    {getLinkedTables(order).map((linked) => (
                      <MenuItem key={linked.id} onClick={() => unmergeTable(linked)}>
                        Unmerge Table {linked.table_number}
                      </MenuItem>
                    ))}
                  </MenuList>
                </Menu>
              )}
            </HStack>

            <HStack spacing={2} flexWrap="wrap">
              <Button variant="ghost" onClick={handleClose}>Close</Button>
              {order && isActiveOrder(order) && draft.length === 0 && (
                <Button variant="ghost" colorScheme="red" onClick={() => setCancelOpen(true)} isDisabled={submitting}>
                  Cancel order
                </Button>
              )}
              {order && isActiveOrder(order) && draft.length === 0 && can('bill.settle') && (
                <Button
                  colorScheme="green"
                  leftIcon={<Wallet size={16} />}
                  onClick={() => setSettleOpen(true)}
                  isDisabled={submitting || (order.items || []).filter((i) => i.status !== 'cancelled').length === 0}
                  title={(order.items || []).filter((i) => i.status !== 'cancelled').length === 0 ? 'No items to bill. Use Cancel order to close it.' : undefined}
                >
                  Settle bill
                </Button>
              )}
              {editable && !order && (
                <>
                  <Button
                    variant="outline"
                    colorScheme="blue"
                    onClick={() => placeOrder(false)}
                    isDisabled={draft.length === 0}
                    isLoading={submitting}
                  >
                    Place order
                  </Button>
                  <Button
                    colorScheme="blue"
                    leftIcon={<Printer size={16} />}
                    onClick={() => placeOrder(true)}
                    isDisabled={draft.length === 0}
                    isLoading={submitting}
                  >
                    Place & print KOT
                  </Button>
                </>
              )}
              {editable && order && draft.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    colorScheme="blue"
                    leftIcon={<Plus size={16} />}
                    onClick={() => addItems(false)}
                    isLoading={submitting}
                  >
                    Add {draftCount} {draftCount === 1 ? 'item' : 'items'}
                  </Button>
                  <Button
                    colorScheme="blue"
                    leftIcon={<Printer size={16} />}
                    onClick={() => addItems(true)}
                    isLoading={submitting}
                  >
                    Add & print KOT
                  </Button>
                </>
              )}
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {cancelOpen && order && (
        <CancelOrderDialog
          isOpen
          order={order}
          formatPrice={formatPrice}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => {
            setCancelOpen(false);
            onChanged?.();
            onClose();
          }}
        />
      )}

      {settleOpen && order && (
        <SettlePaymentModal
          isOpen
          orderId={order.id}
          onClose={() => {
            setSettleOpen(false);
            // A discount may have changed the bill in the payment popup
            refreshOrder(order.id).then(() => onChanged?.()).catch(() => {});
          }}
          onSettled={() => {
            setSettleOpen(false);
            onChanged?.();
            onClose();
          }}
        />
      )}

      <AlertDialog
        isOpen={!!pendingRemoval}
        leastDestructiveRef={cancelRemovalRef}
        onClose={() => setPendingRemoval(null)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="700">Remove item?</AlertDialogHeader>
            <AlertDialogBody>
              Remove <strong>{pendingRemoval?.menu_item_name}</strong> (×{pendingRemoval?.quantity}) from this order?
              {pendingRemoval?.status && pendingRemoval.status !== 'pending' && (
                <Text mt={2} color="orange.600" fontSize="sm">
                  The kitchen has already marked this item as {pendingRemoval.status}.
                </Text>
              )}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRemovalRef} onClick={() => setPendingRemoval(null)}>Keep item</Button>
              <Button colorScheme="red" onClick={confirmRemoval} ml={3}>Remove</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
};

export default OrderModal;
