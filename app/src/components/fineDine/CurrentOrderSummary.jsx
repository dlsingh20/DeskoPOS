import React from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  IconButton,
  Input,
  Badge,
  Divider,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import DiscountLine from '../discount/DiscountLine';

const ITEM_STATUS_COLORS = {
  preparing: 'orange',
  ready: 'green',
  served: 'purple',
  cancelled: 'red',
};

const QuantityStepper = ({ label, quantity, onChange, isDisabled, isLoading }) => (
  <HStack spacing={1}>
    <IconButton
      aria-label={`Decrease ${label}`}
      icon={quantity <= 1 ? <Trash2 size={13} /> : <Minus size={13} />}
      size="xs"
      variant="outline"
      colorScheme={quantity <= 1 ? 'red' : 'gray'}
      onClick={() => onChange(quantity - 1)}
      isDisabled={isDisabled || isLoading}
    />
    <Text minW="22px" textAlign="center" fontSize="sm" fontWeight="700">{quantity}</Text>
    <IconButton
      aria-label={`Increase ${label}`}
      icon={<Plus size={13} />}
      size="xs"
      variant="outline"
      onClick={() => onChange(quantity + 1)}
      isDisabled={isDisabled || isLoading}
    />
  </HStack>
);

const TotalRow = ({ label, value, bold, muted }) => (
  <Flex justify="space-between" fontSize={bold ? 'lg' : 'sm'} fontWeight={bold ? '700' : '500'} color={muted}>
    <Text>{label}</Text>
    <Text>{value}</Text>
  </Flex>
);

/**
 * Current order lines (saved on the server) plus new, unsaved lines.
 */
