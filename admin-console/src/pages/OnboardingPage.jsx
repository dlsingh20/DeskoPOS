import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Badge, Box, Button, Center, Flex, FormControl, FormErrorMessage, FormLabel, Heading, Input, Modal,
  ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select, SimpleGrid, Spinner,
  Table, Tbody, Td, Text, Textarea, Th, Thead, Tr,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Plus } from 'lucide-react';
import { canManage, platform } from '../api';
import { useAuth } from '../auth';
import { EMAIL_RE, formatDate } from '../format';
import ImportRestaurantModal from '../components/ImportRestaurantModal';

export const FORM_STATUS = {
  draft: { label: 'Waiting for client', color: 'yellow' },
  submitted: { label: 'Submitted', color: 'green' },
};

export const FormStatusBadge = ({ status }) => {
  const s = FORM_STATUS[status] || { label: status, color: 'gray' };
  return <Badge colorScheme={s.color}>{s.label}</Badge>;
};

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    platform.onboardingForms({ status })
      .then((d) => { if (!cancelled) { setData(d.results); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [status]);

  return (
    <Box>
      <Flex align="center" mb={2} gap={3} wrap="wrap">
        <Heading size="lg" flex="1">Onboarding forms</Heading>
        {canManage(user) && (
          <Button variant="outline" leftIcon={<FileUp size={18} />} onClick={() => setImporting(true)}>Import JSON</Button>
        )}
        {canManage(user) && (
          <Button leftIcon={<Plus size={18} />} onClick={() => setCreating(true)}>New form</Button>
        )}
      </Flex>
      <Text color="gray.600" mb={5}>
        Send a new client the form link. They fill in their restaurant details and menu, save as they go, and submit.
      </Text>

      <Select bg="white" maxW="56" mb={4} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
        <option value="">All forms</option>
        {Object.entries(FORM_STATUS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
      </Select>

      {error && <Alert status="error" mb={4} borderRadius="md"><AlertIcon />{error}</Alert>}
      {!data && !error && <Center py={16}><Spinner /></Center>}
      {data && (
        <Box bg="white" borderWidth="1px" borderRadius="lg" overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr><Th>Form</Th><Th>Client</Th><Th>Contact</Th><Th>Status</Th><Th>Last saved</Th><Th>Submitted</Th><Th>Restaurant</Th></Tr>
            </Thead>
            <Tbody>
              {data.length === 0 && (
                <Tr><Td colSpan={7}><Text py={6} textAlign="center" color="gray.500">No forms yet.</Text></Td></Tr>
              )}
              {data.map((f) => (
                <Tr key={f.id} cursor="pointer" _hover={{ bg: 'gray.50' }} onClick={() => navigate(`/onboarding/${f.id}`)}>
                  <Td>{f.id}</Td>
                  <Td fontWeight="semibold">{f.title}</Td>
                  <Td>{f.contact_name || '—'}<Text fontSize="xs" color="gray.500">{f.contact_email}</Text></Td>
                  <Td><FormStatusBadge status={f.status} /></Td>
                  <Td>{formatDate(f.last_saved_at)}</Td>
                  <Td>{formatDate(f.submitted_at)}</Td>
                  <Td>{f.tenant ? `Client ${f.tenant}` : '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      {importing && <ImportRestaurantModal onClose={() => setImporting(false)} />}
      {creating && <NewFormModal onClose={() => setCreating(false)} onCreated={(f) => navigate(`/onboarding/${f.id}`)} />}
    </Box>
  );
}

function NewFormModal({ onClose, onCreated }) {
  const [values, setValues] = useState({ title: '', contact_name: '', contact_email: '', contact_phone: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    const found = {};
    if (!values.title.trim()) found.title = 'Enter the client\'s name.';
    if (values.contact_email && !EMAIL_RE.test(values.contact_email)) found.contact_email = 'Not a valid email address.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      onCreated(await platform.createOnboardingForm(values));
    } catch (err) {
      setError(err.message);
      setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, [].concat(v)[0]])));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size={{ base: 'full', md: 'lg' }}>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={create} noValidate>
        <ModalHeader>New onboarding form</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {error && <Alert status="error" mb={4} borderRadius="md"><AlertIcon />{error}</Alert>}
          <FormControl isRequired isInvalid={!!errors.title} mb={4}>
            <FormLabel>Client / restaurant name</FormLabel>
            <Input value={values.title} onChange={set('title')} autoFocus />
            <FormErrorMessage>{errors.title}</FormErrorMessage>
          </FormControl>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
            <FormControl>
              <FormLabel>Contact name</FormLabel>
              <Input value={values.contact_name} onChange={set('contact_name')} />
            </FormControl>
            <FormControl>
              <FormLabel>Contact phone</FormLabel>
              <Input type="tel" value={values.contact_phone} onChange={set('contact_phone')} />
            </FormControl>
          </SimpleGrid>
          <FormControl isInvalid={!!errors.contact_email} mb={4}>
            <FormLabel>Contact email</FormLabel>
            <Input type="email" value={values.contact_email} onChange={set('contact_email')} />
            <FormErrorMessage>{errors.contact_email}</FormErrorMessage>
          </FormControl>
          <FormControl>
            <FormLabel>Internal notes</FormLabel>
            <Textarea value={values.notes} onChange={set('notes')} placeholder="Only DeskoPOS staff see this" />
          </FormControl>
          <Text fontSize="sm" color="gray.500" mt={3}>The client's name and contact details are filled in on the form for them.</Text>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Create form</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
