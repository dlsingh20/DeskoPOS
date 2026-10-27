import React from 'react';
import { Box, HStack, Icon, SimpleGrid, Text, Tooltip, useColorModeValue } from '@chakra-ui/react';
import { AlertTriangle, Info } from 'lucide-react';
import { reconcileSummary } from '../../utils/historyUtils';

const SummaryCard = ({ label, value, hint, emphasis }) => {
  const bg = useColorModeValue(emphasis ? 'orange.50' : 'white', emphasis ? 'whiteAlpha.100' : 'gray.800');
  const border = useColorModeValue(emphasis ? 'orange.300' : 'gray.200', emphasis ? 'orange.500' : 'gray.700');
  const labelColor = useColorModeValue('gray.500', 'gray.400');
  return (
    <Tooltip label={hint} placement="bottom" openDelay={300} hasArrow>
      <Box bg={bg} border="1px solid" borderColor={border} borderRadius="12px" px={4} py={3} minW={0} tabIndex={0} aria-label={`${label}: ${value}. ${hint}`}>
        <HStack spacing={1}>
          <Text fontSize="xs" fontWeight="600" color={labelColor} textTransform="uppercase" letterSpacing="0.04em" noOfLines={1}>{label}</Text>
          <Icon as={Info} boxSize={3} color={labelColor} aria-hidden />
        </HStack>
        <Text fontSize={{ base: 'lg', xl: 'xl' }} fontWeight="700" mt={1} noOfLines={1}>{value}</Text>
      </Box>
    </Tooltip>
  );
};

/**
 * Summary cards for the active dataset. Definitions are shown on hover so staff
 * can see exactly what each figure includes.
 */
const HistorySummaryCards = ({ summary, formatPrice, tab, statusFilter }) => {
  const onlyCancelled = tab !== 'pending' && statusFilter === 'cancelled';
  const difference = reconcileSummary(summary);

  const cards = [
    { key: 'bills', label: 'Bills', value: summary.bills.toLocaleString('en-IN'), hint: `Bills matching the filters. ${summary.cancelledCount} cancelled, ${summary.refundedCount} refunded.` },
    onlyCancelled
      ? { key: 'total', label: 'Cancelled value', value: formatPrice(summary.cancelledValue), hint: 'Total value of the cancelled bills. Not counted as sales.' }
      : { key: 'total', label: 'Total', value: formatPrice(summary.total), hint: 'Sum of bill totals for completed and credit bills. Cancelled and refunded bills are not included.' },
    { key: 'cash', label: 'Cash', value: formatPrice(summary.cash), hint: 'Completed cash payments.' },
    { key: 'card', label: 'Card', value: formatPrice(summary.card), hint: 'Completed credit and debit card payments.' },
    { key: 'upi', label: 'UPI', value: formatPrice(summary.upi), hint: 'Completed UPI, Paytm and PhonePe payments.' },
    { key: 'guestVisit', label: 'Guest Visit', value: formatPrice(summary.guestVisit), hint: 'Amounts charged to hotel room folios. Settled for the POS; collected by the front office at checkout.' },
    { key: 'pending', label: 'Pending Collection', value: formatPrice(summary.pendingCollection), emphasis: tab === 'pending' || summary.pendingCollection > 0, hint: `Balance still to be collected on unpaid, part-paid and completed-pending bills${summary.pendingConfirmation ? `, including ${formatPrice(summary.pendingConfirmation)} awaiting payment confirmation` : ''}.` },
    { key: 'tax', label: 'Tax', value: formatPrice(summary.tax), hint: 'Tax on completed and credit bills.' },
  ];
  if (summary.other > 0) {
    cards.splice(6, 0, { key: 'other', label: 'Other', value: formatPrice(summary.other), hint: 'Gift card, loyalty points and bank transfer payments.' });
  }

  return (
    <Box px={{ base: 3, md: 4 }} pt={3} pb={3}>
      <SimpleGrid columns={{ base: 2, sm: 3, md: 4, xl: cards.length }} spacing={3}>
        {cards.map(({ key, ...card }) => <SummaryCard key={key} {...card} />)}
      </SimpleGrid>
      {(Math.abs(difference) >= 0.01 || summary.writtenOff > 0 || summary.overpaid > 0) && (
        <HStack spacing={2} mt={2} fontSize="xs" color={Math.abs(difference) >= 0.01 ? 'red.500' : 'gray.500'}>
          <Icon as={AlertTriangle} boxSize={3.5} />
          <Text>
            {Math.abs(difference) >= 0.01
              ? `Payments and balances differ from Total by ${formatPrice(difference)}. Check the Payment Details sheet in the export.`
              : [
                summary.writtenOff > 0 && `${formatPrice(summary.writtenOff)} written off or settled on the credit desk`,
                summary.overpaid > 0 && `${formatPrice(summary.overpaid)} paid above bill totals`,
              ].filter(Boolean).join(' · ')}
          </Text>
        </HStack>
      )}
    </Box>
  );
};

export default HistorySummaryCards;
