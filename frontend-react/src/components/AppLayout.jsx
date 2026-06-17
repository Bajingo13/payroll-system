import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext.jsx';
import { canAccessFeature, normalizeRole } from '../access/roleAccess.js';
import astreaBlueLogo from '../assets/astreablue-logo.png';
import NotificationBell from './NotificationBell.jsx';

const SESSION_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_TIMEOUT_MS || 15 * 60 * 1000);

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const avatarStorageKey = user?.user_id ? `profile_avatar_${user.user_id}` : 'profile_avatar';
  const [avatar, setAvatar] = useState('');
  const [openGroups, setOpenGroups] = useState({
    employeeManagement: false,
    payrollReports: false,
    advancedModules: false
  });
  const [, setRoleAccessVersion] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setAvatar(localStorage.getItem(avatarStorageKey) || '');
  }, [avatarStorageKey]);

  useEffect(() => {
    function updateAvatar(event) {
      setAvatar(String(event.detail || localStorage.getItem(avatarStorageKey) || ''));
    }

    window.addEventListener('profile-avatar-updated', updateAvatar);
    return () => window.removeEventListener('profile-avatar-updated', updateAvatar);
  }, [avatarStorageKey]);

  useEffect(() => {
    if (!user?.user_id) return undefined;

    let timeoutId = null;
    let sessionExpired = false;

    const expireSession = () => {
      if (sessionExpired) return;
      sessionExpired = true;

      toast.warning('Your session has expired. Signing off...', {
        position: 'bottom-center',
        autoClose: 1500,
        hideProgressBar: true,
        closeButton: false,
        theme: 'colored'
      });

      window.setTimeout(() => {
        logout().finally(() => {
          navigate('/login', { replace: true });
        });
      }, 900);
    };

    const resetIdleTimer = () => {
      if (sessionExpired) return;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(expireSession, SESSION_TIMEOUT_MS);
    };

    const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [logout, navigate, user?.user_id]);

  useEffect(() => {
    function refreshRoleAccess() {
      setRoleAccessVersion((current) => current + 1);
    }

    window.addEventListener('role-access-updated', refreshRoleAccess);
    window.addEventListener('storage', refreshRoleAccess);
    return () => {
      window.removeEventListener('role-access-updated', refreshRoleAccess);
      window.removeEventListener('storage', refreshRoleAccess);
    };
  }, []);

  async function handleLogout(event) {
    event.preventDefault();
    await logout();
    navigate('/login', { replace: true });
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      localStorage.setItem(avatarStorageKey, result);
      setAvatar(result);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  const isEmployee = normalizeRole(user?.role) === 'employee';
  const isHr = normalizeRole(user?.role) === 'hr';
  const hasFeature = (featureKey) => canAccessFeature(user?.role, featureKey);
  const accountSettingsPath = '/user-settings';
  const accountInitials = String(user?.full_name || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
  const isEmployeeManagementPath = location.pathname.startsWith('/employee-') ||
    location.pathname === '/organization-setup' ||
    location.pathname === '/leave-management' ||
    location.pathname === '/overtime-management' ||
    location.pathname === '/schedule-management' ||
    location.pathname === '/performance-management';
  const isPayrollReportPath = location.pathname.startsWith('/reports') ||
    location.pathname === '/government-reports' ||
    location.pathname === '/report-builder' ||
    location.pathname === '/year-end-payroll' ||
    location.pathname === '/loan-deduction-management';
  const isAdvancedModulesPath = [
    '/advanced-modules',
    '/security-backup',
    '/leave-calendar',
    '/company-settings',
    '/system-config'
  ].includes(location.pathname);

  const employeeNav = [
    { to: '/dashboard', label: 'Dashboard', feature: 'dashboard' },
    { to: '/personal-management', label: 'Personal Management', feature: 'personal-management' },
    { to: '/employee-leave-request', label: 'Leave Request', feature: 'employee-leave-request' },
    { to: '/employee-overtime-request', label: 'Overtime Request', feature: 'employee-overtime-request' },
    { to: '/employee-payroll-information', label: 'Payroll Information', feature: 'employee-payroll-information' },
    { to: '/employee-schedule', label: 'Schedule', feature: 'employee-schedule' },
    { to: '/leave-calendar', label: 'Company Calendar', feature: 'leave-calendar' }
  ];

  const hrWorkforceNav = [
    { to: '/employee-management', label: 'Employee File', feature: 'employee-management' },
    { to: '/employee-documents', label: '201 Files', feature: 'employee-documents' },
    { to: '/organization-setup', label: 'Org Setup', feature: 'organization-setup' },
    { to: '/employee-attendance', label: 'Employee Attendance', feature: 'employee-attendance' },
    { to: '/leave-management', label: 'Leave Management', feature: 'leave-management' },
    { to: '/overtime-management', label: 'Overtime Management', feature: 'overtime-management' },
    { to: '/schedule-management', label: 'Schedule Management', feature: 'schedule-management' },
    { to: '/performance-management', label: 'Performance', feature: 'performance-management' }
  ];

  const adminReportNav = [
    { to: '/reports/payroll-journal', label: 'Payroll Journal', feature: 'reports' },
    { to: '/reports/gross-pay', label: 'Gross Pay', feature: 'reports' },
    { to: '/reports/net-pay', label: 'Net Pay', feature: 'reports' },
    { to: '/reports/payslip', label: 'Payslip', feature: 'reports' },
    { to: '/government-reports', label: 'Government Reports', feature: 'government-reports' },
    { to: '/report-builder', label: 'Report Builder', feature: 'report-builder' },
    { to: '/reports/reconciliation-details', label: 'Reconciliation Details', feature: 'reports' }
  ];

  const hrToolsNav = [
    { to: '/auditing', label: 'Auditing', feature: 'auditing' },
    { to: '/leave-calendar', label: 'Company Calendar', feature: 'leave-calendar' },
    { to: '/utilities', label: 'Utilities', feature: 'utilities' }
  ];

  const adminToolsNav = [
    { to: '/leave-calendar', label: 'Company Calendar', feature: 'leave-calendar' },
    { to: '/company-settings', label: 'Company Settings', feature: 'company-settings' },
    { to: '/security-backup', label: 'Security & Backup', feature: 'security-backup' },
    { to: '/utilities', label: 'Utilities', feature: 'utilities' },
    { to: '/system-config', label: 'System Configuration', feature: 'system-config' }
  ];

  const visibleEmployeeNav = employeeNav.filter((item) => hasFeature(item.feature));
  const visibleHrWorkforceNav = hrWorkforceNav.filter((item) => hasFeature(item.feature));
  const visibleHrToolsNav = hrToolsNav.filter((item) => hasFeature(item.feature));
  const visibleAdminReportNav = adminReportNav.filter((item) => hasFeature(item.feature));
  const visibleAdminToolsNav = adminToolsNav.filter((item) => hasFeature(item.feature));

  useEffect(() => {
    setOpenGroups((current) => ({
      ...current,
      employeeManagement: isEmployeeManagementPath ? true : current.employeeManagement,
      payrollReports: isPayrollReportPath ? true : current.payrollReports,
      advancedModules: isAdvancedModulesPath ? true : current.advancedModules
    }));
  }, [isEmployeeManagementPath, isPayrollReportPath, isAdvancedModulesPath]);

  function toggleGroup(groupKey) {
    setOpenGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey]
    }));
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${drawerOpen ? ' mobile-open' : ''}`}>
        <div className="profile">
          <div className="logo">
            <img src={astreaBlueLogo} alt="AstreaBlue" />
            <span className="logo-tagline">Intelligence Inc.</span>
          </div>
          <button
            type="button"
            className="profile-avatar-button"
            onClick={() => fileInputRef.current?.click()}
            title="Change profile picture"
          >
            {avatar ? (
              <img src={avatar} alt={`${user?.full_name || 'User'} profile`} />
            ) : (
              <span className="profile-avatar-placeholder">Upload your picture here</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            className="profile-avatar-input"
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
          />
          <h3>{user?.full_name || 'User'}</h3>
          <p>{user?.role || 'Employee'}</p>
        </div>

        <nav>
          <ul>
            {isEmployee ? (
              <>
                <li className="nav-section-label">My Work</li>
                {visibleEmployeeNav.map((item) => (
                  <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                ))}
              </>
            ) : isHr ? (
              <>
                <li className="nav-section-label">Overview</li>
                {hasFeature('dashboard') ? <li><NavLink to="/dashboard">HR Dashboard</NavLink></li> : null}

                {visibleHrWorkforceNav.length ? (
                  <>
                    <li className="nav-section-label">HRIS</li>
                    <li className={`nav-group ${openGroups.employeeManagement ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="sidebar-group-trigger"
                        onClick={() => toggleGroup('employeeManagement')}
                      >
                        Employee Records
                      </button>
                      <ul>
                        {visibleHrWorkforceNav.map((item) => (
                          <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                        ))}
                      </ul>
                    </li>
                  </>
                ) : null}

                {visibleHrToolsNav.length ? <li className="nav-section-label">HR Tools</li> : null}
                {visibleHrToolsNav.map((item) => (
                  <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                ))}
              </>
            ) : (
              <>
                <li className="nav-section-label">Overview</li>
                <li><NavLink to="/dashboard">Dashboard</NavLink></li>

                <li className="nav-section-label">HRIS</li>
                <li className={`nav-group ${openGroups.employeeManagement ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="sidebar-group-trigger"
                    onClick={() => toggleGroup('employeeManagement')}
                  >
                    Employee Management
                  </button>
                  <ul>
                    {hrWorkforceNav.map((item) => (
                      <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                    ))}
                  </ul>
                </li>

                <li className="nav-section-label">Payroll & Reports</li>
                <li><NavLink to="/payroll-computation">Payroll Computation</NavLink></li>
                <li><NavLink to="/year-end-payroll">Year-End Payroll</NavLink></li>
                <li><NavLink to="/loan-deduction-management">Loan Deductions</NavLink></li>
                {visibleAdminReportNav.length ? (
                  <li className={`nav-group ${openGroups.payrollReports ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="sidebar-group-trigger"
                      onClick={() => toggleGroup('payrollReports')}
                    >
                      Payroll Summary Report
                    </button>
                    <ul>
                      {visibleAdminReportNav.map((item) => (
                        <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                      ))}
                    </ul>
                  </li>
                ) : null}

                <li className="nav-section-label">System Tools</li>
                <li><NavLink to="/auditing">Auditing</NavLink></li>
                {visibleAdminToolsNav.map((item) => (
                  <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                ))}
              </>
            )}
          </ul>
        </nav>
      </aside>

      {drawerOpen ? (
        <div className="mobile-drawer-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      ) : null}

      <main className="section">
        <div className="page-topbar">
          <button
            type="button"
            className="mobile-hamburger"
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
              </svg>
            )}
          </button>
          <NotificationBell />
          <div className="topbar-divider" />
          <details className="page-account-menu">
          <summary aria-label="Open account menu">
            <span className="page-account-avatar">
              {avatar ? <img src={avatar} alt={`${user?.full_name || 'User'} profile`} /> : <span>{accountInitials}</span>}
            </span>
            <span className="page-account-text">
              <strong>{user?.full_name || 'User'}</strong>
              <small>{user?.role || 'Employee'}</small>
            </span>
          </summary>
          <div className="page-account-dropdown">
            <div className="page-account-card">
              <span className="page-account-avatar page-account-avatar-large">
                {avatar ? <img src={avatar} alt={`${user?.full_name || 'User'} profile`} /> : <span>{accountInitials}</span>}
              </span>
              <div>
                <strong>{user?.full_name || 'User'}</strong>
                <small>{user?.role || 'Employee'}</small>
              </div>
            </div>
            <button type="button" className="page-account-action" onClick={() => fileInputRef.current?.click()}>
              Change Picture
            </button>
            <NavLink className="page-account-action" to={accountSettingsPath}>
              Account Settings
            </NavLink>
            <button type="button" className="page-account-action danger" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </details>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
