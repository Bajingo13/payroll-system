import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HRDashboardPage from './pages/HRDashboardPage.jsx';
import EmployeeDashboardPage from './pages/EmployeeDashboardPage.jsx';
import EmployeeAttendancePage from './pages/EmployeeAttendancePage.jsx';
import LeaveManagementPage from './pages/LeaveManagementPage.jsx';
import EmployeeLeaveRequestPage from './pages/EmployeeLeaveRequestPage.jsx';
import EmployeePayrollInformationPage from './pages/EmployeePayrollInformationPage.jsx';
import EmployeeSchedulePage from './pages/EmployeeSchedulePage.jsx';
import PayrollComputationPage from './pages/PayrollComputationPage.jsx';
import ProfileManagementPage from './pages/ProfileManagementPage.jsx';
import EmployeeManagementPage from './pages/EmployeeManagementPage.jsx';
import ScheduleManagementPage from './pages/ScheduleManagementPage.jsx';
import AuditingPage from './pages/AuditingPage.jsx';  
import ReportsPage from './pages/ReportsPage.jsx';
import UtilitiesPage from './pages/UtilitiesPage.jsx';
import AdvancedModulesPage from './pages/AdvancedModulesPage.jsx';
import './styles.css';

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (!role) return 'unknown';
  if (role === 'employee') return 'employee';
  if (role === 'hr' || role.includes('human resource')) return 'hr';
  if (role === 'admin' || role.includes('admin')) return 'admin';
  return 'unknown';
}

function resolveHomeRoute(rawRole) {
  const role = normalizeRole(rawRole);
  if (role === 'employee') return '/dashboard';
  if (role === 'admin' || role === 'hr') return '/dashboard';
  return '/login';
}

function hasRoleAccess(rawRole, allowedRoles) {
  const role = normalizeRole(rawRole);
  const allowed = (allowedRoles || []).map((item) => normalizeRole(item));
  return allowed.includes(role);
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user?.user_id ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  return hasRoleAccess(user?.role, roles)
    ? children
    : <Navigate to={resolveHomeRoute(user?.role)} replace />;
}

function RoleIndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={resolveHomeRoute(user?.role)} replace />;
}

function DashboardRoute() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  if (role === 'employee') return <EmployeeDashboardPage />;
  if (role === 'hr') return <HRDashboardPage />;
  return <DashboardPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleIndexRedirect />} />

        <Route
          path="employee-dashboard"
          element={<Navigate to="/dashboard" replace />}
        />
        <Route
          path="personal-management"
          element={
            <RoleRoute roles={['employee']}>
              <ProfileManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="employee-leave-request"
          element={
            <RoleRoute roles={['employee']}>
              <EmployeeLeaveRequestPage />
            </RoleRoute>
          }
        />
        <Route
          path="employee-payroll-information"
          element={
            <RoleRoute roles={['employee']}>
              <EmployeePayrollInformationPage />
            </RoleRoute>
          }
        />
        <Route
          path="employee-schedule"
          element={
            <RoleRoute roles={['employee']}>
              <EmployeeSchedulePage />
            </RoleRoute>
          }
        />

        <Route
          path="dashboard"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']}>
              <DashboardRoute />
            </RoleRoute>
          }
        />
        <Route
          path="profile-management"
          element={<Navigate to="/dashboard" replace />}
        />
        <Route
          path="employee-attendance"
          element={
            <RoleRoute roles={['admin', 'hr']}>
              <EmployeeAttendancePage />
            </RoleRoute>
          }
        />
        <Route
          path="leave-management"
          element={
            <RoleRoute roles={['admin', 'hr']}>
              <LeaveManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="employee-management"
          element={
            <RoleRoute roles={['admin', 'hr']}>
              <EmployeeManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="schedule-management"
          element={
            <RoleRoute roles={['admin', 'hr']}>
              <ScheduleManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="payroll-computation"
          element={
            <RoleRoute roles={['admin']}>
              <PayrollComputationPage />
            </RoleRoute>
          }
        />
        <Route
          path="auditing"
          element={
            <RoleRoute roles={['admin', 'hr']}>
              <AuditingPage />
            </RoleRoute>
          }
        />
        <Route path="reports" element={<Navigate to="/reports/payroll-journal" replace />} />
        <Route
          path="reports/:reportType"
          element={
            <RoleRoute roles={['admin']}>
              <ReportsPage />
            </RoleRoute>
          }
        />
        <Route
          path="advanced-modules"
          element={
            <RoleRoute roles={['admin', 'hr']}>
              <AdvancedModulesPage />
            </RoleRoute>
          }
        />
        <Route
          path="utilities"
          element={
            <RoleRoute roles={['admin', 'hr']}>
              <UtilitiesPage />
            </RoleRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
