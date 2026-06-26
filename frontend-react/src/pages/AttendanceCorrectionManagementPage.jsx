import { useCallback, useEffect, useState } from 'react';
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

export default function AttendanceCorrectionManagementPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState({ Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 });
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Reject modal state
  const [rejectModal, setRejectModal] = useState(null); // { correction_id, employee_name }
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const { data } = await api.get('/admin/attendance-correction-requests', {
        params: { user_id: user.user_id, status: statusFilter }
      });
      setRequests(data.requests || []);
      setSummary(data.summary || { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(correctionId, employeeName) {
    if (!window.confirm(`Approve the attendance correction request for ${employeeName}?\n\nThis will update their attendance record.`)) return;
    setActionLoading(true);
    setActionMsg('');
    try {
      const { data } = await api.patch(`/admin/attendance-correction-requests/${correctionId}/status`, {
        user_id: user.user_id, status: 'Approved'
      });
      if (data.success) { setActionMsg('✓ Request approved and attendance record updated.'); load(); }
      else setActionMsg(data.message || 'Failed.');
    } catch (err) {
      setActionMsg(getApiMessage(err, 'Failed to approve.'));
    } finally {
      setActionLoading(false);
    }
  }

  function openRejectModal(req) {
    setRejectModal({ correction_id: req.correction_id, employee_name: req.employee_name });
    setRejectionReason('');
    setActionMsg('');
  }

  async function handleReject(e) {
    e.preventDefault();
    if (!rejectionReason.trim()) return;
    setActionLoading(true);
    setActionMsg('');
    try {
      const { data } = await api.patch(`/admin/attendance-correction-requests/${rejectModal.correction_id}/status`, {
        user_id: user.user_id, status: 'Rejected', rejection_reason: rejectionReason.trim()
      });
      if (data.success) { setRejectModal(null); setActionMsg('Request rejected.'); load(); }
      else setActionMsg(data.message || 'Failed.');
    } catch (err) {
      setActionMsg(getApiMessage(err, 'Failed to reject.'));
    } finally {
      setActionLoading(false);
    }
  }

  const filtered = search.trim()
    ? requests.filter((r) => {
        const q = search.toLowerCase();
        return (
          (r.employee_name || '').toLowerCase().includes(q) ||
          (r.emp_code || '').toLowerCase().includes(q) ||
          (r.department || '').toLowerCase().includes(q)
        );
      })
    : requests;

  return (
    <div>
      <div className="header">
        <h2>Attendance Correction Requests</h2>
        <p>Review and act on employee attendance correction requests.</p>
      </div>

      {/* Summary Cards */}
      <div className="summary dashboard-summary">
        {[
          { label: 'Pending',   value: summary.Pending,   filter: 'Pending' },
          { label: 'Approved',  value: summary.Approved,  filter: 'Approved' },
          { label: 'Rejected',  value: summary.Rejected,  filter: 'Rejected' },
          { label: 'Cancelled', value: summary.Cancelled, filter: 'Cancelled' },
        ].map((s) => (
          <button
            key={s.label}
            type="button"
            className="card summary-card"
            style={{ cursor: 'pointer', border: statusFilter === s.filter ? '2px solid #116edb' : undefined, textAlign: 'left' }}
            onClick={() => setStatusFilter(s.filter)}
          >
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </button>
        ))}
      </div>

      {actionMsg && (
        <p className={`form-message ${actionMsg.startsWith('✓') ? 'success' : 'error'}`} style={{ margin: '0 0 14px' }}>
          {actionMsg}
        </p>
      )}

      {/* Table */}
      <div className="table-section">
        <div className="table-header">
          <div>
            <h3 style={{ margin: 0 }}>{statusFilter} Requests</h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="toolbar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
              <option value="All">All</option>
            </select>
            <input
              type="search"
              placeholder="Search employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 180 }}
            />
            <button type="button" className="btn" onClick={load}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <p className="muted" style={{ padding: '20px 0' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="muted" style={{ padding: '20px 0' }}>No {statusFilter.toLowerCase()} requests.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Break Out</th>
                  <th>Break In</th>
                  <th>Time Out</th>
                  <th className="left-cell">Reason</th>
                  <th>Status</th>
                  {statusFilter === 'Pending' || statusFilter === 'All' ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.correction_id}>
                    <td><small>{formatDateTime(r.created_at)}</small></td>
                    <td>
                      <strong style={{ display: 'block' }}>{r.employee_name}</strong>
                      <small>{r.emp_code}{r.department ? ` · ${r.department}` : ''}</small>
                    </td>
                    <td>{formatDate(r.attendance_date)}</td>
                    <td>{r.requested_time_in ? formatTime(r.requested_time_in) : <span className="muted">—</span>}</td>
                    <td>{r.requested_break_out ? formatTime(r.requested_break_out) : <span className="muted">—</span>}</td>
                    <td>{r.requested_break_in ? formatTime(r.requested_break_in) : <span className="muted">—</span>}</td>
                    <td>{r.requested_time_out ? formatTime(r.requested_time_out) : <span className="muted">—</span>}</td>
                    <td className="left-cell">
                      {r.reason}
                      {r.rejection_reason && (
                        <small style={{ color: '#dc2626', display: 'block', marginTop: 2 }}>
                          Rejection: {r.rejection_reason}
                        </small>
                      )}
                      {r.reviewed_by_name && r.status !== 'Pending' && (
                        <small style={{ color: '#64748b', display: 'block' }}>
                          By {r.reviewed_by_name} · {formatDateTime(r.reviewed_at)}
                        </small>
                      )}
                    </td>
                    <td><span className={`status ${statusClass(r.status)}`}>{r.status}</span></td>
                    {(statusFilter === 'Pending' || statusFilter === 'All') && (
                      <td>
                        {r.status === 'Pending' && (
                          <div className="row-actions" style={{ flexWrap: 'nowrap', gap: 6 }}>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: '5px 12px', background: '#16a34a' }}
                              disabled={actionLoading}
                              onClick={() => handleApprove(r.correction_id, r.employee_name)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn danger"
                              style={{ fontSize: 12, padding: '5px 12px' }}
                              disabled={actionLoading}
                              onClick={() => openRejectModal(r)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="app-modal-backdrop" onClick={() => setRejectModal(null)}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()}>
            <div className="app-modal-header">
              <h3>Reject Correction Request</h3>
              <button type="button" className="app-modal-close" onClick={() => setRejectModal(null)}>×</button>
            </div>
            <div className="app-modal-body">
              <p style={{ color: '#475569', marginTop: 0 }}>
                Rejecting correction request for <strong>{rejectModal.employee_name}</strong>.
                Please provide a reason.
              </p>
              <form onSubmit={handleReject}>
                <label className="modal-form" style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 700, color: '#334155', fontSize: 13 }}>Rejection Reason *</span>
                  <textarea
                    required
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this request is being rejected…"
                    style={{ resize: 'vertical', minHeight: 80, border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                  />
                </label>
                {actionMsg && <p className="form-message error" style={{ margin: '8px 0 0' }}>{actionMsg}</p>}
                <div className="row-actions" style={{ marginTop: 16 }}>
                  <button type="submit" className="btn danger" disabled={actionLoading || !rejectionReason.trim()}>
                    {actionLoading ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setRejectModal(null)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
