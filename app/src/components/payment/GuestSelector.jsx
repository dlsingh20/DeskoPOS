import React, { useState, useEffect, useCallback } from 'react';
import ApiClient from '../../services/ApiClient';
import { usePOS } from '../../context/POSContext';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Input,
  Box,
  Badge,
  Icon,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Grid,
  Card,
  CardBody,
  InputGroup,
  InputLeftElement,
} from '@chakra-ui/react';
import {
  Search,
  User,
  Home,
  Calendar,
  DollarSign,
  Phone,
  Mail,
} from 'lucide-react';

/**
 * Guest Selector Component
 * Shows checked-in guests available for room charge
 */
const GuestSelector = ({ isOpen, onClose, onGuestSelect, order }) => {
  const toast = useToast();
  const { formatPrice } = usePOS();

  const [guests, setGuests] = useState([]);
  const [filteredGuests, setFilteredGuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);

  // Load checked-in guests from API
  const loadCheckedInGuests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await ApiClient.get('/api/pos/api/orders/checked_in_guests/');
      setGuests(response.data || []);
      
      if (response.data.length === 0) {
        toast({
          title: 'No Checked-in Guests',
          description: 'There are currently no checked-in guests available for room charges.',
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Failed to load checked-in guests:', error);
      toast({
        title: 'Failed to Load Guests',
        description: 'Could not load checked-in guests. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load checked-in guests when modal opens
  useEffect(() => {
    if (isOpen) {
      loadCheckedInGuests();
    }
  }, [isOpen, loadCheckedInGuests]);

  // Filter guests based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredGuests(guests);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = guests.filter(
        guest =>
          guest.guest_name.toLowerCase().includes(query) ||
          guest.room_number.toLowerCase().includes(query) ||
          guest.phone.toLowerCase().includes(query)
      );
      setFilteredGuests(filtered);
    }
  }, [guests, searchQuery]);

  // Handle guest selection
  const handleSelectGuest = (guest) => {
    setSelectedGuest(guest);
  };

  // Confirm guest selection
  const handleConfirmSelection = () => {
    if (selectedGuest && onGuestSelect) {
      onGuestSelect(selectedGuest);
      onClose();
    }
  };

  // Reset state when modal closes
  const handleClose = () => {
    setSelectedGuest(null);
    setSearchQuery('');
    onClose();
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Get guest type badge color
  const getGuestTypeBadgeColor = (guestType) => {
    switch (guestType.toLowerCase()) {
      case 'diamond':
        return 'purple';
      case 'platinum':
        return 'gray';
      case 'gold':
        return 'yellow';
      case 'silver':
        return 'gray';
      default:
        return 'blue';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxH="80vh">
        <ModalHeader>
          <HStack spacing={2}>
            <Icon as={User} boxSize={5} color="pos.500" />
            <Text>Select Guest for Room Charge</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Order Info */}
            {order && (
              <Box bg="blue.50" p={3} borderRadius="md">
                <Text fontSize="sm" fontWeight="semibold" color="blue.800">
                  Order #{order.order_number} - {formatPrice(parseFloat(order.total_amount) || 0)}
                </Text>
              </Box>
            )}

            {/* Search */}
            <InputGroup>
              <InputLeftElement>
                <Icon as={Search} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search by name, room number, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </InputGroup>

            {loading ? (
              <Box textAlign="center" py={8}>
                <Spinner size="lg" color="pos.500" />
                <Text mt={2}>Loading checked-in guests...</Text>
              </Box>
            ) : filteredGuests.length === 0 ? (
              <Alert status="info">
                <AlertIcon />
                {guests.length === 0
                  ? 'No checked-in guests found.'
                  : 'No guests match your search criteria.'}
              </Alert>
            ) : (
              <VStack spacing={3} align="stretch" maxH="400px" overflowY="auto">
                {filteredGuests.map((guest, index) => (
                  <Card
                    key={`${guest.guest_id}-${guest.reservation_id || index}`}
                    variant={selectedGuest?.guest_id === guest.guest_id && selectedGuest?.reservation_id === guest.reservation_id ? 'filled' : 'outline'}
                    cursor="pointer"
                    onClick={() => handleSelectGuest(guest)}
                    _hover={{
                      borderColor: 'pos.300',
                      shadow: 'md',
                    }}
                    borderColor={selectedGuest?.guest_id === guest.guest_id ? 'pos.500' : undefined}
                  >
                    <CardBody>
                      <Grid templateColumns="1fr auto" gap={4} alignItems="start">
                        <VStack align="start" spacing={2}>
                          {/* Guest Name and Type */}
                          <HStack spacing={2}>
                            <Text fontWeight="bold" fontSize="lg">
                              {guest.guest_name}
                            </Text>
                            {guest.guest_type !== 'Regular' && (
                              <Badge colorScheme={getGuestTypeBadgeColor(guest.guest_type)}>
                                {guest.guest_type}
                              </Badge>
                            )}
                          </HStack>

                          {/* Room and Dates */}
                          <HStack spacing={4}>
                            <HStack spacing={1}>
                              <Icon as={Home} boxSize={4} color="gray.500" />
                              <Text fontWeight="semibold" color="pos.600">
                                Room {guest.room_number}
                              </Text>
                            </HStack>
                            <HStack spacing={1}>
                              <Icon as={Calendar} boxSize={4} color="gray.500" />
                              <Text fontSize="sm" color="gray.600">
                                {formatDate(guest.check_in_date)} - {formatDate(guest.checkout_date)}
                              </Text>
                            </HStack>
                          </HStack>

                          {/* Contact Info */}
                          <HStack spacing={4}>
                            {guest.phone && (
                              <HStack spacing={1}>
                                <Icon as={Phone} boxSize={4} color="gray.400" />
                                <Text fontSize="sm" color="gray.600">
                                  {guest.phone}
                                </Text>
                              </HStack>
                            )}
                            {guest.email && (
                              <HStack spacing={1}>
                                <Icon as={Mail} boxSize={4} color="gray.400" />
                                <Text fontSize="sm" color="gray.600">
                                  {guest.email}
                                </Text>
                              </HStack>
                            )}
                          </HStack>
                        </VStack>

                        {/* Folio Balance */}
                        <VStack align="end" spacing={1}>
                          <Text fontSize="xs" color="gray.500">
                            Current Balance
                          </Text>
                          <HStack spacing={1}>
                            <Icon as={DollarSign} boxSize={4} color="gray.500" />
                            <Text
                              fontWeight="bold"
                              color={parseFloat(guest.current_balance || 0) > 0 ? 'red.600' : 'green.600'}
                            >
                              {formatPrice(parseFloat(guest.current_balance || 0))}
                            </Text>
                          </HStack>
                        </VStack>
                      </Grid>
                    </CardBody>
                  </Card>
                ))}
              </VStack>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              colorScheme="pos"
              onClick={handleConfirmSelection}
              isDisabled={!selectedGuest}
              leftIcon={<Icon as={User} boxSize={4} />}
            >
              Select Guest
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default GuestSelector;