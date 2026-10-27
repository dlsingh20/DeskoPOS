import React, { useEffect } from 'react';
import {
  Box,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  CloseButton,
  useToast,
} from '@chakra-ui/react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { usePOS } from '../../context/POSContext';

// Import components
import MinimalPOSHeader from './MinimalPOSHeader';
import MenuView from '../menu/MenuView';
import UnifiedOrderView from '../orders/UnifiedOrderView';
import ArchiveView from '../archive/ArchiveView';
// import ReportsView from '../reports/ReportsView';
import EnhancedReportsSimple from '../reports/EnhancedReportsSimple';
import KOTTimelineView from '../kitchen/KOTTimelineView';
import FineDineDashboard from '../fineDine/FineDineDashboard';
import LiveOrdersView from '../fineDine/LiveOrdersView';
import HistoryView from '../history/HistoryView';
import PrintSettingsView from '../settings/PrintSettingsView';
import UsersView from '../users/UsersView';
import ReportsView from '../reporting/ReportsView';
import { RequirePermission } from '../../context/AccessContext';
import InventoryView from '../inventory/InventoryView';
import OutstandingOrdersDashboard from '../outstanding/OutstandingOrdersDashboard';
import ProductManagementView from '../products/ProductManagementView';
import TablesConsole from '../tablesAdmin/TablesConsole';
import QrOrderWatcher from '../qrOrders/QrOrderWatcher';
import CashCountersView from '../cashCounter/CashCountersView';

/**
 * Main POS Application Component
 * Handles routing, global state, and layout
 */
const POSApp = ({ onLogout }) => {
  const {
    state,
    clearError
  } = usePOS();

  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();


  // Handle errors with toast notifications
  useEffect(() => {
    if (state.error) {
      toast({
        title: 'Error',
        description: state.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
        onCloseComplete: clearError,
      });
    }
  }, [state.error, toast, clearError]);

  // Default to the Fine Dine dashboard if no path specified
  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/fine-dine', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Use dynamic viewport height for mobile
  const isMobile = window.innerWidth < 768;
  const viewportHeight = isMobile ? 'calc(var(--vh, 1vh) * 100)' : '100vh';

  // Set custom viewport height property for mobile
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);

    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('orientationchange', setVH);
    };
  }, []);

  return (
    <Box h={viewportHeight} bg="background.secondary" overflow="hidden" display="flex" flexDirection="column">
      {/* Minimalistic Header with Navigation - Clean and modern design */}
      <MinimalPOSHeader onLogout={onLogout} />

      {/* Alerts, auto-KOT or accept step for orders guests place by table QR */}
      <QrOrderWatcher />

      {/* Main Content - Fill remaining height */}
      <Box
        flex="1"
        h={{ base: '100%', lg: 'calc(100vh - 70px)' }}
        position="relative"
        overflow="hidden"
      >
        {/* Global Error Display */}
        {state.error && (
          <Box
            position="absolute"
            top="4"
            left="50%"
            transform="translateX(-50%)"
            zIndex={50}
            maxW="container.md"
            w="90%"
          >
            <Alert
              status="error"
              borderRadius="xl"
              p={6}
              boxShadow="lg"
              variant="subtle"
            >
              <AlertIcon />
              <Box>
                <AlertTitle>System Error</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Box>
              <CloseButton
                alignSelf="flex-start"
                position="absolute"
                right={2}
                top={2}
                onClick={clearError}
              />
            </Alert>
          </Box>
        )}

        {/* Routes - Full height container */}
        <Box h="full" overflow="hidden">
          <Routes>
            {/* Fine Dine dashboard is the default/home route */}
            <Route path="/" element={<FineDineDashboard />} />
            <Route path="/fine-dine" element={<FineDineDashboard />} />
            <Route path="/menu" element={<MenuView />} />

            {/* Third-party (Zomato / Swiggy) live orders */}
            <Route path="/third-party" element={<LiveOrdersView />} />

            {/* Table Management - Minimal table view */}
            <Route path="/table-management" element={<Navigate to="/tables" replace />} />

            {/* Tables & QR codes console */}
            <Route path="/tables" element={<RequirePermission permission="settings.manage"><TablesConsole /></RequirePermission>} />

            {/* Unified Orders Management - Today's orders only */}
            <Route path="/orders" element={<UnifiedOrderView />} />

            {/* Product Management - products, categories, import / export */}
            <Route path="/products" element={<RequirePermission permission="settings.manage"><ProductManagementView /></RequirePermission>} />

            {/* Users & Roles - Administrators only */}
            <Route path="/users" element={<RequirePermission permission="users.manage"><UsersView /></RequirePermission>} />

            {/* Settings - bill and KOT print formats */}
            <Route path="/settings/printing" element={<RequirePermission permission="settings.manage"><PrintSettingsView /></RequirePermission>} />

            {/* Settings - cash counters and shifts (Administrators edit counters; Managers close shifts) */}
            <Route path="/settings/cash-counters" element={<RequirePermission permission="settings.manage"><CashCountersView /></RequirePermission>} />

            {/* History - Sales History and Pending Bills */}
            <Route path="/history" element={<HistoryView />} />

            {/* Archive - Historical orders */}
            <Route path="/archive" element={<RequirePermission permission="history.full"><ArchiveView /></RequirePermission>} />

            {/* Reports route - Enhanced analytics dashboard with scrolling */}
            <Route path="/reports" element={<RequirePermission permission="reports.view"><ReportsView /></RequirePermission>} />

            {/* Analytics - charts dashboard from the server report endpoints */}
            <Route path="/analytics" element={<RequirePermission permission="reports.view"><EnhancedReportsSimple /></RequirePermission>} />

            {/* KOT Timeline - Kitchen order tracking */}
            <Route path="/kot-timeline" element={<KOTTimelineView />} />

            {/* Inventory Management */}
            <Route path="/inventory" element={<RequirePermission permission="settings.manage"><InventoryView /></RequirePermission>} />

            {/* Outstanding (unpaid) orders tracking */}
            <Route path="/outstanding" element={<OutstandingOrdersDashboard />} />

            {/* Redirect unknown routes to the Fine Dine dashboard */}
            <Route path="*" element={<Navigate to="/fine-dine" replace />} />
          </Routes>
        </Box>
      </Box>

      {/* Debug Panel for Development
      {process.env.NODE_ENV === 'development' && <SmartRefreshDebugPanel />} */}
    </Box>
  );
};

export default POSApp;
