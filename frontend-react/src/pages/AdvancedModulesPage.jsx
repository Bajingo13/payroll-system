import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const MODULES = [
  ['documents', '201 Files'],
  ['organization', 'Org Setup'],
  ['payroll', 'Payroll Extras'],
  ['loan', 'Loan Deductions'],
  ['compliance', 'Compliance'],
  ['leave', 'Leave Calendar'],
  ['performance', 'Performance'],
  ['reports', 'Report Builder'],
  ['security', 'Security'],
  ['analytics', 'Analytics']
];

const GOVERNMENT_REPORTS = [
  ['BIR 1601-C', 'Monthly remittance return for compensation withholding tax', '10th of following month'],
  ['BIR 2316', 'Employee certificate of compensation payment and tax withheld', 'January 31'],
  ['BIR 1604-C', 'Annual information return for taxes withheld on compensation', 'Annual'],
  ['BIR Alphalist', 'Employee compensation details for eAFS submission', 'January 31'],
  ['SSS R3/R5', 'Contribution list and collection report', 'Monthly'],
  ['PhilHealth RF-1', 'Employer premium remittance report', 'Monthly'],
  ['Pag-IBIG MCRF', 'Monthly contribution remittance form', 'Monthly']
];

const PERMISSIONS = [
  'Employee master file',
  'Attendance adjustments',
  'Leave approvals',
  'Payroll computation',
  'Payslip release',
  'Government reports',
  'Utilities and tables',
  'Audit logs'
];

function money(value) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeCsv(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdvancedModulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModule = searchParams.get('module');
  const allowedModules = useMemo(() => new Set(MODULES.map(([key]) => key)), []);
  const initialModule = allowedModules.has(requestedModule) ? requestedModule : 'documents';
  const [activeModule, setActiveModule] = useState(initialModule);

  useEffect(() => {
    const nextModule = allowedModules.has(requestedModule) ? requestedModule : 'documents';
    setActiveModule(nextModule);
  }, [allowedModules, requestedModule]);

  function handleSelectModule(moduleKey) {
    setActiveModule(moduleKey);
    setSearchParams({ module: moduleKey });
  }

  return (
    <>
      <header className="header">
        <h2>Advanced Modules</h2>
        <p>Additional HRIS, payroll, compliance, security, analytics, and reporting modules from the project workbook.</p>
      </header>

      <section className="module-tabs">
        {MODULES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeModule === key ? 'active' : ''}
            onClick={() => handleSelectModule(key)}
          >
            {label}
          </button>
        ))}
      </section>

      {activeModule === 'documents' ? <DocumentManagement /> : null}
      {activeModule === 'organization' ? <OrganizationSetup /> : null}
      {activeModule === 'payroll' ? <PayrollExtras /> : null}
      {activeModule === 'loan' ? <LoanDeductions /> : null}
      {activeModule === 'compliance' ? <ComplianceReports /> : null}
      {activeModule === 'leave' ? <LeaveCalendar /> : null}
      {activeModule === 'performance' ? <PerformanceManagement /> : null}
      {activeModule === 'reports' ? <CustomReportBuilder /> : null}
      {activeModule === 'security' ? <SecurityCenter /> : null}
      {activeModule === 'analytics' ? <AnalyticsAndMobile /> : null}
    </>
  );
}

function DocumentManagement() {
  const [rows, setRows] = useState([
    { employee: 'EMP-001', document: 'Employment Contract', type: 'Contract', status: 'Complete', expiry: '' },
    { employee: 'EMP-002', document: 'TIN / SSS / PhilHealth / Pag-IBIG', type: 'Government ID', status: 'For Review', expiry: '' }
  ]);
  const [form, setForm] = useState({ employee: '', document: '', type: '201 File', status: 'Pending', expiry: '' });

  function addRow() {
    if (!form.employee.trim() || !form.document.trim()) return;
    setRows((current) => [...current, form]);
    setForm({ employee: '', document: '', type: '201 File', status: 'Pending', expiry: '' });
  }

  return (
    <section className="table-section">
      <h3>Employee 201 File Tracker</h3>
      <div className="report-filter-grid">
        <label>Employee ID<input value={form.employee} onChange={(event) => setForm((current) => ({ ...current, employee: event.target.value }))} /></label>
        <label>Document<input value={form.document} onChange={(event) => setForm((current) => ({ ...current, document: event.target.value }))} /></label>
        <label>Type<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option>201 File</option><option>Contract</option><option>Certificate</option><option>Government ID</option><option>Clearance</option></select></label>
        <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option>Pending</option><option>For Review</option><option>Complete</option><option>Expired</option></select></label>
        <label>Expiry<input type="date" value={form.expiry} onChange={(event) => setForm((current) => ({ ...current, expiry: event.target.value }))} /></label>
        <div className="toolbar"><button type="button" className="btn" onClick={addRow}>Add Document</button></div>
      </div>
      <SimpleTable headers={['Employee', 'Document', 'Type', 'Status', 'Expiry']} rows={rows.map((row) => [row.employee, row.document, row.type, row.status, row.expiry || '-'])} />
    </section>
  );
}

