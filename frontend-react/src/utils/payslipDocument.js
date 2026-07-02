import { toast } from 'react-toastify';
import { getReportMetadata } from './reportExport.js';

const DEFAULT_COMPANY_NAME = 'Astreablue Intelligence Inc.';

export function money(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmt(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateTime(value) {
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

export function getValue(obj, keys, fallback = 0) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

export function derivePayslipComputed(payslip, fallbackName = '-') {
  const employeeName = payslip
    ? `${payslip.first_name || ''} ${payslip.last_name || ''}`.trim()
    : fallbackName;

  const grossPay = getValue(payslip, ['gross_pay'], 0);
  const tax = getValue(payslip, ['tax', 'tax_withheld', 'withholding_tax'], 0);

  return {
    employeeName,
    monthlyRate: getValue(payslip, ['monthly_rate', 'basic_salary', 'salary', 'rate'], 0),
    grossPay,
    totalDeductions: getValue(payslip, ['total_deductions'], 0),
    netPay: getValue(payslip, ['net_pay'], 0),
    absences: getValue(payslip, ['absences', 'absence_deduction'], 0),
    tardiness: getValue(payslip, ['tardiness', 'late_deduction'], 0),
    undertime: getValue(payslip, ['undertime', 'undertime_deduction'], 0),
    sss: getValue(payslip, ['sss', 'sss_premium', 'sss_deduction', 'sss_employee'], 0),
    philhealth: getValue(payslip, ['philhealth', 'philhealth_premium', 'philhealth_deduction', 'philhealth_employee'], 0),
    pagibig: getValue(payslip, ['pagibig', 'pag_ibig', 'pagibig_deduction', 'pag_ibig_deduction', 'pagibig_employee'], 0),
    tax,
    loanDeductions: getValue(payslip, ['loans', 'loan_deductions', 'loan'], 0),
    taxableGrossToDate: getValue(payslip, ['taxable_gross_income_to_date', 'taxable_income_to_date', 'taxable_income'], grossPay),
    withholdingTaxToDate: getValue(payslip, ['withholding_tax_to_date', 'tax_to_date'], tax)
  };
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

function buildPayslipPrintHtml(p, cv, companyProfile) {
  const esc = (v) => escapeHtml(v ?? '-');
  const m = (v) => esc(fmt(v));
  const dash = (v) => (Number(v) ? m(v) : '-');
  const company = typeof companyProfile === 'string' ? { company_name: companyProfile } : (companyProfile || {});
  const companyName = company.company_name || DEFAULT_COMPANY_NAME;

  return `
<div class="ps">
  <div class="rule"></div>
  ${company.logo_main || company.logo_url ? `<img src="${esc(company.logo_main || company.logo_url)}" alt="Company logo" style="display:block;max-width:150px;max-height:48px;object-fit:contain;margin:0 auto 5px;">` : ''}
  <div class="center heavy">${esc(companyName)}</div>
  ${company.address ? `<div class="center">${esc(company.address)}</div>` : ''}
  ${company.tin ? `<div class="center">TIN: ${esc(company.tin)}</div>` : ''}
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

export function buildPayslipFullPage(title, payslip, computed, companyProfile) {
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
  ${buildPayslipPrintHtml(payslip, computed, companyProfile)}
  ${signatoryHtml(meta)}
</body>
</html>`;
}

export function printPayslipDocument(title, payslip, computed, companyProfile) {
  const printWindow = window.open('', '_blank', 'width=760,height=820');
  if (!printWindow) {
    toast.error('Popup blocked. Please allow popups to print the payslip.');
    return;
  }
  printWindow.document.write(buildPayslipFullPage(title, payslip, computed, companyProfile));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function downloadPayslipDocument(title, payslip, computed, companyProfile, filename) {
  const html = buildPayslipFullPage(title, payslip, computed, companyProfile);
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
