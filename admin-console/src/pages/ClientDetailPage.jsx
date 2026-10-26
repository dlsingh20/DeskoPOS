import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Badge, Box, Button, Center, Code, Flex, FormControl, FormErrorMessage, FormHelperText, FormLabel,
  Grid, Heading, HStack, IconButton, Input, InputGroup, InputRightElement, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select, SimpleGrid, Spinner, Stack, Table, Tbody, Td, Text,
  Textarea, Th, Thead, Tr, useToast,
} from '@chakra-ui/react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { canManage, platform } from '../api';
import { useAuth } from '../auth';
import StatusBadge, { STATUS } from '../components/StatusBadge';
import { EMAIL_RE, formatDate, generatePassword } from '../format';

const ACTIONS = {
  activate: {
    label: 'Activate', color: 'green', from: ['pending', 'suspended'],
    text: 'Their staff can sign in and use the POS again.',
  },
  suspend: {
    label: 'Deactivate', color: 'red', from: ['active'], needsReason: true,
    text: 'Everyone at this client is signed out immediately and nobody can sign in until you activate it again. Their data is kept.',
  },
  close: {
    label: 'Close account', color: 'gray', from: ['pending', 'active', 'suspended'],
    text: 'Permanent: a closed client can\'t be reopened. Their data is kept for records.',
  },
};

