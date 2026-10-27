import React from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Select,
  Text,
  Tooltip,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { CalendarDays, Clock, FileSpreadsheet, Filter, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  BILL_TYPES,
  DATE_PRESETS,
  PAYMENT_FILTERS,
  PENDING_CATEGORY_LABELS,
  STATUS_FILTERS,
  formatDateTime,
} from '../../utils/historyUtils';

const ShiftStatus = ({ shift, timeZone }) => {
  const bg = useColorModeValue('orange.50', 'whiteAlpha.100');
  const border = useColorModeValue('orange.200', 'orange.600');
  if (!shift) return null;
  let text = 'Shift status unavailable';
  let tip = 'The cash register list could not be read with this login.';
  if (shift.available && !shift.shift) {
    text = 'No previous shift closed';
    tip = 'No closed cash-register shift was found.';
  } else if (shift.shift) {
    const s = shift.shift;
    text = `Last shift closed ${formatDateTime(s.closed_at || s.register_date, timeZone)}`;
    tip = [s.shift && `Shift: ${s.shift}`, s.closed_by_name && `Closed by ${s.closed_by_name}`, `Status: ${s.status}`].filter(Boolean).join(' · ');
  }
  return (
    <Tooltip label={tip} hasArrow>
      <HStack spacing={1.5} px={3} h="32px" borderRadius="8px" border="1px solid" borderColor={border} bg={bg} flexShrink={0} role="status">
        <Icon as={Clock} boxSize={3.5} color="orange.500" />
        <Text fontSize="xs" fontWeight="600" whiteSpace="nowrap">{text}</Text>
      </HStack>
    </Tooltip>
  );
};

