import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Grid,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputRightAddon,
  Radio,
  RadioGroup,
  Select,
  SimpleGrid,
  Switch,
  Text,
  Textarea,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { Check, FileText, Plus, Printer, RotateCcw, Save, Trash2, UtensilsCrossed } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import PrintService from '../../services/PrintService';
import { IS_DESKOPOS } from '../../services/backend';
import printSettingsService, {
  BILL_FORMATS,
  KOT_FORMATS,
  SHEET_SIZES,
  defaultPrintSettings,
  normalizePrintSettings,
  validateLicence,
} from '../../services/PrintSettingsService';
import { buildBillModel, buildKotModel, renderBillHtml, renderKotHtml } from '../../utils/printTemplates';
import {
  TAX_PROFILES,
  getTaxProfile,
  taxSettingsFromProfile,
  validateTaxComponents,
  validateTaxId,
} from '../../utils/taxProfiles';
import { resolveRegionalFormat } from '../../utils/regionalFormat';

/** Sample data for the preview and test prints (never sent to the server) */
const sampleOrder = (restaurant) => ({
  id: 0,
  order_number: 'SAMPLE-0001',
  restaurant: restaurant?.id,
  restaurant_name: restaurant?.name,
  table_number: '5',
  type: 'dine_in',
  status: 'completed',
  order_time: new Date().toISOString(),
  customer_name: '',
  subtotal: '1200.00',
  discount_amount: '120.00',
  notes: '[Disc] 10% = 120.00 | Reason: Sample | By: Sample | At: 2026-01-01T00:00:00.000Z',
  service_charge: '108.00',
  tax_amount: '54.00',
  total_amount: '1242.00',
  items: [
    { id: 1, menu_item: 1, menu_item_name: 'Grilled Chicken', quantity: 2, unit_price: '280.00', total_price: '560.00', status: 'served' },
    { id: 2, menu_item: 2, menu_item_name: 'Pasta Arrabbiata', quantity: 1, unit_price: '320.00', total_price: '320.00', status: 'served', special_instructions: 'Less spicy' },
    { id: 3, menu_item: 3, menu_item_name: 'Garlic Bread', quantity: 4, unit_price: '80.00', total_price: '320.00', status: 'served' },
  ],
  payments: [
    { id: 1, method: 'cash', amount: '1242.00', status: 'completed', notes: 'Cash received 1300.00, change returned 58.00' },
  ],
});

const sampleKot = (restaurant) => ({
  orderNumber: 'SAMPLE-0001',
  tableNumber: '5',
  orderType: 'dine_in',
  restaurantId: restaurant?.id,
  timestamp: new Date(),
  items: [
    { quantity: 2, menu_item_name: 'Grilled Chicken' },
    { quantity: 1, menu_item_name: 'Pasta Arrabbiata', special_instructions: 'Less spicy' },
    { quantity: 4, menu_item_name: 'Garlic Bread' },
  ],
});

const PREVIEW_WIDTH = { thermal80: '300px', thermal58: '220px', sheet: '100%' };
const MAX_COMPONENTS = 4;

const FormatCard = ({ format, selected, onSelect, icon }) => {
  const border = useColorModeValue(selected ? 'blue.500' : 'gray.200', selected ? 'blue.300' : 'gray.600');
  const bg = useColorModeValue(selected ? 'blue.50' : 'white', selected ? 'whiteAlpha.100' : 'gray.800');
  const muted = useColorModeValue('gray.500', 'gray.400');
  return (
    <Box
      as="button"
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      textAlign="left"
      p={3}
      borderRadius="12px"
      border="2px solid"
      borderColor={border}
      bg={bg}
      _focusVisible={{ outline: '2px solid', outlineColor: 'blue.400', outlineOffset: '2px' }}
    >
      <HStack justify="space-between" mb={1}>
        <HStack spacing={2}>
          <Icon as={icon} boxSize={4} />
          <Text fontWeight="700" fontSize="sm">{format.label}</Text>
        </HStack>
        {selected && <Icon as={Check} boxSize={4} color="blue.500" />}
      </HStack>
      <Text fontSize="xs" color={muted}>{format.description}</Text>
    </Box>
  );
};

