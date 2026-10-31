import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, AlertDescription, AlertIcon, AlertTitle, Box, Button, Center, Divider, Flex, Heading, HStack, IconButton,
  Input, InputGroup, InputRightElement, Link, ListItem, SimpleGrid, Spinner, Table, Tbody, Td, Text, Th, Thead, Tr,
  UnorderedList, useToast, Wrap,
} from '@chakra-ui/react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, FileDown, FileJson, LockOpen, Pencil, RefreshCw, Store, Trash2 } from 'lucide-react';
import { canManage, platform } from '../api';
import { useAuth } from '../auth';
import { formatDate } from '../format';
import { FormStatusBadge } from './OnboardingPage';
import ImportRestaurantModal from '../components/ImportRestaurantModal';

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** A field's answer as text, '' when not given */
export function answerText(field, value) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '';
  const label = (v) => (field.options || []).find((o) => o.value === v)?.label ?? v;
  if (field.type === 'yesno') return value ? 'Yes' : 'No';
  if (field.type === 'select') return String(label(value));
  if (field.type === 'multi') return value.map(label).join(', ');
  if (field.type === 'lines') return value.join(', ');
  return String(value);
}

export default function OnboardingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [importing, setImporting] = useState(false);
  const manage = canManage(user);

  const load = useCallback(() => platform.onboardingForm(id).then(setForm).catch((err) => setError(err.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (name, action, done) => {
    setBusy(name);
    try {
      const result = await action();
      if (done) done(result);
    } catch (err) {
      toast({ status: 'error', title: err.message });
    } finally {
      setBusy('');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(form.link);
      toast({ status: 'success', title: 'Link copied', duration: 2000 });
    } catch {
      toast({ status: 'warning', title: 'Copy the link from the box' });
    }
  };

  const editForm = () => {
    // Open the tab first (in the click) so pop-up blockers allow it, then point it at the edit link
    const tab = window.open('about:blank', '_blank');
    run('edit', () => platform.onboardingEditLink(form.id), (r) => {
      if (tab) { tab.opener = null; tab.location.href = r.url; } else window.location.href = r.url;
    });
  };

  if (error) return <Alert status="error" borderRadius="md"><AlertIcon />{error}</Alert>;
  if (!form) return <Center py={16}><Spinner /></Center>;

  const filesFor = (path) => form.files.filter((f) => f.field === path);
  const download = (file) => platform.downloadOnboardingFile(form.id, file);

  return (
    <Box>
      <Button as={RouterLink} to="/onboarding" variant="link" leftIcon={<ArrowLeft size={16} />} mb={4} colorScheme="gray">
        Onboarding forms
      </Button>
      <Flex align="center" gap={3} wrap="wrap" mb={1}>
        <Heading size="lg">{form.title}</Heading>
        <FormStatusBadge status={form.status} />
      </Flex>
      <Text color="gray.600" fontSize="sm" mb={5}>
        Form {form.id} · created {formatDate(form.created_at)}
        {form.last_saved_at && ` · last saved ${formatDate(form.last_saved_at)} by ${form.last_saved_by}`}
        {form.submitted_at && ` · submitted ${formatDate(form.submitted_at)}`}
      </Text>

      {form.tenant ? (
        <Alert status="success" borderRadius="lg" mb={5}>
          <AlertIcon />
          <AlertDescription>
            The restaurant was created from this form:{' '}
            <Link as={RouterLink} to={`/clients/${form.tenant}`} fontWeight="semibold" color="brand.600">Client {form.tenant}</Link>
          </AlertDescription>
        </Alert>
      ) : manage && form.status === 'submitted' && (
        <Flex bg="white" borderWidth="1px" borderRadius="lg" p={5} mb={5} gap={4} align="center" wrap="wrap">
          <Box flex="1" minW="220px">
            <Text fontWeight="semibold">Ready to set up?</Text>
            <Text fontSize="sm" color="gray.600">Create the client with its outlets, tables, taxes, staff and menu from these answers.</Text>
          </Box>
          <Button colorScheme="green" leftIcon={<Store size={16} />} onClick={() => setImporting(true)}>Create restaurant</Button>
        </Flex>
      )}

      <Box bg="white" borderWidth="1px" borderRadius="lg" p={5} mb={5}>
        <Text fontWeight="semibold" mb={2}>Client's link</Text>
        <InputGroup mb={3}>
          <Input value={form.link} isReadOnly onFocus={(e) => e.target.select()} pr="3rem" aria-label="Client's link" />
          <InputRightElement>
            <IconButton size="sm" variant="ghost" icon={<Copy size={16} />} aria-label="Copy link" onClick={copyLink} />
          </InputRightElement>
        </InputGroup>
        <Text fontSize="sm" color="gray.500" mb={4}>
          Anyone with this link can fill in the form, so send it only to the client.
          {form.status === 'submitted' && ' The client can no longer change their answers unless you reopen the form.'}
        </Text>
        <Wrap spacing={2}>
          {manage && <Button leftIcon={<Pencil size={16} />} onClick={editForm} isLoading={busy === 'edit'}>Edit answers</Button>}
          <Button variant="outline" leftIcon={<FileDown size={16} />} isLoading={busy === 'pdf'}
            onClick={() => run('pdf', () => platform.downloadOnboardingExport(form, 'pdf'))}>Download PDF</Button>
          <Button variant="outline" leftIcon={<FileJson size={16} />} isLoading={busy === 'json'}
            onClick={() => run('json', () => platform.downloadOnboardingExport(form, 'json'))}>Download JSON</Button>
          {manage && form.status === 'submitted' && (
            <Button variant="outline" leftIcon={<LockOpen size={16} />} isLoading={busy === 'reopen'}
              onClick={() => run('reopen', () => platform.reopenOnboardingForm(form.id), (f) => {
                setForm(f); toast({ status: 'success', title: 'The client can edit the form again' });
              })}>Reopen for client</Button>
          )}
          {manage && (
            <Button variant="ghost" colorScheme="gray" leftIcon={<RefreshCw size={16} />} isLoading={busy === 'link'}
              onClick={() => window.confirm('Make a new link? The current link stops working.')
                && run('link', () => platform.newOnboardingLink(form.id), (f) => {
                  setForm(f); toast({ status: 'success', title: 'New link made. Send it to the client.' });
                })}>New link</Button>
          )}
          {manage && (
            <Button variant="ghost" colorScheme="red" leftIcon={<Trash2 size={16} />} isLoading={busy === 'delete'}
              onClick={() => window.confirm(`Delete the form for ${form.title} and its files? This cannot be undone.`)
                && run('delete', () => platform.deleteOnboardingForm(form.id), () => navigate('/onboarding'))}>Delete</Button>
          )}
        </Wrap>
      </Box>

      {form.problems.length > 0 ? (
        <Alert status="warning" borderRadius="lg" mb={5} alignItems="flex-start">
          <AlertIcon />
          <Box>
            <AlertTitle>{form.problems.length} required {form.problems.length === 1 ? 'answer is' : 'answers are'} missing</AlertTitle>
            <AlertDescription>
              <UnorderedList mt={1} fontSize="sm">
                {form.problems.slice(0, 12).map((p) => <ListItem key={p.path}>{p.label}: {p.message}</ListItem>)}
                {form.problems.length > 12 && <ListItem>…and {form.problems.length - 12} more</ListItem>}
              </UnorderedList>
              {manage && <Text fontSize="sm" mt={2}>Use Edit answers to fill in what the client did not share.</Text>}
            </AlertDescription>
          </Box>
        </Alert>
      ) : (
        <Alert status="success" borderRadius="lg" mb={5}><AlertIcon />Every required answer is filled in.</Alert>
      )}

      {form.notes && (
        <Box bg="yellow.50" borderWidth="1px" borderColor="yellow.200" borderRadius="lg" p={4} mb={5} fontSize="sm">
          <Text fontWeight="semibold">Internal notes</Text>
          <Text whiteSpace="pre-wrap">{form.notes}</Text>
        </Box>
      )}

      {form.schema.map((section, i) => (
        <Box key={section.key} bg="white" borderWidth="1px" borderRadius="lg" p={5} mb={4}>
          <Heading size="sm" mb={3}>{i + 1}. {section.title}</Heading>
          {section.type === 'list' ? (
            <ListAnswers def={section} rows={form.data[section.key] || []} path={section.key} filesFor={filesFor} download={download} />
          ) : (
            <Answers fields={section.fields} values={form.data[section.key] || {}} path={section.key} filesFor={filesFor} download={download} />
          )}
        </Box>
      ))}
      {importing && (
        <ImportRestaurantModal formId={form.id} onClose={() => setImporting(false)}
          onCreated={(tenant) => setForm((f) => ({ ...f, tenant: tenant.id }))} />
      )}
    </Box>
  );
}

function Answers({ fields, values, path, filesFor, download }) {
  const simple = fields.filter((f) => f.type !== 'list');
  return (
    <>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacingX={8} spacingY={2}>
        {simple.map((f) => {
          const files = f.type === 'file' ? filesFor(`${path}.${f.key}`) : null;
          const text = files ? '' : answerText(f, values[f.key]);
          return (
            <Box key={f.key} minW={0}>
              <Text fontSize="xs" color="gray.500">{f.label}</Text>
              {files ? (
                files.length ? files.map((file) => (
                  <HStack key={file.id} spacing={2}>
                    <Link color="brand.600" onClick={() => download(file)} noOfLines={1}>{file.name}</Link>
                    <Text fontSize="xs" color="gray.500">{kb(file.size)}</Text>
                  </HStack>
                )) : <Text color="gray.400">Not attached</Text>
              ) : (
                <Text whiteSpace="pre-wrap" color={text ? undefined : 'gray.400'} wordBreak="break-word">{text || '—'}</Text>
              )}
            </Box>
          );
        })}
      </SimpleGrid>
      {fields.filter((f) => f.type === 'list').map((f) => (
        <Box key={f.key} mt={4}>
          <Text fontWeight="semibold" fontSize="sm" mb={2}>{f.label} ({(values[f.key] || []).length})</Text>
          <ListAnswers def={f} rows={values[f.key] || []} path={`${path}.${f.key}`} filesFor={filesFor} download={download} />
        </Box>
      ))}
    </>
  );
}

function ListAnswers({ def, rows, path, filesFor, download }) {
  if (!rows.length) return <Text color="gray.400">None given</Text>;
  const nested = def.fields.some((f) => ['list', 'textarea', 'lines'].includes(f.type));
  if (!nested) {
    return (
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr>{def.fields.map((f) => <Th key={f.key}>{f.label}</Th>)}</Tr></Thead>
          <Tbody>
            {rows.map((row, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Tr key={i}>{def.fields.map((f) => <Td key={f.key}>{answerText(f, row[f.key]) || '—'}</Td>)}</Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    );
  }
  return rows.map((row, i) => (
    // eslint-disable-next-line react/no-array-index-key
    <Box key={i} mb={4}>
      {i > 0 && <Divider mb={4} />}
      <Text fontWeight="semibold" mb={2}>{def.item} {i + 1}{row.name ? ` · ${row.name}` : ''}</Text>
      <Answers fields={def.fields} values={row} path={`${path}.${i}`} filesFor={filesFor} download={download} />
    </Box>
  ));
}
