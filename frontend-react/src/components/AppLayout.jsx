import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext.jsx';
import { api, getAssetUrl } from '../api/client.js';
import { canAccessFeature, normalizeRole } from '../access/roleAccess.js';
import astreaBlueLogo from '../assets/astreablue-logo.png';
import NotificationBell from './NotificationBell.jsx';
import AppIcon from './AppIcon.jsx';

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
  const [companyProfile, setCompanyProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sys_company_profile') || '{}'); }
    catch { return {}; }
  });

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    api.get('/company_settings')
      .then(({ data }) => {
        if (cancelled || !data?.data) return;
        const company = data.data;
        setCompanyProfile(company);
        localStorage.setItem('sys_company_profile', JSON.stringify(company));
        localStorage.setItem('sys_company_name', company.company_name || '');
        document.documentElement.style.setProperty('--system-company-name', JSON.stringify(company.company_name || ''));
        window.dispatchEvent(new CustomEvent('company-settings-updated', { detail: company }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const updateCompany = (event) => setCompanyProfile(event?.detail || {});
    window.addEventListener('company-settings-updated', updateCompany);
    return () => window.removeEventListener('company-settings-updated', updateCompany);
  }, []);

  useEffect(() => {
    setAvatar(localStorage.getItem(avatarStorageKey) || '');
  }, [avatarStorageKey]);

  useEffect(() => {
    if (!user?.user_id) return undefined;

    let cancelled = false;

    async function loadProfilePhoto() {
      try {
        const { data } = await api.get('/profile', {
          params: { user_id: user.user_id }
        });
        const nextAvatar = data.profilePhotoUrl ? getAssetUrl(data.profilePhotoUrl, true) : '';
        if (cancelled || !nextAvatar) return;
        localStorage.setItem(avatarStorageKey, nextAvatar);
        setAvatar(nextAvatar);
      } catch (err) {
        console.warn('Profile photo load failed:', err);
      }
    }

    loadProfilePhoto();

    return () => {
      cancelled = true;
    };
  }, [avatarStorageKey, user?.user_id]);

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

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      event.target.value = '';
      return;
    }

    try {
      const formData = new FormData();
      formData.append('user_id', String(user.user_id));
      formData.append('photo', file);

      const { data } = await api.post('/employee/profile-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to update profile picture.');
      }

      const nextAvatar = getAssetUrl(data.url, true);
      localStorage.setItem(avatarStorageKey, nextAvatar);
      setAvatar(nextAvatar);
      window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: nextAvatar }));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Unable to update profile picture.');
    } finally {
      event.target.value = '';
    }
  }

  const isEmployee = normalizeRole(user?.role) === 'employee';
  const isHr = normalizeRole(user?.role) === 'hr';
  const hasFeature = (featureKey) => canAccessFeature(user?.role, featureKey);
  const accountSettingsPath = '/account-settings';
  const accountInitials = String(user?.full_name || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
  const employeeNav = [
    { to: '/dashboard', label: 'Dashboard', feature: 'dashboard', icon: 'chart' },
    { to: '/personal-management', label: 'My Profile', feature: 'personal-management', icon: 'user' },
    { to: '/employee-leave-request', label: 'Leave Requests', feature: 'employee-leave-request', icon: 'calendar' },
    { to: '/employee-overtime-request', label: 'Overtime Requests', feature: 'employee-overtime-request', icon: 'time' },
    { to: '/employee-attendance-correction', label: 'Attendance Correction', feature: 'employee-attendance-correction', icon: 'clipboard' },
    { to: '/employee-payroll-information', label: 'Payslips & Payroll', feature: 'employee-payroll-information', icon: 'wallet' },
    { to: '/employee-schedule', label: 'My Schedule', feature: 'employee-schedule', icon: 'briefcase' },
    { to: '/leave-calendar', label: 'Company Calendar', feature: 'leave-calendar', icon: 'world' }
  ];

  const hrWorkforceNav = [
    { to: '/employee-management', label: 'Employee File', feature: 'employee-management' },
    { to: '/employee-documents', label: '201 Files', feature: 'employee-documents' },
    { to: '/organization-setup', label: 'Org Setup', feature: 'organization-setup' },
    { to: '/employee-attendance', label: 'Employee Attendance', feature: 'employee-attendance' },
    { to: '/attendance-correction-management', label: 'Attendance Corrections', feature: 'attendance-correction-management' },
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
    { to: '/reports/reconciliation-details', label: 'Bank Reports', feature: 'reports' }
  ];

  const hrToolsNav = [
    { to: '/government-reports', label: 'Government Reports', feature: 'government-reports' },
    { to: '/report-builder', label: 'Report Builder', feature: 'report-builder' },
    { to: '/leave-calendar', label: 'Company Calendar', feature: 'leave-calendar' },
    { to: '/utilities', label: 'Utilities', feature: 'utilities' }
  ];

  const adminToolsNav = [
    { to: '/leave-calendar', label: 'Company Calendar', feature: 'leave-calendar' },
    { to: '/security-backup', label: 'Security & Backup', feature: 'security-backup' },
    { to: '/utilities', label: 'Utilities', feature: 'utilities' },
    { to: '/user-settings', label: 'User Account Settings', feature: 'user-settings' },
    { to: '/system-config', label: 'System Configuration', feature: 'system-config' }
  ];

  const visibleEmployeeNav = employeeNav.filter((item) => hasFeature(item.feature));
  const visibleHrWorkforceNav = hrWorkforceNav.filter((item) => hasFeature(item.feature));
  const visibleHrToolsNav = hrToolsNav.filter((item) => hasFeature(item.feature));
  const visibleAdminReportNav = adminReportNav.filter((item) => hasFeature(item.feature));
  const visibleAdminToolsNav = adminToolsNav.filter((item) => hasFeature(item.feature));

  function getSidebarIcon(to) {
    if (to === '/dashboard') return 'chart';
    if (to.includes('attendance')) return 'time';
    if (to.includes('employee') || to.includes('organization') || to.includes('performance')) return 'users';
    if (to.includes('leave') || to.includes('schedule')) return 'calendar';
    if (to.includes('payroll') || to.includes('payslip') || to.includes('loan')) return 'wallet';
    if (to.includes('government') || to.includes('reconciliation')) return 'building';
    if (to.includes('report')) return 'document';
    if (to.includes('security')) return 'shield';
    if (to.includes('settings') || to.includes('config')) return 'wrench';
    if (to.includes('utilities')) return 'briefcase';
    return 'clipboard';
  }

  function sidebarLink(to, label, icon) {
    return (
      <NavLink className="sidebar-link-with-icon" to={to}>
        <AppIcon name={icon || getSidebarIcon(to)} size={17} />
        <span>{label}</span>
      </NavLink>
    );
  }

  function toggleGroup(groupKey) {
    setOpenGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey]
    }));
  }

  function openGroup(groupKey) {
    setOpenGroups((current) => ({ ...current, [groupKey]: true }));
  }

  function closeGroup(groupKey) {
    setOpenGroups((current) => ({ ...current, [groupKey]: false }));
  }

  return (
    <div className={`app-shell${isEmployee ? ' employee-shell' : ''}`}>
      <aside className={`sidebar${drawerOpen ? ' mobile-open' : ''}`}>
        <div className="profile">
          <div className="logo">
            <img
              src={companyProfile.logo_main || companyProfile.logo_url || astreaBlueLogo}
              alt={companyProfile.company_name || 'Company'}
              className="logo-img"
            />
            <span className="logo-tagline">HRIS · Payroll Platform</span>
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
                  <li key={item.to}>
                    {sidebarLink(item.to, item.label, item.icon)}
                  </li>
                ))}
              </>
            ) : isHr ? (
              <>
                <li className="nav-section-label">Overview</li>
                {hasFeature('dashboard') ? <li>{sidebarLink('/dashboard', 'HR Dashboard')}</li> : null}

                {visibleHrWorkforceNav.length ? (
                  <>
                    <li className="nav-section-label">HRIS</li>
                    <li
                      className={`nav-group ${openGroups.employeeManagement ? 'open' : ''}`}
                      onMouseEnter={() => openGroup('employeeManagement')}
                      onMouseLeave={() => closeGroup('employeeManagement')}
                    >
                      <button
                        type="button"
                        className="sidebar-group-trigger"
                        onClick={() => toggleGroup('employeeManagement')}
                      >
                        <span className="sidebar-trigger-label"><AppIcon name="users" size={17} /> Employee Records</span>
                      </button>
                      <ul>
                        {visibleHrWorkforceNav.map((item) => (
                          <li key={item.to}>{sidebarLink(item.to, item.label)}</li>
                        ))}
                      </ul>
                    </li>
                  </>
                ) : null}

                {visibleHrToolsNav.length ? <li className="nav-section-label">HR Tools</li> : null}
                {visibleHrToolsNav.map((item) => (
                  <li key={item.to}>{sidebarLink(item.to, item.label)}</li>
                ))}
              </>
            ) : (
              <>
                <li className="nav-section-label">Overview</li>
                <li>{sidebarLink('/dashboard', 'Dashboard')}</li>

                <li className="nav-section-label">HRIS</li>
                <li
                  className={`nav-group ${openGroups.employeeManagement ? 'open' : ''}`}
                  onMouseEnter={() => openGroup('employeeManagement')}
                  onMouseLeave={() => closeGroup('employeeManagement')}
                >
                  <button
                    type="button"
                    className="sidebar-group-trigger"
                    onClick={() => toggleGroup('employeeManagement')}
                  >
                    <span className="sidebar-trigger-label"><AppIcon name="users" size={17} /> Employee Management</span>
                  </button>
                  <ul>
                    {hrWorkforceNav.map((item) => (
                      <li key={item.to}>{sidebarLink(item.to, item.label)}</li>
                    ))}
                  </ul>
                </li>

                <li className="nav-section-label">Payroll & Reports</li>
                <li>{sidebarLink('/payroll-computation', 'Payroll Computation')}</li>
                <li>{sidebarLink('/year-end-payroll', 'Year-End Payroll')}</li>
                <li>{sidebarLink('/loan-deduction-management', 'Loan Deductions')}</li>
                {visibleAdminReportNav.length ? (
                  <li
                    className={`nav-group ${openGroups.payrollReports ? 'open' : ''}`}
                    onMouseEnter={() => openGroup('payrollReports')}
                    onMouseLeave={() => closeGroup('payrollReports')}
                  >
                    <button
                      type="button"
                      className="sidebar-group-trigger"
                      onClick={() => toggleGroup('payrollReports')}
                    >
                      <span className="sidebar-trigger-label"><AppIcon name="document" size={17} /> Payroll Summary Report</span>
                    </button>
                    <ul>
                      {visibleAdminReportNav.map((item) => (
                        <li key={item.to}>{sidebarLink(item.to, item.label)}</li>
                      ))}
                    </ul>
                  </li>
                ) : null}

                <li className="nav-section-label">System Tools</li>
                {visibleAdminToolsNav.map((item) => (
                  <li key={item.to}>{sidebarLink(item.to, item.label)}</li>
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
