import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Center, Flex, Heading, Input, Spinner, Table, Tbody, Td, Text, Th, Thead, Tr,
} from '@chakra-ui/react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { platform } from '../api';
import { formatDate } from '../format';

const ACTION_LABELS = {
  'tenant.create': 'Created client',
  'tenant.update': 'Edited client',
  'tenant.active': 'Activated',
  'tenant.suspended': 'Deactivated',
  'tenant.closed': 'Closed',
  'admin.reset_password': 'Reset admin password',
  'platform.login': 'Signed in',
};

const describe = (entry) => {
  const d = entry.details || {};
  if (d.reason) return d.reason;
  if (d.login_id) return d.login_id;
  if (d.after) return Object.keys(d.after).join(', ');
  return '';
};

export default function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const client = params.get('client') || '';
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setPage(1); }, [client]);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    platform.audit({ tenant: client, page, page_size: 50 })
      .then((d) => { if (!cancelled) { setData(d); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [client, page]);

  return (
    <Box>
      <Flex align="center" gap={3} mb={5} wrap="wrap">
        <Heading size="lg" flex="1">Activity</Heading>
        <Input bg="white" maxW="48" placeholder="Client ID" inputMode="numeric" value={client}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            setParams(v ? { client: v } : {});
          }} />
      </Flex>
      {error && <Alert status="error" borderRadius="md" mb={4}><AlertIcon />{error}</Alert>}
      {!data && !error && <Center py={16}><Spinner /></Center>}
      {data && (
        <Box bg="white" borderWidth="1px" borderRadius="lg" overflowX="auto">
          <Table size="sm">
            <Thead><Tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Client</Th><Th>Details</Th></Tr></Thead>
            <Tbody>
              {data.results.map((e) => (
                <Tr key={e.id}>
                  <Td whiteSpace="nowrap">{formatDate(e.created_at)}</Td>
                  <Td>{e.platform_user_email || 'System'}</Td>
                  <Td>{ACTION_LABELS[e.action] || e.action}</Td>
                  <Td>
                    {e.tenant ? (
                      <Button as={RouterLink} to={`/clients/${e.tenant}`} variant="link" size="sm">
                        {e.tenant} · {e.tenant_name}
                      </Button>
                    ) : '—'}
                  </Td>
                  <Td color="gray.600">{describe(e)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {data.results.length === 0 && <Text textAlign="center" py={10} color="gray.500">No activity.</Text>}
        </Box>
      )}
      {data && (data.previous || data.next) && (
        <Flex justify="flex-end" gap={2} mt={3}>
          <Button size="sm" variant="outline" isDisabled={!data.previous} onClick={() => setPage((p) => p - 1)}>Newer</Button>
          <Button size="sm" variant="outline" isDisabled={!data.next} onClick={() => setPage((p) => p + 1)}>Older</Button>
        </Flex>
      )}
    </Box>
  );
}
