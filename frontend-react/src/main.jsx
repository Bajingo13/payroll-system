import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HRDashboardPage from './pages/HRDashboardPage.jsx';
import EmployeeDashboardPage from './pages/EmployeeDashboardPage.jsx';
import EmployeeAttendancePage from './pages/EmployeeAttendancePage.jsx';
import LeaveManagementPage from './pages/LeaveManagementPage.jsx';
import EmployeeLeaveRequestPage from './pages/EmployeeLeaveRequestPage.jsx';
import OvertimeManagementPage from './pages/OvertimeManagementPage.jsx';
import EmployeeOvertimeRequestPage from './pages/EmployeeOvertimeRequestPage.jsx';
import EmployeeAttendanceCorrectionPage from './pages/EmployeeAttendanceCorrectionPage.jsx';
import AttendanceCorrectionManagementPage from './pages/AttendanceCorrectionManagementPage.jsx';
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
import EmployeeDocumentsPage from './pages/EmployeeDocumentsPage.jsx';
import YearEndPayrollPage from './pages/YearEndPayrollPage.jsx';
import LoanDeductionPage from './pages/LoanDeductionPage.jsx';
import SystemConfigPage from './pages/SystemConfigPage.jsx';
import GovernmentReportsPage from './pages/GovernmentReportsPage.jsx';
import CompanySettingsPage from './pages/CompanySettingsPage.jsx';
import UserSettingsPage from './pages/UserSettingsPage.jsx';
import AboutUsPage from './pages/AboutUsPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import { canAccessFeature, getAccessibleFeatures, normalizeRole } from './access/roleAccess.js';
import './styles.css';

const FEATURE_HOME_ROUTES = {
  dashboard: '/dashboard',
  'user-settings': '/user-settings',
  'personal-management': '/personal-management',
  'employee-leave-request': '/employee-leave-request',
  'employee-overtime-request': '/employee-overtime-request',
  'employee-attendance-correction': '/employee-attendance-correction',
  'attendance-correction-management': '/attendance-correction-management',
  'employee-payroll-information': '/employee-payroll-information',
  'employee-schedule': '/employee-schedule',
  'employee-management': '/employee-management',
  'employee-documents': '/employee-documents',
  'organization-setup': '/organization-setup',
  'employee-attendance': '/employee-attendance',
  'leave-management': '/leave-management',
  'overtime-management': '/overtime-management',
  'schedule-management': '/schedule-management',
  'leave-calendar': '/leave-calendar',
  'performance-management': '/performance-management',
  'payroll-computation': '/payroll-computation',
  reports: '/reports/payroll-journal',
  'government-reports': '/government-reports',
  'report-builder': '/report-builder',
  auditing: '/auditing',
  'year-end-payroll': '/year-end-payroll',
  'loan-deduction-management': '/loan-deduction-management',
  'security-backup': '/security-backup',
  utilities: '/utilities',
  'advanced-modules': '/advanced-modules',
  'system-config': '/system-config',
  'company-settings': '/company-settings',
  'about-us': '/about-us',
  help: '/help',
  contacts: '/contacts'
};

