import React from 'react';
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
  Box,
  Text,
  Badge,
  IconButton,
  Alert,
  AlertIcon,
  Divider,
  useToast,
} from '@chakra-ui/react';
import { Clock, User, DollarSign, Hash, RotateCcw, Trash2 } from 'lucide-react';
import { usePOS } from '../../context/POSContext';

const HeldOrdersModal = ({ isOpen, onClose }) => {
  const { state, resumeHeldOrder, deleteHeldOrder, formatPrice } = usePOS();
  const toast = useToast();
  
  const handleResumeOrder = (index) => {
    const order = resumeHeldOrder(index);
    if (order) {
      toast({
        title: 'Order Resumed',
        description: `Order ${order.id} has been loaded into cart`,
        status: 'success',
        duration: 3000,
      });
      onClose();
    }
  };
  
  const handleDeleteOrder = (index) => {
    // Use context function to delete without refresh
    deleteHeldOrder(index);
    
    toast({
      title: 'Order Deleted',
      description: 'Held order has been removed',
      status: 'info',
      duration: 3000,
    });
  };
  
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) {
      return `${diffMins} mins ago`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Held Orders</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {state.heldOrders && state.heldOrders.length > 0 ? (
            <VStack spacing={4} align="stretch">
              {state.heldOrders.map((order, index) => (
                <Box
                  key={order.id || index}
                  borderWidth="1px"
                  borderRadius="lg"
                  p={4}
                  _hover={{ shadow: 'md' }}
                  transition="all 0.2s"
                >
                  <HStack justify="space-between" mb={3}>
                    <HStack spacing={3}>
                      <Badge colorScheme="blue" fontSize="sm">
                        <HStack spacing={1}>
                          <Hash size={12} />
                          <Text>{order.id}</Text>
                        </HStack>
                      </Badge>
                      {order.orderType && (
                        <Badge colorScheme="green" fontSize="sm">
                          {order.orderType === 'dine_in' ? 'Dine In' : 'Takeaway'}
                        </Badge>
                      )}
                      {order.table && (
                        <Badge colorScheme="purple" fontSize="sm">
                          Table {order.table.table_number}
                        </Badge>
                      )}
                    </HStack>
                    <HStack spacing={2}>
                      <IconButton
                        icon={<RotateCcw />}
                        size="sm"
                        colorScheme="green"
                        variant="outline"
                        onClick={() => handleResumeOrder(index)}
                        aria-label="Resume Order"
                      />
                      <IconButton
                        icon={<Trash2 />}
                        size="sm"
                        colorScheme="red"
                        variant="outline"
                        onClick={() => handleDeleteOrder(index)}
                        aria-label="Delete Order"
                      />
                    </HStack>
                  </HStack>
                  
                  <VStack align="start" spacing={2}>
                    <HStack spacing={4} fontSize="sm" color="gray.600">
                      <HStack>
                        <Clock size={14} />
                        <Text>{formatTime(order.timestamp)}</Text>
                      </HStack>
                      {order.customerInfo?.name && (
                        <HStack>
                          <User size={14} />
                          <Text>{order.customerInfo.name}</Text>
                        </HStack>
                      )}
                    </HStack>
                    
                    <Divider />
                    
                    <VStack align="stretch" spacing={1} w="full">
                      {order.cart?.slice(0, 3).map((item, idx) => (
                        <HStack key={idx} justify="space-between" fontSize="sm">
                          <Text>
                            {item.quantity}x {item.menuItem?.name || item.name}
                          </Text>
                          <Text fontWeight="medium">
                            {formatPrice((item.menuItem?.price || 0) * item.quantity)}
                          </Text>
                        </HStack>
                      ))}
                      {order.cart?.length > 3 && (
                        <Text fontSize="xs" color="gray.500">
                          +{order.cart.length - 3} more items
                        </Text>
                      )}
                    </VStack>
                    
                    <Divider />
                    
                    <HStack justify="space-between" w="full">
                      <Text fontSize="sm" color="gray.600">Total</Text>
                      <HStack>
                        <DollarSign size={14} />
                        <Text fontWeight="bold" fontSize="md">
                          {formatPrice(order.total || 0)}
                        </Text>
                      </HStack>
                    </HStack>
                  </VStack>
                </Box>
              ))}
            </VStack>
          ) : (
            <Alert status="info" borderRadius="lg">
              <AlertIcon />
              <Box>
                <Text fontWeight="medium">No Held Orders</Text>
                <Text fontSize="sm">There are no orders on hold at the moment</Text>
              </Box>
            </Alert>
          )}
        </ModalBody>
        
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default HeldOrdersModal;