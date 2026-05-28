import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const CALENDAR_WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWorkingDaySet(daysInWeek) {
  const normalized = Math.max(0, Math.min(7, Number(daysInWeek) || 0));
  const weeklyOrder = [1, 2, 3, 4, 5, 6, 0];
  return new Set(weeklyOrder.slice(0, normalized));
}

function buildMonthCells(viewDate, workingDays) {
  const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstWeekDay = start.getDay();
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - firstWeekDay);

  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(cursor);
    cells.push({
      key: day.toISOString().slice(0, 10),
      day,
      inMonth: day.getMonth() === viewDate.getMonth(),
      isWorkday: workingDays.has(day.getDay())
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function safeValue(value, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
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
        if (!data.success) {
          throw new Error(data.message || 'Unable to load schedule.');
        }
        setSchedule(data.schedule || null);
        setEmployee(data.employee || null);
      })
      .catch((err) => setMessage(getApiMessage(err, 'Unable to load schedule.')));
  }, [user?.user_id]);

  const weeklyHours = useMemo(() => {
    const hoursInDay = Number(schedule?.hours_in_day || 0);
    const daysInWeek = Number(schedule?.days_in_week || 0);
    if (!hoursInDay || !daysInWeek) return 'N/A';
    return `${(hoursInDay * daysInWeek).toFixed(2)} hrs`;
  }, [schedule]);

  const workingDays = useMemo(
    () => getWorkingDaySet(schedule?.days_in_week),
    [schedule?.days_in_week]
  );

  const monthCells = useMemo(
    () => buildMonthCells(viewMonth, workingDays),
    [viewMonth, workingDays]
  );

  const monthLabel = useMemo(
    () => viewMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
    [viewMonth]
  );

  function changeMonth(step) {
    setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));
  }

  return (
    <>
      <header className="header">
        <h2>Schedule</h2>
        <p>View your assigned shift and payroll schedule settings.</p>
      </header>

      <section className="summary">
        <div className="card"><span>Hours Per Day</span><strong>{safeValue(schedule?.hours_in_day)}</strong></div>
        <div className="card"><span>Days Per Week</span><strong>{safeValue(schedule?.days_in_week)}</strong></div>
        <div className="card"><span>Weekly Hours</span><strong>{weeklyHours}</strong></div>
        <div className="card"><span>Overtime Rule</span><strong>{schedule?.strict_no_overtime ? 'Strict No Overtime' : 'Overtime Allowed'}</strong></div>
      </section>

      <section className="table-section">
        <h3>Shift Schedule Information</h3>
        <div className="summary employee-mini-summary">
          <div className="card"><span>Employee Code</span><strong>{safeValue(employee?.emp_code)}</strong></div>
          <div className="card"><span>Payroll Period</span><strong>{safeValue(schedule?.payroll_period)}</strong></div>
          <div className="card"><span>Payroll Rate</span><strong>{safeValue(schedule?.payroll_rate)}</strong></div>
          <div className="card"><span>OT Rate</span><strong>{safeValue(schedule?.ot_rate)}</strong></div>
          <div className="card"><span>Days In Year</span><strong>{safeValue(schedule?.days_in_year)}</strong></div>
          <div className="card"><span>Weeks In Year</span><strong>{safeValue(schedule?.week_in_year)}</strong></div>
          <div className="card"><span>Days In Year (OT)</span><strong>{safeValue(schedule?.days_in_year_ot)}</strong></div>
          <div className="card"><span>Rate Basis (OT)</span><strong>{safeValue(schedule?.rate_basis_ot)}</strong></div>
          <div className="card"><span>Main Computation</span><strong>{safeValue(schedule?.main_computation)}</strong></div>
          <div className="card"><span>Basis Absences</span><strong>{safeValue(schedule?.basis_absences)}</strong></div>
          <div className="card"><span>Basis Overtime</span><strong>{safeValue(schedule?.basis_overtime)}</strong></div>
        </div>
        <p className="message">{message}</p>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>Schedule Calendar</h3>
            <p>Generated from your weekly schedule settings.</p>
          </div>
          <div className="calendar-month-controls">
            <button type="button" className="btn secondary" onClick={() => changeMonth(-1)}>Previous</button>
            <strong>{monthLabel}</strong>
            <button type="button" className="btn secondary" onClick={() => changeMonth(1)}>Next</button>
          </div>
        </div>

        <div className="schedule-calendar">
          {CALENDAR_WEEKDAY_HEADERS.map((header) => (
            <div key={header} className="calendar-weekday">{header}</div>
          ))}

          {monthCells.map((cell) => (
            <article
              key={cell.key}
              className={`calendar-day ${cell.inMonth ? '' : 'outside-month'} ${cell.isWorkday ? 'workday' : 'restday'}`}
            >
              <div className="calendar-day-number">{cell.day.getDate()}</div>
              <small>{cell.isWorkday ? 'Work' : 'Rest'}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
