import React, { useState, useEffect, useCallback } from 'react';
import { useModal } from '../../hooks/useModal';
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
  Select,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Textarea,
  Divider,
  Box,
  Badge,
  Icon,
  useToast,
  Grid,
  Alert,
  AlertIcon,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from '@chakra-ui/react';
import {
  Phone,
  Mail,
  User,
  CheckCircle,
  FileText,
} from 'lucide-react';
import ApiClient from '../../services/ApiClient';

/**
 * Outstanding Order Management Modal
 * Handles contact attempts, payments, and resolution
 */
const OutstandingOrderModal = ({ isOpen, onClose, order, onUpdate }) => {
  const toast = useToast();
  const { formatPrice } = usePOS();

  // Use modal hook to pause auto-refresh when modal is open
  useModal(isOpen, 'OutstandingOrderModal');

  // State management
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [orderDetails, setOrderDetails] = useState(order);

  // Contact form state
  const [contactData, setContactData] = useState({
    contact_method: 'phone',
    notes: '',
    customer_response: '',
    promised_payment_date: ''
  });

  // Resolution form state
  const [resolutionData, setResolutionData] = useState({
    resolution_action: 'payment_collected',
    resolution_notes: '',
    amount_collected: order?.outstanding_amount || 0,
    payment_method: 'cash'
  });

  // Notes and updates
  const [newNote, setNewNote] = useState('');
  const [errors, setErrors] = useState({});

  const loadOrderDetails = useCallback(async () => {
    if (!order) return;
    try {
      const response = await ApiClient.get(`/api/pos/api/outstanding-orders/${order.id}/`);
      setOrderDetails(response.data);
    } catch (error) {
      console.error('Failed to load order details:', error);
    }
  }, [order]);

  // Load fresh order details when modal opens
  useEffect(() => {
    if (isOpen && order) {
      loadOrderDetails();
    }
  }, [isOpen, order, loadOrderDetails]);

  const handleContactAttempt = async () => {
    setLoading(true);
    setErrors({});

    try {
      const response = await ApiClient.post(
        `/api/pos/api/outstanding-orders/${orderDetails.id}/contact_attempt/`,
        contactData
      );

      toast({
        title: 'Contact Recorded',
        description: 'Contact attempt has been logged successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setOrderDetails(response.data);
      setContactData({
        contact_method: 'phone',
        notes: '',
        customer_response: '',
        promised_payment_date: ''
      });

      onUpdate();
      
    } catch (error) {
      setErrors(error.response?.data || { general: 'Failed to record contact' });
      toast({
        title: 'Error',
        description: 'Failed to record contact attempt',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResolution = async () => {
    setLoading(true);
    setErrors({});

    try {
      const response = await ApiClient.post(
        `/api/pos/api/outstanding-orders/${orderDetails.id}/resolve/`,
        resolutionData
      );

      toast({
        title: 'Order Resolved',
        description: 'Outstanding order has been resolved successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setOrderDetails(response.data);
      onUpdate();
      onClose();
      
    } catch (error) {
      setErrors(error.response?.data || { general: 'Failed to resolve order' });
      toast({
        title: 'Error',
        description: 'Failed to resolve outstanding order',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      await ApiClient.post(`/api/pos/api/outstanding-orders/${orderDetails.id}/add_note/`, {
        content: newNote,
        note_type: 'internal'
      });

      toast({
        title: 'Note Added',
        description: 'Internal note has been added successfully',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });

      setNewNote('');
      loadOrderDetails();
      
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add note',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!orderDetails) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl">
      <ModalOverlay />
      <ModalContent maxH="90vh">
        <ModalHeader>
          <HStack spacing={3}>
            <Icon as={FileText} boxSize={5} color="pos.500" />
            <VStack align="start" spacing={0}>
              <Text>Outstanding Order: {orderDetails.order_number}</Text>
              <HStack spacing={2}>
                <Badge colorScheme={orderDetails.priority === 'urgent' ? 'red' : 'orange'}>
                  {orderDetails.priority.toUpperCase()}
                </Badge>
                <Badge colorScheme="red">
                  {formatPrice(parseFloat(orderDetails.outstanding_amount) || 0)} Outstanding
                </Badge>
                {orderDetails.is_overdue && (
                  <Badge colorScheme="red" variant="outline">
                    OVERDUE
                  </Badge>
                )}
              </HStack>
            </VStack>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <Tabs index={activeTab} onChange={setActiveTab}>
            <TabList>
              <Tab>Order Details</Tab>
              <Tab>Contact Customer</Tab>
              <Tab>Resolve Order</Tab>
              <Tab>Notes & History</Tab>
            </TabList>

            <TabPanels>
              {/* Order Details Tab */}
              <TabPanel>
                <VStack spacing={4} align="stretch">
                  {/* Customer & Order Info */}
                  <Grid templateColumns="1fr 1fr" gap={6}>
                    <VStack align="stretch" spacing={3}>
                      <Text fontWeight="bold">Customer Information</Text>
                      <HStack>
                        <Icon as={User} boxSize={4} color="gray.500" />
                        <Text>{orderDetails.customer_name}</Text>
                      </HStack>
                      {orderDetails.customer_phone && (
                        <HStack>
                          <Icon as={Phone} boxSize={4} color="gray.500" />
                          <Text>{orderDetails.customer_phone}</Text>
                        </HStack>
                      )}
                      {orderDetails.customer_email && (
                        <HStack>
                          <Icon as={Mail} boxSize={4} color="gray.500" />
                          <Text>{orderDetails.customer_email}</Text>
                        </HStack>
                      )}
                      {orderDetails.room_number && (
                        <HStack>
                          <Text fontWeight="medium">Room:</Text>
                          <Text>{orderDetails.room_number}</Text>
                        </HStack>
                      )}
                    </VStack>

                    <VStack align="stretch" spacing={3}>
                      <Text fontWeight="bold">Order Information</Text>
                      <HStack justify="space-between">
                        <Text>Order Total:</Text>
                        <Text fontWeight="medium">{formatPrice(parseFloat(orderDetails.original_amount) || 0)}</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text>Amount Paid:</Text>
                        <Text color="green.600">{formatPrice(parseFloat(orderDetails.paid_amount) || 0)}</Text>
                      </HStack>
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontWeight="bold">Outstanding:</Text>
                        <Text fontWeight="bold" color="red.600">
                          {formatPrice(parseFloat(orderDetails.outstanding_amount) || 0)}
                        </Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text>Order Age:</Text>
                        <Text>{orderDetails.age_in_days} days</Text>
                      </HStack>
                    </VStack>
                  </Grid>

                  {/* Contact History */}
                  {orderDetails.contact_attempts > 0 && (
                    <Box bg="blue.50" p={4} borderRadius="md">
                      <Text fontWeight="medium" mb={2}>Contact History</Text>
                      <Grid templateColumns="1fr 1fr 1fr" gap={4} fontSize="sm">
                        <Text>Attempts: {orderDetails.contact_attempts}</Text>
                        <Text>Last Contact: {formatDate(orderDetails.last_contact_date)}</Text>
                        <Text>Next Follow-up: {formatDate(orderDetails.next_follow_up_date)}</Text>
                      </Grid>
                    </Box>
                  )}
                </VStack>
              </TabPanel>

              {/* Contact Customer Tab */}
              <TabPanel>
                <VStack spacing={4} align="stretch">
                  <Alert status="info">
                    <AlertIcon />
                    Record contact attempts to track follow-up efforts and customer responses.
                  </Alert>

                  <FormControl isInvalid={errors.contact_method}>
                    <FormLabel>Contact Method</FormLabel>
                    <Select
                      value={contactData.contact_method}
                      onChange={(e) => setContactData(prev => ({ 
                        ...prev, contact_method: e.target.value 
                      }))}
                    >
                      <option value="phone">Phone Call</option>
                      <option value="email">Email</option>
                      <option value="in_person">In Person</option>
                      <option value="sms">SMS</option>
                    </Select>
                    <FormErrorMessage>{errors.contact_method}</FormErrorMessage>
                  </FormControl>

                  <FormControl isRequired isInvalid={errors.notes}>
                    <FormLabel>Contact Notes</FormLabel>
                    <Textarea
                      value={contactData.notes}
                      onChange={(e) => setContactData(prev => ({ 
                        ...prev, notes: e.target.value 
                      }))}
                      placeholder="What was discussed? What action was taken?"
                      rows={3}
                    />
                    <FormErrorMessage>{errors.notes}</FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={errors.customer_response}>
                    <FormLabel>Customer Response</FormLabel>
                    <Textarea
                      value={contactData.customer_response}
                      onChange={(e) => setContactData(prev => ({ 
                        ...prev, customer_response: e.target.value 
                      }))}
                      placeholder="How did the customer respond? Any promises made?"
                      rows={2}
                    />
                    <FormErrorMessage>{errors.customer_response}</FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={errors.promised_payment_date}>
                    <FormLabel>Promised Payment Date (Optional)</FormLabel>
                    <Input
                      type="datetime-local"
                      value={contactData.promised_payment_date}
                      onChange={(e) => setContactData(prev => ({ 
                        ...prev, promised_payment_date: e.target.value 
                      }))}
                    />
                    <FormErrorMessage>{errors.promised_payment_date}</FormErrorMessage>
                  </FormControl>

                  <Button
                    colorScheme="blue"
                    onClick={handleContactAttempt}
                    isLoading={loading}
                    leftIcon={<Icon as={Phone} boxSize={4} />}
                  >
                    Record Contact Attempt
                  </Button>
                </VStack>
              </TabPanel>

              {/* Resolve Order Tab */}
              <TabPanel>
                <VStack spacing={4} align="stretch">
                  {orderDetails.is_resolved ? (
                    <Alert status="success">
                      <AlertIcon />
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="medium">Order Already Resolved</Text>
                        <Text fontSize="sm">
                          {orderDetails.resolution_action?.replace('_', ' ')} - 
                          {formatDate(orderDetails.resolved_at)}
                        </Text>
                      </VStack>
                    </Alert>
                  ) : (
                    <>
                      <Alert status="warning">
                        <AlertIcon />
                        Choose the appropriate resolution action for this outstanding order.
                      </Alert>

                      <FormControl isRequired isInvalid={errors.resolution_action}>
                        <FormLabel>Resolution Action</FormLabel>
                        <Select
                          value={resolutionData.resolution_action}
                          onChange={(e) => setResolutionData(prev => ({ 
                            ...prev, resolution_action: e.target.value 
                          }))}
                        >
                          <option value="payment_collected">Payment Collected</option>
                          <option value="room_charge_applied">Room Charge Applied</option>
                          <option value="complimentary">Complimentary</option>
                          <option value="manager_writeoff">Manager Write-off</option>
                          <option value="accounts_receivable">Accounts Receivable</option>
                          <option value="partial_payment">Partial Payment</option>
                        </Select>
                        <FormErrorMessage>{errors.resolution_action}</FormErrorMessage>
                      </FormControl>

                      {(resolutionData.resolution_action === 'payment_collected' || 
                        resolutionData.resolution_action === 'partial_payment') && (
                        <>
                          <FormControl isInvalid={errors.amount_collected}>
                            <FormLabel>Amount Collected</FormLabel>
                            <NumberInput
                              value={resolutionData.amount_collected}
                              onChange={(value) => setResolutionData(prev => ({ 
                                ...prev, amount_collected: parseFloat(value) || 0 
                              }))}
                              min={0}
                              max={orderDetails.outstanding_amount}
                              precision={2}
                            >
                              <NumberInputField />
                              <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                              </NumberInputStepper>
                            </NumberInput>
                            <FormErrorMessage>{errors.amount_collected}</FormErrorMessage>
                          </FormControl>

                          <FormControl isInvalid={errors.payment_method}>
                            <FormLabel>Payment Method</FormLabel>
                            <Select
                              value={resolutionData.payment_method}
                              onChange={(e) => setResolutionData(prev => ({ 
                                ...prev, payment_method: e.target.value 
                              }))}
                            >
                              <option value="cash">Cash</option>
                              <option value="credit_card">Credit Card</option>
                              <option value="room_charge">Room Charge</option>
                              <option value="bank_transfer">Bank Transfer</option>
                            </Select>
                            <FormErrorMessage>{errors.payment_method}</FormErrorMessage>
                          </FormControl>
                        </>
                      )}

                      <FormControl isInvalid={errors.resolution_notes}>
                        <FormLabel>Resolution Notes</FormLabel>
                        <Textarea
                          value={resolutionData.resolution_notes}
                          onChange={(e) => setResolutionData(prev => ({ 
                            ...prev, resolution_notes: e.target.value 
                          }))}
                          placeholder="Additional details about the resolution..."
                          rows={3}
                        />
                        <FormErrorMessage>{errors.resolution_notes}</FormErrorMessage>
                      </FormControl>

                      <Button
                        colorScheme="green"
                        onClick={handleResolution}
                        isLoading={loading}
                        leftIcon={<Icon as={CheckCircle} boxSize={4} />}
                      >
                        Resolve Order
                      </Button>
                    </>
                  )}
                </VStack>
              </TabPanel>

              {/* Notes & History Tab */}
              <TabPanel>
                <VStack spacing={4} align="stretch">
                  {/* Add New Note */}
                  <Box>
                    <FormLabel>Add Internal Note</FormLabel>
                    <HStack>
                      <Textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add an internal note..."
                        size="sm"
                        rows={2}
                      />
                      <Button
                        colorScheme="pos"
                        size="sm"
                        onClick={handleAddNote}
                        isDisabled={!newNote.trim()}
                      >
                        Add Note
                      </Button>
                    </HStack>
                  </Box>

                  <Divider />

                  {/* Notes History */}
                  <VStack spacing={3} align="stretch">
                    <Text fontWeight="bold">Notes & History</Text>
                    {orderDetails.notes?.length > 0 ? (
                      orderDetails.notes.map((note, index) => (
                        <Box key={index} p={3} bg="gray.50" borderRadius="md">
                          <HStack justify="space-between" mb={2}>
                            <Badge colorScheme="blue">
                              {note.note_type.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <Text fontSize="sm" color="gray.600">
                              {formatDate(note.created_at)} - {note.created_by_name}
                            </Text>
                          </HStack>
                          <Text fontSize="sm">{note.content}</Text>
                          {note.customer_response && (
                            <Text fontSize="sm" color="blue.600" mt={1}>
                              Customer Response: {note.customer_response}
                            </Text>
                          )}
                        </Box>
                      ))
                    ) : (
                      <Text color="gray.500" textAlign="center" py={4}>
                        No notes recorded yet
                      </Text>
                    )}
                  </VStack>
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default OutstandingOrderModal;