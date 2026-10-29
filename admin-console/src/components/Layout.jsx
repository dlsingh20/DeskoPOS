import React, { useState } from 'react';
import { Badge, Box, Button, Container, Flex, HStack, Text } from '@chakra-ui/react';
import { NavLink } from 'react-router-dom';
import { KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../auth';
import ChangePasswordModal from './ChangePasswordModal';

const NavItem = ({ to, children }) => (
  <Box
    as={NavLink}
    to={to}
    px={3}
    py={2}
    borderRadius="md"
    fontWeight="medium"
    color="gray.600"
    _hover={{ bg: 'gray.100' }}
    sx={{ '&.active': { bg: 'brand.50', color: 'brand.700' } }}
  >
    {children}
  </Box>
);

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  return (
    <Box minH="100vh">
      <Box bg="white" borderBottomWidth="1px">
        <Container maxW="6xl" py={3}>
          <Flex align="center" gap={6} wrap="wrap">
            <Text fontWeight="bold" fontSize="lg">DeskoPOS <Text as="span" color="brand.600">Super Admin</Text></Text>
            <HStack spacing={1} flex="1">
              <NavItem to="/clients">Clients</NavItem>
              <NavItem to="/activity">Activity</NavItem>
            </HStack>
            <HStack spacing={3}>
              <Text fontSize="sm" color="gray.600">{user.name || user.email}</Text>
              <Badge>{user.role}</Badge>
              <Button size="sm" variant="ghost" colorScheme="gray" leftIcon={<KeyRound size={16} />}
                onClick={() => setChangingPassword(true)}>
                Change password
              </Button>
              <Button size="sm" variant="ghost" colorScheme="gray" leftIcon={<LogOut size={16} />} onClick={logout}>
                Sign out
              </Button>
            </HStack>
          </Flex>
        </Container>
      </Box>
      <Container maxW="6xl" py={6}>{children}</Container>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </Box>
  );
}
