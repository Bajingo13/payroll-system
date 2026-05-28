import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (!role) return 'unknown';
  if (role === 'employee') return 'employee';
  if (role === 'hr' || role.includes('human resource')) return 'hr';
  if (role === 'admin' || role.includes('admin')) return 'admin';
  return 'unknown';
}

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

  function handleLogout(event) {
    event.preventDefault();
    logout();
    navigate('/login');
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
  const accountSettingsPath = isEmployee ? '/personal-management' : '/utilities';
  const accountInitials = String(user?.full_name || 'User')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
  const isEmployeeManagementPath = location.pathname.startsWith('/employee-') || location.pathname === '/leave-management' || location.pathname === '/schedule-management';
  const isPayrollReportPath = location.pathname.startsWith('/reports');
  const isAdvancedModulesPath = location.pathname === '/advanced-modules';

  const employeeNav = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/personal-management', label: 'Personal Management' },
    { to: '/employee-leave-request', label: 'Leave Request' },
    { to: '/employee-payroll-information', label: 'Payroll Information' },
    { to: '/employee-schedule', label: 'Schedule' }
  ];

  const hrWorkforceNav = [
    { to: '/employee-management', label: 'Employee File' },
    { to: '/employee-attendance', label: 'Employee Attendance' },
    { to: '/leave-management', label: 'Leave Management' },
    { to: '/schedule-management', label: 'Schedule Management' }
  ];

  const adminReportNav = [
    { to: '/reports/payroll-journal', label: 'Payroll Journal' },
    { to: '/reports/gross-pay', label: 'Gross Pay' },
    { to: '/reports/net-pay', label: 'Net Pay' },
    { to: '/reports/payslip', label: 'Payslip' },
    { to: '/reports/reconciliation-details', label: 'Reconciliation Details' }
  ];

  const hrToolsNav = [
    { to: '/auditing', label: 'Auditing' },
    { to: '/advanced-modules', label: 'Advanced Modules' },
    { to: '/utilities', label: 'Utilities' }
  ];

  const adminToolsNav = [
    { to: '/advanced-modules', label: 'Advanced Modules' },
    { to: '/utilities', label: 'Utilities' }
  ];

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
      <aside className="sidebar">
        <div className="profile">
          <div className="logo">Astreablue Intelligence Inc.</div>
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
                {employeeNav.map((item) => (
                  <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                ))}
              </>
            ) : isHr ? (
              <>
                <li className="nav-section-label">Overview</li>
                <li><NavLink to="/dashboard">HR Dashboard</NavLink></li>

                <li className="nav-section-label">Workforce Management</li>
                <li className={`nav-group ${openGroups.employeeManagement ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="sidebar-group-trigger"
                    onClick={() => toggleGroup('employeeManagement')}
                  >
                    Employee Records
                  </button>
                  <ul>
                    {hrWorkforceNav.map((item) => (
                      <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                    ))}
                  </ul>
                </li>

                <li className="nav-section-label">HR Tools</li>
                {hrToolsNav.map((item) => (
                  <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                ))}
              </>
            ) : (
              <>
                <li className="nav-section-label">Overview</li>
                <li><NavLink to="/dashboard">Dashboard</NavLink></li>

                <li className="nav-section-label">Workforce Management</li>
                <li className={`nav-group ${openGroups.employeeManagement ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="sidebar-group-trigger"
                    onClick={() => toggleGroup('employeeManagement')}
                  >
                    Employee Management
                  </button>
                  <ul>
                    <li><NavLink to="/employee-management">Employee File</NavLink></li>
                    <li><NavLink to="/schedule-management">Schedule Management</NavLink></li>
                    <li><NavLink to="/employee-attendance">Employee Attendance</NavLink></li>
                    <li><NavLink to="/leave-management">Leave Management</NavLink></li>
                  </ul>
                </li>

                <li className="nav-section-label">Payroll & Reports</li>
                <li><NavLink to="/payroll-computation">Payroll Computation</NavLink></li>
                <li className={`nav-group ${openGroups.payrollReports ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="sidebar-group-trigger"
                    onClick={() => toggleGroup('payrollReports')}
                  >
                    Payroll Summary Report
                  </button>
                  <ul>
                    {adminReportNav.map((item) => (
                      <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                    ))}
                  </ul>
                </li>

                <li className="nav-section-label">System Tools</li>
                <li><NavLink to="/auditing">Auditing</NavLink></li>
                {adminToolsNav.map((item) => (
                  <li key={item.to}><NavLink to={item.to}>{item.label}</NavLink></li>
                ))}
              </>
            )}
          </ul>
        </nav>
      </aside>

      <main className="section">
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
        <Outlet />
      </main>
    </div>
  );
}
