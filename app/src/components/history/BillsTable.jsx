import React, { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  HStack,
  Icon,
  IconButton,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from '@chakra-ui/react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import BillDetails from './BillDetails';
import { describePayments, formatDateTime } from '../../utils/historyUtils';

const PAGE_SIZE = 50;

const BADGE_SCHEMES = {
  green: 'green', amber: 'yellow', blue: 'blue', orange: 'orange', gray: 'gray', red: 'red', purple: 'purple',
};

// Fixed widths keep columns still when a row expands
const COLUMNS = [
  { key: 'bill', label: 'Bill No', width: '120px' },
  { key: 'status', label: 'Status', width: '170px' },
  { key: 'table', label: 'Table', width: '70px' },
  { key: 'total', label: 'Total', width: '120px' },
  { key: 'payment', label: 'Payment', width: '230px' },
  { key: 'tax', label: 'Tax', width: '95px' },
  { key: 'discount', label: 'Discount', width: '95px' },
  { key: 'charges', label: 'Charges', width: '100px' },
  { key: 'orderTime', label: 'Order Time', width: '185px' },
  { key: 'closed', label: 'Closed', width: '185px' },
  { key: 'expand', label: '', width: '48px' },
];

const BillsTable = ({ bills, formatPrice, timeZone, staffName, itemCategory, onLoadDetail, resetKey }) => {
  // Re-read one bill after it changed here (a refund); errors keep the old figures on screen
  const reloadBill = (id) => onLoadDetail(id).catch(() => {});
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());
  const [details, setDetails] = useState({}); // id -> { loading, error }

  const headBg = useColorModeValue('white', 'gray.800');
  const rowHover = useColorModeValue('gray.50', 'whiteAlpha.50');
  const lineColor = useColorModeValue('gray.100', 'gray.700');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const billNoColor = useColorModeValue('orange.800', 'orange.200');
  const expandedBg = useColorModeValue('orange.50', 'whiteAlpha.100');
  const focusColor = useColorModeValue('orange.400', 'orange.300');

  // New filters or data: back to page 1, collapse everything
  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(bills.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = bills.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggle = async (bill) => {
    const next = new Set(expanded);
    if (next.has(bill.id)) {
      next.delete(bill.id);
      setExpanded(next);
      return;
    }
    next.add(bill.id);
    setExpanded(next);
    if (!bill.items && !details[bill.id]?.loading) {
      setDetails((d) => ({ ...d, [bill.id]: { loading: true, error: null } }));
      try {
        await onLoadDetail(bill.id);
        setDetails((d) => ({ ...d, [bill.id]: { loading: false, error: null } }));
      } catch (error) {
        setDetails((d) => ({ ...d, [bill.id]: { loading: false, error: error.message || 'Request failed' } }));
      }
    }
  };

  const onRowKey = (event, bill) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(bill);
    }
  };

  return (
    <Box display="flex" flexDirection="column" minH={0} flex={1}>
      <Box flex={1} minH={0} overflow="auto" borderTop="1px solid" borderColor={lineColor}>
        <Table size="sm" variant="unstyled" sx={{ tableLayout: 'fixed' }} minW="1400px">
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <Thead position="sticky" top={0} zIndex={1} bg={headBg}>
            <Tr>
              {COLUMNS.map((c) => (
                <Th
                  key={c.key}
                  py={3}
                  px={3}
                  color={mutedColor}
                  fontSize="xs"
                  letterSpacing="0.04em"
                  borderBottom="1px solid"
                  borderColor={lineColor}
                >
                  {c.label}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {visible.map((bill) => {
              const isOpen = expanded.has(bill.id);
              const scheme = BADGE_SCHEMES[bill.stateInfo.tone] || 'gray';
              return (
                <React.Fragment key={bill.id}>
                  <Tr
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                    aria-label={`Bill ${bill.billNo}, ${bill.stateInfo.label}, ${formatPrice(bill.total)}. ${isOpen ? 'Collapse' : 'Expand'} details`}
                    onClick={() => toggle(bill)}
                    onKeyDown={(e) => onRowKey(e, bill)}
                    cursor="pointer"
                    h="48px"
                    bg={isOpen ? expandedBg : undefined}
                    borderBottom="1px solid"
                    borderColor={lineColor}
                    _hover={{ bg: isOpen ? expandedBg : rowHover }}
                    _focusVisible={{ outline: '2px solid', outlineColor: focusColor, outlineOffset: '-2px' }}
                  >
                    <Td px={3} fontWeight="700" color={billNoColor} isTruncated>#{String(bill.billNo).replace(/^#/, '')}</Td>
                    <Td px={3}>
                      <Badge colorScheme={scheme} variant="subtle" fontSize="2xs" px={2} py={0.5} borderRadius="4px" border="1px solid" borderColor={`${scheme}.200`}>
                        {bill.stateInfo.label}
                      </Badge>
                    </Td>
                    <Td px={3} fontWeight="600" isTruncated>{bill.tableLabel || '—'}</Td>
                    <Td px={3} fontWeight="700" textDecoration={bill.billStatus === 'cancelled' ? 'line-through' : 'none'}>{formatPrice(bill.total)}</Td>
                    <Td px={3} fontSize="sm" isTruncated title={describePayments(bill, formatPrice)}>{describePayments(bill, formatPrice)}</Td>
                    <Td px={3} fontSize="sm">{bill.tax > 0 ? formatPrice(bill.tax) : '—'}</Td>
                    <Td px={3} fontSize="sm">{bill.discount > 0 ? formatPrice(bill.discount) : '—'}</Td>
                    <Td px={3} fontSize="sm">{bill.charges > 0 ? formatPrice(bill.charges) : '—'}</Td>
                    <Td px={3} fontSize="sm" color={mutedColor}>{formatDateTime(bill.orderTime, timeZone)}</Td>
                    <Td px={3} fontSize="sm" color={mutedColor}>{formatDateTime(bill.closedAt, timeZone)}</Td>
                    <Td px={1}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        tabIndex={-1}
                        aria-hidden
                        icon={<Icon as={isOpen ? ChevronUp : ChevronDown} boxSize={4} />}
                        onClick={(e) => { e.stopPropagation(); toggle(bill); }}
                      />
                    </Td>
                  </Tr>
                  {isOpen && (
                    <Tr>
                      <Td colSpan={COLUMNS.length} p={0}>
                        <BillDetails
                          bill={bill}
                          loading={details[bill.id]?.loading}
                          error={details[bill.id]?.error}
                          formatPrice={formatPrice}
                          timeZone={timeZone}
                          staffName={staffName}
                          itemCategory={itemCategory}
                          onBillChanged={reloadBill}
                        />
                      </Td>
                    </Tr>
                  )}
                </React.Fragment>
              );
            })}
          </Tbody>
        </Table>
      </Box>

      {pageCount > 1 && (
        <HStack justify="space-between" px={4} py={2} borderTop="1px solid" borderColor={lineColor} flexShrink={0}>
          <Text fontSize="sm" color={mutedColor}>
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, bills.length)} of {bills.length} bills
          </Text>
          <HStack>
            <Button size="sm" variant="outline" leftIcon={<ChevronLeft size={16} />} onClick={() => setPage(currentPage - 1)} isDisabled={currentPage === 1}>
              Previous
            </Button>
            <Text fontSize="sm">Page {currentPage} of {pageCount}</Text>
            <Button size="sm" variant="outline" rightIcon={<ChevronRight size={16} />} onClick={() => setPage(currentPage + 1)} isDisabled={currentPage === pageCount}>
              Next
            </Button>
          </HStack>
        </HStack>
      )}
    </Box>
  );
};

export default BillsTable;
