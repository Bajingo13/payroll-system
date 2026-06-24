import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseWorkingDays(str) {
  if (str && String(str).trim()) {
    const parsed = String(str).split(',')
      .map(s => Number(s.trim()))
      .filter(n => n >= 0 && n <= 6 && Number.isInteger(n));
    if (parsed.length > 0) return new Set(parsed);
  }
  // fallback: Mon–Fri
  return new Set([1, 2, 3, 4, 5]);
}

function buildMonthCells(viewDate, workingDays) {
  const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - start.getDay());

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(cursor);
    cells.push({
      key: day.toISOString().slice(0, 10),
      day,
      inMonth: day.getMonth() === viewDate.getMonth(),
      isWorkday: workingDays.has(day.getDay()),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function safeVal(value, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatTime(val) {
  if (!val) return 'N/A';
  const [h, m] = String(val).split(':').map(Number);
  if (Number.isNaN(h)) return val;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function EmployeeSchedulePage() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [message, setMessage] = useState('');
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!user?.user_id) return;
    api.get('/employee_schedule', { params: { user_id: user.user_id } })
      .then(({ data }) => {
        if (!data.success) throw new Error(data.message || 'Unable to load schedule.');
        setSchedule(data.schedule || null);
        setEmployee(data.employee || null);
      })
      .catch(err => setMessage(getApiMessage(err, 'Unable to load schedule.')));
  }, [user?.user_id]);

  const workingDays = useMemo(
    () => parseWorkingDays(schedule?.working_days),
    [schedule?.working_days]
  );

  const workingDayLabels = useMemo(
    () => DAY_SHORT.filter((_, i) => workingDays.has(i)).join(', '),
    [workingDays]
  );

  const restDayLabels = useMemo(
    () => DAY_SHORT.filter((_, i) => !workingDays.has(i)).join(', '),
    [workingDays]
  );

  const weeklyHours = useMemo(() => {
    const h = Number(schedule?.hours_in_day || 0);
    const d = workingDays.size;
    if (!h || !d) return 'N/A';
    return `${(h * d).toFixed(1)} hrs`;
  }, [schedule?.hours_in_day, workingDays]);

  const monthCells = useMemo(
    () => buildMonthCells(viewMonth, workingDays),
    [viewMonth, workingDays]
  );

  const monthLabel = viewMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  function changeMonth(step) {
    setViewMonth(c => new Date(c.getFullYear(), c.getMonth() + step, 1));
  }

  const hasNightDiff = Number(schedule?.night_diff) === 1;

  return (
    <div className="employee-modern-page">
      <header className="employee-hero compact">
        <div>
          <span>Schedule</span>
          <h2>My Work Schedule</h2>
          <p>Your assigned shift and payroll schedule settings.</p>
        </div>
      </header>

      {/* ── Top summary cards ── */}
      <section className="summary employee-modern-summary">
        <div className="card"><span>Shift Start</span><strong>{formatTime(schedule?.time_in)}</strong></div>
        <div className="card"><span>Shift End</span><strong>{formatTime(schedule?.time_out)}</strong></div>
        <div className="card"><span>Hours / Day</span><strong>{safeVal(schedule?.hours_in_day)}</strong></div>
        <div className="card"><span>Weekly Hours</span><strong>{weeklyHours}</strong></div>
      </section>

      {/* ── Shift details panel ── */}
      <section className="table-section employee-modern-panel">
        <h3>Shift Details</h3>
        <div className="summary employee-mini-summary employee-metric-strip">

          {schedule?.template_name && (
            <div className="card" style={{ gridColumn: 'span 2' }}>
              <span>Assigned Template</span>
              <strong>{schedule.template_name}</strong>
            </div>
          )}

          <div className="card"><span>Time In</span><strong>{formatTime(schedule?.time_in)}</strong></div>
          <div className="card"><span>Time Out</span><strong>{formatTime(schedule?.time_out)}</strong></div>
          <div className="card"><span>Break</span><strong>{schedule?.break_minutes ? `${schedule.break_minutes} min` : 'N/A'}</strong></div>
          <div className="card"><span>Hours / Day</span><strong>{safeVal(schedule?.hours_in_day)}</strong></div>
          <div className="card"><span>Days / Week</span><strong>{workingDays.size}</strong></div>
          <div className="card"><span>Weekly Hours</span><strong>{weeklyHours}</strong></div>

          <div className="card">
            <span>Working Days</span>
            <strong style={{ fontSize: '0.85rem' }}>{workingDayLabels || 'N/A'}</strong>
          </div>
          <div className="card">
            <span>Rest Days</span>
            <strong style={{ fontSize: '0.85rem' }}>{restDayLabels || 'None'}</strong>
          </div>

          <div className="card">
            <span>Night Differential</span>
            <strong>{hasNightDiff ? `${(Number(schedule.night_diff_rate) * 100).toFixed(0)}% (${formatTime(schedule.night_diff_start)}–${formatTime(schedule.night_diff_end)})` : 'None'}</strong>
          </div>

          <div className="card"><span>Overtime</span><strong>{schedule?.strict_no_overtime ? 'Not Allowed' : 'Allowed'}</strong></div>
        </div>
      </section>

      {/* ── Payroll schedule panel ── */}
      <section className="table-section employee-modern-panel">
        <h3>Payroll Schedule</h3>
        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card"><span>Payroll Period</span><strong>{safeVal(schedule?.payroll_period)}</strong></div>
          <div className="card"><span>Payroll Rate</span><strong>{safeVal(schedule?.payroll_rate)}</strong></div>
          <div className="card"><span>OT Rate</span><strong>{safeVal(schedule?.ot_rate)}</strong></div>
          <div className="card"><span>Days in Year</span><strong>{safeVal(schedule?.days_in_year)}</strong></div>
          <div className="card"><span>Weeks in Year</span><strong>{safeVal(schedule?.week_in_year)}</strong></div>
        </div>
      </section>

      {/* ── Calendar ── */}
      <section className="table-section employee-modern-panel">
        <div className="table-header">
          <div>
            <h3>Schedule Calendar</h3>
            <p>
              Work days highlighted based on your assigned schedule
              {workingDayLabels ? ` (${workingDayLabels})` : ''}.
            </p>
          </div>
          <div className="calendar-month-controls">
            <button type="button" className="btn secondary" onClick={() => changeMonth(-1)}>Previous</button>
            <strong>{monthLabel}</strong>
            <button type="button" className="btn secondary" onClick={() => changeMonth(1)}>Next</button>
          </div>
        </div>

        <div className="schedule-calendar">
          {WEEKDAY_HEADERS.map(h => (
            <div key={h} className="calendar-weekday">{h}</div>
          ))}
          {monthCells.map(cell => (
            <article
              key={cell.key}
              className={`calendar-day ${cell.inMonth ? '' : 'outside-month'} ${cell.isWorkday ? 'workday' : 'restday'}`}
            >
              <div className="calendar-day-number">{cell.day.getDate()}</div>
              <small>{cell.isWorkday ? 'Work' : 'Rest'}</small>
            </article>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--muted,#6b7280)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--primary,#2563eb)', display: 'inline-block' }} />
            Work day
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--border,#e5e7eb)', display: 'inline-block' }} />
            Rest day
          </span>
        </div>
      </section>

      {message && <p className="message">{message}</p>}
    </div>
  );
}
