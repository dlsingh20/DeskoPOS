import React, { useEffect, useState } from 'react';
import {
  Alert, AlertDescription, AlertIcon, AlertTitle, Badge, Box, Button, FormControl, FormHelperText, FormLabel, Input,
  ListItem, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select,
  SimpleGrid, Stat, StatLabel, StatNumber, Table, Tbody, Td, Text, Th, Thead, Tr, UnorderedList, useToast,
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { platform } from '../api';

const ROLE_LABEL = { administrator: 'Administrator', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter' };

/**
 * Create a restaurant from an onboarding form (formId) or from its JSON export (chosen here).
 * Steps: choose -> preview (nothing written yet) -> done (temporary passwords, shown once).
 */
export default function ImportRestaurantModal({ formId, onClose, onCreated }) {
  const toast = useToast();
  const [step, setStep] = useState('choose');
  const [payload, setPayload] = useState(null);
  const [fileName, setFileName] = useState('');
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState('');
  const [prefix, setPrefix] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    platform.plans().then((list) => setPlans((list.results || list).filter((p) => p.is_active !== false))).catch(() => {});
  }, []);

  const body = () => ({ ...(formId ? { form_id: formId } : { payload }), plan: plan || undefined,
    login_prefix: prefix.trim() || undefined });

  const chooseFile = async (e) => {
    const file = e.target.files[0];
    setError('');
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.schema !== 'deskopos.irf/1') throw new Error('not an export');
      setPayload(parsed);
      setFileName(file.name);
    } catch {
      setPayload(null);
      setFileName('');
      setError('This file is not an onboarding form export. Choose the JSON downloaded from an onboarding form.');
    }
  };

  const check = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(await platform.importPreview(body()));
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await platform.importRestaurant(body());
      setResult(r);
      setStep('done');
      onCreated?.(r.tenant);
    } catch (err) {
      setError(err.status === 400 && err.body?.problems ? 'The restaurant cannot be created yet.' : err.message);
      if (err.body?.problems) setPreview((p) => ({ ...p, problems: err.body.problems }));
    } finally {
      setBusy(false);
    }
  };

  const copyCredentials = async () => {
    const lines = result.credentials.filter((c) => c.password)
      .map((c) => `${c.name} (${ROLE_LABEL[c.role]}) - login ID: ${c.login_id} - temporary password: ${c.password}`);
    try {
      await navigator.clipboard.writeText([`${result.tenant.name} (Client ID ${result.tenant.id})`, ...lines].join('\n'));
      toast({ status: 'success', title: 'Sign-in details copied', duration: 2000 });
    } catch {
      toast({ status: 'warning', title: 'Copy them from the table' });
    }
  };

  const blocked = preview?.problems?.length > 0;

  return (
    <Modal isOpen onClose={step === 'done' ? onClose : busy ? () => {} : onClose} size={{ base: 'full', md: '3xl' }}
      scrollBehavior="inside" closeOnOverlayClick={step !== 'done'}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {step === 'done' ? 'Restaurant created' : 'Create restaurant from onboarding form'}
        </ModalHeader>
        {step !== 'done' && <ModalCloseButton isDisabled={busy} />}
        <ModalBody>
          {error && <Alert status="error" mb={4} borderRadius="md"><AlertIcon />{error}</Alert>}

          {step === 'choose' && (
            <>
              {!formId && (
                <FormControl isRequired mb={4}>
                  <FormLabel>Form export (JSON)</FormLabel>
                  <Input type="file" accept=".json,application/json" onChange={chooseFile} p={1} aria-label="Form export (JSON)" />
                  <FormHelperText>
                    {fileName ? `${fileName}: ${payload.title || payload.data?.business?.name || ''}` : 'The JSON downloaded from an onboarding form. You may have edited it.'}
                  </FormHelperText>
                </FormControl>
              )}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>Plan</FormLabel>
                  <Select value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="No plan yet">
                    {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>Login prefix (optional)</FormLabel>
                  <Input value={prefix} onChange={(e) => setPrefix(e.target.value.toLowerCase())} placeholder="e.g. sg" maxLength={12} />
                  <FormHelperText>Used for login IDs we make up for staff, e.g. sg_vikram.</FormHelperText>
                </FormControl>
              </SimpleGrid>
              <Text fontSize="sm" color="gray.500" mt={4}>
                The next step shows what will be created. Nothing is created until you confirm.
              </Text>
            </>
          )}

          {step === 'preview' && preview && <Preview preview={preview} />}

          {step === 'done' && result && (
            <>
              <Alert status="success" borderRadius="md" mb={4}>
                <AlertIcon />
                <Box>
                  <AlertTitle>{result.tenant.name} is Client ID {result.tenant.id}</AlertTitle>
                  <AlertDescription fontSize="sm">
                    It starts as Pending. Activate it on the client page when they are ready to go live.
                  </AlertDescription>
                </Box>
              </Alert>
              <Alert status="warning" borderRadius="md" mb={3} fontSize="sm">
                <AlertIcon />
                Copy these temporary passwords now: they are not shown again. Everyone sets their own at first sign-in.
              </Alert>
              <Box overflowX="auto" borderWidth="1px" borderRadius="md">
                <Table size="sm">
                  <Thead><Tr><Th>Name</Th><Th>Role</Th><Th>Login ID</Th><Th>Temporary password</Th></Tr></Thead>
                  <Tbody>
                    {result.credentials.map((c) => (
                      <Tr key={c.login_id}>
                        <Td>{c.name}</Td>
                        <Td>{ROLE_LABEL[c.role]}</Td>
                        <Td fontFamily="mono">{c.login_id}</Td>
                        <Td fontFamily="mono">{c.password || <Text as="span" color="gray.500" fontFamily="body">Does not sign in</Text>}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
              {result.summary.warnings.length > 0 && <Warnings warnings={result.summary.warnings} title="To follow up" />}
            </>
          )}
        </ModalBody>
        <ModalFooter gap={2} flexWrap="wrap">
          {step === 'choose' && (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={check} isLoading={busy} isDisabled={!formId && !payload}>Check</Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => setStep('choose')} isDisabled={busy}>Back</Button>
              <Button colorScheme="green" onClick={create} isLoading={busy} isDisabled={blocked}
                loadingText="Creating…">Create restaurant</Button>
            </>
          )}
          {step === 'done' && (
            <>
              <Button variant="outline" leftIcon={<Copy size={16} />} onClick={copyCredentials}>Copy sign-in details</Button>
              <Button as={RouterLink} to={`/clients/${result.tenant.id}`} onClick={onClose}>Open client</Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function Preview({ preview }) {
  const { business, outlets, taxes, people, payment_methods: methods, menu, problems, warnings } = preview;
  const tables = outlets.reduce((n, o) => n + o.tables, 0);
  return (
    <>
      {problems.length > 0 && (
        <Alert status="error" borderRadius="md" mb={4} alignItems="flex-start">
          <AlertIcon />
          <Box>
            <AlertTitle>Fix these first</AlertTitle>
            <AlertDescription>
              <UnorderedList fontSize="sm">{problems.map((p) => <ListItem key={p}>{p}</ListItem>)}</UnorderedList>
              <Text fontSize="sm" mt={1}>Change the answers on the form (Edit answers), or in the JSON, then check again.</Text>
            </AlertDescription>
          </Box>
        </Alert>
      )}
      <Text fontSize="xl" fontWeight="bold">{business.name}</Text>
      <Text color="gray.600" mb={4}>{[business.type, business.country, business.currency].filter(Boolean).join(' · ')}</Text>

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={4}>
        <Stat borderWidth="1px" borderRadius="md" p={3}><StatLabel>Outlets</StatLabel><StatNumber>{outlets.length}</StatNumber></Stat>
        <Stat borderWidth="1px" borderRadius="md" p={3}><StatLabel>Tables</StatLabel><StatNumber>{tables}</StatNumber></Stat>
        <Stat borderWidth="1px" borderRadius="md" p={3}><StatLabel>People</StatLabel><StatNumber>{people.length}</StatNumber></Stat>
        <Stat borderWidth="1px" borderRadius="md" p={3}><StatLabel>Menu items</StatLabel><StatNumber>{menu?.items ?? 0}</StatNumber></Stat>
      </SimpleGrid>

      <Text fontWeight="semibold" mb={1}>Outlets</Text>
      <UnorderedList mb={4} fontSize="sm">
        {outlets.map((o) => <ListItem key={o.name}>{o.name}: {o.tables} tables, {o.cash_counters} cash {o.cash_counters === 1 ? 'counter' : 'counters'}</ListItem>)}
      </UnorderedList>

      <Text fontWeight="semibold" mb={1}>People</Text>
      <Box overflowX="auto" borderWidth="1px" borderRadius="md" mb={4}>
        <Table size="sm">
          <Thead><Tr><Th>Name</Th><Th>Role</Th><Th>Login ID</Th></Tr></Thead>
          <Tbody>
            {people.map((p) => (
              <Tr key={p.login_id}>
                <Td>{p.name}</Td>
                <Td>{ROLE_LABEL[p.role]}{!p.can_login && <Text as="span" color="gray.500"> (no sign-in)</Text>}</Td>
                <Td fontFamily="mono">{p.login_id} {p.generated && <Badge ml={1} colorScheme="purple">made up</Badge>}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4} fontSize="sm">
        <Box>
          <Text fontWeight="semibold" fontSize="md" mb={1}>Taxes</Text>
          {taxes.length ? taxes.map((t) => (
            <Text key={t.name}>
              {t.name} {t.rate}%
              {t.dine_in_only && <Badge ml={2} colorScheme="blue">dine-in only</Badge>}
              {!t.every_item && <Badge ml={2} colorScheme="orange">some items</Badge>}
            </Text>
          )) : <Text color="gray.500">None on the form</Text>}
        </Box>
        <Box>
          <Text fontWeight="semibold" fontSize="md" mb={1}>Payment methods</Text>
          <Text>{methods.join(', ')}</Text>
        </Box>
      </SimpleGrid>

      <Text fontWeight="semibold" mb={1}>Menu</Text>
      {menu?.error ? (
        <Alert status="warning" borderRadius="md" mb={4} fontSize="sm"><AlertIcon />{menu.error}</Alert>
      ) : (
        <Box fontSize="sm" mb={4}>
          <Text>{menu.items} items in {menu.categories} categories from {menu.file}</Text>
          {menu.problems.length > 0 && (
            <UnorderedList color="orange.600">{menu.problems.map((p) => <ListItem key={p}>{p}</ListItem>)}</UnorderedList>
          )}
        </Box>
      )}

      {warnings.length > 0 && <Warnings warnings={warnings} title="Good to know" />}
    </>
  );
}

const Warnings = ({ warnings, title }) => (
  <Alert status="info" borderRadius="md" mt={4} alignItems="flex-start">
    <AlertIcon />
    <Box>
      <AlertTitle fontSize="sm">{title}</AlertTitle>
      <AlertDescription>
        <UnorderedList fontSize="sm">{warnings.map((w) => <ListItem key={w}>{w}</ListItem>)}</UnorderedList>
      </AlertDescription>
    </Box>
  </Alert>
);
