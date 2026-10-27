import React, { useState } from 'react';
import {
  Badge,
  Button,
  Box,
  Flex,
  HStack,
  Icon,
  SimpleGrid,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { AlertTriangle, Ban, CheckCircle2, Clock, Printer, RotateCcw, Undo2, XCircle } from 'lucide-react';
import PrintService from '../../services/PrintService';
import { IS_DESKOPOS } from '../../services/backend';
import RefundDialog from './RefundDialog';
import { REFUND_REASONS, refundablePayments } from '../../utils/refunds';
import { useAccess } from '../../context/AccessContext';
import {
  ORDER_TYPE_LABELS,
  formatDateTime,
  getItemLineAmount,
  getItemsTotal,
  getPaymentLabel,
  getPaymentReference,
  groupItemsByRound,
  money,
} from '../../utils/historyUtils';
import { getDiscountInfo, personName } from '../../utils/discountUtils';

const TONES = {
  green: { scheme: 'green', icon: CheckCircle2 },
  amber: { scheme: 'yellow', icon: Clock },
  blue: { scheme: 'blue', icon: Clock },
  orange: { scheme: 'orange', icon: AlertTriangle },
  gray: { scheme: 'gray', icon: Ban },
  red: { scheme: 'red', icon: XCircle },
  purple: { scheme: 'purple', icon: RotateCcw },
};

const Field = ({ label, children }) => (
  <Box minW={0}>
    <Text fontSize="xs" color="gray.500" mb={0.5}>{label}</Text>
    <Box fontSize="sm" fontWeight="600">{children}</Box>
  </Box>
);

/** Banner amount: what the operator needs to act on for this state */
const bannerAmount = (bill) => {
  if (bill.isPending) return { value: bill.balance, prefix: '' };
  if (bill.billStatus === 'cancelled') return { value: bill.total, prefix: '' };
  if (bill.billStatus === 'refunded') return { value: bill.refunded || bill.total, prefix: '-' };
  return { value: bill.paid || bill.total, prefix: '+' };
};

const BillDetails = ({ bill, loading, error, formatPrice, timeZone, staffName, itemCategory, onBillChanged }) => {
  const toast = useToast();
  const { can } = useAccess();
  const [reprinting, setReprinting] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const tone = TONES[bill.stateInfo.tone] || TONES.gray;
  const bannerBg = useColorModeValue(`${tone.scheme}.50`, 'whiteAlpha.100');
  const bannerBorder = useColorModeValue(`${tone.scheme}.200`, `${tone.scheme}.700`);
  const iconColor = useColorModeValue(`${tone.scheme}.600`, `${tone.scheme}.300`);
  const panelBg = useColorModeValue('gray.50', 'gray.900');
  const roundBorder = useColorModeValue('orange.300', 'orange.500');
  const roundColor = useColorModeValue('orange.700', 'orange.200');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const operatorColor = useColorModeValue('purple.700', 'purple.300');

  const amount = bannerAmount(bill);

  // Reprints from History are copies, so they are marked DUPLICATE
  const reprint = async () => {
    setReprinting(true);
    try {
      await PrintService.printBillById(bill.id, { duplicate: true });
      toast({ title: 'Bill sent to printer', description: `#${String(bill.billNo).replace(/^#/, '')} (duplicate)`, status: 'success', duration: 2500 });
    } catch (err) {
      toast({ title: 'Reprint failed', description: err.message || 'The printer did not respond.', status: 'error', duration: 6000, isClosable: true });
    } finally {
      setReprinting(false);
    }
  };
  const lastPayment = bill.completedPayments[bill.completedPayments.length - 1] || bill.pendingPayments[0] || null;
  const operatorId = bill.settledById ?? bill.serverId;
  const rounds = bill.items ? groupItemsByRound(bill.items) : [];
  const itemsTotal = bill.items ? getItemsTotal(bill.items) : 0;
  const itemsDiff = bill.items ? Math.round((itemsTotal - bill.subtotal) * 100) / 100 : 0;
  const order = bill.order;
  const discountNote = bill.discount > 0 ? getDiscountInfo(order).note : null;
  // DeskoPOS: settled bills with money left to give back; users without bill.refund ask a manager
  const canRefund = IS_DESKOPOS && bill.billStatus === 'completed' && (can('bill.refund') || can('bill.settle'))
    && refundablePayments(bill.payments).length > 0;
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];

  return (
    <Box bg={panelBg} px={{ base: 3, md: 5 }} py={4} borderBottom="2px solid" borderColor={lineColor}>
      {/* A. Status banner */}
      <Box bg={bannerBg} border="1px solid" borderColor={bannerBorder} borderRadius="12px" p={4} mb={4}>
        <Flex justify="space-between" align="center" gap={3} mb={4} wrap="wrap">
          <HStack spacing={2.5}>
            <Icon as={tone.icon} boxSize={5} color={iconColor} />
            <Text fontWeight="700" fontSize="md">{bill.stateInfo.banner}</Text>
          </HStack>
          <Badge
            colorScheme={tone.scheme}
            variant="solid"
            fontSize="sm"
            px={3}
            py={1}
            borderRadius="6px"
            textDecoration={bill.billStatus === 'cancelled' ? 'line-through' : 'none'}
          >
            {amount.prefix}{formatPrice(amount.value)}
          </Badge>
        </Flex>
        {((bill.billStatus !== 'cancelled' && can('bill.reprint')) || canRefund) && (
          <Flex justify="flex-end" gap={2} mt={-2} mb={3}>
            {canRefund && (
              <Button size="xs" variant="outline" colorScheme="purple" leftIcon={<Undo2 size={12} />} onClick={() => setRefundOpen(true)}>
                Refund
              </Button>
            )}
            {bill.billStatus !== 'cancelled' && can('bill.reprint') && (
              <Button size="xs" variant="outline" leftIcon={<Printer size={12} />} onClick={reprint} isLoading={reprinting} loadingText="Printing">
                Reprint bill
              </Button>
            )}
          </Flex>
        )}

        {/* B. Bill metadata */}
        <SimpleGrid columns={{ base: 2, md: 4 }} spacingX={6} spacingY={3}>
          <Field label={order.closed_by || bill.settledById != null ? 'Completed By (Operator):' : 'Server:'}>
            <Text color={operatorColor}>{personName(order.closed_by) || (operatorId != null ? staffName(operatorId) : '—')}</Text>
          </Field>
          <Field label="Original Bill #:">#{String(bill.billNo).replace(/^#/, '')}</Field>
          <Field label="Remaining on Bill:">
            <Text color={bill.balance > 0 ? 'red.500' : 'green.600'}>{formatPrice(bill.balance)}</Text>
          </Field>
          <Field label="Payment Mode:">
            {bill.payments.filter((p) => p.status === 'completed' || p.status === 'pending').length ? (
              <HStack spacing={1} wrap="wrap">
                {bill.payments.filter((p) => p.status === 'completed' || p.status === 'pending').map((p) => (
                  <Badge key={p.id} variant="outline" colorScheme={p.status === 'pending' ? 'blue' : 'gray'} fontSize="xs">
                    {getPaymentLabel(p).toUpperCase()}{p.status === 'pending' ? ' (PENDING)' : ''}
                  </Badge>
                ))}
              </HStack>
            ) : (
              <Badge variant="outline" fontSize="xs">{bill.billStatus === 'outstanding' ? 'CREDIT PAY' : 'NONE'}</Badge>
            )}
          </Field>

          <Field label="Order type:">{ORDER_TYPE_LABELS[bill.type] || bill.type || '—'}</Field>
          {order.invoice_number && <Field label="Invoice #:">{order.invoice_number}</Field>}
          {order.guest_count > 0 && <Field label="Guests:">{order.guest_count}</Field>}
          <Field label="Table:">{bill.tableLabel || '—'}</Field>
          {(bill.customerName || bill.customerPhone) && (
            <Field label="Customer:">{[bill.customerName, bill.customerPhone].filter(Boolean).join(' · ')}</Field>
          )}
          {order.room_number && <Field label="Room:">{order.room_number}</Field>}
          {bill.serverId != null && bill.settledById != null && String(bill.serverId) !== String(bill.settledById) && (
            <Field label="Server:">{staffName(bill.serverId)}</Field>
          )}
          {lastPayment && getPaymentReference(lastPayment) && (
            <Field label="Payment reference:">{getPaymentReference(lastPayment)}</Field>
          )}
          <Field label="Ordered:">{formatDateTime(bill.orderTime, timeZone)}</Field>
          {order.served_time && <Field label="Served:">{formatDateTime(order.served_time, timeZone)}</Field>}
          <Field label={bill.billStatus === 'cancelled' ? 'Cancelled:' : 'Closed:'}>{formatDateTime(bill.closedAt, timeZone)}</Field>
          {bill.discount > 0 && (
            <Field label="Discount:">
              {discountNote?.type === 'percent' ? `${discountNote.percent}% · ` : ''}{formatPrice(bill.discount)}
              {discountNote?.reason ? ` · ${discountNote.reason}` : ''}
              {discountNote?.by ? ` · by ${discountNote.by}` : ''}
            </Field>
          )}
          {bill.outstanding && (
            <Field label="Credit record:">
              {bill.outstanding.status.replace(/_/g, ' ')}
              {bill.outstanding.resolution_action ? ` (${bill.outstanding.resolution_action.replace(/_/g, ' ')})` : ''}
              {bill.outstanding.resolved_by_name ? ` by ${bill.outstanding.resolved_by_name}` : ''}
            </Field>
          )}
        </SimpleGrid>
        {refunds.length > 0 && (
          <Box mt={3}>
            {refunds.map((r) => (
              <Text key={r.id} fontSize="xs" color={mutedColor}>
                Refund {formatPrice(money(r.amount))} · Credit note {r.credit_note_number}
                {` · ${REFUND_REASONS.find((x) => x.key === r.reason)?.label || r.reason}`}
                {r.note ? ` (${r.note})` : ''}
                {r.refunded_by?.name ? ` · by ${r.refunded_by.name}` : ''}
                {r.approved_by?.name ? ` · approved by ${r.approved_by.name}` : ''}
                {r.created_at ? ` · ${formatDateTime(r.created_at, timeZone)}` : ''}
              </Text>
            ))}
          </Box>
        )}
        {bill.billStatus === 'cancelled' && (
          <Text fontSize="xs" color={mutedColor} mt={3}>
            {order.cancel_reason
              ? `Reason: ${order.cancel_reason}`
              : (order.notes ? `Reason / notes: ${order.notes}` : 'No cancellation reason was recorded for this bill.')}
            {personName(order.cancelled_by) ? ` · Cancelled by ${personName(order.cancelled_by)}` : ''}
            {personName(order.cancel_approved_by) ? ` · Approved by ${personName(order.cancel_approved_by)}` : ''}
          </Text>
        )}
      </Box>

      {/* C. Ordered items */}
      {loading && (
        <HStack py={6} justify="center" color={mutedColor}><Spinner size="sm" /><Text fontSize="sm">Loading items…</Text></HStack>
      )}
      {!loading && error && (
        <Text fontSize="sm" color="red.500" py={4}>Could not load the items for this bill: {error}</Text>
      )}
      {!loading && !error && bill.items && (
        <Box overflowX="auto">
          <Table size="sm" variant="unstyled" minW="560px">
            <Thead>
              <Tr borderBottom="1px solid" borderColor={lineColor}>
                <Th color={mutedColor} px={2}>Item</Th>
                <Th color={mutedColor} px={2}>Category</Th>
                <Th color={mutedColor} px={2}>Size</Th>
                <Th color={mutedColor} px={2} isNumeric>Qty</Th>
                <Th color={mutedColor} px={2} isNumeric>Price</Th>
                <Th color={mutedColor} px={2} isNumeric>Amount</Th>
              </Tr>
            </Thead>
            <Tbody>
              {!bill.items.length && (
                <Tr><Td colSpan={6} px={2} py={4} color={mutedColor} fontSize="sm">This bill has no items.</Td></Tr>
              )}
              {rounds.map(({ round, items }) => (
                <React.Fragment key={round}>
                  {rounds.length > 1 && (
                    <Tr>
                      <Td colSpan={6} px={2} pt={3} pb={1}>
                        <Box as="span" fontSize="2xs" fontWeight="700" letterSpacing="0.05em" color={roundColor} border="1px solid" borderColor={roundBorder} borderRadius="4px" px={2} py={0.5}>
                          ORDER {round}
                        </Box>
                      </Td>
                    </Tr>
                  )}
                  {items.map((item) => {
                    const cancelled = item.status === 'cancelled';
                    return (
                      <Tr key={item.id} opacity={cancelled ? 0.55 : 1}>
                        <Td px={2} py={2}>
                          <Text fontSize="sm" fontWeight="600" textDecoration={cancelled ? 'line-through' : 'none'}>
                            {item.menu_item_name || `Item #${item.menu_item}`}
                          </Text>
                          {item.special_instructions && <Text fontSize="xs" color={mutedColor}>{item.special_instructions}</Text>}
                          {cancelled && <Text fontSize="xs" color="red.500">Cancelled, not billed</Text>}
                          {item.voided_quantity > 0 && <Text fontSize="xs" color="orange.500">{item.voided_quantity} voided after sending to the kitchen</Text>}
                        </Td>
                        <Td px={2} fontSize="sm">{item.category_name || itemCategory(item.menu_item) || '—'}</Td>
                        <Td px={2} fontSize="sm">—</Td>
                        <Td px={2} fontSize="sm" isNumeric>×{item.quantity}</Td>
                        <Td px={2} fontSize="sm" isNumeric>{formatPrice(money(item.unit_price ?? item.menu_item_price))}</Td>
                        <Td px={2} fontSize="sm" isNumeric fontWeight="600" textDecoration={cancelled ? 'line-through' : 'none'}>
                          {formatPrice(getItemLineAmount(item))}
                        </Td>
                      </Tr>
                    );
                  })}
                </React.Fragment>
              ))}
              <Tr borderTop="1px solid" borderColor={lineColor}>
                <Td colSpan={5} px={2} py={2} textAlign="right" fontSize="sm" color={mutedColor}>Items Total</Td>
                <Td px={2} isNumeric fontWeight="700">{formatPrice(itemsTotal)}</Td>
              </Tr>
            </Tbody>
          </Table>

          {/* Bill breakdown: reconciles items with the bill */}
          <Flex justify="flex-end" mt={2}>
            <Box minW={{ base: '100%', sm: '300px' }} fontSize="sm">
              {[
                ['Subtotal', bill.subtotal],
                bill.discount > 0 && ['Discount', -bill.discount],
                bill.charges > 0 && ['Service charge', bill.charges],
                ['Tax', bill.tax],
              ].filter(Boolean).map(([label, value]) => (
                <Flex key={label} justify="space-between" py={0.5} color={mutedColor}>
                  <Text>{label}</Text><Text>{formatPrice(value)}</Text>
                </Flex>
              ))}
              <Flex justify="space-between" py={1} fontWeight="700" borderTop="1px solid" borderColor={lineColor} mt={1}>
                <Text>Grand total</Text><Text>{formatPrice(bill.total)}</Text>
              </Flex>
              {bill.billStatus !== 'cancelled' && (
                <>
                  <Flex justify="space-between" py={0.5}><Text>Paid</Text><Text>{formatPrice(bill.paid)}</Text></Flex>
                  {bill.pendingConfirmation > 0 && (
                    <Flex justify="space-between" py={0.5} color="blue.500"><Text>Awaiting confirmation</Text><Text>{formatPrice(bill.pendingConfirmation)}</Text></Flex>
                  )}
                  {bill.refunded > 0 && (
                    <Flex justify="space-between" py={0.5} color="purple.500"><Text>Refunded</Text><Text>{formatPrice(bill.refunded)}</Text></Flex>
                  )}
                  {bill.writtenOff > 0 && (
                    <Flex justify="space-between" py={0.5} color={mutedColor}>
                      <Text>{bill.state === 'written_off' ? 'Written off' : 'Settled on credit desk'}</Text><Text>{formatPrice(bill.writtenOff)}</Text>
                    </Flex>
                  )}
                  <Flex justify="space-between" py={0.5} fontWeight="700" color={bill.balance > 0 ? 'red.500' : 'green.600'}>
                    <Text>Balance due</Text><Text>{formatPrice(bill.balance)}</Text>
                  </Flex>
                </>
              )}
              {Math.abs(itemsDiff) >= 0.01 && (
                <Text fontSize="xs" color="orange.500" mt={1}>
                  Items total differs from the bill subtotal by {formatPrice(itemsDiff)} (server pricing or removed items).
                </Text>
              )}
            </Box>
          </Flex>
        </Box>
      )}

      {/* Payments */}
      {bill.payments.length > 0 && (
        <Box mt={4} overflowX="auto">
          <Text fontSize="xs" fontWeight="700" color={mutedColor} letterSpacing="0.05em" mb={1}>PAYMENTS</Text>
          <Table size="sm" variant="unstyled" minW="560px">
            <Tbody>
              {bill.payments.map((p) => (
                <Tr key={p.id} borderTop="1px solid" borderColor={lineColor}>
                  <Td px={2} py={2} fontSize="sm" fontWeight="600">{getPaymentLabel(p)}</Td>
                  <Td px={2} fontSize="sm" isNumeric>{formatPrice(money(p.amount))}</Td>
                  <Td px={2}>
                    <Badge fontSize="2xs" colorScheme={{ completed: 'green', pending: 'blue', failed: 'red', refunded: 'purple', partially_refunded: 'purple' }[p.status] || 'gray'}>
                      {String(p.status).replace(/_/g, ' ')}
                    </Badge>
                  </Td>
                  <Td px={2} fontSize="xs" color={mutedColor}>{getPaymentReference(p) || '—'}</Td>
                  <Td px={2} fontSize="xs" color={mutedColor}>{formatDateTime(p.processed_at || p.created_at, timeZone)}</Td>
                  <Td px={2} fontSize="xs" color={mutedColor}>{p.processed_by != null ? staffName(p.processed_by) : '—'}</Td>
                  <Td px={2} fontSize="xs" color={mutedColor} maxW="320px" whiteSpace="normal">{p.notes || ''}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
      <RefundDialog
        isOpen={refundOpen}
        onClose={() => setRefundOpen(false)}
        bill={bill}
        formatPrice={formatPrice}
        onRefunded={() => onBillChanged?.(bill.id)}
      />
    </Box>
  );
};

export default BillDetails;
