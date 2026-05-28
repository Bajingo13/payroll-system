let attendanceRecords = [];
let filteredRecords = [];
let currentPage = 1;
let attendanceRefreshTimer = null;
const ATTENDANCE_REFRESH_INTERVAL_MS = 10000;

function getAttendanceSearchTerm() {
  return (document.getElementById('attendanceSearch')?.value || '').trim().toLowerCase();
}

function filterAttendanceRecords(records) {
  const term = getAttendanceSearchTerm();
  return (records || []).filter((record) => {
    if (!term) return true;
    const text = `${record.emp_code || ''} ${record.employee_name || ''} ${record.department || ''}`.toLowerCase();
    return text.includes(term);
  });
}

function exportValue(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function escapeExportHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatExportDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });
}

function downloadAttendanceForExcel() {
  const exportRows = filteredRecords || [];
  if (!exportRows.length) {
    if (typeof showToast === 'function') {
      showToast('No attendance records available to export.', 'error');
    }
    return;
  }

  const headers = [
    'Employee ID',
    'Employee Name',
    'Department',
    'Time In',
    'Break Out',
    'Break In',
    'Time Out',
    'Total Hours',
    'OT Hours',
    'Status'
  ];

  const rows = exportRows.map((record) => {
    const status = getAttendanceStatus(record);
    return [
      record.emp_code || 'N/A',
      record.employee_name || record.full_name || 'N/A',
      record.department || 'N/A',
      formatExportDateTime(record.time_in),
      formatExportDateTime(record.break_out),
      formatExportDateTime(record.break_in),
      formatExportDateTime(record.time_out),
      computeHours(record),
      computeOtHours(record),
      status.label
    ];
  });

  const htmlTable = `
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; }
        th, td { border: 1px solid #999; padding: 6px; mso-number-format:"\\@"; }
        th { background: #f1f1f1; font-weight: bold; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeExportHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeExportHtml(exportValue(cell))}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateSuffix = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `attendance-overview-${dateSuffix}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  if (typeof showToast === 'function') {
    showToast('Attendance records exported successfully.', 'success');
  }
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value.replace(' ', 'T')).toLocaleString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDateLabel(isoDate) {
  if (!isoDate) return '—';
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  });
}

function computeHours(record) {
  if (!record.time_in || !record.time_out) return '—';

  const timeIn = new Date(record.time_in.replace(' ', 'T')).getTime();
  const timeOut = new Date(record.time_out.replace(' ', 'T')).getTime();
  if (timeOut <= timeIn) return '0.00';

  let breakMs = 0;
  if (record.break_out && record.break_in) {
    const breakOut = new Date(record.break_out.replace(' ', 'T')).getTime();
    const breakIn = new Date(record.break_in.replace(' ', 'T')).getTime();
    if (breakIn > breakOut) {
      breakMs = breakIn - breakOut;
    }
  }

  const workedMs = Math.max(0, timeOut - timeIn - breakMs);
  return (workedMs / (1000 * 60 * 60)).toFixed(2);
}

function computeOtHours(record) {
  if (record.ot_hours !== undefined && record.ot_hours !== null && record.ot_hours !== '') {
    return Number(record.ot_hours || 0).toFixed(2);
  }

  if (!record.time_in || !record.time_out) return '—';
  const totalHours = Number(computeHours(record));
  if (Number.isNaN(totalHours)) return '—';
  return Math.max(0, totalHours - 8).toFixed(2);
}

function getAttendanceStatus(record) {
  if (!record.time_in) {
    return { label: 'Absent', className: 'rest' };
  }

  if (!record.time_out) {
    return { label: 'Incomplete', className: 'pending' };
  }

  if (record.break_out && !record.break_in) {
    return { label: 'Incomplete', className: 'pending' };
  }

  return { label: 'Present', className: 'present' };
}

function updateSummary(date) {
  const total = filteredRecords.length;
  const present = filteredRecords.filter((r) => getAttendanceStatus(r).label === 'Present').length;
  const incomplete = filteredRecords.filter((r) => getAttendanceStatus(r).label === 'Incomplete').length;

  document.getElementById('attendanceDate').textContent = formatDateLabel(date);
  document.getElementById('attendanceTotal').textContent = String(total);
  document.getElementById('attendancePresent').textContent = String(present);
  document.getElementById('attendanceIncomplete').textContent = String(incomplete);
}

function renderTable() {
  const tbody = document.getElementById('attendanceRowsBody');
  const pageLabel = document.getElementById('attendancePage');
  const showing = document.getElementById('attendanceShowing');
  const prevBtn = document.getElementById('attendancePrev');
  const nextBtn = document.getElementById('attendanceNext');

  const perPage = Number(document.getElementById('attendanceEntriesSelect').value || 10);
  const total = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * perPage;
  const end = Math.min(start + perPage, total);
  const rows = filteredRecords.slice(start, end);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11">No attendance records found.</td></tr>';
  } else {
    tbody.innerHTML = rows.map((record) => {
      const status = getAttendanceStatus(record);
      const totalHours = computeHours(record);
      const otHours = computeOtHours(record);

      return `
        <tr>
          <td>${record.emp_code || 'N/A'}</td>
          <td>${record.employee_name || record.full_name || 'N/A'}</td>
          <td>${record.department || 'N/A'}</td>
          <td>${formatTime(record.time_in)}</td>
          <td>${formatTime(record.break_out)}</td>
          <td>${formatTime(record.break_in)}</td>
          <td>${formatTime(record.time_out)}</td>
          <td>${totalHours}</td>
          <td>${otHours}</td>
          <td><span class="status ${status.className}">${status.label}</span></td>
          <td><button class="btn small-btn" disabled>View</button></td>
        </tr>
      `;
    }).join('');
  }

  pageLabel.textContent = String(currentPage);
  showing.textContent = `Showing ${total === 0 ? 0 : start + 1} to ${end} of ${total} entries`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

function applyFilters() {
  filteredRecords = filterAttendanceRecords(attendanceRecords);
  currentPage = 1;
  renderTable();
}

async function loadAttendanceOverview() {
  const res = await fetch('/api/attendance_overview');
  const raw = await res.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('Attendance endpoint returned an invalid response.');
  }

  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to load attendance records.');
  }

  attendanceRecords = data.records || [];
  filteredRecords = filterAttendanceRecords(attendanceRecords);
  updateSummary(data.date);
  renderTable();
}

async function refreshAttendanceOverview() {
  try {
    await loadAttendanceOverview();
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('attendanceSearch').addEventListener('input', applyFilters);
  document.getElementById('attendanceEntriesSelect').addEventListener('change', () => {
    currentPage = 1;
    renderTable();
  });

  const exportBtn = document.getElementById('exportAttendanceBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', downloadAttendanceForExcel);
  }

  document.getElementById('attendancePrev').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderTable();
    }
  });

  document.getElementById('attendanceNext').addEventListener('click', () => {
    const perPage = Number(document.getElementById('attendanceEntriesSelect').value || 10);
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / perPage));
    if (currentPage < totalPages) {
      currentPage += 1;
      renderTable();
    }
  });

  try {
    await loadAttendanceOverview();
    if (!attendanceRefreshTimer) {
      attendanceRefreshTimer = window.setInterval(refreshAttendanceOverview, ATTENDANCE_REFRESH_INTERVAL_MS);
    }
  } catch (err) {
    console.error(err);
    document.getElementById('attendanceRowsBody').innerHTML = `<tr><td colspan="11">${err.message || 'Failed to load attendance records.'}</td></tr>`;
  }
});
