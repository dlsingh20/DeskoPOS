import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
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
  Select,
  SimpleGrid,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { MoreVertical, Pencil, Plus, Power } from 'lucide-react';
import productService, { describeProductError } from '../../services/ProductService';
import { EMPTY_CATEGORY, categoryFormToPayload, categoryToForm, validateCategory } from '../../utils/productUtils';
import { categoryTaxIds, categoryTaxSummary, describeTax, previewTaxes } from '../../utils/taxUtils';

/**
 * Menu to put a new category in: the chosen one, the restaurant's only menu, or a new
 * "<Restaurant> Menu" when the restaurant has none yet.
 */
export const ensureMenuId = async (form, menus, restaurant) => {
  if (form.menu) return parseInt(form.menu, 10);
  if (menus.length > 0) return menus[0].id;
  const created = await productService.createMenu(restaurant.id, `${restaurant.name} Menu`);
  return created.id;
};

const CategoryFormDialog = ({ isOpen, onClose, category, categories, menus, restaurant, productCount, taxState, formatPrice, onSaved }) => {
  const [form, setForm] = useState(EMPTY_CATEGORY);
  const [taxIds, setTaxIds] = useState([]);
  const useTaxes = !!taxState?.available;
  // Tax list failed to load: we can't tell which tax model applies, so leave the category's tax alone
  const taxLoadError = taxState?.error || null;
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(category ? categoryToForm(category) : { ...EMPTY_CATEGORY, menu: menus.length === 1 ? String(menus[0].id) : '' });
    setTaxIds(category ? categoryTaxIds(category) : []);
    setShowErrors(false);
    setError(null);
  }, [isOpen, category, menus]);

  // Active taxes, plus inactive ones this category still has (so they can be unticked)
  const taxOptions = useTaxes ? taxState.taxes.filter((t) => t.is_active !== false || taxIds.includes(Number(t.id))) : [];
  const checkedTaxes = taxOptions.filter((t) => taxIds.includes(Number(t.id)));
  const toggleTax = (id) => setTaxIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const preview = useTaxes && checkedTaxes.length ? previewTaxes(200, 1, checkedTaxes, { formatPrice }) : null;
  const originalTaxIds = category ? categoryTaxIds(category) : [];
  const taxIdsChanged = useTaxes && category && (originalTaxIds.length !== taxIds.length || originalTaxIds.some((id) => !taxIds.includes(id)));

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const errors = validateCategory(form, { categories, editingId: category?.id ?? null });
  const isValid = Object.keys(errors).length === 0;
  const shown = (k) => (showErrors ? errors[k] : null);
  const taxChanged = category && (useTaxes ? taxIdsChanged : Number(form.tax_rate || 0) !== Number(category.tax_rate || 0));

  const save = async () => {
    setShowErrors(true);
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = categoryFormToPayload(form);
      if (useTaxes) {
        // The server derives the legacy tax_rate from the percentage taxes
        delete payload.tax_rate;
        // An empty tax_ids means "no tax", so don't send it for a single-rate category the user didn't retick
        if (!category || originalTaxIds.length || taxIdsChanged) payload.tax_ids = taxIds;
      } else if (taxLoadError) {
        delete payload.tax_rate;
      }
      let saved;
      if (category) {
        delete payload.menu;
        saved = await productService.updateCategory(category.id, payload);
      } else {
        payload.menu = await ensureMenuId(form, menus, restaurant);
        saved = await productService.createCategory(payload);
      }
      onSaved(saved, !!category);
      onClose();
    } catch (err) {
      setError(describeProductError(err, 'Could not save the category.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} size="lg" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{category ? 'Edit category' : 'Add category'}</ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <FormControl isRequired isInvalid={!!shown('name')}>
              <FormLabel fontSize="sm">Category name</FormLabel>
              <Input value={form.name} onChange={set('name')} maxLength={100} autoFocus placeholder="e.g. Starters, Hot Beverages" />
              <FormErrorMessage>{errors.name}</FormErrorMessage>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Description</FormLabel>
              <Textarea value={form.description} onChange={set('description')} rows={2} maxLength={500} />
            </FormControl>
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
              {!useTaxes && !taxLoadError && <FormControl isInvalid={!!shown('tax_rate')}>
                <FormLabel fontSize="sm">Tax rate</FormLabel>
                <InputGroup>
                  <Input value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="0" />
                  <InputRightAddon>%</InputRightAddon>
                </InputGroup>
                {errors.tax_rate && showErrors ? <FormErrorMessage>{errors.tax_rate}</FormErrorMessage> : <FormHelperText fontSize="xs">Applied to every product in this category.</FormHelperText>}
              </FormControl>}
              <FormControl isInvalid={!!shown('sort_order')}>
                <FormLabel fontSize="sm">Display order</FormLabel>
                <Input value={form.sort_order} onChange={set('sort_order')} inputMode="numeric" />
                <FormErrorMessage>{errors.sort_order}</FormErrorMessage>
              </FormControl>
            </SimpleGrid>
            {taxLoadError && (
              <Alert status="warning" borderRadius="10px" fontSize="sm" alignItems="flex-start">
                <AlertIcon />
                <AlertDescription>Taxes could not be loaded ({taxLoadError}). Saving keeps this category's tax as it is; reload to change it.</AlertDescription>
              </Alert>
            )}
            {useTaxes && (
              <FormControl>
                <FormLabel fontSize="sm">Taxes</FormLabel>
                {taxOptions.length === 0 ? (
                  <Text fontSize="sm" color="gray.500">No taxes yet. Create them under Product Management → Taxes.</Text>
                ) : (
                  <Box borderWidth="1px" borderRadius="10px" px={3} py={2} maxH="220px" overflowY="auto">
                    <VStack align="stretch" spacing={1}>
                      {taxOptions.map((t) => (
                        <Checkbox key={t.id} isChecked={taxIds.includes(Number(t.id))} onChange={() => toggleTax(Number(t.id))}>
                          <Text as="span" fontSize="sm">{describeTax(t, formatPrice)}</Text>
                          {t.is_active === false && <Badge ml={2} fontSize="2xs">Inactive</Badge>}
                        </Checkbox>
                      ))}
                    </VStack>
                  </Box>
                )}
                {category && !originalTaxIds.length && Number(category.tax_rate || 0) > 0 && (
                  <FormHelperText fontSize="xs">Currently taxed at {Number(category.tax_rate)}% (single rate). Tick the taxes that make up this rate to replace it.</FormHelperText>
                )}
                {preview && (
                  <Box fontSize="xs" mt={2} bg="gray.50" _dark={{ bg: 'whiteAlpha.100' }} borderRadius="8px" px={3} py={2}>
                    <Text fontWeight="600" mb={1}>On a {formatPrice(200)} item</Text>
                    {preview.lines.map((l) => (
                      <Flex key={l.id} justify="space-between"><Text>{l.label}{l.perBill ? ' (once per bill)' : ''}</Text><Text>{formatPrice(l.amount)}</Text></Flex>
                    ))}
                    <Flex justify="space-between" fontWeight="700"><Text>Total</Text><Text>{formatPrice(preview.total)}</Text></Flex>
                  </Box>
                )}
              </FormControl>
            )}
            {!category && menus.length > 1 && (
              <FormControl>
                <FormLabel fontSize="sm">Menu</FormLabel>
                <Select value={form.menu} onChange={set('menu')} placeholder="Choose a menu">
                  {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </FormControl>
            )}
            {!category && menus.length === 0 && (
              <Text fontSize="xs" color="gray.500">This restaurant has no menu yet. A menu named “{restaurant?.name} Menu” is created with the first category.</Text>
            )}
            <FormControl display="flex" alignItems="center" gap={3}>
              <Switch id="cat-active" isChecked={form.is_available} onChange={set('is_available')} />
              <FormLabel htmlFor="cat-active" mb={0} fontSize="sm">Active (shown when taking orders)</FormLabel>
            </FormControl>
            {taxChanged && (
              <Alert status="warning" borderRadius="10px" fontSize="sm" alignItems="flex-start">
                <AlertIcon />
                <AlertDescription>
                  The new {useTaxes ? 'taxes apply' : 'rate applies'} to {productCount} product(s) from now on. Settled bills keep the tax they were charged; open orders may be recalculated by the server when they change.
                </AlertDescription>
              </Alert>
            )}
            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={saving}>Cancel</Button>
          <Button colorScheme="blue" onClick={save} isLoading={saving} loadingText="Saving">{category ? 'Save changes' : 'Add category'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const CategoriesPanel = ({ categories, products, menus, restaurant, taxState, formatPrice, onChanged }) => {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // { category }
  const [busyId, setBusyId] = useState(null);
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const panelBg = useColorModeValue('white', 'gray.800');
  const headBg = useColorModeValue('gray.50', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const counts = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const c = map.get(String(p.category)) || { total: 0, available: 0 };
      c.total += 1;
      if (p.is_available !== false) c.available += 1;
      map.set(String(p.category), c);
    });
    return map;
  }, [products]);

  const sorted = useMemo(() => [...categories].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name).localeCompare(String(b.name))), [categories]);

  const toggleActive = async (c) => {
    setBusyId(c.id);
    try {
      await productService.updateCategory(c.id, { is_available: c.is_available === false });
      toast({ title: c.is_available === false ? 'Category active' : 'Category inactive', description: c.name, status: 'success', duration: 2500 });
      onChanged();
    } catch (error) {
      toast({ title: 'Could not change the category', description: describeProductError(error), status: 'error', duration: 5000, isClosable: true });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={3} gap={2} wrap="wrap">
        <Text fontSize="sm" color={muted}>{taxState?.available ? 'The taxes ticked on a category apply to all of its products.' : 'Each category has one tax rate that applies to all of its products.'}</Text>
        <Button size="sm" colorScheme="blue" leftIcon={<Plus size={14} />} onClick={() => setDialog({ category: null })}>Add category</Button>
      </Flex>
      <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
        {sorted.length === 0 ? (
          <Center py={12}>
            <VStack spacing={1}>
              <Text fontWeight="600">No categories yet</Text>
              <Text fontSize="sm" color={muted}>Start with categories such as Starters, Main Course and Beverages.</Text>
            </VStack>
          </Center>
        ) : (
          <Table size="sm" minW="640px">
            <Thead bg={headBg}>
              <Tr><Th>Category</Th><Th isNumeric>Products</Th><Th isNumeric>{taxState?.available ? 'Taxes' : 'Tax rate'}</Th><Th isNumeric>Display order</Th><Th>Status</Th><Th w="48px" /></Tr>
            </Thead>
            <Tbody>
              {sorted.map((c) => {
                const n = counts.get(String(c.id)) || { total: 0, available: 0 };
                return (
                  <Tr key={c.id} opacity={c.is_available === false ? 0.6 : 1}>
                    <Td>
                      <Text fontWeight="600">{c.name}</Text>
                      {c.description && <Text fontSize="xs" color={muted} noOfLines={1}>{c.description}</Text>}
                    </Td>
                    <Td isNumeric>{n.total}{n.total !== n.available ? <Text as="span" fontSize="xs" color={muted}> ({n.available} available)</Text> : null}</Td>
                    <Td isNumeric fontSize={taxState?.available ? 'xs' : undefined}>{taxState?.available ? categoryTaxSummary(c, taxState.taxes, formatPrice) : `${Number(c.tax_rate || 0)}%`}</Td>
                    <Td isNumeric>{c.sort_order ?? '—'}</Td>
                    <Td><Badge colorScheme={c.is_available === false ? 'gray' : 'green'}>{c.is_available === false ? 'Inactive' : 'Active'}</Badge></Td>
                    <Td>
                      <Menu placement="bottom-end">
                        <MenuButton as={IconButton} size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label={`Actions for ${c.name}`} isDisabled={busyId === c.id} />
                        <MenuList fontSize="sm">
                          <MenuItem icon={<Pencil size={14} />} onClick={() => setDialog({ category: c })}>Edit</MenuItem>
                          <MenuItem icon={<Power size={14} />} onClick={() => toggleActive(c)}>{c.is_available === false ? 'Make active' : 'Make inactive'}</MenuItem>
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
      <HStack mt={2}><Text fontSize="xs" color={muted}>Inactive categories are hidden when taking orders; their products and past bills are kept.</Text></HStack>

      <CategoryFormDialog
        isOpen={!!dialog}
        onClose={() => setDialog(null)}
        category={dialog?.category || null}
        categories={categories}
        menus={menus}
        restaurant={restaurant}
        taxState={taxState}
        formatPrice={formatPrice}
        productCount={dialog?.category ? (counts.get(String(dialog.category.id))?.total || 0) : 0}
        onSaved={(saved, isEdit) => {
          toast({ title: isEdit ? 'Category updated' : 'Category added', description: saved?.name, status: 'success', duration: 2500 });
          onChanged();
        }}
      />
    </Box>
  );
};

export default CategoriesPanel;
