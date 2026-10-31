import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ClientsPage from './pages/ClientsPage';
import NewClientPage from './pages/NewClientPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ActivityPage from './pages/ActivityPage';
import OnboardingPage from './pages/OnboardingPage';
import OnboardingDetailPage from './pages/OnboardingDetailPage';

export default function App() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/clients" replace />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/new" element={<NewClientPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/onboarding/:id" element={<OnboardingDetailPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="*" element={<Navigate to="/clients" replace />} />
      </Routes>
    </Layout>
  );
}
