import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Center,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { CheckCircle2, Minus, Plus, Search, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import guestService from '../../services/GuestService';
import {
  MAX_QUANTITY, billNote, cartSummary, makeMoneyFormatter, newClientRef, setQuantity, validateGuest,
} from '../../utils/guestOrder';

const GUEST_KEY = 'deskopos_guest';

const loadGuest = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}');
    return { name: saved.name || '', phone: saved.phone || '' };
  } catch (error) {
    return { name: '', phone: '' };
  }
};

const saveGuest = (guest) => {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(guest)); } catch (error) { /* private mode */ }
};

/** Veg / non-veg mark, as on Indian menus */
const FoodMark = ({ veg }) => (
  <Box as="span" display="inline-flex" alignItems="center" justifyContent="center" boxSize="14px" flexShrink={0}
    borderWidth="1.5px" borderColor={veg ? 'green.600' : 'red.600'} borderRadius="2px" aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}>
    <Box boxSize="6px" borderRadius="full" bg={veg ? 'green.600' : 'red.600'} />
  </Box>
);

const Stepper = ({ quantity, onChange, name }) => (
  <HStack spacing={0} borderWidth="1px" borderColor="green.500" borderRadius="8px" bg="white">
    <IconButton aria-label={`One less ${name}`} icon={<Minus size={14} />} size="sm" variant="ghost" colorScheme="green" onClick={() => onChange(quantity - 1)} />
    <Text minW="24px" textAlign="center" fontWeight="700" color="green.700">{quantity}</Text>
    <IconButton aria-label={`One more ${name}`} icon={<Plus size={14} />} size="sm" variant="ghost" colorScheme="green" onClick={() => onChange(quantity + 1)} isDisabled={quantity >= MAX_QUANTITY} />
  </HStack>
);

const Shell = ({ children }) => (
  <Box minH="100vh" bg="gray.50">
    <Box maxW="640px" mx="auto" minH="100vh" bg="white" position="relative">{children}</Box>
  </Box>
);

/**
 * The page a table's QR code opens (/order/<code>): the guest gives a name and mobile number,
 * picks from the menu and sends the order to the table's bill. Payment stays with the staff.
 */
