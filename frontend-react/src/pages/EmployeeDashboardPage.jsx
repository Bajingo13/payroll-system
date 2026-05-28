import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

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
    hour12: true,
    timeZone: 'Asia/Manila'
  });
}

function money(value) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export default function EmployeeDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadDashboard() {
    if (!user?.user_id) return;
    try {
      setMessage('');
      const { data: payload } = await api.get('/employee_dashboard', {
        params: { user_id: user.user_id }
      });

      if (!payload.success) {
        throw new Error(payload.message || 'Unable to load employee dashboard.');
      }

      setData(payload);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load employee dashboard.'));
    }
  }

  useEffect(() => {
    loadDashboard().catch(() => {});
  }, [user?.user_id]);

  const todayState = data?.todayTime || {};
  const employee = data?.employee || {};
  const payrollSummary = data?.payrollSummary || null;
  const attendanceLogs = data?.attendanceLogs || [];

  const timeButtons = useMemo(() => {
    const hasTimeIn = Boolean(todayState.hasTimeIn);
    const hasBreakOut = Boolean(todayState.hasBreakOut);
    const hasBreakIn = Boolean(todayState.hasBreakIn);
    const hasTimeOut = Boolean(todayState.hasTimeOut);

    return [
      { key: 'time_in', label: 'Time In', disabled: hasTimeIn },
      { key: 'break_out', label: 'Break Out', disabled: !hasTimeIn || hasBreakOut || hasTimeOut },
      { key: 'break_in', label: 'Break In', disabled: !hasBreakOut || hasBreakIn || hasTimeOut },
      { key: 'time_out', label: 'Time Out', disabled: !hasTimeIn || (hasBreakOut && !hasBreakIn) || hasTimeOut }
    ];
  }, [todayState]);

  async function submitTimeEntry(type) {
    if (!user?.user_id) return;
    setBusy(true);
    setMessage('Recording time entry...');

    try {
      const { data: payload } = await api.post('/employee/time-entry', {
        user_id: user.user_id,
        type
      });

      if (!payload.success) {
        throw new Error(payload.message || 'Unable to record time entry.');
      }

      setMessage(payload.message || 'Time entry recorded.');
      await loadDashboard();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to record time entry.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="header">
        <h2>Employee Dashboard</h2>
        <p>Track your schedule actions and latest payroll summary.</p>
      </header>

      <section className="summary">
        <div className="card"><span>Employee ID</span><strong>{employee.emp_code || '-'}</strong></div>
        <div className="card"><span>Department</span><strong>{employee.department || '-'}</strong></div>
        <div className="card"><span>Position</span><strong>{employee.position || '-'}</strong></div>
        <div className="card"><span>Latest Payroll Status</span><strong>{payrollSummary?.payroll_status || '-'}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header employee-mgmt-header">
          <div>
            <h3>Timekeeping</h3>
            <p>Use the controls below for today&apos;s attendance actions.</p>
          </div>
          <div className="row-actions">
            {timeButtons.map((item) => (
              <button
                key={item.key}
                type="button"
                className="btn"
                disabled={item.disabled || busy}
                onClick={() => submitTimeEntry(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="summary employee-mini-summary">
          <div className="card"><span>Time In</span><strong>{formatDateTime(todayState.timeIn)}</strong></div>
          <div className="card"><span>Break Out</span><strong>{formatDateTime(todayState.breakOut)}</strong></div>
          <div className="card"><span>Break In</span><strong>{formatDateTime(todayState.breakIn)}</strong></div>
          <div className="card"><span>Time Out</span><strong>{formatDateTime(todayState.timeOut)}</strong></div>
        </div>
      </section>

      <section className="table-section">
        <h3>Latest Payroll Summary</h3>
        <div className="summary employee-mini-summary">
          <div className="card"><span>Payroll Range</span><strong>{payrollSummary?.payroll_range || '-'}</strong></div>
          <div className="card"><span>Gross Pay</span><strong>{money(payrollSummary?.gross_pay)}</strong></div>
          <div className="card"><span>Deductions</span><strong>{money(payrollSummary?.total_deductions)}</strong></div>
          <div className="card"><span>Net Pay</span><strong>{money(payrollSummary?.net_pay)}</strong></div>
        </div>
      </section>

      <section className="table-section">
        <h3>Recent Attendance Logs</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Activity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceLogs.length === 0 ? <tr><td colSpan="3">No attendance logs found.</td></tr> : null}
              {attendanceLogs.map((log, index) => (
                <tr key={`${log.log_time}-${index}`}>
                  <td>{formatDateTime(log.log_time)}</td>
                  <td>{log.action || '-'}</td>
                  <td><span className="status completed">{log.status || '-'}</span></td>
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
