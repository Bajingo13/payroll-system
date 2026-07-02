import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { getReportCompanyProfile } from '../utils/reportExport.js';
import {
  money,
  formatDateTime,
  derivePayslipComputed,
  printPayslipDocument,
  downloadPayslipDocument
} from '../utils/payslipDocument.js';

const STATUS_OPTIONS = ['Pending', 'Generated', 'Completed', 'Locked'];

function statusClass(status) {
  if (status === 'Completed' || status === 'Generated') return 'status completed';
  if (status === 'Locked') return 'status absent';
  return 'status present';
}

export default function PayrollHistoryPage() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [filters, setFilters] = useState({ year_id: '', month_id: '', group_id: '', status: '', search: '' });
  const [periodOptions, setPeriodOptions] = useState({ payrollGroups: [], payrollMonths: [], payrollYears: [] });

  const [selectedRun, setSelectedRun] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [payslipsMessage, setPayslipsMessage] = useState('');
  const [companyProfile] = useState(() => getReportCompanyProfile());

  useEffect(() => {
    api.get('/payroll_periods')
      .then(({ data }) => {
        if (data.success) {
          setPeriodOptions({
            payrollGroups: data.data.payrollGroups || [],
            payrollMonths: data.data.payrollMonths || [],
            payrollYears: data.data.payrollYears || []
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory() {
    setLoading(true);
    setMessage('');
    try {
      const params = {};
      if (filters.year_id) params.year_id = filters.year_id;
      if (filters.month_id) params.month_id = filters.month_id;
      if (filters.group_id) params.group_id = filters.group_id;
      if (filters.status) params.status = filters.status;
      if (filters.search.trim()) params.search = filters.search.trim();

      const { data } = await api.get('/payroll_runs_history', { params });
      if (data.success) setRuns(data.runs || []);
      else setMessage(data.message || 'Unable to load payroll history.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load payroll history.'));
    } finally {
      setLoading(false);
    }
  }

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function viewRun(run) {
    setSelectedRun(run);
    setPayslips([]);
    setPayslipsMessage('');
    setPayslipsLoading(true);
    try {
      const { data } = await api.get(`/payroll_runs/${run.run_id}/payslips`);
      if (data.success) setPayslips(data.payslips || []);
      else setPayslipsMessage(data.message || 'No payslips found for this run.');
    } catch (err) {
      setPayslipsMessage(getApiMessage(err, 'Unable to load payslips for this run.'));
    } finally {
      setPayslipsLoading(false);
    }
  }

  function closeRun() {
    setSelectedRun(null);
    setPayslips([]);
    setPayslipsMessage('');
  }

  function handlePrint(payslip) {
    const computed = derivePayslipComputed(payslip);
    const empId = payslip.emp_code || payslip.employee_id || 'employee';
    printPayslipDocument(`Payslip ${empId}`, payslip, computed, companyProfile);
  }

  function handleDownload(payslip) {
    const computed = derivePayslipComputed(payslip);
    const empId = payslip.emp_code || payslip.employee_id || 'employee';
    const date = String(payslip.date_generated || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    downloadPayslipDocument(`Payslip ${empId}`, payslip, computed, companyProfile, `payslip-${empId}-${date}.html`);
  }

  const totals = useMemo(() => runs.reduce((acc, r) => {
    acc.employees += Number(r.employee_count || 0);
    acc.gross += Number(r.total_gross || 0);
    acc.net += Number(r.total_net || 0);
    return acc;
  }, { employees: 0, gross: 0, net: 0 }), [runs]);

  return (
    <>
      <header className="header">
        <h2>Payroll History</h2>
        <p>Every payroll run that has been created is saved here — browse past runs and view or reprint any employee's payslip.</p>
      </header>

      <section className="summary react-summary">
        <div className="card"><span>Payroll Runs</span><strong>{runs.length}</strong></div>
        <div className="card"><span>Employees Paid</span><strong>{totals.employees}</strong></div>
        <div className="card"><span>Total Gross</span><strong>PHP {money(totals.gross)}</strong></div>
        <div className="card"><span>Total Net</span><strong>PHP {money(totals.net)}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
            <select value={filters.year_id} onChange={(e) => updateFilter('year_id', e.target.value)}>
              <option value="">All Years</option>
              {periodOptions.payrollYears.map((y) => (
                <option key={y.year_id} value={y.year_id}>{y.year_value}</option>
              ))}
            </select>
            <select value={filters.month_id} onChange={(e) => updateFilter('month_id', e.target.value)}>
              <option value="">All Months</option>
              {periodOptions.payrollMonths.map((m) => (
                <option key={m.month_id} value={m.month_id}>{m.month_name}</option>
              ))}
            </select>
            <select value={filters.group_id} onChange={(e) => updateFilter('group_id', e.target.value)}>
              <option value="">All Groups</option>
              {periodOptions.payrollGroups.map((g) => (
                <option key={g.group_id} value={g.group_id}>{g.group_name}</option>
              ))}
            </select>
            <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="text"
              placeholder="Search payroll range..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              style={{ minWidth: 180 }}
            />
            <button type="button" className="btn" onClick={loadHistory} disabled={loading}>
              {loading ? 'Loading...' : 'Search'}
            </button>
          </div>
        </div>

        {message ? <p className="message">{message}</p> : null}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Payroll Range</th>
                <th>Group</th>
                <th>Period</th>
                <th>Status</th>
                <th>Date Generated</th>
                <th style={{ textAlign: 'right' }}>Employees</th>
                <th style={{ textAlign: 'right' }}>Gross Pay</th>
                <th style={{ textAlign: 'right' }}>Deductions</th>
                <th style={{ textAlign: 'right' }}>Net Pay</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && runs.length === 0 ? (
                <tr><td colSpan="10">No payroll runs found.</td></tr>
              ) : null}
              {runs.map((run) => (
                <tr key={run.run_id}>
                  <td>{run.payroll_range || '-'}</td>
                  <td>{run.group_name || '-'}</td>
                  <td>{run.period_name || '-'}</td>
                  <td><span className={statusClass(run.status)}>{run.status || '-'}</span></td>
                  <td>{formatDateTime(run.date_created)}</td>
                  <td style={{ textAlign: 'right' }}>{run.employee_count}</td>
                  <td style={{ textAlign: 'right' }}>{money(run.total_gross)}</td>
                  <td style={{ textAlign: 'right' }}>{money(run.total_deductions)}</td>
                  <td style={{ textAlign: 'right' }}>{money(run.total_net)}</td>
                  <td>
                    <button type="button" className="btn secondary" onClick={() => viewRun(run)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRun ? (
        <section className="table-section">
          <div className="table-header">
            <div>
              <h3>Payslips — {selectedRun.payroll_range || `Run #${selectedRun.run_id}`}</h3>
              <p>{payslips.length} employee{payslips.length === 1 ? '' : 's'} in this run.</p>
            </div>
            <button type="button" className="btn secondary" onClick={closeRun}>Close</button>
          </div>

          {payslipsLoading && <p className="message">Loading payslips...</p>}
          {!payslipsLoading && payslipsMessage && <p className="message">{payslipsMessage}</p>}

          {!payslipsLoading && payslips.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Emp Code</th>
                    <th>Department</th>
                    <th style={{ textAlign: 'right' }}>Gross Pay</th>
                    <th style={{ textAlign: 'right' }}>Deductions</th>
                    <th style={{ textAlign: 'right' }}>Net Pay</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.payroll_id}>
                      <td>{`${p.first_name || ''} ${p.last_name || ''}`.trim() || '-'}</td>
                      <td>{p.emp_code || '-'}</td>
                      <td>{p.department || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{money(p.gross_pay)}</td>
                      <td style={{ textAlign: 'right' }}>{money(p.total_deductions)}</td>
                      <td style={{ textAlign: 'right' }}>{money(p.net_pay)}</td>
                      <td><span className="status completed">{p.payroll_status || '-'}</span></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn" onClick={() => handlePrint(p)}>Print</button>
                          <button type="button" className="btn secondary" onClick={() => handleDownload(p)}>Download</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
