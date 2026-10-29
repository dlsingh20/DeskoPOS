import React, { useState } from 'react';
import {
  Alert, AlertIcon, Button, FormControl, FormErrorMessage, FormLabel, Input, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalFooter, ModalHeader, ModalOverlay, Stack, Text,
} from '@chakra-ui/react';
import { platform } from '../api';

const MIN_LENGTH = 12;

/** The signed-in Super Admin changes their own password. */
export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current && next.length >= MIN_LENGTH && confirm === next;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await platform.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err.fields?.new_password?.join?.(' ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={4} as="form" onSubmit={submit}>
        <ModalHeader>Change password</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {done ? (
            <Text>Your password has been changed. Use the new one next time you sign in.</Text>
          ) : (
            <Stack spacing={3}>
              {error && <Alert status="error" borderRadius="md"><AlertIcon />{error}</Alert>}
              <FormControl isRequired>
                <FormLabel>Current password</FormLabel>
                <Input type="password" autoComplete="current-password" value={current}
                  onChange={(e) => setCurrent(e.target.value)} />
              </FormControl>
              <FormControl isRequired isInvalid={tooShort}>
                <FormLabel>New password</FormLabel>
                <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                <FormErrorMessage>At least {MIN_LENGTH} characters.</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={mismatch}>
                <FormLabel>Confirm new password</FormLabel>
                <Input type="password" autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} />
                <FormErrorMessage>The passwords don't match.</FormErrorMessage>
              </FormControl>
            </Stack>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          {done ? <Button onClick={onClose}>Close</Button> : (
            <>
              <Button variant="ghost" colorScheme="gray" onClick={onClose}>Cancel</Button>
              <Button type="submit" isLoading={busy} isDisabled={!ready}>Change password</Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
