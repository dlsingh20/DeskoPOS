import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  HStack,
  Progress,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { Download, FileSpreadsheet, FileUp } from 'lucide-react';
import productService from '../../services/ProductService';
import { downloadXlsx } from '../../utils/xlsxWriter';
import { readXlsxRows } from '../../utils/xlsxReader';
import { PRODUCT_COLUMNS, parseCsv, planImport, productsToRows, toCsv } from '../../utils/productUtils';
import { ensureMenuId } from './CategoriesPanel';

const ACTION_STYLE = {
  create: { label: 'New', scheme: 'green' },
  update: { label: 'Update', scheme: 'blue' },
  unchanged: { label: 'No change', scheme: 'gray' },
  error: { label: 'Error', scheme: 'red' },
};

const downloadText = (fileName, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const ImportExportPanel = ({ products, categories, menus, restaurant, decimals, onChanged }) => {
  const toast = useToast();
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState(null);
  const [createCategories, setCreateCategories] = useState(true);
  const [running, setRunning] = useState(null); // { done, total }
  const [result, setResult] = useState(null);

  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const categoryName = (id) => categories.find((c) => String(c.id) === String(id))?.name || '';
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = String(restaurant?.name || 'products').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const plan = useMemo(() => (rows ? planImport(rows, { products, categories, decimals, createCategories }) : null), [rows, products, categories, decimals, createCategories]);
  const counts = useMemo(() => (plan ? plan.entries.reduce((acc, e) => ({ ...acc, [e.action]: (acc[e.action] || 0) + 1 }), {}) : {}), [plan]);
  const toApply = plan ? plan.entries.filter((e) => e.action === 'create' || e.action === 'update') : [];

  const exportExcel = () => {
    downloadXlsx(`${slug}-products-${stamp}.xlsx`, [
      { name: 'Products', rows: [{ cells: productsToRows(products, categoryName)[0], style: 'header' }, ...productsToRows(products, categoryName).slice(1)], freezeRow: 1, moneyColumns: [3], columnWidths: [8, 32, 20, 12, 40, 10, 11, 8, 11, 8, 24, 10, 12, 30, 12] },
      { name: 'Categories', rows: [{ cells: ['ID', 'Category', 'Tax rate %', 'Display order', 'Active'], style: 'header' }, ...categories.map((c) => [c.id, c.name, Number(c.tax_rate || 0), c.sort_order ?? '', c.is_available === false ? 'no' : 'yes'])], columnWidths: [8, 28, 12, 14, 8] },
    ]);
  };
  const exportCsv = () => downloadText(`${slug}-products-${stamp}.csv`, toCsv(productsToRows(products, categoryName)), 'text/csv;charset=utf-8');
  const template = () => downloadXlsx('product-import-template.xlsx', [
    { name: 'Products', rows: [
      { cells: PRODUCT_COLUMNS.map((c) => c.label), style: 'header' },
      ['', 'Veg Spring Roll', categories[0]?.name || 'Starters', 180, 'Crispy rolls with vegetables', 'yes', 'yes', 'no', 'no', 'no', 'gluten; soy', 250, 12, '', 1],
    ], freezeRow: 1, columnWidths: PRODUCT_COLUMNS.map(() => 16) },
    { name: 'Help', rows: [{ cells: ['Column', 'How to fill it'], style: 'header' }, ...PRODUCT_COLUMNS.map((c) => [c.label, c.help || ''])], columnWidths: [16, 80] },
  ]);

  const readFile = async (file) => {
    setReadError(null);
    setResult(null);
    setRows(null);
    setFileName(file.name);
    try {
      const isExcel = /\.xlsx$/i.test(file.name);
      if (!isExcel && !/\.(csv|txt)$/i.test(file.name)) throw new Error('Choose a .xlsx or .csv file.');
      if (file.size > 5 * 1024 * 1024) throw new Error('The file is larger than 5 MB.');
      const parsed = isExcel ? await readXlsxRows(await file.arrayBuffer()) : parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('The file has no product rows.');
      if (parsed.length > 2001) throw new Error('Import at most 2,000 products at a time.');
      setRows(parsed);
    } catch (error) {
      setReadError(error.message || 'Could not read the file.');
    }
  };

  const runImport = async () => {
    if (!plan || !toApply.length) return;
    setRunning({ done: 0, total: toApply.length });
    const failures = [];
    let created = 0;
    let updated = 0;
    try {
      // 1. Missing categories first, so new products can point at them
      const newCategoryIds = new Map();
      if (plan.newCategories.length) {
        const menuId = await ensureMenuId({ menu: '' }, menus, restaurant);
        for (const name of plan.newCategories) {
          try {
            const c = await productService.createCategory({ name, menu: menuId, is_available: true, tax_rate: '0.00' });
            newCategoryIds.set(name.toLowerCase(), c.id);
          } catch (error) {
            failures.push({ rowNumber: '—', name: `Category "${name}"`, error: error.message });
          }
        }
      }
      // 2. Products
      const { done, failed } = await productService.runEach(toApply, async (entry) => {
        const payload = { ...entry.payload };
        if (payload.category === undefined) {
          const id = newCategoryIds.get(entry.categoryName.toLowerCase());
          if (!id) throw new Error(`Category "${entry.categoryName}" could not be created`);
          payload.category = id;
        }
        return entry.action === 'update' ? productService.updateProduct(entry.existingId, payload) : productService.createProduct(payload);
      }, (d, t) => setRunning({ done: d, total: t }), 3);
      done.forEach(({ item }) => { if (item.action === 'update') updated += 1; else created += 1; });
      failed.forEach(({ item, error }) => failures.push({ rowNumber: item.rowNumber, name: item.name, error }));
    } finally {
      setRunning(null);
    }
    setResult({ created, updated, failures });
    toast({
      title: failures.length ? `Imported with ${failures.length} problem(s)` : 'Import finished',
      description: `${created} added, ${updated} updated.`,
      status: failures.length ? 'warning' : 'success',
      duration: 5000,
      isClosable: true,
    });
    onChanged();
  };

  const errorReport = () => {
    const lines = [['Row', 'Product', 'Problem']];
    (plan?.entries || []).filter((e) => e.action === 'error').forEach((e) => lines.push([e.rowNumber, e.name, e.errors.join('; ')]));
    (result?.failures || []).forEach((f) => lines.push([f.rowNumber, f.name, f.error]));
    downloadText(`import-problems-${stamp}.csv`, toCsv(lines), 'text/csv;charset=utf-8');
  };

  return (
    <VStack align="stretch" spacing={5}>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" p={4}>
          <Text fontWeight="700" mb={1}>Export</Text>
          <Text fontSize="sm" color={muted} mb={3}>All {products.length} products and {categories.length} categories of {restaurant?.name}. Edit the file and import it back to update in bulk.</Text>
          <HStack wrap="wrap">
            <Button size="sm" leftIcon={<FileSpreadsheet size={14} />} colorScheme="green" onClick={exportExcel} isDisabled={!products.length}>Excel</Button>
            <Button size="sm" leftIcon={<Download size={14} />} variant="outline" onClick={exportCsv} isDisabled={!products.length}>CSV</Button>
          </HStack>
        </Box>
        <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" p={4}>
          <Text fontWeight="700" mb={1}>Import</Text>
          <Text fontSize="sm" color={muted} mb={3}>Excel (.xlsx) or CSV. Leave <b>ID</b> empty for new products (IDs come from an export). Rows are matched by name within the category, otherwise added. Nothing is saved until you confirm. A sales report is not a product file: use Export for that.</Text>
          <HStack wrap="wrap">
            <Button size="sm" leftIcon={<FileUp size={14} />} colorScheme="blue" onClick={() => fileRef.current?.click()} isDisabled={!!running}>Choose file</Button>
            <Button size="sm" variant="ghost" leftIcon={<Download size={14} />} onClick={template}>Download template</Button>
          </HStack>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
        </Box>
      </SimpleGrid>

      {readError && <Alert status="error" borderRadius="10px"><AlertIcon /><AlertDescription>{readError}</AlertDescription></Alert>}

      {plan && (
        <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" p={4}>
          <Flex justify="space-between" align="center" wrap="wrap" gap={2} mb={3}>
            <Box>
              <Text fontWeight="700">{fileName}</Text>
              <HStack spacing={2} mt={1} wrap="wrap">
                {Object.entries(ACTION_STYLE).map(([k, s]) => (counts[k] ? <Badge key={k} colorScheme={s.scheme}>{s.label}: {counts[k]}</Badge> : null))}
                {plan.newCategories.length > 0 && <Badge colorScheme="purple">New categories: {plan.newCategories.join(', ')}</Badge>}
              </HStack>
            </Box>
            <HStack>
              {(counts.error || result?.failures?.length) ? <Button size="sm" variant="outline" onClick={errorReport}>Download problems</Button> : null}
              <Button size="sm" colorScheme="blue" onClick={runImport} isDisabled={!toApply.length || !!running || !!result} isLoading={!!running} loadingText="Importing">
                Import {toApply.length} product(s)
              </Button>
            </HStack>
          </Flex>
          {plan.headerErrors.length > 0 && <Alert status="error" borderRadius="10px" mb={3}><AlertIcon /><AlertDescription>{plan.headerErrors.join('. ')}. Use the template's column names.</AlertDescription></Alert>}
          <Checkbox isChecked={createCategories} onChange={(e) => setCreateCategories(e.target.checked)} mb={3} isDisabled={!!running || !!result}>
            Create categories that don't exist yet (tax rate 0%; set it in Categories afterwards)
          </Checkbox>
          {running && <Box mb={3}><Text fontSize="sm" mb={1}>Saving {running.done} of {running.total}…</Text><Progress size="xs" value={(running.done / running.total) * 100} borderRadius="full" /></Box>}
          {result && (
            <Alert status={result.failures.length ? 'warning' : 'success'} borderRadius="10px" mb={3}>
              <AlertIcon />
              <AlertDescription>{result.created} added, {result.updated} updated{result.failures.length ? `, ${result.failures.length} failed (download the problems file)` : ''}. Choose another file to import again.</AlertDescription>
            </Alert>
          )}
          <Box overflow="auto" maxH="420px" border="1px solid" borderColor={lineColor} borderRadius="8px">
            <Table size="sm">
              <Thead position="sticky" top={0} bg={panelBg} zIndex={1}>
                <Tr><Th>Row</Th><Th>Result</Th><Th>Product</Th><Th>Category</Th><Th isNumeric>Price</Th><Th>Problems and notes</Th></Tr>
              </Thead>
              <Tbody>
                {plan.entries.map((e) => (
                  <Tr key={e.rowNumber}>
                    <Td color={muted}>{e.rowNumber}</Td>
                    <Td><Badge colorScheme={ACTION_STYLE[e.action].scheme}>{ACTION_STYLE[e.action].label}</Badge></Td>
                    <Td>{e.name || '—'}</Td>
                    <Td>{e.categoryName || '—'}</Td>
                    <Td isNumeric>{e.payload.price || '—'}</Td>
                    <Td fontSize="xs" whiteSpace="normal">
                      {e.errors.length > 0 && <Text color="red.500">{e.errors.join('; ')}</Text>}
                      {e.warnings?.length > 0 && <Text color="orange.500">{e.warnings.join('; ')}</Text>}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Box>
      )}
    </VStack>
  );
};

export default ImportExportPanel;