const Section = ({ title, subtitle, children }) => {
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  return (
    <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="14px" p={4}>
      <Text fontWeight="700" mb={subtitle ? 1 : 3}>{title}</Text>
      {subtitle && <Text fontSize="xs" color={muted} mb={3}>{subtitle}</Text>}
      {children}
    </Box>
  );
};

const PrintSettingsView = () => {
  const { state } = usePOS();
  const toast = useToast();
  const restaurant = state.selectedRestaurant;
  const region = useMemo(() => resolveRegionalFormat(state.hotelSettings), [state.hotelSettings]);
  const [settings, setSettings] = useState(() => defaultPrintSettings());
  const [saved, setSaved] = useState(null);
  const [previewKind, setPreviewKind] = useState('bill');
  const [printing, setPrinting] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  const previewBg = useColorModeValue('gray.100', 'gray.700');

  // Load this restaurant's saved settings. First time: defaults from the hotel's country,
  // and the header from the restaurant record.
  useEffect(() => {
    if (!restaurant) return undefined;
    let cancelled = false;
    const load = () => {
      const stored = printSettingsService.get(restaurant.id, region.country);
      const initial = stored.saved ? normalizePrintSettings(stored) : normalizePrintSettings({
        ...stored,
        header: {
          ...stored.header,
          name: restaurant.name || '',
          address: restaurant.location || '',
          phone: restaurant.contact_phone || '',
        },
      });
      setSettings(initial);
      setSaved(stored.saved ? initial : null);
      setShowErrors(false);
    };
    load();
    // DeskoPOS: the restaurant's shared settings may be newer than this device's copy
    printSettingsService.loadShared(restaurant.id)
      .then((updated) => { if (updated && !cancelled) load(); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [restaurant, region.country]);

  const set = (patch) => setSettings((prev) => ({ ...prev, ...patch }));
  const setHeader = (key) => (event) => setSettings((prev) => ({ ...prev, header: { ...prev.header, [key]: event.target.value } }));
  const setTax = (patch) => setSettings((prev) => ({ ...prev, tax: { ...prev.tax, ...patch } }));
  const setComponent = (index, patch) => setSettings((prev) => ({
    ...prev,
    tax: { ...prev.tax, components: prev.tax.components.map((c, i) => (i === index ? { ...c, ...patch } : c)) },
  }));

  /** Apply a country profile's labels, titles, tax lines and paper size (the entered numbers stay) */
  const applyProfile = (key) => {
    const profile = getTaxProfile(key);
    setSettings((prev) => ({
      ...prev,
      sheetSize: profile.sheetSize,
      header: { ...prev.header, taxIdLabel: profile.taxIdLabel, licenceLabel: profile.licenceLabel },
      tax: taxSettingsFromProfile(key),
    }));
  };

  const shareTotal = settings.tax.components.reduce((sum, c) => sum + (Number(c.share) || 0), 0);
  const errors = {
    name: !settings.header.name.trim() ? 'Enter the name to print on bills.' : null,
    taxId: validateTaxId(settings.tax.profile, settings.header.taxId),
    taxIdLabel: settings.header.taxId.trim() && !settings.header.taxIdLabel.trim() ? 'Enter the label printed before the number.' : null,
    licence: validateLicence(settings.header.licence),
    licenceLabel: settings.header.licence.trim() && !settings.header.licenceLabel.trim() ? 'Enter the label printed before the number.' : null,
    singleLabel: settings.tax.mode === 'single' && !settings.tax.singleLabel.trim() ? 'Enter the tax name, e.g. VAT.' : null,
    components: validateTaxComponents(settings.tax),
    titles: !settings.tax.invoiceTitle.trim() || !settings.tax.receiptTitle.trim() ? 'Enter both titles.' : null,
  };
  const isValid = !Object.values(errors).some(Boolean);
  const isDirty = !saved || JSON.stringify(normalizePrintSettings(settings)) !== JSON.stringify(saved);
  const shown = (key) => (showErrors ? errors[key] : null);

  const previewHtml = useMemo(() => {
    const s = normalizePrintSettings(settings);
    const context = { ...region, serverName: 'Alex' };
    if (previewKind === 'kot') {
      const copies = s.kotCopies;
      return renderKotHtml(Array.from({ length: copies }, (_, i) => buildKotModel(sampleKot(restaurant), { ...context, copy: i + 1, copies })), s.kotFormat, s.sheetSize);
    }
    return renderBillHtml(buildBillModel(sampleOrder(restaurant), { ...context, settings: s }), s.billFormat, s.sheetSize);
  }, [settings, previewKind, restaurant, region]);

  const previewFormat = previewKind === 'kot' ? settings.kotFormat : settings.billFormat;

  const handleSave = async () => {
    setShowErrors(true);
    if (!isValid) {
      toast({ title: 'Check the highlighted fields', status: 'warning', duration: 3000 });
      return;
    }
    const normalized = normalizePrintSettings({
      ...settings,
      header: { ...settings.header, taxId: settings.header.taxId.trim().toUpperCase(), licence: settings.header.licence.trim() },
    });
    if (IS_DESKOPOS) {
      try {
        await printSettingsService.saveShared(restaurant.id, normalized);
      } catch (error) {
        const message = error?.response?.status === 403
          ? 'Your role cannot change print settings.'
          : (error?.response?.data?.detail || error.message || 'The server did not save them.');
        toast({ title: 'Could not save', description: message, status: 'error', duration: 6000, isClosable: true });
        return;
      }
    }
    if (!printSettingsService.save(restaurant.id, normalized)) {
      toast({ title: 'Could not save', description: 'This browser blocked local storage. Check privacy settings.', status: 'error', duration: 6000, isClosable: true });
      return;
    }
    setSettings(normalized);
    setSaved(normalized);
    toast({
      title: 'Print settings saved',
      description: IS_DESKOPOS
        ? 'Every device of this restaurant will use these settings.'
        : 'Bills and KOTs from this device will use these formats.',
      status: 'success',
      duration: 3000,
    });
  };

  const testPrint = async (kind) => {
    setPrinting(kind);
    try {
      const s = normalizePrintSettings(settings);
      await PrintService.printSample(kind, s, kind === 'kot' ? sampleKot(restaurant) : sampleOrder(restaurant));
    } catch (error) {
      toast({ title: 'Test print failed', description: error.message || 'The printer did not respond.', status: 'error', duration: 6000, isClosable: true });
    } finally {
      setPrinting(null);
    }
  };

  if (!restaurant) {
    return <Center h="full" bg={pageBg}><Text color={muted}>Select a restaurant to set up printing.</Text></Center>;
  }

  const sheet = SHEET_SIZES.find((s) => s.key === settings.sheetSize) || SHEET_SIZES[0];

  return (
    <Box h="full" overflowY="auto" bg={pageBg}>
      <Box maxW="1200px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={3} mb={4}>
          <Box>
            <HStack spacing={2}>
              <Icon as={Printer} boxSize={5} />
              <Text fontSize="xl" fontWeight="700">Bill &amp; KOT printing</Text>
              {isDirty && <Badge colorScheme="orange">Unsaved changes</Badge>}
            </HStack>
            <Text fontSize="sm" color={muted}>
              {restaurant.name} · {IS_DESKOPOS ? 'shared by every device' : 'saved on this device'} ·{region.currency || 'currency not set'}, {region.locale}{region.timeZone ? `, ${region.timeZone}` : ''}.
              Print method: {PrintService.isCompanionMode() ? 'Companion app' : 'Browser print'} (change it in Settings).
            </Text>
          </Box>
          <HStack>
            <Button leftIcon={<RotateCcw size={16} />} variant="ghost" onClick={() => saved && setSettings(saved)} isDisabled={!saved || !isDirty}>
              Undo changes
            </Button>
            <Button leftIcon={<Save size={16} />} colorScheme="blue" onClick={handleSave} isDisabled={!isDirty && !!saved}>
              Save
            </Button>
          </HStack>
        </Flex>

        <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 420px' }} gap={5} alignItems="start">
          <VStack align="stretch" spacing={5}>
            <Section title="Bill format" subtitle="Choose the paper your bill printer uses.">
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} role="radiogroup" aria-label="Bill format">
                {BILL_FORMATS.map((f) => (
                  <FormatCard key={f.key} format={f} icon={FileText} selected={settings.billFormat === f.key}
                    onSelect={() => { set({ billFormat: f.key }); setPreviewKind('bill'); }} />
                ))}
              </SimpleGrid>
              <FormControl mt={3} display="flex" alignItems="center" gap={3}>
                <FormLabel htmlFor="sheet-size" mb={0} fontSize="sm" whiteSpace="nowrap">Sheet paper size</FormLabel>
                <Select id="sheet-size" size="sm" maxW="240px" value={settings.sheetSize} onChange={(e) => set({ sheetSize: e.target.value })}>
                  {SHEET_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </Select>
                <Text fontSize="xs" color={muted}>Used by the sheet formats (KOT: {sheet.kotLabel}).</Text>
              </FormControl>
            </Section>

            <Section title="KOT format" subtitle="The kitchen printer can be different from the bill printer.">
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} role="radiogroup" aria-label="KOT format">
                {KOT_FORMATS.map((f) => (
                  <FormatCard key={f.key} format={f} icon={UtensilsCrossed} selected={settings.kotFormat === f.key}
                    onSelect={() => { set({ kotFormat: f.key }); setPreviewKind('kot'); }} />
                ))}
              </SimpleGrid>
            </Section>

            <Section title="Bill header">
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl isRequired isInvalid={!!shown('name')}>
                  <FormLabel fontSize="sm">Name on bill</FormLabel>
                  <Input value={settings.header.name} onChange={setHeader('name')} maxLength={60} />
                  <FormErrorMessage>{errors.name}</FormErrorMessage>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Phone</FormLabel>
                  <Input value={settings.header.phone} onChange={setHeader('phone')} maxLength={30} />
                </FormControl>
                <FormControl gridColumn={{ md: 'span 2' }}>
                  <FormLabel fontSize="sm">Address</FormLabel>
                  <Textarea value={settings.header.address} onChange={setHeader('address')} rows={2} maxLength={200} />
                </FormControl>
                <FormControl gridColumn={{ md: 'span 2' }}>
                  <FormLabel fontSize="sm">Footer message</FormLabel>
                  <Input value={settings.header.footer} onChange={setHeader('footer')} maxLength={80} />
                </FormControl>
              </SimpleGrid>
            </Section>

            <Section
              title="Tax & invoice"
              subtitle="Start from your country's profile, then adjust. These settings only change how tax is labelled on paper; the tax amount always comes from the server."
            >
              <VStack align="stretch" spacing={4}>
                <FormControl>
                  <FormLabel fontSize="sm">Country tax profile</FormLabel>
                  <Select value={settings.tax.profile} onChange={(e) => applyProfile(e.target.value)} maxW="360px">
                    {TAX_PROFILES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </Select>
                  <FormHelperText fontSize="xs">
                    Sets the labels, titles, tax lines and paper size below. A starting point only; check them against local rules.
                  </FormHelperText>
                </FormControl>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <FormControl isInvalid={!!shown('taxIdLabel')}>
                    <FormLabel fontSize="sm">Tax registration label</FormLabel>
                    <Input value={settings.header.taxIdLabel} onChange={setHeader('taxIdLabel')} maxLength={24} placeholder="e.g. VAT No., GSTIN, TRN, ABN" />
                    <FormErrorMessage>{errors.taxIdLabel}</FormErrorMessage>
                  </FormControl>
                  <FormControl isInvalid={!!settings.header.taxId && !!errors.taxId}>
                    <FormLabel fontSize="sm">Tax registration number</FormLabel>
                    <Input value={settings.header.taxId} onChange={setHeader('taxId')} maxLength={30} textTransform="uppercase" placeholder="Optional" />
                    {errors.taxId ? <FormErrorMessage>{errors.taxId}</FormErrorMessage> : <FormHelperText fontSize="xs">When set, bills use the invoice title below.</FormHelperText>}
                  </FormControl>
                  <FormControl isInvalid={!!shown('licenceLabel')}>
                    <FormLabel fontSize="sm">Licence label</FormLabel>
                    <Input value={settings.header.licenceLabel} onChange={setHeader('licenceLabel')} maxLength={24} placeholder="e.g. FSSAI Lic. No, Trade Licence" />
                    <FormErrorMessage>{errors.licenceLabel}</FormErrorMessage>
                  </FormControl>
                  <FormControl isInvalid={!!settings.header.licence && !!errors.licence}>
                    <FormLabel fontSize="sm">Licence number</FormLabel>
                    <Input value={settings.header.licence} onChange={setHeader('licence')} maxLength={30} placeholder="Optional" />
                    <FormErrorMessage>{errors.licence}</FormErrorMessage>
                  </FormControl>
                  <FormControl isInvalid={!!shown('titles')}>
                    <FormLabel fontSize="sm">Title with tax registration</FormLabel>
                    <Input value={settings.tax.invoiceTitle} onChange={(e) => setTax({ invoiceTitle: e.target.value })} maxLength={30} placeholder="e.g. TAX INVOICE" />
                    <FormErrorMessage>{errors.titles}</FormErrorMessage>
                  </FormControl>
                  <FormControl isInvalid={!!shown('titles')}>
                    <FormLabel fontSize="sm">Title without tax registration</FormLabel>
                    <Input value={settings.tax.receiptTitle} onChange={(e) => setTax({ receiptTitle: e.target.value })} maxLength={30} placeholder="e.g. RECEIPT" />
                  </FormControl>
                </SimpleGrid>

                <FormControl>
                  <FormLabel fontSize="sm">Tax on the bill</FormLabel>
                  <RadioGroup value={settings.tax.mode} onChange={(mode) => setTax({ mode })}>
                    <HStack spacing={6} wrap="wrap">
                      <Radio value="single">One line</Radio>
                      <Radio value="split">Split into components</Radio>
                    </HStack>
                  </RadioGroup>
                </FormControl>

                {settings.tax.mode === 'single' ? (
                  <FormControl isInvalid={!!shown('singleLabel')} maxW="300px">
                    <FormLabel fontSize="sm">Tax name</FormLabel>
                    <Input value={settings.tax.singleLabel} onChange={(e) => setTax({ singleLabel: e.target.value })} maxLength={20} placeholder="e.g. VAT, GST, Sales Tax" />
                    <FormErrorMessage>{errors.singleLabel}</FormErrorMessage>
                  </FormControl>
                ) : (
                  <FormControl isInvalid={!!errors.components}>
                    <FormLabel fontSize="sm">Components (share of the tax amount)</FormLabel>
                    <VStack align="stretch" spacing={2}>
                      {settings.tax.components.map((c, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <HStack key={i}>
                          <Input size="sm" value={c.label} onChange={(e) => setComponent(i, { label: e.target.value })} maxLength={20} placeholder="Name, e.g. CGST" aria-label={`Component ${i + 1} name`} />
                          <InputGroup size="sm" maxW="120px">
                            <Input type="number" min={0} max={100} value={c.share} onChange={(e) => setComponent(i, { share: e.target.value === '' ? '' : Number(e.target.value) })} aria-label={`Component ${i + 1} share`} />
                            <InputRightAddon>%</InputRightAddon>
                          </InputGroup>
                          <IconButton size="sm" variant="ghost" aria-label={`Remove component ${i + 1}`} icon={<Trash2 size={14} />}
                            isDisabled={settings.tax.components.length <= 2}
                            onClick={() => setTax({ components: settings.tax.components.filter((_, j) => j !== i) })} />
                        </HStack>
                      ))}
                    </VStack>
                    <HStack mt={2} justify="space-between">
                      <Button size="xs" variant="ghost" leftIcon={<Plus size={12} />} isDisabled={settings.tax.components.length >= MAX_COMPONENTS}
                        onClick={() => setTax({ components: [...settings.tax.components, { label: '', share: 0 }] })}>
                        Add component
                      </Button>
                      <Text fontSize="xs" color={Math.abs(shareTotal - 100) < 0.001 ? muted : 'red.500'}>Total: {shareTotal}%</Text>
                    </HStack>
                    <FormErrorMessage>{errors.components}</FormErrorMessage>
                    <FormHelperText fontSize="xs">
                      Splits the server's tax amount by share, e.g. CGST 50% + SGST 50%. Rates are not printed because the server stores only the total tax.
                    </FormHelperText>
                  </FormControl>
                )}
              </VStack>
            </Section>

            <Section title="Options">
              <VStack align="stretch" spacing={4}>
                <FormControl display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <FormLabel htmlFor="auto-print" mb={0} fontSize="sm">Print bill automatically after settlement</FormLabel>
                    <Text fontSize="xs" color={muted}>Otherwise use "Print receipt" after settling, or Print Bill in the order.</Text>
                  </Box>
                  <Switch id="auto-print" isChecked={settings.autoPrintBill} onChange={(e) => set({ autoPrintBill: e.target.checked })} />
                </FormControl>
                <FormControl display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <FormLabel htmlFor="kot-copies" mb={0} fontSize="sm">KOT copies</FormLabel>
                    <Text fontSize="xs" color={muted}>For example, one for the kitchen and one for the counter.</Text>
                  </Box>
                  <Select id="kot-copies" w="90px" size="sm" value={settings.kotCopies} onChange={(e) => set({ kotCopies: parseInt(e.target.value, 10) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </FormControl>
              </VStack>
            </Section>
          </VStack>

          {/* Live preview */}
          <Box position={{ lg: 'sticky' }} top={{ lg: 4 }} bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="14px" p={4}>
            <Flex justify="space-between" align="center" mb={3}>
              <Text fontWeight="700">Preview</Text>
              <HStack spacing={1} role="tablist">
                {[{ key: 'bill', label: 'Bill' }, { key: 'kot', label: 'KOT' }].map((t) => (
                  <Button key={t.key} size="xs" role="tab" aria-selected={previewKind === t.key}
                    variant={previewKind === t.key ? 'solid' : 'ghost'} onClick={() => setPreviewKind(t.key)}>
                    {t.label}
                  </Button>
                ))}
              </HStack>
            </Flex>
            <Box bg={previewBg} borderRadius="10px" p={3} h="560px" overflow="auto" display="flex" justifyContent="center">
              <Box as="iframe" title={`${previewKind} preview`} srcDoc={previewHtml} sandbox=""
                w={PREVIEW_WIDTH[previewFormat]} minW={PREVIEW_WIDTH[previewFormat]} h="100%" bg="white" border="0" boxShadow="md" />
            </Box>
            <Text fontSize="xs" color={muted} mt={2}>Sample data. Real bills use the order, payments and discount from the server.</Text>
            <HStack mt={3}>
              <Button flex={1} size="sm" variant="outline" leftIcon={<Printer size={14} />} onClick={() => testPrint('bill')} isLoading={printing === 'bill'}>Test bill</Button>
              <Button flex={1} size="sm" variant="outline" leftIcon={<Printer size={14} />} onClick={() => testPrint('kot')} isLoading={printing === 'kot'}>Test KOT</Button>
            </HStack>
          </Box>
        </Grid>
      </Box>
    </Box>
  );
};

export default PrintSettingsView;
