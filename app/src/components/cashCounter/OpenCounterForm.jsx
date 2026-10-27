import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputLeftAddon,
  Select,
  SimpleGrid,
  Spinner,
  Text,
  Textarea,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { Lock, Monitor } from 'lucide-react';
import cashCounterService from '../../services/CashCounterService';
import { describeApiError } from '../../services/UserService';
import { busyCounters, num, sortCounters, validateAmount } from '../../utils/cashCounterUtils';

const LAST_COUNTER_KEY = 'pos.cashCounter.lastId';
const readLast = () => { try { return localStorage.getItem(LAST_COUNTER_KEY); } catch (e) { return null; } };
const saveLast = (id) => { try { localStorage.setItem(LAST_COUNTER_KEY, String(id)); } catch (e) { /* storage blocked */ } };

/**
 * Pick a free counter, confirm the opening cash (pre-filled with what the last shift left) and open a shift.
 */
const OpenCounterForm = ({ counters, userId, decimals = 2, currencySymbol = '', formatPrice, onOpened, footer = null }) => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(new Map());
  const [templates, setTemplates] = useState([]);
  const [counterId, setCounterId] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [opening, setOpening] = useState('');
  const [notes, setNotes] = useState('');
  const [defaultsFor, setDefaultsFor] = useState(null);
  const [carriedFrom, setCarriedFrom] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const cardBg = useColorModeValue('white', 'gray.800');
  const selectedBg = useColorModeValue('blue.50', 'blue.900');
  const lineColor = useColorModeValue('gray.200', 'gray.600');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const active = useMemo(() => sortCounters(counters.filter((c) => c.is_active !== false)), [counters]);

  // Who is on which counter, and the shift names; failures only lose the "in use" hints
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      cashCounterService.listShifts().then((rows) => busyCounters(rows, userId)).catch(() => new Map()),
      cashCounterService.listShiftTemplates(),
    ]).then(([busyMap, list]) => {
      if (cancelled) return;
      setBusy(busyMap);
      setTemplates(list);
      const last = readLast();
      const free = active.filter((c) => !busyMap.has(Number(c.id)));
      const pick = free.find((c) => String(c.id) === last) || (free.length === 1 ? free[0] : null);
      if (pick) setCounterId(Number(pick.id));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active, userId]);

  // Opening cash and shift from the counter's last close
  useEffect(() => {
    if (counterId == null) return;
    let cancelled = false;
    cashCounterService.getOpenDefaults(counterId).then((d) => {
      if (cancelled) return;
      setDefaultsFor(counterId);
      setCarriedFrom(d.carried_from || null);
      if (d.opening_balance != null && d.opening_balance !== '') setOpening(num(d.opening_balance).toFixed(decimals));
      else setOpening((v) => v || (0).toFixed(decimals));
      // shift_template comes as an object ({ id, name, … }); older servers may send the id
      const template = d.shift_template?.id ?? d.shift_template;
      if (template != null && template !== '') setTemplateId(String(template));
    });
    return () => { cancelled = true; };
  }, [counterId, decimals]);

  const openingError = validateAmount(opening, decimals);
  const counterError = counterId == null ? 'Choose a counter.' : null;

  const submit = async (event) => {
    event?.preventDefault();
    setShowErrors(true);
    if (openingError || counterError || saving) return;
    const counter = active.find((c) => Number(c.id) === counterId);
    setSaving(true);
    setError(null);
    try {
      const shift = await cashCounterService.openShift({
        counterId: Number(counter.id),
        shiftTemplateId: templateId ? Number(templateId) : null,
        openingBalance: num(opening).toFixed(decimals),
        notes: notes.trim(),
      });
      saveLast(counter.id);
      onOpened(shift);
    } catch (err) {
      setError(describeApiError(err, 'Could not open the counter.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <HStack py={6} justify="center"><Spinner size="sm" /><Text fontSize="sm">Loading counters…</Text></HStack>;

  return (
    <VStack as="form" onSubmit={submit} align="stretch" spacing={4}>
      <FormControl isInvalid={showErrors && !!counterError}>
        <FormLabel fontSize="sm">Counter</FormLabel>
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2} role="radiogroup" aria-label="Counter">
          {active.map((c) => {
            const taken = busy.get(Number(c.id));
            const selected = Number(c.id) === counterId;
            return (
              <Box
                key={c.id}
                as="button"
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!!taken}
                onClick={() => setCounterId(Number(c.id))}
                textAlign="left"
                borderWidth="2px"
                borderColor={selected ? 'blue.500' : lineColor}
                bg={selected ? selectedBg : cardBg}
                borderRadius="12px"
                px={3}
                py={2.5}
                opacity={taken ? 0.55 : 1}
                cursor={taken ? 'not-allowed' : 'pointer'}
                _focusVisible={{ outline: '2px solid', outlineColor: 'blue.500', outlineOffset: '2px' }}
              >
                <HStack justify="space-between">
                  <HStack spacing={2}><Monitor size={16} /><Text fontWeight="600">{c.name}</Text></HStack>
                  {taken && <Badge colorScheme="orange" display="flex" alignItems="center" gap={1}><Lock size={10} />In use</Badge>}
                </HStack>
                {taken && <Text fontSize="xs" color={muted} mt={1}>{taken.cashier_name || 'Another user'} has it open</Text>}
              </Box>
            );
          })}
        </SimpleGrid>
        <FormErrorMessage>{counterError}</FormErrorMessage>
      </FormControl>

      <SimpleGrid columns={{ base: 1, sm: templates.length ? 2 : 1 }} spacing={3}>
        <FormControl isRequired isInvalid={showErrors && !!openingError}>
          <FormLabel fontSize="sm">Opening cash in the drawer</FormLabel>
          <InputGroup>
            {currencySymbol && <InputLeftAddon>{currencySymbol}</InputLeftAddon>}
            <Input value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
          </InputGroup>
          {showErrors && openingError
            ? <FormErrorMessage>{openingError}</FormErrorMessage>
            : <FormHelperText fontSize="xs">{defaultsFor === counterId && carriedFrom
              ? `Carried over from ${carriedFrom.cashier || carriedFrom.cashier_name || 'the last shift'}'s close. Count it and correct it if needed.`
              : 'Count the cash in the drawer.'}</FormHelperText>}
        </FormControl>
        {templates.length > 0 && (
          <FormControl>
            <FormLabel fontSize="sm">Shift</FormLabel>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} placeholder="No shift name">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({String(t.start_time).slice(0, 5)}–{String(t.end_time).slice(0, 5)})</option>)}
            </Select>
          </FormControl>
        )}
      </SimpleGrid>

      <FormControl>
        <FormLabel fontSize="sm">Notes</FormLabel>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} placeholder="Optional" />
      </FormControl>

      {error && <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}

      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Box>{footer}</Box>
        <Button type="submit" colorScheme="blue" isLoading={saving} loadingText="Opening">
          Open counter{counterId != null && opening && !openingError && formatPrice ? ` with ${formatPrice(num(opening))}` : ''}
        </Button>
      </HStack>
    </VStack>
  );
};

export default OpenCounterForm;
