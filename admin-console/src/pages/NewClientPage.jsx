import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Code, Divider, Flex, FormControl, FormErrorMessage, FormHelperText, FormLabel,
  Heading, HStack, IconButton, Input, InputGroup, InputRightElement, Select, SimpleGrid, Stack, Text, useClipboard,
} from '@chakra-ui/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Copy, RefreshCw } from 'lucide-react';
import { platform } from '../api';
import { BUSINESS_TYPES, EMAIL_RE, LOGIN_ID_RE, generatePassword } from '../format';

const EMPTY = {
  name: '', business_type: 'restaurant', country: 'IN', plan: 'growth', outlet_name: '', login_prefix: '',
  admin_login_id: '', admin_password: '', admin_email: '', contact_name: '', contact_email: '', contact_phone: '',
};

/** Suggested prefix from the name: "Spice Garden" -> "sg", "Brew" -> "brew" */
export const suggestPrefix = (name) => {
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 6);
  return words.map((w) => w[0]).join('').slice(0, 6);
};

function useLoginIdCheck(loginId) {
  const [state, setState] = useState({ checking: false, available: null });
  useEffect(() => {
    if (!LOGIN_ID_RE.test(loginId)) { setState({ checking: false, available: null }); return undefined; }
    let cancelled = false;
    setState({ checking: true, available: null });
    const timer = setTimeout(() => {
      platform.loginIdAvailable(loginId)
        .then((r) => { if (!cancelled) setState({ checking: false, available: r.available }); })
        .catch(() => { if (!cancelled) setState({ checking: false, available: null }); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loginId]);
  return state;
}

function CopyLine({ label, value }) {
  const { onCopy, hasCopied } = useClipboard(value);
  return (
    <Flex align="center" gap={3}>
      <Text w="32" color="gray.600">{label}</Text>
      <Code px={2} py={1} fontSize="md">{value}</Code>
      <Button size="xs" variant="ghost" leftIcon={<Copy size={14} />} onClick={onCopy}>{hasCopied ? 'Copied' : 'Copy'}</Button>
    </Flex>
  );
}

function Created({ tenant, form, onActivate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activate = async () => {
    setBusy(true);
    try { await onActivate(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Box bg="white" borderWidth="1px" borderRadius="lg" p={6} maxW="2xl">
      <Heading size="md" mb={1}>{tenant.name} created</Heading>
      <Text color="gray.600" mb={5}>
        Client ID <b>{tenant.id}</b>. It's <b>pending</b>: nobody can sign in until you activate it.
      </Text>
      <Stack spacing={2} mb={5}>
        <CopyLine label="Client ID" value={String(tenant.id)} />
        <CopyLine label="Login ID" value={form.admin_login_id} />
        <CopyLine label="Password" value={form.admin_password} />
      </Stack>
      <Alert status="warning" borderRadius="md" mb={5}>
        <AlertIcon />
        Send these to the client now: the password isn't shown again. They'll be asked to change it at first sign-in,
        and a sign-in code goes to {form.admin_email}.
      </Alert>
      {error && <Alert status="error" borderRadius="md" mb={4}><AlertIcon />{error}</Alert>}
      <HStack>
        <Button onClick={activate} isLoading={busy}>Activate now</Button>
        <Button as={RouterLink} to={`/clients/${tenant.id}`} variant="outline">Open client</Button>
      </HStack>
    </Box>
  );
}

export default function NewClientPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...EMPTY, admin_password: generatePassword() });
  const [touched, setTouched] = useState({});
  const [countries, setCountries] = useState([]);
  const [plans, setPlans] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const loginCheck = useLoginIdCheck(form.admin_login_id.trim());

  useEffect(() => {
    platform.countries().then(setCountries).catch((err) => setError(err.message));
    platform.plans().then((p) => setPlans(p.filter((x) => x.is_active))).catch(() => {});
  }, []);

  const country = useMemo(() => countries.find((c) => c.code === form.country), [countries, form.country]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Fill the outlet name, prefix and login ID from the client name until they're edited
      if (key === 'name') {
        if (!touched.outlet_name) next.outlet_name = value;
        if (!touched.login_prefix) next.login_prefix = suggestPrefix(value);
        if (!touched.admin_login_id && next.login_prefix) next.admin_login_id = `${next.login_prefix}_admin`;
      }
      if (key === 'login_prefix' && !touched.admin_login_id) next.admin_login_id = value ? `${value}_admin` : '';
      return next;
    });
    if (key !== 'name') setTouched((t) => ({ ...t, [key]: true }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Enter the business name.';
    if (!form.outlet_name.trim()) errs.outlet_name = 'Enter the first outlet name.';
    if (form.login_prefix && !/^[a-z0-9]{2,12}$/.test(form.login_prefix)) errs.login_prefix = '2-12 lowercase letters or numbers.';
    if (!LOGIN_ID_RE.test(form.admin_login_id.trim())) errs.admin_login_id = '3-60 characters: letters, numbers, dot, dash or underscore.';
    else if (loginCheck.available === false) errs.admin_login_id = 'This login ID is already used by a client.';
    if (form.admin_password.length < 8) errs.admin_password = 'At least 8 characters.';
    if (!EMAIL_RE.test(form.admin_email.trim())) errs.admin_email = 'Enter a valid email: the sign-in code goes here.';
    if (form.contact_email && !EMAIL_RE.test(form.contact_email.trim())) errs.contact_email = 'Enter a valid email.';
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && k !== 'admin_password' ? v.trim() : v]));
      setCreated(await platform.createTenant(body));
    } catch (err) {
      const fieldErrors = Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : String(v)]));
      if (err.code === 'login_id_taken') fieldErrors.admin_login_id = err.message;
      setErrors(fieldErrors);
      setError(Object.keys(fieldErrors).length ? 'Please fix the highlighted fields.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Created tenant={created} form={form} onActivate={async () => {
        await platform.setStatus(created.id, 'activate');
        navigate(`/clients/${created.id}`);
      }} />
    );
  }

  const field = (key, label, props = {}, help) => (
    <FormControl isInvalid={!!errors[key]} isRequired={props.isRequired}>
      <FormLabel>{label}</FormLabel>
      <Input bg="white" value={form[key]} onChange={set(key)} {...props} isRequired={undefined} />
      {errors[key] ? <FormErrorMessage>{errors[key]}</FormErrorMessage> : help && <FormHelperText>{help}</FormHelperText>}
    </FormControl>
  );

  let loginHelp = 'Unique across all clients. They sign in with this on the common POS login page.';
  if (loginCheck.checking) loginHelp = 'Checking…';
  else if (loginCheck.available) loginHelp = 'Available.';

  return (
    <Box as="form" onSubmit={submit} noValidate maxW="3xl">
      <Heading size="lg" mb={1}>New client</Heading>
      <Text color="gray.600" mb={6}>Creates the client with its Administrator, roles, payment methods, country taxes and first outlet.</Text>
      {error && <Alert status="error" borderRadius="md" mb={4}><AlertIcon />{error}</Alert>}

      <Stack spacing={6} bg="white" borderWidth="1px" borderRadius="lg" p={6}>
        <Heading size="sm">Business</Heading>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {field('name', 'Business name', { isRequired: true, autoFocus: true, placeholder: 'Spice Garden' })}
          <FormControl>
            <FormLabel>Type</FormLabel>
            <Select bg="white" value={form.business_type} onChange={set('business_type')}>
              {BUSINESS_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </FormControl>
          <FormControl isInvalid={!!errors.country}>
            <FormLabel>Country</FormLabel>
            <Select bg="white" value={form.country} onChange={set('country')}>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
            {errors.country ? <FormErrorMessage>{errors.country}</FormErrorMessage> : country && (
              <FormHelperText>
                {country.default_currency} · {country.default_timezone} · Taxes:{' '}
                {(country.tax_template || []).map((t) => `${t.name} ${t.rate}%`).join(', ') || 'none'}
              </FormHelperText>
            )}
          </FormControl>
          <FormControl>
            <FormLabel>Plan</FormLabel>
            <Select bg="white" value={form.plan} onChange={set('plan')}>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </Select>
          </FormControl>
          {field('outlet_name', 'First outlet name', { isRequired: true }, 'They can add more outlets later.')}
        </SimpleGrid>

        <Divider />
        <Heading size="sm">Administrator login</Heading>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {field('login_prefix', 'Login prefix', { placeholder: 'sg' }, 'Optional. Their staff login IDs start with it, e.g. sg_ravi.')}
          {field('admin_login_id', 'Login ID', { isRequired: true, autoComplete: 'off' }, loginHelp)}
          <FormControl isInvalid={!!errors.admin_password} isRequired>
            <FormLabel>Temporary password</FormLabel>
            <InputGroup>
              <Input bg="white" fontFamily="mono" value={form.admin_password} onChange={set('admin_password')} autoComplete="new-password" />
              <InputRightElement>
                <IconButton size="sm" variant="ghost" aria-label="New password" icon={<RefreshCw size={16} />}
                  onClick={() => setForm((f) => ({ ...f, admin_password: generatePassword() }))} />
              </InputRightElement>
            </InputGroup>
            {errors.admin_password ? <FormErrorMessage>{errors.admin_password}</FormErrorMessage>
              : <FormHelperText>They must change it at first sign-in.</FormHelperText>}
          </FormControl>
          {field('admin_email', 'Administrator email', { isRequired: true, type: 'email' }, 'Sign-in codes are sent here.')}
        </SimpleGrid>

        <Divider />
        <Heading size="sm">Contact <Text as="span" fontWeight="normal" color="gray.500">(optional)</Text></Heading>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          {field('contact_name', 'Name')}
          {field('contact_email', 'Email', { type: 'email' })}
          {field('contact_phone', 'Phone', { type: 'tel' })}
        </SimpleGrid>
      </Stack>

      <HStack mt={5}>
        <Button type="submit" isLoading={busy}>Create client</Button>
        <Button as={RouterLink} to="/clients" variant="ghost" colorScheme="gray">Cancel</Button>
      </HStack>
    </Box>
  );
}
