import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const SYSTEM_LISTS = [
  ['company', 'Company'],
  ['location', 'Location'],
  ['branch', 'Branch'],
  ['division', 'Division'],
  ['department', 'Department'],
  ['class', 'Class'],
  ['position', 'Position'],
  ['empType', 'Employee Type', 'employee_type'],
  ['salaryType', 'Salary Type', 'salary_type']
];

const moneyFields = [
  'basic_salary',
  'absence_deduction',
  'late_deduction',
  'undertime_deduction',
  'overtime',
  'taxable_allowances',
  'non_taxable_allowances',
  'adj_comp',
  'adj_non_comp',
  'total_leaves_used',
  'gsis_employee',
  'gsis_employer',
  'gsis_ecc',
  'sss_employee',
  'sss_employer',
  'sss_ecc',
  'pagibig_employee',
  'pagibig_employer',
  'pagibig_ecc',
  'philhealth_employee',
  'philhealth_employer',
  'philhealth_ecc',
  'tax_withheld',
  'total_deductions',
  'loans',
  'other_deductions',
  'premium_adj',
  'ytd_sss',
  'ytd_wtax',
  'ytd_philhealth',
  'ytd_gsis',
  'ytd_pagibig',
  'ytd_gross'
];

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function makeEmptyPayroll() {
  return moneyFields.reduce((acc, field) => ({ ...acc, [field]: '' }), {
    absence_time: 0,
    late_time: 0,
    undertime: 0,
    payroll_status: 'Active'
  });
}

function fillSelectOptions(rows, placeholder = 'All') {
  return [
    <option value="" key="empty">{placeholder}</option>,
    ...rows.map((row) => (
      <option key={row.value || row.group_id || row.period_id || row.month_id || row.year_id} value={row.value}>
        {row.value}
      </option>
    ))
  ];
}

