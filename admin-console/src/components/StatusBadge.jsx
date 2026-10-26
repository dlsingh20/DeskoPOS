import React from 'react';
import { Badge } from '@chakra-ui/react';

export const STATUS = {
  pending: { label: 'Pending', color: 'yellow' },
  active: { label: 'Active', color: 'green' },
  suspended: { label: 'Deactivated', color: 'red' },
  closed: { label: 'Closed', color: 'gray' },
};

export default function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, color: 'gray' };
  return <Badge colorScheme={s.color}>{s.label}</Badge>;
}
