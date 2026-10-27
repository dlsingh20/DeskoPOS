import React from 'react';
import {
  Box,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  useColorModeValue,
} from '@chakra-ui/react';
import { Calendar, ChevronDown } from 'lucide-react';

const DateRangePicker = ({ dateRange, onChange }) => {
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  
  // Preset date ranges
  const presets = [
    {
      label: 'Today',
      value: 'today',
      getDates: () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { startDate: today, endDate: tomorrow };
      },
    },
    {
      label: 'Yesterday',
      value: 'yesterday',
      getDates: () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return { startDate: yesterday, endDate: today };
      },
    },
    {
      label: 'This Week',
      value: 'this_week',
      getDates: () => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);
        return { startDate: startOfWeek, endDate: endOfWeek };
      },
    },
    {
      label: 'Last Week',
      value: 'last_week',
      getDates: () => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfLastWeek = new Date(today);
        startOfLastWeek.setDate(today.getDate() - dayOfWeek - 7);
        startOfLastWeek.setHours(0, 0, 0, 0);
        const endOfLastWeek = new Date(startOfLastWeek);
        endOfLastWeek.setDate(startOfLastWeek.getDate() + 7);
        return { startDate: startOfLastWeek, endDate: endOfLastWeek };
      },
    },
    {
      label: 'This Month',
      value: 'this_month',
      getDates: () => {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        return { startDate: startOfMonth, endDate: endOfMonth };
      },
    },
    {
      label: 'Last Month',
      value: 'last_month',
      getDates: () => {
        const today = new Date();
        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: startOfLastMonth, endDate: endOfLastMonth };
      },
    },
    {
      label: 'Last 7 Days',
      value: 'last_7_days',
      getDates: () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        return { startDate, endDate };
      },
    },
    {
      label: 'Last 30 Days',
      value: 'last_30_days',
      getDates: () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        return { startDate, endDate };
      },
    },
  ];
  
  const handlePresetSelect = (preset) => {
    const dates = preset.getDates();
    onChange({
      ...dates,
      preset: preset.value,
    });
  };
  
  const formatDateRange = () => {
    if (dateRange.preset) {
      const preset = presets.find(p => p.value === dateRange.preset);
      if (preset) return preset.label;
    }
    
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };
    
    if (!dateRange.startDate || !dateRange.endDate) return 'Select Date Range';
    
    const start = formatDate(dateRange.startDate);
    const end = formatDate(dateRange.endDate);
    
    if (start === end) return start;
    return `${start} - ${end}`;
  };
  
  return (
    <Menu>
      <MenuButton
        as={Button}
        rightIcon={<ChevronDown />}
        leftIcon={<Calendar />}
        variant="outline"
        size="md"
        minW="200px"
      >
        {formatDateRange()}
      </MenuButton>
      <MenuList bg={bg} borderColor={borderColor}>
        {presets.map((preset) => (
          <MenuItem
            key={preset.value}
            onClick={() => handlePresetSelect(preset)}
            bg={dateRange.preset === preset.value ? 'pos.50' : undefined}
          >
            {preset.label}
          </MenuItem>
        ))}
        <MenuDivider />
        <MenuItem isDisabled>
          Custom Range (Coming Soon)
        </MenuItem>
      </MenuList>
    </Menu>
  );
};

export default DateRangePicker;