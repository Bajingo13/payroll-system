import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-PH', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
  });
}

function money(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds || 0));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((p) => String(p).padStart(2, '0')).join(':');
}

function computeWorkedSeconds(todayState, now) {
  const timeIn = parseDateTime(todayState.timeIn);
  if (!timeIn) return 0;
  const timeOut = parseDateTime(todayState.timeOut);
  const breakOut = parseDateTime(todayState.breakOut);
  const breakIn = parseDateTime(todayState.breakIn);
  const end = timeOut || now;
  let breakSec = 0;
  if (breakOut) {
    const breakEnd = breakIn || (!timeOut ? now : null);
    if (breakEnd && breakEnd > breakOut) breakSec = Math.floor((breakEnd - breakOut) / 1000);
  }
  return Math.max(0, Math.floor((end - timeIn) / 1000) - breakSec);
}

function ClockRing({ workedSeconds, status }) {
  const TARGET = 8 * 3600;
  const ratio = Math.min(1, workedSeconds / TARGET);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = circ * ratio;

  const statusClass = status === 'Clocked in' ? 'eclock--in' : status === 'On break' ? 'eclock--break' : 'eclock--out';
  const strokeColor = status === 'Clocked in' ? '#4ade80' : status === 'On break' ? '#fbbf24' : '#94a3b8';

  return (
    <div className="employee-clock-wrap">
      <svg className="employee-clock-svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x="50" y="55" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="Inter,sans-serif">
          {Math.round(ratio * 100)}%
        </text>
      </svg>
      <div className="employee-clock-info">
        <small>Worked Today</small>
        <strong>{formatDuration(workedSeconds)}</strong>
        <span className={`employee-clock-status ${statusClass}`}>{status}</span>
      </div>
    </div>
  );
}