const GuestOrderPage = ({ code }) => {
  const [menu, setMenu] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [guest, setGuest] = useState(loadGuest);
  const [started, setStarted] = useState(() => !Object.keys(validateGuest(loadGuest())).length);
  const [showErrors, setShowErrors] = useState(false);
  const [cart, setCart] = useState({});
  const [query, setQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const refRef = useRef(newClientRef());
  const sectionRefs = useRef({});

  const loadMenu = () => {
    setLoadError(null);
    guestService.getMenu(code).then(setMenu).catch((error) => setLoadError(error.message));
  };
  useEffect(loadMenu, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (menu) document.title = `${menu.restaurant.name} · ${menu.table.label}`;
  }, [menu]);

  const money = useMemo(() => makeMoneyFormatter(menu?.currency), [menu]);
  const summary = useMemo(() => cartSummary(cart, menu?.categories), [cart, menu]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!menu) return [];
    if (!q) return menu.categories;
    return menu.categories
      .map((c) => ({ ...c, items: c.items.filter((i) => `${i.name} ${i.description}`.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length);
  }, [menu, query]);

  const errors = validateGuest(guest);

  const start = (e) => {
    e.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length) return;
    const clean = { name: guest.name.trim(), phone: guest.phone.trim() };
    setGuest(clean);
    saveGuest(clean);
    setStarted(true);
  };

  const place = async () => {
    setPlacing(true);
    setPlaceError(null);
    try {
      const result = await guestService.placeOrder(code, {
        name: guest.name, phone: guest.phone, client_ref: refRef.current,
        items: summary.lines.map((l) => ({ menu_item: l.item.id, quantity: l.quantity })),
      });
      setReceipt(result);
      setCart({});
      setCartOpen(false);
      refRef.current = newClientRef();
    } catch (error) {
      setPlaceError(error.message);
      if (error.status === 409 || error.status === 400) loadMenu();  // sold out / menu changed
    } finally {
      setPlacing(false);
    }
  };

  if (loadError) {
    return (
      <Shell>
        <Center minH="100vh" px={6}>
          <VStack spacing={3} textAlign="center">
            <UtensilsCrossed size={36} />
            <Text fontWeight="700" fontSize="lg">Can't open the menu</Text>
            <Text color="gray.600">{loadError}</Text>
            <Button onClick={loadMenu}>Try again</Button>
          </VStack>
        </Center>
      </Shell>
    );
  }
  if (!menu) return <Shell><Center minH="100vh"><Spinner size="lg" /></Center></Shell>;

  const header = (
    <Box px={4} pt={5} pb={3} borderBottomWidth="1px">
      <Text fontSize="xl" fontWeight="800" lineHeight="short">{menu.restaurant.name}</Text>
      <HStack spacing={2} mt={1}>
        <Badge colorScheme="green" fontSize="sm" px={2} borderRadius="6px">{menu.table.label}</Badge>
        {started && <Text fontSize="sm" color="gray.600" noOfLines={1}>{guest.name}</Text>}
      </HStack>
    </Box>
  );

  if (receipt) {
    return (
      <Shell>
        {header}
        <VStack spacing={4} px={6} py={10} textAlign="center">
          <CheckCircle2 size={56} color="#38A169" />
          <Text fontSize="xl" fontWeight="800">Order sent</Text>
          <Text color="gray.600">
            {receipt.mode === 'accept'
              ? 'The staff will confirm it and send it to the kitchen.'
              : 'It has gone to the kitchen.'}
          </Text>
          <Box w="full" borderWidth="1px" borderRadius="12px" p={4} textAlign="left">
            <Text fontSize="sm" color="gray.500" mb={2}>{receipt.table} · Order {receipt.order_number}</Text>
            {receipt.items.map((i) => (
              <Flex key={`${i.name}-${i.quantity}`} justify="space-between"><Text>{i.name}</Text><Text fontWeight="600">× {i.quantity}</Text></Flex>
            ))}
          </Box>
          <Text fontSize="sm" color="gray.500">Pay at the end of your meal. Ask the staff for the bill.</Text>
          <Button colorScheme="green" w="full" size="lg" onClick={() => setReceipt(null)}>Order more</Button>
        </VStack>
      </Shell>
    );
  }

  if (!started) {
    return (
      <Shell>
        {header}
        <Box as="form" onSubmit={start} noValidate px={5} py={6}>
          <Text fontSize="lg" fontWeight="700" mb={1}>Welcome!</Text>
          <Text color="gray.600" mb={5}>Tell us who is ordering, then choose from the menu.</Text>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired isInvalid={showErrors && !!errors.name}>
              <FormLabel>Your name</FormLabel>
              <Input size="lg" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} maxLength={80} autoComplete="name" />
              <FormErrorMessage>{errors.name}</FormErrorMessage>
            </FormControl>
            <FormControl isRequired isInvalid={showErrors && !!errors.phone}>
              <FormLabel>Mobile number</FormLabel>
              <Input size="lg" type="tel" inputMode="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} maxLength={20} autoComplete="tel" />
              <FormErrorMessage>{errors.phone}</FormErrorMessage>
            </FormControl>
            <Button type="submit" colorScheme="green" size="lg">Start ordering</Button>
          </VStack>
        </Box>
      </Shell>
    );
  }

  return (
    <Shell>
      {header}
      <Box position="sticky" top={0} zIndex={2} bg="white" px={4} pt={3} pb={2} borderBottomWidth="1px">
        <InputGroup>
          <InputLeftElement pointerEvents="none"><Search size={16} /></InputLeftElement>
          <Input placeholder="Search the menu" value={query} onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
        {!query && menu.categories.length > 1 && (
          <HStack spacing={2} mt={2} overflowX="auto" pb={1} sx={{ scrollbarWidth: 'none' }}>
            {menu.categories.map((c) => (
              <Button key={c.id} size="sm" variant="outline" borderRadius="full" flexShrink={0}
                onClick={() => sectionRefs.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {c.name}
              </Button>
            ))}
          </HStack>
        )}
      </Box>

      <Box px={4} pb={summary.count ? '96px' : 8}>
        {shown.length === 0 && <Text color="gray.500" textAlign="center" py={10}>{query ? 'Nothing matches your search.' : 'The menu is empty.'}</Text>}
        {shown.map((c) => (
          <Box key={c.id} ref={(el) => { sectionRefs.current[c.id] = el; }} pt={5} style={{ scrollMarginTop: '110px' }}>
            <Text fontWeight="800" fontSize="lg" mb={2}>{c.name}</Text>
            <VStack align="stretch" spacing={0} divider={<Box borderBottomWidth="1px" />}>
              {c.items.map((item) => {
                const quantity = cart[item.id] || 0;
                return (
                  <Flex key={item.id} py={3} gap={3} align="flex-start" opacity={item.available ? 1 : 0.55}>
                    <Box flex={1} minW={0}>
                      <HStack spacing={2} align="center">
                        <FoodMark veg={item.vegetarian} />
                        <Text fontWeight="600">{item.name}</Text>
                        {item.spicy && <Badge colorScheme="red" variant="subtle">Spicy</Badge>}
                      </HStack>
                      <Text fontWeight="700" mt={1}>{money(item.price)}</Text>
                      {item.description && <Text fontSize="sm" color="gray.600" noOfLines={2}>{item.description}</Text>}
                    </Box>
                    <Box flexShrink={0} pt={1}>
                      {!item.available ? <Text fontSize="sm" color="red.500" fontWeight="600">Sold out</Text>
                        : quantity ? <Stepper name={item.name} quantity={quantity} onChange={(q) => setCart((cur) => setQuantity(cur, item.id, q))} />
                          : <Button size="sm" variant="outline" colorScheme="green" minW="80px" onClick={() => setCart((cur) => setQuantity(cur, item.id, 1))}>Add</Button>}
                    </Box>
                  </Flex>
                );
              })}
            </VStack>
          </Box>
        ))}
      </Box>

      {summary.count > 0 && (
        <Box position="fixed" bottom={0} left={0} right={0} zIndex={3} px={4} pb={4} pt={2} bgGradient="linear(to-t, white 70%, transparent)">
          <Box maxW="608px" mx="auto">
            <Button colorScheme="green" size="lg" w="full" h="56px" onClick={() => { setPlaceError(null); setCartOpen(true); }}
              leftIcon={<ShoppingBag size={18} />} justifyContent="space-between">
              <Text as="span">{summary.count} {summary.count === 1 ? 'item' : 'items'} · {money(summary.total)}</Text>
              <Text as="span">View order</Text>
            </Button>
          </Box>
        </Box>
      )}

      <Drawer isOpen={cartOpen} placement="bottom" onClose={() => !placing && setCartOpen(false)}>
        <DrawerOverlay />
        <DrawerContent borderTopRadius="16px" maxW="640px" mx="auto" maxH="85vh">
          <DrawerCloseButton isDisabled={placing} />
          <DrawerHeader>Your order · {menu.table.label}</DrawerHeader>
          <DrawerBody>
            <VStack align="stretch" spacing={3}>
              {summary.lines.map(({ item, quantity, total }) => (
                <Flex key={item.id} align="center" gap={3}>
                  <FoodMark veg={item.vegetarian} />
                  <Box flex={1} minW={0}>
                    <Text fontWeight="600" noOfLines={1}>{item.name}</Text>
                    <Text fontSize="sm" color="gray.600">{money(total)}</Text>
                  </Box>
                  <Stepper name={item.name} quantity={quantity} onChange={(q) => setCart((cur) => setQuantity(cur, item.id, q))} />
                </Flex>
              ))}
              <Flex justify="space-between" borderTopWidth="1px" pt={3} fontWeight="800">
                <Text>Items total</Text><Text>{money(summary.total)}</Text>
              </Flex>
              <Text fontSize="sm" color="gray.500">{billNote(menu)} You pay the staff at the end.</Text>
              <Text fontSize="sm" color="gray.500">Ordering as {guest.name} ({guest.phone}). <Button variant="link" size="sm" onClick={() => { setCartOpen(false); setStarted(false); }}>Change</Button></Text>
              {placeError && <Alert status="error" borderRadius="10px"><AlertIcon />{placeError}</Alert>}
            </VStack>
          </DrawerBody>
          <DrawerFooter>
            <Button colorScheme="green" size="lg" w="full" isLoading={placing} loadingText="Sending" onClick={place} isDisabled={!summary.count}>
              Place order
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Shell>
  );
};

export default GuestOrderPage;