function StatusModal({ action, tenant, onClose, onDone }) {
  const a = ACTIONS[action];
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      onDone(await platform.setStatus(tenant.id, action, reason.trim()));
    } catch (err) {
      setError(err.fields?.reason?.join?.(' ') || err.message);
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>{a.label} {tenant.name}?</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text mb={4}>{a.text}</Text>
          {error && <Alert status="error" borderRadius="md" mb={3}><AlertIcon />{error}</Alert>}
          <FormControl isRequired={a.needsReason}>
            <FormLabel>Reason</FormLabel>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
              placeholder={a.needsReason ? 'e.g. Subscription unpaid' : 'Optional'} />
            <FormHelperText>Kept in the client's history.</FormHelperText>
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" colorScheme="gray" onClick={onClose}>Cancel</Button>
          <Button colorScheme={a.color} onClick={confirm} isLoading={busy} isDisabled={a.needsReason && !reason.trim()}>
            {a.label}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function ResetPasswordModal({ tenant, admin, onClose }) {
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const reset = async () => {
    setBusy(true);
    setError('');
    try {
      await platform.resetAdminPassword(tenant.id, admin.login_id, password);
      setDone(true);
    } catch (err) {
      setError(err.fields?.new_password?.join?.(' ') || err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Reset password for {admin.login_id}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {done ? (
            <Stack>
              <Text>Done. Send the new password to the client; they must change it at sign-in. Their other sessions were signed out.</Text>
              <Code p={2} fontSize="lg">{password}</Code>
            </Stack>
          ) : (
            <>
              {error && <Alert status="error" borderRadius="md" mb={3}><AlertIcon />{error}</Alert>}
              <FormControl isInvalid={password.length > 0 && password.length < 8}>
                <FormLabel>New temporary password</FormLabel>
                <InputGroup>
                  <Input fontFamily="mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <InputRightElement>
                    <IconButton size="sm" variant="ghost" aria-label="New password" icon={<RefreshCw size={16} />}
                      onClick={() => setPassword(generatePassword())} />
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage>At least 8 characters.</FormErrorMessage>
              </FormControl>
            </>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          {done ? <Button onClick={onClose}>Close</Button> : (
            <>
              <Button variant="ghost" colorScheme="gray" onClick={onClose}>Cancel</Button>
              <Button onClick={reset} isLoading={busy} isDisabled={password.length < 8}>Reset password</Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

const EDITABLE = ['name', 'plan', 'contact_name', 'contact_email', 'contact_phone', 'tax_reg_number', 'billing_address'];

function EditModal({ tenant, onClose, onDone }) {
  const [form, setForm] = useState(() => Object.fromEntries(EDITABLE.map((k) => [k, tenant[k] ?? ''])));
  const [plans, setPlans] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { platform.plans().then(setPlans).catch(() => {}); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Enter the business name.';
    if (form.contact_email && !EMAIL_RE.test(form.contact_email.trim())) errs.contact_email = 'Enter a valid email.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError('');
    try {
      const changed = Object.fromEntries(EDITABLE.filter((k) => form[k] !== (tenant[k] ?? '')).map((k) => [k, form[k].trim() || (k === 'plan' ? null : '')]));
      onDone(Object.keys(changed).length ? await platform.updateTenant(tenant.id, changed) : null);
    } catch (err) {
      setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, [].concat(v).join(' ')])));
      setError(err.message);
      setBusy(false);
    }
  };
  const field = (k, label, props) => (
    <FormControl isInvalid={!!errors[k]}>
      <FormLabel>{label}</FormLabel>
      <Input value={form[k]} onChange={set(k)} {...props} />
      <FormErrorMessage>{errors[k]}</FormErrorMessage>
    </FormControl>
  );
  return (
    <Modal isOpen onClose={onClose} isCentered size="xl">
      <ModalOverlay />
      <ModalContent mx={4}>
        <ModalHeader>Edit {tenant.name}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {error && <Alert status="error" borderRadius="md" mb={3}><AlertIcon />{error}</Alert>}
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {field('name', 'Business name')}
            <FormControl>
              <FormLabel>Plan</FormLabel>
              <Select value={form.plan} onChange={set('plan')}>
                <option value="">No plan</option>
                {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </Select>
            </FormControl>
            {field('contact_name', 'Contact name')}
            {field('contact_email', 'Contact email', { type: 'email' })}
            {field('contact_phone', 'Contact phone', { type: 'tel' })}
            {field('tax_reg_number', 'Tax registration no.')}
          </SimpleGrid>
          <FormControl mt={4}>
            <FormLabel>Billing address</FormLabel>
            <Textarea value={form.billing_address} onChange={set('billing_address')} />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" colorScheme="gray" onClick={onClose}>Cancel</Button>
          <Button onClick={save} isLoading={busy}>Save</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

const Info = ({ label, children }) => (
  <Box>
    <Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="wide">{label}</Text>
    <Text>{children || '—'}</Text>
  </Box>
);

export default function ClientDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    platform.tenant(id).then((t) => { setTenant(t); setError(''); })
      .catch((err) => setError(err.status === 404 ? `There's no client ${id}.` : err.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <Alert status="error" borderRadius="md"><AlertIcon />{error}</Alert>;
  if (!tenant) return <Center py={16}><Spinner /></Center>;

  const manage = canManage(user);
  const closeModal = () => setModal(null);
  const afterStatus = (updated) => {
    closeModal();
    toast({ status: 'success', title: `${updated.name} is now ${STATUS[updated.status].label.toLowerCase()}` });
    load();
  };

  return (
    <Box>
      <Button as={RouterLink} to="/clients" variant="link" colorScheme="gray" leftIcon={<ArrowLeft size={16} />} mb={4}>
        All clients
      </Button>
      <Flex align="center" gap={3} mb={6} wrap="wrap">
        <Box flex="1">
          <HStack><Heading size="lg">{tenant.name}</Heading><StatusBadge status={tenant.status} /></HStack>
          <Text color="gray.600">Client ID <b>{tenant.id}</b></Text>
        </Box>
        {manage && (
          <HStack wrap="wrap">
            {tenant.status !== 'closed' && <Button variant="outline" onClick={() => setModal({ type: 'edit' })}>Edit</Button>}
            {Object.entries(ACTIONS).filter(([, a]) => a.from.includes(tenant.status)).map(([key, a]) => (
              <Button key={key} colorScheme={a.color} variant={key === 'close' ? 'ghost' : 'solid'}
                onClick={() => setModal({ type: 'status', action: key })}>{a.label}</Button>
            ))}
          </HStack>
        )}
      </Flex>

      {tenant.status === 'pending' && (
        <Alert status="warning" borderRadius="md" mb={4}><AlertIcon />Not activated yet: nobody at this client can sign in.</Alert>
      )}
      {tenant.status === 'suspended' && (
        <Alert status="error" borderRadius="md" mb={4}><AlertIcon />
          Deactivated {formatDate(tenant.suspended_at)}{tenant.suspended_reason ? `: ${tenant.suspended_reason}` : ''}
        </Alert>
      )}

      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={4}>
        <Stack spacing={4}>
          <Box bg="white" borderWidth="1px" borderRadius="lg" p={5}>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
              <Info label="Type"><Text as="span" textTransform="capitalize">{tenant.business_type.replace('_', ' ')}</Text></Info>
              <Info label="Country">{tenant.country}</Info>
              <Info label="Currency">{tenant.currency}</Info>
              <Info label="Time zone">{tenant.timezone}</Info>
              <Info label="Plan"><Text as="span" textTransform="capitalize">{tenant.plan}</Text></Info>
              <Info label="Login prefix">{tenant.login_prefix}</Info>
              <Info label="Outlets">{tenant.outlets}</Info>
              <Info label="Active users">{tenant.users}</Info>
              <Info label="Tax reg. no.">{tenant.tax_reg_number}</Info>
              <Info label="Contact">{tenant.contact_name}</Info>
              <Info label="Contact email">{tenant.contact_email}</Info>
              <Info label="Contact phone">{tenant.contact_phone}</Info>
              <Info label="Created">{formatDate(tenant.created_at)}</Info>
              <Info label="Activated">{formatDate(tenant.activated_at)}</Info>
            </SimpleGrid>
          </Box>

          <Box bg="white" borderWidth="1px" borderRadius="lg" overflowX="auto">
            <Heading size="sm" p={4} pb={2}>Administrators</Heading>
            <Table size="sm">
              <Thead><Tr><Th>Login ID</Th><Th>Email</Th><Th>Last sign-in</Th><Th /></Tr></Thead>
              <Tbody>
                {tenant.administrators.map((a) => (
                  <Tr key={a.id}>
                    <Td fontWeight="semibold">
                      {a.login_id} {!a.is_active && <Badge ml={1}>inactive</Badge>}
                      {a.must_change_password && <Badge ml={1} colorScheme="yellow">temporary password</Badge>}
                    </Td>
                    <Td>{a.email || '—'}</Td>
                    <Td whiteSpace="nowrap">{a.last_login_at ? formatDate(a.last_login_at) : 'Never'}</Td>
                    <Td textAlign="right">
                      {manage && tenant.status !== 'closed' && (
                        <Button size="xs" variant="outline" onClick={() => setModal({ type: 'reset', admin: a })}>Reset password</Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Stack>

        <Box bg="white" borderWidth="1px" borderRadius="lg" p={5} alignSelf="start">
          <Heading size="sm" mb={3}>Status history</Heading>
          <Stack spacing={3}>
            {[...tenant.status_history].reverse().map((h, i) => (
              <Box key={i} borderLeftWidth="3px" borderColor={`${STATUS[h.to_status]?.color || 'gray'}.400`} pl={3}>
                <StatusBadge status={h.to_status} />
                <Text fontSize="sm" color="gray.600">{formatDate(h.changed_at)}</Text>
                {h.reason && <Text fontSize="sm">{h.reason}</Text>}
              </Box>
            ))}
          </Stack>
          <Button as={RouterLink} to={`/activity?client=${tenant.id}`} size="sm" variant="link" mt={4}>See all activity</Button>
        </Box>
      </Grid>

      {modal?.type === 'status' && <StatusModal action={modal.action} tenant={tenant} onClose={closeModal} onDone={afterStatus} />}
      {modal?.type === 'reset' && <ResetPasswordModal tenant={tenant} admin={modal.admin} onClose={() => { closeModal(); load(); }} />}
      {modal?.type === 'edit' && (
        <EditModal tenant={tenant} onClose={closeModal} onDone={(updated) => {
          closeModal();
          if (updated) { toast({ status: 'success', title: 'Saved' }); load(); }
        }} />
      )}
    </Box>
  );
}
