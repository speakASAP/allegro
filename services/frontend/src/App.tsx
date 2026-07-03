/**
 * Main App Component
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/SettingsPage';
import ImportJobsPage from './pages/ImportJobsPage';
import OrdersPage from './pages/OrdersPage';
import OffersPage from './pages/OffersPage';
import AllegroOAuthCallbackPage from './pages/AllegroOAuthCallbackPage';
import ProductsPage from './pages/ProductsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import OperationsPage from './pages/OperationsPage';
import BuyerOrdersPage from './pages/BuyerOrdersPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<AllegroOAuthCallbackPage />} />
          <Route
            path="/cabinet/orders"
            element={
              <ProtectedRoute>
                <BuyerOrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="products" replace />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="import" element={<ImportJobsPage />} />
            <Route path="offers" element={<OffersPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="operations" element={<OperationsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
