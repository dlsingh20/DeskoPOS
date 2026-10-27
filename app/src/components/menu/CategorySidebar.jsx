import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Button,
  Text,
  Badge,
  Icon,
  Tooltip,
  useColorModeValue,
  useBreakpointValue,
} from '@chakra-ui/react';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const CategorySidebar = ({
  categories = [],
  categoriesData = [],
  activeCategory,
  onCategoryChange,
  itemCounts = {},
  isCollapsed = false,
  onToggleCollapse,
}) => {
  
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const activeBg = useColorModeValue('pos.50', 'pos.900');
  const activeColor = useColorModeValue('pos.600', 'pos.300');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.200');
  
  const isCompact = useBreakpointValue({ base: true, lg: false });
  const showSidebar = useBreakpointValue({ base: false, md: true });
  
  const totalItems = Object.values(itemCounts).reduce((sum, count) => sum + count, 0);
  
  if (!showSidebar) {
    return null;
  }
  
  const renderCategoryButton = (category, index) => {
    const isActive = activeCategory === category;
    const count = itemCounts[category] || 0;
    
    if (isCollapsed || isCompact) {
      return (
        <Tooltip
          key={category}
          label={`${category} (${count} items)`}
          placement="right"
          hasArrow
        >
          <Button
            variant="ghost"
            size="lg"
            p={2}
            h="auto"
            w="full"
            bg={isActive ? activeBg : 'transparent'}
            color={isActive ? activeColor : textColor}
            borderLeftWidth={isActive ? '3px' : '0'}
            borderLeftColor={activeColor}
            _hover={{
              bg: hoverBg,
              transform: 'translateX(2px)',
            }}
            onClick={() => onCategoryChange(category)}
            transition="all 0.2s"
            justifyContent="center"
            position="relative"
          >
            <Badge
              size="sm"
              colorScheme={isActive ? 'pos' : 'gray'}
              borderRadius="full"
              fontSize="xs"
              minW="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {count}
            </Badge>
          </Button>
        </Tooltip>
      );
    }
    
    return (
      <Button
        key={category}
        variant="ghost"
        size="md"
        px={3}
        py={2}
        h="auto"
        w="full"
        bg={isActive ? activeBg : 'transparent'}
        color={isActive ? activeColor : textColor}
        borderLeftWidth={isActive ? '3px' : '0'}
        borderLeftColor={activeColor}
        _hover={{
          bg: hoverBg,
          transform: 'translateX(2px)',
        }}
        onClick={() => onCategoryChange(category)}
        transition="all 0.2s"
        justifyContent="flex-start"
      >
        <HStack spacing={3} w="full">
          <Text 
            fontSize="sm" 
            fontWeight={isActive ? 'semibold' : 'medium'}
            flex={1}
            textAlign="left"
            noOfLines={1}
          >
            {category}
          </Text>
          {count > 0 && (
            <Badge
              size="sm"
              colorScheme={isActive ? 'pos' : 'gray'}
              borderRadius="full"
              fontSize="xs"
            >
              {count}
            </Badge>
          )}
        </HStack>
      </Button>
    );
  };
  
  return (
    <Box
      w={isCollapsed || isCompact ? '60px' : '200px'}
      h="full"
      bg={bg}
      borderRightWidth="1px"
      borderColor={borderColor}
      transition="width 0.3s ease"
      position="sticky"
      top="0"
      left="0"
      overflowY="auto"
      overflowX="hidden"
      css={{
        '&::-webkit-scrollbar': {
          width: '4px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: borderColor,
          borderRadius: '4px',
        },
      }}
    >
      <VStack spacing={0} align="stretch" py={2}>
        
        <VStack spacing={1} align="stretch" px={2} py={2}>
          {/* All Items Button */}
          {(isCollapsed || isCompact) ? (
            <Tooltip label={`All Items (${totalItems})`} placement="right" hasArrow>
              <Button
                variant="ghost"
                size="lg"
                p={2}
                h="auto"
                w="full"
                bg={!activeCategory ? activeBg : 'transparent'}
                color={!activeCategory ? activeColor : textColor}
                borderLeftWidth={!activeCategory ? '3px' : '0'}
                borderLeftColor={activeColor}
                _hover={{
                  bg: hoverBg,
                  transform: 'translateX(2px)',
                }}
                onClick={() => onCategoryChange(null)}
                transition="all 0.2s"
                justifyContent="center"
                position="relative"
              >
                <Badge
                  size="sm"
                  colorScheme={!activeCategory ? 'pos' : 'gray'}
                  borderRadius="full"
                  fontSize="xs"
                  minW="28px"
                  h="28px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {totalItems}
                </Badge>
              </Button>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="md"
              px={3}
              py={2}
              h="auto"
              w="full"
              bg={!activeCategory ? activeBg : 'transparent'}
              color={!activeCategory ? activeColor : textColor}
              borderLeftWidth={!activeCategory ? '3px' : '0'}
              borderLeftColor={activeColor}
              _hover={{
                bg: hoverBg,
                transform: 'translateX(2px)',
              }}
              onClick={() => onCategoryChange(null)}
              transition="all 0.2s"
              justifyContent="flex-start"
            >
              <HStack spacing={3} w="full">
                <Text 
                  fontSize="sm" 
                  fontWeight={!activeCategory ? 'semibold' : 'medium'}
                  flex={1}
                  textAlign="left"
                >
                  All Items
                </Text>
                <Badge
                  size="sm"
                  colorScheme={!activeCategory ? 'pos' : 'gray'}
                  borderRadius="full"
                  fontSize="xs"
                >
                  {totalItems}
                </Badge>
              </HStack>
            </Button>
          )}
          
          {/* Category Buttons */}
          {categories.map((category, index) => renderCategoryButton(category, index))}
        </VStack>
      </VStack>
    </Box>
  );
};

export default CategorySidebar;