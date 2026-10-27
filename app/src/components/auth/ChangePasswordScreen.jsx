import React, { useState } from 'react';
import {
  Alert,
  AlertIcon,
  Button,
  Card,
  CardBody,
  Center,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import userService from '../../services/UserService';

const MIN_LENGTH = 8;

/**
 * Shown after signing in with a temporary password (a new account, or one an Administrator reset):
 * the user picks their own before using the POS.
 */
const ChangePasswordScreen = ({ user, onChanged, onLogout }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (event) => {
    event.preventDefault();
    if (next.length < MIN_LENGTH || next !== confirm) return;
    if (next === current) {
      setError('Choose a password different from the temporary one.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await userService.changePassword(current, next);
      await onChanged();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Center minH="100vh" bg="gray.50" p={4}>
      <Card maxW="md" w="full">
        <CardBody p={8}>
          <VStack as="form" onSubmit={submit} spacing={5} align="stretch">
            <VStack spacing={1} align="start">
              <Heading size="md">Set your password</Heading>
              <Text color="gray.600" fontSize="sm">
                {user?.client?.name ? `${user.client.name}: you` : 'You'} signed in as <b>{user?.username}</b> with a
                temporary password. Choose your own to continue.
              </Text>
            </VStack>
            {error && <Alert status="error" borderRadius="lg"><AlertIcon /><Text fontSize="sm">{error}</Text></Alert>}
            <FormControl isRequired>
              <FormLabel>Temporary password</FormLabel>
              <Input type="password" autoComplete="current-password" value={current}
                onChange={(e) => setCurrent(e.target.value)} autoFocus bg="white" />
            </FormControl>
            <FormControl isRequired isInvalid={tooShort}>
              <FormLabel>New password</FormLabel>
              <Input type="password" autoComplete="new-password" value={next}
                onChange={(e) => setNext(e.target.value)} bg="white" />
              {tooShort
                ? <FormErrorMessage>At least {MIN_LENGTH} characters.</FormErrorMessage>
                : <FormHelperText>At least {MIN_LENGTH} characters.</FormHelperText>}
            </FormControl>
            <FormControl isRequired isInvalid={mismatch}>
              <FormLabel>Confirm new password</FormLabel>
              <Input type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} bg="white" />
              <FormErrorMessage>The passwords don't match.</FormErrorMessage>
            </FormControl>
            <Button type="submit" colorScheme="pos" size="lg" isLoading={saving}
              isDisabled={!current || next.length < MIN_LENGTH || next !== confirm}>
              Save and continue
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} isDisabled={saving}>Sign out</Button>
          </VStack>
        </CardBody>
      </Card>
    </Center>
  );
};

export default ChangePasswordScreen;
