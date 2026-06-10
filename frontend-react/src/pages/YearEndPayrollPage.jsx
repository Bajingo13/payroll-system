import { useEffect, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { exportReport } from '../utils/reportExport.js';

const TABS = [
  ['thirteenth', '13th Month Pay'],
  ['summary', 'Annual Summary'],
  ['yeta', 'Tax Adjustment (YETA)']
];

function money(v) {
  return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function YearEndPayrollPage() {
  const [tab, setTab] = useState('thirteenth');
  const [year, setYear] = useState(() => new Date().getFullYear());

  return (
    <>
      <header className="header">
        <h2>Year-End Payroll</h2>
        <p>13th month pay, annual payroll summary, and year-end tax adjustment (YETA).</p>
      </header>

      <section className="table-section" style={{ paddingBottom: 8 }}>
        <div className="table-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="toolbar">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`btn${tab === key ? '' : ' secondary'}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Year
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              style={{ width: 90 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 2000 && v <= 2100) setYear(v);
              }}
            />
          </label>
        </div>
      </section>

      {tab === 'thirteenth' && <ThirteenthMonthTab year={year} />}
      {tab === 'summary' && <AnnualSummaryTab year={year} />}
      {tab === 'yeta' && <YetaTab year={year} />}
    </>
  );
}

// ─── 13th Month Pay ───────────────────────────────────────────────────────────

function ThirteenthMonthTab({ year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { load(); }, [year]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const { data: result } = await api.get('/thirteenth_month_report', { params: { year } });
      if (!result.success) throw new Error(result.message || 'Unable to load 13th month report.');
      setData(result);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load 13th month report.'));
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  const HEADERS_13TH = ['Code', 'Name', 'Department', 'Position', 'Payroll Runs', 'Annual Basic', 'Absence Deductions', 'Net Basic', '13th Month Pay'];
  const exportRows13th = () => rows.map((r) => [
    r.emp_code, r.employee_name, r.department || '-', r.position || '-',
    r.payroll_records, money(r.annual_basic), money(r.absence_deductions),
    money(r.net_basic), money(r.thirteenth_month_pay)
  ]);

  return (
    <>
      <section className="summary react-summary">
        <div className="card"><span>Employees</span><strong>{totals.employees || 0}</strong></div>
        <div className="card"><span>Annual Basic Total</span><strong>PHP {money(totals.annual_basic)}</strong></div>
        <div className="card"><span>Absence Deductions</span><strong>PHP {money(totals.absence_deductions)}</strong></div>
        <div className="card"><span>Total 13th Month Pay</span><strong>PHP {money(totals.thirteenth_month_pay)}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>13th Month Pay — {year}</h3>
            <p>Computed as (Annual Basic − Absence Deductions) ÷ 12. Pursuant to PD 851.</p>
          </div>
          <div className="toolbar">
            <button type="button" className="btn secondary" onClick={load} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button type="button" className="btn secondary" onClick={() => exportReport('csv', `13th-month-pay-${year}`, `13th Month Pay — ${year}`, HEADERS_13TH, exportRows13th())} disabled={!rows.length}>CSV</button>
            <button type="button" className="btn secondary" onClick={() => exportReport('txt', `13th-month-pay-${year}`, `13th Month Pay — ${year}`, HEADERS_13TH, exportRows13th())} disabled={!rows.length}>TXT</button>
            <button type="button" className="btn" onClick={() => exportReport('pdf', `13th-month-pay-${year}`, `13th Month Pay — ${year}`, HEADERS_13TH, exportRows13th())} disabled={!rows.length}>PDF</button>
          </div>
        </div>
        {message ? <p className="message">{message}</p> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Department</th>
                <th>Runs</th>
                <th style={{ textAlign: 'right' }}>Annual Basic</th>
                <th style={{ textAlign: 'right' }}>Absence Deductions</th>
                <th style={{ textAlign: 'right' }}>Net Basic</th>
                <th style={{ textAlign: 'right' }}>13th Month Pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={8}>{message || `No 13th month pay data for ${year}.`}</td></tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td>{r.emp_code}</td>
                  <td>{r.employee_name}</td>
                  <td>{r.department || '-'}</td>
                  <td>{r.payroll_records}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_basic)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.absence_deductions)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.net_basic)}</td>
                  <td style={{ textAlign: 'right' }}><strong>{money(r.thirteenth_month_pay)}</strong></td>
                </tr>
              ))}
              {rows.length > 0 ? (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4}>TOTAL</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_basic)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.absence_deductions)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.net_basic)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.thirteenth_month_pay)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ─── Annual Payroll Summary ───────────────────────────────────────────────────