const HistoryToolbar = ({
  tab,
  filters,
  onChange,
  dateRange,
  onDateChange,
  tableOptions,
  operatorOptions,
  onRefresh,
  isLoading,
  onExport,
  isExporting,
  exportDisabled,
  canExport = true,
  dateLocked = null,
  shift,
  timeZone,
}) => {
  const chipActiveBg = useColorModeValue('gray.800', 'white');
  const chipActiveColor = useColorModeValue('white', 'gray.900');
  const chipBorder = useColorModeValue('gray.200', 'gray.600');
  const inputBg = useColorModeValue('white', 'gray.800');

  const advancedCount = ['payment', 'table', 'operator', 'pendingCategory']
    .filter((key) => filters[key] && filters[key] !== 'all').length;

  const set = (key) => (event) => onChange({ [key]: event.target.value });

  return (
    <Flex px={{ base: 3, md: 4 }} pt={3} gap={2} wrap="wrap" align="center">
      <Text fontWeight="700" fontSize="lg" mr={1} whiteSpace="nowrap">
        {tab === 'pending' ? 'Pending Bills' : 'Sales History'}
      </Text>

      {tab !== 'pending' && (
        <HStack spacing={1} role="radiogroup" aria-label="Bill status">
          {STATUS_FILTERS.map((s) => {
            const active = filters.status === s.key;
            return (
              <Button
                key={s.key}
                size="sm"
                h="32px"
                role="radio"
                aria-checked={active}
                variant="outline"
                borderColor={active ? chipActiveBg : chipBorder}
                bg={active ? chipActiveBg : 'transparent'}
                color={active ? chipActiveColor : undefined}
                _hover={active ? {} : undefined}
                onClick={() => onChange({ status: s.key })}
              >
                {s.label}
              </Button>
            );
          })}
        </HStack>
      )}

      {tab === 'pending' && (
        <Select size="sm" h="32px" w="auto" minW="210px" borderRadius="8px" bg={inputBg} value={filters.pendingCategory} onChange={set('pendingCategory')} aria-label="Pending category">
          <option value="all">All pending types</option>
          {Object.entries(PENDING_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
      )}

      <InputGroup size="sm" w="auto" minW="150px">
        <InputLeftElement pointerEvents="none" h="32px"><Icon as={Filter} boxSize={3.5} color="gray.400" /></InputLeftElement>
        <Select size="sm" h="32px" pl={7} borderRadius="8px" bg={inputBg} value={filters.billType} onChange={set('billType')} aria-label="Bill type">
          {BILL_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </Select>
      </InputGroup>

      {dateLocked ? (
        <Tooltip label="Your role shows bills since the last cash counter close, today only.">
          <HStack spacing={1.5} px={3} h="32px" borderRadius="8px" border="1px solid" borderColor="gray.200" bg={inputBg}>
            <Icon as={CalendarDays} boxSize={3.5} color="gray.400" />
            <Text fontSize="sm" whiteSpace="nowrap">Current shift</Text>
          </HStack>
        </Tooltip>
      ) : (
      <InputGroup size="sm" w="auto" minW="160px">
        <InputLeftElement pointerEvents="none" h="32px"><Icon as={CalendarDays} boxSize={3.5} color="gray.400" /></InputLeftElement>
        <Select size="sm" h="32px" pl={7} borderRadius="8px" bg={inputBg} value={dateRange.preset} onChange={(e) => onDateChange({ preset: e.target.value })} aria-label="Date range">
          {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
      </InputGroup>
      )}

      {!dateLocked && dateRange.preset === 'custom' && (
        <HStack spacing={1} wrap="wrap">
          <Input type="date" size="sm" h="32px" w="140px" borderRadius="8px" bg={inputBg} value={dateRange.customFrom} onChange={(e) => onDateChange({ customFrom: e.target.value })} aria-label="From date" />
          <Input type="time" size="sm" h="32px" w="105px" borderRadius="8px" bg={inputBg} value={dateRange.customFromTime} onChange={(e) => onDateChange({ customFromTime: e.target.value || '00:00' })} aria-label="From time" />
          <Text fontSize="sm">to</Text>
          <Input type="date" size="sm" h="32px" w="140px" borderRadius="8px" bg={inputBg} value={dateRange.customTo} onChange={(e) => onDateChange({ customTo: e.target.value })} aria-label="To date" />
          <Input type="time" size="sm" h="32px" w="105px" borderRadius="8px" bg={inputBg} value={dateRange.customToTime} onChange={(e) => onDateChange({ customToTime: e.target.value || '23:59' })} aria-label="To time" />
        </HStack>
      )}

      <Popover placement="bottom-start">
        <PopoverTrigger>
          <Button size="sm" h="32px" variant="outline" leftIcon={<SlidersHorizontal size={14} />} borderRadius="8px">
            Filters
            {advancedCount > 0 && <Badge ml={1.5} colorScheme="orange" borderRadius="full">{advancedCount}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent w="280px">
          <PopoverArrow />
          <PopoverBody>
            <VStack spacing={3} align="stretch">
              <FormControl>
                <FormLabel fontSize="xs" mb={1}>Payment method</FormLabel>
                <Select size="sm" value={filters.payment} onChange={set('payment')}>
                  <option value="all">All methods</option>
                  {PAYMENT_FILTERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" mb={1}>Table</FormLabel>
                <Select size="sm" value={filters.table} onChange={set('table')}>
                  <option value="all">All tables</option>
                  {tableOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" mb={1}>Operator / cashier</FormLabel>
                <Select size="sm" value={filters.operator} onChange={set('operator')}>
                  <option value="all">All operators</option>
                  {operatorOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </FormControl>
              {advancedCount > 0 && (
                <Button size="sm" variant="ghost" onClick={() => onChange({ payment: 'all', table: 'all', operator: 'all', pendingCategory: 'all' })}>
                  Clear filters
                </Button>
              )}
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Popover>

      <Box flex="1 1 220px" maxW="380px" mx={{ base: 0, lg: 'auto' }}>
        <InputGroup size="sm">
          <InputLeftElement pointerEvents="none" h="32px"><Icon as={Search} boxSize={4} color="gray.400" /></InputLeftElement>
          <Input
            h="32px"
            borderRadius="8px"
            bg={inputBg}
            placeholder="Search bill no, amount, name, mobile..."
            value={filters.search}
            onChange={set('search')}
            aria-label="Search bills"
          />
          {filters.search && (
            <InputRightElement h="32px">
              <IconButton size="xs" variant="ghost" aria-label="Clear search" icon={<X size={14} />} onClick={() => onChange({ search: '' })} />
            </InputRightElement>
          )}
        </InputGroup>
      </Box>

      <HStack spacing={2} ml="auto">
        <Tooltip label="Reload bills">
          <IconButton size="sm" h="32px" variant="outline" borderRadius="8px" aria-label="Reload bills" icon={<RefreshCw size={15} />} onClick={onRefresh} isLoading={isLoading} />
        </Tooltip>
        {canExport && (
        <Button
          size="sm"
          h="32px"
          colorScheme="green"
          borderRadius="8px"
          leftIcon={<FileSpreadsheet size={15} />}
          onClick={onExport}
          isLoading={isExporting}
          loadingText="Exporting"
          isDisabled={exportDisabled}
        >
          Export Excel
        </Button>
        )}
        <ShiftStatus shift={shift} timeZone={timeZone} />
      </HStack>
    </Flex>
  );
};

export default HistoryToolbar;
