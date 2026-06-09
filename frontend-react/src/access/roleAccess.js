export const FEATURE_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'user-settings', label: 'User Settings' },
  { key: 'personal-management', label: 'Personal Management' },
  { key: 'employee-leave-request', label: 'Employee Leave Request' },
  { key: 'employee-overtime-request', label: 'Employee Overtime Request' },
  { key: 'employee-payroll-information', label: 'Employee Payroll Information' },
  { key: 'employee-schedule', label: 'Employee Schedule' },
  { key: 'employee-management', label: 'Employee File' },
  { key: 'employee-documents', label: '201 Files' },
  { key: 'organization-setup', label: 'Organization Setup' },
  { key: 'employee-attendance', label: 'Employee Attendance' },
  { key: 'leave-management', label: 'Leave Management' },
  { key: 'overtime-management', label: 'Overtime Management' },
  { key: 'schedule-management', label: 'Schedule Management' },
  { key: 'leave-calendar', label: 'Company Calendar' },
  { key: 'performance-management', label: 'Performance Management' },
  { key: 'payroll-computation', label: 'Payroll Computation' },
  { key: 'reports', label: 'Payroll Reports' },
  { key: 'government-reports', label: 'Government Reports' },
  { key: 'report-builder', label: 'Report Builder' },
  { key: 'auditing', label: 'Auditing' },
  { key: 'year-end-payroll', label: 'Year-End Payroll' },
  { key: 'loan-deduction-management', label: 'Loan Deductions' },
  { key: 'security-backup', label: 'Security & Backup' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'advanced-modules', label: 'Advanced Modules' },
  { key: 'system-config', label: 'System Configuration' },
  { key: 'about-us', label: 'About Us' },
  { key: 'help', label: 'Help' },
  { key: 'contacts', label: 'Contacts' }
];

const STORAGE_KEY = 'role_feature_access_v1';

const REQUIRED_ROLE_FEATURES = {
  hr: ['leave-calendar'],
  employee: ['leave-calendar']
};

export function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (!role) return 'unknown';
  if (role === 'employee') return 'employee';
  if (role === 'hr' || role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role === 'admin' || role.includes('admin')) return 'admin';
  return 'unknown';
}

export const DEFAULT_ROLE_ACCESS = {
  admin: FEATURE_OPTIONS.map((feature) => feature.key),
  hr: [
    'dashboard',
    'user-settings',
    'employee-management',
    'employee-documents',
    'organization-setup',
    'employee-attendance',
    'leave-management',
    'overtime-management',
    'schedule-management',
    'leave-calendar',
    'performance-management',
    'auditing',
    'utilities',
    'about-us',
    'help',
    'contacts'
  ],
  employee: [
    'dashboard',
    'user-settings',
    'personal-management',
    'employee-leave-request',
    'employee-overtime-request',
    'employee-payroll-information',
    'employee-schedule',
    'leave-calendar',
    'about-us',
    'help',
    'contacts'
  ],
  unknown: []
};

function cleanAccessMap(map) {
  const validKeys = new Set(FEATURE_OPTIONS.map((feature) => feature.key));
  const cleanRole = (role) => Array.from(new Set([
    ...((map?.[role] || DEFAULT_ROLE_ACCESS[role]) || []),
    ...(REQUIRED_ROLE_FEATURES[role] || [])
  ].filter((key) => validKeys.has(key))));

  return {
    admin: [...DEFAULT_ROLE_ACCESS.admin],
    hr: cleanRole('hr'),
    employee: cleanRole('employee'),
    unknown: []
  };
}

export function getRoleAccessMap() {
  if (typeof window === 'undefined') return cleanAccessMap(DEFAULT_ROLE_ACCESS);

  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return cleanAccessMap(stored);
  } catch {
    return cleanAccessMap(DEFAULT_ROLE_ACCESS);
  }
}

export function saveRoleAccessMap(accessMap) {
  const cleanMap = cleanAccessMap(accessMap);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanMap));
    window.dispatchEvent(new CustomEvent('role-access-updated', { detail: cleanMap }));
  }
  return cleanMap;
}

export function canAccessFeature(rawRole, featureKey) {
  const role = normalizeRole(rawRole);
  if (role === 'admin') return true;
  return getRoleAccessMap()[role]?.includes(featureKey) || false;
}

export function getAccessibleFeatures(rawRole) {
  const role = normalizeRole(rawRole);
  return getRoleAccessMap()[role] || [];
}
