import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { exportReport } from '../utils/reportExport.js';

function formatDateTime(value) {
  if (!value) return 'N/A';
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

function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return 'N/A';
  const time = String(value).slice(0, 5);
  const date = new Date(`2000-01-01T${time}:00`);
  if (Number.isNaN(date.getTime())) return time;
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'cancelled') return 'cancelled';
  return 'pending';
}

function updatedTime(request) {
  const updated = new Date(String(request.updated_at || request.created_at || '').replace(' ', 'T')).getTime();
  return Number.isNaN(updated) ? 0 : updated;
}

function previousByUpdatedAt(requests) {
  return (requests || [])
    .filter((request) => ['Approved', 'Rejected'].includes(request.status))
    .sort((a, b) => updatedTime(b) - updatedTime(a));
}

export default function OvertimeManagementPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState({ Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 });
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [message, setMessage] = useState('');

  async function loadRequests(filter = statusFilter) {
    const { data } = await api.get('/admin/overtime-requests', {
      params: {
        user_id: user.user_id,
        ...(filter ? { status: filter } : {})
      }
    });
    setRequests(data.requests || []);
    setSummary(data.summary || {});
  }

  async function loadAllRequests() {
    const { data } = await api.get('/admin/overtime-requests', {
      params: { user_id: user.user_id }
    });
    return data.requests || [];
  }

  useEffect(() => {
    loadRequests().catch((err) => setMessage(getApiMessage(err, 'Unable to load overtime requests.')));
  }, []);

  async function updateStatus(requestId, status) {
    setMessage(`${status === 'Approved' ? 'Approving' : 'Rejecting'} overtime request...`);
    try {
      const { data } = await api.patch(`/admin/overtime-requests/${requestId}/status`, {
        user_id: user.user_id,
        status
      });
      setMessage(data.message || 'Overtime request updated.');
      await loadRequests();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to update overtime request.'));
    }
  }

  async function exportOvertime(format) {
    const allRequests = await loadAllRequests();
    if (allRequests.length === 0) {
      setMessage('No overtime requests available to export.');
      return;
    }

    const headers = ['Request ID', 'Submitted', 'Employee ID', 'Employee Name', 'Date', 'Start Time', 'End Time', 'Total Hours', 'Reason', 'Status', 'Last Updated'];
    const rows = allRequests.map((request) => [
        request.overtime_request_id,
        formatDateTime(request.created_at),
        request.emp_code || '',
        request.employee_name || '',
        request.overtime_date || '',
        request.start_time || '',
        request.end_time || '',
        Number(request.total_hours || 0).toFixed(2),
        request.reason || '',
        request.status || '',
        formatDateTime(request.updated_at)
      ]);

    exportReport(
      format,
      `overtime-management-${new Date().toISOString().slice(0, 10)}`,
      'Overtime Management Report',
      headers,
      rows
    );
    setMessage(`Overtime requests exported as ${String(format).toUpperCase()}.`);
  }

  const previousRequests = useMemo(
    () => previousByUpdatedAt(requests),
    [requests]
  );

  return (
    <>
      <header className="header">
        <h2>Overtime Management</h2>
        <p>Review employee overtime requests and approve or reject pending submissions.</p>
      </header>

      <section className="summary">
        <div className="card"><span>Pending Requests</span><strong>{summary.Pending || 0}</strong></div>
        <div className="card"><span>Approved Requests</span><strong>{summary.Approved || 0}</strong></div>
        <div className="card"><span>Rejected Requests</span><strong>{summary.Rejected || 0}</strong></div>
        <div className="card"><span>Cancelled Requests</span><strong>{summary.Cancelled || 0}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>Employee Overtime Requests</h3>
            <p>Filter requests by status, then approve or reject pending overtime submissions.</p>
          </div>
          <div className="toolbar">
            <select
              aria-label="Export overtime report format"
              defaultValue=""
              onChange={(event) => {
                if (!event.target.value) return;
                exportOvertime(event.target.value);
                event.target.value = '';
              }}
            >
              <option value="">Export Report</option>
              <option value="csv">CSV Format</option>
              <option value="txt">Text Format</option>
              <option value="pdf">PDF Format</option>
            </select>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); loadRequests(event.target.value); }}>
              <option value="">All Requests</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <OvertimeTable requests={requests} onApprove={(id) => updateStatus(id, 'Approved')} onReject={(id) => updateStatus(id, 'Rejected')} showActions />
        {message && <p className="message">{message}</p>}
      </section>

      <PreviousRequestsSection loadRequests={loadAllRequests} fallbackRequests={previousRequests} />
    </>
  );
}

function PreviousRequestsSection({ loadRequests, fallbackRequests }) {
  const [requests, setRequests] = useState(fallbackRequests);

  useEffect(() => {
    loadRequests()
      .then((allRequests) => {
        setRequests(previousByUpdatedAt(allRequests));
      })
      .catch((err) => console.error('Previous overtime requests failed:', err));
  }, [fallbackRequests.length]);

  return (
    <section className="table-section previous-section">
      <div className="table-header">
        <div>
          <h3>Previous Overtime Requests</h3>
          <p>Approved and rejected requests are kept here for review after a decision is made.</p>
        </div>
      </div>
      <OvertimeTable requests={requests} showUpdated />
    </section>
  );
}

function OvertimeTable({ requests, onApprove, onReject, showActions = false, showUpdated = false }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Employee</th>
            <th>Date</th>
            <th>Time</th>
            <th>Hours</th>
            <th>Reason</th>
            <th>Status</th>
            {showUpdated && <th>Updated</th>}
            {showActions && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {requests.length === 0 ? (
            <tr><td colSpan={showActions || showUpdated ? 8 : 7}>No overtime requests found.</td></tr>
          ) : requests.map((request) => (
            <tr key={request.overtime_request_id}>
              <td>{formatDateTime(request.created_at)}</td>
              <td><strong>{request.employee_name || 'Employee'}</strong><small>{request.emp_code || ''}</small></td>
              <td>{formatDate(request.overtime_date)}</td>
              <td>{formatTime(request.start_time)} to {formatTime(request.end_time)}</td>
              <td>{Number(request.total_hours || 0).toFixed(2)}</td>
              <td className="left-cell">{request.reason || 'N/A'}</td>
              <td><span className={`status ${statusClass(request.status)}`}>{request.status || 'Pending'}</span></td>
              {showUpdated && <td>{formatDateTime(request.updated_at)}</td>}
              {showActions && (
                <td>
                  {request.status === 'Pending' ? (
                    <div className="row-actions">
                      <button className="btn" onClick={() => onApprove(request.overtime_request_id)}>Approve</button>
                      <button className="btn danger" onClick={() => onReject(request.overtime_request_id)}>Reject</button>
                    </div>
                  ) : 'No action'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
