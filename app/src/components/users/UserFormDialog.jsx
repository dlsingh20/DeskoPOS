import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { useModal } from '../../hooks/useModal';
import { IS_DESKOPOS } from '../../services/backend';
import userService, { describeApiError } from '../../services/UserService';
import {
  DEPARTMENT_MAX_LENGTH,
  MANAGED_ROLES,
  PERMISSIONS,
  POS_ROLES,
  ROLE_DEFAULTS,
  CASHIER_DISCOUNT_LIMIT,
  encodeDepartment,
  resolveAccess,
} from '../../utils/posAccess';

const ROLE_HELP = {
  manager: 'Full POS access: billing, discounts, history, reports and setup. Cannot manage users.',
  cashier: `Orders, billing and printing. Discounts up to ${CASHIER_DISCOUNT_LIMIT}%, Credit Pay and removing items sent to the kitchen need a manager's approval. History from the last cash counter close, today only.`,
  waiter: 'Cannot sign in yet. Used as the server on orders and for tips. A waiter order console will come later.',
};

// DeskoPOS login IDs are unique across every AppDesko client
const LOGIN_ID_RE = IS_DESKOPOS ? /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/ : /^[\w.@+-]{3,150}$/;
const LOGIN_ID_HELP = IS_DESKOPOS
  ? '3 to 60 letters, digits, dots, dashes or underscores, starting with a letter or digit.'
  : 'Use 3 to 150 letters, digits or @ . + - _ (no spaces).';

const EMPTY = { firstName: '', lastName: '', username: '', email: '', phone: '', role: 'cashier', password: '', confirmPassword: '', overrides: {} };

const formFromUser = (user) => {
  const access = resolveAccess(user);
  const parsed = MANAGED_ROLES.includes(access?.role) ? access : null;
  return {
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username || '',
    email: user.email || '',
    phone: user.phone ?? user.profile?.phone ?? '',
    role: parsed?.role || 'cashier',
    password: '',
    confirmPassword: '',
    overrides: parsed?.overrides || {},
  };
};

/**
 * Create or edit a POS user (Manager, Cashier or Waiter) and their access.
 * Calls onSaved(user) after the server confirms.
 */
