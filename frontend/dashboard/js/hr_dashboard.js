function normalizeStatusRows(rows, key = 'status') {
  return (rows || []).map((row) => ({
    label: String(row[key] || row.label || 'Unspecified'),
    value: Number(row.total || row.value || 0)
  }));
}

function formatHrDateTime(value) {
  const date = new Date(String(value || '').replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });
}

function renderHrActivities(logs) {
  const tbody = document.querySelector('#hrActivityTable tbody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">No recent HR activities found.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map((log) => `
    <tr>
      <td>${escapeHtml(formatHrDateTime(log.log_time))}</td>
      <td>${escapeHtml(log.action || 'N/A')}</td>
      <td>${escapeHtml(log.admin_name || 'N/A')}</td>
      <td><span class="status completed">${escapeHtml(log.status || 'N/A')}</span></td>
    </tr>
  `).join('');
}

function getLeaveCount(statusRows, statusLabel) {
  const match = (statusRows || []).find((row) => String(row.status || row.label || '').toLowerCase() === statusLabel);
  return Number((match && (match.total || match.value)) || 0);
}

let hrDashboardRefreshTimer = null;
const HR_DASHBOARD_REFRESH_INTERVAL_MS = 10000;

async function loadHrDashboard() {
  if (!window.location.pathname.includes('/dashboard/hr_dashboard.html')) return;

  const role = String(sessionStorage.getItem('role') || '').toLowerCase();
  if (role && role !== 'hr' && role !== 'admin') {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    const fullName = String(sessionStorage.getItem('admin_name') || '').trim();
    const welcomeNode = document.getElementById('hrWelcomeHeader');
    if (welcomeNode && fullName) {
      welcomeNode.textContent = `Welcome, ${fullName}`;
    }

    const dashboardRes = await fetch('/api/dashboard');
    const dashboardData = await parseApiJson(dashboardRes, 'Unable to load HR dashboard summary.');

    const employeeStatuses = normalizeStatusRows(dashboardData.employeeStatuses, 'status');
    const leaveStatuses = normalizeStatusRows(dashboardData.leaveStatuses, 'status');

    const attendanceRes = await fetch('/api/attendance_overview');
    const attendanceData = await parseApiJson(attendanceRes, 'Unable to load attendance overview.');

    const logsRes = await fetch('/api/audit_logs?limit=8&page=1');
    const logsData = await parseApiJson(logsRes, 'Unable to load activity logs.');

    const totalEmployees = Number(dashboardData.totalEmployees || 0);
    const pendingLeaves = getLeaveCount(leaveStatuses, 'pending');
    const attendanceToday = Number((attendanceData && attendanceData.records && attendanceData.records.length) || 0);
    const systemLogs = Number(dashboardData.systemLogs || 0);

    const totalEmployeesNode = document.getElementById('hrTotalEmployees');
    if (totalEmployeesNode) totalEmployeesNode.textContent = String(totalEmployees);

    const pendingLeavesNode = document.getElementById('hrPendingLeaves');
    if (pendingLeavesNode) pendingLeavesNode.textContent = String(pendingLeaves);

    const attendanceTodayNode = document.getElementById('hrAttendanceToday');
    if (attendanceTodayNode) attendanceTodayNode.textContent = String(attendanceToday);

    const systemLogsNode = document.getElementById('hrSystemLogs');
    if (systemLogsNode) systemLogsNode.textContent = String(systemLogs);

    renderDonutChart('hrEmployeeStatusDonut', 'hrEmployeeStatusLegend', employeeStatuses);
    renderBarChart('hrLeaveStatusChart', leaveStatuses, 'label');
    renderHrActivities((logsData && logsData.logs) || []);
  } catch (error) {
    console.error('HR dashboard error:', error);
    const tbody = document.querySelector('#hrActivityTable tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4">Unable to load HR dashboard data.</td></tr>';
    }

    showToast(error.message || 'Unable to load HR dashboard data.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', loadHrDashboard);
if (!hrDashboardRefreshTimer) {
  hrDashboardRefreshTimer = window.setInterval(loadHrDashboard, HR_DASHBOARD_REFRESH_INTERVAL_MS);
}
