import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordToggleIcon from '../components/PasswordToggleIcon.jsx';
import AppIcon from '../components/AppIcon.jsx';
import {
  DEFAULT_ROLE_ACCESS,
  FEATURE_OPTIONS,
  getRoleAccessMap,
  normalizeRole,
  saveRoleAccessMap
} from '../access/roleAccess.js';

const ROLE_SETTINGS = {
  admin: {
    label: 'Admin',
    canManageUsers: true,
    canExportReports: true,
    modules: DEFAULT_ROLE_ACCESS.admin
  },
  hr: {
    label: 'HR',
    canManageUsers: true,
    canExportReports: true,
    modules: DEFAULT_ROLE_ACCESS.hr
  },
  employee: {
    label: 'Employee',
    canManageUsers: false,
    canExportReports: false,
    modules: DEFAULT_ROLE_ACCESS.employee
  },
  unknown: {
    label: 'Unknown',
    canManageUsers: false,
    canExportReports: false,
    modules: ['user-settings']
  }
};

function resolveRoleSettings(rawRole) {
  const role = normalizeRole(rawRole);
  return ROLE_SETTINGS[role] || ROLE_SETTINGS.unknown;
}

export default function UserSettingsPage({ accountOnly = false }) {
  const { user } = useAuth();
  const location = useLocation();
  const forcedPasswordChange = Boolean(location.state?.forcedPasswordChange);
  const roleSettings = resolveRoleSettings(user?.role);
  const normalizedRole = normalizeRole(user?.role);
  const isAdmin = normalizedRole === 'admin';
  const showAdminManagement = isAdmin && !accountOnly;
  const showPersonalSettings = accountOnly || !isAdmin;
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailMessageType, setEmailMessageType] = useState('');

  useEffect(() => {
    const userId = user?.user_id || sessionStorage.getItem('user_id');
    if (!userId) return;
    api.get('/user/email', { params: { user_id: userId } })
      .then(({ data }) => { if (data.success) setEmail(data.email || ''); })
      .catch(() => {});
  }, [user]);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState('hr');
  const [roleAccess, setRoleAccess] = useState(() => getRoleAccessMap());
  const selectedRoleAccess = useMemo(() => new Set(roleAccess[selectedRole] || []), [roleAccess, selectedRole]);
  const currentRoleModules = roleAccess[normalizedRole] || roleSettings.modules;

  function updateRoleFeature(role, featureKey, checked) {
    if (role === 'admin') return;
    setRoleAccess((current) => {
      const currentFeatures = new Set(current[role] || []);
      if (checked) {
        currentFeatures.add(featureKey);
      } else {
        currentFeatures.delete(featureKey);
      }
      return {
        ...current,
        [role]: Array.from(currentFeatures)
      };
    });
  }

  function saveRoleChecker() {
    const nextAccess = saveRoleAccessMap(roleAccess);
    setRoleAccess(nextAccess);
    setMessage('Role checker settings saved.');
    setMessageType('success');
    toast.success('Role checker settings saved.', {
      position: 'bottom-center',
      autoClose: 1500,
      hideProgressBar: true,
      closeButton: false,
      theme: 'colored'
    });
  }

  function resetRoleChecker() {
    const nextAccess = saveRoleAccessMap(DEFAULT_ROLE_ACCESS);
    setRoleAccess(nextAccess);
    setMessage('Role checker settings reset to default.');
    setMessageType('success');
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveEmail(event) {
    event.preventDefault();
    setEmailMessage('');
    setEmailMessageType('');
    const userId = user?.user_id || sessionStorage.getItem('user_id');
    setEmailSaving(true);
    try {
      const { data } = await api.put('/user/email', { user_id: userId, email });
      if (!data.success) throw new Error(data.message || 'Unable to update email.');
      setEmailMessage('Email updated successfully.');
      setEmailMessageType('success');
      toast.success('Email updated successfully.', { position: 'bottom-center', autoClose: 1500, hideProgressBar: true, closeButton: false, theme: 'colored' });
    } catch (err) {
      setEmailMessage(getApiMessage(err, 'Unable to update email.'));
      setEmailMessageType('error');
    } finally {
      setEmailSaving(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setMessage('');
    setMessageType('');

    const resolvedUserId = user?.user_id || sessionStorage.getItem('user_id') || '';
    const resolvedFullName = user?.full_name || sessionStorage.getItem('admin_name') || '';

    if (form.newPassword !== form.confirmPassword) {
      setMessage('New password and confirmation do not match.');
      setMessageType('error');
      return;
    }

    setSaving(true);

    try {
      const { data } = await api.put('/user/password', {
        user_id: resolvedUserId,
        full_name: resolvedFullName,
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword
      });

      if (!data.success) throw new Error(data.message || 'Unable to change password.');

      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage(data.message || 'Password changed successfully.');
      setMessageType('success');
      toast.success('Password changed successfully.', {
        position: 'bottom-center',
        autoClose: 1500,
        hideProgressBar: true,
        closeButton: false,
        theme: 'colored'
      });
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to change password.'));
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="header">
        <h2>{showAdminManagement ? 'User Account Settings' : 'Account Settings'}</h2>
        <p>{showAdminManagement ? 'Manage role access and locked accounts.' : 'Manage your email address and password.'}</p>
      </header>

      {forcedPasswordChange && (
        <div style={{ margin: '0 0 16px', padding: '14px 18px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: '#ffedd5', color: '#c2410c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AppIcon name="alert" size={18} /></span>
          <div>
            <strong style={{ color: '#c2410c', display: 'block', marginBottom: 2 }}>You are using a temporary password</strong>
            <span style={{ fontSize: 13, color: '#9a3412' }}>
              Your account was reactivated by an administrator. Please change your password below before continuing.
            </span>
          </div>
        </div>
      )}

      {showAdminManagement ? (
        <section className="table-section user-settings-section">
          <div className="table-header">
            <div>
              <h3>Role-Based Settings</h3>
              <p>Review your access based on current account role.</p>
            </div>
          </div>

          <div className="summary react-summary role-settings-summary">
            <div className="card"><span>Current Role</span><strong>{roleSettings.label}</strong></div>
            <div className="card"><span>Manage Users</span><strong>{roleSettings.canManageUsers ? 'Allowed' : 'Restricted'}</strong></div>
            <div className="card"><span>Export Reports</span><strong>{roleSettings.canExportReports ? 'Allowed' : 'Restricted'}</strong></div>
            <div className="card"><span>Module Access</span><strong>{currentRoleModules.length}</strong></div>
          </div>

          <div className="role-checker-panel">
            <div className="role-checker-toolbar">
              <label>
                Role Checker
                <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
                  <option value="hr">HR Dashboard</option>
                  <option value="employee">Employee Dashboard</option>
                  <option value="admin">Admin Dashboard</option>
                </select>
              </label>
              <div className="toolbar">
                <button type="button" className="btn" onClick={saveRoleChecker}>Save Access</button>
                <button type="button" className="btn secondary" onClick={resetRoleChecker}>Reset Default</button>
              </div>
            </div>

            <div className="role-module-grid">
              {FEATURE_OPTIONS.map((feature) => (
                <label key={feature.key}>
                  <input
                    type="checkbox"
                    checked={selectedRole === 'admin' ? true : selectedRoleAccess.has(feature.key)}
                    disabled={selectedRole === 'admin'}
                    onChange={(event) => updateRoleFeature(selectedRole, feature.key, event.target.checked)}
                  />
                  <span>{feature.label}</span>
                </label>
              ))}
            </div>
            {selectedRole === 'admin' ? (
              <p className="muted">Admin access is always enabled so the system cannot be locked out.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showPersonalSettings ? (
        <>
          <section className="table-section user-settings-section">
            <div className="table-header">
              <div>
                <h3>Email Address</h3>
                <p>Set the email address where you will receive leave and overtime notifications.</p>
              </div>
            </div>

            <form className="user-settings-form" onSubmit={saveEmail}>
              <label>
                Account
                <input value={user?.full_name || 'User'} disabled />
              </label>
              <label>
                Email Address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. your@email.com"
                  autoComplete="email"
                />
              </label>
              <div className="toolbar">
                <button type="submit" className="btn" disabled={emailSaving}>
                  {emailSaving ? 'Saving...' : 'Save Email'}
                </button>
              </div>
            </form>

            {emailMessage ? <p className={`form-message ${emailMessageType}`}>{emailMessage}</p> : null}
          </section>

          <section className="table-section user-settings-section">
            <div className="table-header">
              <div>
                <h3>Change Password</h3>
                <p>Enter your current password before setting a new one.</p>
              </div>
            </div>

            <form className="user-settings-form" onSubmit={changePassword}>
              <label>
                Account
                <input value={user?.full_name || 'User'} disabled />
              </label>

              <label>
                Current Password
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.currentPassword}
                    onChange={(event) => updateField('currentPassword', event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <PasswordToggleIcon visible={showPassword} />
                  </button>
                </div>
              </label>

              <label>
                New Password
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.newPassword}
                    onChange={(event) => updateField('newPassword', event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <PasswordToggleIcon visible={showPassword} />
                  </button>
                </div>
              </label>

              <label>
                Confirm New Password
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(event) => updateField('confirmPassword', event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <PasswordToggleIcon visible={showPassword} />
                  </button>
                </div>
              </label>

              <div className="toolbar">
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Saving...' : 'Change Password'}
                </button>
              </div>
            </form>

            {message ? <p className={`form-message ${messageType}`}>{message}</p> : null}
          </section>
        </>
      ) : null}

      {showAdminManagement && <LockedAccountsPanel />}
    </>
  );
}

// ── Admin: Locked Accounts Panel ──────────────────────────────────────────────
function LockedAccountsPanel() {
  const [accounts,  setAccounts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [unlocking, setUnlocking] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/locked-accounts');
      setAccounts(data.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleUnlock(userId, fullName) {
    if (unlocking) return;
    setUnlocking(userId);
    try {
      const { data } = await api.post('/admin/unlock-account', { user_id: userId });
      toast.success(data.message || `${fullName} unlocked.`);
      if (data.tempPassword) {
        toast.info(`Temp password for ${fullName}: ${data.tempPassword}`, { autoClose: false, closeButton: true });
      }
      await load();
    } catch (err) {
      toast.error(getApiMessage(err, 'Failed to unlock account.'));
    } finally {
      setUnlocking(null);
    }
  }

  return (
    <section className="table-section user-settings-section">
      <div className="table-header">
        <div>
          <h3>Locked Accounts</h3>
          <p>Accounts locked after 3 failed login attempts. Unlock to send a temporary password via email.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <p className="empty-state">Loading...</p>
      ) : accounts.length === 0 ? (
        <p style={{ color: 'var(--muted,#6b7280)', padding: '0.75rem 0', fontSize: '0.9rem' }}>
          No locked accounts at this time.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Failed Attempts</th>
                <th>Locked At</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => (
                <tr key={acc.user_id}>
                  <td><strong>{acc.username}</strong></td>
                  <td>{acc.full_name}</td>
                  <td>{acc.role}</td>
                  <td style={{ fontSize: '0.82rem' }}>{acc.email || '—'}</td>
                  <td style={{ textAlign: 'center', color: '#b91c1c', fontWeight: 700 }}>{acc.failed_attempts}</td>
                  <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {acc.locked_at
                      ? new Date(acc.locked_at).toLocaleString('en-PH', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
                      : '—'}
                  </td>
                  <td><span className="status pending">{acc.account_status}</span></td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                      disabled={unlocking === acc.user_id}
                      onClick={() => handleUnlock(acc.user_id, acc.full_name)}
                    >
                      {unlocking === acc.user_id ? 'Unlocking...' : 'Unlock & Send Temp PW'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
