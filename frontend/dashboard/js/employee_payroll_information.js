function formatMoney(value) {
  const amount = Number(value || 0);
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function parseApiJson(res, fallbackMessage) {
  const raw = await res.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(fallbackMessage || 'Invalid server response. Please refresh and try again.');
  }

  if (!res.ok) {
    throw new Error((data && data.message) || fallbackMessage || 'Request failed.');
  }

  return data;
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  return new Date(value.replace(' ', 'T')).toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

async function fetchDashboardData(userId) {
  const res = await fetch(`/api/employee_dashboard?user_id=${encodeURIComponent(userId)}`);
  const data = await parseApiJson(res, 'Unable to load payroll data.');

  if (!data.success) {
    throw new Error(data.message || 'Failed to load payroll information.');
  }

  return data;
}

function renderHeader(data) {
  const user = data.user || {};
  const employee = data.employee || {};
  const displayName = user.full_name || employee.employee_name || 'Employee';

  document.getElementById('empName').textContent = displayName;
  document.getElementById('empRole').textContent = user.role || 'Employee';
  document.getElementById('welcomeHeader').textContent = `Payroll Information, ${displayName}`;
}

function renderPayroll(data) {
  const summary = data.payrollSummary || {};

  document.getElementById('payInfoRange').textContent = summary.payroll_range || 'N/A';
  document.getElementById('payInfoGenerated').textContent = summary.date_generated ? formatDateTime(summary.date_generated) : 'N/A';
  document.getElementById('payInfoGross').textContent = formatMoney(summary.gross_pay);
  document.getElementById('payInfoDeductions').textContent = formatMoney(summary.total_deductions);
  document.getElementById('payInfoNet').textContent = formatMoney(summary.net_pay);
  document.getElementById('payInfoStatus').textContent = summary.payroll_status || 'No Record';

  const tbody = document.querySelector('#payrollTable tbody');
  const rows = data.payrollHistory || [];

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6">No payroll records found for this employee.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDateTime(row.date_generated)}</td>
      <td>${row.payroll_range || 'N/A'}</td>
      <td>${formatMoney(row.gross_pay)}</td>
      <td>${formatMoney(row.total_deductions)}</td>
      <td>${formatMoney(row.net_pay)}</td>
      <td><span class="status completed">${row.payroll_status || 'Active'}</span></td>
    </tr>
  `).join('');
}

async function loadPayrollInformationPage() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    const data = await fetchDashboardData(userId);
    renderHeader(data);
    renderPayroll(data);
  } catch (err) {
    console.error(err);
    const tbody = document.querySelector('#payrollTable tbody');
    tbody.innerHTML = `<tr><td colspan="6">${err.message || 'Failed to load payroll records.'}</td></tr>`;
  }
}

document.getElementById('logout').addEventListener('click', (event) => {
  event.preventDefault();
  sessionStorage.removeItem('user_id');
  sessionStorage.removeItem('admin_name');
  sessionStorage.removeItem('role');
  window.location.href = '../login/login.html';
});

document.addEventListener('DOMContentLoaded', loadPayrollInformationPage);
