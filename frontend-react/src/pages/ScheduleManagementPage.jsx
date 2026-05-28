import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';

const STATUS_OPTIONS = ['all', 'active', 'hold', 'resigned', 'terminated', 'end of contract'];

function toInputValue(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function emptyForm() {
  return {
    payroll_period: '',
    payroll_rate: '',
    main_computation: '',
    days_in_year: '',
    days_in_week: '',
    hours_in_day: '',
    week_in_year: '',
    strict_no_overtime: false,
    ot_rate: '',
    days_in_year_ot: '',
    rate_basis_ot: '',
    basis_absences: '',
    basis_overtime: ''
  };
}

export default function ScheduleManagementPage() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [message, setMessage] = useState('');
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadEmployees() {
    setLoadingEmployees(true);
    setMessage('');
    try {
      const { data } = await api.get('/admin_schedule_management_list', {
        params: {
          search: search.trim(),
          status
        }
      });
      if (!data.success) {
        throw new Error(data.message || 'Unable to load employee list.');
      }

      const primaryRows = Array.isArray(data.employees) ? data.employees : [];
      const shouldFallback = primaryRows.length === 0 && !search.trim() && status === 'all';

      if (!shouldFallback) {
        setEmployees(primaryRows);
        return;
      }

      const fallbackRes = await api.get('/employees');
      if (!fallbackRes.data?.success) {
        setEmployees(primaryRows);
        return;
      }

      const fallbackRows = Array.isArray(fallbackRes.data.employees) ? fallbackRes.data.employees : [];
      setEmployees(fallbackRows);
      setMessage('Loaded employee list using fallback source.');
    } catch (err) {
      setEmployees([]);
      setMessage(getApiMessage(err, 'Unable to load employee list.'));
    } finally {
      setLoadingEmployees(false);
    }
  }

  async function loadEmployeeSchedule(employeeId) {
    if (!employeeId) return;

    setLoadingDetails(true);
    setMessage('');
    try {
      const { data } = await api.get(`/admin_schedule_management/${encodeURIComponent(employeeId)}`);
      if (!data.success) {
        throw new Error(data.message || 'Unable to load employee schedule settings.');
      }

      const employee = data.employee || null;
      const schedule = data.schedule || {};

      setSelectedEmployee(employee);
      setForm({
        payroll_period: toInputValue(schedule.payroll_period),
        payroll_rate: toInputValue(schedule.payroll_rate),
        main_computation: toInputValue(schedule.main_computation),
        days_in_year: toInputValue(schedule.days_in_year),
        days_in_week: toInputValue(schedule.days_in_week),
        hours_in_day: toInputValue(schedule.hours_in_day),
        week_in_year: toInputValue(schedule.week_in_year),
        strict_no_overtime: Boolean(schedule.strict_no_overtime),
        ot_rate: toInputValue(schedule.ot_rate),
        days_in_year_ot: toInputValue(schedule.days_in_year_ot),
        rate_basis_ot: toInputValue(schedule.rate_basis_ot),
        basis_absences: toInputValue(schedule.basis_absences),
        basis_overtime: toInputValue(schedule.basis_overtime)
      });
    } catch (err) {
      setSelectedEmployee(null);
      setForm(emptyForm());
      setMessage(getApiMessage(err, 'Unable to load employee schedule settings.'));
    } finally {
      setLoadingDetails(false);
    }
  }

  useEffect(() => {
    loadEmployees().catch(() => {});
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function saveSchedule() {
    if (!selectedEmployee?.employee_id) {
      setMessage('Select an employee first.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const { data } = await api.put(`/admin_schedule_management/${encodeURIComponent(selectedEmployee.employee_id)}`, form);
      if (!data.success) {
        throw new Error(data.message || 'Unable to save schedule settings.');
      }
      setMessage(data.message || 'Schedule settings updated successfully.');
      await loadEmployeeSchedule(selectedEmployee.employee_id);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save schedule settings.'));
    } finally {
      setSaving(false);
    }
  }

  const employeeCount = useMemo(() => employees.length, [employees]);

  return (
    <>
      <header className="header">
        <h2>Schedule Management</h2>
        <p>Manage payroll schedule and overtime settings for employees.</p>
      </header>

      <section className="table-section">
        <div className="employee-table-controls">
          <label>
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Employee ID, name, or department"
            />
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>
              ))}
            </select>
          </label>
          <div className="toolbar">
            <button type="button" className="btn secondary" onClick={() => loadEmployees()} disabled={loadingEmployees}>
              {loadingEmployees ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      <section className="schedule-admin-layout">
        <section className="table-section">
          <div className="table-header">
            <div>
              <h3>Employee List</h3>
              <p>{employeeCount} employee(s) found.</p>
            </div>
          </div>
          <div className="table-scroll compact">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingEmployees ? (
                  <tr><td colSpan="4">Loading employees...</td></tr>
                ) : employees.length === 0 ? (
                  <tr><td colSpan="4">No employees found.</td></tr>
                ) : employees.map((employee) => (
                  <tr
                    key={employee.employee_id}
                    className={selectedEmployee?.employee_id === employee.employee_id ? 'selected-row' : ''}
                    onClick={() => loadEmployeeSchedule(employee.employee_id)}
                  >
                    <td>{employee.emp_code || '-'}</td>
                    <td>{employee.full_name || '-'}</td>
                    <td>{employee.department || '-'}</td>
                    <td>{employee.status || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-section">
          <div className="table-header">
            <div>
              <h3>Schedule Settings</h3>
              <p>{selectedEmployee ? `${selectedEmployee.emp_code} - ${selectedEmployee.full_name}` : 'Select an employee from the list.'}</p>
            </div>
          </div>

          {loadingDetails ? (
            <p className="muted">Loading schedule settings...</p>
          ) : (
            <div className="employee-form-grid">
              <label>
                Payroll Period
                <select value={form.payroll_period} onChange={(event) => updateForm('payroll_period', event.target.value)}>
                  <option value="">Select period</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Semi-Monthly">Semi-Monthly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </label>
              <label>
                Payroll Rate
                <input value={form.payroll_rate} onChange={(event) => updateForm('payroll_rate', event.target.value)} />
              </label>
              <label>
                Main Computation
                <input type="number" step="0.01" value={form.main_computation} onChange={(event) => updateForm('main_computation', event.target.value)} />
              </label>
              <label>
                Days in Year
                <input type="number" value={form.days_in_year} onChange={(event) => updateForm('days_in_year', event.target.value)} />
              </label>
              <label>
                Days in Week
                <input type="number" min="0" max="7" value={form.days_in_week} onChange={(event) => updateForm('days_in_week', event.target.value)} />
              </label>
              <label>
                Hours in Day
                <input type="number" step="0.01" value={form.hours_in_day} onChange={(event) => updateForm('hours_in_day', event.target.value)} />
              </label>
              <label>
                Weeks in Year
                <input type="number" value={form.week_in_year} onChange={(event) => updateForm('week_in_year', event.target.value)} />
              </label>
              <label>
                OT Rate
                <input value={form.ot_rate} onChange={(event) => updateForm('ot_rate', event.target.value)} />
              </label>
              <label>
                Days in Year (OT)
                <input type="number" value={form.days_in_year_ot} onChange={(event) => updateForm('days_in_year_ot', event.target.value)} />
              </label>
              <label>
                Rate Basis (OT)
                <input type="number" step="0.01" value={form.rate_basis_ot} onChange={(event) => updateForm('rate_basis_ot', event.target.value)} />
              </label>
              <label>
                Basis Absences
                <input value={form.basis_absences} onChange={(event) => updateForm('basis_absences', event.target.value)} />
              </label>
              <label>
                Basis Overtime
                <input value={form.basis_overtime} onChange={(event) => updateForm('basis_overtime', event.target.value)} />
              </label>
              <label>
                Strict No Overtime
                <select
                  value={form.strict_no_overtime ? 'yes' : 'no'}
                  onChange={(event) => updateForm('strict_no_overtime', event.target.value === 'yes')}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
          )}

          <div className="toolbar">
            <button
              type="button"
              className="btn"
              onClick={saveSchedule}
              disabled={!selectedEmployee || saving || loadingDetails}
            >
              {saving ? 'Saving...' : 'Save Schedule Settings'}
            </button>
          </div>
        </section>
      </section>

      <p className="message">{message}</p>
    </>
  );
}
