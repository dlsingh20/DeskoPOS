import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  InputGroup,
  InputLeftElement,
  Input,
  Select,
  IconButton,
  Icon,
  useColorModeValue,
  Tooltip,
  Collapse,
  Button,
  Badge,
  ButtonGroup,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import {
  Search,
  Calendar,
  Download,
  RefreshCw,
  Archive as ArchiveIcon,
  ChevronDown,
  Filter,
  Table,
  Grid3x3,
  List,
} from 'lucide-react';

const MotionBox = motion(Box);

/**
 * Minimal Archive Header Component
 * Streamlined filter controls with premium design
 */
const MinimalArchiveHeader = ({
  searchQuery,
  onSearchChange,
  selectedDate,
  onSelectedDateChange,
  dateRange,
  onDateRangeChange,
  orderLimit,
  onOrderLimitChange,
  customDateFrom,
  onCustomDateFromChange,
  customDateTo,
  onCustomDateToChange,
  onRefresh,
  onExport,
  isRefreshing = false,
  showAdvancedFilters = false,
  onToggleAdvancedFilters,
  totalOrders = 0,
  viewMode,
  onViewModeChange,
}) => {
  // Color values for minimalistic theme
  const bg = useColorModeValue('white', 'gray.900');
  const inputBg = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const accentColor = useColorModeValue('blue.600', 'blue.400');
  const customDateBg = useColorModeValue('gray.50', 'gray.850');
  
  const dateRangeOptions = [
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7days', label: 'Last 7 Days' },
    { value: 'last30days', label: 'Last 30 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'custom', label: 'Custom Range' },
  ];
  
  const limitOptions = [
    { value: '20', label: '20' },
    { value: '50', label: '50' },
    { value: '100', label: '100' },
    { value: 'all', label: 'All' },
  ];
  
  return (
    <VStack spacing={0} w="full" align="stretch">
      {/* Main Header Bar */}
      <Box
        bg={bg}
        px={6}
        py={3}
        borderBottom="1px solid"
        borderColor={useColorModeValue('gray.100', 'gray.800')}
      >
        <HStack spacing={4} justify="space-between">
          {/* Title with Icon and Count */}
          <HStack spacing={2} minW="200px">
            <Icon as={ArchiveIcon} boxSize={4} color={mutedColor} />
            <Text
              fontSize="sm"
              fontWeight="600"
              color={textColor}
              letterSpacing="-0.01em"
            >
              Archive
            </Text>
            {totalOrders > 0 && (
              <Badge colorScheme="blue" fontSize="xs" px={2} borderRadius="full">
                {totalOrders}
              </Badge>
            )}
          </HStack>
          
          {/* Clean Search Input */}
          <InputGroup maxW="300px">
            <InputLeftElement pointerEvents="none" h="full">
              <Icon as={Search} color={mutedColor} boxSize={4} />
            </InputLeftElement>
            <Input
              placeholder="Search archives..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              bg={inputBg}
              border="none"
              borderRadius="full"
              fontSize="sm"
              h="36px"
              pl={10}
              _placeholder={{ color: mutedColor }}
              _hover={{
                bg: useColorModeValue('gray.100', 'gray.750'),
              }}
              _focus={{
                bg: bg,
                boxShadow: 'sm',
                border: '1px solid',
                borderColor: borderColor,
              }}
            />
          </InputGroup>
          
          {/* Inline Filter Controls */}
          <HStack spacing={3} flex={1} justify="center">
            {/* Prominent Date Picker */}
            <HStack spacing={1} bg={inputBg} px={2} py={1} borderRadius="md">
              <Icon as={Calendar} boxSize={4} color={accentColor} />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => onSelectedDateChange(e.target.value)}
                size="sm"
                variant="unstyled"
                fontSize="sm"
                fontWeight="500"
                color={textColor}
                cursor="pointer"
                minW="140px"
                max={new Date().toISOString().split('T')[0]}
              />
            </HStack>
            
            {/* Quick Date Presets */}
            <ButtonGroup size="xs" variant="ghost" spacing={1}>
              <Button 
                onClick={() => {
                  const today = new Date();
                  onSelectedDateChange(today.toISOString().split('T')[0]);
                }}
                color={mutedColor}
                _hover={{ color: accentColor }}
              >
                Today
              </Button>
              <Button 
                onClick={() => {
                  const yesterday = new Date(Date.now() - 86400000);
                  onSelectedDateChange(yesterday.toISOString().split('T')[0]);
                }}
                color={mutedColor}
                _hover={{ color: accentColor }}
                fontWeight="600"
              >
                Yesterday
              </Button>
              <Button 
                onClick={() => {
                  const week = new Date(Date.now() - 7 * 86400000);
                  onSelectedDateChange(week.toISOString().split('T')[0]);
                }}
                color={mutedColor}
                _hover={{ color: accentColor }}
              >
                -7d
              </Button>
            </ButtonGroup>
            
            {/* Show/Limit Selector - Ultra Compact */}
            <HStack spacing={1}>
              <Text fontSize="xs" color={mutedColor}>Show</Text>
              <Select
                value={orderLimit}
                onChange={(e) => onOrderLimitChange(e.target.value)}
                size="sm"
                variant="filled"
                fontSize="sm"
                fontWeight="500"
                color={textColor}
                cursor="pointer"
                w="60px"
                px={2}
                py={1.5}
                bg={inputBg}
                border="none"
                _hover={{ bg: inputBg }}
                _focus={{ bg: inputBg, boxShadow: 'sm' }}
              >
                {limitOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </HStack>
          </HStack>
          
          {/* Action Buttons - Icon Only */}
          <HStack spacing={2}>
            {/* View Mode Toggle */}
            {onViewModeChange && (
              <ButtonGroup size="sm" isAttached variant="outline">
                <Tooltip label="Table View" fontSize="xs">
                  <IconButton
                    icon={<Table size={14} />}
                    onClick={() => onViewModeChange('table')}
                    colorScheme={viewMode === 'table' ? 'blue' : 'gray'}
                    variant={viewMode === 'table' ? 'solid' : 'outline'}
                    aria-label="Table view"
                  />
                </Tooltip>
                <Tooltip label="Grid View" fontSize="xs">
                  <IconButton
                    icon={<Grid3x3 size={14} />}
                    onClick={() => onViewModeChange('grid')}
                    colorScheme={viewMode === 'grid' ? 'blue' : 'gray'}
                    variant={viewMode === 'grid' ? 'solid' : 'outline'}
                    aria-label="Grid view"
                  />
                </Tooltip>
                <Tooltip label="List View" fontSize="xs">
                  <IconButton
                    icon={<List size={14} />}
                    onClick={() => onViewModeChange('list')}
                    colorScheme={viewMode === 'list' ? 'blue' : 'gray'}
                    variant={viewMode === 'list' ? 'solid' : 'outline'}
                    aria-label="List view"
                  />
                </Tooltip>
              </ButtonGroup>
            )}
            
            {/* Advanced Filters Toggle */}
            {dateRange === 'custom' && (
              <Tooltip label="Advanced filters" fontSize="xs">
                <IconButton
                  icon={<Filter size={16} />}
                  size="sm"
                  variant="ghost"
                  borderRadius="full"
                  color={showAdvancedFilters ? accentColor : mutedColor}
                  bg={showAdvancedFilters ? inputBg : 'transparent'}
                  _hover={{
                    bg: inputBg,
                    color: showAdvancedFilters ? accentColor : textColor,
                  }}
                  onClick={onToggleAdvancedFilters}
                  aria-label="Toggle advanced filters"
                />
              </Tooltip>
            )}
            
            {/* Export Button */}
            <Tooltip label="Export to CSV" fontSize="xs">
              <IconButton
                icon={<Download size={16} />}
                size="sm"
                variant="ghost"
                borderRadius="full"
                color={mutedColor}
                _hover={{
                  bg: inputBg,
                  color: textColor,
                }}
                onClick={onExport}
                aria-label="Export"
              />
            </Tooltip>
            
            {/* Refresh Button */}
            <Tooltip label="Refresh" fontSize="xs">
              <IconButton
                icon={
                  <MotionBox
                    animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                    transition={
                      isRefreshing 
                        ? { duration: 1, repeat: Infinity, ease: "linear" }
                        : { duration: 0 }
                    }
                  >
                    <RefreshCw size={16} />
                  </MotionBox>
                }
                size="sm"
                variant="ghost"
                borderRadius="full"
                color={mutedColor}
                _hover={{
                  bg: inputBg,
                  color: textColor,
                }}
                onClick={onRefresh}
                isDisabled={isRefreshing}
                aria-label="Refresh"
              />
            </Tooltip>
          </HStack>
        </HStack>
      </Box>
      
      {/* Custom Date Range - Collapsible */}
      {dateRange === 'custom' && (
        <Collapse in={showAdvancedFilters}>
          <Box
            bg={customDateBg}
            px={6}
            py={3}
            borderBottom="1px solid"
            borderColor={borderColor}
          >
            <HStack spacing={4}>
              <VStack align="start" spacing={1}>
                <Text fontSize="xs" color={mutedColor}>From Date</Text>
                <Input
                  type="date"
                  size="sm"
                  value={customDateFrom}
                  onChange={(e) => onCustomDateFromChange(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  borderRadius="md"
                  fontSize="sm"
                  borderColor={borderColor}
                />
              </VStack>
              
              <VStack align="start" spacing={1}>
                <Text fontSize="xs" color={mutedColor}>To Date</Text>
                <Input
                  type="date"
                  size="sm"
                  value={customDateTo}
                  onChange={(e) => onCustomDateToChange(e.target.value)}
                  max={new Date(Date.now() - 86400000).toISOString().split('T')[0]}
                  borderRadius="md"
                  fontSize="sm"
                  borderColor={borderColor}
                />
              </VStack>
              
              <VStack align="start" spacing={1} justify="flex-end">
                <Text fontSize="xs" color="transparent">Apply</Text>
                <Button
                  size="sm"
                  colorScheme="blue"
                  borderRadius="md"
                  fontSize="sm"
                  px={6}
                >
                  Apply Range
                </Button>
              </VStack>
            </HStack>
          </Box>
        </Collapse>
      )}
    </VStack>
  );
};

export default MinimalArchiveHeader;