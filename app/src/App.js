import React, { useState, useEffect } from 'react';
import { ChakraProvider, Spinner, Box, Text, VStack } from '@chakra-ui/react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import theme from './theme';
import { POSProvider } from './context/POSContext';
import { AccessProvider } from './context/AccessContext';
import { CashCounterProvider } from './context/CashCounterContext';
import POSApp from './components/layout/POSApp';
import POSLogin from './components/auth/POSLogin';
import ApiClient from './services/ApiClient';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuthentication = () => {
      const isAuth = ApiClient.isAuthenticated();
      setIsAuthenticated(isAuth);
      setIsLoading(false);
    };

    checkAuthentication();
  }, []);

  const handleLoginSuccess = (result) => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    ApiClient.logout();
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <ChakraProvider theme={theme}>
        <Box minH="100vh" bg="gray.50" display="flex" alignItems="center" justifyContent="center">
          <VStack spacing={4}>
            <Spinner size="xl" color="pos.500" />
            <Text color="gray.600">Loading POS System...</Text>
          </VStack>
        </Box>
      </ChakraProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <ChakraProvider theme={theme}>
        <POSLogin onLoginSuccess={handleLoginSuccess} />
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider theme={theme}>
      <POSProvider>
        <AccessProvider onLogout={handleLogout}>
          <CashCounterProvider onLogout={handleLogout}>
            <Router>
              <Routes>
                <Route path="/*" element={<POSApp onLogout={handleLogout} />} />
              </Routes>
            </Router>
          </CashCounterProvider>
        </AccessProvider>
      </POSProvider>
    </ChakraProvider>
  );
}

export default App;