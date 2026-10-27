import React, { useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  IconButton,
  Badge,
  Spinner,
  Center,
  useColorModeValue,
} from '@chakra-ui/react';
import { Search, Plus, Minus, X } from 'lucide-react';

const MAX_RESULTS = 120;

const getCategoryName = (item) =>
  item.category_name || item.category?.name || (typeof item.category === 'string' ? item.category : '');

const matches = (item, terms) => {
  const haystack = [
    item.name,
    item.description,
    getCategoryName(item),
    item.sku,
    item.code,
    item.item_code,
    String(item.id),
    ...(item.dietary_tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

/**
 * Menu search with inline add / quantity controls.
 * Searches the menu already loaded for the restaurant, so results are instant.
 */
const MenuItemSearch = ({
  menuItems,
  loading,
  query,
  onQueryChange,
  draftQuantities,
  onAdd,
  onChangeQuantity,
  formatPrice,
  isDisabled,
  autoFocus = true,
}) => {
  const inputRef = useRef(null);
  const rowHover = useColorModeValue('gray.50', 'gray.700');
  const borderColor = useColorModeValue('gray.100', 'gray.700');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const inputBg = useColorModeValue('white', 'gray.800');

  useEffect(() => {
    if (autoFocus && !isDisabled) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [autoFocus, isDisabled]);

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = terms.length ? menuItems.filter((item) => matches(item, terms)) : menuItems;
    return filtered.slice(0, MAX_RESULTS);
  }, [menuItems, query]);

  const handleKeyDown = (e) => {
    // Enter adds the top available result — fastest path for staff who know the menu
    if (e.key === 'Enter' && query.trim()) {
      const first = results.find((item) => item.is_available !== false);
      if (first) {
        e.preventDefault();
        onAdd(first);
      }
    }
    if (e.key === 'Escape' && query) {
      e.stopPropagation();
      onQueryChange('');
    }
  };

  return (
    <Flex direction="column" h="full" minH={0}>
      <InputGroup size="lg">
        <InputLeftElement pointerEvents="none" color={mutedColor}>
          <Search size={18} />
        </InputLeftElement>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by item name, code or category"
          aria-label="Search menu items"
          bg={inputBg}
          borderRadius="12px"
          fontSize="md"
          isDisabled={isDisabled}
        />
        {query && (
          <InputRightElement>
            <IconButton
              aria-label="Clear search"
              icon={<X size={16} />}
              size="sm"
              variant="ghost"
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
            />
          </InputRightElement>
        )}
      </InputGroup>
      <Text fontSize="xs" color={mutedColor} mt={1.5} mb={2} px={1}>
        {query.trim()
          ? `${results.length}${results.length === MAX_RESULTS ? '+' : ''} matching items · press Enter to add the first one`
          : `${menuItems.length} menu items`}
      </Text>

      <Box flex={1} overflowY="auto" minH={0} mx={-1} px={1}>
        {loading && menuItems.length === 0 ? (
          <Center py={10}><Spinner color="blue.500" /></Center>
        ) : results.length === 0 ? (
          <Center py={10}>
            <Text color={mutedColor} fontSize="sm">
              {menuItems.length === 0 ? 'No menu items found for this restaurant.' : `No items match “${query}”.`}
            </Text>
          </Center>
        ) : (
          <VStack align="stretch" spacing={0}>
            {results.map((item) => {
              const qty = draftQuantities[item.id] || 0;
              const available = item.is_available !== false;
              const category = getCategoryName(item);
              return (
                <Flex
                  key={item.id}
                  align="center"
                  gap={3}
                  py={2.5}
                  px={2}
                  borderBottomWidth="1px"
                  borderColor={borderColor}
                  borderRadius="8px"
                  _hover={{ bg: rowHover }}
                  opacity={available ? 1 : 0.5}
                >
                  {item.is_vegetarian !== undefined && (
                    <Box
                      aria-label={item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'}
                      title={item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'}
                      w="12px"
                      h="12px"
                      borderWidth="1.5px"
                      borderColor={item.is_vegetarian ? 'green.500' : 'red.500'}
                      borderRadius="2px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Box w="5px" h="5px" borderRadius="full" bg={item.is_vegetarian ? 'green.500' : 'red.500'} />
                    </Box>
                  )}
                  <Box flex={1} minW={0}>
                    <Text fontSize="sm" fontWeight="600" noOfLines={1}>{item.name}</Text>
                    <HStack spacing={2} fontSize="xs" color={mutedColor}>
                      {category && <Text noOfLines={1}>{category}</Text>}
                      {!available && <Badge colorScheme="red" fontSize="2xs">Unavailable</Badge>}
                    </HStack>
                  </Box>
                  <Text fontSize="sm" fontWeight="600" whiteSpace="nowrap">
                    {formatPrice(item.price || 0)}
                  </Text>
                  {qty > 0 ? (
                    <HStack spacing={1}>
                      <IconButton
                        aria-label={`Decrease ${item.name}`}
                        icon={<Minus size={14} />}
                        size="sm"
                        variant="outline"
                        onClick={() => onChangeQuantity(item.id, qty - 1)}
                        isDisabled={isDisabled}
                      />
                      <Text minW="24px" textAlign="center" fontWeight="700" fontSize="sm">{qty}</Text>
                      <IconButton
                        aria-label={`Increase ${item.name}`}
                        icon={<Plus size={14} />}
                        size="sm"
                        colorScheme="blue"
                        onClick={() => onChangeQuantity(item.id, qty + 1)}
                        isDisabled={isDisabled}
                      />
                    </HStack>
                  ) : (
                    <IconButton
                      aria-label={`Add ${item.name}`}
                      icon={<Plus size={16} />}
                      size="sm"
                      colorScheme="blue"
                      variant="outline"
                      onClick={() => onAdd(item)}
                      isDisabled={isDisabled || !available}
                    />
                  )}
                </Flex>
              );
            })}
          </VStack>
        )}
      </Box>
    </Flex>
  );
};

export default MenuItemSearch;
