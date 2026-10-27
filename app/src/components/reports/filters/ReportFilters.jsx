import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverCloseButton,
  VStack,
  HStack,
  Text,
  Select,
  Badge,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import { Filter, X } from 'lucide-react';

const ReportFilters = ({ filters, onChange }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  
  // Local state for editing filters
  const [localFilters, setLocalFilters] = React.useState(filters);
  
  // Count active filters
  const activeFilterCount = Object.values(filters).filter(v => v !== 'all').length;
  
  const handleApply = () => {
    onChange(localFilters);
    onClose();
  };
  
  const handleReset = () => {
    const resetFilters = {
      restaurant: 'all',
      orderType: 'all',
      paymentStatus: 'all',
      staff: 'all',
    };
    setLocalFilters(resetFilters);
    onChange(resetFilters);
  };
  
  const handleFilterChange = (key, value) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  };
  
  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      placement="bottom-end"
      closeOnBlur={false}
    >
      <PopoverTrigger>
        <Box position="relative">
          <IconButton
            icon={<Filter />}
            variant="outline"
            size="md"
            colorScheme={activeFilterCount > 0 ? 'pos' : 'gray'}
          />
          {activeFilterCount > 0 && (
            <Badge
              position="absolute"
              top="-8px"
              right="-8px"
              colorScheme="pos"
              variant="solid"
              borderRadius="full"
              minW="20px"
              textAlign="center"
            >
              {activeFilterCount}
            </Badge>
          )}
        </Box>
      </PopoverTrigger>
      <PopoverContent bg={bg} borderColor={borderColor} width="300px">
        <PopoverCloseButton />
        <PopoverHeader fontWeight="semibold">Filters</PopoverHeader>
        <PopoverBody>
          <VStack spacing={4} align="stretch">
            {/* Restaurant Filter */}
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Restaurant
              </Text>
              <Select
                size="sm"
                value={localFilters.restaurant}
                onChange={(e) => handleFilterChange('restaurant', e.target.value)}
              >
                <option value="all">All Restaurants</option>
                <option value="main">Main Restaurant</option>
                <option value="cafe">Café</option>
                <option value="bar">Bar</option>
              </Select>
            </Box>
            
            {/* Order Type Filter */}
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Order Type
              </Text>
              <Select
                size="sm"
                value={localFilters.orderType}
                onChange={(e) => handleFilterChange('orderType', e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="dine_in">Dine In</option>
                <option value="takeaway">Takeaway</option>
                <option value="delivery">Delivery</option>
                <option value="room_service">Room Service</option>
              </Select>
            </Box>
            
            {/* Payment Status Filter */}
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Payment Status
              </Text>
              <Select
                size="sm"
                value={localFilters.paymentStatus}
                onChange={(e) => handleFilterChange('paymentStatus', e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
              </Select>
            </Box>
            
            {/* Staff Filter */}
            <Box>
              <Text fontSize="sm" mb={1} fontWeight="medium">
                Staff Member
              </Text>
              <Select
                size="sm"
                value={localFilters.staff}
                onChange={(e) => handleFilterChange('staff', e.target.value)}
              >
                <option value="all">All Staff</option>
                <option value="john">John Doe</option>
                <option value="jane">Jane Smith</option>
                <option value="mike">Mike Johnson</option>
              </Select>
            </Box>
          </VStack>
        </PopoverBody>
        <PopoverFooter>
          <HStack justify="space-between">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReset}
              leftIcon={<X />}
            >
              Reset
            </Button>
            <Button
              size="sm"
              colorScheme="pos"
              onClick={handleApply}
            >
              Apply Filters
            </Button>
          </HStack>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
};

export default ReportFilters;