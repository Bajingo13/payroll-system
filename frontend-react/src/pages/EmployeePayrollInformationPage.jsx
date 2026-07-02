import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getReportCompanyName, getReportCompanyProfile } from '../utils/reportExport.js';
import {
  money,
  fmt,
  formatDateTime,
  derivePayslipComputed,
  printPayslipDocument,
  downloadPayslipDocument
} from '../utils/payslipDocument.js';

export default function EmployeePayrollInformationPage() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');

  const [payslip, setPayslip] = useState(null);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [payslipMessage, setPayslipMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [companyProfile, setCompanyProfile] = useState(() => getReportCompanyProfile());

  useEffect(() => {
    const updateCompany = (event) => setCompanyProfile(event?.detail || getReportCompanyProfile());
    updateCompany();
    window.addEventListener('company-settings-updated', updateCompany);
    return () => window.removeEventListener('company-settings-updated', updateCompany);
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;

    api.get('/employee_dashboard', { params: { user_id: user.user_id } })
      .then(({ data }) => {
        if (!data.success) {
          throw new Error(data.message || 'Unable to load payroll information.');
        }
        setEmployee(data.employee || null);
        setSummary(data.payrollSummary || null);
        setHistory(data.payrollHistory || []);
      })
      .catch((err) => setMessage(getApiMessage(err, 'Unable to load payroll information.')));
  }, [user?.user_id]);

  useEffect(() => {
    const empCode = employee?.emp_code;
    if (!empCode) return;

    setPayslipLoading(true);
    setPayslipMessage('');

    api.get(`/payslip_latest/${encodeURIComponent(empCode)}`)
      .then(({ data }) => {
        if (!data.success || !data.data) {
          throw new Error(data.message || 'No payslip found.');
        }
        setPayslip(data.data);
      })
      .catch((err) => {
        setPayslip(null);
        setPayslipMessage(getApiMessage(err, 'No payslip available yet.'));
      })
      .finally(() => setPayslipLoading(false));
  }, [employee?.emp_code]);

  const totals = useMemo(() => {
    return history.reduce((acc, row) => {
      acc.gross += Number(row.gross_pay || 0);
      acc.deductions += Number(row.total_deductions || 0);
      acc.net += Number(row.net_pay || 0);
      return acc;
    }, { gross: 0, deductions: 0, net: 0 });
  }, [history]);

  const companyName = companyProfile.company_name || getReportCompanyName();
  const payslipComputed = derivePayslipComputed(payslip, user?.full_name || '-');
  const {
    employeeName, monthlyRate, grossPay, totalDeductions, netPay,
    absences, tardiness, undertime, sss, philhealth, pagibig, tax, loanDeductions,
    taxableGrossToDate, withholdingTaxToDate
  } = payslipComputed;

  function handlePrint() {
    if (!payslip) return;
    const empId = payslip.emp_code || payslip.employee_id || 'employee';
    printPayslipDocument(`Payslip ${empId}`, payslip, payslipComputed, companyProfile);
  }

  function handleDownload() {
    if (!payslip) return;
    const empId = payslip.emp_code || payslip.employee_id || 'employee';
    const date = new Date().toISOString().slice(0, 10);
    downloadPayslipDocument(`Payslip ${empId}`, payslip, payslipComputed, companyProfile, `payslip-${empId}-${date}.html`);
  }

  async function handleSendEmail() {
    if (!payslip) return;
    setEmailSending(true);
    setPayslipMessage('');
    try {
      const { data } = await api.post('/payslip/send-email', {
        emp_code: payslip.emp_code || payslip.employee_id
      });
      setPayslipMessage(data.message || 'Payslip sent to your email.');
    } catch (err) {
      setPayslipMessage(getApiMessage(err, 'Failed to send payslip email.'));
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <div className="employee-modern-page">
      <header className="employee-hero compact">
        <div>
          <span>Payroll</span>
          <h2>Payroll Information</h2>
          <p>View your latest payroll details, payslip, and payroll history.</p>
        </div>
      </header>

      <section className="summary employee-modern-summary">
        <div className="card"><span>Payroll Period</span><strong>{summary?.payroll_range || '-'}</strong></div>
        <div className="card"><span>Date Generated</span><strong>{formatDateTime(summary?.date_generated)}</strong></div>
        <div className="card"><span>Gross Pay</span><strong>{money(summary?.gross_pay)}</strong></div>
        <div className="card"><span>Total Deductions</span><strong>{money(summary?.total_deductions)}</strong></div>
        <div className="card"><span>Net Pay</span><strong>{money(summary?.net_pay)}</strong></div>
        <div className="card"><span>Status</span><strong>{summary?.payroll_status || '-'}</strong></div>
      </section>

      <section className="table-section employee-modern-panel">
        <div className="table-header employee-mgmt-header">
          <div>
            <h3>My Payslip</h3>
            <p>Your latest payslip. Print or download for your records.</p>
          </div>
          {payslip && (
            <div className="row-actions">
              <button type="button" className="btn" onClick={handlePrint}>
                Print Payslip
              </button>
              <button type="button" className="btn" onClick={handleDownload}>
                Download
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={handleSendEmail}
                disabled={emailSending}
              >
                {emailSending ? 'Sending…' : 'Send to Email'}
              </button>
            </div>
          )}
        </div>

        {payslipLoading && <p className="message">Loading payslip…</p>}
        {!payslipLoading && payslipMessage && <p className="message">{payslipMessage}</p>}

        {payslip && (
          <>
            <div className="summary employee-mini-summary employee-metric-strip">
              <div className="card"><span>Payroll Period</span><strong>{payslip.payroll_range || '-'}</strong></div>
              <div className="card"><span>Date Generated</span><strong>{formatDateTime(payslip.date_generated)}</strong></div>
              <div className="card"><span>Gross Pay</span><strong>{money(grossPay)}</strong></div>
              <div className="card"><span>Deductions</span><strong>{money(totalDeductions)}</strong></div>
              <div className="card"><span>Net Pay</span><strong>{money(netPay)}</strong></div>
            </div>

            <div className="payslip-paper" style={{ marginTop: '1rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                {(companyProfile.logo_main || companyProfile.logo_url) && (
                  <img
                    src={companyProfile.logo_main || companyProfile.logo_url}
                    alt={`${companyName} logo`}
                    style={{ display: 'block', maxWidth: 150, maxHeight: 48, objectFit: 'contain', margin: '0 auto 5px' }}
                  />
                )}
                <strong style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {companyName}
                </strong>
                {companyProfile.address && <div style={{ fontSize: '0.72rem' }}>{companyProfile.address}</div>}
                {companyProfile.tin && <div style={{ fontSize: '0.72rem' }}>TIN: {companyProfile.tin}</div>}
                <div style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '4px', margin: '2px 0' }}>
                  P A Y S L I P
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  PAYROLL PERIOD COVERED: {payslip.payroll_range || '-'}
                </div>
              </div>

              <hr />

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <tbody>
                  <tr><td style={{ fontWeight: 700, width: 120 }}>EMPLOYEE</td><td>: {employeeName}</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>ID.</td><td>: {payslip.emp_code || payslip.employee_id || '-'}</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>DEPARTMENT</td><td>: {payslip.department || '-'}</td></tr>
                </tbody>
              </table>

              <hr />

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <tbody>
                  <tr>
                    <td>MONTHLY/DAILY [Basic + De Minimis]</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(monthlyRate)}</td>
                  </tr>
                  <tr>
                    <td>TAX STATUS</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{payslip.tax_status || '-'}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <thead>
                  <tr style={{ fontWeight: 700 }}>
                    <td>EARNINGS</td>
                    <td style={{ textAlign: 'center', width: 64 }}>Current</td>
                    <td style={{ textAlign: 'center', width: 64 }}>Adj.</td>
                    <td style={{ textAlign: 'right', width: 90 }}>Amount</td>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ paddingLeft: 14 }}>BASIC SALARY PAY</td>
                    <td style={{ textAlign: 'center' }}>-</td>
                    <td style={{ textAlign: 'center' }}>-</td>
                    <td style={{ textAlign: 'right' }}>{fmt(grossPay)}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '3px 6px', fontWeight: 700 }}>GROSS PAY</td>
                    <td style={{ padding: '3px 6px', fontWeight: 700, textAlign: 'right', width: 100, borderLeft: '1px solid #666' }}>{fmt(grossPay)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ fontWeight: 700, fontSize: '0.85rem', margin: '4px 0 2px' }}>DEDUCTIONS</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <tbody>
                  {[
                    ['Absences', absences],
                    ['Tardiness', tardiness],
                    ['Undertime', undertime]
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ paddingLeft: 14 }}>{label}</td>
                      <td style={{ textAlign: 'center', width: 64 }}>-</td>
                      <td style={{ textAlign: 'center', width: 64 }}>-</td>
                      <td style={{ textAlign: 'right', width: 90 }}>{Number(val) ? fmt(val) : '-'}</td>
                    </tr>
                  ))}
                  {[
                    ['SSS Premium', sss],
                    ['Philhealth', philhealth],
                    ['Pag-Ibig', pagibig],
                    ['TAX WITHHELD', tax]
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ paddingLeft: 14 }}>{label}</td>
                      <td style={{ textAlign: 'center', width: 64 }}>{fmt(val)}</td>
                      <td style={{ textAlign: 'center', width: 64 }}>-</td>
                      <td style={{ textAlign: 'right', width: 90 }}>{fmt(val)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 14 }}>Loan Deductions</td>
                    <td style={{ textAlign: 'center', width: 64 }}>-</td>
                    <td style={{ textAlign: 'center', width: 64 }}>-</td>
                    <td style={{ textAlign: 'right', width: 90 }}>{Number(loanDeductions) ? fmt(loanDeductions) : '-'}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '3px 6px', fontWeight: 700 }}>TOTAL DEDUCTIONS</td>
                    <td style={{ padding: '3px 6px', fontWeight: 700, textAlign: 'right', width: 100, borderLeft: '1px solid #666' }}>{fmt(totalDeductions)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid #000' }}>
                    <td style={{ padding: '3px 6px', fontWeight: 700 }}>NET PAY</td>
                    <td style={{ padding: '3px 6px', fontWeight: 700, textAlign: 'right', width: 100, borderLeft: '1px solid #666' }}>{fmt(netPay)}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '3px 6px', fontWeight: 700 }}>TAXABLE GROSS INCOME TO-DATE</td>
                    <td style={{ padding: '3px 6px', fontWeight: 700, textAlign: 'right', width: 100, borderLeft: '1px solid #666' }}>{fmt(taxableGrossToDate)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 6px', fontWeight: 700 }}>WITHHOLDING TAX TO-DATE</td>
                    <td style={{ padding: '3px 6px', fontWeight: 700, textAlign: 'right', width: 100, borderLeft: '1px solid #666' }}>{fmt(withholdingTaxToDate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="table-section employee-modern-panel">
        <h3>Payroll History</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Generated On</th>
                <th>Payroll Range</th>
                <th>Gross Pay</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? <tr><td colSpan="6">No payroll history found.</td></tr> : null}
              {history.map((row, index) => (
                <tr key={`${row.date_generated}-${index}`}>
                  <td>{formatDateTime(row.date_generated)}</td>
                  <td>{row.payroll_range || '-'}</td>
                  <td>{money(row.gross_pay)}</td>
                  <td>{money(row.total_deductions)}</td>
                  <td>{money(row.net_pay)}</td>
                  <td><span className="status completed">{row.payroll_status || '-'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card"><span>History Gross Total</span><strong>{money(totals.gross)}</strong></div>
          <div className="card"><span>History Deductions Total</span><strong>{money(totals.deductions)}</strong></div>
          <div className="card"><span>History Net Total</span><strong>{money(totals.net)}</strong></div>
        </div>

        <p className="message">{message}</p>
      </section>
    </div>
  );
}
