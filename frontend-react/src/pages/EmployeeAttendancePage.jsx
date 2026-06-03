import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function excelText(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function formatExportDateTime(value) {
  if (!value) return '-';
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

function formatTime(value) {
  if (!value) return '-';
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDateLabel(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
}

function formatDateRangeLabel(from, to) {
  if (!from && !to) return '-';
  if (!to || from === to) return formatDateLabel(from);
  return `${formatDateLabel(from)} to ${formatDateLabel(to)}`;
}

function todayInManila() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function toTimeInput(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function computeHours(record) {
  if (!record.time_in || !record.time_out) return '-';
  const timeIn = new Date(String(record.time_in).replace(' ', 'T')).getTime();
  const timeOut = new Date(String(record.time_out).replace(' ', 'T')).getTime();
  if (timeOut <= timeIn) return '0.00';

  let breakMs = 0;
  if (record.break_out && record.break_in) {
    const breakOut = new Date(String(record.break_out).replace(' ', 'T')).getTime();
    const breakIn = new Date(String(record.break_in).replace(' ', 'T')).getTime();
    if (breakIn > breakOut) breakMs = breakIn - breakOut;
  }

  return ((timeOut - timeIn - breakMs) / 3600000).toFixed(2);
}

function attendanceStatus(record) {
  if (!record.time_in) return { label: 'Absent', className: 'rest' };
  if (!record.time_out || (record.break_out && !record.break_in)) return { label: 'Incomplete', className: 'pending' };
  return { label: 'Present', className: 'present' };
}

export default function EmployeeAttendancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [dateRange, setDateRange] = useState(() => {
    const today = todayInManila();
    return { from: today, to: today };
  });
  const [appliedRange, setAppliedRange] = useState(() => {
    const today = todayInManila();
    return { from: today, to: today };
  });
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  async function loadAttendance() {
    const params = {
      from: appliedRange.from,
      to: appliedRange.to || appliedRange.from
    };

    try {
      const { data } = await api.get('/attendance_overview', { params });
      setRecords(data.records || []);
      setAppliedRange({
        from: data.from || data.date || params.from,
        to: data.to || data.date || params.to
      });
      setLoadError('');
    } catch (err) {
      console.error('Attendance load failed:', err);
      setLoadError(getApiMessage(err, 'Attendance load failed.'));
    }
  }

  useEffect(() => {
    loadAttendance().catch(() => {});
  }, [appliedRange.from, appliedRange.to]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) =>
      `${record.attendance_date || ''} ${record.emp_code || ''} ${record.employee_name || ''} ${record.department || ''}`.toLowerCase().includes(term)
    );
  }, [records, search]);

  const present = filteredRecords.filter((record) => attendanceStatus(record).label === 'Present').length;
  const incomplete = filteredRecords.filter((record) => attendanceStatus(record).label === 'Incomplete').length;

  function exportAttendance() {
    if (!filteredRecords.length) {
      window.alert('No attendance records available to export.');
      return;
    }

    const headers = [
      'Employee ID',
      'Date',
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

    const rows = filteredRecords.map((record) => {
      const status = attendanceStatus(record);
      const totalHours = computeHours(record);
      const ot = totalHours === '-' ? '-' : Math.max(0, Number(totalHours) - 8).toFixed(2);

      return [
        record.emp_code || 'N/A',
        record.attendance_date || '',
        record.employee_name || record.full_name || 'N/A',
        record.department || 'N/A',
        formatExportDateTime(record.time_in),
        formatExportDateTime(record.break_out),
        formatExportDateTime(record.break_in),
        formatExportDateTime(record.time_out),
        totalHours,
        record.ot_hours != null ? Number(record.ot_hours).toFixed(2) : ot,
        status.label
      ];
    });

    const html = `
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
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(excelText(cell))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateSuffix = appliedRange.from === appliedRange.to ? appliedRange.from : `${appliedRange.from}-to-${appliedRange.to}`;
    link.download = `attendance-overview-${dateSuffix}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function updateDateRange(field, value) {
    setDateRange((current) => ({ ...current, [field]: value }));
  }

  function applyDateRange() {
    const fallback = todayInManila();
    const from = dateRange.from || fallback;
    const to = dateRange.to || from;
    setAppliedRange(from > to ? { from: to, to: from } : { from, to });
  }

  function openEditAttendance(record) {
    setEditRecord(record);
    setEditForm({
      attendance_date: record.attendance_date || todayInManila(),
      time_in: toTimeInput(record.time_in),
      break_out: toTimeInput(record.break_out),
      break_in: toTimeInput(record.break_in),
      time_out: toTimeInput(record.time_out)
    });
    setLoadError('');
  }

  function closeEditAttendance() {
    if (saving) return;
    setEditRecord(null);
    setEditForm(null);
  }

  function updateEditForm(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  async function saveAttendanceEdit(event) {
    event.preventDefault();
    if (!editRecord || !editForm || !user?.user_id) return;

    setSaving(true);
    setLoadError('');

    try {
      const { data } = await api.put('/attendance_overview', {
        admin_user_id: user.user_id,
        user_id: editRecord.user_id,
        original_date: editRecord.attendance_date,
        attendance_date: editForm.attendance_date,
        time_in: editForm.time_in,
        break_out: editForm.break_out,
        break_in: editForm.break_in,
        time_out: editForm.time_out
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to update attendance.');
      }

      setEditRecord(null);
      setEditForm(null);
      await loadAttendance();
    } catch (err) {
      setLoadError(getApiMessage(err, 'Unable to update attendance.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="header">
        <h2>Employee Attendance</h2>
        <p>Timekeeping and attendance monitoring for payroll processing.</p>
      </header>

      <section className="summary">
        <div className="card"><span>Date</span><strong>{formatDateRangeLabel(appliedRange.from, appliedRange.to)}</strong><small>Selected Range</small></div>
        <div className="card"><span>Total Employees</span><strong>{filteredRecords.length}</strong></div>
        <div className="card"><span>Present</span><strong>{present}</strong></div>
        <div className="card"><span>Late / Incomplete</span><strong>{incomplete}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <h3>Attendance Records</h3>
          <div className="toolbar">
            <label>From: <input type="date" value={dateRange.from} onChange={(event) => updateDateRange('from', event.target.value)} /></label>
            <label>To: <input type="date" value={dateRange.to} onChange={(event) => updateDateRange('to', event.target.value)} /></label>
            <button type="button" className="btn secondary" onClick={applyDateRange}>Apply</button>
            <button type="button" className="btn secondary" onClick={exportAttendance}>Export Attendance</button>
            <label>Search: <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee..." /></label>
          </div>
        </div>
        {loadError ? <p className="form-error">{loadError}</p> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Date</th>
                <th>Name</th>
                <th>Department</th>
                <th>Time In</th>
                <th>Break Out</th>
                <th>Break In</th>
                <th>Time Out</th>
                <th>Total Hours</th>
                <th>OT Hours</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr><td colSpan="12">No attendance records found.</td></tr>
              ) : filteredRecords.map((record) => {
                const status = attendanceStatus(record);
                const totalHours = computeHours(record);
                const ot = totalHours === '-' ? '-' : Math.max(0, Number(totalHours) - 8).toFixed(2);
                return (
                  <tr key={`${record.attendance_date}-${record.emp_code}-${record.time_in || ''}`}>
                    <td>{record.emp_code || 'N/A'}</td>
                    <td>{formatDateLabel(record.attendance_date)}</td>
                    <td>{record.employee_name || record.full_name || 'N/A'}</td>
                    <td>{record.department || 'N/A'}</td>
                    <td>{formatTime(record.time_in)}</td>
                    <td>{formatTime(record.break_out)}</td>
                    <td>{formatTime(record.break_in)}</td>
                    <td>{formatTime(record.time_out)}</td>
                    <td>{totalHours}</td>
                    <td>{record.ot_hours != null ? Number(record.ot_hours).toFixed(2) : ot}</td>
                    <td><span className={`status ${status.className}`}>{status.label}</span></td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => openEditAttendance(record)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={Boolean(editRecord && editForm)} title="Edit Attendance" onClose={closeEditAttendance}>
        {editRecord && editForm ? (
          <form className="employee-form-grid" onSubmit={saveAttendanceEdit}>
            <label>Employee
              <input value={`${editRecord.emp_code || 'N/A'} - ${editRecord.employee_name || editRecord.full_name || 'N/A'}`} readOnly />
            </label>
            <label>Date
              <input type="date" value={editForm.attendance_date} onChange={(event) => updateEditForm('attendance_date', event.target.value)} required />
            </label>
            <label>Time In
              <input type="time" value={editForm.time_in} onChange={(event) => updateEditForm('time_in', event.target.value)} />
            </label>
            <label>Break Out
              <input type="time" value={editForm.break_out} onChange={(event) => updateEditForm('break_out', event.target.value)} />
            </label>
            <label>Break In
              <input type="time" value={editForm.break_in} onChange={(event) => updateEditForm('break_in', event.target.value)} />
            </label>
            <label>Time Out
              <input type="time" value={editForm.time_out} onChange={(event) => updateEditForm('time_out', event.target.value)} />
            </label>
            <div className="employee-form-wide row-actions">
              <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving...' : 'Save Attendance'}</button>
              <button type="button" className="btn secondary" onClick={closeEditAttendance} disabled={saving}>Cancel</button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
