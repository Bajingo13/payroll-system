import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';

const ORDER_OPTIONS = [
  ['department_surname', 'Department / Surname'],
  ['department_employeeid', 'Department / Employee ID'],
  ['division_surname', 'Division / Surname'],
  ['division_employeeid', 'Division / Employee ID'],
  ['branch_department_surname', 'Branch + Department / Surname'],
  ['branch_department_employeeid', 'Branch + Department / Employee ID'],
  ['project_salary-type_surname', 'Project + Salary Type / Surname'],
  ['project_salary-type_employeeid', 'Project + Salary Type / Employee ID'],
  ['surname', 'Surname'],
  ['employeeid', 'Employee ID']
];

function money(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusColor(label) {
  return label === 'Hold' ? 'pending' : 'present';
}

export default function PayrollSummaryReportPage() {
  const [meta, setMeta] = useState({ payrollGroups: [], payrollPeriods: [], payrollMonths: [], payrollYears: [] });
  const [filters, setFilters] = useState({
    payroll_group: '',
    payroll_period: '',
    month: '',
    year: '',
    status: 'active',
    orderBy: 'department_surname'
  });
  const [runIds, setRunIds] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/payroll_periods')
      .then(({ data }) => {
        const payload = data.data || {};
        setMeta({
          payrollGroups: payload.payrollGroups || [],
          payrollPeriods: payload.payrollPeriods || [],
          payrollMonths: payload.payrollMonths || [],
          payrollYears: payload.payrollYears || []
        });
      })
      .catch((err) => setMessage(getApiMessage(err, 'Unable to load payroll period setup.')));
  }, []);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.gross += Number(row.gross_pay || 0);
      acc.deductions += Number(row.total_deductions || 0);
      acc.net += Number(row.net_pay || 0);
      return acc;
    }, { gross: 0, deductions: 0, net: 0 });
  }, [rows]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function resolveRunIds() {
    const { payroll_group, payroll_period, month, year } = filters;
    if (!payroll_group || !payroll_period || !month || !year) {
      throw new Error('Please select payroll group, period, month, and year.');
    }

    const { data } = await api.get('/get_run_id_payroll_journal', {
      params: { payroll_group, payroll_period, month, year }
    });

    if (!data.success || !data.run_id) {
      throw new Error(data.message || 'No matching payroll run found.');
    }

    return [data.run_id];
  }

  async function generateReport() {
    setLoading(true);
    setMessage('');
    setRows([]);

    try {
      const nextRunIds = await resolveRunIds();
      setRunIds(nextRunIds);

      const { data } = await api.get('/payroll_journal_employees', {
        params: {
          run_ids: nextRunIds.join(','),
          status: filters.status,
          orderBy: filters.orderBy
        }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to load payroll summary report.');
      }

      setRows(data.employees || []);
      if (!data.employees || data.employees.length === 0) {
        setMessage('No records returned for the selected payroll run and filters.');
      }
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to generate report.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="header">
        <h2>Payroll Summary Report</h2>
        <p>Payroll Journal summary with grouping order and payroll run filters.</p>
      </header>

      <section className="table-section">
        <h3>Report Filters</h3>
        <div className="report-filter-grid">
          <label>
            Payroll Group
            <select value={filters.payroll_group} onChange={(event) => updateFilter('payroll_group', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollGroups.map((item) => <option key={item.group_id} value={item.group_id}>{item.group_name}</option>)}
            </select>
          </label>
          <label>
            Period
            <select value={filters.payroll_period} onChange={(event) => updateFilter('payroll_period', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollPeriods.map((item) => <option key={item.period_id} value={item.period_id}>{item.period_name}</option>)}
            </select>
          </label>
          <label>
            Month
            <select value={filters.month} onChange={(event) => updateFilter('month', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollMonths.map((item) => <option key={item.month_id} value={item.month_id}>{item.month_name}</option>)}
            </select>
          </label>
          <label>
            Year
            <select value={filters.year} onChange={(event) => updateFilter('year', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollYears.map((item) => <option key={item.year_id} value={item.year_id}>{item.year_value}</option>)}
            </select>
          </label>
          <label>
            Employee Status
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              <option value="active">Active</option>
              <option value="hold">Hold</option>
            </select>
          </label>
          <label>
            Order By
            <select value={filters.orderBy} onChange={(event) => updateFilter('orderBy', event.target.value)}>
              {ORDER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" onClick={generateReport}>Generate</button>
        </div>
        <p className="message">{message}</p>
      </section>

      <section className="summary react-summary">
        <div className="card"><span>Run IDs</span><strong>{runIds.length ? runIds.join(', ') : '-'}</strong></div>
        <div className="card"><span>Employees</span><strong>{rows.length}</strong></div>
        <div className="card"><span>Total Gross</span><strong>{money(totals.gross)}</strong></div>
        <div className="card"><span>Total Deductions</span><strong>{money(totals.deductions)}</strong></div>
        <div className="card"><span>Total Net Pay</span><strong>{money(totals.net)}</strong></div>
      </section>

      <section className="table-section">
        <h3>Payroll Journal Rows</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Company</th>
                <th>Department</th>
                <th>Status</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8">Generating report...</td></tr> : null}
              {!loading && rows.length === 0 ? <tr><td colSpan="8">No report rows yet.</td></tr> : null}
              {!loading && rows.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.emp_code || row.employee_id}</td>
                  <td>{`${row.first_name || ''} ${row.last_name || ''}`.trim() || '-'}</td>
                  <td>{row.company || '-'}</td>
                  <td>{row.department || '-'}</td>
                  <td><span className={`status ${statusColor(row.payroll_status)}`}>{row.payroll_status || 'Active'}</span></td>
                  <td>{money(row.gross_pay)}</td>
                  <td>{money(row.total_deductions)}</td>
                  <td>{money(row.net_pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
