import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Center,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { ShieldCheck } from 'lucide-react';
import userService from '../services/UserService';
import { IS_DESKOPOS } from '../services/backend';
import ChangePasswordScreen from '../components/auth/ChangePasswordScreen';
import { PERMISSIONS, displayName, resolveAccess } from '../utils/posAccess';

const AccessContext = createContext(null);

/**
 * Manager approval: a Manager or Administrator types their username and password or PIN on this device.
 * The server checks them (POST /api/pos/api/approvals/) and returns a single-use approval id; nothing is stored.
 */
const ApprovalDialog = ({ request, onDone }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const usernameRef = useRef(null);

  useEffect(() => {
    setUsername('');
    setPassword('');
    setError(null);
  }, [request]);

  if (!request) return null;
  const permissionLabel = PERMISSIONS.find((p) => p.key === request.permission)?.label;

  const submit = async (event) => {
    event?.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter the manager\'s username and password or PIN.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const approver = await userService.requestApproval({
        username: username.trim(),
        secret: password,
        permission: request.permission,
        orderId: request.orderId ?? null,
        context: request.context || {},
      });
      onDone(approver);
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !checking && onDone(null)} isCentered size="sm" initialFocusRef={usernameRef} closeOnOverlayClick={!checking}>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit} borderRadius="16px" mx={4}>
        <ModalHeader display="flex" alignItems="center" gap={2}>
          <ShieldCheck size={20} /> Manager approval
        </ModalHeader>
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <Box>
              <Text fontWeight="600">{request.title}</Text>
              {request.detail && <Text fontSize="sm" color="gray.500">{request.detail}</Text>}
              {permissionLabel && <Text fontSize="xs" color="gray.500" mt={1}>Needs: {permissionLabel}</Text>}
            </Box>
            <FormControl>
              <FormLabel fontSize="sm">Manager username</FormLabel>
              <Input ref={usernameRef} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Password or PIN</FormLabel>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </FormControl>
            {error && (
              <Alert status="error" borderRadius="8px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={() => onDone(null)} isDisabled={checking}>Cancel</Button>
          <Button type="submit" colorScheme="blue" isLoading={checking} loadingText="Checking">Approve</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/**
 * Loads the signed-in user and exposes their POS role and permissions.
 * Waiters (and deactivated users) get a "can't sign in" screen.
 */
export const AccessProvider = ({ children, onLogout }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [approval, setApproval] = useState(null);
  const resolverRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setUser(await userService.getMe());
    } catch (error) {
      setLoadError(error.message || 'Could not load your account.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const access = useMemo(() => resolveAccess(user), [user]);
  const can = useCallback((permission) => !!access?.permissions.has(permission), [access]);

  /**
   * Resolves with the approver ({id, name, username, approvalId}) once a Manager approves, or null if cancelled.
   * Resolves immediately with the current user (approvalId null) when they already have the permission.
   */
  const requestApproval = useCallback(({ permission, title, detail, orderId = null, context = {} }) => {
    if (can(permission)) return Promise.resolve({ id: user.id, name: displayName(user), username: user.username, self: true, approvalId: null });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setApproval({ permission, title, detail, orderId, context });
    });
  }, [can, user]);

  const finishApproval = (approver) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setApproval(null);
    resolve?.(approver);
  };

  const value = useMemo(() => ({
    user, access, can, requestApproval, reload: load, userName: displayName(user),
  }), [user, access, can, requestApproval, load]);

  if (loading) {
    return <Center h="100vh"><Spinner size="lg" /></Center>;
  }
  if (loadError) {
    return (
      <Center h="100vh" px={4}>
        <VStack spacing={3} textAlign="center">
          <Text fontWeight="700">Could not load your account</Text>
          <Text fontSize="sm" color="gray.500">{loadError}</Text>
          <Button onClick={load}>Try again</Button>
          <Button variant="ghost" onClick={onLogout}>Sign out</Button>
        </VStack>
      </Center>
    );
  }
  if (IS_DESKOPOS && user?.must_change_password) {
    // Restaurants and settings were refused until now: start the app again with the new password
    return <ChangePasswordScreen user={user} onChanged={() => window.location.reload()} onLogout={onLogout} />;
  }
  if (access && !access.canLogin) {
    return (
      <Center h="100vh" px={4}>
        <VStack spacing={3} textAlign="center" maxW="420px">
          <Text fontWeight="700" fontSize="lg">This account can't sign in to the POS</Text>
          <Text fontSize="sm" color="gray.500">
            {access.role === 'waiter'
              ? 'Waiter accounts are used for order and tip attribution. Waiters will sign in to their own order console later.'
              : 'This account is deactivated. Ask an Administrator.'}
          </Text>
          <Button onClick={onLogout}>Sign out</Button>
        </VStack>
      </Center>
    );
  }

  return (
    <AccessContext.Provider value={value}>
      {children}
      <ApprovalDialog request={approval} onDone={finishApproval} />
    </AccessContext.Provider>
  );
};

export const useAccess = () => {
  const context = useContext(AccessContext);
  if (!context) throw new Error('useAccess must be used inside AccessProvider');
  return context;
};

/** Renders children only with the permission; otherwise a "No access" message */
export const RequirePermission = ({ permission, children }) => {
  const { can, access } = useAccess();
  if (can(permission)) return children;
  return (
    <Center h="full" px={4}>
      <VStack spacing={2} textAlign="center">
        <ShieldCheck size={32} />
        <Text fontWeight="700">No access</Text>
        <Text fontSize="sm" color="gray.500">Your role ({access?.roleLabel}) can't open this page. Ask an Administrator if you need it.</Text>
      </VStack>
    </Center>
  );
};
