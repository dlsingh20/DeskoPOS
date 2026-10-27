import React from 'react';
import { usePOS } from '../../../context/POSContext';
import {
  Box,
  HStack,
  VStack,
  Text,
  Icon,
  useColorModeValue,
  Tooltip,
} from '@chakra-ui/react';

/**
 * Minimal Stat Card Component
 * Ultra-clean design with consistent small text sizes
 */
const MinimalStatCard = ({
  label,
  value,
  icon,
  iconColor,
  trend,
  trendValue,
  subtitle,
  format = 'number',
}) => {
  const { formatPrice } = usePOS();
  // Color values for minimalistic theme
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  
  // Format value based on type
  const formatValue = (val) => {
    if (!val && val !== 0) return '--';
    
    switch (format) {
      case 'currency':
        return formatPrice(val);
      case 'percentage':
        return `${parseFloat(val).toFixed(1)}%`;
      case 'number':
      default:
        return val.toLocaleString('en-IN');
    }
  };
  
  // Determine trend color
  const getTrendColor = () => {
    if (!trend) return mutedColor;
    return trend === 'up' ? 'green.500' : trend === 'down' ? 'red.500' : mutedColor;
  };
  
  return (
    <Box
      bg={bg}
      p={3}
      borderRadius="lg"
      border="1px solid"
      borderColor={borderColor}
      transition="all 0.2s"
    >
      <VStack align="stretch" spacing={2}>
        {/* Header with icon and label */}
        <HStack justify="space-between">
          <HStack spacing={2}>
            {icon && (
              <Icon 
                as={icon} 
                boxSize={3.5} 
                color={iconColor || mutedColor}
              />
            )}
            <Text 
              fontSize="xs" 
              color={mutedColor}
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              {label}
            </Text>
          </HStack>
          
          {/* Trend indicator - tiny dot */}
          {trend && (
            <Tooltip 
              label={`${trend === 'up' ? 'Increased' : 'Decreased'} by ${trendValue}`} 
              fontSize="xs"
            >
              <HStack spacing={1}>
                <Box
                  w="6px"
                  h="6px"
                  borderRadius="full"
                  bg={getTrendColor()}
                />
                {trendValue && (
                  <Text fontSize="xs" color={getTrendColor()}>
                    {trendValue}
                  </Text>
                )}
              </HStack>
            </Tooltip>
          )}
        </HStack>
        
        {/* Value */}
        <Text
          fontSize="sm"
          fontWeight="600"
          color={textColor}
          lineHeight="1.2"
        >
          {formatValue(value)}
        </Text>
        
        {/* Optional subtitle */}
        {subtitle && (
          <Text
            fontSize="xs"
            color={mutedColor}
            lineHeight="1.2"
          >
            {subtitle}
          </Text>
        )}
      </VStack>
    </Box>
  );
};

export default MinimalStatCard;