function resolveHomeRoute(rawRole) {
  const role = normalizeRole(rawRole);
  if (role === 'admin') return '/dashboard';
  const firstFeature = getAccessibleFeatures(role).find((feature) => FEATURE_HOME_ROUTES[feature]);
  if (firstFeature) return FEATURE_HOME_ROUTES[firstFeature];
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

function RoleRoute({ roles, feature, children }) {
  const { user } = useAuth();
  return hasRoleAccess(user?.role, roles) && (!feature || canAccessFeature(user?.role, feature))
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
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/about-us" element={<AboutUsPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/contacts" element={<ContactsPage />} />

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
            <RoleRoute roles={['employee']} feature="personal-management">
              <ProfileManagementPage />
            </RoleRoute>
          }
        />

        <Route
          path="employee-leave-request"
          element={
            <RoleRoute roles={['employee']} feature="employee-leave-request">
              <EmployeeLeaveRequestPage />
            </RoleRoute>
          }
        />

        <Route
          path="employee-payroll-information"
          element={
            <RoleRoute roles={['employee']} feature="employee-payroll-information">
              <EmployeePayrollInformationPage />
            </RoleRoute>
          }
        />

        <Route
          path="employee-schedule"
          element={
            <RoleRoute roles={['employee']} feature="employee-schedule">
              <EmployeeSchedulePage />
            </RoleRoute>
          }
        />

        <Route
          path="dashboard"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']} feature="dashboard">
              <DashboardRoute />
            </RoleRoute>
          }
        />

        <Route
          path="employee-overtime-request"
          element={
            <RoleRoute roles={['employee']} feature="employee-overtime-request">
              <EmployeeOvertimeRequestPage />
            </RoleRoute>
          }
        />

        <Route
          path="employee-attendance-correction"
          element={
            <RoleRoute roles={['employee']} feature="employee-attendance-correction">
              <EmployeeAttendanceCorrectionPage />
            </RoleRoute>
          }
        />

        <Route
          path="attendance-correction-management"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="attendance-correction-management">
              <AttendanceCorrectionManagementPage />
            </RoleRoute>
          }
        />

        <Route
          path="user-settings"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']} feature="user-settings">
              <UserSettingsPage />
            </RoleRoute>
          }
        />

        <Route
          path="account-settings"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']} feature="user-settings">
              <UserSettingsPage accountOnly />
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
            <RoleRoute roles={['admin', 'hr']} feature="employee-attendance">
              <EmployeeAttendancePage />
            </RoleRoute>
          }
        />

        <Route
          path="leave-management"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="leave-management">
              <LeaveManagementPage />
            </RoleRoute>
          }
        />

        <Route
          path="employee-management"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="employee-management">
              <EmployeeManagementPage />
            </RoleRoute>
          }
        />

        <Route
          path="schedule-management"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="schedule-management">
              <ScheduleManagementPage />
            </RoleRoute>
          }
        />

        <Route
          path="payroll-computation"
          element={
            <RoleRoute roles={['admin']} feature="payroll-computation">
              <PayrollComputationPage />
            </RoleRoute>
          }
        />

        <Route
          path="auditing"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="auditing">
              <AuditingPage />
            </RoleRoute>
          }
        />

        <Route
          path="reports"
          element={<Navigate to="/reports/payroll-journal" replace />}
        />

        <Route
          path="reports/:reportType"
          element={
            <RoleRoute roles={['admin']} feature="reports">
              <ReportsPage />
            </RoleRoute>
          }
        />

        <Route
          path="advanced-modules"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="advanced-modules">
              <AdvancedModulesPage />
            </RoleRoute>
          }
        />

        <Route
          path="overtime-management"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="overtime-management">
              <OvertimeManagementPage />
            </RoleRoute>
          }
        />

        <Route
          path="employee-documents"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="employee-documents">
              <EmployeeDocumentsPage />
            </RoleRoute>
          }
        />

        <Route
          path="organization-setup"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="organization-setup">
              <AdvancedModulesPage moduleKey="organization" />
            </RoleRoute>
          }
        />

        <Route
          path="year-end-payroll"
          element={
            <RoleRoute roles={['admin']} feature="year-end-payroll">
              <YearEndPayrollPage />
            </RoleRoute>
          }
        />

        <Route
          path="loan-deduction-management"
          element={
            <RoleRoute roles={['admin']} feature="loan-deduction-management">
              <LoanDeductionPage />
            </RoleRoute>
          }
        />

        <Route
          path="government-reports"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="government-reports">
              <GovernmentReportsPage />
            </RoleRoute>
          }
        />

        <Route
          path="leave-calendar"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']} feature="leave-calendar">
              <AdvancedModulesPage moduleKey="leave" />
            </RoleRoute>
          }
        />

        <Route
          path="performance-management"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="performance-management">
              <AdvancedModulesPage moduleKey="performance" />
            </RoleRoute>
          }
        />

        <Route
          path="report-builder"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="report-builder">
              <AdvancedModulesPage moduleKey="reports" />
            </RoleRoute>
          }
        />

        <Route
          path="security-backup"
          element={
            <RoleRoute roles={['admin']} feature="security-backup">
              <AdvancedModulesPage moduleKey="security" />
            </RoleRoute>
          }
        />

        <Route
          path="analytics-dashboard"
          element={<Navigate to="/dashboard" replace />}
        />

        <Route
          path="utilities"
          element={
            <RoleRoute roles={['admin', 'hr']} feature="utilities">
              <UtilitiesPage />
            </RoleRoute>
          }
        />

        <Route
          path="system-config"
          element={
            <RoleRoute roles={['admin']} feature="system-config">
              <SystemConfigPage />
            </RoleRoute>
          }
        />

        <Route
          path="company-settings"
          element={
            <RoleRoute roles={['admin']} feature="company-settings">
              <CompanySettingsPage />
            </RoleRoute>
          }
        />

        <Route
          path="about-us"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']} feature="about-us">
              <AboutUsPage />
            </RoleRoute>
          }
        />

        <Route
          path="help"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']} feature="help">
              <HelpPage />
            </RoleRoute>
          }
        />

        <Route
          path="contacts"
          element={
            <RoleRoute roles={['admin', 'hr', 'employee']} feature="contacts">
              <ContactsPage />
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

        <ToastContainer
          position="bottom-center"
          autoClose={1500}
          newestOnTop
          closeOnClick
          pauseOnHover={false}
          theme="colored"
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
