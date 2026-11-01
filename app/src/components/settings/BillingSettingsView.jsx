import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertIcon,
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
  Input,
  InputGroup,
  InputRightAddon,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Switch,
  Text,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { Receipt, RotateCcw, Save } from 'lucide-react';
import ApiClient from '../../services/ApiClient';
import hotelService from '../../services/HotelService';
import taxService from '../../services/TaxService';
import { usePOS } from '../../context/POSContext';
import { exampleBill } from '../../utils/billingExample';

const SETTINGS_URL = '/api/pos/api/settings/';

export const ROUNDING = [
  { key: 'nearest', label: 'To the nearest whole amount' },
  { key: 'up', label: 'Always up' },
  { key: 'down', label: 'Always down' },
  { key: 'none', label: 'No rounding' },
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const fromServer = (s) => {
  const rate = parseFloat(s.service_charge_rate) || 0;
  return {
    serviceOn: rate > 0,
    serviceRate: rate > 0 ? String(rate) : '',
    dineInOnly: !!s.service_charge_dine_in_only,
    pricesIncludeTax: !!s.prices_include_tax,
    roundingMode: s.rounding_mode || 'nearest',
    discountLimit: s.cashier_discount_limit != null ? String(parseFloat(s.cashier_discount_limit)) : '10',
  };
};

const toServer = (f) => ({
  service_charge_rate: f.serviceOn ? Number(f.serviceRate) : 0,
  service_charge_dine_in_only: f.dineInOnly,
  prices_include_tax: f.pricesIncludeTax,
  rounding_mode: f.roundingMode,
  cashier_discount_limit: Number(f.discountLimit),
});

const percentError = (value, { positive = false } = {}) => {
  const text = String(value).trim();
  if (!text) return 'Enter a percentage.';
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'Enter a number from 0 to 100.';
  if (positive && n === 0) return 'Enter more than 0, or switch the service charge off.';
  return null;
};

const Section = ({ title, subtitle, children }) => {
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');
  return (
    <Box bg={panelBg} borderWidth="1px" borderColor={lineColor} borderRadius="12px" p={{ base: 4, md: 5 }}>
      <Text fontWeight="700">{title}</Text>
      {subtitle && <Text fontSize="sm" color={muted} mb={3}>{subtitle}</Text>}
      {!subtitle && <Box mb={3} />}
      {children}
    </Box>
  );
};

const YesNo = ({ value, onChange, name }) => (
  <RadioGroup value={value ? 'yes' : 'no'} onChange={(v) => onChange(v === 'yes')} name={name}>
    <HStack spacing={6}>
      <Radio value="yes">Yes</Radio>
      <Radio value="no">No</Radio>
    </HStack>
  </RadioGroup>
);

const BillingSettingsView = () => {
  const { state } = usePOS();
  const restaurant = state.selectedRestaurant;
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [taxRate, setTaxRate] = useState(null);

  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const muted = useColorModeValue('gray.500', 'gray.400');
  const exampleBg = useColorModeValue('gray.50', 'gray.700');

  useEffect(() => {
    let cancelled = false;
    ApiClient.get(SETTINGS_URL)
      .then((response) => {
        if (cancelled) return;
        const initial = fromServer(response.data);
        setForm(initial);
        setSaved(initial);
      })
      .catch((error) => { if (!cancelled) setLoadError(error?.response?.data?.detail || error.message || 'Could not load the settings.'); });
    return () => { cancelled = true; };
  }, []);

  // The example uses this restaurant's percentage taxes added up (e.g. VAT 7%)
  useEffect(() => {
    if (!restaurant) return undefined;
    let cancelled = false;
    taxService.listTaxes(restaurant.id)
      .then(({ taxes }) => {
        if (cancelled) return;
        const percent = taxes.filter((t) => t.is_active !== false && t.type === 'percentage');
        setTaxRate(percent.length ? { rate: percent.reduce((sum, t) => sum + (parseFloat(t.rate) || 0), 0), names: percent.map((t) => t.name) } : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [restaurant]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const errors = form ? {
    serviceRate: form.serviceOn ? percentError(form.serviceRate, { positive: true }) : null,
    discountLimit: percentError(form.discountLimit),
  } : {};
  const isValid = !Object.values(errors).some(Boolean);
  const isDirty = !!form && JSON.stringify(form) !== JSON.stringify(saved);
  const shown = (key) => (showErrors ? errors[key] : null);

  const example = useMemo(() => {
    if (!form) return null;
    const rate = taxRate?.rate ?? 7;
    const serviceRate = form.serviceOn && !errors.serviceRate ? Number(form.serviceRate) : 0;
    const price = form.pricesIncludeTax ? round2(100 * (1 + rate / 100)) : 100;
    return { rate, names: taxRate?.names || ['VAT'], serviceRate, price, ...exampleBill({ price, taxRate: rate, serviceRate, pricesIncludeTax: form.pricesIncludeTax }) };
  }, [form, taxRate, errors.serviceRate]);

  const handleSave = async () => {
    setShowErrors(true);
    if (!isValid) {
      toast({ title: 'Check the highlighted fields', status: 'warning', duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      const response = await ApiClient.patch(SETTINGS_URL, toServer(form));
      const next = fromServer(response.data);
      setForm(next);
      setSaved(next);
      setShowErrors(false);
      hotelService.getCurrentHotelSettings(true).catch(() => {});
      toast({ title: 'Billing settings saved', description: 'Orders opened from now on use them.', status: 'success', duration: 3000 });
    } catch (error) {
      const message = error?.response?.status === 403
        ? 'Only an Administrator can change billing settings.'
        : (error?.response?.data?.detail || error.message || 'The server did not save them.');
      toast({ title: 'Could not save', description: message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <Center h="full" bg={pageBg} px={4}>
        <Alert status="error" borderRadius="md" maxW="480px"><AlertIcon />{loadError}</Alert>
      </Center>
    );
  }
  if (!form) {
    return <Center h="full" bg={pageBg}><Spinner /></Center>;
  }

  const fmt = (n) => n.toFixed(2);

  return (
    <Box h="full" overflowY="auto" bg={pageBg}>
      <Box maxW="1100px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={3} mb={4}>
          <Box>
            <HStack spacing={2}>
              <Icon as={Receipt} boxSize={5} />
              <Text fontSize="xl" fontWeight="700">Billing</Text>
              {isDirty && <Badge colorScheme="orange">Unsaved changes</Badge>}
            </HStack>
            <Text fontSize="sm" color={muted}>Service charge, tax and rounding for every outlet. Changes apply to orders opened after you save.</Text>
          </Box>
          <HStack>
            <Button leftIcon={<RotateCcw size={16} />} variant="ghost" onClick={() => { setForm(saved); setShowErrors(false); }} isDisabled={!isDirty}>
              Undo changes
            </Button>
            <Button leftIcon={<Save size={16} />} colorScheme="blue" onClick={handleSave} isDisabled={!isDirty} isLoading={saving}>
              Save
            </Button>
          </HStack>
        </Flex>

        <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 360px' }} gap={5} alignItems="start">
          <VStack align="stretch" spacing={5}>
            <Section title="Service charge" subtitle="Added on top of the bill. Taxes are charged on it too.">
              <FormControl display="flex" alignItems="center" gap={3} mb={form.serviceOn ? 4 : 0}>
                <Switch id="service-on" isChecked={form.serviceOn}
                  onChange={(e) => set({ serviceOn: e.target.checked, serviceRate: e.target.checked && !form.serviceRate ? '10' : form.serviceRate })} />
                <FormLabel htmlFor="service-on" mb={0}>{form.serviceOn ? 'On' : 'Off'}</FormLabel>
              </FormControl>
              {form.serviceOn && (
                <VStack align="stretch" spacing={4}>
                  <FormControl isRequired isInvalid={!!shown('serviceRate')} maxW="220px">
                    <FormLabel fontSize="sm">Service charge</FormLabel>
                    <InputGroup>
                      <Input inputMode="decimal" value={form.serviceRate} onChange={(e) => set({ serviceRate: e.target.value })} />
                      <InputRightAddon>%</InputRightAddon>
                    </InputGroup>
                    <FormErrorMessage>{shown('serviceRate')}</FormErrorMessage>
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">Dine-in only?</FormLabel>
                    <YesNo name="dine-in-only" value={form.dineInOnly} onChange={(v) => set({ dineInOnly: v })} />
                    <FormHelperText>Yes: takeaway and delivery bills have no service charge.</FormHelperText>
                  </FormControl>
                </VStack>
              )}
            </Section>

            <Section title="Tax">
              <FormControl>
                <FormLabel fontSize="sm">Do menu prices include tax?</FormLabel>
                <YesNo name="prices-include-tax" value={form.pricesIncludeTax} onChange={(v) => set({ pricesIncludeTax: v })} />
                <FormHelperText>Only the taxes. The service charge is never inside the menu price.</FormHelperText>
              </FormControl>
            </Section>

            <Section title="Bill total and discounts">
              <VStack align="stretch" spacing={4}>
                <FormControl maxW="320px">
                  <FormLabel fontSize="sm" htmlFor="rounding">Round the bill total</FormLabel>
                  <Select id="rounding" value={form.roundingMode} onChange={(e) => set({ roundingMode: e.target.value })}>
                    {ROUNDING.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </Select>
                </FormControl>
                <FormControl isRequired isInvalid={!!shown('discountLimit')} maxW="220px">
                  <FormLabel fontSize="sm">Cashier discount limit</FormLabel>
                  <InputGroup>
                    <Input inputMode="decimal" value={form.discountLimit} onChange={(e) => set({ discountLimit: e.target.value })} />
                    <InputRightAddon>%</InputRightAddon>
                  </InputGroup>
                  <FormErrorMessage>{shown('discountLimit')}</FormErrorMessage>
                  <FormHelperText>Higher discounts need a manager's approval.</FormHelperText>
                </FormControl>
              </VStack>
            </Section>
          </VStack>

          {example && (
            <Section title="Example bill" subtitle={`One item, with ${example.names.join(' + ')} ${example.rate}%${taxRate ? '' : ' (sample)'}.`}>
              <Box bg={exampleBg} borderRadius="8px" p={4} fontFamily="mono" fontSize="sm" data-testid="billing-example">
                <Flex justify="space-between"><Text>Menu price{form.pricesIncludeTax ? ' (incl. tax)' : ''}</Text><Text>{fmt(example.price)}</Text></Flex>
                {form.pricesIncludeTax && (
                  <Flex justify="space-between" color={muted}><Text>Price before tax</Text><Text>{fmt(example.base)}</Text></Flex>
                )}
                {example.serviceRate > 0 && (
                  <Flex justify="space-between"><Text>Service charge {example.serviceRate}%</Text><Text>{fmt(example.service)}</Text></Flex>
                )}
                <Flex justify="space-between"><Text>Tax {example.rate}%</Text><Text>{fmt(example.tax)}</Text></Flex>
                <Box borderTopWidth="1px" my={2} />
                <Flex justify="space-between" fontWeight="700"><Text>Total</Text><Text>{fmt(example.total)}</Text></Flex>
              </Box>
              <Text fontSize="xs" color={muted} mt={2}>Before rounding. Tax is charged on {example.serviceRate > 0 ? 'the price and the service charge' : 'the price'}.</Text>
            </Section>
          )}
        </Grid>
      </Box>
    </Box>
  );
};

export default BillingSettingsView;
