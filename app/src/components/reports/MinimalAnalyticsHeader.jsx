import React from 'react';
import {
  Box,
  HStack,
  Text,
  IconButton,
  Icon,
  Select,
  useColorModeValue,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Calendar,
  Download,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

const MotionBox = motion(Box);

/**
 * Minimal Analytics Header Component
 * Clean header with consistent text sizing and minimalistic design
 */
const MinimalAnalyticsHeader = ({
  onDateRangeChange,
  onRefresh,
  onExport,
  isRefreshing = false,
  selectedRange = 'today',
}) => {
  // Color values for minimalistic theme
  const bg = useColorModeValue('white', 'gray.900');
  const inputBg = useColorModeValue('gray.50', 'gray.800');
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const accentColor = useColorModeValue('blue.600', 'blue.400');
  
  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7days', label: 'Last 7 Days' },
    { value: 'last30days', label: 'Last 30 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
  ];
  
  return (
    <Box
      bg={bg}
      px={6}
      py={3}
      borderBottom="1px solid"
      borderColor={useColorModeValue('gray.100', 'gray.800')}
    >
      <HStack spacing={4} justify="space-between">
        {/* Title Section - Minimal */}
        <HStack spacing={2}>
          <Icon as={TrendingUp} boxSize={4} color={accentColor} />
          <Text
            fontSize="md"
            fontWeight="600"
            color={textColor}
            letterSpacing="-0.01em"
          >
            Analytics
          </Text>
        </HStack>
        
        {/* Controls - Right side */}
        <HStack spacing={2}>
          {/* Date Range Selector - Pill style */}
          <HStack spacing={1}>
            <Icon as={Calendar} boxSize={3.5} color={mutedColor} />
            <Select
              value={selectedRange}
              onChange={(e) => onDateRangeChange(e.target.value)}
              size="sm"
              variant="filled"
              fontSize="sm"
              fontWeight="500"
              color={textColor}
              cursor="pointer"
              minW="120px"
              px={2}
              py={1.5}
              bg={inputBg}
              border="none"
              _hover={{ bg: inputBg }}
              _focus={{ bg: inputBg, boxShadow: 'sm' }}
            >
              {dateRangeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </HStack>
          
          {/* Export Menu - Icon only */}
          <Menu>
            <Tooltip label="Export data" fontSize="xs">
              <MenuButton
                as={IconButton}
                icon={<Download size={16} />}
                size="sm"
                variant="ghost"
                borderRadius="full"
                color={mutedColor}
                _hover={{
                  bg: inputBg,
                  color: textColor,
                }}
                aria-label="Export"
              />
            </Tooltip>
            <MenuList fontSize="sm">
              <MenuItem onClick={() => onExport('pdf')}>
                Export as PDF
              </MenuItem>
              <MenuItem onClick={() => onExport('excel')}>
                Export as Excel
              </MenuItem>
              <MenuItem onClick={() => onExport('csv')}>
                Export as CSV
              </MenuItem>
            </MenuList>
          </Menu>
          
          {/* Refresh Button - With rotation animation */}
          <Tooltip label="Refresh data" fontSize="xs">
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
  );
};

export default MinimalAnalyticsHeader;