function OrganizationSetup() {
  const [rows, setRows] = useState([
    ['Administration', 'HR Manager', 'Human Resources Officer', 'SG-08', 'Active'],
    ['Finance', 'Payroll Manager', 'Payroll Specialist', 'SG-10', 'Active']
  ]);
  const [form, setForm] = useState({ department: '', manager: '', designation: '', grade: '', status: 'Active' });

  function addRow() {
    if (!form.department.trim() || !form.designation.trim()) return;
    setRows((current) => [...current, [form.department, form.manager || '-', form.designation, form.grade || '-', form.status]]);
    setForm({ department: '', manager: '', designation: '', grade: '', status: 'Active' });
  }

  return (
    <section className="table-section">
      <h3>Department, Designation, and Salary Grade Setup</h3>
      <div className="report-filter-grid">
        <label>Department<input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} /></label>
        <label>Manager<input value={form.manager} onChange={(event) => setForm((current) => ({ ...current, manager: event.target.value }))} /></label>
        <label>Designation<input value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} /></label>
        <label>Salary Grade<input value={form.grade} onChange={(event) => setForm((current) => ({ ...current, grade: event.target.value }))} /></label>
        <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option>Active</option><option>Inactive</option></select></label>
        <div className="toolbar"><button type="button" className="btn" onClick={addRow}>Add Setup</button></div>
      </div>
      <SimpleTable headers={['Department', 'Manager', 'Designation', 'Salary Grade', 'Status']} rows={rows} />
    </section>
  );
}

