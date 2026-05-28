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

function setLeaveMessage(message, ok = false) {
  setInlineMessage('leaveMessage', message, ok);
}

let leaveState = {
  leaveTypes: [],
  leaveBalances: [],
  leaveRequests: [],
  calendarMonthDate: new Date()
};

let leaveRefreshTimer = null;
const LEAVE_REFRESH_INTERVAL_MS = 10000;

function statusClassFromLeave(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'cancelled') return 'cancelled';
  return 'pending';
}

function renderLeaveTypeOptions(types) {
  const select = document.getElementById('leaveTypeSelect');
  if (!select) return;

  const current = select.value;
  const options = ['<option value="">Select leave type</option>'];

  types.forEach((type) => {
    options.push(`<option value="${type.leave_type_id}">${type.leave_name}</option>`);
  });

  select.innerHTML = options.join('');
  if (current) {
    select.value = current;
  }
}

function renderLeaveBalances(balances) {
  const container = document.getElementById('leaveBalanceList');
  if (!container) return;

  if (!balances || !balances.length) {
    container.innerHTML = '<p class="empty-note">No leave balances configured.</p>';
    return;
  }

  container.innerHTML = balances.map((item) => `
    <div class="leave-balance-item">
      <span>${item.leave_name}</span>
      <strong>${Number(item.remaining_days || 0).toFixed(2)} day(s)</strong>
      <small>Allocated: ${Number(item.allocation_days || 0).toFixed(2)} | Used: ${Number(item.used_days || 0).toFixed(2)}</small>
    </div>
  `).join('');
}

function renderLeaveRequests(requests) {
  const tbody = document.querySelector('#leaveRequestTable tbody');
  if (!tbody) return;

  if (!requests || !requests.length) {
    tbody.innerHTML = '<tr><td colspan="6">No leave requests found.</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map((item) => {
    const statusClass = statusClassFromLeave(item.status);
    return `
      <tr>
        <td>${formatDateTime(item.created_at)}</td>
        <td>${item.leave_name || 'N/A'}</td>
        <td>${item.start_date || 'N/A'} to ${item.end_date || 'N/A'}</td>
        <td>${Number(item.total_days || 0).toFixed(2)}</td>
        <td><span class="status ${statusClass}">${item.status || 'Pending'}</span></td>
        <td>${item.reason || 'N/A'}</td>
      </tr>
    `;
  }).join('');
}

function renderLeaveCalendar(requests) {
  const titleNode = document.getElementById('leaveCalendarTitle');
  const gridNode = document.getElementById('leaveCalendarGrid');
  if (!titleNode || !gridNode) return;

  const current = leaveState.calendarMonthDate;
  const year = current.getFullYear();
  const month = current.getMonth();

  titleNode.textContent = current.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  const leading = startOfMonth.getDay();
  const daysInMonth = endOfMonth.getDate();

  const requestsInMonth = (requests || []).filter((item) => {
    const start = new Date(`${item.start_date}T00:00:00`);
    const end = new Date(`${item.end_date}T00:00:00`);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth);
    return end >= monthStart && start <= monthEnd;
  });

  const weekHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = weekHeaders.map((d) => `<div class="calendar-head">${d}</div>`).join('');

  for (let i = 0; i < leading; i += 1) {
    html += '<div class="calendar-cell muted"></div>';
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const currentDate = new Date(year, month, day);
    const dateKey = currentDate.toISOString().slice(0, 10);

    const marks = requestsInMonth.filter((item) => {
      const start = new Date(`${item.start_date}T00:00:00`);
      const end = new Date(`${item.end_date}T00:00:00`);
      return currentDate >= start && currentDate <= end;
    });

    const marker = marks[0] ? statusClassFromLeave(marks[0].status) : '';
    const markerDot = marker ? `<i class="dot ${marker}"></i>` : '';
    const title = marks.map((m) => `${m.leave_name} (${m.status})`).join(' | ');

    html += `<div class="calendar-cell ${marker ? `has-${marker}` : ''}" title="${title}">
      <span>${day}</span>
      ${markerDot}
      <small>${dateKey}</small>
    </div>`;
  }

  gridNode.innerHTML = html;
}

