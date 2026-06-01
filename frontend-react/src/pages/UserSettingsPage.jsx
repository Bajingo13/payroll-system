import { useState } from 'react';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const MODULE_OPTIONS = [
  ['dashboard', 'Dashboard'],
  ['user-settings', 'User Settings'],
  ['employee-attendance', 'Employee Attendance'],
  ['leave-management', 'Leave Management'],
  ['employee-management', 'Employee Management'],
  ['schedule-management', 'Schedule Management'],
  ['payroll-computation', 'Payroll Computation'],
  ['auditing', 'Auditing'],
  ['reports', 'Reports'],
  ['advanced-modules', 'Advanced Modules'],
  ['utilities', 'Utilities']
];

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (!role) return 'unknown';
  if (role === 'employee') return 'employee';
  if (role === 'hr' || role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role === 'admin' || role.includes('admin')) return 'admin';
  return 'unknown';
}

const ROLE_SETTINGS = {
  admin: {
    label: 'Admin',
    canManageUsers: true,
    canExportReports: true,
    modules: [
      'dashboard',
      'user-settings',
      'employee-attendance',
      'leave-management',
      'employee-management',
      'schedule-management',
      'payroll-computation',
      'auditing',
      'reports',
      'advanced-modules',
      'utilities'
    ]
  },
  hr: {
    label: 'HR',
    canManageUsers: true,
    canExportReports: true,
    modules: [
      'dashboard',
      'user-settings',
      'employee-attendance',
      'leave-management',
      'employee-management',
      'schedule-management',
      'auditing',
      'advanced-modules',
      'utilities'
    ]
  },
  employee: {
    label: 'Employee',
    canManageUsers: false,
    canExportReports: false,
    modules: ['dashboard', 'user-settings']
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

export default function UserSettingsPage() {
  const { user } = useAuth();
  const roleSettings = resolveRoleSettings(user?.role);
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [saving, setSaving] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
        <h2>User Settings</h2>
        <p>Manage your account credentials and sign-in security.</p>
      </header>

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
          <div className="card"><span>Module Access</span><strong>{roleSettings.modules.length}</strong></div>
        </div>

        <div className="role-module-grid">
          {MODULE_OPTIONS.map(([moduleKey, moduleLabel]) => (
            <label key={moduleKey}>
              <input type="checkbox" checked={roleSettings.modules.includes(moduleKey)} readOnly />
              <span>{moduleLabel}</span>
            </label>
          ))}
        </div>
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
            <input
              type="password"
              value={form.currentPassword}
              onChange={(event) => updateField('currentPassword', event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label>
            New Password
            <input
              type="password"
              value={form.newPassword}
              onChange={(event) => updateField('newPassword', event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label>
            Confirm New Password
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField('confirmPassword', event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
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
  );
}