function AnnualSummaryTab({ year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { load(); }, [year]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const { data: result } = await api.get('/annual_payroll_summary', { params: { year } });
      if (!result.success) throw new Error(result.message || 'Unable to load annual payroll summary.');
      setData(result);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load annual payroll summary.'));
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  const HEADERS_SUMMARY = ['Code', 'Name', 'Department', 'Runs', 'Annual Gross', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Tax Withheld', 'Total Deductions', 'Annual Net'];
  const exportRowsSummary = () => rows.map((r) => [
    r.emp_code, r.employee_name, r.department || '-', r.payroll_count,
    money(r.annual_gross), money(r.annual_sss), money(r.annual_philhealth),
    money(r.annual_pagibig), money(r.annual_tax_withheld),
    money(r.annual_total_deductions), money(r.annual_net)
  ]);

  return (
    <>
      <section className="summary react-summary">
        <div className="card"><span>Employees</span><strong>{totals.employees || 0}</strong></div>
        <div className="card"><span>Annual Gross Pay</span><strong>PHP {money(totals.annual_gross)}</strong></div>
        <div className="card"><span>Total Deductions</span><strong>PHP {money(totals.annual_total_deductions)}</strong></div>
        <div className="card"><span>Annual Net Pay</span><strong>PHP {money(totals.annual_net)}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>Annual Payroll Summary — {year}</h3>
            <p>Year-to-date totals: gross pay, statutory contributions, withholding tax, and net pay per employee.</p>
          </div>
          <div className="toolbar">
            <button type="button" className="btn secondary" onClick={load} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button type="button" className="btn secondary" onClick={() => exportReport('csv', `annual-payroll-summary-${year}`, `Annual Payroll Summary — ${year}`, HEADERS_SUMMARY, exportRowsSummary())} disabled={!rows.length}>CSV</button>
            <button type="button" className="btn secondary" onClick={() => exportReport('txt', `annual-payroll-summary-${year}`, `Annual Payroll Summary — ${year}`, HEADERS_SUMMARY, exportRowsSummary())} disabled={!rows.length}>TXT</button>
            <button type="button" className="btn" onClick={() => exportReport('pdf', `annual-payroll-summary-${year}`, `Annual Payroll Summary — ${year}`, HEADERS_SUMMARY, exportRowsSummary())} disabled={!rows.length}>PDF</button>
          </div>
        </div>
        {message ? <p className="message">{message}</p> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Department</th>
                <th>Runs</th>
                <th style={{ textAlign: 'right' }}>Annual Gross</th>
                <th style={{ textAlign: 'right' }}>SSS</th>
                <th style={{ textAlign: 'right' }}>PhilHealth</th>
                <th style={{ textAlign: 'right' }}>Pag-IBIG</th>
                <th style={{ textAlign: 'right' }}>Tax Withheld</th>
                <th style={{ textAlign: 'right' }}>Total Deductions</th>
                <th style={{ textAlign: 'right' }}>Annual Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={11}>{message || `No payroll summary data for ${year}.`}</td></tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td>{r.emp_code}</td>
                  <td>{r.employee_name}</td>
                  <td>{r.department || '-'}</td>
                  <td>{r.payroll_count}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_gross)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_sss)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_philhealth)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_pagibig)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_tax_withheld)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_total_deductions)}</td>
                  <td style={{ textAlign: 'right' }}><strong>{money(r.annual_net)}</strong></td>
                </tr>
              ))}
              {rows.length > 0 ? (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4}>TOTAL</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_gross)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_sss)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_philhealth)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_pagibig)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_tax_withheld)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_total_deductions)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_net)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ─── Year-End Tax Adjustment (YETA) ───────────────────────────────────────────

