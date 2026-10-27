import React from 'react';
import {
  Grid,
  GridItem,
  Box,
  HStack,
  VStack,
  Text,
  useColorModeValue,
  Skeleton,
  SkeletonText,
} from '@chakra-ui/react';
import MinimalStatCard from './cards/MinimalStatCard';

/**
 * Minimal Report Grid Component
 * Clean grid layout for analytics cards
 */
const MinimalReportGrid = ({
  stats = [],
  columns = { base: 1, sm: 2, md: 3, lg: 4 },
  gap = 2,
  loading = false,
  children,
}) => {
  // Color values
  const bg = useColorModeValue('gray.50', 'gray.850');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const skeletonBg = useColorModeValue('white', 'gray.900');
  
  // Render loading skeleton
  if (loading) {
    return (
      <Grid templateColumns={`repeat(${columns.lg || 4}, 1fr)`} gap={gap}>
        {[...Array(8)].map((_, i) => (
          <GridItem key={i}>
            <Box
              p={3}
              bg={skeletonBg}
              borderRadius="lg"
              border="1px solid"
              borderColor={borderColor}
            >
              <Skeleton height="12px" width="60%" mb={2} />
              <SkeletonText noOfLines={2} spacing={2} />
            </Box>
          </GridItem>
        ))}
      </Grid>
    );
  }
  
  // If custom children provided, render them
  if (children) {
    return (
      <Grid 
        templateColumns={{
          base: `repeat(${columns.base || 1}, 1fr)`,
          sm: `repeat(${columns.sm || 2}, 1fr)`,
          md: `repeat(${columns.md || 3}, 1fr)`,
          lg: `repeat(${columns.lg || 4}, 1fr)`,
        }} 
        gap={gap}
      >
        {children}
      </Grid>
    );
  }
  
  // Otherwise render stats cards
  return (
    <Grid 
      templateColumns={{
        base: `repeat(${columns.base || 1}, 1fr)`,
        sm: `repeat(${columns.sm || 2}, 1fr)`,
        md: `repeat(${columns.md || 3}, 1fr)`,
        lg: `repeat(${columns.lg || 4}, 1fr)`,
      }} 
      gap={gap}
    >
      {stats.map((stat, index) => (
        <GridItem key={stat.id || index}>
          <MinimalStatCard {...stat} />
        </GridItem>
      ))}
    </Grid>
  );
};

/**
 * Section wrapper for report grids
 */
export const ReportSection = ({ title, subtitle, children, ...props }) => {
  const textColor = useColorModeValue('gray.900', 'white');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  
  return (
    <VStack align="stretch" spacing={2} {...props}>
      {(title || subtitle) && (
        <Box>
          {title && (
            <Text 
              fontSize="sm" 
              fontWeight="600" 
              color={textColor}
              letterSpacing="-0.01em"
            >
              {title}
            </Text>
          )}
          {subtitle && (
            <Text 
              fontSize="xs" 
              color={mutedColor}
            >
              {subtitle}
            </Text>
          )}
        </Box>
      )}
      {children}
    </VStack>
  );
};

/**
 * Compact chart container
 */
export const ChartContainer = ({ title, children, height = "200px" }) => {
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const textColor = useColorModeValue('gray.900', 'white');
  
  return (
    <Box
      bg={bg}
      p={3}
      borderRadius="lg"
      border="1px solid"
      borderColor={borderColor}
    >
      {title && (
        <Text 
          fontSize="sm" 
          fontWeight="600" 
          color={textColor}
          mb={2}
        >
          {title}
        </Text>
      )}
      <Box h={height}>
        {children}
      </Box>
    </Box>
  );
};

export default MinimalReportGrid;