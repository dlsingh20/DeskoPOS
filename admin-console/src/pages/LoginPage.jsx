import React, { useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Center, FormControl, FormHelperText, FormLabel, Heading, Input, Stack, Text,
} from '@chakra-ui/react';
import { useAuth } from '../auth';

// Authenticator code is off for now (email + password only). Set VITE_REQUIRE_TOTP=true together with the
// service's PLATFORM_REQUIRE_TOTP to ask for it again. Development on this computer never asks.
export const ASK_TOTP = import.meta.env.VITE_REQUIRE_TOTP === 'true'
  && !(import.meta.env.MODE === 'development' && ['localhost', '127.0.0.1'].includes(window.location.hostname));

export default function LoginPage() {
  const { login, expired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password, totp.trim());
    } catch (err) {
      setError(err.status === 401 ? (ASK_TOTP ? 'Wrong email, password or authenticator code.' : 'Wrong email or password.') : err.message);
      setTotp('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center minH="100vh" px={4}>
      <Box as="form" onSubmit={submit} bg="white" p={8} borderRadius="lg" borderWidth="1px" w="full" maxW="sm">
        <Stack spacing={5}>
          <Box>
            <Heading size="md">DeskoPOS Super Admin</Heading>
            <Text color="gray.500" fontSize="sm">Sign in to manage clients</Text>
          </Box>
          {expired && !error && (
            <Alert status="info" borderRadius="md"><AlertIcon />Your session ended. Please sign in again.</Alert>
          )}
          {error && <Alert status="error" borderRadius="md"><AlertIcon />{error}</Alert>}
          <FormControl isRequired>
            <FormLabel>Email</FormLabel>
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Password</FormLabel>
            <Input type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </FormControl>
          {ASK_TOTP && (
            <FormControl isRequired>
              <FormLabel>Authenticator code</FormLabel>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} letterSpacing="0.3em" />
              <FormHelperText>6 digits from your authenticator app</FormHelperText>
            </FormControl>
          )}
          <Button type="submit" isLoading={busy} isDisabled={ASK_TOTP && totp.length !== 6}>Sign in</Button>
        </Stack>
      </Box>
    </Center>
  );
}