export default function PayrollComputationPage() {
  const { user } = useAuth();
  const [meta, setMeta] = useState({ payrollGroups: [], payrollPeriods: [], payrollMonths: [], payrollYears: [] });
  const [lists, setLists] = useState({});
  const [filters, setFilters] = useState({
    payroll_group: '',
    payroll_period: '',
    month: '',
    year: '',
    option: 'active',
    employee: ''
  });
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [runId, setRunId] = useState(null);
  const [payroll, setPayroll] = useState(makeEmptyPayroll);
  const [allowances, setAllowances] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedPeriod = meta.payrollPeriods.find((item) => String(item.period_id) === String(filters.payroll_period));
  const selectedMonth = meta.payrollMonths.find((item) => String(item.month_id) === String(filters.month));
  const selectedYear = meta.payrollYears.find((item) => String(item.year_id) === String(filters.year));
  const payrollRange = [selectedPeriod?.period_name, selectedMonth?.month_name, selectedYear?.year_value].filter(Boolean).join(' ');
  const periodReady = Boolean(filters.payroll_group && filters.payroll_period && filters.month && filters.year);

  const totals = useMemo(() => {
    const gross =
      toNumber(payroll.basic_salary) -
      toNumber(payroll.absence_deduction) -
      toNumber(payroll.late_deduction) -
      toNumber(payroll.undertime_deduction) +
      toNumber(payroll.overtime) +
      toNumber(payroll.taxable_allowances) +
      toNumber(payroll.non_taxable_allowances) +
      toNumber(payroll.adj_comp) +
      toNumber(payroll.adj_non_comp) +
      toNumber(payroll.total_leaves_used);

    const deductionsTotal =
      toNumber(payroll.gsis_employee) +
      toNumber(payroll.sss_employee) +
      toNumber(payroll.pagibig_employee) +
      toNumber(payroll.philhealth_employee) +
      toNumber(payroll.tax_withheld) +
      toNumber(payroll.total_deductions) +
      toNumber(payroll.loans) +
      toNumber(payroll.other_deductions) +
      toNumber(payroll.premium_adj);

    return {
      gross,
      deductions: deductionsTotal,
      net: gross - deductionsTotal
    };
  }, [payroll]);

  useEffect(() => {
    async function loadInitialData() {
      const payrollRes = await api.get('/payroll_periods');
      const payload = payrollRes.data?.data || {};
      setMeta({
        payrollGroups: payload.payrollGroups || [],
        payrollPeriods: payload.payrollPeriods || [],
        payrollMonths: payload.payrollMonths || [],
        payrollYears: payload.payrollYears || []
      });

      const listEntries = await Promise.all(
        SYSTEM_LISTS.map(async ([key, , category = key]) => {
          const { data } = await api.get(`/system_lists/${category}`);
          return [key, data || []];
        })
      );
      setLists(Object.fromEntries(listEntries));
    }

    loadInitialData().catch((err) => setMessage(getApiMessage(err, 'Unable to load payroll setup data.')));
  }, []);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function updatePayroll(name, value) {
    setPayroll((current) => ({ ...current, [name]: value }));
  }

  async function ensurePayrollRun() {
    if (!filters.payroll_group || !filters.payroll_period || !filters.month || !filters.year) {
      throw new Error('Please select payroll group, period, month, and year.');
    }

    const { data } = await api.post('/payroll_runs', {
      group_id: filters.payroll_group,
      period_id: filters.payroll_period,
      month_id: filters.month,
      year_id: filters.year,
      payroll_range: payrollRange,
      user_id: user.user_id,
      admin_name: user.full_name
    });

    if (!data.success || !data.run_id) {
      throw new Error(data.message || 'Unable to create payroll run.');
    }

    setRunId(data.run_id);
    return data.run_id;
  }

  async function loadEmployees() {
    setLoading(true);
    setMessage('');
    setSelectedEmployee(null);

    try {
      const effectiveRunId = await ensurePayrollRun();
      const params = {
        option: filters.option,
        company: filters.company || '',
        location: filters.location || '',
        branch: filters.branch || '',
        division: filters.division || '',
        department: filters.department || '',
        class: filters.class || '',
        position: filters.position || '',
        empType: filters.empType || '',
        salaryType: filters.salaryType || '',
        employee: filters.employee || '',
        run_id: effectiveRunId
      };

      const { data } = await api.get('/employees_for_payroll', { params });
      if (!data.success) throw new Error(data.message || 'Unable to load employees.');
      setEmployees(data.employees || []);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load employees.'));
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeePayroll(employee) {
    if (!runId) return;
    setLoading(true);
    setMessage('');

    try {
      const { data } = await api.get(`/employee_payroll_settings/${employee.employee_id}`, {
        params: {
          run_id: runId,
          periodOption: selectedPeriod?.period_name || ''
        }
      });

      if (!data.success) throw new Error(data.message || 'Unable to load employee payroll.');

      const record = data.data || {};
      const nextPayroll = makeEmptyPayroll();
      moneyFields.forEach((field) => {
        nextPayroll[field] = record[field] ?? record.previousYtd?.[field] ?? '';
      });
      nextPayroll.basic_salary = record.basic_salary ?? record.main_computation ?? '';
      nextPayroll.absence_time = record.absence_time ?? 0;
      nextPayroll.late_time = record.late_time ?? 0;
      nextPayroll.undertime = record.undertime ?? 0;
      nextPayroll.payroll_status = record.payroll_status || 'Active';

      setSelectedEmployee(employee);
      setPayroll(nextPayroll);
      setAllowances(record.allowances || []);
      setDeductions(record.deductions || []);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load employee payroll.'));
    } finally {
      setLoading(false);
    }
  }

  async function savePayroll() {
    if (!selectedEmployee || !runId) {
      setMessage('Please select an employee first.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const payload = {
        run_id: runId,
        ...moneyFields.reduce((acc, field) => ({ ...acc, [field]: toNumber(payroll[field]) }), {}),
        absence_time: toNumber(payroll.absence_time),
        late_time: toNumber(payroll.late_time),
        undertime: toNumber(payroll.undertime),
        payroll_status: payroll.payroll_status || 'Active',
        gross_pay: totals.gross,
        grand_total_deductions: totals.deductions,
        net_pay: totals.net,
        periodOption: selectedPeriod?.period_name || '',
        allowances,
        deductions,
        user_id: user.user_id,
        admin_name: user.full_name
      };

      const { data } = await api.put(`/update_employee_payroll/${selectedEmployee.employee_id}`, payload);
      if (!data.success) throw new Error(data.message || 'Unable to save payroll.');

      setMessage('Payroll saved successfully.');
      await loadEmployeePayroll(selectedEmployee);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save payroll.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="header">
        <h2>Payroll Computation</h2>
        <p>Compute employee payroll with automated deductions and payroll record saving.</p>
      </header>

      <section className="table-section payroll-setup">
        <div className="payroll-section-heading">
          <div>
            <h3>Step 1: Setup Payroll</h3>
            <p>Set the payroll coverage, then narrow the employee list only when needed.</p>
          </div>
          <span className={periodReady ? 'payroll-ready-badge ready' : 'payroll-ready-badge'}>
            {periodReady ? 'Ready to load' : 'Period required'}
          </span>
        </div>
        <div className="payroll-grid">
          <div className="form-panel">
            <h4>Payroll Period</h4>
            <p className="panel-note">Required before loading employees.</p>
            <FormSelect label="Payroll Group" value={filters.payroll_group} onChange={(value) => updateFilter('payroll_group', value)}>
              <option value="">Select payroll group</option>
              {meta.payrollGroups.map((item) => <option key={item.group_id} value={item.group_id}>{item.group_name}</option>)}
            </FormSelect>
            <FormSelect label="Period" value={filters.payroll_period} onChange={(value) => updateFilter('payroll_period', value)}>
              <option value="">Select period</option>
              {meta.payrollPeriods.map((item) => <option key={item.period_id} value={item.period_id}>{item.period_name}</option>)}
            </FormSelect>
            <FormSelect label="Month" value={filters.month} onChange={(value) => updateFilter('month', value)}>
              <option value="">Select month</option>
              {meta.payrollMonths.map((item) => <option key={item.month_id} value={item.month_id}>{item.month_name}</option>)}
            </FormSelect>
            <FormSelect label="Year" value={filters.year} onChange={(value) => updateFilter('year', value)}>
              <option value="">Select year</option>
              {meta.payrollYears.map((item) => <option key={item.year_id} value={item.year_id}>{item.year_value}</option>)}
            </FormSelect>
            <FormInput label="Generated Payroll Range" value={payrollRange} readOnly />
            <div className="payroll-period-preview">
              <span>Selected coverage</span>
              <strong>{payrollRange || 'Choose group, period, month, and year'}</strong>
            </div>
          </div>

          <div className="form-panel">
            <h4>Filter</h4>
            <p className="panel-note">Leave filters as All to include every eligible employee.</p>
            {SYSTEM_LISTS.map(([key, label]) => (
              <FormSelect key={key} label={label} value={filters[key] || ''} onChange={(value) => updateFilter(key, value)}>
                {fillSelectOptions(lists[key] || [])}
              </FormSelect>
            ))}
            <FormSelect label="Option" value={filters.option} onChange={(value) => updateFilter('option', value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="hold">Hold</option>
            </FormSelect>
            <button className="btn" type="button" disabled={loading} onClick={loadEmployees}>
              {loading ? 'Loading...' : 'Proceed to Computation'}
            </button>
          </div>
        </div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>Step 2: Employee Payroll</h3>
            <p>{runId ? `Payroll Run #${runId} ${payrollRange ? `(${payrollRange})` : ''}` : 'Load employees after selecting a payroll period.'}</p>
          </div>
          <div className="payroll-loaded-count">
            <strong>{employees.length}</strong>
            <span>employees loaded</span>
          </div>
        </div>

        <div className="payroll-workspace">
          <div className="employee-list-panel">
            <div className="panel-title-row">
              <h4>Employee List</h4>
              <span>{selectedEmployee ? selectedEmployee.emp_code : 'Select one'}</span>
            </div>
            <div className="table-scroll compact">
              <table>
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr><td colSpan="4">No employees loaded.</td></tr>
                  ) : employees.map((employee) => (
                    <tr
                      key={employee.employee_id}
                      className={selectedEmployee?.employee_id === employee.employee_id ? 'selected-row' : ''}
                      onClick={() => loadEmployeePayroll(employee)}
                    >
                      <td>{employee.emp_code}</td>
                      <td>{employee.last_name}</td>
                      <td>{employee.first_name}</td>
                      <td>{employee.department || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="payroll-detail-panel">
            {selectedEmployee ? (
              <>
                <div className="payroll-profile">
                  <h3>{selectedEmployee.first_name} {selectedEmployee.last_name}</h3>
                  <p>{selectedEmployee.emp_code} · {selectedEmployee.department || 'No department'}</p>
                </div>

                <div className="payroll-tabs-grid">
                  <PayrollPanel title="Gross Earnings">
                    <p className="panel-note">Amounts that increase pay are added; absence, late, and undertime are deducted.</p>
                    <MoneyInput label="Basic Salary" name="basic_salary" payroll={payroll} onChange={updatePayroll} placeholder="Example: 15000.00" />
                    <MoneyInput label="Absence Deduction" name="absence_deduction" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Late Deduction" name="late_deduction" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Undertime Deduction" name="undertime_deduction" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Overtime" name="overtime" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Taxable Allowances" name="taxable_allowances" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Non-Taxable Allowances" name="non_taxable_allowances" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Adjustment Compensation" name="adj_comp" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Adjustment Non-Comp." name="adj_non_comp" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Leaves Used" name="total_leaves_used" payroll={payroll} onChange={updatePayroll} />
                  </PayrollPanel>

                  <PayrollPanel title="Deductions">
                    <p className="panel-note">Enter employee share deductions and any one-time deductions for this run.</p>
                    <MoneyInput label="GSIS Employee" name="gsis_employee" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="SSS Employee" name="sss_employee" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Pag-IBIG Employee" name="pagibig_employee" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="PhilHealth Employee" name="philhealth_employee" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Tax Withheld" name="tax_withheld" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Other Deductions" name="other_deductions" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Loans" name="loans" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Premium Adjustment" name="premium_adj" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="Additional Deductions" name="total_deductions" payroll={payroll} onChange={updatePayroll} />
                  </PayrollPanel>

                  <PayrollPanel title="YTD">
                    <p className="panel-note">Use year-to-date values for reporting continuity when available.</p>
                    <MoneyInput label="YTD SSS" name="ytd_sss" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="YTD WTax" name="ytd_wtax" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="YTD PhilHealth" name="ytd_philhealth" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="YTD GSIS" name="ytd_gsis" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="YTD Pag-IBIG" name="ytd_pagibig" payroll={payroll} onChange={updatePayroll} />
                    <MoneyInput label="YTD Gross" name="ytd_gross" payroll={payroll} onChange={updatePayroll} />
                  </PayrollPanel>
                </div>

                <div className="summary-bar react-summary">
                  <label>
                    <input
                      type="checkbox"
                      checked={payroll.payroll_status === 'Hold'}
                      onChange={(event) => updatePayroll('payroll_status', event.target.checked ? 'Hold' : 'Active')}
                    /> Hold
                  </label>
                  <div><strong>Gross Pay:</strong> PHP {totals.gross.toFixed(2)}</div>
                  <div><strong>Grand Total Ded.:</strong> PHP {totals.deductions.toFixed(2)}</div>
                  <div><strong>Net Pay:</strong> PHP {totals.net.toFixed(2)}</div>
                  <button className="btn" type="button" disabled={loading} onClick={savePayroll}>Save Payroll</button>
                </div>
              </>
            ) : (
              <p className="muted">Select an employee to view and edit payroll computation.</p>
            )}
          </div>
        </div>

        {message && <p className="message">{message}</p>}
      </section>
    </>
  );
}

function FormSelect({ label, value, onChange, children }) {
  return (
    <label className="form-row-react">
      <span>{label}</span>
      <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function FormInput({ label, value, readOnly = false }) {
  return (
    <label className="form-row-react">
      <span>{label}</span>
      <input value={value || ''} readOnly={readOnly} />
    </label>
  );
}

function PayrollPanel({ title, children }) {
  return (
    <div className="payroll-panel">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function MoneyInput({ label, name, payroll, onChange, placeholder = '0.00' }) {
  return (
    <label className="money-row">
      <span>{label}</span>
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder}
        value={payroll[name] ?? ''}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );
}
