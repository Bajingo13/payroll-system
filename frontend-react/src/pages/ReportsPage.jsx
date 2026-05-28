import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api, getApiMessage } from '../api/client.js';

const ALLOWED_TYPES = ['payroll-journal', 'gross-pay', 'net-pay', 'payslip', 'reconciliation-details'];

const REPORT_TITLES = {
  'payroll-journal': 'Payroll Journal',
  'gross-pay': 'Gross Pay',
  'net-pay': 'Net Pay',
  payslip: 'Payslip',
  'reconciliation-details': 'Reconciliation Details'
};

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

function formatDate(value) {
  if (!value) return '-';
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

export default function ReportsPage() {
  const { reportType } = useParams();
  const type = reportType || 'payroll-journal';

  if (!ALLOWED_TYPES.includes(type)) {
    return <Navigate to="/reports/payroll-journal" replace />;
  }

  if (type === 'payslip') {
    return <PayslipReportSection />;
  }

  return <PayrollAggregateSection type={type} />;
}

function PayrollAggregateSection({ type }) {
  const [meta, setMeta] = useState({ payrollGroups: [], payrollPeriods: [], payrollMonths: [], payrollYears: [] });
  const [filters, setFilters] = useState({
    payroll_group: '',
    payroll_period: '',
    month: '',
    year: '',
    status: 'active',
    orderBy: 'department_surname'
  });
  const [rows, setRows] = useState([]);
  const [runId, setRunId] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
      .catch((err) => setMessage(getApiMessage(err, 'Unable to load report setup.')));
  }, []);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const gross = Number(row.gross_pay || 0);
      const deductions = Number(row.total_deductions || 0);
      const net = Number(row.net_pay || 0);
      acc.gross += gross;
      acc.deductions += deductions;
      acc.net += net;
      acc.reconciliationDelta += gross - deductions - net;
      return acc;
    }, { gross: 0, deductions: 0, net: 0, reconciliationDelta: 0 });
  }, [rows]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function generateReport() {
    setLoading(true);
    setMessage('');

    try {
      const { payroll_group, payroll_period, month, year } = filters;
      if (!payroll_group || !payroll_period || !month || !year) {
        throw new Error('Please select payroll group, period, month, and year.');
      }

      const runRes = await api.get('/get_run_id_payroll_journal', {
        params: { payroll_group, payroll_period, month, year }
      });

      if (!runRes.data.success || !runRes.data.run_id) {
        throw new Error(runRes.data.message || 'No matching payroll run found.');
      }

      const resolvedRunId = runRes.data.run_id;
      setRunId(resolvedRunId);

      const rowsRes = await api.get('/payroll_journal_employees', {
        params: {
          run_ids: resolvedRunId,
          status: filters.status,
          orderBy: filters.orderBy
        }
      });

      if (!rowsRes.data.success) {
        throw new Error(rowsRes.data.message || 'Unable to load report rows.');
      }

      setRows(rowsRes.data.employees || []);
      if (!rowsRes.data.employees?.length) {
        setMessage('No records returned for the selected filters.');
      }
    } catch (err) {
      setRows([]);
      setRunId(null);
      setMessage(getApiMessage(err, 'Unable to generate report.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="header">
        <h2>{REPORT_TITLES[type]}</h2>
        <p>Generate report data from payroll journal records.</p>
      </header>

      <section className="table-section">
        <h3>Filters</h3>
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
        <div className="card"><span>Run ID</span><strong>{runId || '-'}</strong></div>
        <div className="card"><span>Employees</span><strong>{rows.length}</strong></div>
        <div className="card"><span>Total Gross</span><strong>{money(totals.gross)}</strong></div>
        <div className="card"><span>Total Deductions</span><strong>{money(totals.deductions)}</strong></div>
        <div className="card"><span>Total Net</span><strong>{money(totals.net)}</strong></div>
        {type === 'reconciliation-details' ? <div className="card"><span>Gross - Deductions - Net</span><strong>{money(totals.reconciliationDelta)}</strong></div> : null}
      </section>

      <section className="table-section">
        <h3>{REPORT_TITLES[type]} Rows</h3>
        <div className="table-scroll">
          <table>
            <thead>
              {type === 'payroll-journal' ? (
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Department</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net</th>
                </tr>
              ) : null}
              {type === 'gross-pay' ? (
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Gross Pay</th>
                </tr>
              ) : null}
              {type === 'net-pay' ? (
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Net Pay</th>
                </tr>
              ) : null}
              {type === 'reconciliation-details' ? (
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net</th>
                  <th>Delta</th>
                </tr>
              ) : null}
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8">Generating report...</td></tr> : null}
              {!loading && rows.length === 0 ? <tr><td colSpan="8">No report rows yet.</td></tr> : null}
              {!loading && rows.map((row) => {
                const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-';
                if (type === 'payroll-journal') {
                  return (
                    <tr key={row.employee_id}>
                      <td>{row.emp_code || row.employee_id}</td>
                      <td>{name}</td>
                      <td>{row.company || '-'}</td>
                      <td>{row.department || '-'}</td>
                      <td>{money(row.gross_pay)}</td>
                      <td>{money(row.total_deductions)}</td>
                      <td>{money(row.net_pay)}</td>
                    </tr>
                  );
                }

                if (type === 'gross-pay') {
                  return (
                    <tr key={row.employee_id}>
                      <td>{row.emp_code || row.employee_id}</td>
                      <td>{name}</td>
                      <td>{row.company || '-'}</td>
                      <td>{money(row.gross_pay)}</td>
                    </tr>
                  );
                }

                if (type === 'net-pay') {
                  return (
                    <tr key={row.employee_id}>
                      <td>{row.emp_code || row.employee_id}</td>
                      <td>{name}</td>
                      <td>{row.company || '-'}</td>
                      <td>{money(row.net_pay)}</td>
                    </tr>
                  );
                }

                const gross = Number(row.gross_pay || 0);
                const deductions = Number(row.total_deductions || 0);
                const net = Number(row.net_pay || 0);
                const delta = gross - deductions - net;

                return (
                  <tr key={row.employee_id}>
                    <td>{row.emp_code || row.employee_id}</td>
                    <td>{name}</td>
                    <td>{money(gross)}</td>
                    <td>{money(deductions)}</td>
                    <td>{money(net)}</td>
                    <td><span className={`status ${Math.abs(delta) < 0.005 ? 'approved' : 'rejected'}`}>{money(delta)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PayslipReportSection() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpCode, setSelectedEmpCode] = useState('');
  const [payslip, setPayslip] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/employees')
      .then(({ data }) => {
        if (!data.success) {
          throw new Error(data.message || 'Unable to load employees.');
        }
        setEmployees(data.employees || []);
      })
      .catch((err) => setMessage(getApiMessage(err, 'Unable to load employees.')));
  }, []);

  async function loadLatestPayslip() {
    if (!selectedEmpCode) {
      setMessage('Select an employee first.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const { data } = await api.get(`/payslip_latest/${encodeURIComponent(selectedEmpCode)}`);
      if (!data.success || !data.data) {
        throw new Error(data.message || 'No latest payslip found for selected employee.');
      }
      setPayslip(data.data);
    } catch (err) {
      setPayslip(null);
      setMessage(getApiMessage(err, 'Unable to load latest payslip.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="header">
        <h2>Payslip</h2>
        <p>Load the latest payslip snapshot of any employee.</p>
      </header>

      <section className="table-section">
        <h3>Select Employee</h3>
        <div className="report-filter-grid">
          <label>
            Employee
            <select value={selectedEmpCode} onChange={(event) => setSelectedEmpCode(event.target.value)}>
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.employee_id} value={employee.emp_code}>
                  {employee.emp_code} - {employee.last_name}, {employee.first_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" onClick={loadLatestPayslip} disabled={loading}>Load Latest Payslip</button>
        </div>
        <p className="message">{message}</p>
      </section>

      <section className="summary react-summary">
        <div className="card"><span>Employee</span><strong>{payslip ? `${payslip.emp_code || ''} ${payslip.first_name || ''} ${payslip.last_name || ''}`.trim() : '-'}</strong></div>
        <div className="card"><span>Payroll Range</span><strong>{payslip?.payroll_range || '-'}</strong></div>
        <div className="card"><span>Date Generated</span><strong>{formatDate(payslip?.date_generated)}</strong></div>
        <div className="card"><span>Gross Pay</span><strong>{money(payslip?.gross_pay)}</strong></div>
        <div className="card"><span>Deductions</span><strong>{money(payslip?.total_deductions)}</strong></div>
        <div className="card"><span>Net Pay</span><strong>{money(payslip?.net_pay)}</strong></div>
      </section>

      <section className="table-section">
        <h3>Payslip Details</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {!payslip ? <tr><td colSpan="2">No payslip loaded.</td></tr> : null}
              {payslip ? Object.entries(payslip).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{typeof value === 'number' ? money(value) : String(value ?? '-')}</td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
