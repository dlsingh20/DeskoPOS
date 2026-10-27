import React, { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputLeftAddon,
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
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Textarea,
  VStack,
  Wrap,
  WrapItem,
  useColorModeValue,
} from '@chakra-ui/react';
import productService, { describeProductError } from '../../services/ProductService';
import {
  COMMON_ALLERGENS,
  DIETARY_FLAGS,
  EMPTY_PRODUCT,
  formToPayload,
  normalizeAllergens,
  validateProduct,
} from '../../utils/productUtils';

const Section = ({ title, children }) => {
  const muted = useColorModeValue('gray.500', 'gray.400');
  return (
    <Box>
      <Text fontSize="xs" fontWeight="700" color={muted} textTransform="uppercase" letterSpacing="0.05em" mb={2}>{title}</Text>
      {children}
    </Box>
  );
};

/**
 * Add / edit / duplicate a product. `initial` is form values; `productId` set means edit.
 */
const ProductFormDialog = ({ isOpen, onClose, initial, productId, categories, products, decimals, currencySymbol, onSaved }) => {
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [customAllergen, setCustomAllergen] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const muted = useColorModeValue('gray.500', 'gray.400');

  useEffect(() => {
    if (!isOpen) return;
    setForm({ ...EMPTY_PRODUCT, ...initial });
    setCustomAllergen('');
    setShowErrors(false);
    setError(null);
  }, [isOpen, initial]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const errors = validateProduct(form, { decimals, products, editingId: productId });
  const shown = (key) => (showErrors ? errors[key] : null);
  const isValid = Object.keys(errors).length === 0;

  const toggleAllergen = (a) => setForm((f) => ({
    ...f,
    allergens: f.allergens.includes(a) ? f.allergens.filter((x) => x !== a) : [...f.allergens, a],
  }));
  const addCustom = () => {
    const extra = normalizeAllergens(customAllergen);
    if (!extra.length) return;
    setForm((f) => ({ ...f, allergens: normalizeAllergens([...f.allergens, ...extra]) }));
    setCustomAllergen('');
  };

  const save = async () => {
    setShowErrors(true);
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = formToPayload(form, decimals);
      const saved = productId ? await productService.updateProduct(productId, payload) : await productService.createProduct(payload);
      onSaved(saved, !!productId);
      onClose();
    } catch (err) {
      setError(describeProductError(err, 'Could not save the product.'));
    } finally {
      setSaving(false);
    }
  };

  const activeCategories = categories.filter((c) => c.is_available !== false || String(c.id) === form.category);
  const custom = form.allergens.filter((a) => !COMMON_ALLERGENS.includes(a));

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} size="3xl" scrollBehavior="inside" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{productId ? 'Edit product' : 'Add product'}</ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <VStack align="stretch" spacing={6}>
            <Section title="Basic information">
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl isRequired isInvalid={!!shown('name')} gridColumn={{ md: 'span 2' }}>
                  <FormLabel fontSize="sm">Product name</FormLabel>
                  <Input value={form.name} onChange={set('name')} maxLength={200} autoFocus />
                  <FormErrorMessage>{errors.name}</FormErrorMessage>
                </FormControl>
                <FormControl isRequired isInvalid={!!shown('category')}>
                  <FormLabel fontSize="sm">Category</FormLabel>
                  <Select placeholder="Choose a category" value={form.category} onChange={set('category')}>
                    {activeCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{Number(c.tax_rate) > 0 ? ` (tax ${Number(c.tax_rate)}%)` : ''}</option>
                    ))}
                  </Select>
                  {errors.category && showErrors ? <FormErrorMessage>{errors.category}</FormErrorMessage> : (
                    <FormHelperText fontSize="xs">Tax comes from the category.</FormHelperText>
                  )}
                </FormControl>
                <FormControl isRequired isInvalid={!!shown('price')}>
                  <FormLabel fontSize="sm">Selling price</FormLabel>
                  <InputGroup>
                    <InputLeftAddon>{currencySymbol}</InputLeftAddon>
                    <Input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" />
                  </InputGroup>
                  <FormErrorMessage>{errors.price}</FormErrorMessage>
                </FormControl>
                <FormControl gridColumn={{ md: 'span 2' }}>
                  <FormLabel fontSize="sm">Description</FormLabel>
                  <Textarea value={form.description} onChange={set('description')} rows={2} maxLength={1000} />
                </FormControl>
                <FormControl display="flex" alignItems="center" gap={3}>
                  <Switch id="product-available" isChecked={form.is_available} onChange={set('is_available')} />
                  <FormLabel htmlFor="product-available" mb={0} fontSize="sm">Available for ordering</FormLabel>
                </FormControl>
              </SimpleGrid>
            </Section>

            <Section title="Dietary and allergens">
              <Wrap spacing={4} mb={3}>
                {DIETARY_FLAGS.map((d) => (
                  <WrapItem key={d.key}>
                    <Checkbox isChecked={form[d.key]} onChange={set(d.key)} isInvalid={d.key === 'is_vegetarian' && !!shown('is_vegetarian')}>{d.label}</Checkbox>
                  </WrapItem>
                ))}
              </Wrap>
              {shown('is_vegetarian') && <Text fontSize="xs" color="red.500" mb={2}>{errors.is_vegetarian}</Text>}
              <Text fontSize="sm" mb={1}>Allergens</Text>
              <Wrap spacing={2}>
                {COMMON_ALLERGENS.map((a) => {
                  const on = form.allergens.includes(a);
                  return (
                    <WrapItem key={a}>
                      <Button size="xs" borderRadius="full" variant={on ? 'solid' : 'outline'} colorScheme={on ? 'orange' : 'gray'} onClick={() => toggleAllergen(a)} aria-pressed={on} textTransform="capitalize">
                        {a}
                      </Button>
                    </WrapItem>
                  );
                })}
                {custom.map((a) => (
                  <WrapItem key={a}>
                    <Tag size="sm" borderRadius="full" colorScheme="orange"><TagLabel textTransform="capitalize">{a}</TagLabel><TagCloseButton onClick={() => toggleAllergen(a)} /></Tag>
                  </WrapItem>
                ))}
              </Wrap>
              <HStack mt={2} maxW="360px">
                <Input size="sm" placeholder="Other allergen" value={customAllergen} onChange={(e) => setCustomAllergen(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} aria-label="Other allergen" />
                <Button size="sm" onClick={addCustom} isDisabled={!customAllergen.trim()}>Add</Button>
              </HStack>
            </Section>

            <Section title="Kitchen">
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl isInvalid={!!shown('preparation_time_minutes')}>
                  <FormLabel fontSize="sm">Preparation time (minutes)</FormLabel>
                  <Input value={form.preparation_time_minutes} onChange={set('preparation_time_minutes')} inputMode="numeric" />
                  <FormErrorMessage>{errors.preparation_time_minutes}</FormErrorMessage>
                </FormControl>
                <FormControl gridColumn={{ md: 'span 2' }}>
                  <FormLabel fontSize="sm">Kitchen notes</FormLabel>
                  <Input value={form.kitchen_notes} onChange={set('kitchen_notes')} maxLength={500} placeholder="Shown to the kitchen with every order of this item" />
                </FormControl>
              </SimpleGrid>
            </Section>

            <Section title="Advanced">
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                <FormControl isInvalid={!!shown('calories')}>
                  <FormLabel fontSize="sm">Calories (kcal)</FormLabel>
                  <Input value={form.calories} onChange={set('calories')} inputMode="numeric" />
                  <FormErrorMessage>{errors.calories}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={!!shown('sort_order')}>
                  <FormLabel fontSize="sm">Display order</FormLabel>
                  <Input value={form.sort_order} onChange={set('sort_order')} inputMode="numeric" />
                  <FormErrorMessage>{errors.sort_order}</FormErrorMessage>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Image description</FormLabel>
                  <Input value={form.image_alt_text} onChange={set('image_alt_text')} maxLength={200} placeholder="For screen readers" />
                </FormControl>
              </SimpleGrid>
            </Section>

            <Text fontSize="xs" color={muted}>
              SKU, barcode, discount eligibility, tax profiles, channel prices, variants, modifiers and combos are added when the backend supports them.
            </Text>

            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Flex w="full" justify="space-between" align="center" gap={2}>
            <Text fontSize="xs" color={muted}>{showErrors && !isValid ? 'Check the highlighted fields.' : ''}</Text>
            <HStack>
              <Button variant="ghost" onClick={onClose} isDisabled={saving}>Cancel</Button>
              <Button colorScheme="blue" onClick={save} isLoading={saving} loadingText="Saving">{productId ? 'Save changes' : 'Add product'}</Button>
            </HStack>
          </Flex>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ProductFormDialog;
