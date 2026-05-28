import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'cancelled') return 'cancelled';
  return 'pending';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export default function EmployeeLeaveRequestPage() {
  const { user } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: ''
  });

  async function loadOverview() {
    if (!user?.user_id) return;
    try {
      setMessage('');
      const { data } = await api.get('/employee/leave-overview', {
        params: { user_id: user.user_id }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to load leave overview.');
      }

      setLeaveTypes(data.leaveTypes || []);
      setLeaveBalances(data.leaveBalances || []);
      setLeaveRequests(data.leaveRequests || []);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load leave overview.'));
    }
  }

  useEffect(() => {
    loadOverview().catch(() => {});
  }, [user?.user_id]);

  const selectedBalance = useMemo(() => {
    const selectedId = Number(form.leave_type_id || 0);
    return leaveBalances.find((item) => Number(item.leave_type_id) === selectedId) || null;
  }, [form.leave_type_id, leaveBalances]);

  async function submitRequest(event) {
    event.preventDefault();
    if (!user?.user_id) return;

    try {
      setMessage('Submitting leave request...');
      const { data } = await api.post('/employee/leave-request', {
        user_id: user.user_id,
        leave_type_id: Number(form.leave_type_id),
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim()
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to submit leave request.');
      }

      setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
      setMessage(data.message || 'Leave request submitted successfully.');
      await loadOverview();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to submit leave request.'));
    }
  }

  return (
    <>
      <header className="header">
        <h2>Leave Request</h2>
        <p>Submit and track your leave requests.</p>
      </header>

      <section className="summary">
        {leaveBalances.length === 0 ? (
          <div className="card"><span>Leave Balances</span><strong>-</strong><small>No leave types available</small></div>
        ) : leaveBalances.map((balance) => (
          <div className="card" key={balance.leave_type_id}>
            <span>{balance.leave_name}</span>
            <strong>{Number(balance.remaining_days || 0).toFixed(2)}</strong>
            <small>{Number(balance.used_days || 0).toFixed(2)} used / {Number(balance.allocation_days || 0).toFixed(2)} allocated</small>
          </div>
        ))}
      </section>

      <section className="table-section">
        <h3>New Leave Request</h3>
        <form className="employee-form-grid" onSubmit={submitRequest}>
          <label>
            Leave Type
            <select
              value={form.leave_type_id}
              onChange={(event) => setForm((current) => ({ ...current, leave_type_id: event.target.value }))}
              required
            >
              <option value="">Select leave type</option>
              {leaveTypes.map((type) => (
                <option value={type.leave_type_id} key={type.leave_type_id}>{type.leave_name}</option>
              ))}
            </select>
          </label>

          <label>
            Start Date
            <input
              type="date"
              value={form.start_date}
              onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
              required
            />
          </label>

          <label>
            End Date
            <input
              type="date"
              value={form.end_date}
              onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
              required
            />
          </label>

          <label className="employee-form-wide">
            Reason
            <textarea
              rows="4"
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              required
            />
          </label>

          <div className="employee-form-wide row-actions">
            <button type="submit" className="btn">Submit Request</button>
            {selectedBalance ? (
              <span className="muted">Remaining balance for selected leave: {Number(selectedBalance.remaining_days || 0).toFixed(2)} day(s)</span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="table-section">
        <h3>My Leave Requests</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Leave Type</th>
                <th>Date Range</th>
                <th>Total Days</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests.length === 0 ? <tr><td colSpan="6">No leave requests yet.</td></tr> : null}
              {leaveRequests.map((request) => (
                <tr key={request.request_id}>
                  <td>{formatDateTime(request.created_at)}</td>
                  <td>{request.leave_name || '-'}</td>
                  <td>{formatDate(request.start_date)} to {formatDate(request.end_date)}</td>
                  <td>{Number(request.total_days || 0).toFixed(2)}</td>
                  <td className="left-cell">{request.reason || '-'}</td>
                  <td><span className={`status ${statusClass(request.status)}`}>{request.status || 'Pending'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="message">{message}</p>
    </>
  );
}