const CurrentOrderSummary = ({
  order,
  draft,
  formatPrice,
  canEdit,
  busyItemId,
  onSavedQuantityChange,
  onDraftQuantityChange,
  onDraftNoteChange,
  getCurrencySymbol,
  canDiscount,
  onOrderUpdated,
}) => {
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const sectionColor = useColorModeValue('gray.600', 'gray.300');
  const draftBg = useColorModeValue('green.50', 'rgba(72,187,120,0.1)');
  const noteBg = useColorModeValue('white', 'gray.800');

  const savedItems = order?.items || [];
  const draftSubtotal = draft.reduce((sum, line) => sum + (parseFloat(line.menuItem.price) || 0) * line.quantity, 0);
  const num = (value) => parseFloat(value) || 0;

  return (
    <Flex direction="column" h="full" minH={0}>
      <Box flex={1} overflowY="auto" minH={0} pr={1}>
        {/* Saved items */}
        {order && (
          <>
            <Text fontSize="xs" fontWeight="700" color={sectionColor} textTransform="uppercase" letterSpacing="0.05em" mb={2}>
              Ordered items
            </Text>
            {savedItems.length === 0 ? (
              <Text fontSize="sm" color={mutedColor} mb={4}>No items on this order yet.</Text>
            ) : (
              <VStack align="stretch" spacing={2} mb={4}>
                {savedItems.map((item) => {
                  const cancelled = item.status === 'cancelled';
                  const lineTotal = num(item.total_price) || num(item.unit_price) * item.quantity;
                  return (
                    <Flex key={item.id} align="center" gap={2} opacity={cancelled ? 0.5 : 1}>
                      <Box flex={1} minW={0}>
                        <HStack spacing={2}>
                          <Text fontSize="sm" fontWeight="600" noOfLines={1} textDecoration={cancelled ? 'line-through' : 'none'}>
                            {item.menu_item_name}
                          </Text>
                          {ITEM_STATUS_COLORS[item.status] && (
                            <Badge colorScheme={ITEM_STATUS_COLORS[item.status]} fontSize="2xs">{item.status}</Badge>
                          )}
                        </HStack>
                        <Text fontSize="xs" color={mutedColor}>
                          {formatPrice(item.unit_price || 0)} each
                          {item.special_instructions ? ` · ${item.special_instructions}` : ''}
                        </Text>
                      </Box>
                      {canEdit && !cancelled ? (
                        <QuantityStepper
                          label={item.menu_item_name}
                          quantity={item.quantity}
                          onChange={(q) => onSavedQuantityChange(item, q)}
                          isLoading={busyItemId === item.id}
                        />
                      ) : (
                        <Text fontSize="sm" fontWeight="600" minW="36px" textAlign="right">×{item.quantity}</Text>
                      )}
                      <Text fontSize="sm" fontWeight="600" minW="72px" textAlign="right">{formatPrice(lineTotal)}</Text>
                    </Flex>
                  );
                })}
              </VStack>
            )}
          </>
        )}

        {/* Unsaved items */}
        {draft.length > 0 && (
          <Box bg={draftBg} borderRadius="12px" p={3} mb={3}>
            <Text fontSize="xs" fontWeight="700" color="green.700" textTransform="uppercase" letterSpacing="0.05em" mb={2}>
              {order ? 'New items (not added yet)' : 'Items for this order'}
            </Text>
            <VStack align="stretch" spacing={3}>
              {draft.map((line) => (
                <Box key={line.menuItem.id}>
                  <Flex align="center" gap={2}>
                    <Text flex={1} fontSize="sm" fontWeight="600" noOfLines={1}>{line.menuItem.name}</Text>
                    <QuantityStepper
                      label={line.menuItem.name}
                      quantity={line.quantity}
                      onChange={(q) => onDraftQuantityChange(line.menuItem.id, q)}
                    />
                    <Text fontSize="sm" fontWeight="600" minW="72px" textAlign="right">
                      {formatPrice((parseFloat(line.menuItem.price) || 0) * line.quantity)}
                    </Text>
                  </Flex>
                  <Input
                    mt={1.5}
                    size="xs"
                    bg={noteBg}
                    borderRadius="6px"
                    placeholder="Kitchen note (optional), e.g. less spicy"
                    aria-label={`Kitchen note for ${line.menuItem.name}`}
                    value={line.note}
                    maxLength={200}
                    onChange={(e) => onDraftNoteChange(line.menuItem.id, e.target.value)}
                  />
                </Box>
              ))}
            </VStack>
          </Box>
        )}

        {!order && draft.length === 0 && (
          <Flex h="full" minH="160px" align="center" justify="center" direction="column" color={mutedColor} textAlign="center" px={4}>
            <Text fontSize="sm" fontWeight="600">No items yet</Text>
            <Text fontSize="xs">Search the menu and add items to start this order.</Text>
          </Flex>
        )}
      </Box>

      {/* Totals */}
      <Box pt={3}>
        <Divider mb={3} />
        <VStack align="stretch" spacing={1}>
          {order ? (
            <>
              <TotalRow label="Subtotal" value={formatPrice(order.subtotal || 0)} muted={mutedColor} />
              <DiscountLine
                order={order}
                formatPrice={formatPrice}
                getCurrencySymbol={getCurrencySymbol}
                canEdit={canDiscount}
                onOrderUpdated={onOrderUpdated}
                mutedColor={mutedColor}
                isDisabled={draft.length > 0}
                disabledReason="Add the new items first"
              />
              {num(order.service_charge) > 0 && (
                <TotalRow label="Service charge" value={formatPrice(order.service_charge)} muted={mutedColor} />
              )}
              {num(order.tax_amount) > 0 && (
                <TotalRow label="Taxes" value={formatPrice(order.tax_amount)} muted={mutedColor} />
              )}
              <TotalRow label="Total" value={formatPrice(order.total_amount || 0)} bold />
              {draft.length > 0 && (
                <Tooltip label="Taxes and charges are recalculated by the server when the items are added" fontSize="xs">
                  <Text fontSize="xs" color="green.600" textAlign="right">
                    + {formatPrice(draftSubtotal)} in new items before tax
                  </Text>
                </Tooltip>
              )}
            </>
          ) : (
            <>
              <TotalRow label="Subtotal" value={formatPrice(draftSubtotal)} bold />
              <Text fontSize="xs" color={mutedColor} textAlign="right">
                Taxes, service charge and discounts are applied when the order is placed.
              </Text>
            </>
          )}
        </VStack>
      </Box>
    </Flex>
  );
};

export default CurrentOrderSummary;
