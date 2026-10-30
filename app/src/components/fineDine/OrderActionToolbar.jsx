import React from 'react';
import {
  Box,
  Flex,
  HStack,
  Button,
  Badge,
  IconButton,
  Tooltip,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { Merge, ArrowLeftRight, Radio, Plus, RefreshCw, SquareSplitHorizontal, X } from 'lucide-react';

/** Part of a button label that phones leave out ("Merge Table" -> "Merge") */
const Short = ({ children }) => <Box as="span" display={{ base: 'none', sm: 'inline' }}>{children}</Box>;

/**
 * Action bar under the top navigation: Merge Table, Split Table, Move Items, Live Orders,
 * plus Add Table and refresh on the right.
 */
const OrderActionToolbar = ({
  mergeMode,
  mergeSelectionCount,
  onToggleMerge,
  onConfirmMerge,
  onSplit,
  onMoveItems,
  liveOrders,
  onLiveOrders,
  onAddTable,
  onRefresh,
  refreshing,
  lastUpdated,
}) => {
  const bg = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.100', 'gray.800');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const mergeBg = useColorModeValue('purple.50', 'rgba(159,122,234,0.15)');
  const mergeColor = useColorModeValue('purple.700', 'purple.200');
  const mergeBorder = useColorModeValue('purple.200', 'purple.700');
  const moveBg = useColorModeValue('yellow.50', 'rgba(236,201,75,0.12)');
  const moveColor = useColorModeValue('yellow.800', 'yellow.200');
  const moveBorder = useColorModeValue('yellow.300', 'yellow.700');
  const moveHoverBg = useColorModeValue('yellow.100', 'rgba(236,201,75,0.2)');
  const liveBg = useColorModeValue('cyan.50', 'rgba(11,197,234,0.12)');
  const liveColor = useColorModeValue('cyan.800', 'cyan.200');
  const liveBorder = useColorModeValue('cyan.200', 'cyan.700');
  const liveHoverBg = useColorModeValue('cyan.100', 'rgba(11,197,234,0.2)');
  const mergeBannerText = useColorModeValue('purple.800', 'purple.100');

  const liveConfigured = liveOrders?.configured;
  const liveCount = liveOrders?.count ?? 0;

  return (
    <Box bg={bg} borderBottomWidth="1px" borderColor={borderColor} px={{ base: 3, md: 6 }} py={2.5}>
      <Flex align="center" justify="space-between" gap={2} wrap="wrap">
        <HStack spacing={2} flexWrap="wrap">
          <Button
            size="sm"
            leftIcon={mergeMode ? <X size={16} /> : <Merge size={16} />}
            colorScheme="purple"
            variant={mergeMode ? 'solid' : 'outline'}
            bg={mergeMode ? undefined : mergeBg}
            color={mergeMode ? undefined : mergeColor}
            borderWidth="1px"
            borderColor={mergeBorder}
            onClick={onToggleMerge}
            aria-pressed={mergeMode}
          >
            {mergeMode ? 'Cancel merge' : <>Merge<Short> Table</Short></>}
          </Button>
          <Button
            size="sm"
            leftIcon={<SquareSplitHorizontal size={16} />}
            colorScheme="purple"
            variant="outline"
            bg={mergeBg}
            color={mergeColor}
            borderWidth="1px"
            borderColor={mergeBorder}
            onClick={onSplit}
            isDisabled={mergeMode}
          >
            Split<Short> Table</Short>
          </Button>
          <Button
            size="sm"
            leftIcon={<ArrowLeftRight size={16} />}
            bg={moveBg}
            color={moveColor}
            borderWidth="1px"
            borderColor={moveBorder}
            _hover={{ bg: moveHoverBg }}
            onClick={onMoveItems}
            isDisabled={mergeMode}
          >
            Move<Short> Items</Short>
          </Button>
          <Tooltip
            label={liveConfigured ? 'Incoming third-party orders' : 'No Zomato / Swiggy integration is set up yet'}
            fontSize="xs"
          >
            <Button
              size="sm"
              leftIcon={<Radio size={16} />}
              bg={liveBg}
              color={liveColor}
              borderWidth="1px"
              borderColor={liveBorder}
              _hover={{ bg: liveHoverBg }}
              onClick={onLiveOrders}
              isDisabled={mergeMode}
              rightIcon={
                liveConfigured ? (
                  <Badge colorScheme="cyan" variant="solid" borderRadius="full" px={1.5}>{liveCount}</Badge>
                ) : (
                  <Badge variant="outline" colorScheme="gray" fontSize="2xs" borderRadius="full">Not set up</Badge>
                )
              }
            >
              Live<Short> Orders</Short>
            </Button>
          </Tooltip>
        </HStack>

        <HStack spacing={2}>
          {lastUpdated && (
            <Text fontSize="xs" color={mutedColor} display={{ base: 'none', md: 'block' }}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          <Tooltip label="Refresh tables and orders" fontSize="xs">
            <IconButton
              aria-label="Refresh tables and orders"
              icon={<RefreshCw size={16} />}
              size="sm"
              variant="outline"
              onClick={onRefresh}
              isLoading={refreshing}
            />
          </Tooltip>
          {onAddTable && (
            <Button size="sm" leftIcon={<Plus size={16} />} variant="outline" onClick={onAddTable} isDisabled={mergeMode}>
              Add<Short> Table</Short>
            </Button>
          )}
        </HStack>
      </Flex>

      {mergeMode && (
        <Flex
          mt={2.5}
          px={3}
          py={2}
          bg={mergeBg}
          borderRadius="10px"
          align="center"
          justify="space-between"
          gap={2}
          wrap="wrap"
          role="status"
        >
          <Text fontSize="sm" color={mergeBannerText}>
            <strong>Merge tables:</strong> tap two or more tables below.{' '}
            {mergeSelectionCount > 0 && `${mergeSelectionCount} selected.`}
          </Text>
          <Button size="sm" colorScheme="purple" onClick={onConfirmMerge} isDisabled={mergeSelectionCount < 2}>
            Review merge
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default OrderActionToolbar;
