import { useEffect, useState } from 'react';
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
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
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

function formatTime(value) {
  if (!value) return '-';
  const time = String(value).slice(0, 5);
  const date = new Date(`2000-01-01T${time}:00`);
  if (Number.isNaN(date.getTime())) return time;
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function computeHours(startTime, endTime) {
  if (!startTime || !endTime || endTime <= startTime) return '0.00';
  const start = new Date(`2000-01-01T${startTime}:00`);
  const end = new Date(`2000-01-01T${endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '0.00';
  return ((end.getTime() - start.getTime()) / 3600000).toFixed(2);
}

export default function EmployeeOvertimeRequestPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    overtime_date: '',
    start_time: '',
    end_time: '',
    reason: ''
  });

  async function loadOverview() {
    if (!user?.user_id) return;
    try {
      setMessage('');
      const { data } = await api.get('/employee/overtime-overview', {
        params: { user_id: user.user_id }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to load overtime requests.');
      }

      setRequests(data.requests || []);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load overtime requests.'));
    }
  }

  useEffect(() => {
    loadOverview().catch(() => {});
  }, [user?.user_id]);

  async function submitRequest(event) {
    event.preventDefault();
    if (!user?.user_id) return;

    try {
      setMessage('Submitting overtime request...');
      const { data } = await api.post('/employee/overtime-request', {
        user_id: user.user_id,
        overtime_date: form.overtime_date,
        start_time: form.start_time,
        end_time: form.end_time,
        reason: form.reason.trim()
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to submit overtime request.');
      }

      setForm({ overtime_date: '', start_time: '', end_time: '', reason: '' });
      setMessage(data.message || 'Overtime request submitted successfully.');
      await loadOverview();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to submit overtime request.'));
    }
  }

  const estimatedHours = computeHours(form.start_time, form.end_time);

  return (
    <div className="employee-modern-page">
      <header className="employee-hero compact">
        <div>
          <span>Self Service</span>
        <h2>Overtime Request</h2>
        <p>Submit and track your overtime requests.</p>
        </div>
      </header>

      <section className="summary employee-modern-summary">
        <div className="card"><span>Pending</span><strong>{requests.filter((request) => request.status === 'Pending').length}</strong></div>
        <div className="card"><span>Approved</span><strong>{requests.filter((request) => request.status === 'Approved').length}</strong></div>
        <div className="card"><span>Rejected</span><strong>{requests.filter((request) => request.status === 'Rejected').length}</strong></div>
        <div className="card"><span>Estimated Hours</span><strong>{estimatedHours}</strong><small>Current form</small></div>
      </section>

      <section className="table-section employee-modern-panel">
        <h3>New Overtime Request</h3>
        <form className="employee-form-grid" onSubmit={submitRequest}>
          <label>
            Overtime Date
            <input
              type="date"
              value={form.overtime_date}
              onChange={(event) => setForm((current) => ({ ...current, overtime_date: event.target.value }))}
              required
            />
          </label>

          <label>
            Start Time
            <input
              type="time"
              value={form.start_time}
              onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
              required
            />
          </label>

          <label>
            End Time
            <input
              type="time"
              value={form.end_time}
              onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
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
            <span className="muted">Estimated overtime: {estimatedHours} hour(s)</span>
          </div>
        </form>
      </section>

      <section className="table-section employee-modern-panel">
        <h3>My Overtime Requests</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Date</th>
                <th>Time</th>
                <th>Total Hours</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? <tr><td colSpan="6">No overtime requests yet.</td></tr> : null}
              {requests.map((request) => (
                <tr key={request.overtime_request_id}>
                  <td>{formatDateTime(request.created_at)}</td>
                  <td>{formatDate(request.overtime_date)}</td>
                  <td>{formatTime(request.start_time)} to {formatTime(request.end_time)}</td>
                  <td>{Number(request.total_hours || 0).toFixed(2)}</td>
                  <td className="left-cell">{request.reason || '-'}</td>
                  <td><span className={`status ${statusClass(request.status)}`}>{request.status || 'Pending'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="message">{message}</p>
    </div>
  );
}
