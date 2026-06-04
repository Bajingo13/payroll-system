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

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pdfEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function makeSimplePdf(title, headers, rows) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 28;
  const lineHeight = 11;
  const maxLines = Math.floor((pageHeight - margin * 2 - 50) / lineHeight);
  const widths = [10, 18, 14, 14, 14, 14, 14, 9, 8, 11];
  const totalWidth = widths.reduce((sum, value) => sum + value, 0);

  function fit(value, width) {
    const size = Math.max(6, Math.floor((width / totalWidth) * 145));
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > size ? `${text.slice(0, size - 3)}...` : text.padEnd(size, ' ');
  }

  const lines = [
    title,
    `Generated: ${new Date().toLocaleString('en-PH')}`,
    `Rows: ${rows.length}`,
    '',
    headers.map((header, index) => fit(header, widths[index])).join(' | '),
    '-'.repeat(145),
    ...rows.map((row) => row.map((cell, index) => fit(cell, widths[index])).join(' | '))
  ];

  const pages = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    pages.push(lines.slice(i, i + maxLines));
  }

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const contentIds = pages.map((pageLines, pageIndex) => {
    const stream = [
      'BT',
      '/F1 7 Tf',
      `${margin} ${pageHeight - margin} Td`,
      ...pageLines.map((line, index) => `${index === 0 ? '' : `0 -${lineHeight} Td `}(${pdfEscape(line)}) Tj`),
      `0 -${lineHeight * 2} Td (Page ${pageIndex + 1}) Tj`,
      'ET'
    ].join('\n');
    return addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  const pageIds = [];
  const pagesId = objects.length + pages.length + 1;
  contentIds.forEach((contentId) => {
    pageIds.push(addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  const actualPagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
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

function downloadAttendanceReport(format = 'csv') {
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

  const dateSuffix = new Date().toISOString().slice(0, 10);
  const filenameBase = `attendance-overview-${dateSuffix}`;
  const normalized = String(format || 'csv').toLowerCase();

  if (normalized === 'pdf') {
    const pdf = makeSimplePdf('Attendance Overview Report', headers, rows);
    downloadBlob(`${filenameBase}.pdf`, new Blob([pdf], { type: 'application/pdf' }));
  } else if (normalized === 'txt') {
    const text = [headers, ...rows].map((row) => row.map(exportValue).join('\t')).join('\n');
    downloadBlob(`${filenameBase}.txt`, new Blob([text], { type: 'text/plain;charset=utf-8;' }));
  } else {
    const csv = [headers, ...rows].map((row) => row.map((cell) => csvCell(exportValue(cell))).join(',')).join('\n');
    downloadBlob(`${filenameBase}.csv`, new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }));
  }

  if (typeof showToast === 'function') {
    showToast(`Attendance records exported as ${normalized.toUpperCase()}.`, 'success');
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

  const exportSelect = document.getElementById('exportAttendanceFormat');
  if (exportSelect) {
    exportSelect.addEventListener('change', () => {
      if (!exportSelect.value) return;
      downloadAttendanceReport(exportSelect.value);
      exportSelect.value = '';
    });
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
