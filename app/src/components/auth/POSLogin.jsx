import React, { useRef, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Input,
  Button,
  Text,
  Alert,
  AlertIcon,
  FormControl,
  FormLabel,
  Card,
  CardBody,
  Heading,
  Icon,
  Spinner,
  Link,
  useToast,
} from '@chakra-ui/react';
import { Utensils, Lock, User } from 'lucide-react';
import ApiClient from '../../services/ApiClient';
import TurnstileWidget, { CAPTCHA_ENABLED } from './TurnstileWidget';

/**
 * POSLogin Component
 * Simple login form for POS system authentication
 */
const POSLogin = ({ onLoginSuccess }) => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef(null);
  // Second step for manager-and-up accounts: the server answers a correct
  // password with otp_required and emails a six-digit code.
  const [otpStage, setOtpStage] = useState(null); // {challenge, emailHint}
  const [otpCode, setOtpCode] = useState('');
  const resetCaptcha = () => {
    setCaptchaToken('');
    turnstileRef.current?.reset();
  };
  const toast = useToast();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user types
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!credentials.username || !credentials.password) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await ApiClient.login(
        credentials.username, credentials.password, captchaToken,
        otpStage ? { code: otpCode.trim(), challenge: otpStage.challenge } : undefined
      );

      if (result && result.otpRequired) {
        // Correct password; a code is on its way. The captcha token was
        // consumed by that request, so arm a fresh one for the code submit.
        setOtpStage({ challenge: result.challenge, emailHint: result.emailHint });
        setOtpCode('');
        resetCaptcha();
        return;
      }

      toast({
        title: 'Login Successful',
        description: `Welcome back, ${result.user?.username || credentials.username}!`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Call success callback
      if (onLoginSuccess) {
        onLoginSuccess(result);
      }
    } catch (error) {
      console.error('Login failed:', error);
      
      let errorMessage = 'Login failed. Please try again.';
      
      const status = error.response?.status;
      const code = error.response?.data?.code;
      if (code === 'otp_expired') {
        setOtpStage(null);
        setOtpCode('');
        errorMessage = error.response.data.detail;
      } else if (code && code.startsWith('otp_') && error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (status === 401) {
        errorMessage = 'Invalid username or password.';
      } else if ((status === 403 || status === 429) && error.response?.data?.detail) {
        // Captcha required/failed or login locked -- show the server's message
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);

      // Turnstile tokens are single-use: get a fresh one for the next attempt
      resetCaptcha();
      
      toast({
        title: 'Login Failed',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async () => {
    // For development/testing - use demo credentials
    setCredentials({
      username: 'admin',
      password: 'admin123'
    });
    
    // Auto-submit after a short delay
    setTimeout(() => {
      handleSubmit({ preventDefault: () => {} });
    }, 100);
  };

  return (
    <Box
      minH="100vh"
      bg="gray.50"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
    >
      <Card maxW="md" w="full" variant="elevation">
        <CardBody p={8}>
          <VStack spacing={6} align="stretch">
            {/* Header */}
            <VStack spacing={4}>
              <HStack spacing={3}>
                <Icon as={Utensils} boxSize={8} color="pos.500" />
                <Heading size="lg" color="gray.800">
                  POS System
                </Heading>
              </HStack>
              <Text color="gray.600" textAlign="center">
                Sign in to access the Point of Sale system
              </Text>
            </VStack>

            {/* Error Alert */}
            {error && (
              <Alert status="error" borderRadius="lg">
                <AlertIcon />
                <Text fontSize="sm">{error}</Text>
              </Alert>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit}>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>
                    <HStack spacing={2}>
                      <Icon as={User} boxSize={4} />
                      <Text>Username</Text>
                    </HStack>
                  </FormLabel>
                  <Input
                    name="username"
                    type="text"
                    value={credentials.username}
                    onChange={handleInputChange}
                    placeholder="Enter your username"
                    bg="white"
                    isDisabled={loading}
                    _focus={{
                      borderColor: 'pos.300',
                      boxShadow: '0 0 0 1px var(--chakra-colors-pos-300)'
                    }}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>
                    <HStack spacing={2}>
                      <Icon as={Lock} boxSize={4} />
                      <Text>Password</Text>
                    </HStack>
                  </FormLabel>
                  <Input
                    name="password"
                    type="password"
                    value={credentials.password}
                    onChange={handleInputChange}
                    placeholder="Enter your password"
                    bg="white"
                    isDisabled={loading}
                    _focus={{
                      borderColor: 'pos.300',
                      boxShadow: '0 0 0 1px var(--chakra-colors-pos-300)'
                    }}
                  />
                </FormControl>

                {otpStage && (
                  <FormControl isRequired>
                    <FormLabel>Sign-in code</FormLabel>
                    <Input
                      name="otp_code"
                      value={otpCode}
                      onChange={(e) => { setOtpCode(e.target.value); if (error) setError(''); }}
                      placeholder="123456"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                      bg="white"
                      fontSize="xl"
                      letterSpacing="6px"
                      textAlign="center"
                      isDisabled={loading}
                    />
                    <Text fontSize="sm" color="gray.500" mt={2}>
                      A six-digit code was emailed to{' '}
                      <b>{otpStage.emailHint || 'your email'}</b>.{' '}
                      <Link color="pos.500" onClick={() => { setOtpStage(null); setOtpCode(''); resetCaptcha(); }}>
                        Start over
                      </Link>
                    </Text>
                  </FormControl>
                )}

                {CAPTCHA_ENABLED && <TurnstileWidget ref={turnstileRef} onToken={setCaptchaToken} />}

                <Button
                  type="submit"
                  colorScheme="pos"
                  size="lg"
                  w="full"
                  isLoading={loading}
                  isDisabled={loading || (CAPTCHA_ENABLED && !captchaToken) || (otpStage && otpCode.trim().length < 6)}
                  loadingText="Signing in..."
                >
                  {loading ? (
                    <HStack spacing={2}>
                      <Spinner size="sm" />
                      <Text>Signing in...</Text>
                    </HStack>
                  ) : (
                    otpStage ? 'Verify code' : 'Sign In'
                  )}
                </Button>
              </VStack>
            </form>

            {/* Development Quick Login */}
            {process.env.NODE_ENV === 'development' && (
              <Box pt={4} borderTop="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" textAlign="center" mb={2}>
                  Development Mode
                </Text>
                <Button
                  variant="outline"
                  colorScheme="gray"
                  size="sm"
                  w="full"
                  onClick={handleQuickLogin}
                  isDisabled={loading}
                >
                  Quick Login (admin/admin123)
                </Button>
              </Box>
            )}

            {/* Footer */}
            <Text fontSize="xs" color="gray.400" textAlign="center">
              DeskoPOS
            </Text>
          </VStack>
        </CardBody>
      </Card>
    </Box>
  );
};

export default POSLogin;