import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Center, Flex, Heading, Input, InputGroup, InputLeftElement, Select, Spinner,
  Table, Tbody, Td, Text, Th, Thead, Tr,
} from '@chakra-ui/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { canManage, platform } from '../api';
import { useAuth } from '../auth';
import StatusBadge, { STATUS } from '../components/StatusBadge';
import { formatDate } from '../format';

export default function ClientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      platform.tenants({ search: search.trim(), status, page_size: 100 })
        .then((d) => { if (!cancelled) { setData(d); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, status]);

  return (
    <Box>
      <Flex align="center" mb={5} gap={3} wrap="wrap">
        <Heading size="lg" flex="1">Clients</Heading>
        {canManage(user) && (
          <Button as={RouterLink} to="/clients/new" leftIcon={<Plus size={18} />}>New client</Button>
        )}
      </Flex>

      <Flex gap={3} mb={4} wrap="wrap">
        <InputGroup maxW="sm">
          <InputLeftElement pointerEvents="none"><Search size={16} color="#718096" /></InputLeftElement>
          <Input bg="white" placeholder="Search by name or Client ID" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <Select bg="white" maxW="48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
        </Select>
      </Flex>

      {error && <Alert status="error" mb={4} borderRadius="md"><AlertIcon />{error}</Alert>}
      {!data && !error && <Center py={16}><Spinner /></Center>}
      {data && (
        <Box bg="white" borderWidth="1px" borderRadius="lg" overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Client ID</Th><Th>Name</Th><Th>Type</Th><Th>Country</Th><Th>Plan</Th>
                <Th isNumeric>Outlets</Th><Th isNumeric>Users</Th><Th>Status</Th><Th>Created</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.results.map((t) => (
                <Tr key={t.id} cursor="pointer" _hover={{ bg: 'gray.50' }} onClick={() => navigate(`/clients/${t.id}`)}>
                  <Td fontWeight="semibold">{t.id}</Td>
                  <Td>{t.name}</Td>
                  <Td textTransform="capitalize">{t.business_type.replace('_', ' ')}</Td>
                  <Td>{t.country} · {t.currency}</Td>
                  <Td textTransform="capitalize">{t.plan || '—'}</Td>
                  <Td isNumeric>{t.outlets}</Td>
                  <Td isNumeric>{t.users}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                  <Td whiteSpace="nowrap">{formatDate(t.created_at)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {data.results.length === 0 && (
            <Text textAlign="center" py={10} color="gray.500">
              {search || status ? 'No clients match.' : 'No clients yet. Create the first one.'}
            </Text>
          )}
        </Box>
      )}
      {data && data.count > data.results.length && (
        <Text mt={2} fontSize="sm" color="gray.500">Showing {data.results.length} of {data.count}. Search to narrow down.</Text>
      )}
    </Box>
  );
}
