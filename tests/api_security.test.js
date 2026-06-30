const test = require('node:test');
const assert = require('node:assert/strict');
const { apiSecurity, normalizeRole } = require('../backend/api_security');

function run({ method = 'GET', path = '/dashboard', user, body = {}, query = {}, headers = {} } = {}) {
  const req = {
    method,
    path,
    body,
    query,
    session: user ? { user } : {},
    get(name) { return headers[String(name).toLowerCase()]; }
  };
  const result = { next: false, status: 200, payload: null };
  const res = {
    status(code) { result.status = code; return this; },
    json(payload) { result.payload = payload; return this; }
  };
  apiSecurity(req, res, () => { result.next = true; });
  return result;
}

test('normalizes supported account roles', () => {
  assert.equal(normalizeRole('Administrator'), 'admin');
  assert.equal(normalizeRole('Human Resource'), 'hr');
  assert.equal(normalizeRole('Employee'), 'employee');
  assert.equal(normalizeRole(''), 'unknown');
});

test('allows public login without a session', () => {
  assert.equal(run({ method: 'POST', path: '/login' }).next, true);
});

test('rejects protected APIs without a session', () => {
  const result = run({ path: '/dashboard' });
  assert.equal(result.status, 401);
  assert.equal(result.next, false);
});

test('rejects HR access to administrator payroll mutations', () => {
  const result = run({ method: 'POST', path: '/payroll_runs', user: { user_id: 2, role: 'HR' } });
  assert.equal(result.status, 403);
});

test('allows administrators to access payroll APIs', () => {
  const result = run({ method: 'POST', path: '/payroll_runs', user: { user_id: 1, role: 'Admin' } });
  assert.equal(result.next, true);
});

test('prevents employees from creating user accounts', () => {
  const result = run({ method: 'POST', path: '/register', user: { user_id: 7, role: 'Employee' } });
  assert.equal(result.status, 403);
});

test('prevents an employee from requesting another user account', () => {
  const result = run({ path: '/employee_dashboard', user: { user_id: 7, role: 'Employee' }, query: { user_id: 8 } });
  assert.equal(result.status, 403);
});

test('allows an employee to request their own account', () => {
  const result = run({ path: '/employee_dashboard', user: { user_id: 7, role: 'Employee' }, query: { user_id: 7 } });
  assert.equal(result.next, true);
});
