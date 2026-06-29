import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getReportCompanyName, getReportMetadata } from '../utils/reportExport.js';

const PAYSLIP_WIDTH = 70;
const DEFAULT_COMPANY_NAME = getReportCompanyName();

function money(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value) {
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

function getValue(obj, keys, fallback = 0) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function signatoryHtml(meta) {
  return `
    <div class="signatories">
      ${meta.signatories.map((label) => `
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span></span>
        </div>
      `).join('')}
    </div>
  `;
}

function buildPayslipPrintHtml(p, cv, companyName) {
  const esc = (v) => escapeHtml(v ?? '-');
  const m = (v) => esc(fmt(v));
  const dash = (v) => (Number(v) ? m(v) : '-');

  return `
<div class="ps">
  <div class="rule"></div>
  <div class="center heavy">${esc(companyName)}</div>
  <div class="center ps-title">P A Y S L I P</div>
  <div class="center">PAYROLL PERIOD COVERED : ${esc(p?.payroll_range || '-')}</div>

  <table class="info-tbl">
    <tr><td class="il">EMPLOYEE</td><td class="ic">:</td><td>${esc(cv.employeeName)}</td></tr>
    <tr><td class="il">ID.</td><td class="ic">:</td><td>${esc(p?.emp_code || p?.employee_id)}</td></tr>
    <tr><td class="il">DEPARTMENT</td><td class="ic">:</td><td>${esc(p?.department)}</td></tr>
  </table>
  <div class="rule"></div>

  <table class="field-tbl">
    <tr><td class="fl">MONTHLY/DAILY [Basic + De Minimis]</td><td class="fv">${m(cv.monthlyRate)}</td></tr>
    <tr><td class="fl">TAX STATUS</td><td class="fv">${esc(p?.tax_status)}</td></tr>
  </table>

  <table class="cols-tbl">
    <thead><tr class="ch"><td>EARNINGS</td><td class="cc">Current</td><td class="cc">Adj.</td><td class="cr">Amount</td></tr></thead>
    <tbody>
      <tr><td class="ind">BASIC SALARY PAY</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${m(cv.grossPay)}</td></tr>
    </tbody>
  </table>

  <table class="box-tbl">
    <tr><td class="bl">GROSS PAY</td><td class="bv">${m(cv.grossPay)}</td></tr>
  </table>

  <div class="sh">DEDUCTIONS</div>
  <table class="cols-tbl">
    <tbody>
      <tr><td class="ind">Absences</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(cv.absences)}</td></tr>
      <tr><td class="ind">Tardiness</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(cv.tardiness)}</td></tr>
      <tr><td class="ind">Undertime</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(cv.undertime)}</td></tr>
      <tr><td class="ind">SSS Premium</td><td class="cc">${m(cv.sss)}</td><td class="cc">-</td><td class="cr">${m(cv.sss)}</td></tr>
      <tr><td class="ind">Philhealth</td><td class="cc">${m(cv.philhealth)}</td><td class="cc">-</td><td class="cr">${m(cv.philhealth)}</td></tr>
      <tr><td class="ind">Pag-Ibig</td><td class="cc">${m(cv.pagibig)}</td><td class="cc">-</td><td class="cr">${m(cv.pagibig)}</td></tr>
      <tr><td class="ind">TAX WITHHELD</td><td class="cc">${m(cv.tax)}</td><td class="cc">-</td><td class="cr">${m(cv.tax)}</td></tr>
      <tr><td class="ind">Loan Deductions</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(cv.loanDeductions)}</td></tr>
    </tbody>
  </table>

  <table class="box-tbl">
    <tr><td class="bl">TOTAL DEDUCTIONS</td><td class="bv">${m(cv.totalDeductions)}</td></tr>
    <tr class="net"><td class="bl">NET PAY</td><td class="bv">${m(cv.netPay)}</td></tr>
  </table>

  <table class="box-tbl mt">
    <tr><td class="bl">TAXABLE GROSS INCOME TO-DATE</td><td class="bv">${m(cv.taxableGrossToDate)}</td></tr>
    <tr><td class="bl">WITHHOLDING TAX TO-DATE</td><td class="bv">${m(cv.withholdingTaxToDate)}</td></tr>
  </table>
  <div class="rule"></div>
</div>`;
}

function buildPayslipFullPage(title, payslip, computed, companyName) {
  const meta = { ...getReportMetadata(title), signatories: ['Employee Signature:'] };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A5 portrait; margin: 14mm; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
    .rule  { border-top: 1.5px solid #000; margin: 4px 0; }
    .center { text-align: center; }
    .heavy  { font-weight: 900; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .ps-title { font-size: 14px; font-weight: 900; letter-spacing: 4px; margin: 2px 0; }
    .info-tbl { width: 100%; border-collapse: collapse; margin: 4px 0 0; }
    .info-tbl td { padding: 1px 2px; font-size: 10px; }
    .il { font-weight: 700; min-width: 90px; white-space: nowrap; }
    .ic { padding: 0 6px; }
    .field-tbl { width: 100%; border-collapse: collapse; margin: 3px 0; }
    .field-tbl td { padding: 1px 2px; font-size: 10px; }
    .fv { text-align: right; font-weight: 700; }
    .cols-tbl { width: 100%; border-collapse: collapse; margin: 2px 0; font-size: 10px; }
    .cols-tbl td { padding: 1px 3px; }
    .ch  { font-weight: 700; }
    .cc  { text-align: center; width: 54px; }
    .cr  { text-align: right;  width: 72px; }
    .ind { padding-left: 14px !important; }
    .sh  { font-weight: 700; font-size: 10px; margin: 3px 0 1px; }
    .box-tbl { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin: 3px 0; font-size: 10px; }
    .box-tbl td { padding: 3px 6px; font-weight: 700; }
    .bv  { text-align: right; width: 90px; border-left: 1px solid #666; }
    .net td { border-top: 1px solid #000; }
    .mt  { margin-top: 5px; }
    .signatories { display: flex; flex-direction: column; gap: 4px; margin-top: 22px; font-size: 11px; width: 240px; }
    .signatories div { display: flex; flex-direction: column; gap: 2px; }
    .signatories span { display: block; border-bottom: 1px solid #000; height: 26px; }
  </style>
</head>
<body>
  ${buildPayslipPrintHtml(payslip, computed, companyName || DEFAULT_COMPANY_NAME)}
  ${signatoryHtml(meta)}
</body>
</html>`;
}

function printPayslipDocument(title, payslip, computed, companyName) {
  const printWindow = window.open('', '_blank', 'width=760,height=820');
  if (!printWindow) {
    window.alert('Popup blocked. Please allow popups to print the payslip.');
    return;
  }
  printWindow.document.write(buildPayslipFullPage(title, payslip, computed, companyName));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function downloadPayslipDocument(title, payslip, computed, companyName, filename) {
  const html = buildPayslipFullPage(title, payslip, computed, companyName);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

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

  const employeeName = payslip
    ? `${payslip.first_name || ''} ${payslip.last_name || ''}`.trim()
    : (user?.full_name || '-');

  const companyName = DEFAULT_COMPANY_NAME;
  const monthlyRate = getValue(payslip, ['monthly_rate', 'basic_salary', 'salary', 'rate'], 0);
  const grossPay = getValue(payslip, ['gross_pay'], 0);
  const totalDeductions = getValue(payslip, ['total_deductions'], 0);
  const netPay = getValue(payslip, ['net_pay'], 0);
  const absences = getValue(payslip, ['absences', 'absence_deduction'], 0);
  const tardiness = getValue(payslip, ['tardiness', 'late_deduction'], 0);
  const undertime = getValue(payslip, ['undertime', 'undertime_deduction'], 0);
  const sss = getValue(payslip, ['sss', 'sss_premium', 'sss_deduction', 'sss_employee'], 0);
  const philhealth = getValue(payslip, ['philhealth', 'philhealth_premium', 'philhealth_deduction', 'philhealth_employee'], 0);
  const pagibig = getValue(payslip, ['pagibig', 'pag_ibig', 'pagibig_deduction', 'pag_ibig_deduction', 'pagibig_employee'], 0);
  const tax = getValue(payslip, ['tax', 'tax_withheld', 'withholding_tax'], 0);
  const loanDeductions = getValue(payslip, ['loans', 'loan_deductions', 'loan'], 0);
  const taxableGrossToDate = getValue(payslip, ['taxable_gross_income_to_date', 'taxable_income_to_date', 'taxable_income'], grossPay);
  const withholdingTaxToDate = getValue(payslip, ['withholding_tax_to_date', 'tax_to_date'], tax);

  const payslipComputed = {
    employeeName, monthlyRate, grossPay, totalDeductions, netPay,
    absences, tardiness, undertime, sss, philhealth, pagibig, tax, loanDeductions,
    taxableGrossToDate, withholdingTaxToDate
  };

  function handlePrint() {
    if (!payslip) return;
    const empId = payslip.emp_code || payslip.employee_id || 'employee';
    printPayslipDocument(`Payslip ${empId}`, payslip, payslipComputed, companyName);
  }

  function handleDownload() {
    if (!payslip) return;
    const empId = payslip.emp_code || payslip.employee_id || 'employee';
    const date = new Date().toISOString().slice(0, 10);
    downloadPayslipDocument(`Payslip ${empId}`, payslip, payslipComputed, companyName, `payslip-${empId}-${date}.html`);
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
                <strong style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {companyName}
                </strong>
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
