import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  ButtonGroup,
  Divider,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { useModal } from '../../hooks/useModal';
import { useAccess } from '../../context/AccessContext';
import discountService, {
  DISCOUNT_REASONS,
  MAX_DISCOUNT_PERCENT,
  QUICK_PERCENTS,
  computeDiscount,
  getDiscountInfo,
  round2,
} from '../../services/DiscountService';

const num = (value) => parseFloat(value) || 0;

/**
 * Apply, edit or remove a bill-level discount (percent or fixed).
 * Calls onApplied(updatedOrder) after the server confirms the new totals.
 */
const DiscountDialog = ({ isOpen, onClose, order, formatPrice, getCurrencySymbol, onApplied, initialType }) => {
  useModal(isOpen, 'DiscountDialog');
  const { access, requestApproval } = useAccess();
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('');
  const [reasonChoice, setReasonChoice] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const savingRef = useRef(false);

  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const previewBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const activeBg = useColorModeValue('blue.600', 'blue.400');

  const info = order ? getDiscountInfo(order) : null;
  const hasDiscount = info?.amount > 0;
  const subtotal = round2(num(order?.subtotal));

  // Start from the current discount when editing
  useEffect(() => {
    if (!isOpen || !order) return;
    const current = getDiscountInfo(order);
    const startType = initialType || (current.amount > 0 ? current.type : 'percent');
    setType(startType);
    if (current.amount > 0 && current.type === 'percent' && startType === 'percent') setValue(String(current.percent));
    else if (current.amount > 0 && startType === 'fixed') setValue(current.amount.toFixed(2));
    else setValue('');
    const reason = current.note?.reason || '';
    if (reason && DISCOUNT_REASONS.includes(reason)) { setReasonChoice(reason); setOtherReason(''); }
    else if (reason) { setReasonChoice('Other'); setOtherReason(reason); }
    else { setReasonChoice(''); setOtherReason(''); }
    setError(null);
    setTouched(false);
    // Only when the dialog opens: a failed save refreshes `order` and must not wipe the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const calc = computeDiscount({ type, value, subtotal });
  const reason = reasonChoice === 'Other' ? otherReason.trim() : reasonChoice;
  const reasonError = !reasonChoice ? 'Choose a reason.' : (reasonChoice === 'Other' && !otherReason.trim() ? 'Describe the reason.' : null);
  const valueError = value === '' ? 'Enter a discount.' : calc.error;
  const isValid = !valueError && !reasonError;

  // Estimate only: the server recalculates tax and charges
  // Above the user's limit (cashiers: 10% by default) a manager must approve
  const discountLimit = access?.discountLimit ?? 100;
  const needsApproval = !calc.error && value !== '' && calc.percent > discountLimit + 0.001;

  const estimatedTotal = round2(num(order?.total_amount) + info?.amount - (calc.error ? 0 : calc.amount));

  const askApproval = async () => {
    savingRef.current = true;
    const approver = await requestApproval({
      permission: 'discount.unlimited',
      title: `Discount of ${calc.percent}% (${formatPrice(calc.amount)})`,
      detail: `Bill #${order.order_number}. Your limit is ${discountLimit}% of the subtotal.`,
      orderId: order.id,
      context: { discount_type: type, discount_value: String(value), amount: calc.amount.toFixed(2) },
    });
    savingRef.current = false;
    return approver;
  };

  const save = async (removing = false) => {
    if (savingRef.current) return;
    let approver = null;
    if (!removing) {
      setTouched(true);
      if (!isValid) return;
      if (needsApproval) {
        approver = await askApproval();
        if (!approver) return;
      }
    }
    const submit = (approval) => (removing
      ? discountService.removeDiscount({ orderId: order.id, expectedSubtotal: subtotal })
      : discountService.applyDiscount({
        orderId: order.id,
        type,
        value,
        reason,
        expectedSubtotal: subtotal,
        approvedBy: approval && !approval.self ? approval.name : '',
        approvalId: approval?.approvalId || null,
      }));

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      let updated;
      try {
        updated = await submit(approver);
      } catch (err) {
        // The server's limit can be stricter than the app's: ask once and retry with the approval
        if (!err.approvalRequired || removing || approver) throw err;
        setSaving(false);
        savingRef.current = false;
        approver = await askApproval();
        if (!approver) return;
        savingRef.current = true;
        setSaving(true);
        updated = await submit(approver);
      }
      onApplied(updated, removing);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save the discount.');
      if (err.order) onApplied(err.order, removing, true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const symbol = getCurrencySymbol ? getCurrencySymbol() : '₹';

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} size="md" isCentered closeOnOverlayClick={!saving} closeOnEsc={!saving}>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader pb={1}>
          <Flex justify="space-between" align="baseline" pr={8}>
            <Text>{hasDiscount ? 'Edit Discount' : 'Apply Discount'}</Text>
            <Text fontSize="sm" color={mutedColor} fontWeight="500">Bill #{order?.order_number}</Text>
          </Flex>
        </ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <ButtonGroup isAttached w="full" size="sm" mb={4} role="radiogroup" aria-label="Discount type">
            {[{ key: 'percent', label: 'Percent (%)' }, { key: 'fixed', label: `Fixed (${symbol})` }].map((t) => (
              <Button
                key={t.key}
                flex={1}
                role="radio"
                aria-checked={type === t.key}
                variant={type === t.key ? 'solid' : 'outline'}
                bg={type === t.key ? activeBg : undefined}
                color={type === t.key ? 'white' : undefined}
                _hover={type === t.key ? { bg: activeBg } : undefined}
                onClick={() => { setType(t.key); setValue(''); setError(null); }}
              >
                {t.label}
              </Button>
            ))}
          </ButtonGroup>

          <FormControl isInvalid={touched && !!valueError} mb={3}>
            <FormLabel fontSize="sm" mb={1}>Value</FormLabel>
            <InputGroup>
              {type === 'fixed' && <InputLeftAddon>{symbol}</InputLeftAddon>}
              <Input
                autoFocus
                inputMode="decimal"
                value={value}
                placeholder={type === 'percent' ? 'e.g. 10' : 'e.g. 100.00'}
                onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                aria-label={type === 'percent' ? 'Discount percent' : 'Discount amount'}
              />
              {type === 'percent' && <InputRightAddon>%</InputRightAddon>}
            </InputGroup>
            <FormErrorMessage>{valueError}</FormErrorMessage>
            {!(touched && valueError) && value !== '' && calc.error && (
              <Text fontSize="xs" color="red.500" mt={1}>{calc.error}</Text>
            )}
          </FormControl>

          {type === 'percent' && (
            <HStack spacing={2} mb={4} wrap="wrap">
              <Text fontSize="xs" color={mutedColor}>Quick:</Text>
              {QUICK_PERCENTS.filter((p) => !MAX_DISCOUNT_PERCENT || p <= MAX_DISCOUNT_PERCENT).map((p) => (
                <Button key={p} size="xs" variant={num(value) === p ? 'solid' : 'outline'} colorScheme="blue" onClick={() => setValue(String(p))}>
                  {p}%
                </Button>
              ))}
            </HStack>
          )}

          <FormControl isInvalid={touched && !!reasonError} mb={4}>
            <FormLabel fontSize="sm" mb={1}>Reason</FormLabel>
            <Select placeholder="Choose a reason" value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)} aria-label="Discount reason">
              {DISCOUNT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            {reasonChoice === 'Other' && (
              <Input mt={2} placeholder="Describe the reason" value={otherReason} maxLength={120} onChange={(e) => setOtherReason(e.target.value.replace(/[|\n]/g, ' '))} aria-label="Other reason" />
            )}
            <FormErrorMessage>{reasonError}</FormErrorMessage>
          </FormControl>

          <Box bg={previewBg} borderRadius="10px" px={4} py={3} fontSize="sm">
            <Flex justify="space-between"><Text color={mutedColor}>Subtotal</Text><Text>{formatPrice(subtotal)}</Text></Flex>
            <Flex justify="space-between" color="green.600" fontWeight="600">
              <Text>Disc{type === 'percent' && !calc.error && value ? ` (${round2(num(value))}%)` : ''}</Text>
              <Text>− {formatPrice(calc.error ? 0 : calc.amount)}</Text>
            </Flex>
            {hasDiscount && (
              <Flex justify="space-between" color={mutedColor} fontSize="xs"><Text>Current discount</Text><Text>− {formatPrice(info.amount)}</Text></Flex>
            )}
            <Divider my={2} />
            <Flex justify="space-between" fontWeight="700">
              <Text>New total (approx.)</Text><Text>{formatPrice(Math.max(0, estimatedTotal))}</Text>
            </Flex>
            <Text fontSize="xs" color={mutedColor} mt={1}>
              Calculated on the food subtotal. Tax and service charge are recalculated by the server.
              {MAX_DISCOUNT_PERCENT ? ` Limit: ${MAX_DISCOUNT_PERCENT}%.` : ''}
              {discountLimit < 100 ? ` Above ${discountLimit}% needs a manager's approval.` : ''}
            </Text>
          </Box>

          {error && (
            <Alert status="error" borderRadius="10px" mt={3} fontSize="sm">
              <AlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          {hasDiscount && (
            <Button variant="ghost" colorScheme="red" mr="auto" onClick={() => save(true)} isDisabled={saving}>
              Remove discount
            </Button>
          )}
          <Button variant="outline" onClick={onClose} isDisabled={saving}>Cancel</Button>
          <Button colorScheme="blue" onClick={() => save(false)} isLoading={saving} loadingText="Applying">{needsApproval ? 'Apply (needs approval)' : 'Apply'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default DiscountDialog;
