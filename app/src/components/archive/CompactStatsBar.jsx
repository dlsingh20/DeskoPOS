import React from 'react';
import {
  Box,
  HStack,
  Text,
  useColorModeValue,
  Collapse,
  VStack,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';
import { ChevronDown, ChevronUp, TrendingUp, Package, XCircle, DollarSign } from 'lucide-react';

const CompactStatsBar = ({ stats, isExpanded, onToggleExpand, formatPrice }) => {
  const bg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  const statBg = useColorModeValue('white', 'gray.800');

  return (
    <Box>
      {/* Compact Single Line Stats */}
      <Box
        bg={bg}
        px={4}
        py={2}
        borderBottomWidth="1px"
        borderColor={borderColor}
      >
        <HStack justify="space-between">
          <HStack spacing={6} flex={1}>
            <HStack spacing={2}>
              <Package size={14} color={mutedColor} />
              <Text fontSize="xs" color={mutedColor}>Orders:</Text>
              <Text fontSize="xs" fontWeight="600" color={textColor}>
                {stats.totalOrders}
              </Text>
            </HStack>
            
            <HStack spacing={2}>
              <Text fontSize="xs" color="green.600">✓</Text>
              <Text fontSize="xs" color={mutedColor}>Completed:</Text>
              <Text fontSize="xs" fontWeight="600" color="green.600">
                {stats.completedOrders}
              </Text>
            </HStack>
            
            <HStack spacing={2}>
              <XCircle size={12} color="red" />
              <Text fontSize="xs" color={mutedColor}>Cancelled:</Text>
              <Text fontSize="xs" fontWeight="600" color="red.600">
                {stats.cancelledOrders}
              </Text>
            </HStack>
            
            <HStack spacing={2}>
              <DollarSign size={12} color="green" />
              <Text fontSize="xs" color={mutedColor}>Revenue:</Text>
              <Text fontSize="xs" fontWeight="600" color="green.600">
                {formatPrice(stats.totalRevenue)}
              </Text>
            </HStack>
            
            <HStack spacing={2}>
              <TrendingUp size={12} color={mutedColor} />
              <Text fontSize="xs" color={mutedColor}>Avg:</Text>
              <Text fontSize="xs" fontWeight="600" color={textColor}>
                {formatPrice(stats.avgOrderValue)}
              </Text>
            </HStack>
          </HStack>
          
          <Tooltip label={isExpanded ? "Hide details" : "Show details"} fontSize="xs">
            <IconButton
              icon={isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              size="xs"
              variant="ghost"
              onClick={onToggleExpand}
              aria-label="Toggle stats"
            />
          </Tooltip>
        </HStack>
      </Box>
      
      {/* Expanded Detailed Stats */}
      <Collapse in={isExpanded}>
        <Box bg={bg} px={4} py={3} borderBottomWidth="1px" borderColor={borderColor}>
          <SimpleGrid columns={{ base: 2, md: 5 }} spacing={4}>
            <Box bg={statBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <VStack align="start" spacing={1}>
                <HStack>
                  <Package size={14} color="blue.500" />
                  <Text fontSize="xs" color={mutedColor}>Total Orders</Text>
                </HStack>
                <Text fontSize="lg" fontWeight="bold" color={textColor}>
                  {stats.totalOrders}
                </Text>
                <Text fontSize="xs" color={mutedColor}>
                  All time
                </Text>
              </VStack>
            </Box>
            
            <Box bg={statBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <VStack align="start" spacing={1}>
                <HStack>
                  <Text fontSize="xs" color="green.500">✓</Text>
                  <Text fontSize="xs" color={mutedColor}>Completed</Text>
                </HStack>
                <Text fontSize="lg" fontWeight="bold" color="green.600">
                  {stats.completedOrders}
                </Text>
                <Text fontSize="xs" color={mutedColor}>
                  {((stats.completedOrders / stats.totalOrders) * 100).toFixed(0)}% success
                </Text>
              </VStack>
            </Box>
            
            <Box bg={statBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <VStack align="start" spacing={1}>
                <HStack>
                  <XCircle size={14} color="red.500" />
                  <Text fontSize="xs" color={mutedColor}>Cancelled</Text>
                </HStack>
                <Text fontSize="lg" fontWeight="bold" color="red.600">
                  {stats.cancelledOrders}
                </Text>
                <Text fontSize="xs" color={mutedColor}>
                  {((stats.cancelledOrders / stats.totalOrders) * 100).toFixed(0)}% rate
                </Text>
              </VStack>
            </Box>
            
            <Box bg={statBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <VStack align="start" spacing={1}>
                <HStack>
                  <DollarSign size={14} color="green.500" />
                  <Text fontSize="xs" color={mutedColor}>Total Revenue</Text>
                </HStack>
                <Text fontSize="lg" fontWeight="bold" color="green.600">
                  {formatPrice(stats.totalRevenue)}
                </Text>
                <Text fontSize="xs" color={mutedColor}>
                  Paid orders
                </Text>
              </VStack>
            </Box>
            
            <Box bg={statBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <VStack align="start" spacing={1}>
                <HStack>
                  <TrendingUp size={14} color="blue.500" />
                  <Text fontSize="xs" color={mutedColor}>Average Order</Text>
                </HStack>
                <Text fontSize="lg" fontWeight="bold" color={textColor}>
                  {formatPrice(stats.avgOrderValue)}
                </Text>
                <Text fontSize="xs" color={mutedColor}>
                  Per order
                </Text>
              </VStack>
            </Box>
          </SimpleGrid>
        </Box>
      </Collapse>
    </Box>
  );
};

export default CompactStatsBar;