import React from 'react';
import {
  Box,
  Flex,
  HStack,
  Text,
  IconButton,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { Printer, Eye, ChefHat, Check, Wallet, X } from 'lucide-react';
import { isQrOrder, isQrSource } from '../../utils/tableQr';
import {
  formatElapsed,
  getItemCount,
  getOrderStartTime,
  KITCHEN_PENDING_STATUS,
} from '../../utils/fineDineUtils';

const TABLE_STATUS_LABELS = {
  reserved: 'Reserved',
  cleaning: 'Cleaning',
  out_of_order: 'Out of order',
};

/**
 * Visual state for a card. Order-driven states win over the table's own status.
 */
const getCardState = (orders, tableStatus) => {
  const order = orders[0];
  if (orders.length > 1) {
    return { key: 'attention', label: `${orders.length} open orders on this table` };
  }
  if (order?.status === 'ready') {
    return { key: 'attention', label: 'Food ready to serve' };
  }
  if (order) {
    return { key: 'occupied', label: `Occupied, ${order.status}` };
  }
  if (TABLE_STATUS_LABELS[tableStatus]) {
    return { key: 'inactive', label: TABLE_STATUS_LABELS[tableStatus] };
  }
  return { key: 'available', label: 'Available' };
};

const QuickAction = ({ label, icon: IconComponent, onClick, isLoading, isDisabled }) => (
  <Tooltip label={label} fontSize="xs" openDelay={300}>
    <IconButton
      aria-label={label}
      icon={<IconComponent size={14} />}
      size="sm"
      minW="28px"
      h="28px"
      borderRadius="10px"
      variant="outline"
      bg={useColorModeValue('white', 'gray.800')}
      borderColor={useColorModeValue('gray.300', 'gray.600')}
      boxShadow="sm"
      isLoading={isLoading}
      isDisabled={isDisabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    />
  </Tooltip>
);

/**
 * Table / order tile for the Fine Dine dashboard
 */
const TableCard = ({
  title,
  subtitle,
  tableStatus,
  orders = [],
  now,
  formatPrice,
  selectable = false,
  selected = false,
  disabled = false,
  busyAction = null,
  onClick,
  onPrintKOT,
  onSendToKitchen,
  onView,
  onSettle,
  onRemove, // a free split table (4-1) nobody needs any more
}) => {
  const order = orders[0];
  const state = getCardState(orders, tableStatus);

  const palette = {
    available: {
      bg: useColorModeValue('white', 'gray.800'),
      border: useColorModeValue('gray.200', 'gray.600'),
      text: useColorModeValue('gray.800', 'gray.100'),
    },
    occupied: {
      bg: useColorModeValue('blue.50', 'rgba(66,153,225,0.12)'),
      border: useColorModeValue('blue.300', 'blue.500'),
      text: useColorModeValue('gray.800', 'gray.100'),
    },
    attention: {
      bg: useColorModeValue('orange.50', 'rgba(237,137,54,0.12)'),
      border: useColorModeValue('orange.300', 'orange.400'),
      text: useColorModeValue('orange.800', 'orange.200'),
    },
    inactive: {
      bg: useColorModeValue('gray.50', 'gray.900'),
      border: useColorModeValue('gray.200', 'gray.700'),
      text: useColorModeValue('gray.500', 'gray.400'),
    },
  };
  const selectedBorder = useColorModeValue('purple.500', 'purple.300');
  const selectedBg = useColorModeValue('purple.50', 'rgba(159,122,234,0.15)');
  const chipBg = useColorModeValue('white', 'gray.700');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  const focusRing = useColorModeValue('blue.400', 'blue.300');

  const colors = palette[state.key];
  const itemCount = getItemCount(order);
  const elapsed = order ? formatElapsed(getOrderStartTime(order), now) : '';
  const notSentToKitchen = order?.status === KITCHEN_PENDING_STATUS;
  // Ordered (fully or partly) by the guest from the table QR code
  const fromQr = orders.some((o) => isQrOrder(o) || (o.items || []).some((i) => isQrSource(i.source)));
  const hasActions = !!order && !selectable;

  const ariaLabel = [
    title,
    subtitle,
    state.label,
    order ? `${itemCount} items` : null,
    elapsed ? `open ${elapsed}` : null,
    order && formatPrice ? formatPrice(order.total_amount || 0) : null,
    notSentToKitchen ? 'not sent to kitchen' : null,
    fromQr ? 'ordered by QR' : null,
    selected ? 'selected' : null,
  ].filter(Boolean).join(', ');

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <Box position="relative" pb={hasActions ? 4 : 0}>
      <Box
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-pressed={selectable ? selected : undefined}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
        position="relative"
        h="112px"
        px={2.5}
        pt={2}
        pb={hasActions ? 5 : 2}
        bg={selected ? selectedBg : colors.bg}
        borderWidth={selected ? '2px' : '1.5px'}
        borderColor={selected ? selectedBorder : colors.border}
        borderRadius="14px"
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.55 : 1}
        transition="transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease"
        _hover={disabled ? {} : { boxShadow: 'md', transform: 'translateY(-1px)' }}
        _focusVisible={{ outline: '2px solid', outlineColor: focusRing, outlineOffset: '2px' }}
        display="flex"
        flexDirection="column"
      >
        {/* Top row: duration + item count */}
        {order ? (
          <Flex justify="space-between" align="flex-start" gap={1} minH="24px">
            <HStack spacing={1} minW={0}>
              {notSentToKitchen && (
                <Tooltip label="Not sent to kitchen yet" fontSize="xs">
                  <Box w="7px" h="7px" borderRadius="full" bg="blue.500" flexShrink={0} />
                </Tooltip>
              )}
              <Text fontSize="xs" color={mutedColor} fontWeight="500" noOfLines={1}>
                {elapsed}
              </Text>
            </HStack>
            <Box
              bg={chipBg}
              borderRadius="6px"
              px={1.5}
              py={0.5}
              boxShadow="xs"
              flexShrink={0}
            >
              <Text fontSize="2xs" fontWeight="700" color={colors.text} whiteSpace="nowrap">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </Text>
            </Box>
          </Flex>
        ) : (
          <Box minH="24px">
            {selected && (
              <Box position="absolute" top={2} right={2} color={selectedBorder}>
                <Check size={16} />
              </Box>
            )}
            {onRemove && !selected && (
              <Tooltip label={`Remove Table ${title}`} fontSize="xs" openDelay={300}>
                <IconButton
                  aria-label={`Remove Table ${title}`}
                  icon={<X size={14} />}
                  size="xs"
                  variant="ghost"
                  position="absolute"
                  top={1.5}
                  right={1.5}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </Tooltip>
            )}
          </Box>
        )}

        {/* Center: table number / order number */}
        <Flex flex={1} direction="column" align="center" justify="center" minH={0}>
          <Text
            fontSize={order ? 'lg' : 'xl'}
            fontWeight={order ? '700' : '500'}
            color={colors.text}
            lineHeight="1.1"
            noOfLines={1}
            textAlign="center"
          >
            {title}
          </Text>
          {subtitle && (
            <Text fontSize="2xs" color={mutedColor} noOfLines={1} textAlign="center">
              {subtitle}
            </Text>
          )}
          {order && formatPrice && (
            <Text fontSize="sm" fontWeight="600" color={colors.text} mt={0.5}>
              {formatPrice(order.total_amount || 0)}
            </Text>
          )}
          {!order && TABLE_STATUS_LABELS[tableStatus] && (
            <Text fontSize="2xs" fontWeight="600" color={mutedColor} textTransform="uppercase" letterSpacing="0.04em">
              {TABLE_STATUS_LABELS[tableStatus]}
            </Text>
          )}
          {orders.length > 1 && (
            <Text fontSize="2xs" fontWeight="700" color={colors.text}>
              +{orders.length - 1} more order
            </Text>
          )}
          {fromQr && (
            <Text as="span" fontSize="2xs" fontWeight="800" px={1.5} borderRadius="4px" bg="purple.500" color="white" letterSpacing="0.04em">
              QR
            </Text>
          )}
        </Flex>
      </Box>

      {/* Quick actions overlap the bottom edge */}
      {hasActions && (
        <HStack
          spacing={1}
          position="absolute"
          bottom={0}
          left="50%"
          transform="translateX(-50%)"
        >
          <QuickAction
            label="Print KOT"
            icon={Printer}
            onClick={() => onPrintKOT?.(order)}
            isLoading={busyAction === 'print'}
          />
          {notSentToKitchen && (
            <QuickAction
              label="Send to kitchen"
              icon={ChefHat}
              onClick={() => onSendToKitchen?.(order)}
              isLoading={busyAction === 'kitchen'}
            />
          )}
          <QuickAction label="View order" icon={Eye} onClick={() => onView?.(order)} />
          {onSettle && <QuickAction label="Settle bill" icon={Wallet} onClick={() => onSettle(order)} />}
        </HStack>
      )}
    </Box>
  );
};

export default TableCard;