const UserFormDialog = ({ isOpen, onClose, user, onSaved }) => {
  useModal(isOpen, 'UserFormDialog');
  const isEdit = !!user;
  const [form, setForm] = useState(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const cardBorder = useColorModeValue('gray.200', 'gray.600');
  const cardActive = useColorModeValue('blue.50', 'whiteAlpha.100');
  const muted = useColorModeValue('gray.500', 'gray.400');

  useEffect(() => {
    if (!isOpen) return;
    setForm(user ? formFromUser(user) : EMPTY);
    setShowErrors(false);
    setError(null);
  }, [isOpen, user]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const role = POS_ROLES[form.role];
  const defaults = useMemo(() => new Set(ROLE_DEFAULTS[form.role]), [form.role]);
  const effective = (key) => (key in form.overrides ? form.overrides[key] : defaults.has(key));
  const customCount = Object.entries(form.overrides).filter(([key, value]) => value !== defaults.has(key)).length;

  const togglePermission = (key) => setForm((prev) => {
    const next = { ...prev.overrides };
    const value = !(key in next ? next[key] : defaults.has(key));
    if (value === defaults.has(key)) delete next[key];
    else next[key] = value;
    return { ...prev, overrides: next };
  });

  let department = '';
  try {
    department = encodeDepartment(form.role, form.overrides);
  } catch (e) {
    department = '';
  }

  const errors = {
    firstName: !form.firstName.trim() ? 'Enter a first name.' : null,
    username: !isEdit && !LOGIN_ID_RE.test(form.username.trim()) ? LOGIN_ID_HELP : null,
    email: form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? 'Enter a valid email address.'
      : IS_DESKOPOS && form.role === 'manager' && !form.email.trim() ? 'Managers need an email for their sign-in code.' : null,
    password: !isEdit && role.canLogin && (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
      ? 'At least 8 characters, with letters and numbers.' : null,
    confirmPassword: !isEdit && role.canLogin && form.password !== form.confirmPassword ? 'Passwords do not match.' : null,
    access: !IS_DESKOPOS && department.length > DEPARTMENT_MAX_LENGTH ? 'Too many access changes to store. Reset some to the role defaults.' : null,
  };
  const isValid = !Object.values(errors).some(Boolean);
  const shown = (key) => (showErrors ? errors[key] : null);

  const save = async () => {
    setShowErrors(true);
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit ? await userService.updateUser(user.id, form) : await userService.createUser(form);
      onSaved(saved, isEdit);
      onClose();
    } catch (err) {
      setError(describeApiError(err, isEdit ? 'Could not save the changes.' : 'Could not create the user.'));
    } finally {
      setSaving(false);
    }
  };

  const groups = PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.group]: [...(acc[p.group] || []), p] }), {});

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} size="2xl" scrollBehavior="inside" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent borderRadius="16px" mx={4}>
        <ModalHeader>{isEdit ? `Edit ${user.first_name || user.username}` : 'Add user'}</ModalHeader>
        <ModalCloseButton isDisabled={saving} />
        <ModalBody>
          <VStack align="stretch" spacing={5}>
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>Role</Text>
              <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={2} role="radiogroup" aria-label="Role">
                {MANAGED_ROLES.map((key) => {
                  const active = form.role === key;
                  return (
                    <Box key={key} as="button" type="button" role="radio" aria-checked={active} textAlign="left" p={3}
                      borderRadius="10px" border="2px solid" borderColor={active ? 'blue.500' : cardBorder} bg={active ? cardActive : 'transparent'}
                      onClick={() => setForm((prev) => ({ ...prev, role: key, overrides: {} }))}>
                      <Text fontWeight="700">{POS_ROLES[key].label}</Text>
                      {!POS_ROLES[key].canLogin && <Badge mt={1} fontSize="2xs">No sign-in</Badge>}
                    </Box>
                  );
                })}
              </SimpleGrid>
              <Text fontSize="xs" color={muted} mt={2}>{ROLE_HELP[form.role]}</Text>
            </Box>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl isRequired isInvalid={!!shown('firstName')}>
                <FormLabel fontSize="sm">First name</FormLabel>
                <Input value={form.firstName} onChange={set('firstName')} maxLength={150} />
                <FormErrorMessage>{errors.firstName}</FormErrorMessage>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Last name</FormLabel>
                <Input value={form.lastName} onChange={set('lastName')} maxLength={150} />
              </FormControl>
              <FormControl isRequired={!isEdit} isInvalid={!!shown('username')}>
                <FormLabel fontSize="sm">{IS_DESKOPOS ? 'Login ID' : 'Username'}</FormLabel>
                <Input value={form.username} onChange={set('username')} maxLength={150} isReadOnly={isEdit} autoComplete="off" />
                {isEdit
                  ? <FormHelperText fontSize="xs">{IS_DESKOPOS ? "Login IDs can't be changed here." : "Usernames can't be changed."}</FormHelperText>
                  : <FormErrorMessage>{errors.username}</FormErrorMessage>}
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Phone</FormLabel>
                <Input value={form.phone} onChange={set('phone')} maxLength={30} />
              </FormControl>
              <FormControl isInvalid={!!shown('email')} gridColumn={{ md: 'span 2' }}>
                <FormLabel fontSize="sm">Email</FormLabel>
                <Input type="email" value={form.email} onChange={set('email')} maxLength={254} />
                {errors.email ? <FormErrorMessage>{errors.email}</FormErrorMessage> : <FormHelperText fontSize="xs">{IS_DESKOPOS ? 'Managers get their sign-in code here. Optional for others.' : 'Needed to send password reset links.'}</FormHelperText>}
              </FormControl>
              {!isEdit && role.canLogin && (
                <>
                  <FormControl isRequired isInvalid={!!shown('password')}>
                    <FormLabel fontSize="sm">Password</FormLabel>
                    <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                    <FormErrorMessage>{errors.password}</FormErrorMessage>
                  </FormControl>
                  <FormControl isRequired isInvalid={!!shown('confirmPassword')}>
                    <FormLabel fontSize="sm">Confirm password</FormLabel>
                    <Input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
                    <FormErrorMessage>{errors.confirmPassword}</FormErrorMessage>
                  </FormControl>
                </>
              )}
            </SimpleGrid>

            {role.canLogin && (
              <Box>
                <Divider mb={4} />
                <Flex justify="space-between" align="center" mb={2}>
                  <HStack>
                    <Text fontSize="sm" fontWeight="600">Access</Text>
                    {customCount > 0 && <Badge colorScheme="purple">{customCount} custom</Badge>}
                  </HStack>
                  <Button size="xs" variant="ghost" onClick={() => setForm((prev) => ({ ...prev, overrides: {} }))} isDisabled={customCount === 0}>
                    Reset to {role.label} defaults
                  </Button>
                </Flex>
                <VStack align="stretch" spacing={3}>
                  {Object.entries(groups).map(([group, items]) => (
                    <Box key={group}>
                      <Text fontSize="xs" fontWeight="700" color={muted} textTransform="uppercase" mb={1}>{group}</Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={1}>
                        {items.map((p) => {
                          const changed = effective(p.key) !== defaults.has(p.key);
                          return (
                            <Checkbox key={p.key} isChecked={effective(p.key)} onChange={() => togglePermission(p.key)}>
                              <Text as="span" fontSize="sm" fontWeight={changed ? '700' : '400'}>{p.label}</Text>
                              {!effective(p.key) && p.approvable && <Text as="span" fontSize="xs" color={muted}> (with approval)</Text>}
                            </Checkbox>
                          );
                        })}
                      </SimpleGrid>
                    </Box>
                  ))}
                  <Text fontSize="xs" color={muted}>Managing users is for Administrators only and can't be granted here.</Text>
                </VStack>
                {errors.access && <Text fontSize="sm" color="red.500" mt={2}>{errors.access}</Text>}
              </Box>
            )}

            {error && (
              <Alert status="error" borderRadius="10px" fontSize="sm"><AlertIcon /><AlertDescription>{error}</AlertDescription></Alert>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} isDisabled={saving}>Cancel</Button>
          <Button colorScheme="blue" onClick={save} isLoading={saving} loadingText="Saving">{isEdit ? 'Save changes' : 'Create user'}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default UserFormDialog;