function YetaTab({ year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { load(); }, [year]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const { data: result } = await api.get('/year_end_tax_adjustment', { params: { year } });
      if (!result.success) throw new Error(result.message || 'Unable to load YETA.');
      setData(result);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load YETA.'));
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  const HEADERS_YETA = ['Code', 'Name', 'Department', 'Tax Status', 'Annual Taxable', 'Tax Withheld', 'Annual Tax Due', 'YETA Amount', 'Status'];
  const exportRowsYeta = () => rows.map((r) => [
    r.emp_code, r.employee_name, r.department || '-', r.tax_status,
    money(r.annual_taxable), money(r.tax_withheld),
    money(r.tax_due), money(Math.abs(r.yeta)), r.yeta_status
  ]);

  return (
    <>
      <section className="summary react-summary">
        <div className="card"><span>Employees</span><strong>{totals.employees || 0}</strong></div>
        <div className="card"><span>Total Annual Tax Due</span><strong>PHP {money(totals.tax_due)}</strong></div>
        <div className="card"><span>For Refund</span><strong>{totals.refund_count || 0} employee(s)</strong></div>
        <div className="card"><span>Additional Payable</span><strong>{totals.payable_count || 0} employee(s)</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>Year-End Tax Adjustment (YETA) — {year}</h3>
            <p>
              Annual taxable income vs. tax withheld using TRAIN Law annual brackets.
              Positive YETA = employee owes additional tax. Negative YETA = refund due.
            </p>
          </div>
          <div className="toolbar">
            <button type="button" className="btn secondary" onClick={load} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button type="button" className="btn secondary" onClick={() => exportReport('csv', `year-end-tax-adjustment-${year}`, `Year-End Tax Adjustment (YETA) — ${year}`, HEADERS_YETA, exportRowsYeta())} disabled={!rows.length}>CSV</button>
            <button type="button" className="btn secondary" onClick={() => exportReport('txt', `year-end-tax-adjustment-${year}`, `Year-End Tax Adjustment (YETA) — ${year}`, HEADERS_YETA, exportRowsYeta())} disabled={!rows.length}>TXT</button>
            <button type="button" className="btn" onClick={() => exportReport('pdf', `year-end-tax-adjustment-${year}`, `Year-End Tax Adjustment (YETA) — ${year}`, HEADERS_YETA, exportRowsYeta())} disabled={!rows.length}>PDF</button>
          </div>
        </div>
        {message ? <p className="message">{message}</p> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Department</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Annual Taxable</th>
                <th style={{ textAlign: 'right' }}>Tax Withheld</th>
                <th style={{ textAlign: 'right' }}>Annual Tax Due</th>
                <th style={{ textAlign: 'right' }}>YETA</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={9}>{message || `No YETA data for ${year}.`}</td></tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td>{r.emp_code}</td>
                  <td>{r.employee_name}</td>
                  <td>{r.department || '-'}</td>
                  <td>{r.tax_status || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.annual_taxable)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.tax_withheld)}</td>
                  <td style={{ textAlign: 'right' }}>{money(r.tax_due)}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      color: r.yeta > 0 ? '#dc2626' : r.yeta < 0 ? '#16a34a' : undefined,
                      fontWeight: 600
                    }}
                  >
                    {r.yeta < 0 ? '(' : ''}PHP {money(Math.abs(r.yeta))}{r.yeta < 0 ? ')' : ''}
                  </td>
                  <td>
                    <span className={`status ${r.yeta > 0 ? 'absent' : r.yeta < 0 ? 'present' : 'completed'}`}>
                      {r.yeta_status}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length > 0 ? (
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4}>TOTAL</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.annual_taxable)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.tax_withheld)}</td>
                  <td style={{ textAlign: 'right' }}>{money(totals.tax_due)}</td>
                  <td style={{ textAlign: 'right' }}>PHP {money(Math.abs(totals.yeta))}</td>
                  <td></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          TRAIN Law brackets: ₱0–250K = 0% · ₱250K–400K = 15% · ₱400K–800K = 22,500 + 20% · ₱800K–2M = 102,500 + 25% · ₱2M–8M = 402,500 + 30% · Above ₱8M = 35%
        </p>
      </section>
    </>
  );
}
