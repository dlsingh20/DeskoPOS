import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  SimpleGrid,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  Wrap,
  WrapItem,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { MoreVertical, Pencil, Plus, Power } from 'lucide-react';
import taxService from '../../services/TaxService';
import { describeProductError } from '../../services/ProductService';
import {
  EMPTY_TAX,
  FIXED_BASIS,
  TAX_CHANNELS,
  TAX_TYPES,
  categoryTaxIds,
  previewTaxes,
  taxFormToPayload,
  taxToForm,
  validateTax,
} from '../../utils/taxUtils';

const TaxFormDialog = ({ isOpen, onClose, tax, taxes, restaurant, decimals, currencySymbol, formatPrice, onSaved }) => {
  const [form, setForm] = useState(EMPTY_TAX);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!isOpen) return;
    setForm(tax ? taxToForm(tax) : EMPTY_TAX);
    setShowErrors(false);
    setError(null);
  }, [isOpen, tax]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const errors = validateTax(form, { taxes, editingId: tax?.id ?? null, decimals });
  const shown = (k) => (showErrors ? errors[k] : null);
  const isValid = !Object.keys(errors).length;
  const toggleChannel = (key) => setForm((f) => ({ ...f, channels: f.channels.includes(key) ? f.channels.filter((c) => c !== key) : [...f.channels, key] }));

  const sample = isValid ? previewTaxes(200, 2, [{ ...taxFormToPayload(form, decimals), id: 'x', channels: [] }]) : null;

  const save = async () => {
    setShowErrors(true);
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = taxFormToPayload(form, decimals);
      const saved = tax ? await taxService.updateTax(tax.id, payload) : await taxService.createTax(restaurant.id, payload);
      onSaved(saved, !!tax);
      onClose();
    } catch (err) {
      setError(describeProductError(err, 'Could not save the tax.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} size="lg" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{tax ? `Edit ${tax.name}` : 'Add tax'}</ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
              <FormControl isRequired isInvalid={!!shown('name')}>
                <FormLabel fontSize="sm">Tax name</FormLabel>
                <Input value={form.name} onChange={set('name')} maxLength={60} autoFocus placeholder="e.g. CGST, VAT, Packing charge" />
                <FormErrorMessage>{errors.name}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={!!shown('code')}>
                <FormLabel fontSize="sm">Short code</FormLabel>
                <Input value={form.code} onChange={set('code')} maxLength={20} textTransform="uppercase" placeholder="e.g. CGST" />
                {errors.code && showErrors ? <FormErrorMessage>{errors.code}</FormErrorMessage> : <FormHelperText fontSize="xs">Optional; shown in reports.</FormHelperText>}
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel fontSize="sm">Type</FormLabel>
              <RadioGroup value={form.type} onChange={(type) => setForm((f) => ({ ...f, type }))}>
                <HStack spacing={6}>{TAX_TYPES.map((t) => <Radio key={t.key} value={t.key}>{t.label}</Radio>)}</HStack>
              </RadioGroup>
            </FormControl>

            {form.type === 'percentage' ? (
              <FormControl isRequired isInvalid={!!shown('rate')} maxW="220px">
                <FormLabel fontSize="sm">Rate</FormLabel>
                <InputGroup>
                  <Input value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="e.g. 2.5" />
                  <InputRightAddon>%</InputRightAddon>
                </InputGroup>
                <FormErrorMessage>{errors.rate}</FormErrorMessage>
              </FormControl>
            ) : (
              <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                <FormControl isRequired isInvalid={!!shown('amount')}>
                  <FormLabel fontSize="sm">Amount</FormLabel>
                  <InputGroup>
                    <InputLeftAddon>{currencySymbol}</InputLeftAddon>
                    <Input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="e.g. 10" />
                  </InputGroup>
                  <FormErrorMessage>{errors.amount}</FormErrorMessage>
                </FormControl>
                <FormControl isRequired isInvalid={!!shown('fixed_basis')}>
                  <FormLabel fontSize="sm">Charged</FormLabel>
                  <RadioGroup value={form.fixed_basis} onChange={(fixed_basis) => setForm((f) => ({ ...f, fixed_basis }))}>
                    <VStack align="stretch" spacing={1}>
                      {FIXED_BASIS.map((b) => (
                        <Radio key={b.key} value={b.key}><Text fontSize="sm">{b.label}</Text><Text fontSize="xs" color="gray.500">{b.hint}</Text></Radio>
                      ))}
                    </VStack>
                  </RadioGroup>
                </FormControl>
              </SimpleGrid>
            )}

            <FormControl isInvalid={!!shown('channels')}>
              <FormLabel fontSize="sm">Applies to</FormLabel>
              <Wrap spacing={4}>
                {TAX_CHANNELS.map((c) => (
                  <WrapItem key={c.key}><Checkbox isChecked={form.channels.includes(c.key)} onChange={() => toggleChannel(c.key)}>{c.label}</Checkbox></WrapItem>
                ))}
              </Wrap>
              <FormErrorMessage>{errors.channels}</FormErrorMessage>
            </FormControl>

            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
              <FormControl>
                <FormLabel fontSize="sm">Registration / reporting code</FormLabel>
                <Input value={form.reporting_code} onChange={set('reporting_code')} maxLength={30} placeholder="e.g. SAC 996331" />
              </FormControl>
              <FormControl display="flex" alignItems="center" gap={3} pt={{ sm: 7 }}>
                <Switch id="tax-active" isChecked={form.is_active} onChange={set('is_active')} />
                <FormLabel htmlFor="tax-active" mb={0} fontSize="sm">Active</FormLabel>
              </FormControl>
            </SimpleGrid>

            {sample && (
              <Box fontSize="sm" bg="gray.50" _dark={{ bg: 'whiteAlpha.100' }} borderRadius="10px" px={4} py={3}>
                <Text fontWeight="600" mb={1}>Example: 2 × {formatPrice(200)}</Text>
                <Flex justify="space-between"><Text>Items</Text><Text>{formatPrice(sample.lineAmount)}</Text></Flex>
                {sample.lines.map((l) => <Flex key={l.id} justify="space-between"><Text>{form.name || 'This tax'}{l.perBill ? ' (once per bill)' : ''}</Text><Text>{formatPrice(l.amount)}</Text></Flex>)}
                <Flex justify="space-between" fontWeight="700"><Text>Total</Text><Text>{formatPrice(sample.total)}</Text></Flex>
              </Box>
            )}
            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={saving}>Cancel</Button>
          <Button colorScheme="blue" onClick={save} isLoading={saving}>{tax ? 'Save changes' : 'Add tax'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/**
 * Taxes tab: the restaurant's tax master. Categories pick from these taxes.
 */
const TaxesPanel = ({ taxState, categories, restaurant, decimals, currencySymbol, formatPrice, onChanged }) => {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // { tax }
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const panelBg = useColorModeValue('white', 'gray.800');
  const headBg = useColorModeValue('gray.50', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  const { available, taxes } = taxState;

  const usage = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => categoryTaxIds(c).forEach((id) => map.set(id, [...(map.get(id) || []), c.name])));
    return map;
  }, [categories]);

  const toggleActive = async (t) => {
    try {
      await taxService.setTaxActive(t.id, t.is_active === false);
      toast({ title: t.is_active === false ? 'Tax active' : 'Tax inactive', description: t.name, status: 'success', duration: 2500 });
      onChanged();
    } catch (err) {
      toast({ title: 'Could not change the tax', description: describeProductError(err), status: 'error', duration: 5000, isClosable: true });
    }
  };

  if (taxState.error) {
    return (
      <Alert status="error" borderRadius="12px" alignItems="flex-start" py={4}>
        <AlertIcon mt={1} />
        <Box>
          <AlertTitle>Could not load the taxes</AlertTitle>
          <AlertDescription display="block" fontSize="sm">{taxState.error}</AlertDescription>
          <Button size="sm" mt={3} onClick={onChanged}>Try again</Button>
        </Box>
      </Alert>
    );
  }

  if (!available) {
    return (
      <Alert status="info" borderRadius="12px" alignItems="flex-start" py={4}>
        <AlertIcon mt={1} />
        <Box>
          <AlertTitle>Waiting for the server</AlertTitle>
          <AlertDescription display="block" fontSize="sm">
            Creating taxes (percentage or fixed) and choosing several per category needs the backend's tax endpoints,
            which are specified in the API document under “Tax master” and “Category taxes”. This screen starts working
            as soon as they are live.
            <Text mt={2}>Until then, each category has one tax rate: Categories → Edit → Tax rate.</Text>
          </AlertDescription>
        </Box>
      </Alert>
    );
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={3} gap={2} wrap="wrap">
        <Text fontSize="sm" color={muted}>Create each tax once, then tick it on the categories it applies to.</Text>
        <Button size="sm" colorScheme="blue" leftIcon={<Plus size={14} />} onClick={() => setDialog({ tax: null })}>Add tax</Button>
      </Flex>
      <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
        {taxes.length === 0 ? (
          <Center py={12}>
            <VStack spacing={1}>
              <Text fontWeight="600">No taxes yet</Text>
              <Text fontSize="sm" color={muted}>Examples: CGST 2.5%, SGST 2.5%, VAT 5%, Bottle deposit 10 per item, Packing 20 per bill.</Text>
            </VStack>
          </Center>
        ) : (
          <Table size="sm" minW="720px">
            <Thead bg={headBg}>
              <Tr><Th>Tax</Th><Th>Type</Th><Th isNumeric>Rate / amount</Th><Th>Applies to</Th><Th>Used by</Th><Th>Status</Th><Th w="48px" /></Tr>
            </Thead>
            <Tbody>
              {taxes.map((t) => {
                const used = usage.get(Number(t.id)) || [];
                return (
                  <Tr key={t.id} opacity={t.is_active === false ? 0.6 : 1}>
                    <Td><Text fontWeight="600">{t.name}</Text>{(t.code || t.reporting_code) && <Text fontSize="xs" color={muted}>{[t.code, t.reporting_code].filter(Boolean).join(' · ')}</Text>}</Td>
                    <Td>{t.type === 'fixed' ? `Fixed, ${t.fixed_basis === 'per_bill' ? 'per bill' : 'per item'}` : 'Percentage'}</Td>
                    <Td isNumeric fontWeight="600">{t.type === 'fixed' ? formatPrice(t.amount) : `${Number(t.rate)}%`}</Td>
                    <Td fontSize="xs">{(t.channels || []).map((c) => TAX_CHANNELS.find((x) => x.key === c)?.label || c).join(', ') || 'All'}</Td>
                    <Td fontSize="xs" color={muted} maxW="220px">{used.length ? `${used.length} categor${used.length > 1 ? 'ies' : 'y'}: ${used.slice(0, 3).join(', ')}${used.length > 3 ? '…' : ''}` : 'Not used'}</Td>
                    <Td><Badge colorScheme={t.is_active === false ? 'gray' : 'green'}>{t.is_active === false ? 'Inactive' : 'Active'}</Badge></Td>
                    <Td>
                      <Menu placement="bottom-end">
                        <MenuButton as={IconButton} size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label={`Actions for ${t.name}`} />
                        <MenuList fontSize="sm">
                          <MenuItem icon={<Pencil size={14} />} onClick={() => setDialog({ tax: t })}>Edit</MenuItem>
                          <MenuItem icon={<Power size={14} />} onClick={() => toggleActive(t)}>{t.is_active === false ? 'Make active' : 'Make inactive'}</MenuItem>
                        </MenuList>
                      </Menu>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Box>
      <Text fontSize="xs" color={muted} mt={2}>Changes apply to new orders. Settled bills keep the taxes they were charged. Inactive taxes stop applying but stay on past bills.</Text>

      <TaxFormDialog
        isOpen={!!dialog}
        onClose={() => setDialog(null)}
        tax={dialog?.tax || null}
        taxes={taxes}
        restaurant={restaurant}
        decimals={decimals}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
        onSaved={(saved, isEdit) => {
          toast({ title: isEdit ? 'Tax updated' : 'Tax added', description: saved?.name, status: 'success', duration: 2500 });
          onChanged();
        }}
      />
    </Box>
  );
};

export default TaxesPanel;
