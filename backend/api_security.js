const PUBLIC_ROUTES = new Set([
  'POST /login',
  'POST /login/verify-otp',
  'POST /login/resend-otp',
  'POST /login/request-unlock',
  'POST /password-reset/request',
  'POST /password-reset/confirm',
  'GET /session',
  'GET /health'
]);

const ADMIN_ONLY = [
  /^\/notifications\/test$/,
  /^\/payroll(?:_|-|\/)/,
  /^\/employee_payroll/,
  /^\/save_all_employee_payroll/,
  /^\/delete-employee/,
  /^\/year_end/,
  /^\/annual_payroll/,
  /^\/thirteenth_month/,
  /^\/loan/,
  /^\/reports?\//,
  /^\/system-config/,
  /^\/db-test$/
];

const ADMIN_WRITE_ONLY = [
  /^\/company_settings$/,
  /^\/tax_brackets/,
  /^\/contribution_tables/
];

const ADMIN_HR_WRITE_ONLY = [
  /^\/company-calendar\/events(?:\/|$)/
];

const ADMIN_OR_HR = [
  /^\/admin\//,
  /^\/register$/,
  /^\/dashboard$/,
  /^\/logs$/,
  /^\/attendance_overview/,
  /^\/employee_profile_mgmt/,
  /^\/employees(?:$|\/)/,
  /^\/employee_list/,
  /^\/employee_documents/,
  /^\/organization/,
  /^\/schedule_templates/,
  /^\/admin_schedule/,
  /^\/audit_logs/,
  /^\/government/,
  /^\/report-builder/,
  /^\/system_lists/,
  /^\/allowances/,
  /^\/deductions/,
  /^\/(?:sss|pagibig|philhealth|tax_exemptions|withholding_tax|regional_minimum)/
];

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'hr' || role.includes('human resource')) return 'hr';
  if (role.includes('admin')) return 'admin';
  if (role === 'employee') return 'employee';
  return 'unknown';
}

function matchesAny(path, rules) {
  return rules.some((rule) => rule.test(path));
}

function apiSecurity(req, res, next) {
  const path = req.path === '/' ? '/' : req.path.replace(/\/$/, '');
  if (PUBLIC_ROUTES.has(`${req.method} ${path}`)) return next();

  const user = req.session?.user;
  if (!user?.user_id) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const role = normalizeRole(user.role);
  if (role === 'unknown') {
    return res.status(403).json({ success: false, message: 'Your account role is not authorized.' });
  }

  if (matchesAny(path, ADMIN_ONLY) && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.' });
  }
  if (req.method !== 'GET' && matchesAny(path, ADMIN_WRITE_ONLY) && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.' });
  }
  if (req.method !== 'GET' && matchesAny(path, ADMIN_HR_WRITE_ONLY) && !['admin', 'hr'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Admin or HR access required.' });
  }
  if (matchesAny(path, ADMIN_OR_HR) && !['admin', 'hr'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Admin or HR access required.' });
  }

  if (role === 'employee') {
    const requestedUserId = Number(req.body?.user_id || req.query?.user_id || req.get('x-user-id') || 0);
    if (requestedUserId && requestedUserId !== Number(user.user_id)) {
      return res.status(403).json({ success: false, message: 'You can only access your own account.' });
    }
  }

  req.authUser = { ...user, normalizedRole: role };
  return next();
}

module.exports = { apiSecurity, normalizeRole };