export default function EmployeeDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  async function loadDashboard() {
    if (!user?.user_id) return;
    try {
      setMessage('');
      const { data: payload } = await api.get('/employee_dashboard', { params: { user_id: user.user_id } });
      if (!payload.success) throw new Error(payload.message || 'Unable to load employee dashboard.');
      setData(payload);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load employee dashboard.'));
    }
  }

  useEffect(() => { loadDashboard().catch(() => {}); }, [user?.user_id]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const todayState = data?.todayTime || {};
  const employee = data?.employee || {};
  const payrollSummary = data?.payrollSummary || null;
  const attendanceSummary = data?.attendanceSummary || null;
  const attendanceLogs = data?.attendanceLogs || [];
  const evaluations = data?.evaluations || [];
  const evaluationSummary = data?.evaluationSummary || {};
  const growthDelta = evaluationSummary.growthDelta;
  const growthDeltaLabel = growthDelta === null || growthDelta === undefined
    ? '-' : `${growthDelta >= 0 ? '+' : ''}${Number(growthDelta).toFixed(1)}`;

  const workedSeconds = computeWorkedSeconds(todayState, now);
  const isOnBreak = Boolean(todayState.hasBreakOut && !todayState.hasBreakIn && !todayState.hasTimeOut);
  const isClockedIn = Boolean(todayState.hasTimeIn && !todayState.hasTimeOut && !isOnBreak);
  const clockStatus = todayState.hasTimeOut ? 'Clocked out' : isOnBreak ? 'On break' : isClockedIn ? 'Clocked in' : 'Not started';

  const todayLateMinutes = (() => {
    if (!todayState.timeIn) return 0;
    const timeIn = parseDateTime(todayState.timeIn);
    if (!timeIn) return 0;
    const shiftStart = new Date(timeIn);
    shiftStart.setHours(8, 0, 0, 0);
    return Math.max(0, Math.floor((timeIn - shiftStart) / 60000));
  })();

  const todayUndertimeMinutes = todayState.hasTimeOut
    ? Math.max(0, 480 - Math.floor(workedSeconds / 60))
    : 0;

  const timeButtons = useMemo(() => {
    const hasTimeIn = Boolean(todayState.hasTimeIn);
    const hasBreakOut = Boolean(todayState.hasBreakOut);
    const hasBreakIn = Boolean(todayState.hasBreakIn);
    const hasTimeOut = Boolean(todayState.hasTimeOut);
    return [
      { key: 'time_in', label: 'Time In', disabled: hasTimeIn },
      { key: 'break_out', label: 'Break Out', disabled: !hasTimeIn || hasBreakOut || hasTimeOut },
      { key: 'break_in', label: 'Break In', disabled: !hasBreakOut || hasBreakIn || hasTimeOut },
      { key: 'time_out', label: 'Time Out', disabled: !hasTimeIn || (hasBreakOut && !hasBreakIn) || hasTimeOut },
    ];
  }, [todayState]);

  async function submitTimeEntry(type) {
    if (!user?.user_id) return;
    setBusy(true);
    setMessage('Recording time entry...');
    try {
      const { data: payload } = await api.post('/employee/time-entry', { user_id: user.user_id, type });
      if (!payload.success) throw new Error(payload.message || 'Unable to record time entry.');
      setMessage(payload.message || 'Time entry recorded.');
      await loadDashboard();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to record time entry.'));
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="employee-modern-page employee-dashboard-modern">

      {/* Hero */}
      <header className="employee-hero">
        <div>
          <span className="employee-hero-kicker">Employee Workspace</span>
          <h2>Hello, {employee.first_name || user?.full_name || 'there'}</h2>
          <p>Track today&apos;s timekeeping, payroll, and attendance.</p>
        </div>
        <time className="employee-hero-date">{today}</time>
      </header>

      {/* Info strip */}
      <section className="summary employee-modern-summary">
        <div className="card"><span>Employee ID</span><strong>{employee.emp_code || '-'}</strong></div>
        <div className="card"><span>Department</span><strong>{employee.department || '-'}</strong></div>
        <div className="card"><span>Position</span><strong>{employee.position || '-'}</strong></div>
        <div className="card"><span>Payroll Status</span><strong>{payrollSummary?.payroll_status || '-'}</strong></div>
      </section>

      {/* Timekeeping */}
      <section className="table-section employee-modern-panel employee-time-panel">
        <div className="table-header employee-mgmt-header">
          <div>
            <h3>Timekeeping</h3>
            <p>Live timer for today&apos;s attendance.</p>
          </div>
          <div className="row-actions">
            {timeButtons.map((item) => (
              <button key={item.key} type="button" className="btn" disabled={item.disabled || busy} onClick={() => submitTimeEntry(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <ClockRing workedSeconds={workedSeconds} status={clockStatus} />

        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card"><span>Status</span><strong>{clockStatus}</strong></div>
          <div className="card"><span>Worked Time</span><strong>{formatDuration(workedSeconds)}</strong></div>
          <div className="card"><span>Target</span><strong>08:00:00</strong></div>
          <div className="card"><span>Overtime</span><strong>{formatDuration(Math.max(0, workedSeconds - 28800))}</strong></div>
        </div>

        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card"><span>Time In</span><strong>{formatDateTime(todayState.timeIn)}</strong></div>
          <div className="card"><span>Break Out</span><strong>{formatDateTime(todayState.breakOut)}</strong></div>
          <div className="card"><span>Break In</span><strong>{formatDateTime(todayState.breakIn)}</strong></div>
          <div className="card"><span>Time Out</span><strong>{formatDateTime(todayState.timeOut)}</strong></div>
        </div>

        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card">
            <span>Late Today (min)</span>
            <strong style={{ color: todayLateMinutes > 0 ? '#b91c1c' : undefined }}>
              {todayLateMinutes > 0 ? todayLateMinutes : '-'}
            </strong>
          </div>
          <div className="card">
            <span>Undertime Today (min)</span>
            <strong style={{ color: todayUndertimeMinutes > 0 ? '#b91c1c' : undefined }}>
              {todayState.hasTimeOut ? (todayUndertimeMinutes > 0 ? todayUndertimeMinutes : '-') : 'Pending'}
            </strong>
          </div>
          <div className="card">
            <span>Shift Start (Standard)</span>
            <strong>08:00 AM</strong>
          </div>
          <div className="card">
            <span>Required Hours</span>
            <strong>8 hrs / day</strong>
          </div>
        </div>
      </section>

      {/* Attendance Adjustments from last payroll */}
      {attendanceSummary && (
        <section className="table-section employee-modern-panel">
          <h3>Attendance Adjustments</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', opacity: 0.7 }}>
            From payroll period: {attendanceSummary.period_range || '-'}
          </p>
          <div className="summary employee-mini-summary employee-metric-strip">
            <div className="card">
              <span>Late (min)</span>
              <strong style={{ color: attendanceSummary.late_minutes > 0 ? '#b91c1c' : undefined }}>
                {attendanceSummary.late_minutes > 0 ? attendanceSummary.late_minutes : '-'}
              </strong>
            </div>
            <div className="card">
              <span>Late Deduction</span>
              <strong style={{ color: attendanceSummary.late_amt > 0 ? '#b91c1c' : undefined }}>
                {attendanceSummary.late_amt > 0 ? money(attendanceSummary.late_amt) : '-'}
              </strong>
            </div>
            <div className="card">
              <span>Undertime (min)</span>
              <strong style={{ color: attendanceSummary.undertime_minutes > 0 ? '#b91c1c' : undefined }}>
                {attendanceSummary.undertime_minutes > 0 ? attendanceSummary.undertime_minutes : '-'}
              </strong>
            </div>
            <div className="card">
              <span>Undertime Deduction</span>
              <strong style={{ color: attendanceSummary.undertime_amt > 0 ? '#b91c1c' : undefined }}>
                {attendanceSummary.undertime_amt > 0 ? money(attendanceSummary.undertime_amt) : '-'}
              </strong>
            </div>
          </div>
        </section>
      )}

      {/* Latest Payroll */}
      <section className="table-section employee-modern-panel">
        <h3>Latest Payroll Summary</h3>
        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card"><span>Payroll Range</span><strong>{payrollSummary?.payroll_range || '-'}</strong></div>
          <div className="card"><span>Gross Pay</span><strong>{money(payrollSummary?.gross_pay)}</strong></div>
          <div className="card"><span>Deductions</span><strong>{money(payrollSummary?.total_deductions)}</strong></div>
          <div className="card"><span>Net Pay</span><strong style={{ color: '#15803d' }}>{money(payrollSummary?.net_pay)}</strong></div>
        </div>
      </section>

      {/* Growth Track */}
      <section className="table-section employee-modern-panel">
        <h3>Growth Track</h3>
        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card"><span>Latest Rating</span><strong>{evaluationSummary.latestRating || '-'}</strong></div>
          <div className="card"><span>Latest Score</span><strong>{evaluationSummary.latestScore == null ? '-' : Number(evaluationSummary.latestScore).toFixed(1)}</strong></div>
          <div className="card"><span>Average Score</span><strong>{evaluationSummary.averageScore == null ? '-' : Number(evaluationSummary.averageScore).toFixed(1)}</strong></div>
          <div className="card"><span>Growth Change</span><strong style={{ color: growthDelta >= 0 ? '#15803d' : '#b91c1c' }}>{growthDeltaLabel}</strong></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Review Period</th><th>Review Date</th><th>Evaluator</th><th>Score</th><th>Rating</th><th>Growth Goals</th><th>Action Plan</th></tr>
            </thead>
            <tbody>
              {evaluations.length === 0 ? <tr><td colSpan="7">No growth evaluation records found.</td></tr> : null}
              {evaluations.map((ev) => (
                <tr key={ev.evaluation_id}>
                  <td>{ev.review_period || '-'}</td>
                  <td>{ev.review_date || '-'}</td>
                  <td>{ev.evaluator_name || '-'}</td>
                  <td>{Number(ev.overall_score || 0).toFixed(1)}</td>
                  <td><span className="status completed">{ev.rating || '-'}</span></td>
                  <td>{ev.goals || '-'}</td>
                  <td>{ev.action_plan || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Attendance Logs */}
      <section className="table-section employee-modern-panel">
        <h3>Recent Attendance Logs</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Date / Time</th><th>Activity</th><th>Status</th></tr>
            </thead>
            <tbody>
              {attendanceLogs.length === 0 ? <tr><td colSpan="3">No attendance logs found.</td></tr> : null}
              {attendanceLogs.map((log, i) => (
                <tr key={`${log.log_time}-${i}`}>
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
    </div>
  );
}
