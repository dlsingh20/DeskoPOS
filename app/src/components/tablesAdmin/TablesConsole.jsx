import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
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
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Radio,
  RadioGroup,
  Select,
  SimpleGrid,
  Spinner,
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
import { Copy, MoreVertical, Pencil, Plus, Printer, QrCode, RefreshCw, Search } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import tableService from '../../services/TableService';
import PrintService from '../../services/PrintService';
import printSettingsService from '../../services/PrintSettingsService';
import ApiClient from '../../services/ApiClient';
import { describeProductError } from '../../services/ProductService';
import { compareTables } from '../../utils/fineDineUtils';
import {
  GUEST_APP_URL,
  QR_ORDERING,
  QR_PRINT_FORMATS,
  buildTableOrderingUrl,
  getTableQrCode,
  planBulkTables,
  renderQrCardsHtml,
  tableCardLabel,
} from '../../utils/tableQr';

const STATUS_COLORS = { available: 'green', occupied: 'blue', reserved: 'purple', cleaning: 'yellow', out_of_order: 'gray' };
const STATUS_LABELS = { available: 'Available', occupied: 'Occupied', reserved: 'Reserved', cleaning: 'Cleaning', out_of_order: 'Out of order' };

const qrImage = (url, width = 512) => QRCode.toDataURL(url, { margin: 1, width, errorCorrectionLevel: 'M' });

/* ---------------------------- Add / edit table ---------------------------- */

const EMPTY = { table_number: '', name: '', capacity: '4', location: '', is_outdoor: false };

