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
  if (!value) return 'Not yet';
  return new Date(value.replace(' ', 'T')).toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function setInlineMessage(nodeId, message, ok = false) {
  const node = document.getElementById(nodeId);
  if (!node) return;
  node.textContent = message || '';
  node.className = ok ? 'time-message tag-success' : 'time-message tag-warn';
}

function setTimeMessage(message, ok = false) {
  setInlineMessage('timeMessage', message, ok);
}

function renderAttendanceProgress(today) {
  const chart = document.getElementById('attendanceProgressChart');
  if (!chart) return;

  const steps = [
    { label: 'Time In', done: !!today.hasTimeIn },
    { label: 'Break Out', done: !!today.hasBreakOut },
    { label: 'Break In', done: !!today.hasBreakIn },
    { label: 'Time Out', done: !!today.hasTimeOut }
  ];
  const doneCount = steps.filter((step) => step.done).length;

  chart.innerHTML = `
    <div class="attendance-ring" style="--progress:${doneCount / steps.length}">
      <span>${doneCount}/${steps.length}</span>
    </div>
    <div class="attendance-step-list">
      ${steps.map((step) => `
        <div class="attendance-step ${step.done ? 'done' : ''}">
          <i></i>
          <span>${step.label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPayrollTrend(history) {
  const chart = document.getElementById('employeePayrollTrend');
  if (!chart) return;

  const rows = (history || [])
    .slice(0, 6)
    .reverse()
    .map((row) => ({
      label: row.date_generated ? new Date(String(row.date_generated).replace(' ', 'T')).toLocaleDateString('en-PH', { month: 'short', day: '2-digit' }) : 'Payroll',
      value: Number(row.net_pay || 0)
    }));
  const max = Math.max(...rows.map((row) => row.value), 1);

  if (!rows.length) {
    chart.innerHTML = '<p class="empty-note">No payroll history yet.</p>';
    return;
  }

  chart.innerHTML = rows.map((row) => `
    <div class="trend-column">
      <div class="trend-bar-wrap"><i style="height:${Math.max((row.value / max) * 100, 6)}%"></i></div>
      <strong>${formatMoney(row.value).replace('PHP ', '')}</strong>
      <span>${row.label}</span>
    </div>
  `).join('');
}

function renderProfile(data) {
  const user = data.user || {};
  const employee = data.employee || {};

  const displayName = user.full_name || employee.employee_name || 'Employee';
  document.getElementById('empName').textContent = displayName;
  document.getElementById('welcomeHeader').textContent = `Welcome, ${displayName}`;
  document.getElementById('empRole').textContent = user.role || 'Employee';

  const employeeId = employee.employee_id || employee.id || user.employee_id || user.id || 'N/A';
  const employeeCode = employee.emp_code || employee.employee_code || 'N/A';

  document.getElementById('cardEmpCode').textContent = employee.emp_code || 'N/A';
  document.getElementById('cardDepartment').textContent = employee.department || 'N/A';
  document.getElementById('cardPosition').textContent = employee.position || 'N/A';
  document.getElementById('cardEmploymentStatus').textContent = employee.status || 'N/A';
  document.getElementById('infoEmployeeId').textContent = employeeId;
  document.getElementById('infoEmployeeCode').textContent = employeeCode;
  document.getElementById('infoCompany').textContent = employee.company || 'N/A';
  document.getElementById('infoDepartment').textContent = employee.department || 'N/A';
  document.getElementById('infoPosition').textContent = employee.position || 'N/A';
  document.getElementById('infoStatus').textContent = employee.status || 'N/A';
}

function renderAttendance(data) {
  const today = data.todayTime || {};
  renderAttendanceProgress(today);
  renderPayrollTrend(data.payrollHistory);
  document.getElementById('todayTimeIn').textContent = formatDateTime(today.timeIn);
  document.getElementById('todayBreakOut').textContent = formatDateTime(today.breakOut);
  document.getElementById('todayBreakIn').textContent = formatDateTime(today.breakIn);
  document.getElementById('todayTimeOut').textContent = formatDateTime(today.timeOut);

  const timeInBtn = document.getElementById('btnTimeIn');
  const breakOutBtn = document.getElementById('btnBreakOut');
  const breakInBtn = document.getElementById('btnBreakIn');
  const timeOutBtn = document.getElementById('btnTimeOut');

  const hasTimeIn = !!today.hasTimeIn;
  const hasBreakOut = !!today.hasBreakOut;
  const hasBreakIn = !!today.hasBreakIn;
  const hasTimeOut = !!today.hasTimeOut;

  timeInBtn.disabled = hasTimeIn;
  breakInBtn.disabled = !hasBreakOut || hasBreakIn || hasTimeOut;
  breakOutBtn.disabled = !hasTimeIn || hasBreakOut || hasTimeOut;
  timeOutBtn.disabled = !hasTimeIn || hasTimeOut || (hasBreakOut && !hasBreakIn);

  const logsBody = document.querySelector('#attendanceTable tbody');
  const rows = data.attendanceLogs || [];

  if (!rows.length) {
    logsBody.innerHTML = '<tr><td colspan="3">No attendance logs yet.</td></tr>';
    return;
  }

  logsBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDateTime(row.log_time)}</td>
      <td>${row.action}</td>
      <td><span class="status completed">${row.status || 'Success'}</span></td>
    </tr>
  `).join('');
}


async function fetchDashboardData(userId) {
  const res = await fetch(`/api/employee_dashboard?user_id=${encodeURIComponent(userId)}`);
  const data = await parseApiJson(res, 'Unable to load dashboard data.');

  if (!data.success) {
    throw new Error(data.message || 'Failed to load employee dashboard.');
  }

  return data;
}

async function submitTimeEntry(userId, type) {
  const res = await fetch('/api/employee/time-entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, type })
  });

  const data = await parseApiJson(res, 'Unable to update attendance right now.');
  if (!data.success) {
    throw new Error(data.message || 'Unable to update attendance.');
  }

  return data;
}

async function loadEmployeeDashboard() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    const data = await fetchDashboardData(userId);
    renderProfile(data);
    renderAttendance(data);
  } catch (err) {
    console.error(err);
    setTimeMessage(err.message || 'Failed to load dashboard.');
  }
}

document.getElementById('btnTimeIn').addEventListener('click', async () => {
  const userId = sessionStorage.getItem('user_id');
  try {
    const result = await submitTimeEntry(userId, 'time_in');
    setTimeMessage(result.message, true);
    await loadEmployeeDashboard();
  } catch (err) {
    setTimeMessage(err.message || 'Time In failed.');
  }
});

document.getElementById('btnTimeOut').addEventListener('click', async () => {
  const userId = sessionStorage.getItem('user_id');
  try {
    const result = await submitTimeEntry(userId, 'time_out');
    setTimeMessage(result.message, true);
    await loadEmployeeDashboard();
  } catch (err) {
    setTimeMessage(err.message || 'Time Out failed.');
  }
});

document.getElementById('btnBreakOut').addEventListener('click', async () => {
  const userId = sessionStorage.getItem('user_id');
  try {
    const result = await submitTimeEntry(userId, 'break_out');
    setTimeMessage(result.message, true);
    await loadEmployeeDashboard();
  } catch (err) {
    setTimeMessage(err.message || 'Break Out failed.');
  }
});

document.getElementById('btnBreakIn').addEventListener('click', async () => {
  const userId = sessionStorage.getItem('user_id');
  try {
    const result = await submitTimeEntry(userId, 'break_in');
    setTimeMessage(result.message, true);
    await loadEmployeeDashboard();
  } catch (err) {
    setTimeMessage(err.message || 'Break In failed.');
  }
});

document.getElementById('logout').addEventListener('click', (event) => {
  event.preventDefault();
  sessionStorage.removeItem('user_id');
  sessionStorage.removeItem('admin_name');
  sessionStorage.removeItem('role');
  window.location.href = '../login/login.html';
});

document.addEventListener('DOMContentLoaded', loadEmployeeDashboard);
