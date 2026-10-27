import React, { useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Box,
  Text,
  VStack,
  HStack,
  Divider,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useColorModeValue,
} from '@chakra-ui/react';
import { Printer, X } from 'lucide-react';
import PrintService from '../../services/PrintService';

/**
 * PrintPreview Component
 * Modal for previewing and printing invoices/KOTs
 */
const PrintPreview = ({ isOpen, onClose, order, type = 'invoice' }) => {
  const printRef = useRef(null);
  const { formatPrice } = usePOS();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  if (!order) return null;

  const {
    order_number,
    table_number,
    items = [],
    subtotal,
    tax_amount,
    service_charge,
    total_amount,
    created_at,
    restaurant_name,
    payments = [],
    status,
    guest_name,
    guest
  } = order;


  const handlePrint = async () => {
    try {
      if (type === 'invoice') {
        await PrintService.printInvoice(order);
      } else if (type === 'kot') {
        await PrintService.printKOT({
          items,
          tableNumber: table_number,
          orderNumber: order_number,
          timestamp: new Date(created_at)
        });
      }
      onClose();
    } catch (error) {
      console.error('Print failed:', error);
    }
  };

  const renderInvoice = () => (
    <VStack spacing={4} align="stretch" p={4}>
      {/* Header */}
      <VStack spacing={1}>
        <Text fontSize="xl" fontWeight="bold">{restaurant_name || 'Restaurant'}</Text>
        <Text fontSize="sm" color="gray.500">Tax Invoice</Text>
      </VStack>

      <Divider />

      {/* Order Info */}
      <HStack justify="space-between" fontSize="sm">
        <Text>Order #: {order_number}</Text>
        <Text>Table: {table_number || 'N/A'}</Text>
      </HStack>
      <HStack justify="space-between" fontSize="sm">
        <Text>Date: {new Date(created_at).toLocaleDateString()}</Text>
        <Text>Time: {new Date(created_at).toLocaleTimeString()}</Text>
      </HStack>
      {(guest_name || guest?.name) && (
        <Text fontSize="sm">Guest: {guest_name || guest?.name}</Text>
      )}

      <Divider />

      {/* Items Table */}
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th px={0}>Item</Th>
            <Th px={0} isNumeric>Qty</Th>
            <Th px={0} isNumeric>Price</Th>
            <Th px={0} isNumeric>Total</Th>
          </Tr>
        </Thead>
        <Tbody>
          {items.map((item, index) => (
            <Tr key={index}>
              <Td px={0} fontSize="sm">{item.menu_item_name || item.name}</Td>
              <Td px={0} isNumeric fontSize="sm">{item.quantity}</Td>
              <Td px={0} isNumeric fontSize="sm">{formatPrice(item.unit_price)}</Td>
              <Td px={0} isNumeric fontSize="sm">{formatPrice(item.subtotal || (item.unit_price * item.quantity))}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Divider />

      {/* Totals */}
      <VStack spacing={1} align="stretch">
        <HStack justify="space-between" fontSize="sm">
          <Text>Subtotal:</Text>
          <Text>{formatPrice(subtotal)}</Text>
        </HStack>
        {tax_amount > 0 && (
          <HStack justify="space-between" fontSize="sm">
            <Text>Tax:</Text>
            <Text>{formatPrice(tax_amount)}</Text>
          </HStack>
        )}
        {service_charge > 0 && (
          <HStack justify="space-between" fontSize="sm">
            <Text>Service Charge:</Text>
            <Text>{formatPrice(service_charge)}</Text>
          </HStack>
        )}
        <Divider />
        <HStack justify="space-between" fontWeight="bold">
          <Text>Total:</Text>
          <Text>{formatPrice(total_amount)}</Text>
        </HStack>
      </VStack>

      {/* Payment Info */}
      {payments.length > 0 && (
        <>
          <Divider />
          <VStack spacing={1} align="stretch">
            <Text fontSize="sm" fontWeight="semibold">Payments:</Text>
            {payments.map((payment, index) => (
              <HStack key={index} justify="space-between" fontSize="sm">
                <Text>{payment.payment_method}</Text>
                <Text>{formatPrice(payment.amount)}</Text>
              </HStack>
            ))}
          </VStack>
        </>
      )}

      {/* Footer */}
      <Divider />
      <Text fontSize="sm" textAlign="center" color="gray.500">
        Thank you for dining with us!
      </Text>
    </VStack>
  );

  const renderKOT = () => (
    <VStack spacing={4} align="stretch" p={4}>
      {/* Header */}
      <VStack spacing={1}>
        <Text fontSize="xl" fontWeight="bold">KITCHEN ORDER</Text>
        <Text fontSize="lg">Table: {table_number}</Text>
      </VStack>

      <Divider />

      {/* Order Info */}
      <HStack justify="space-between" fontSize="sm">
        <Text>Order #: {order_number}</Text>
        <Text>{new Date(created_at).toLocaleTimeString()}</Text>
      </HStack>

      <Divider />

      {/* Items */}
      <VStack spacing={2} align="stretch">
        {items.map((item, index) => (
          <Box key={index} p={2} bg="gray.50" borderRadius="md">
            <HStack justify="space-between">
              <Text fontWeight="bold" fontSize="lg">
                {item.quantity}x {item.menu_item_name || item.name}
              </Text>
            </HStack>
            {item.special_instructions && (
              <Text fontSize="sm" color="red.600" mt={1}>
                Note: {item.special_instructions}
              </Text>
            )}
          </Box>
        ))}
      </VStack>

      <Divider />

      <Text fontSize="sm" textAlign="center" fontWeight="bold">
        {new Date().toLocaleString()}
      </Text>
    </VStack>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg={bgColor}>
        <ModalHeader borderBottomWidth="1px" borderColor={borderColor}>
          <HStack>
            <Printer size={20} />
            <Text>{type === 'invoice' ? 'Invoice Preview' : 'KOT Preview'}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody ref={printRef} p={0}>
          <Box
            bg="white"
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="md"
            m={4}
            fontFamily="mono"
          >
            {type === 'invoice' ? renderInvoice() : renderKOT()}
          </Box>
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor={borderColor}>
          <Button variant="ghost" mr={3} onClick={onClose} leftIcon={<X size={16} />}>
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handlePrint}
            leftIcon={<Printer size={16} />}
          >
            Print
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default PrintPreview;