function PayrollExtras() {
  const [payroll, setPayroll] = useState({
    basic: 30000,
    months: 12,
    absences: 0,
    taxable: 50000,
    withheld: 4800,
    loan: 25000,
    terms: 10,
    nightHours: 8,
    hourlyRate: 180,
    premiumRate: 10
  });

  const thirteenthMonth = Math.max(0, (Number(payroll.basic) * Number(payroll.months)) / 12 - Number(payroll.absences || 0));
  const loanAmortization = Number(payroll.terms || 0) > 0 ? Number(payroll.loan || 0) / Number(payroll.terms || 1) : 0;
  const nightDiff = Number(payroll.nightHours || 0) * Number(payroll.hourlyRate || 0) * (Number(payroll.premiumRate || 0) / 100);
  const annualTaxDue = computeMonthlyTax(Number(payroll.taxable || 0));
  const annualizationDelta = annualTaxDue - Number(payroll.withheld || 0);

  function update(field, value) {
    setPayroll((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <section className="summary react-summary">
        <div className="card"><span>13th Month Estimate</span><strong>PHP {money(thirteenthMonth)}</strong></div>
        <div className="card"><span>Loan Amortization</span><strong>PHP {money(loanAmortization)}</strong></div>
        <div className="card"><span>Night Diff Premium</span><strong>PHP {money(nightDiff)}</strong></div>
        <div className="card"><span>Tax Refund / Payable</span><strong>PHP {money(Math.abs(annualizationDelta))}</strong></div>
      </section>
      <section className="table-section">
        <h3>13th Month, Loans, Night Differential, and Tax Annualization</h3>
        <div className="report-filter-grid">
          <label>Monthly Basic<input type="number" value={payroll.basic} onChange={(event) => update('basic', event.target.value)} /></label>
          <label>Months Worked<input type="number" value={payroll.months} onChange={(event) => update('months', event.target.value)} /></label>
          <label>Absence Adjustments<input type="number" value={payroll.absences} onChange={(event) => update('absences', event.target.value)} /></label>
          <label>Monthly Taxable Income<input type="number" value={payroll.taxable} onChange={(event) => update('taxable', event.target.value)} /></label>
          <label>Tax Already Withheld<input type="number" value={payroll.withheld} onChange={(event) => update('withheld', event.target.value)} /></label>
          <label>Loan Balance<input type="number" value={payroll.loan} onChange={(event) => update('loan', event.target.value)} /></label>
          <label>Loan Terms<input type="number" value={payroll.terms} onChange={(event) => update('terms', event.target.value)} /></label>
          <label>Night Hours<input type="number" value={payroll.nightHours} onChange={(event) => update('nightHours', event.target.value)} /></label>
          <label>Hourly Rate<input type="number" value={payroll.hourlyRate} onChange={(event) => update('hourlyRate', event.target.value)} /></label>
          <label>Premium Rate %<input type="number" value={payroll.premiumRate} onChange={(event) => update('premiumRate', event.target.value)} /></label>
        </div>
        <p className="muted">Tax uses the monthly TRAIN table from the workbook. Negative delta means estimated refund; positive delta means additional payable.</p>
      </section>
    </>
  );
}

function LoanDeductions() {
  const [loan, setLoan] = useState({
    category: 'Company Loan',
    balance: 25000,
    terms: 10,
    amortization: 2500,
    payrollDeduction: 2500
  });

  function update(field, value) {
    setLoan((current) => ({ ...current, [field]: value }));
  }

  const amortization = Number(loan.amortization || 0) || (Number(loan.balance || 0) / Math.max(1, Number(loan.terms || 1)));
  const remainingBalance = Math.max(0, Number(loan.balance || 0) - Number(loan.payrollDeduction || 0));

  return (
    <>
      <section className="summary react-summary">
        <div className="card"><span>Loan Balance</span><strong>PHP {money(loan.balance)}</strong></div>
        <div className="card"><span>Amortization</span><strong>PHP {money(amortization)}</strong></div>
        <div className="card"><span>Estimated Payroll Deduction</span><strong>PHP {money(loan.payrollDeduction)}</strong></div>
        <div className="card"><span>Balance After Deduction</span><strong>PHP {money(remainingBalance)}</strong></div>
      </section>
      <section className="table-section">
        <h3>Loan Deduction Module</h3>
        <div className="report-filter-grid">
          <label>Category
            <select value={loan.category} onChange={(event) => update('category', event.target.value)}>
              <option>Company Loan</option>
              <option>SSS Loan</option>
              <option>Pag-IBIG Loan</option>
            </select>
          </label>
          <label>Loan Balance<input type="number" value={loan.balance} onChange={(event) => update('balance', event.target.value)} /></label>
          <label>Terms<input type="number" value={loan.terms} onChange={(event) => update('terms', event.target.value)} /></label>
          <label>Amortization<input type="number" value={loan.amortization} onChange={(event) => update('amortization', event.target.value)} /></label>
          <label>Payroll Deduction<input type="number" value={loan.payrollDeduction} onChange={(event) => update('payrollDeduction', event.target.value)} /></label>
        </div>
        <p className="muted">Use this module to estimate loan deductions and remaining balances for company, SSS, and Pag-IBIG loans.</p>
      </section>
    </>
  );
}

function computeMonthlyTax(taxableIncome) {
  if (taxableIncome <= 20833) return 0;
  if (taxableIncome <= 33332) return (taxableIncome - 20833) * 0.15;
  if (taxableIncome <= 66666) return 1875 + (taxableIncome - 33333) * 0.2;
  if (taxableIncome <= 166666) return 8541.8 + (taxableIncome - 66667) * 0.25;
  if (taxableIncome <= 666666) return 33541.8 + (taxableIncome - 166667) * 0.3;
  return 183541.8 + (taxableIncome - 666667) * 0.35;
}

function ComplianceReports() {
  function exportReports() {
    downloadCsv('government-report-checklist.csv', ['Report', 'Purpose', 'Deadline'], GOVERNMENT_REPORTS);
  }

  return (
    <section className="table-section">
      <div className="table-header">
        <div>
          <h3>Government Report Generators</h3>
          <p>BIR, SSS, PhilHealth, and Pag-IBIG report checklist and export templates.</p>
        </div>
        <button type="button" className="btn" onClick={exportReports}>Export CSV</button>
      </div>
      <SimpleTable headers={['Report', 'Purpose', 'Deadline']} rows={GOVERNMENT_REPORTS} />
    </section>
  );
}

function LeaveCalendar() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const days = useMemo(() => {
    const [year, monthIndex] = month.split('-').map(Number);
    const count = new Date(year, monthIndex, 0).getDate();
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [month]);

  return (
    <>
      <section className="summary react-summary">
        <div className="card"><span>VL Carry-Over</span><strong>5 days</strong></div>
        <div className="card"><span>SL Accrual</span><strong>1.25 / month</strong></div>
        <div className="card"><span>Pending Leave</span><strong>3</strong></div>
        <div className="card"><span>Holiday Rules</span><strong>Configured</strong></div>
      </section>
      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>Team Leave Calendar and Balance Rules</h3>
            <p>Calendar visibility plus carry-over, accrual, and reset rule tracking.</p>
          </div>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="advanced-calendar">
          {days.map((day) => {
            const hasLeave = [3, 8, 15, 22].includes(day);
            return (
              <div key={day} className={hasLeave ? 'has-leave' : ''}>
                <strong>{day}</strong>
                <span>{hasLeave ? 'Leave' : 'Open'}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function PerformanceManagement() {
  const rows = [
    ['EMP-001', 'Payroll Accuracy', '96%', 'Exceeds', 'Advanced payroll validation'],
    ['EMP-002', 'Attendance Compliance', '91%', 'Meets', 'Schedule discipline'],
    ['EMP-003', 'Training Completion', '72%', 'Watch', 'Complete required courses']
  ];
  return (
    <section className="table-section">
      <h3>KPI, Appraisal, and Training Records</h3>
      <SimpleTable headers={['Employee', 'KPI', 'Score', 'Rating', 'Training Plan']} rows={rows} />
    </section>
  );
}

function CustomReportBuilder() {
  const [category, setCategory] = useState('Payroll');
  const [frequency, setFrequency] = useState('Monthly');
  const rows = [
    ['Employee Headcount', 'HR', 'Department, status, gender'],
    ['Payroll Register', 'Payroll', 'Gross, deductions, net pay'],
    ['Bank File', 'Payroll', 'Employee bank, amount, reference'],
    ['Attendance Analytics', 'Analytics', 'Absences, late, undertime'],
    ['Audit Log Report', 'System', 'User, action, timestamp']
  ].filter((row) => category === 'All' || row[1] === category);

  function exportBuilder() {
    downloadCsv('custom-report-builder.csv', ['Report', 'Category', 'Fields', 'Frequency'], rows.map((row) => [...row, frequency]));
  }

  return (
    <section className="table-section">
      <h3>Custom Report Builder and Bank File Export</h3>
      <div className="report-filter-grid">
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option><option>HR</option><option>Payroll</option><option>Analytics</option><option>System</option></select></label>
        <label>Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Annual</option></select></label>
        <div className="toolbar"><button type="button" className="btn" onClick={exportBuilder}>Export Template</button></div>
      </div>
      <SimpleTable headers={['Report', 'Category', 'Fields']} rows={rows} />
    </section>
  );
}

function SecurityCenter() {
  const rows = [
    ['Sensitive Data Encryption', 'TIN, SSS, PhilHealth, Pag-IBIG, bank info', 'Ready for DB migration'],
    ['Backup and Restore', 'Scheduled backup, restore logs, backup status report', 'Configured workflow'],
    ['Payslip Email Distribution', 'Release payslips with employee notification', 'Needs SMTP credentials'],
    ['Push Notifications', 'Leave, payslip, and reminder alerts', 'Mobile app dependency']
  ];

  return (
    <>
      <section className="table-section">
        <h3>Role-Based Module Permissions</h3>
        <div className="permission-grid">
          {['Admin', 'HR', 'Employee'].map((role) => (
            <article key={role}>
              <h4>{role}</h4>
              {PERMISSIONS.map((permission) => (
                <label key={`${role}-${permission}`}>
                  <input type="checkbox" defaultChecked={role === 'Admin' || (role === 'HR' && permission !== 'Payroll computation') || (role === 'Employee' && ['Payslip release'].includes(permission))} />
                  {permission}
                </label>
              ))}
            </article>
          ))}
        </div>
      </section>
      <section className="table-section">
        <h3>Security, Backup, and Notification Readiness</h3>
        <SimpleTable headers={['Feature', 'Scope', 'Status']} rows={rows} />
      </section>
    </>
  );
}

function AnalyticsAndMobile() {
  const rows = [
    ['Attrition Risk', 'Turnover prediction using tenure, attendance, leave, and performance signals', 'AI microservice'],
    ['Overtime Trends', 'Monitor OT patterns and cost spikes', 'Dashboard'],
    ['Payroll Forecasting', 'Project payroll cost by period and department', 'Finance planning'],
    ['Attendance Analytics', 'Absence, late, undertime, and schedule compliance insights', 'HR analytics'],
    ['Mobile GPS Clock-In', 'React Native time entry with GPS, leave, and payslip access', 'Mobile app']
  ];
  return (
    <section className="table-section">
      <h3>AI Analytics and Mobile App Modules</h3>
      <SimpleTable headers={['Module', 'Description', 'Channel']} rows={rows} />
    </section>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={headers.length}>No rows found.</td></tr> : null}
          {rows.map((row, index) => (
            <tr key={`${row.join('-')}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
