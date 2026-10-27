import React, { useState } from 'react';
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
  Select,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Divider,
  Box,
  Badge,
  Icon,
  useToast,
  Grid,
  Alert,
  AlertIcon,
  Textarea,
} from '@chakra-ui/react';
import {
  CreditCard,
  DollarSign,
  Smartphone,
  Building,
  Receipt,
  Calculator,
  Clock
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useCashCounter } from '../../context/CashCounterContext';
import ApiClient from '../../services/ApiClient';
import GuestSelector from './GuestSelector';
import { 
  canAcceptPayment, 
  getPaymentStatus,
  getRemainingAmount,
  calculatePaidAmount 
} from '../../utils/orderUtils';

/**
 * Payment Processing Modal Component
 * Handles different payment methods and processing
 */
const PaymentModal = ({ isOpen, onClose, order, onPaymentComplete }) => {
  const { processFlexiblePayment, cancelOrder, state, formatPrice } = usePOS();
  const toast = useToast();
  const { ensureCounter } = useCashCounter();
  
  // Use modal hook to pause auto-refresh when payment modal is open
  useModal(isOpen, 'PaymentModal');

  const [paymentData, setPaymentData] = useState({
    method: 'cash',
    amount: order?.total_amount || 0,
    receivedAmount: 0,
    transactionId: '',
    notes: '',
    splitPayments: []
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [showGuestSelector, setShowGuestSelector] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: DollarSign, color: 'green', backendValue: 'cash' },
    { value: 'card', label: 'Card', icon: CreditCard, color: 'blue', backendValue: 'credit_card' },
    { value: 'digital_wallet', label: 'Digital Wallet', icon: Smartphone, color: 'purple', backendValue: 'mobile_payment' },
    { value: 'room_charge', label: 'Room Charge', icon: Building, color: 'orange', backendValue: 'room_charge' },
    { value: 'pay_later', label: 'Pay Later', icon: Clock, color: 'yellow', backendValue: 'pay_later' },
  ];

  // Reset form when modal opens and validate payment eligibility
  React.useEffect(() => {
    if (isOpen && order) {
      // First check remaining amount
      const remainingAmount = getRemainingAmount(order);
      
      // Check if order can accept payment
      if (!canAcceptPayment(order) || remainingAmount <= 0) {
        const status = getPaymentStatus(order);
        let message = 'This order cannot accept payments.';
        
        if (status === 'paid' || remainingAmount <= 0) {
          message = 'This order is already fully paid.';
        } else if (['cancelled', 'refunded'].includes(order.status?.toLowerCase())) {
          message = `Cannot process payment for ${order.status?.toLowerCase()} order.`;
        }
        
        toast({
          title: 'Payment Not Available',
          description: message,
          status: 'warning',
          duration: 5000,
          isClosable: true,
        });
        
        onClose();
        return;
      }
      
      // Always use remaining amount to prevent overpayment
      const paymentAmount = remainingAmount;
      
      setPaymentData({
        method: 'cash',
        amount: paymentAmount,
        receivedAmount: paymentAmount,
        transactionId: '',
        notes: getPaymentStatus(order) === 'partial' 
          ? `Balance payment for order #${order.order_number}` 
          : '',
        splitPayments: []
      });
      setErrors({});
      setIsSplitPayment(false);
      setShowGuestSelector(false);
      setSelectedGuest(null);
    }
  }, [isOpen, order, onClose, toast]);

  // Calculate change for cash payments
  const calculateChange = () => {
    if (paymentData.method === 'cash' && paymentData.receivedAmount > 0) {
      return Math.max(0, paymentData.receivedAmount - paymentData.amount);
    }
    return 0;
  };

  // Validate payment data
  const validatePayment = () => {
    const newErrors = {};

    if (paymentData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (paymentData.method === 'cash') {
      if (paymentData.receivedAmount < paymentData.amount) {
        newErrors.receivedAmount = 'Received amount must be at least the order total';
      }
    }

    if (paymentData.method === 'card' && !paymentData.transactionId.trim()) {
      newErrors.transactionId = 'Transaction ID is required for card payments';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle payment method selection
  const handleMethodSelect = (method) => {
    setPaymentData(prev => ({ ...prev, method }));
    
    // Show guest selector for room charge
    if (method === 'room_charge') {
      setShowGuestSelector(true);
    }
  };

  // Handle guest selection for room charge
  const handleGuestSelect = (guest) => {
    setSelectedGuest(guest);
    setShowGuestSelector(false);
    
    // Update notes with guest and room info
    setPaymentData(prev => ({
      ...prev,
      notes: `Room charge - ${guest.guest_name} - Room ${guest.room_number}`
    }));
  };

  // Handle room charge payment
  const handleRoomChargePayment = async () => {
    if (!selectedGuest) {
      toast({
        title: 'Guest Required',
        description: 'Please select a guest for room charge',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await ApiClient.post(`/api/pos/api/orders/${order.id}/charge_to_room/`, {
        guest_id: selectedGuest.guest_id
      });

      if (response.data.success) {
        toast({
          title: 'Room Charge Successful',
          description: response.data.message,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });

        if (onPaymentComplete) {
          onPaymentComplete({
            method: 'room_charge',
            amount: paymentData.amount,
            guest: selectedGuest,
            folio_charges: response.data.folio_charges,
            updated_balance: response.data.updated_balance
          });
        }

        onClose();
      } else {
        throw new Error(response.data.message || 'Room charge failed');
      }
    } catch (error) {
      toast({
        title: 'Room Charge Failed',
        description: error.response?.data?.message || error.message || 'Failed to process room charge',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle pay later option
  const handlePayLater = async () => {
    setLoading(true);
    try {
      toast({
        title: 'Pay Later Selected',
        description: `Order ${order.order_number} will be served without payment. An outstanding order record will be created when the order is marked as served by kitchen staff.`,
        status: 'info',
        duration: 7000,
        isClosable: true,
      });

      if (onPaymentComplete) {
        onPaymentComplete({
          method: 'pay_later',
          amount: 0,
          notes: 'Customer chose to pay later - outstanding order will be created upon serving',
          pay_later: true
        });
      }

      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process pay later option',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle order cancellation
  const handleCancelOrder = async () => {
    if (!order?.id) return;

    setLoading(true);
    try {
      await cancelOrder(order.id, 'Order cancelled from payment modal');
      
      toast({
        title: 'Order Cancelled',
        description: `Order ${order.order_number} has been cancelled successfully.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      if (onPaymentComplete) {
        onPaymentComplete({
          cancelled: true,
          order: order
        });
      }

      onClose();
    } catch (error) {
      toast({
        title: 'Cancellation Failed',
        description: error.message || 'Failed to cancel the order',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle payment submission
  const handlePayment = async () => {
    // Handle pay later separately
    if (paymentData.method === 'pay_later') {
      return handlePayLater();
    }

    // Payments are recorded on the cashier's open counter
    if (!ensureCounter()) return;

    // Handle room charge separately
    if (paymentData.method === 'room_charge') {
      return handleRoomChargePayment();
    }

    if (!validatePayment()) {
      return;
    }
    
    // Additional check to prevent overpayment
    const remainingAmount = getRemainingAmount(order);
    if (remainingAmount <= 0) {
      toast({
        title: 'Order Already Paid',
        description: 'This order is already fully paid.',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      onClose();
      return;
    }
    
    // Ensure payment amount doesn't exceed remaining amount
    const finalPaymentAmount = Math.min(paymentData.amount, remainingAmount);

    setLoading(true);
    try {
      // Map frontend method value to backend value
      const methodMapping = paymentMethods.find(m => m.value === paymentData.method);
      const backendMethod = methodMapping?.backendValue || paymentData.method;
      
      const paymentPayload = {
        order_id: order.id,
        method: backendMethod,
        amount: finalPaymentAmount,
        transaction_id: paymentData.transactionId,
        notes: paymentData.notes,
        received_amount: paymentData.receivedAmount,
      };

      const result = await processFlexiblePayment(order.id, paymentPayload);

      toast({
        title: 'Payment Processed',
        description: result.message || `Payment of ${formatPrice(paymentData.amount)} processed successfully. Order remains in ${result.order_status || 'current'} status.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      if (onPaymentComplete) {
        onPaymentComplete({
          ...paymentPayload,
          change: calculateChange(),
        });
      }

      onClose();
    } catch (error) {
      toast({
        title: 'Payment Failed',
        description: error.message || 'Failed to process payment',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle split payment
  const handleSplitPayment = () => {
    setIsSplitPayment(true);
    // Initialize split payments with two methods
    setPaymentData(prev => ({
      ...prev,
      splitPayments: [
        { method: 'cash', amount: prev.amount / 2 },
        { method: 'card', amount: prev.amount / 2 }
      ]
    }));
  };

  // Add split payment method
  const addSplitPayment = () => {
    setPaymentData(prev => ({
      ...prev,
      splitPayments: [...prev.splitPayments, { method: 'cash', amount: 0 }]
    }));
  };

  // Update split payment
  const updateSplitPayment = (index, field, value) => {
    setPaymentData(prev => ({
      ...prev,
      splitPayments: prev.splitPayments.map((payment, i) =>
        i === index ? { ...payment, [field]: value } : payment
      )
    }));
  };

  // Get total split amount
  const getTotalSplitAmount = () => {
    return paymentData.splitPayments.reduce((total, payment) => total + (parseFloat(payment.amount) || 0), 0);
  };

  const getMethodIcon = (method) => {
    const methodData = paymentMethods.find(m => m.value === method);
    return methodData ? methodData.icon : DollarSign;
  };

  const getMethodColor = (method) => {
    const methodData = paymentMethods.find(m => m.value === method);
    return methodData ? methodData.color : 'gray';
  };

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={2}>
            <Icon as={Receipt} boxSize={5} color="pos.500" />
            <Text>Process Payment - Order #{order.order_number}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={6} align="stretch">
            {/* Payment Info */}
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Box>
                <Text fontWeight="medium">Payment at Any Stage</Text>
                <Text fontSize="sm">
                  Payments can be processed now while the order is being prepared. The order will remain in its current stage until kitchen staff marks it as served.
                </Text>
              </Box>
            </Alert>

            {/* Order Summary */}
            <Box bg="gray.50" p={4} borderRadius="md">
              <Text fontWeight="semibold" mb={2}>Order Summary</Text>
              <HStack justify="space-between">
                <Text>Subtotal:</Text>
                <Text>{formatPrice(parseFloat(order.subtotal || order.total_amount) || 0)}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text>Tax:</Text>
                <Text>{formatPrice(parseFloat(order.tax_amount) || 0)}</Text>
              </HStack>
              <Divider my={2} />
              <HStack justify="space-between" fontWeight="bold">
                <Text>Order Total:</Text>
                <Text fontSize="lg">{formatPrice(parseFloat(order.total_amount) || 0)}</Text>
              </HStack>
              
              {getPaymentStatus(order) === 'partial' && (
                <>
                  <HStack justify="space-between" color="green.600">
                    <Text>Already Paid:</Text>
                    <Text>-{formatPrice(calculatePaidAmount(order))}</Text>
                  </HStack>
                  <Divider my={2} />
                  <HStack justify="space-between" fontWeight="bold" color="orange.600">
                    <Text>Amount Due:</Text>
                    <Text fontSize="lg">{formatPrice(getRemainingAmount(order))}</Text>
                  </HStack>
                </>
              )}
            </Box>

            {!isSplitPayment ? (
              <>
                {/* Payment Method Selection */}
                <FormControl isInvalid={errors.method}>
                  <FormLabel>Payment Method</FormLabel>
                  <Grid templateColumns="repeat(2, 1fr)" gap={2}>
                    {paymentMethods.map((method) => (
                      <Button
                        key={method.value}
                        variant={paymentData.method === method.value ? 'solid' : 'outline'}
                        colorScheme={paymentData.method === method.value ? method.color : 'gray'}
                        leftIcon={<Icon as={method.icon} boxSize={4} />}
                        onClick={() => handleMethodSelect(method.value)}
                        size="md"
                        justifyContent="flex-start"
                      >
                        {method.label}
                      </Button>
                    ))}
                  </Grid>
                  <FormErrorMessage>{errors.method}</FormErrorMessage>
                </FormControl>

                {/* Payment Amount - hide for pay later */}
                {paymentData.method !== 'pay_later' && (
                  <FormControl isInvalid={errors.amount}>
                    <FormLabel>Payment Amount</FormLabel>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentData.amount}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                    <FormErrorMessage>{errors.amount}</FormErrorMessage>
                  </FormControl>
                )}

                {/* Cash-specific fields */}
                {paymentData.method === 'cash' && (
                  <FormControl isInvalid={errors.receivedAmount}>
                    <FormLabel>Amount Received</FormLabel>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentData.receivedAmount}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, receivedAmount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                    <FormErrorMessage>{errors.receivedAmount}</FormErrorMessage>
                    
                    {calculateChange() > 0 && (
                      <Alert status="info" mt={2}>
                        <AlertIcon />
                        Change to give: {formatPrice(calculateChange())}
                      </Alert>
                    )}
                  </FormControl>
                )}

                {/* Transaction ID for card payments */}
                {paymentData.method === 'card' && (
                  <FormControl isInvalid={errors.transactionId}>
                    <FormLabel>Transaction ID</FormLabel>
                    <Input
                      value={paymentData.transactionId}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, transactionId: e.target.value }))}
                      placeholder="Enter transaction ID"
                    />
                    <FormErrorMessage>{errors.transactionId}</FormErrorMessage>
                  </FormControl>
                )}

                {/* Room charge guest info */}
                {paymentData.method === 'room_charge' && (
                  <>
                    {selectedGuest ? (
                      <Box bg="orange.50" p={4} borderRadius="md" border="1px" borderColor="orange.200">
                        <VStack align="start" spacing={1}>
                          <HStack spacing={2}>
                            <Icon as={Building} boxSize={4} color="orange.500" />
                            <Text fontWeight="semibold" color="orange.800">
                              Room Charge Selected
                            </Text>
                          </HStack>
                          <Text fontSize="sm" color="gray.600">
                            Guest: <strong>{selectedGuest.guest_name}</strong>
                          </Text>
                          <Text fontSize="sm" color="gray.600">
                            Room: <strong>{selectedGuest.room_number}</strong>
                          </Text>
                          <Text fontSize="sm" color="gray.600">
                            Current Balance: <strong>{formatPrice(selectedGuest.current_balance)}</strong>
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
                        <VStack align="start" spacing={1}>
                          <Text>Please select a guest for room charge payment.</Text>
                          <Button
                            size="sm"
                            colorScheme="blue"
                            onClick={() => setShowGuestSelector(true)}
                          >
                            Select Guest
                          </Button>
                        </VStack>
                      </Alert>
                    )}
                  </>
                )}

                {/* Pay Later info */}
                {paymentData.method === 'pay_later' && (
                  <Alert status="warning" borderRadius="md">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="medium">Pay Later Selected</Text>
                      <VStack align="start" spacing={2} mt={2}>
                        <Text fontSize="sm">
                          • Order will be served without immediate payment
                        </Text>
                        <Text fontSize="sm">
                          • An outstanding order record will be automatically created when the order is served
                        </Text>
                        <Text fontSize="sm">
                          • Customer can pay later through the Outstanding Orders system
                        </Text>
                        <Text fontSize="sm">
                          • Staff will be able to track and follow up on unpaid orders
                        </Text>
                      </VStack>
                    </Box>
                  </Alert>
                )}

                {/* Notes */}
                <FormControl>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <Textarea
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes..."
                    size="sm"
                    rows={2}
                  />
                </FormControl>

                {/* Split Payment Option - hide for pay later */}
                {paymentData.method !== 'pay_later' && (
                  <Button
                    variant="outline"
                    leftIcon={<Icon as={Calculator} boxSize={4} />}
                    onClick={handleSplitPayment}
                    size="sm"
                  >
                    Split Payment
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* Split Payment Interface */}
                <Box>
                  <HStack justify="space-between" mb={4}>
                    <Text fontWeight="semibold">Split Payment</Text>
                    <Badge colorScheme="blue">Multiple Methods</Badge>
                  </HStack>

                  <VStack spacing={4}>
                    {paymentData.splitPayments.map((payment, index) => (
                      <Box key={index} p={4} border="1px" borderColor="gray.200" borderRadius="md" w="full">
                        <Grid templateColumns="1fr 1fr 100px" gap={3} alignItems="center">
                          <Select
                            value={payment.method}
                            onChange={(e) => updateSplitPayment(index, 'method', e.target.value)}
                            size="sm"
                          >
                            {paymentMethods.map((method) => (
                              <option key={method.value} value={method.value}>
                                {method.label}
                              </option>
                            ))}
                          </Select>
                          <Input
                            type="number"
                            step="0.01"
                            value={payment.amount}
                            onChange={(e) => updateSplitPayment(index, 'amount', parseFloat(e.target.value) || 0)}
                            size="sm"
                            placeholder="Amount"
                          />
                          <Badge colorScheme={getMethodColor(payment.method)}>
                            #{index + 1}
                          </Badge>
                        </Grid>
                      </Box>
                    ))}

                    <HStack justify="space-between" w="full">
                      <Button size="sm" onClick={addSplitPayment}>Add Payment</Button>
                      <Text fontWeight="semibold">
                        Total: {formatPrice(getTotalSplitAmount())} / {formatPrice(paymentData.amount)}
                      </Text>
                    </HStack>

                    {Math.abs(getTotalSplitAmount() - paymentData.amount) > 0.01 && (
                      <Alert status="warning">
                        <AlertIcon />
                        Split payment total doesn't match order amount
                      </Alert>
                    )}
                  </VStack>
                </Box>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSplitPayment(false)}
                >
                  Back to Single Payment
                </Button>
              </>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button 
              variant="outline" 
              colorScheme="red"
              onClick={handleCancelOrder} 
              isDisabled={loading}
              isLoading={loading}
              loadingText="Cancelling..."
            >
              Cancel Order
            </Button>
            <Button
              colorScheme={paymentData.method === 'pay_later' ? 'yellow' : 'pos'}
              onClick={handlePayment}
              isLoading={loading}
              loadingText={paymentData.method === 'pay_later' ? 'Setting up...' : 'Processing...'}
              leftIcon={<Icon as={getMethodIcon(paymentData.method)} boxSize={4} />}
            >
              {paymentData.method === 'pay_later' ? 'Confirm Pay Later' : 'Process Payment'}
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

export default PaymentModal;