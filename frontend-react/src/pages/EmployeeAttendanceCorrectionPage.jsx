import { useEffect, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function statusClass(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'approved') return 'approved';
  if (v === 'rejected') return 'rejected';
  if (v === 'cancelled') return 'cancelled';
  return 'pending';
}

function formatDate(v) {
  if (!v) return '—';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-PH', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatTime(v) {
  if (!v) return '—';
  const t = String(v).slice(0, 5);
  const d = new Date(`2000-01-01T${t}:00`);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const EMPTY_FORM = { attendance_date: '', requested_time_in: '', requested_break_out: '', requested_break_in: '', requested_time_out: '', reason: '' };

export default function EmployeeAttendanceCorrectionPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);

  async function load() {
    if (!user?.user_id) return;
    setLoadingData(true);
    try {
      const { data } = await api.get('/employee/attendance-correction-requests', { params: { user_id: user.user_id } });
      setRequests(data.requests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => { load(); }, [user?.user_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    const hasTime = ['requested_time_in', 'requested_break_out', 'requested_break_in', 'requested_time_out'].some((k) => form[k]);
    if (!hasTime) { setMessage('Please provide at least one time field to correct.'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/employee/attendance-correction-request', { user_id: user.user_id, ...form });
      if (data.success) {
        setMessage('✓ Request submitted successfully.');
        setForm(EMPTY_FORM);
        load();
      } else {
        setMessage(data.message || 'Submission failed.');
      }
    } catch (err) {
      setMessage(getApiMessage(err, 'Submission failed.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(correctionId) {
    if (!window.confirm('Cancel this correction request?')) return;
    setCancellingId(correctionId);
    try {
      await api.patch(`/employee/attendance-correction-requests/${correctionId}/cancel`, { user_id: user.user_id });
      load();
    } catch (err) {
      alert(getApiMessage(err, 'Could not cancel request.'));
    } finally {
      setCancellingId(null);
    }
  }

  const pending = requests.filter((r) => r.status === 'Pending').length;
  const approved = requests.filter((r) => r.status === 'Approved').length;
  const rejected = requests.filter((r) => r.status === 'Rejected').length;

  return (
    <div className="employee-modern-page">
      <div className="employee-hero">
        <div>
          <span className="employee-hero-kicker">Employee Self-Service</span>
          <h2>Attendance Correction Request</h2>
          <p>Submit a request to correct or update your time-in / time-out records.</p>
        </div>
      </div>

      <div className="summary employee-modern-summary">
        <div className="card"><span>Pending</span><strong>{pending}</strong></div>
        <div className="card"><span>Approved</span><strong>{approved}</strong></div>
        <div className="card"><span>Rejected</span><strong>{rejected}</strong></div>
        <div className="card"><span>Total</span><strong>{requests.length}</strong></div>
      </div>

      {/* ── Request Form ── */}
      <div className="employee-modern-panel">
        <h3 style={{ marginBottom: 4 }}>New Correction Request</h3>
        <p className="muted" style={{ marginBottom: 18 }}>Fill in only the fields you want corrected. Leave blank fields that should stay unchanged.</p>
        <form onSubmit={handleSubmit}>
          <div className="employee-form-grid">

            <label className="employee-form-wide">
              Attendance Date <span style={{ color: '#dc2626' }}>*</span>
              <input
                type="date"
                required
                value={form.attendance_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, attendance_date: e.target.value }))}
              />
            </label>

            <label>
              Requested Time In
              <input type="time" value={form.requested_time_in} onChange={(e) => setForm((f) => ({ ...f, requested_time_in: e.target.value }))} />
            </label>

            <label>
              Requested Break Out
              <input type="time" value={form.requested_break_out} onChange={(e) => setForm((f) => ({ ...f, requested_break_out: e.target.value }))} />
            </label>

            <label>
              Requested Break In
              <input type="time" value={form.requested_break_in} onChange={(e) => setForm((f) => ({ ...f, requested_break_in: e.target.value }))} />
            </label>

            <label>
              Requested Time Out
              <input type="time" value={form.requested_time_out} onChange={(e) => setForm((f) => ({ ...f, requested_time_out: e.target.value }))} />
            </label>

            <label className="employee-form-wide">
              Reason / Explanation <span style={{ color: '#dc2626' }}>*</span>
              <textarea
                required
                rows={3}
                placeholder="Explain why this correction is needed (e.g., forgot to time in, system error)..."
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </label>
          </div>

          {message && (
            <p className={`form-message ${message.startsWith('✓') ? 'success' : 'error'}`} style={{ margin: '12px 0 0' }}>
              {message}
            </p>
          )}

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Submitting…' : 'Submit Request'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => { setForm(EMPTY_FORM); setMessage(''); }}>
              Clear
            </button>
          </div>
        </form>
      </div>

      {/* ── History ── */}
      <div className="employee-modern-panel">
        <h3 style={{ marginBottom: 14 }}>Request History</h3>
        {loadingData ? (
          <p className="muted">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="muted">No correction requests yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Break Out</th>
                  <th>Break In</th>
                  <th>Time Out</th>
                  <th className="left-cell">Reason</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.correction_id}>
                    <td><small>{formatDateTime(r.created_at)}</small></td>
                    <td>{formatDate(r.attendance_date)}</td>
                    <td>{r.requested_time_in ? formatTime(r.requested_time_in) : <span className="muted">—</span>}</td>
                    <td>{r.requested_break_out ? formatTime(r.requested_break_out) : <span className="muted">—</span>}</td>
                    <td>{r.requested_break_in ? formatTime(r.requested_break_in) : <span className="muted">—</span>}</td>
                    <td>{r.requested_time_out ? formatTime(r.requested_time_out) : <span className="muted">—</span>}</td>
                    <td className="left-cell">
                      {r.reason}
                      {r.rejection_reason && (
                        <small style={{ color: '#dc2626', display: 'block', marginTop: 2 }}>
                          Reason: {r.rejection_reason}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={`status ${statusClass(r.status)}`}>{r.status}</span>
                    </td>
                    <td>
                      {r.status === 'Pending' && (
                        <button
                          type="button"
                          className="btn btn-outline danger"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          disabled={cancellingId === r.correction_id}
                          onClick={() => handleCancel(r.correction_id)}
                        >
                          {cancellingId === r.correction_id ? '…' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