const TableFormDialog = ({ isOpen, onClose, table, tables, restaurant, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!isOpen) return;
    setForm(table ? {
      table_number: String(table.table_number ?? ''), name: table.name || '', capacity: String(table.capacity ?? ''),
      location: table.location || '', is_outdoor: !!table.is_outdoor,
    } : EMPTY);
    setShowErrors(false);
    setError(null);
  }, [isOpen, table]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const number = form.table_number.trim();
  const errors = {};
  if (!number) errors.table_number = 'Enter the table number.';
  else if (number.length > 20) errors.table_number = 'Use at most 20 characters.';
  else if (tables.some((t) => t.id !== table?.id && String(t.table_number).trim().toLowerCase() === number.toLowerCase())) errors.table_number = 'This table number is already used.';
  if (!/^\d{1,3}$/.test(form.capacity.trim()) || Number(form.capacity) < 1) errors.capacity = 'Enter seats from 1 to 999.';
  const isValid = !Object.keys(errors).length;

  const save = async () => {
    setShowErrors(true);
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    const fields = {
      table_number: number,
      name: form.name.trim() || `Table ${number}`,
      capacity: parseInt(form.capacity, 10),
      location: form.location.trim(),
      is_outdoor: form.is_outdoor,
    };
    try {
      const saved = table
        ? await tableService.patchTable(table.id, fields)
        : await tableService.ensureQrCode(await tableService.createTable({ ...fields, restaurant: restaurant.id, status: 'available' }));
      onSaved(saved, !!table);
      onClose();
    } catch (err) {
      setError(describeProductError(err, 'Could not save the table.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} size="md" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{table ? `Edit ${tableCardLabel(table)}` : 'Add table'}</ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <SimpleGrid columns={2} spacing={3}>
              <FormControl isRequired isInvalid={showErrors && !!errors.table_number}>
                <FormLabel fontSize="sm">Table number</FormLabel>
                <Input value={form.table_number} onChange={set('table_number')} maxLength={20} autoFocus placeholder="e.g. 5 or P-2" />
                <FormErrorMessage>{errors.table_number}</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={showErrors && !!errors.capacity}>
                <FormLabel fontSize="sm">Seats</FormLabel>
                <Input value={form.capacity} onChange={set('capacity')} inputMode="numeric" />
                <FormErrorMessage>{errors.capacity}</FormErrorMessage>
              </FormControl>
            </SimpleGrid>
            <FormControl>
              <FormLabel fontSize="sm">Name</FormLabel>
              <Input value={form.name} onChange={set('name')} maxLength={60} placeholder={number ? `Table ${number}` : 'e.g. Window Booth'} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Area</FormLabel>
              <Input value={form.location} onChange={set('location')} maxLength={60} placeholder="e.g. Main Hall, Patio, Rooftop" />
            </FormControl>
            <FormControl display="flex" alignItems="center" gap={3}>
              <Switch id="tbl-outdoor" isChecked={form.is_outdoor} onChange={set('is_outdoor')} />
              <FormLabel htmlFor="tbl-outdoor" mb={0} fontSize="sm">Outdoor</FormLabel>
            </FormControl>
            {!table && QR_ORDERING && <Text fontSize="xs" color="gray.500">A QR code for ordering is created with the table.</Text>}
            {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={saving}>Cancel</Button>
          <Button colorScheme="blue" onClick={save} isLoading={saving}>{table ? 'Save changes' : 'Add table'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ---------------------------- Bulk add ---------------------------- */

const BulkAddDialog = ({ isOpen, onClose, tables, restaurant, onDone }) => {
  const toast = useToast();
  const [form, setForm] = useState({ prefix: '', from: '1', to: '10', capacity: '4', location: '' });
  const [progress, setProgress] = useState(null);
  useEffect(() => { if (isOpen) setProgress(null); }, [isOpen]);
  const plan = planBulkTables(form, tables);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const capacityOk = /^\d{1,3}$/.test(form.capacity) && Number(form.capacity) > 0;

  const run = async () => {
    if (plan.error || !plan.numbers.length || !capacityOk) return;
    setProgress({ done: 0, total: plan.numbers.length });
    const failed = [];
    let created = 0;
    for (let i = 0; i < plan.numbers.length; i += 1) {
      const number = plan.numbers[i];
      try {
        await tableService.ensureQrCode(await tableService.createTable({
          restaurant: restaurant.id, table_number: number, name: `Table ${number}`,
          capacity: parseInt(form.capacity, 10), location: form.location.trim(), status: 'available',
        }));
        created += 1;
      } catch (error) {
        failed.push(`${number}: ${describeProductError(error)}`);
      }
      setProgress({ done: i + 1, total: plan.numbers.length });
    }
    toast({
      title: failed.length ? `${created} tables added, ${failed.length} failed` : `${created} tables added`,
      description: failed.slice(0, 3).join(' · ') || 'Each table has its QR code.',
      status: failed.length ? 'warning' : 'success', duration: 6000, isClosable: true,
    });
    onDone();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={progress ? () => {} : onClose} size="md" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>Add several tables</ModalHeader>
        <ModalCloseButton isDisabled={!!progress} />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <SimpleGrid columns={3} spacing={3}>
              <FormControl><FormLabel fontSize="sm">Prefix</FormLabel><Input value={form.prefix} onChange={set('prefix')} maxLength={8} placeholder="e.g. P-" /></FormControl>
              <FormControl><FormLabel fontSize="sm">From</FormLabel><Input value={form.from} onChange={set('from')} inputMode="numeric" /></FormControl>
              <FormControl><FormLabel fontSize="sm">To</FormLabel><Input value={form.to} onChange={set('to')} inputMode="numeric" /></FormControl>
            </SimpleGrid>
            <SimpleGrid columns={2} spacing={3}>
              <FormControl isInvalid={!capacityOk}><FormLabel fontSize="sm">Seats each</FormLabel><Input value={form.capacity} onChange={set('capacity')} inputMode="numeric" /></FormControl>
              <FormControl><FormLabel fontSize="sm">Area</FormLabel><Input value={form.location} onChange={set('location')} maxLength={60} placeholder="e.g. Patio" /></FormControl>
            </SimpleGrid>
            {plan.error ? <Text fontSize="sm" color="red.500">{plan.error}</Text> : (
              <Text fontSize="sm">
                Creates <b>{plan.numbers.length}</b> table(s){plan.numbers.length ? `: ${plan.numbers.slice(0, 6).join(', ')}${plan.numbers.length > 6 ? ', …' : ''}` : ''}.
                {plan.skipped.length > 0 && <Text as="span" color="gray.500"> Skips existing: {plan.skipped.slice(0, 6).join(', ')}{plan.skipped.length > 6 ? ', …' : ''}.</Text>}
              </Text>
            )}
            {progress && <Box><Text fontSize="sm" mb={1}>Creating {progress.done} of {progress.total}…</Text><Progress size="xs" value={(progress.done / progress.total) * 100} borderRadius="full" /></Box>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={!!progress}>Cancel</Button>
          <Button colorScheme="blue" onClick={run} isLoading={!!progress} isDisabled={!!plan.error || !plan.numbers.length || !capacityOk}>Create {plan.numbers.length || ''} tables</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ---------------------------- QR preview ---------------------------- */

const QrDialog = ({ table, onClose, linkFor, onPrint, onRegenerate }) => {
  const toast = useToast();
  const [img, setImg] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = table ? linkFor(table) : '';
  useEffect(() => {
    setImg(null);
    setConfirming(false);
    if (url) qrImage(url, 400).then(setImg).catch(() => setImg(null));
  }, [url]);
  if (!table) return null;
  const copy = () => {
    try {
      navigator.clipboard.writeText(url).then(() => toast({ title: 'Link copied', status: 'success', duration: 1500 }));
    } catch (e) {
      toast({ title: 'Copy the link from the box', status: 'info', duration: 2500 });
    }
  };
  return (
    <Modal isOpen onClose={onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{tableCardLabel(table)} · ordering QR</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={3}>
            <Box p={3} bg="white" borderRadius="12px" border="1px solid" borderColor="gray.200">
              {img ? <Image src={img} alt={`QR code for ${tableCardLabel(table)}`} boxSize="240px" /> : <Center boxSize="240px"><Spinner /></Center>}
            </Box>
            <HStack w="full">
              <Input size="sm" value={url} isReadOnly onFocus={(e) => e.target.select()} aria-label="Ordering link" />
              <IconButton size="sm" aria-label="Copy link" icon={<Copy size={14} />} onClick={copy} />
            </HStack>
            {!getTableQrCode(table) && !table.qr_code_url && (
              <Alert status="warning" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>This table has no secret QR code from the server yet; the link only identifies the table. Use “New QR code” to create one.</AlertDescription></Alert>
            )}
            {confirming && (
              <Alert status="warning" borderRadius="10px" fontSize="sm" alignItems="flex-start">
                <AlertIcon />
                <AlertDescription>
                  A new code replaces this one. Printed cards with the old code stop working and must be reprinted.
                  <HStack mt={2}>
                    <Button size="xs" colorScheme="orange" isLoading={busy} onClick={async () => { setBusy(true); await onRegenerate(table); setBusy(false); setConfirming(false); }}>Create new QR code</Button>
                    <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
                  </HStack>
                </AlertDescription>
              </Alert>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" leftIcon={<RefreshCw size={14} />} onClick={() => setConfirming(true)} mr="auto">New QR code</Button>
          <Button colorScheme="blue" leftIcon={<Printer size={14} />} onClick={() => onPrint([table])}>Print</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ---------------------------- Print ---------------------------- */

const PrintDialog = ({ tables, onClose, linkFor, restaurantName }) => {
  const toast = useToast();
  const [format, setFormat] = useState('grid');
  const [heading, setHeading] = useState('Scan to see the menu and order');
  const [footer, setFooter] = useState('');
  const [busy, setBusy] = useState(false);
  if (!tables) return null;
  const print = async () => {
    setBusy(true);
    try {
      const cards = await Promise.all(tables.map(async (t) => ({ label: tableCardLabel(t), qrDataUrl: await qrImage(linkFor(t), 600), url: linkFor(t) })));
      await PrintService.printHtmlInBrowser(renderQrCardsHtml(cards, { format, restaurantName, heading, footer }));
      onClose();
    } catch (error) {
      toast({ title: 'Could not print', description: error.message, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>Print QR codes for {tables.length === 1 ? tableCardLabel(tables[0]) : `${tables.length} tables`}</ModalHeader>
        <ModalCloseButton isDisabled={busy} />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <RadioGroup value={format} onChange={setFormat}>
              <VStack align="stretch" spacing={2}>
                {QR_PRINT_FORMATS.map((f) => (
                  <Radio key={f.key} value={f.key}>
                    <Text fontSize="sm" fontWeight="600">{f.label}</Text>
                    <Text fontSize="xs" color="gray.500">{f.description}</Text>
                  </Radio>
                ))}
              </VStack>
            </RadioGroup>
            <FormControl>
              <FormLabel fontSize="sm">Text under the QR</FormLabel>
              <Input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={60} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Footer (optional)</FormLabel>
              <Input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={80} placeholder="e.g. Wi-Fi: Guest / Pay at the counter" />
              <FormHelperText fontSize="xs">Not shown on stickers.</FormHelperText>
            </FormControl>
            <Text fontSize="xs" color="gray.500">Opens the print dialog. Choose the paper size there, and turn off headers and footers.</Text>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={busy}>Cancel</Button>
          <Button colorScheme="blue" leftIcon={<Printer size={14} />} onClick={print} isLoading={busy} loadingText="Preparing">Print</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/* ---------------------------- QR ordering settings ---------------------------- */

/** How QR orders are handled; saved on this device for the restaurant (like print settings) */
const QrSettingsCard = ({ restaurant }) => {
  const toast = useToast();
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  const [qr, setQr] = useState(() => printSettingsService.get(restaurant.id).qrOrders);
  useEffect(() => { setQr(printSettingsService.get(restaurant.id).qrOrders); }, [restaurant.id]);

  const save = (patch) => {
    const next = { ...qr, ...patch };
    const all = printSettingsService.get(restaurant.id);
    if (printSettingsService.save(restaurant.id, { ...all, qrOrders: next })) {
      setQr(next);
      toast({ title: 'QR ordering settings saved', status: 'success', duration: 1500 });
    } else {
      toast({ title: 'Could not save on this device', status: 'error', duration: 4000 });
    }
  };

  return (
    <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" p={4} mb={4}>
      <Text fontWeight="700" mb={2}>QR ordering</Text>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Box>
          <Text fontSize="sm" mb={1}>When a guest orders by QR</Text>
          <RadioGroup value={qr.mode} onChange={(mode) => save({ mode })}>
            <VStack align="stretch" spacing={1}>
              <Radio value="auto"><Text fontSize="sm">Send to the kitchen and print the KOT automatically</Text></Radio>
              <Radio value="accept"><Text fontSize="sm">Cashier accepts or rejects first</Text></Radio>
            </VStack>
          </RadioGroup>
        </Box>
        <VStack align="stretch" spacing={2}>
          <FormControl display="flex" alignItems="center" gap={3}>
            <Switch id="qr-device" isChecked={qr.handleOnThisDevice} onChange={(e) => save({ handleOnThisDevice: e.target.checked })} />
            <FormLabel htmlFor="qr-device" mb={0} fontSize="sm">This device handles QR orders (prints KOTs{qr.mode === 'accept' ? ', shows Accept / Reject' : ''})</FormLabel>
          </FormControl>
          <FormControl display="flex" alignItems="center" gap={3}>
            <Switch id="qr-sound" isChecked={qr.sound} onChange={(e) => save({ sound: e.target.checked })} />
            <FormLabel htmlFor="qr-sound" mb={0} fontSize="sm">Play a sound for new QR orders</FormLabel>
          </FormControl>
          <Text fontSize="xs" color={muted}>Turn this on for exactly one device per restaurant (usually the counter with the kitchen printer), so each KOT prints once. Other devices only show an alert.</Text>
        </VStack>
      </SimpleGrid>
    </Box>
  );
};

/* ---------------------------- Console ---------------------------- */

const QrThumb = ({ url }) => {
  const [img, setImg] = useState(null);
  useEffect(() => { qrImage(url, 120).then(setImg).catch(() => setImg(null)); }, [url]);
  return img ? <Image src={img} alt="" boxSize="40px" /> : <Box boxSize="40px" />;
};

/**
 * Tables console (Managers and Administrators): tables of the selected restaurant, each with a
 * printable ordering QR code that opens the guest ordering page.
 */
const TablesConsole = () => {
  const { state, loadTables } = usePOS();
  const toast = useToast();
  const restaurant = state.selectedRestaurant;
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // null | 'new' | table
  const [bulkOpen, setBulkOpen] = useState(false);
  const [qrTable, setQrTable] = useState(null);
  const [printTables, setPrintTables] = useState(null);
  const requestRef = useRef(0);

  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const headBg = useColorModeValue('gray.50', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const hotelId = ApiClient.getHotelContext();
  const linkFor = useCallback((t) => buildTableOrderingUrl(t, { restaurantId: restaurant?.id, hotelId }), [restaurant, hotelId]);

  const load = useCallback(async () => {
    if (!restaurant) return;
    const id = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await tableService.getTablesByRestaurant(restaurant.id);
      if (id === requestRef.current) setTables([...list].sort(compareTables));
    } catch (err) {
      if (id === requestRef.current) setError(describeProductError(err, 'Could not load tables.'));
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [restaurant]);
  useEffect(() => { load(); }, [load]);

  const changed = () => {
    load();
    if (restaurant && loadTables) loadTables(restaurant.id);
  };

  const areas = useMemo(() => Array.from(new Set(tables.map((t) => t.location).filter(Boolean))).sort(), [tables]);
  const list = tables.filter((t) => {
    if (area !== 'all' && (t.location || '') !== area) return false;
    const q = search.trim().toLowerCase();
    return !q || [t.table_number, t.name, t.location].some((v) => String(v || '').toLowerCase().includes(q));
  });
  const allSelected = list.length > 0 && list.every((t) => selected.has(t.id));
  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const setStatus = async (t, status) => {
    try {
      await tableService.updateTableStatus(t.id, status);
      toast({ title: `${tableCardLabel(t)}: ${STATUS_LABELS[status]}`, status: 'success', duration: 2000 });
      changed();
    } catch (err) {
      toast({ title: 'Could not change the status', description: describeProductError(err), status: 'error', duration: 5000, isClosable: true });
    }
  };

  const regenerate = async (t) => {
    try {
      const updated = await tableService.regenerateQrCode(t.id);
      setTables((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...updated } : x)));
      setQrTable((cur) => (cur && cur.id === t.id ? { ...cur, ...updated } : cur));
      toast({ title: 'New QR code created', description: 'Reprint the card for this table.', status: 'success', duration: 4000 });
    } catch (err) {
      toast({ title: 'Could not create a new QR code', description: describeProductError(err), status: 'error', duration: 5000, isClosable: true });
    }
  };

  if (!restaurant) return <Center h="full" bg={pageBg}><Text color={muted}>Select a restaurant to manage its tables.</Text></Center>;

  return (
    <Box h="full" overflowY="auto" bg={pageBg}>
      <Box maxW="1200px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap={3} mb={4}>
          <Box>
            <Text fontSize="xl" fontWeight="700">{QR_ORDERING ? 'Tables & QR codes' : 'Tables'}</Text>
            <Text fontSize="sm" color={muted}>
              {QR_ORDERING
                ? `${restaurant.name} · guests scan a table's QR code to order from ${GUEST_APP_URL.replace(/^https?:\/\//, '')}`
                : `${restaurant.name} · ordering by QR code for guests is not available yet`}
            </Text>
          </Box>
          <HStack wrap="wrap">
            <Button size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={() => setBulkOpen(true)}>Add several</Button>
            <Button size="sm" colorScheme="blue" leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>Add table</Button>
          </HStack>
        </Flex>

        {QR_ORDERING && <QrSettingsCard restaurant={restaurant} />}

        <Flex gap={2} wrap="wrap" mb={3} align="center">
          <InputGroup size="sm" maxW="260px">
            <InputLeftElement pointerEvents="none"><Search size={14} /></InputLeftElement>
            <Input placeholder="Search table, name, area" value={search} onChange={(e) => setSearch(e.target.value)} bg={panelBg} borderRadius="8px" aria-label="Search tables" />
          </InputGroup>
          {areas.length > 0 && (
            <Select size="sm" w="auto" bg={panelBg} borderRadius="8px" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
              <option value="all">All areas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          )}
          {QR_ORDERING && (
            <Button size="sm" leftIcon={<Printer size={14} />} ml="auto" isDisabled={!list.length}
              onClick={() => setPrintTables(selected.size ? tables.filter((t) => selected.has(t.id)) : list)}>
              {selected.size ? `Print QR for ${selected.size} selected` : `Print QR for all ${list.length}`}
            </Button>
          )}
        </Flex>

        <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
          {loading && <Center py={12}><Spinner /></Center>}
          {!loading && error && <Center py={12}><VStack><Text color="red.500">{error}</Text><Button size="sm" onClick={load}>Try again</Button></VStack></Center>}
          {!loading && !error && list.length === 0 && (
            <Center py={12}><VStack spacing={1}><Text fontWeight="600">{tables.length ? 'No tables match' : 'No tables yet'}</Text><Text fontSize="sm" color={muted}>{tables.length ? 'Clear the search or area.' : 'Add tables one by one or several at once.'}</Text></VStack></Center>
          )}
          {!loading && !error && list.length > 0 && (
            <Table size="sm" minW="760px">
              <Thead bg={headBg}>
                <Tr>
                  <Th w="36px"><Checkbox isChecked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((t) => t.id)))} aria-label="Select all" /></Th>
                  <Th>Table</Th><Th isNumeric>Seats</Th><Th>Area</Th><Th>Status</Th>{QR_ORDERING && <Th>QR code</Th>}<Th w="48px" />
                </Tr>
              </Thead>
              <Tbody>
                {list.map((t) => (
                  <Tr key={t.id} opacity={t.status === 'out_of_order' ? 0.6 : 1}>
                    <Td><Checkbox isChecked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${tableCardLabel(t)}`} /></Td>
                    <Td>
                      <Text fontWeight="700">{t.table_number}</Text>
                      {t.name && t.name !== `Table ${t.table_number}` && <Text fontSize="xs" color={muted}>{t.name}</Text>}
                    </Td>
                    <Td isNumeric>{t.capacity ?? '—'}</Td>
                    <Td>{t.location || '—'}{t.is_outdoor && <Badge ml={1} fontSize="2xs">outdoor</Badge>}</Td>
                    <Td><Badge colorScheme={STATUS_COLORS[t.status] || 'gray'}>{STATUS_LABELS[t.status] || t.status}</Badge></Td>
                    {QR_ORDERING && <Td>
                      <Tooltip label="Show, copy or print the QR code">
                        <HStack as="button" type="button" onClick={() => setQrTable(t)} spacing={2} aria-label={`QR code for ${tableCardLabel(t)}`}>
                          <QrThumb url={linkFor(t)} />
                          {!getTableQrCode(t) && !t.qr_code_url && <Badge colorScheme="orange" fontSize="2xs">no secret code</Badge>}
                        </HStack>
                      </Tooltip>
                    </Td>}
                    <Td>
                      <Menu placement="bottom-end">
                        <MenuButton as={IconButton} size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label={`Actions for ${tableCardLabel(t)}`} />
                        <MenuList fontSize="sm">
                          <MenuItem icon={<Pencil size={14} />} onClick={() => setEditing(t)}>Edit</MenuItem>
                          {QR_ORDERING && <MenuItem icon={<QrCode size={14} />} onClick={() => setQrTable(t)}>Show QR code</MenuItem>}
                          {QR_ORDERING && <MenuItem icon={<Printer size={14} />} onClick={() => setPrintTables([t])}>Print QR code</MenuItem>}
                          <MenuDivider />
                          {t.status === 'out_of_order'
                            ? <MenuItem onClick={() => setStatus(t, 'available')}>Back in service</MenuItem>
                            : <MenuItem onClick={() => setStatus(t, 'out_of_order')} isDisabled={t.status === 'occupied'}>Out of order{t.status === 'occupied' ? ' (occupied)' : ''}</MenuItem>}
                        </MenuList>
                      </Menu>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>
        <Text fontSize="xs" color={muted} mt={2}>
          Tables are taken out of service, not deleted, so past bills keep their table.{QR_ORDERING ? ' A new QR code makes printed copies of the old one stop working.' : ''}
        </Text>
      </Box>

      <TableFormDialog
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        table={editing && editing !== 'new' ? editing : null}
        tables={tables}
        restaurant={restaurant}
        onSaved={(saved, isEdit) => {
          toast({ title: isEdit ? 'Table updated' : `${tableCardLabel(saved)} added`, description: isEdit ? undefined : 'Its QR code is ready to print.', status: 'success', duration: 3000 });
          changed();
          if (!isEdit) setQrTable(saved);
        }}
      />
      <BulkAddDialog isOpen={bulkOpen} onClose={() => setBulkOpen(false)} tables={tables} restaurant={restaurant} onDone={changed} />
      <QrDialog table={qrTable} onClose={() => setQrTable(null)} linkFor={linkFor} onPrint={(ts) => { setQrTable(null); setPrintTables(ts); }} onRegenerate={regenerate} />
      <PrintDialog tables={printTables} onClose={() => setPrintTables(null)} linkFor={linkFor} restaurantName={restaurant.name} />
    </Box>
  );
};

export default TablesConsole;
