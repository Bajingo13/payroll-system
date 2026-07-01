import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';
import Modal from '../components/Modal.jsx';
import AppIcon from '../components/AppIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { exportReport } from '../utils/reportExport.js';

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

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}

function attendancePhotoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const parts = raw.split(';').map((part) => part.trim()).filter(Boolean);
  const photoPart = parts.find((part) => part.startsWith('photo:'))
    || parts.find((part) => part.startsWith('front:'))
    || parts.find((part) => part.startsWith('back:'))
    || raw;

  const filename = photoPart.includes(':') ? photoPart.split(':').slice(1).join(':') : photoPart;
  return filename ? `/api/attendance/photo?ref=${encodeURIComponent(filename)}` : '';
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
  const lateOrIncomplete = filteredRecords.filter((record) =>
    Number(record.late_minutes || 0) > 0 || attendanceStatus(record).label === 'Incomplete'
  ).length;

  function exportAttendance(format) {
    if (!filteredRecords.length) {
      toast.info('No attendance records available to export.');
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
      'Late (min)',
      'Undertime (min)',
      'Status',
      'Time-In Location',
      'Time-In Distance (m)'
    ];

    const rows = filteredRecords.map((record) => {
      const status = attendanceStatus(record);
      const totalHours = computeHours(record);
      const ot = totalHours === '-' ? '-' : Math.max(0, Number(totalHours) - 8).toFixed(2);
      const locationStr = record.time_in_lat != null && record.time_in_lng != null
        ? `${Number(record.time_in_lat).toFixed(6)}, ${Number(record.time_in_lng).toFixed(6)}`
        : '-';

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
        record.late_minutes != null ? Number(record.late_minutes) : '-',
        record.undertime_minutes != null ? Number(record.undertime_minutes) : '-',
        status.label,
        locationStr,
        record.time_in_dist != null ? Math.round(record.time_in_dist) : '-'
      ];
    });

    const dateSuffix = appliedRange.from === appliedRange.to ? appliedRange.from : `${appliedRange.from}-to-${appliedRange.to}`;
    exportReport(
      format,
      `attendance-overview-${dateSuffix}`,
      'Attendance Overview Report',
      headers,
      rows
    );
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
        <div className="card"><span>Late / Incomplete</span><strong>{lateOrIncomplete}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <h3>Attendance Records</h3>
          <div className="toolbar">
            <label>From: <input type="date" value={dateRange.from} onChange={(event) => updateDateRange('from', event.target.value)} /></label>
            <label>To: <input type="date" value={dateRange.to} onChange={(event) => updateDateRange('to', event.target.value)} /></label>
            <button type="button" className="btn secondary" onClick={applyDateRange}>Apply</button>
            <select
              aria-label="Export attendance report format"
              defaultValue=""
              onChange={(event) => {
                if (!event.target.value) return;
                exportAttendance(event.target.value);
                event.target.value = '';
              }}
            >
              <option value="">Export Report</option>
              <option value="csv">CSV Format</option>
              <option value="txt">Text Format</option>
              <option value="pdf">PDF Format</option>
            </select>
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
                <th>Late (min)</th>
                <th>Undertime (min)</th>
                <th>Status</th>
                <th>Selfie</th>
                <th>Location (Time In)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr><td colSpan="16">No attendance records found.</td></tr>
              ) : filteredRecords.map((record) => {
                const status = attendanceStatus(record);
                const totalHours = computeHours(record);
                const ot = totalHours === '-' ? '-' : Math.max(0, Number(totalHours) - 8).toFixed(2);
                const lateMin = record.late_minutes != null ? Number(record.late_minutes) : null;
                const undertimeMin = record.undertime_minutes != null ? Number(record.undertime_minutes) : null;
                const selfieUrl = attendancePhotoUrl(record.time_in_photo);
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
                    <td style={{ color: lateMin > 0 ? '#b91c1c' : undefined }}>
                      {lateMin != null ? (lateMin > 0 ? lateMin : '-') : '-'}
                    </td>
                    <td style={{ color: undertimeMin > 0 ? '#b91c1c' : undefined }}>
                      {undertimeMin != null ? (undertimeMin > 0 ? undertimeMin : '-') : '-'}
                    </td>
                    <td><span className={`status ${status.className}`}>{status.label}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      {selfieUrl ? (
                        <a href={selfieUrl} target="_blank" rel="noreferrer">
                          <img
                            src={selfieUrl}
                            alt="selfie"
                            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid #e2e8f0' }}
                          />
                        </a>
                      ) : '-'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {record.time_in_lat != null && record.time_in_lng != null ? (
                        <a
                          href={mapsUrl(record.time_in_lat, record.time_in_lng)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#0a66d9', textDecoration: 'none', fontSize: '12px' }}
                        >
                          <AppIcon name="mapPin" size={13} /> {Number(record.time_in_lat).toFixed(4)}, {Number(record.time_in_lng).toFixed(4)}
                          {record.time_in_dist != null && (
                            <span style={{
                              display: 'block',
                              fontSize: '11px',
                              color: Number(record.time_in_dist) > 100 ? '#b91c1c' : '#15803d'
                            }}>
                              {Math.round(record.time_in_dist)}m from office
                            </span>
                          )}
                        </a>
                      ) : '-'}
                    </td>
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

      {/* Custom Edit Attendance Dialog */}
      {editRecord && editForm && (
        <div className="modal-backdrop" onMouseDown={closeEditAttendance}>
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{ width: 'min(480px,100%)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(10,20,50,0.5)', background: '#fff' }}
          >
            {/* ── Header ── */}
            <div style={{ background: 'linear-gradient(135deg,#0f2044 0%,#1e40af 100%)', padding: '22px 24px', position: 'relative' }}>
              <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', right: -30, top: -40, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }}><AppIcon name="user" size={22} /></div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>
                      {editRecord.employee_name || editRecord.full_name || 'Employee'}
                    </div>
                    <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 3 }}>
                      {editRecord.emp_code || 'N/A'} · {editRecord.department || 'N/A'}
                    </div>
                  </div>
                </div>
                <button onClick={closeEditAttendance} aria-label="Close" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: '#fff', width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AppIcon name="close" size={18} /></button>
              </div>

              {/* Date field inside header */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><AppIcon name="calendar" size={13} /> Attendance Date</div>
                <input
                  type="date"
                  value={editForm.attendance_date}
                  onChange={e => updateEditForm('attendance_date', e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 11, padding: '10px 14px', fontSize: 14, fontWeight: 700, color: '#fff', colorScheme: 'dark', outline: 'none' }}
                />
              </div>
            </div>

            {/* ── Body ── */}
            <form onSubmit={saveAttendanceEdit} style={{ padding: '20px 24px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Time Entries</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { key: 'time_in',   label: 'Time In',   dot: '#22c55e', bg: '#f0fdf4', border: '#86efac' },
                  { key: 'break_out', label: 'Break Out', dot: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                  { key: 'break_in',  label: 'Break In',  dot: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                  { key: 'time_out',  label: 'Time Out',  dot: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
                ].map(f => (
                  <div key={f.key} style={{ background: f.bg, border: `1.5px solid ${f.border}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: f.dot }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{f.label}</span>
                    </div>
                    <input
                      type="time"
                      value={editForm[f.key]}
                      onChange={e => updateEditForm(f.key, e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 16, fontWeight: 800, color: '#0f172a', outline: 'none', padding: 0, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ flex: 2, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: saving ? 'none' : '0 4px 14px rgba(29,78,216,0.4)', letterSpacing: 0.3 }}
                >
                  {saving ? 'Saving...' : 'Save Attendance'}
                </button>
                <button
                  type="button"
                  onClick={closeEditAttendance}
                  disabled={saving}
                  style={{ flex: 1, background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
