async function parseApiJson(res, fallbackMessage) {
  const raw = await res.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(fallbackMessage || 'Invalid server response. Please refresh and try again.');
  }

  if (!res.ok) {
    throw new Error((data && data.message) || fallbackMessage || 'Request failed.');
  }

  return data;
}

function setValue(id, value) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = value === undefined || value === null || value === '' ? 'N/A' : String(value);
}

function setScheduleMessage(message, ok = false) {
  const node = document.getElementById('scheduleMessage');
  if (!node) return;
  node.textContent = message || '';
  node.className = ok ? 'time-message tag-success' : 'time-message tag-warn';
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchEmployeeSchedule(userId) {
  const dashRes = await fetch(`/api/employee_dashboard?user_id=${encodeURIComponent(userId)}`);
  const dashData = await parseApiJson(dashRes, 'Unable to load employee details.');
  if (!dashData.success || !dashData.employee || !dashData.employee.emp_code) {
    throw new Error(dashData.message || 'Employee details were not found.');
  }

  const empCode = dashData.employee.emp_code;
  const empRes = await fetch(`/api/employee/${encodeURIComponent(empCode)}`);
  const empData = await parseApiJson(empRes, 'Unable to load schedule information.');
  if (!empData.success || !empData.employee) {
    throw new Error(empData.message || 'Failed to load schedule information.');
  }

  const schedule = {
    payroll_period: empData.employee.payroll_period,
    payroll_rate: empData.employee.payroll_rate,
    ot_rate: empData.employee.ot_rate,
    days_in_year: empData.employee.days_in_year,
    days_in_week: empData.employee.days_in_week,
    hours_in_day: empData.employee.hours_in_day,
    week_in_year: empData.employee.week_in_year,
    strict_no_overtime: empData.employee.strict_no_overtime,
    days_in_year_ot: empData.employee.days_in_year_ot,
    rate_basis_ot: empData.employee.rate_basis_ot,
    main_computation: empData.employee.main_computation,
    basis_absences: empData.employee.basis_absences,
    basis_overtime: empData.employee.basis_overtime
  };

  return {
    success: true,
    user: dashData.user,
    employee: dashData.employee,
    schedule
  };
}

function renderSchedule(data) {
  const user = data.user || {};
  const employee = data.employee || {};
  const schedule = data.schedule || {};

  const displayName = user.full_name || employee.employee_name || 'Employee';
  document.getElementById('empName').textContent = displayName;
  document.getElementById('empRole').textContent = user.role || 'Employee';
  document.getElementById('welcomeHeader').textContent = `Schedule, ${displayName}`;

  const hoursPerDay = toNumberOrNull(schedule.hours_in_day);
  const daysPerWeek = toNumberOrNull(schedule.days_in_week);
  const weeklyHours = hoursPerDay !== null && daysPerWeek !== null
    ? (hoursPerDay * daysPerWeek).toFixed(2)
    : 'N/A';

  setValue('schedHoursPerDay', hoursPerDay !== null ? `${hoursPerDay} hour(s)` : 'N/A');
  setValue('schedDaysPerWeek', daysPerWeek !== null ? `${daysPerWeek} day(s)` : 'N/A');
  setValue('schedWeeklyHours', weeklyHours !== 'N/A' ? `${weeklyHours} hour(s)` : 'N/A');
  setValue('schedOvertimeRule', Number(schedule.strict_no_overtime || 0) === 1 ? 'No Overtime Allowed' : 'Overtime Allowed');

  setValue('schedEmployeeCode', employee.emp_code || 'N/A');
  setValue('schedPayrollPeriod', schedule.payroll_period);
  setValue('schedPayrollRate', schedule.payroll_rate);
  setValue('schedOtRate', schedule.ot_rate || 'Standard');
  setValue('schedDaysInYear', schedule.days_in_year);
  setValue('schedWeeksInYear', schedule.week_in_year);
  setValue('schedDaysInYearOt', schedule.days_in_year_ot);
  setValue('schedRateBasisOt', schedule.rate_basis_ot);
  setValue('schedMainComputation', schedule.main_computation);
  setValue('schedBasisAbsences', schedule.basis_absences);
  setValue('schedBasisOvertime', schedule.basis_overtime);

  if (!data.schedule) {
    setScheduleMessage('No schedule settings configured yet for this employee.');
  } else {
    setScheduleMessage('');
  }
}

async function loadEmployeeSchedulePage() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    const data = await fetchEmployeeSchedule(userId);
    renderSchedule(data);
  } catch (err) {
    console.error(err);
    setScheduleMessage(err.message || 'Failed to load schedule information.');
  }
}

document.getElementById('logout').addEventListener('click', (event) => {
  event.preventDefault();
  sessionStorage.removeItem('user_id');
  sessionStorage.removeItem('admin_name');
  sessionStorage.removeItem('role');
  window.location.href = '../login/login.html';
});

document.addEventListener('DOMContentLoaded', loadEmployeeSchedulePage);
