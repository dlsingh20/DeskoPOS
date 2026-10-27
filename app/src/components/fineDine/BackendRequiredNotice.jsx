import React from 'react';
import { Alert, AlertIcon, AlertTitle, AlertDescription, Box, Code } from '@chakra-ui/react';

/**
 * Explains why a confirm button is disabled: the server has no endpoint for it yet.
 * The UI is complete so it can be switched on once the backend ships the endpoint.
 */
const BackendRequiredNotice = ({ action, endpoint }) => (
  <Alert status="info" borderRadius="10px" alignItems="flex-start" fontSize="sm">
    <AlertIcon mt={0.5} />
    <Box>
      <AlertTitle fontSize="sm">{action} needs a server update</AlertTitle>
      <AlertDescription display="block">
        The server can't do this safely in one step yet, so nothing will be changed. When the backend adds{' '}
        <Code fontSize="xs">{endpoint}</Code>, this button will work. Details are in{' '}
        <Code fontSize="xs">docs/FINE_DINE_BACKEND_REQUIREMENTS.md</Code>.
      </AlertDescription>
    </Box>
  </Alert>
);

export default BackendRequiredNotice;
