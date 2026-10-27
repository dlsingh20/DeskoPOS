import React, { useState, useCallback } from 'react';
import { useModal } from '../../hooks/useModal';
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
  FormControl,
  FormLabel,
  FormErrorMessage,
  Box,
  Icon,
  useToast,
  Grid,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import {
  CreditCard,
  DollarSign,
  Smartphone,
  CheckCircle,
  Clock,
  Building,
} from 'lucide-react';
import ApiClient from '../../services/ApiClient';
import GuestSelector from '../payment/GuestSelector';
import { usePOS } from '../../context/POSContext';
import { useCashCounter } from '../../context/CashCounterContext';

const QuickPaymentModal = ({ isOpen, onClose, order, onPaymentComplete }) => {
  const { formatPrice } = usePOS();
  const toast = useToast();
  const { ensureCounter } = useCashCounter();
  
  // Use modal hook to pause auto-refresh when payment modal is open
  useModal(isOpen, 'QuickPaymentModal');
  
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState(order?.amount || 0);
  const [transactionId, setTransactionId] = useState('');
  const [errors, setErrors] = useState({});
  const [showGuestSelector, setShowGuestSelector] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: DollarSign, color: 'green' },
    { value: 'card', label: 'Card', icon: CreditCard, color: 'blue' },
    { value: 'digital_wallet', label: 'Digital Wallet', icon: Smartphone, color: 'purple' },
    { value: 'room_charge', label: 'Transfer to Room', icon: Building, color: 'orange' },
  ];

  // Get order amount from various possible property names
  const getOrderAmount = useCallback(() => {
    return parseFloat(order?.outstanding_amount || order?.amount || order?.total_amount || 0);
  }, [order]);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen && order) {
      setPaymentMethod('cash');
      // Try different property names for amount
      const amount = getOrderAmount();
      setReceivedAmount(amount);
      setTransactionId('');
      setErrors({});
      setShowGuestSelector(false);
      setSelectedGuest(null);
    }
  }, [isOpen, order, getOrderAmount]);

  // Calculate change for cash payments
  const calculateChange = () => {
    if (paymentMethod === 'cash' && receivedAmount > 0) {
      return Math.max(0, receivedAmount - getOrderAmount());
    }
    return 0;
  };

  // Validate payment data
  const validatePayment = () => {
    const newErrors = {};

    if (paymentMethod === 'cash') {
      if (receivedAmount < getOrderAmount()) {
        newErrors.receivedAmount = 'Received amount must be at least the order total';
      }
    }

    if (paymentMethod === 'card' && !transactionId.trim()) {
      newErrors.transactionId = 'Transaction ID is required for card payments';
    }

    if (paymentMethod === 'room_charge' && !selectedGuest) {
      newErrors.room_charge = 'Please select a guest for room charge';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle payment method selection
  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
    
    // Show guest selector for room charge
    if (method === 'room_charge') {
      setShowGuestSelector(true);
    }
  };

  // Handle guest selection
  const handleGuestSelect = (guest) => {
    setSelectedGuest(guest);
    setShowGuestSelector(false);
  };

  // Handle payment submission
  const handlePayment = async () => {
    if (!validatePayment()) {
      return;
    }
    // Collected money is recorded on the cashier's open counter
    if (!ensureCounter()) return;

    setLoading(true);
    try {
      const resolutionData = {
        resolution_action: 'payment_collected',
        amount_collected: receivedAmount || getOrderAmount(),
        payment_method: paymentMethod,
        resolution_notes: paymentMethod === 'room_charge' 
          ? `Room charge - ${selectedGuest?.guest_name} - Room ${selectedGuest?.room_number}`
          : `Quick payment collection - ${paymentMethod}`,
        ...(paymentMethod === 'room_charge' && { guest_id: selectedGuest?.guest_id })
      };

      await ApiClient.post(
        `/api/pos/api/outstanding-orders/${order.id}/resolve/`,
        resolutionData
      );

      toast({
        title: 'Payment Collected Successfully',
        description: `Payment of ${formatPrice(resolutionData.amount_collected)} collected from ${order.customer_name}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      if (onPaymentComplete) {
        onPaymentComplete({
          ...resolutionData,
          change: calculateChange(),
          order: order
        });
      }

      onClose();
    } catch (error) {
      toast({
        title: 'Payment Collection Failed',
        description: error.response?.data?.message || error.message || 'Failed to collect payment',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={2}>
            <Icon as={CheckCircle} boxSize={5} color="green.500" />
            <Text>Collect Payment</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Customer Info */}
            <Box bg="gray.50" p={4} borderRadius="md">
              <VStack align="start" spacing={1}>
                <Text fontWeight="semibold">{order.customer_name}</Text>
                <Text fontSize="sm" color="gray.600">Order #{order.order_number}</Text>
                <Text fontSize="sm" color="gray.600">Phone: {order.customer_phone}</Text>
                {order.room_number && (
                  <Text fontSize="sm" color="gray.600">Room: {order.room_number}</Text>
                )}
              </VStack>
            </Box>

            {/* Amount */}
            <Box bg="green.50" p={4} borderRadius="md" border="1px" borderColor="green.200">
              <HStack justify="space-between">
                <Text fontWeight="medium">Amount to Collect:</Text>
                <Text fontSize="xl" fontWeight="bold" color="green.600">
                  {formatPrice(getOrderAmount())}
                </Text>
              </HStack>
            </Box>

            {/* Payment Method Selection */}
            <FormControl>
              <FormLabel>Payment Method</FormLabel>
              <Grid templateColumns="repeat(2, 1fr)" gap={2}>
                {paymentMethods.map((method) => (
                  <Button
                    key={method.value}
                    variant={paymentMethod === method.value ? 'solid' : 'outline'}
                    colorScheme={paymentMethod === method.value ? method.color : 'gray'}
                    leftIcon={<Icon as={method.icon} boxSize={4} />}
                    onClick={() => handlePaymentMethodChange(method.value)}
                    size="sm"
                  >
                    {method.label}
                  </Button>
                ))}
              </Grid>
            </FormControl>

            {/* Cash-specific fields */}
            {paymentMethod === 'cash' && (
              <FormControl isInvalid={errors.receivedAmount}>
                <FormLabel>Amount Received</FormLabel>
                <Input
                  type="number"
                  step="0.01"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
                <FormErrorMessage>{errors.receivedAmount}</FormErrorMessage>
                
                {calculateChange() > 0 && (
                  <Alert status="info" mt={2} size="sm">
                    <AlertIcon />
                    <Box>
                      <Text fontSize="sm" fontWeight="medium">
                        Change to give: {formatPrice(calculateChange())}
                      </Text>
                    </Box>
                  </Alert>
                )}
              </FormControl>
            )}

            {/* Transaction ID for card payments */}
            {paymentMethod === 'card' && (
              <FormControl isInvalid={errors.transactionId}>
                <FormLabel>Transaction ID</FormLabel>
                <Input
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="Enter transaction ID"
                />
                <FormErrorMessage>{errors.transactionId}</FormErrorMessage>
              </FormControl>
            )}

            {/* Room Charge Guest Selection */}
            {paymentMethod === 'room_charge' && (
              <Box>
                {selectedGuest ? (
                  <Box bg="orange.50" p={4} borderRadius="md" border="1px" borderColor="orange.200">
                    <VStack align="start" spacing={2}>
                      <HStack spacing={2}>
                        <Icon as={Building} boxSize={4} color="orange.500" />
                        <Text fontWeight="semibold" color="orange.800">
                          Selected Guest
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color="gray.600">
                        Guest: <strong>{selectedGuest.guest_name}</strong>
                      </Text>
                      <Text fontSize="sm" color="gray.600">
                        Room: <strong>{selectedGuest.room_number}</strong>
                      </Text>
                      <Text fontSize="sm" color="gray.600">
                        Current Balance: <strong>{formatPrice(selectedGuest.current_balance || 0)}</strong>
                      </Text>
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="orange"
                        onClick={() => setShowGuestSelector(true)}
                      >
                        Change Guest
                      </Button>
                    </VStack>
                  </Box>
                ) : (
                  <Alert status="info">
                    <AlertIcon />
                    <Box flex="1">
                      <Text>Please select a checked-in guest for room charge transfer.</Text>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        mt={2}
                        onClick={() => setShowGuestSelector(true)}
                      >
                        Select Guest
                      </Button>
                    </Box>
                  </Alert>
                )}
                {errors.room_charge && (
                  <Text color="red.500" fontSize="sm" mt={2}>
                    {errors.room_charge}
                  </Text>
                )}
              </Box>
            )}

            {/* Order Age Info */}
            <Box bg="blue.50" p={3} borderRadius="md">
              <HStack spacing={2}>
                <Icon as={Clock} color="blue.500" boxSize={4} />
                <Text fontSize="sm" color="blue.800">
                  Order served: {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB') : 'N/A'}
                </Text>
              </HStack>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button 
              variant="outline" 
              onClick={onClose} 
              isDisabled={loading}
            >
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={handlePayment}
              isLoading={loading}
              loadingText="Collecting..."
              leftIcon={<Icon as={CheckCircle} boxSize={4} />}
            >
              Collect Payment
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
      
      {/* Guest Selector Modal */}
      <GuestSelector
        isOpen={showGuestSelector}
        onClose={() => setShowGuestSelector(false)}
        onGuestSelect={handleGuestSelect}
        order={order}
      />
    </Modal>
  );
};

export default QuickPaymentModal;