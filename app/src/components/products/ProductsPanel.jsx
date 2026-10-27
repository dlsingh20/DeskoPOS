import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Flex,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { ArrowDown, ArrowUp, Copy, MoreVertical, Pencil, Plus, Power, Search } from 'lucide-react';
import productService from '../../services/ProductService';
import ProductFormDialog from './ProductFormDialog';
import {
  DIETARY_FLAGS,
  EMPTY_PRODUCT,
  duplicateForm,
  filterProducts,
  normalizeAllergens,
  productToForm,
  sortProducts,
} from '../../utils/productUtils';
import { categoryTaxSummary } from '../../utils/taxUtils';

const PAGE_SIZE = 50;

/** Price change for many products: percent or fixed amount, up or down */
const BulkPriceDialog = ({ isOpen, onClose, products, decimals, formatPrice, onApply }) => {
  const [mode, setMode] = useState('percent');
  const [direction, setDirection] = useState('increase');
  const [value, setValue] = useState('');
  useEffect(() => { if (isOpen) { setValue(''); setMode('percent'); setDirection('increase'); } }, [isOpen]);
  const v = parseFloat(value);
  const factor = 10 ** decimals;
  const newPrice = (p) => {
    const old = parseFloat(p.price) || 0;
    const delta = mode === 'percent' ? (old * v) / 100 : v;
    return Math.max(0, Math.round((old + (direction === 'increase' ? delta : -delta)) * factor) / factor);
  };
  const valid = Number.isFinite(v) && v > 0 && (mode === 'fixed' || v <= 100 || direction === 'increase');
  const sample = products.slice(0, 5);
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>Change price of {products.length} product(s)</ModalHeader>
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <RadioGroup value={direction} onChange={setDirection}>
              <HStack spacing={5}><Radio value="increase">Increase</Radio><Radio value="decrease">Decrease</Radio></HStack>
            </RadioGroup>
            <RadioGroup value={mode} onChange={setMode}>
              <HStack spacing={5}><Radio value="percent">By percent</Radio><Radio value="fixed">By fixed amount</Radio></HStack>
            </RadioGroup>
            <Input placeholder={mode === 'percent' ? 'e.g. 10 (%)' : 'e.g. 20'} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" autoFocus aria-label="Change amount" />
            {valid && (
              <Box fontSize="sm">
                <Text fontWeight="600" mb={1}>Preview</Text>
                {sample.map((p) => (
                  <Flex key={p.id} justify="space-between"><Text noOfLines={1}>{p.name}</Text><Text>{formatPrice(p.price)} → <b>{formatPrice(newPrice(p))}</b></Text></Flex>
                ))}
                {products.length > sample.length && <Text color="gray.500">…and {products.length - sample.length} more</Text>}
                <Text fontSize="xs" color="gray.500" mt={2}>Applies to new orders. Open orders and finalized bills keep the prices they were created with.</Text>
              </Box>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button colorScheme="blue" isDisabled={!valid} onClick={() => onApply(products.map((p) => ({ product: p, price: newPrice(p).toFixed(decimals) })))}>Apply</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const ProductsPanel = ({ products, categories, taxState, decimals, currencySymbol, formatPrice, onChanged, reloading }) => {
  const toast = useToast();
  const [filters, setFilters] = useState({ search: '', category: 'all', status: 'all', dietary: 'all' });
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // { initial, productId }
  const [priceOpen, setPriceOpen] = useState(false);
  const [bulk, setBulk] = useState(null); // { done, total, label }
  const [busyId, setBusyId] = useState(null);

  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const panelBg = useColorModeValue('white', 'gray.800');
  const headBg = useColorModeValue('gray.50', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  const selectedBg = useColorModeValue('blue.50', 'whiteAlpha.100');

  const categoryById = useMemo(() => new Map(categories.map((c) => [String(c.id), c])), [categories]);
  const categoryName = (id) => categoryById.get(String(id))?.name || '—';

  const list = useMemo(() => sortProducts(filterProducts(products, filters), sort, categoryName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, filters, sort, categoryById]);
  useEffect(() => { setPage(1); }, [filters, sort]);
  useEffect(() => { setSelected((prev) => new Set([...prev].filter((id) => products.some((p) => p.id === id)))); }, [products]);

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selectedProducts = products.filter((p) => selected.has(p.id));
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleVisible = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allVisibleSelected) visible.forEach((p) => n.delete(p.id)); else visible.forEach((p) => n.add(p.id));
    return n;
  });

  const toggleAvailable = async (p) => {
    setBusyId(p.id);
    try {
      await productService.setAvailability(p.id, p.is_available === false);
      toast({ title: p.is_available === false ? 'Product available' : 'Product unavailable', description: p.name, status: 'success', duration: 2500 });
      onChanged();
    } catch (error) {
      toast({ title: 'Could not change availability', description: error.message, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setBusyId(null);
    }
  };

  /** Runs a change on every selected product and reports partial failures */
  const runBulk = async (label, items, action) => {
    setBulk({ done: 0, total: items.length, label });
    const { done, failed } = await productService.runEach(items, action, (d, t) => setBulk({ done: d, total: t, label }));
    setBulk(null);
    if (failed.length) {
      toast({
        title: `${label}: ${done.length} done, ${failed.length} failed`,
        description: failed.slice(0, 3).map((f) => `${f.item.name || f.item.product?.name}: ${f.error}`).join(' · '),
        status: 'warning', duration: 8000, isClosable: true,
      });
    } else {
      toast({ title: `${label}: ${done.length} product(s) updated`, status: 'success', duration: 3000 });
      setSelected(new Set());
    }
    onChanged();
  };

  const SortHead = ({ k, children, numeric }) => (
    <Th cursor="pointer" onClick={() => toggleSort(k)} isNumeric={numeric} whiteSpace="nowrap" aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <HStack spacing={1} justify={numeric ? 'flex-end' : 'flex-start'}>
        <span>{children}</span>
        {sort.key === k && <Icon as={sort.dir === 'asc' ? ArrowUp : ArrowDown} boxSize={3} />}
      </HStack>
    </Th>
  );

  return (
    <Box>
      <Flex gap={2} wrap="wrap" mb={3} align="center">
        <InputGroup size="sm" maxW="280px">
          <InputLeftElement pointerEvents="none"><Search size={14} /></InputLeftElement>
          <Input placeholder="Search name, description, ID" value={filters.search} onChange={setFilter('search')} bg={panelBg} borderRadius="8px" aria-label="Search products" />
        </InputGroup>
        <Select size="sm" w="auto" bg={panelBg} borderRadius="8px" value={filters.category} onChange={setFilter('category')} aria-label="Category">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select size="sm" w="auto" bg={panelBg} borderRadius="8px" value={filters.status} onChange={setFilter('status')} aria-label="Availability">
          <option value="all">Any availability</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </Select>
        <Select size="sm" w="auto" bg={panelBg} borderRadius="8px" value={filters.dietary} onChange={setFilter('dietary')} aria-label="Dietary">
          <option value="all">Any dietary</option>
          {DIETARY_FLAGS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </Select>
        <Button size="sm" leftIcon={<Plus size={14} />} colorScheme="blue" ml="auto" onClick={() => setDialog({ initial: { ...EMPTY_PRODUCT, category: filters.category !== 'all' ? filters.category : '' }, productId: null })}
          isDisabled={categories.length === 0} title={categories.length === 0 ? 'Add a category first' : undefined}>
          Add product
        </Button>
      </Flex>

      {selected.size > 0 && (
        <Flex gap={2} wrap="wrap" align="center" mb={3} p={2} borderRadius="10px" bg={selectedBg}>
          <Text fontSize="sm" fontWeight="600" mr={2}>{selected.size} selected</Text>
          <Button size="xs" onClick={() => runBulk('Make available', selectedProducts, (p) => productService.setAvailability(p.id, true))}>Make available</Button>
          <Button size="xs" onClick={() => runBulk('Make unavailable', selectedProducts, (p) => productService.setAvailability(p.id, false))}>Make unavailable</Button>
          <Select size="xs" w="auto" bg={panelBg} placeholder="Move to category…" value="" aria-label="Move to category"
            onChange={(e) => { const id = e.target.value; if (id) runBulk(`Move to ${categoryName(id)}`, selectedProducts, (p) => productService.updateProduct(p.id, { category: parseInt(id, 10) })); }}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button size="xs" onClick={() => setPriceOpen(true)}>Change price</Button>
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </Flex>
      )}
      {bulk && <Box mb={3}><Text fontSize="sm" mb={1}>{bulk.label}: {bulk.done} of {bulk.total}…</Text><Progress size="xs" value={(bulk.done / bulk.total) * 100} borderRadius="full" /></Box>}

      <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
        {list.length === 0 ? (
          <Center py={12}>
            <VStack spacing={1}>
              <Text fontWeight="600">{products.length ? 'No products match the filters' : 'No products yet'}</Text>
              <Text fontSize="sm" color={muted}>{products.length ? 'Clear the search or filters.' : (categories.length ? 'Add your first product, or import a file.' : 'Create a category first, then add products.')}</Text>
            </VStack>
          </Center>
        ) : (
          <Table size="sm" minW="900px">
            <Thead bg={headBg}>
              <Tr>
                <Th w="36px"><Checkbox isChecked={allVisibleSelected} isIndeterminate={!allVisibleSelected && visible.some((p) => selected.has(p.id))} onChange={toggleVisible} aria-label="Select all on this page" /></Th>
                <SortHead k="name">Product</SortHead>
                <SortHead k="category">Category</SortHead>
                <SortHead k="price" numeric>Price</SortHead>
                <Th isNumeric>Tax</Th>
                <Th>Dietary</Th>
                <SortHead k="status">Available</SortHead>
                <SortHead k="updated">Updated</SortHead>
                <Th w="48px" />
              </Tr>
            </Thead>
            <Tbody>
              {visible.map((p) => {
                const cat = categoryById.get(String(p.category));
                const allergens = normalizeAllergens(p.allergens);
                return (
                  <Tr key={p.id} opacity={p.is_available === false ? 0.6 : 1}>
                    <Td><Checkbox isChecked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Select ${p.name}`} /></Td>
                    <Td maxW="320px">
                      <Text fontWeight="600" noOfLines={1}>{p.name}</Text>
                      <Text fontSize="xs" color={muted} noOfLines={1}>#{p.id}{p.description ? ` · ${p.description}` : ''}</Text>
                    </Td>
                    <Td>{cat?.name || '—'}{cat && cat.is_available === false && <Badge ml={1} fontSize="2xs">inactive</Badge>}</Td>
                    <Td isNumeric fontWeight="600">{formatPrice(p.price)}</Td>
                    <Td isNumeric color={muted} fontSize={taxState?.available ? 'xs' : undefined}>{cat ? (taxState?.available ? categoryTaxSummary(cat, taxState.taxes, formatPrice) : `${Number(cat.tax_rate || 0)}%`) : '—'}</Td>
                    <Td>
                      <HStack spacing={1} wrap="wrap">
                        {DIETARY_FLAGS.filter((d) => p[d.key]).map((d) => <Badge key={d.key} fontSize="2xs" colorScheme={d.key === 'is_spicy' ? 'red' : 'green'}>{d.short}</Badge>)}
                        {allergens.length > 0 && <Tooltip label={allergens.join(', ')}><Badge fontSize="2xs" colorScheme="orange">{allergens.length} allergen{allergens.length > 1 ? 's' : ''}</Badge></Tooltip>}
                      </HStack>
                    </Td>
                    <Td><Switch size="sm" isChecked={p.is_available !== false} onChange={() => toggleAvailable(p)} isDisabled={busyId === p.id} aria-label={`${p.name} available`} /></Td>
                    <Td fontSize="xs" color={muted} whiteSpace="nowrap">{p.updated_at ? new Date(p.updated_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</Td>
                    <Td>
                      <Menu placement="bottom-end">
                        <MenuButton as={IconButton} size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label={`Actions for ${p.name}`} />
                        <MenuList fontSize="sm">
                          <MenuItem icon={<Pencil size={14} />} onClick={() => setDialog({ initial: productToForm(p), productId: p.id })}>Edit</MenuItem>
                          <MenuItem icon={<Copy size={14} />} onClick={() => setDialog({ initial: duplicateForm(p, products), productId: null })}>Duplicate</MenuItem>
                          <MenuItem icon={<Power size={14} />} onClick={() => toggleAvailable(p)}>{p.is_available === false ? 'Make available' : 'Deactivate (make unavailable)'}</MenuItem>
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

      <Flex justify="space-between" align="center" mt={2} fontSize="sm" color={muted} wrap="wrap" gap={2}>
        <Text>{list.length} of {products.length} products{reloading ? ' · refreshing…' : ''}</Text>
        {pageCount > 1 && (
          <HStack>
            <Button size="xs" onClick={() => setPage(current - 1)} isDisabled={current === 1}>Previous</Button>
            <Text>Page {current} of {pageCount}</Text>
            <Button size="xs" onClick={() => setPage(current + 1)} isDisabled={current === pageCount}>Next</Button>
          </HStack>
        )}
      </Flex>

      <ProductFormDialog
        isOpen={!!dialog}
        onClose={() => setDialog(null)}
        initial={dialog?.initial}
        productId={dialog?.productId}
        categories={categories}
        products={products}
        decimals={decimals}
        currencySymbol={currencySymbol}
        onSaved={(saved, isEdit) => {
          toast({ title: isEdit ? 'Product updated' : 'Product added', description: saved?.name, status: 'success', duration: 2500 });
          onChanged();
        }}
      />
      <BulkPriceDialog
        isOpen={priceOpen}
        onClose={() => setPriceOpen(false)}
        products={selectedProducts}
        decimals={decimals}
        formatPrice={formatPrice}
        onApply={(changes) => {
          setPriceOpen(false);
          runBulk('Change price', changes, (c) => productService.updateProduct(c.product.id, { price: c.price }));
        }}
      />
    </Box>
  );
};

export default ProductsPanel;
