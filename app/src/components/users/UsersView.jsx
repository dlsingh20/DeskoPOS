import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Center,
  Flex,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { KeyRound, MoreVertical, Pencil, Power, RefreshCw, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { IS_DESKOPOS } from '../../services/backend';
import userService, { describeApiError } from '../../services/UserService';
import { useAccess } from '../../context/AccessContext';
import { useModal } from '../../hooks/useModal';
import UserFormDialog from './UserFormDialog';
import { displayName, isManagedPosUser, resolveAccess } from '../../utils/posAccess';

const ROLE_COLORS = { administrator: 'red', manager: 'purple', cashier: 'blue', waiter: 'orange' };

const formatDate = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const passwordProblem = (password, again) => {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'At least 8 characters, with letters and numbers.';
  if (password !== again) return 'Passwords do not match.';
  return null;
};

/**
 * Typed confirmation for destructive actions. With `request.newPassword` it also asks for a
 * password (twice) and passes it to `request.action(password)`.
 */
const ConfirmDialog = ({ request, onClose }) => {
  useModal(!!request, 'UserConfirmDialog');
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setTyped(''); setPassword(''); setAgain(''); setError(null); }, [request]);
  if (!request) return null;

  const confirm = async () => {
    if (request.newPassword) {
      const problem = passwordProblem(password, again);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await request.action(request.newPassword ? password : undefined);
      onClose(true);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose(false)} isCentered size="md">
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{request.title}</ModalHeader>
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <Text fontSize="sm">{request.message}</Text>
            {request.typeToConfirm && (
              <Box>
                <Text fontSize="sm" mb={1}>Type <b>{request.typeToConfirm}</b> to confirm.</Text>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
              </Box>
            )}
            {request.newPassword && (
              <VStack align="stretch" spacing={2}>
                <Input type="password" placeholder="Temporary password" aria-label="Temporary password" value={password}
                  onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" />
                <Input type="password" placeholder="Type it again" aria-label="Confirm temporary password" value={again}
                  onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
              </VStack>
            )}
            {error && <Alert status="error" borderRadius="8px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={() => onClose(false)} isDisabled={busy}>Cancel</Button>
          <Button colorScheme={request.danger ? 'red' : 'blue'} onClick={confirm} isLoading={busy}
            isDisabled={request.typeToConfirm && typed !== request.typeToConfirm}>
            {request.confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/**
 * Users & Roles (Administrators only): POS Managers, Cashiers and Waiters.
 * Hotel administrators are listed read-only; other hotel staff are not shown.
 */
const UsersView = () => {
  const { user: me } = useAccess();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [editing, setEditing] = useState(null); // null | 'new' | user
  const [confirm, setConfirm] = useState(null);

  const pageBg = useColorModeValue('gray.50', 'gray.900');
  const panelBg = useColorModeValue('white', 'gray.800');
  const lineColor = useColorModeValue('gray.200', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setUsers(await userService.listUsers());
    } catch (error) {
      setLoadError(describeApiError(error, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => users
    .map((u) => ({ user: u, access: resolveAccess(u), managed: isManagedPosUser(u) }))
    .filter((r) => r.managed || r.access.role === 'administrator')
    .sort((a, b) => displayName(a.user).localeCompare(displayName(b.user))), [users]);

  const otherHotelStaff = users.length - rows.length;

  const filtered = rows.filter(({ user, access }) => {
    if (roleFilter !== 'all' && access.role !== roleFilter) return false;
    if (statusFilter === 'active' && user.is_active === false) return false;
    if (statusFilter === 'inactive' && user.is_active !== false) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [displayName(user), user.username, user.email, user.phone ?? user.profile?.phone].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const replaceUser = (updated) => setUsers((prev) => {
    const exists = prev.some((u) => u.id === updated.id);
    return exists ? prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)) : [...prev, updated];
  });

  const handleSaved = (saved, isEdit) => {
    toast({ title: isEdit ? 'User updated' : 'User created', description: displayName(saved), status: 'success', duration: 3000 });
    // Re-read so the list shows exactly what the server stored
    load();
  };

  const askToggleActive = (user) => {
    const activate = user.is_active === false;
    setConfirm({
      title: activate ? `Reactivate ${displayName(user)}?` : `Deactivate ${displayName(user)}?`,
      message: activate
        ? 'They will be able to sign in again with their existing password.'
        : 'They will not be able to sign in. Their orders, payments and history stay as they are. You can reactivate them later.',
      confirmLabel: activate ? 'Reactivate' : 'Deactivate',
      danger: !activate,
      action: async () => {
        await userService.setActive(user.id, activate);
        replaceUser({ ...user, is_active: activate });
        toast({ title: activate ? 'User reactivated' : 'User deactivated', description: displayName(user), status: 'success', duration: 3000 });
      },
    });
  };

  const askDelete = (user) => setConfirm({
    title: `Delete ${displayName(user)}?`,
    message: 'This permanently removes the account. It cannot be undone. Deactivate instead if they may return or have any history.',
    confirmLabel: 'Delete permanently',
    danger: true,
    typeToConfirm: user.username,
    action: async () => {
      await userService.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast({ title: 'User deleted', description: displayName(user), status: 'success', duration: 3000 });
    },
  });

  const askTemporaryPassword = (user) => setConfirm({
    title: `Set a temporary password for ${displayName(user)}`,
    message: `Give this password to ${displayName(user)}. They must choose their own the next time they sign in, and any device they are signed in on is signed out.`,
    confirmLabel: 'Set password',
    newPassword: true,
    action: async (password) => {
      await userService.setTemporaryPassword(user.id, password);
      toast({ title: 'Temporary password set', description: `${displayName(user)} will choose a new one at sign-in.`, status: 'success', duration: 4000 });
    },
  });

  const sendReset = async (user) => {
    try {
      await userService.sendPasswordReset(user.email || user.username);
      toast({ title: 'Reset link requested', description: `If ${user.email} is valid, ${displayName(user)} will get an email to set a new password.`, status: 'success', duration: 5000, isClosable: true });
    } catch (error) {
      toast({ title: 'Could not send the reset link', description: describeApiError(error), status: 'error', duration: 6000, isClosable: true });
    }
  };

  return (
    <Box h="full" overflowY="auto" bg={pageBg}>
      <Box maxW="1200px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={3} mb={4}>
          <Box>
            <HStack spacing={2}>
              <Icon as={Users} boxSize={5} />
              <Text fontSize="xl" fontWeight="700">Users &amp; Roles</Text>
            </HStack>
            <Text fontSize="sm" color={muted}>Managers, Cashiers and Waiters for the POS.</Text>
          </Box>
          <HStack>
            <IconButton aria-label="Reload users" icon={<RefreshCw size={16} />} variant="outline" onClick={load} isLoading={loading} />
            <Button leftIcon={<UserPlus size={16} />} colorScheme="blue" onClick={() => setEditing('new')}>Add user</Button>
          </HStack>
        </Flex>

        <Flex gap={2} wrap="wrap" mb={3}>
          <InputGroup maxW="320px" size="sm">
            <InputLeftElement pointerEvents="none"><Search size={14} /></InputLeftElement>
            <Input placeholder="Search name, username, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} bg={panelBg} borderRadius="8px" aria-label="Search users" />
          </InputGroup>
          <Select size="sm" maxW="170px" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} bg={panelBg} borderRadius="8px" aria-label="Role">
            <option value="all">All roles</option>
            <option value="administrator">Administrators</option>
            <option value="manager">Managers</option>
            <option value="cashier">Cashiers</option>
            <option value="waiter">Waiters</option>
          </Select>
          <Select size="sm" maxW="150px" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} bg={panelBg} borderRadius="8px" aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
        </Flex>

        <Box bg={panelBg} border="1px solid" borderColor={lineColor} borderRadius="12px" overflowX="auto">
          {loading && <Center py={12}><Spinner /></Center>}
          {!loading && loadError && (
            <Center py={12}>
              <VStack>
                <Text color="red.500" fontWeight="600">Could not load users</Text>
                <Text fontSize="sm" color={muted}>{loadError}</Text>
                <Button size="sm" onClick={load}>Try again</Button>
              </VStack>
            </Center>
          )}
          {!loading && !loadError && filtered.length === 0 && (
            <Center py={12}>
              <VStack spacing={2}>
                <Text fontWeight="600">No users found</Text>
                <Text fontSize="sm" color={muted}>{rows.length ? 'No users match the filters.' : 'Add your first Manager, Cashier or Waiter.'}</Text>
              </VStack>
            </Center>
          )}
          {!loading && !loadError && filtered.length > 0 && (
            <Table size="sm" minW="820px">
              <Thead>
                <Tr>
                  <Th>Name</Th><Th>Role</Th><Th>Phone / email</Th><Th>Status</Th><Th>Last sign-in</Th><Th w="48px" />
                </Tr>
              </Thead>
              <Tbody>
                {filtered.map(({ user, access, managed }) => {
                  const isSelf = me && user.id === me.id;
                  const inactive = user.is_active === false;
                  const custom = Object.keys(access.overrides || {}).length;
                  return (
                    <Tr key={user.id} opacity={inactive ? 0.6 : 1}>
                      <Td>
                        <Text fontWeight="600">{displayName(user)}{isSelf ? ' (you)' : ''}</Text>
                        <Text fontSize="xs" color={muted}>{user.username}</Text>
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <Badge colorScheme={ROLE_COLORS[access.role]}>{access.roleLabel}</Badge>
                          {custom > 0 && <Badge variant="outline" colorScheme="purple">custom access</Badge>}
                        </HStack>
                      </Td>
                      <Td>
                        <Text fontSize="sm">{user.phone ?? user.profile?.phone ?? ''}</Text>
                        <Text fontSize="xs" color={muted}>{user.email}</Text>
                      </Td>
                      <Td><Badge colorScheme={inactive ? 'gray' : 'green'}>{inactive ? 'Inactive' : 'Active'}</Badge></Td>
                      <Td fontSize="sm" color={muted}>{access.role === 'waiter' ? 'No sign-in' : formatDate(user.last_login)}</Td>
                      <Td>
                        {managed && !isSelf ? (
                          <Menu placement="bottom-end">
                            <MenuButton as={IconButton} size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label={`Actions for ${displayName(user)}`} />
                            <MenuList fontSize="sm">
                              <MenuItem icon={<Pencil size={14} />} onClick={() => setEditing(user)}>Edit details &amp; access</MenuItem>
                              {access.role !== 'waiter' && IS_DESKOPOS && (
                                <MenuItem icon={<KeyRound size={14} />} onClick={() => askTemporaryPassword(user)}>
                                  Set a temporary password
                                </MenuItem>
                              )}
                              {access.role !== 'waiter' && !IS_DESKOPOS && (
                                <MenuItem icon={<KeyRound size={14} />} onClick={() => sendReset(user)} isDisabled={!user.email}>
                                  {user.email ? 'Send password reset link' : 'Password reset (needs an email)'}
                                </MenuItem>
                              )}
                              <MenuItem icon={<Power size={14} />} onClick={() => askToggleActive(user)}>{inactive ? 'Reactivate' : 'Deactivate'}</MenuItem>
                              <MenuDivider />
                              <MenuItem icon={<Trash2 size={14} />} color="red.500" onClick={() => askDelete(user)}
                                isDisabled={!!user.last_login}>
                                {user.last_login ? 'Delete (has signed in; deactivate instead)' : 'Delete'}
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        ) : (
                          <Text fontSize="xs" color={muted}>{isSelf ? '' : (IS_DESKOPOS ? 'Administrator' : 'Hotel admin')}</Text>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </Box>

        {!loading && !loadError && otherHotelStaff > 0 && (
          <Text fontSize="xs" color={muted} mt={3}>
            {otherHotelStaff} other hotel account(s) (front desk, housekeeping, …) are not managed here. If they sign in to the POS they get Manager access (hotel managers) or Cashier access (everyone else).
          </Text>
        )}
      </Box>

      <UserFormDialog
        isOpen={!!editing}
        user={editing && editing !== 'new' ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </Box>
  );
};

export default UsersView;
