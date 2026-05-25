(function () {
  if (!window.location.pathname.includes('employee_attendance.html')) return;

  const today = new Date().toISOString().slice(0, 10);

  const el = {
    date: document.getElementById('attendanceDateFilter'),
    department: document.getElementById('departmentFilter'),
    employee: document.getElementById('employeeFilter'),
    status: document.getElementById('statusFilter'),
    search: document.getElementById('attendanceSearch'),
    applyFilters: document.getElementById('applyAttendanceFilters'),
    entrySize: document.getElementById('attendanceEntrySize'),
    tbody: document.getElementById('attendanceTableBody'),
    summaryDate: document.getElementById('summaryDate'),
    summaryTotalEmployees: document.getElementById('summaryTotalEmployees'),
    summaryPresent: document.getElementById('summaryPresent'),
    summaryLateIncomplete: document.getElementById('summaryLateIncomplete'),
    entryInfo: document.getElementById('attendanceEntryInfo'),
    clockEmployeeId: document.getElementById('clockEmployeeId'),
    clockStatusMessage: document.getElementById('clockStatusMessage'),
    shiftEmployeeId: document.getElementById('shiftEmployeeId'),
    shiftDate: document.getElementById('shiftDate'),
    shiftForm: document.getElementById('shiftForm'),
    shiftTableBody: document.getElementById('shiftTableBody')
  };

  let allRecords = [];

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.log(`[${type}]`, message);
  }

  async function fetchJSON(url, options) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadEmployeesAndFilters() {
    const data = await fetchJSON('/api/attendance/employees');
    const employees = data.employees || [];

    const employeeFilterOptions = [`<option value="">All</option>`]
      .concat(
        employees.map(emp => `<option value="${escapeHTML(emp.emp_code)}">${escapeHTML(emp.emp_code)} - ${escapeHTML(emp.full_name)}</option>`)
      )
      .join('');
    const employeeIdOptions = employees
      .map(emp => `<option value="${emp.employee_id}">${escapeHTML(emp.emp_code)} - ${escapeHTML(emp.full_name)}</option>`)
      .join('');

    el.employee.innerHTML = employeeFilterOptions;
    el.clockEmployeeId.innerHTML = `<option value="">Select employee</option>${employeeIdOptions}`;
    el.shiftEmployeeId.innerHTML = `<option value="">Select employee</option>${employeeIdOptions}`;

    const deptOptions = ['<option value="">All</option>']
      .concat((data.departments || []).map(dept => `<option value="${escapeHTML(dept)}">${escapeHTML(dept)}</option>`))
      .join('');
    el.department.innerHTML = deptOptions;
  }

  async function loadSummary() {
    const data = await fetchJSON(`/api/attendance/summary?date=${encodeURIComponent(el.date.value)}`);
    el.summaryDate.textContent = data.date || '—';
    el.summaryTotalEmployees.textContent = data.totalEmployees || 0;
    el.summaryPresent.textContent = data.present || 0;
    el.summaryLateIncomplete.textContent = data.lateOrIncomplete || 0;
  }

  function renderRecords() {
    if (!Array.isArray(allRecords) || allRecords.length === 0) {
      el.tbody.innerHTML = '<tr><td colspan="11">No attendance records found.</td></tr>';
      el.entryInfo.textContent = 'Showing 0 entries';
      return;
    }

    const limit = Number(el.entrySize.value || 10);
    const rows = allRecords.slice(0, limit).map(row => {
      const statusClass = row.status === 'Present' ? 'present' : row.status === 'Late' ? 'pending' : row.status === 'Incomplete' ? 'pending' : 'rest';
      return `
        <tr>
          <td>${escapeHTML(row.emp_code)}</td>
          <td>${escapeHTML(row.full_name)}</td>
          <td>${escapeHTML(row.department || '—')}</td>
          <td>${row.is_rest_day ? 'Rest Day' : `${escapeHTML(row.shift_name || '—')} (${escapeHTML((row.start_time || '').slice(0, 5) || '—')} - ${escapeHTML((row.end_time || '').slice(0, 5) || '—')})`}</td>
          <td>${formatDateTime(row.time_in)}</td>
          <td>${formatDateTime(row.break_out)}</td>
          <td>${formatDateTime(row.break_in)}</td>
          <td>${formatDateTime(row.time_out)}</td>
          <td>${Number(row.worked_hours || 0).toFixed(2)}</td>
          <td>
            <div style="display:flex;gap:6px;align-items:center;">
              <input type="number" min="0" step="0.01" value="${Number(row.overtime_hours || 0).toFixed(2)}" data-ot-employee="${row.employee_id}" style="max-width:90px;">
              <button class="btn small-btn save-ot-btn" data-ot-employee="${row.employee_id}">Save</button>
            </div>
          </td>
          <td><span class="status ${statusClass}">${escapeHTML(row.status)}</span></td>
        </tr>
      `;
    }).join('');

    el.tbody.innerHTML = rows;
    el.entryInfo.textContent = `Showing ${Math.min(limit, allRecords.length)} of ${allRecords.length} entries`;

    el.tbody.querySelectorAll('.save-ot-btn').forEach(button => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const employeeId = Number(button.dataset.otEmployee || 0);
        const input = el.tbody.querySelector(`input[data-ot-employee="${employeeId}"]`);
        if (!input) return;

        try {
          await fetchJSON('/api/attendance/overtime', {
            method: 'POST',
            body: JSON.stringify({
              employee_id: employeeId,
              attendance_date: el.date.value,
              overtime_hours: Number(input.value || 0)
            })
          });
          notify('Overtime updated', 'success');
          await loadRecords();
          await loadSummary();
        } catch (err) {
          notify(err.message || 'Failed to update overtime', 'error');
        }
      });
    });
  }

  async function loadRecords() {
    const params = new URLSearchParams({
      date: el.date.value,
      status: el.status.value || 'All',
      department: el.department.value || '',
      employee_code: el.employee.value || '',
      search: el.search.value || ''
    });

    const data = await fetchJSON(`/api/attendance/records?${params.toString()}`);
    allRecords = data.records || [];
    renderRecords();
  }

  async function logClockAction(action) {
    const employeeId = Number(el.clockEmployeeId.value || 0);
    if (!employeeId) {
      notify('Select an employee first', 'warning');
      return;
    }

    await fetchJSON('/api/attendance/clock', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: employeeId,
        action,
        attendance_date: el.date.value,
        source: 'attendance_page'
      })
    });

    el.clockStatusMessage.textContent = `${action.replace('_', ' ')} logged at ${new Date().toLocaleTimeString()}`;
    await loadRecords();
    await loadSummary();
  }

  async function saveShift(event) {
    event.preventDefault();

    const payload = {
      employee_id: Number(el.shiftEmployeeId.value || 0),
      shift_date: el.shiftDate.value,
      shift_name: document.getElementById('shiftName').value,
      start_time: document.getElementById('shiftStartTime').value,
      end_time: document.getElementById('shiftEndTime').value,
      break_start: document.getElementById('shiftBreakStart').value || null,
      break_end: document.getElementById('shiftBreakEnd').value || null,
      is_rest_day: document.getElementById('shiftRestDay').checked
    };

    await fetchJSON('/api/shifts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    notify('Shift saved', 'success');
    await Promise.all([loadRecords(), loadShifts()]);
  }

  async function loadShifts() {
    const from = el.date.value;
    const endDate = new Date(from);
    endDate.setDate(endDate.getDate() + 6);
    const to = endDate.toISOString().slice(0, 10);

    const data = await fetchJSON(`/api/shifts?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
    const shifts = data.shifts || [];

    if (shifts.length === 0) {
      el.shiftTableBody.innerHTML = '<tr><td colspan="5">No shift records for this period.</td></tr>';
      return;
    }

    el.shiftTableBody.innerHTML = shifts.map(shift => `
      <tr>
        <td>${escapeHTML(shift.shift_date)}</td>
        <td>${escapeHTML(shift.emp_code)} - ${escapeHTML(shift.full_name)}</td>
        <td>${escapeHTML(shift.shift_name)}</td>
        <td>${shift.is_rest_day ? 'Rest Day' : `${escapeHTML((shift.start_time || '').slice(0, 5))} - ${escapeHTML((shift.end_time || '').slice(0, 5))}`}</td>
        <td><button class="btn small-btn delete-shift-btn" data-shift-id="${shift.shift_id}">Delete</button></td>
      </tr>
    `).join('');

    el.shiftTableBody.querySelectorAll('.delete-shift-btn').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await fetchJSON(`/api/shifts/${button.dataset.shiftId}`, { method: 'DELETE' });
          notify('Shift removed', 'success');
          await Promise.all([loadShifts(), loadRecords()]);
        } catch (err) {
          notify(err.message || 'Failed to delete shift', 'error');
        }
      });
    });
  }

  async function refreshAll() {
    try {
      await Promise.all([loadSummary(), loadRecords(), loadShifts()]);
    } catch (err) {
      notify(err.message || 'Failed to refresh attendance page', 'error');
    }
  }

  function attachEvents() {
    el.applyFilters.addEventListener('click', refreshAll);
    el.entrySize.addEventListener('change', renderRecords);

    document.querySelectorAll('.clock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await logClockAction(btn.dataset.clockAction);
          notify('Attendance updated', 'success');
        } catch (err) {
          notify(err.message || 'Failed to update attendance', 'error');
        }
      });
    });

    el.shiftForm.addEventListener('submit', async (event) => {
      try {
        await saveShift(event);
      } catch (err) {
        notify(err.message || 'Failed to save shift', 'error');
      }
    });

    el.date.addEventListener('change', refreshAll);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    el.date.value = today;
    if (el.shiftDate) el.shiftDate.value = today;

    try {
      await loadEmployeesAndFilters();
      await refreshAll();
      attachEvents();

      setInterval(() => {
        refreshAll().catch(err => console.error('Auto-refresh failed:', err));
      }, 30000);
    } catch (err) {
      notify(err.message || 'Failed to initialize attendance page', 'error');
    }
  });
})();