function renderLeaveSection() {
  renderLeaveTypeOptions(leaveState.leaveTypes);
  renderLeaveBalances(leaveState.leaveBalances);
  renderLeaveRequests(leaveState.leaveRequests);
  renderLeaveCalendar(leaveState.leaveRequests);
}

async function fetchLeaveOverview(userId) {
  const res = await fetch(`/api/employee/leave-overview?user_id=${encodeURIComponent(userId)}&_ts=${Date.now()}`, {
    cache: 'no-store'
  });
  const data = await parseApiJson(res, 'Unable to load leave information.');

  if (!data.success) {
    throw new Error(data.message || 'Failed to load leave data.');
  }

  return data;
}

async function submitLeaveRequest(userId, payload) {
  const res = await fetch('/api/employee/leave-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, ...payload })
  });

  const data = await parseApiJson(res, 'Unable to submit leave request.');
  if (!data.success) {
    throw new Error(data.message || 'Leave request failed.');
  }

  return data;
}

async function loadLeaveOverview(userId) {
  try {
    const data = await fetchLeaveOverview(userId);
    leaveState.leaveTypes = data.leaveTypes || [];
    leaveState.leaveBalances = data.leaveBalances || [];
    leaveState.leaveRequests = data.leaveRequests || [];
    renderLeaveSection();
  } catch (err) {
    console.error(err);
    setLeaveMessage(err.message || 'Unable to load leave information.');
  }
}

async function fetchEmployeeDashboardHeader(userId) {
  const res = await fetch(`/api/employee_dashboard?user_id=${encodeURIComponent(userId)}`);
  const data = await parseApiJson(res, 'Unable to load employee details.');

  if (!data.success) {
    throw new Error(data.message || 'Failed to load employee details.');
  }

  const user = data.user || {};
  const employee = data.employee || {};
  const displayName = user.full_name || employee.employee_name || 'Employee';

  document.getElementById('empName').textContent = displayName;
  document.getElementById('welcomeHeader').textContent = `Leave Management, ${displayName}`;
  document.getElementById('empRole').textContent = user.role || 'Employee';
}

async function loadLeaveManagementPage() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    await fetchEmployeeDashboardHeader(userId);
    await loadLeaveOverview(userId);
    if (!leaveRefreshTimer) {
      leaveRefreshTimer = window.setInterval(() => {
        loadLeaveOverview(userId).catch((err) => {
          console.error('Leave refresh failed:', err);
        });
      }, LEAVE_REFRESH_INTERVAL_MS);
    }
  } catch (err) {
    console.error(err);
    setLeaveMessage(err.message || 'Failed to load leave management data.');
  }
}

document.getElementById('leaveRequestForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    const payload = {
      leave_type_id: Number(document.getElementById('leaveTypeSelect').value),
      start_date: document.getElementById('leaveStartDate').value,
      end_date: document.getElementById('leaveEndDate').value,
      reason: document.getElementById('leaveReason').value.trim()
    };

    const result = await submitLeaveRequest(userId, payload);
    setLeaveMessage(result.message || 'Leave request submitted.', true);
    event.target.reset();
    await loadLeaveOverview(userId);
  } catch (err) {
    console.error(err);
    setLeaveMessage(err.message || 'Failed to submit leave request.');
  }
});

document.getElementById('leavePrevMonth').addEventListener('click', () => {
  leaveState.calendarMonthDate = new Date(
    leaveState.calendarMonthDate.getFullYear(),
    leaveState.calendarMonthDate.getMonth() - 1,
    1
  );
  renderLeaveCalendar(leaveState.leaveRequests);
});

document.getElementById('leaveNextMonth').addEventListener('click', () => {
  leaveState.calendarMonthDate = new Date(
    leaveState.calendarMonthDate.getFullYear(),
    leaveState.calendarMonthDate.getMonth() + 1,
    1
  );
  renderLeaveCalendar(leaveState.leaveRequests);
});

document.getElementById('logout').addEventListener('click', (event) => {
  event.preventDefault();
  sessionStorage.removeItem('user_id');
  sessionStorage.removeItem('admin_name');
  sessionStorage.removeItem('role');
  window.location.href = '../login/login.html';
});

document.addEventListener('DOMContentLoaded', loadLeaveManagementPage);

window.addEventListener('beforeunload', () => {
  if (leaveRefreshTimer) {
    clearInterval(leaveRefreshTimer);
    leaveRefreshTimer = null;
  }
});
