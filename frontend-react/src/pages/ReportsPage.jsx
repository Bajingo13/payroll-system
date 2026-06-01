import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const ALLOWED_TYPES = ['payroll-journal', 'gross-pay', 'net-pay', 'payslip', 'reconciliation-details'];

const REPORT_TITLES = {
  'payroll-journal': 'Payroll Journal',
  'gross-pay': 'Gross Pay',
  'net-pay': 'Net Pay',
  payslip: 'Payslip',
  'reconciliation-details': 'Reconciliation Details'
};

const DEFAULT_COMPANY_NAME = 'Astreablue Intelligence Inc.';
const PAYSLIP_WIDTH = 70;

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

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (!role) return 'unknown';
  if (role === 'employee') return 'employee';
  if (role === 'hr' || role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role === 'admin' || role.includes('admin')) return 'admin';
  return 'unknown';
}

const ROLE_SETTINGS = {
  admin: {
    label: 'Admin',
    canGenerate: true,
    canExport: true,
    allowedStatuses: ['active', 'hold'],
    allowedOrderBy: ORDER_OPTIONS.map(([value]) => value),
    exportFormats: ['excel', 'pdf', 'csv'],
    note: 'Full access to generate, export, and reorder payroll reports.'
  },
  hr: {
    label: 'HR',
    canGenerate: true,
    canExport: true,
    allowedStatuses: ['active'],
    allowedOrderBy: [
      'department_surname',
      'department_employeeid',
      'division_surname',
      'division_employeeid',
      'surname',
      'employeeid'
    ],
    exportFormats: ['excel', 'pdf'],
    note: 'HR can generate and export while restricted to active employee reports.'
  },
  employee: {
    label: 'Employee',
    canGenerate: false,
    canExport: false,
    allowedStatuses: ['active'],
    allowedOrderBy: ['surname', 'employeeid'],
    exportFormats: [],
    note: 'Employees can view role-configured data but cannot generate or export aggregate reports.'
  },
  unknown: {
    label: 'Unknown',
    canGenerate: false,
    canExport: false,
    allowedStatuses: ['active'],
    allowedOrderBy: ['surname'],
    exportFormats: [],
    note: 'No report permissions configured for this role.'
  }
};

function getRoleSettings(rawRole) {
  const role = normalizeRole(rawRole);
  return ROLE_SETTINGS[role] || ROLE_SETTINGS.unknown;
}

function money(value) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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

function getValue(obj, keys, fallback = 0) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

function pad(value, length = 10) {
  return String(value).padStart(length, ' ');
}

function fitText(value, length) {
  const text = String(value || '-').trim();
  return text.length > length ? `${text.slice(0, Math.max(0, length - 3))}...` : text;
}

function centerText(value, width = PAYSLIP_WIDTH) {
  const text = fitText(value, width);
  const leftPadding = Math.max(0, Math.floor((width - text.length) / 2));
  return `${' '.repeat(leftPadding)}${text}`;
}

function payslipBoxRow(label, amount) {
  const innerWidth = PAYSLIP_WIDTH - 4;
  const amountWidth = 14;
  const labelWidth = innerWidth - amountWidth - 1;
  return `| ${fitText(label, labelWidth).padEnd(labelWidth)} ${pad(amount, amountWidth)} |`;
}

function payslipBoxRule() {
  return `|${'-'.repeat(PAYSLIP_WIDTH - 2)}|`;
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  downloadBlob(filename, csv, 'text/csv;charset=utf-8;');
}

function downloadExcel(filename, title, headers, rows) {
  const html = `
    <html>
      <head><meta charset="utf-8"></head>
      <body>
        <h3>${escapeHtml(title)}</h3>
        <table border="1">
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </body>
    </html>
  `;

  downloadBlob(filename, html, 'application/vnd.ms-excel;charset=utf-8;');
}

function printHtml(title, bodyHtml) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    window.alert('Popup blocked. Please allow popups to export PDF.');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #000; margin: 24px; }
          h2 { margin: 0 0 14px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #333; padding: 6px; text-align: left; }
          th { background: #f2f2f2; }
        </style>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function printPayslipDocument(title, payslipText) {
  const printWindow = window.open('', '_blank', 'width=760,height=760');
  if (!printWindow) {
    window.alert('Popup blocked. Please allow popups to print the payslip.');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: auto; margin: 8mm; }
          html,
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
          }
          .payslip-print-sheet {
            width: 560px;
            margin: 0;
            padding: 0 0 34px;
            background: #ffffff;
            color: #000000;
          }
          pre {
            margin: 0;
            padding: 0;
            white-space: pre;
            font-family: "Courier New", Courier, monospace;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.12;
            color: #000000;
            background: #ffffff;
          }
        </style>
      </head>
      <body>
        <div class="payslip-print-sheet">
          <pre>${escapeHtml(payslipText)}</pre>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function getReportExportRows(type, rows) {
  if (type === 'gross-pay') {
    return {
      headers: ['Employee ID', 'Name', 'Company', 'Gross Pay'],
      rows: rows.map((row) => [
        row.emp_code || row.employee_id || '',
        `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        row.company || '',
        money(row.gross_pay)
      ])
    };
  }

  if (type === 'net-pay') {
    return {
      headers: ['Employee ID', 'Name', 'Company', 'Net Pay'],
      rows: rows.map((row) => [
        row.emp_code || row.employee_id || '',
        `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        row.company || '',
        money(row.net_pay)
      ])
    };
  }

  if (type === 'reconciliation-details') {
    return {
      headers: ['Employee ID', 'Name', 'Gross', 'Deductions', 'Net', 'Delta'],
      rows: rows.map((row) => {
        const gross = Number(row.gross_pay || 0);
        const deductions = Number(row.total_deductions || 0);
        const net = Number(row.net_pay || 0);

        return [
          row.emp_code || row.employee_id || '',
          `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          money(gross),
          money(deductions),
          money(net),
          money(gross - deductions - net)
        ];
      })
    };
  }

  return {
    headers: ['Employee ID', 'Name', 'Company', 'Department', 'Gross', 'Deductions', 'Net'],
    rows: rows.map((row) => [
      row.emp_code || row.employee_id || '',
      `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      row.company || '',
      row.department || '',
      money(row.gross_pay),
      money(row.total_deductions),
      money(row.net_pay)
    ])
  };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { reportType } = useParams();
  const type = reportType || 'payroll-journal';
  const roleSettings = getRoleSettings(user?.role);

  if (!ALLOWED_TYPES.includes(type)) {
    return <Navigate to="/reports/payroll-journal" replace />;
  }

  if (type === 'payslip') {
    return <PayslipReportSection roleSettings={roleSettings} />;
  }

  return <PayrollAggregateSection type={type} roleSettings={roleSettings} />;
}

function PayrollAggregateSection({ type, roleSettings }) {
  const [meta, setMeta] = useState({
    payrollGroups: [],
    payrollPeriods: [],
    payrollMonths: [],
    payrollYears: []
  });

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
  const [exportFormat, setExportFormat] = useState('excel');

  const allowedOrderOptions = useMemo(
    () => ORDER_OPTIONS.filter(([value]) => roleSettings.allowedOrderBy.includes(value)),
    [roleSettings.allowedOrderBy]
  );

  const allowedExportFormats = roleSettings.exportFormats;

  useEffect(() => {
    if (!roleSettings.allowedStatuses.includes(filters.status)) {
      setFilters((current) => ({ ...current, status: roleSettings.allowedStatuses[0] || 'active' }));
    }
  }, [filters.status, roleSettings.allowedStatuses]);

  useEffect(() => {
    if (!roleSettings.allowedOrderBy.includes(filters.orderBy)) {
      setFilters((current) => ({ ...current, orderBy: roleSettings.allowedOrderBy[0] || 'surname' }));
    }
  }, [filters.orderBy, roleSettings.allowedOrderBy]);

  useEffect(() => {
    if (allowedExportFormats.length === 0) {
      return;
    }

    if (!allowedExportFormats.includes(exportFormat)) {
      setExportFormat(allowedExportFormats[0]);
    }
  }, [allowedExportFormats, exportFormat]);

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
    return rows.reduce(
      (acc, row) => {
        const gross = Number(row.gross_pay || 0);
        const deductions = Number(row.total_deductions || 0);
        const net = Number(row.net_pay || 0);

        acc.gross += gross;
        acc.deductions += deductions;
        acc.net += net;
        acc.reconciliationDelta += gross - deductions - net;

        return acc;
      },
      { gross: 0, deductions: 0, net: 0, reconciliationDelta: 0 }
    );
  }, [rows]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function generateReport() {
    if (!roleSettings.canGenerate) {
      setMessage('Your role is not allowed to generate this report.');
      return;
    }

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
          status: roleSettings.allowedStatuses.includes(filters.status)
            ? filters.status
            : roleSettings.allowedStatuses[0] || 'active',
          orderBy: roleSettings.allowedOrderBy.includes(filters.orderBy)
            ? filters.orderBy
            : roleSettings.allowedOrderBy[0] || 'surname'
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

  function exportReport() {
    if (!roleSettings.canExport) {
      setMessage('Your role is not allowed to export this report.');
      return;
    }

    if (!allowedExportFormats.includes(exportFormat)) {
      setMessage('Selected export format is not allowed for your role.');
      return;
    }

    if (!rows.length) {
      setMessage('Generate a report before exporting.');
      return;
    }

    const { headers, rows: exportRows } = getReportExportRows(type, rows);
    const date = new Date().toISOString().slice(0, 10);
    const filenameBase = `${type}-${date}`;
    const title = REPORT_TITLES[type];

    if (exportFormat === 'csv') {
      downloadCsv(`${filenameBase}.csv`, headers, exportRows);
      return;
    }

    if (exportFormat === 'pdf') {
      const tableHtml = `
        <h2>${escapeHtml(title)}</h2>
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>${exportRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      `;
      printHtml(title, tableHtml);
      return;
    }

    downloadExcel(`${filenameBase}.xls`, title, headers, exportRows);
  }

  return (
    <>
      <header className="header">
        <h2>{REPORT_TITLES[type]}</h2>
        <p>Generate report data from payroll journal records.</p>
      </header>

      <section className="table-section">
        <h3>Role-Based Settings</h3>
        <div className="summary react-summary">
          <div className="card"><span>Role</span><strong>{roleSettings.label}</strong></div>
          <div className="card"><span>Generate</span><strong>{roleSettings.canGenerate ? 'Allowed' : 'Restricted'}</strong></div>
          <div className="card"><span>Export</span><strong>{roleSettings.canExport ? 'Allowed' : 'Restricted'}</strong></div>
          <div className="card"><span>Status Scope</span><strong>{roleSettings.allowedStatuses.join(', ')}</strong></div>
          <div className="card"><span>Export Formats</span><strong>{allowedExportFormats.length ? allowedExportFormats.join(', ') : 'None'}</strong></div>
        </div>
        <p className="message">{roleSettings.note}</p>
      </section>

      <section className="table-section">
        <h3>Filters</h3>

        <div className="report-filter-grid">
          <label>
            Payroll Group
            <select value={filters.payroll_group} onChange={(event) => updateFilter('payroll_group', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollGroups.map((item) => (
                <option key={item.group_id} value={item.group_id}>{item.group_name}</option>
              ))}
            </select>
          </label>

          <label>
            Period
            <select value={filters.payroll_period} onChange={(event) => updateFilter('payroll_period', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollPeriods.map((item) => (
                <option key={item.period_id} value={item.period_id}>{item.period_name}</option>
              ))}
            </select>
          </label>

          <label>
            Month
            <select value={filters.month} onChange={(event) => updateFilter('month', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollMonths.map((item) => (
                <option key={item.month_id} value={item.month_id}>{item.month_name}</option>
              ))}
            </select>
          </label>

          <label>
            Year
            <select value={filters.year} onChange={(event) => updateFilter('year', event.target.value)}>
              <option value="">Select</option>
              {meta.payrollYears.map((item) => (
                <option key={item.year_id} value={item.year_id}>{item.year_value}</option>
              ))}
            </select>
          </label>

          <label>
            Employee Status
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              {roleSettings.allowedStatuses.map((status) => (
                <option key={status} value={status}>{status[0].toUpperCase()}{status.slice(1)}</option>
              ))}
            </select>
          </label>

          <label>
            Order By
            <select value={filters.orderBy} onChange={(event) => updateFilter('orderBy', event.target.value)}>
              {allowedOrderOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="toolbar">
          <button type="button" className="btn" onClick={generateReport} disabled={!roleSettings.canGenerate}>
            Generate
          </button>

          <label className="export-choice">
            Format
            <select
              value={allowedExportFormats.includes(exportFormat) ? exportFormat : ''}
              onChange={(event) => setExportFormat(event.target.value)}
              disabled={!roleSettings.canExport}
            >
              {allowedExportFormats.map((format) => (
                <option key={format} value={format}>{format.toUpperCase()}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn secondary"
            onClick={exportReport}
            disabled={!rows.length || !roleSettings.canExport}
          >
            Export
          </button>
        </div>

        <p className="message">{message}</p>
      </section>

      <section className="summary react-summary">
        <div className="card"><span>Run ID</span><strong>{runId || '-'}</strong></div>
        <div className="card"><span>Employees</span><strong>{rows.length}</strong></div>
        <div className="card"><span>Total Gross</span><strong>{money(totals.gross)}</strong></div>
        <div className="card"><span>Total Deductions</span><strong>{money(totals.deductions)}</strong></div>
        <div className="card"><span>Total Net</span><strong>{money(totals.net)}</strong></div>

        {type === 'reconciliation-details' ? (
          <div className="card">
            <span>Gross - Deductions - Net</span>
            <strong>{money(totals.reconciliationDelta)}</strong>
          </div>
        ) : null}
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
                    <td>
                      <span className={`status ${Math.abs(delta) < 0.005 ? 'approved' : 'rejected'}`}>
                        {money(delta)}
                      </span>
                    </td>
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

function PayslipReportSection({ roleSettings }) {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpCode, setSelectedEmpCode] = useState('');
  const [payslip, setPayslip] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');

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

  function printPayslip() {
    if (!payslip) return;
    const employeeId = payslip.emp_code || payslip.employee_id || 'employee';
    printPayslipDocument(`Payslip ${employeeId}`, payslipText);
  }

  const employeeName = payslip
    ? `${payslip.first_name || ''} ${payslip.last_name || ''}`.trim()
    : '-';
  const companyName = DEFAULT_COMPANY_NAME;

  const monthlyRate = getValue(payslip, ['monthly_rate', 'basic_salary', 'salary', 'rate'], 0);
  const grossPay = getValue(payslip, ['gross_pay'], 0);
  const totalDeductions = getValue(payslip, ['total_deductions'], 0);
  const netPay = getValue(payslip, ['net_pay'], 0);

  const absences = getValue(payslip, ['absences', 'absence_deduction'], 0);
  const tardiness = getValue(payslip, ['tardiness', 'late_deduction'], 0);
  const undertime = getValue(payslip, ['undertime', 'undertime_deduction'], 0);
  const sss = getValue(payslip, ['sss', 'sss_premium', 'sss_deduction'], 0);
  const philhealth = getValue(payslip, ['philhealth', 'philhealth_premium', 'philhealth_deduction'], 0);
  const pagibig = getValue(payslip, ['pagibig', 'pag_ibig', 'pagibig_deduction', 'pag_ibig_deduction'], 0);
  const tax = getValue(payslip, ['tax', 'tax_withheld', 'withholding_tax'], 0);

  const taxableGrossToDate = getValue(
    payslip,
    ['taxable_gross_income_to_date', 'taxable_income_to_date', 'taxable_income'],
    grossPay
  );

  const withholdingTaxToDate = getValue(
    payslip,
    ['withholding_tax_to_date', 'tax_to_date'],
    tax
  );

  const payslipHeaders = ['Field', 'Value'];
  const payslipRows = [
    ['Employee', employeeName],
    ['ID', payslip?.emp_code || payslip?.employee_id || ''],
    ['Department', payslip?.department || ''],
    ['Payroll Period Covered', payslip?.payroll_range || ''],
    ['Monthly/Daily Basic + De Minimis', money(monthlyRate)],
    ['Tax Status', payslip?.tax_status || ''],
    ['Basic Salary Pay', money(grossPay)],
    ['Gross Pay', money(grossPay)],
    ['Absences', Number(absences) ? money(absences) : '-'],
    ['Tardiness', Number(tardiness) ? money(tardiness) : '-'],
    ['Undertime', Number(undertime) ? money(undertime) : '-'],
    ['SSS Premium', money(sss)],
    ['Philhealth', money(philhealth)],
    ['Pag-Ibig', money(pagibig)],
    ['Tax Withheld', money(tax)],
    ['Total Deductions', money(totalDeductions)],
    ['Net Pay', money(netPay)],
    ['Taxable Gross Income To-Date', money(taxableGrossToDate)],
    ['Withholding Tax To-Date', money(withholdingTaxToDate)]
  ];

  const payslipText = `${'-'.repeat(PAYSLIP_WIDTH)}
${centerText(companyName)}
${centerText('P A Y S L I P')}
${centerText(`PAYROLL PERIOD COVERED : ${payslip?.payroll_range || '-'}`)}

  EMPLOYEE:          ${employeeName || '-'}
  ID.:               ${payslip?.emp_code || payslip?.employee_id || '-'}
  DEPARTMENT:        ${payslip?.department || '-'}
${'-'.repeat(PAYSLIP_WIDTH)}
  MONTHLY/DAILY [Basic + De Minimis]        ${money(monthlyRate)}
  TAX STATUS                                ${payslip?.tax_status || '-'}
  EARNINGS                         Current       Adj.       Amount
    BASIC SALARY PAY                    -          -     ${pad(money(grossPay), 10)}

${payslipBoxRule()}
${payslipBoxRow('GROSS PAY', money(grossPay))}
${payslipBoxRule()}
  DEDUCTIONS
    Absences                            -          -     ${Number(absences) ? pad(money(absences), 10) : '         -'}
    Tardiness                           -          -     ${Number(tardiness) ? pad(money(tardiness), 10) : '         -'}
    Undertime                           -          -     ${Number(undertime) ? pad(money(undertime), 10) : '         -'}
    SSS Premium                    ${pad(money(sss), 8)}          -     ${pad(money(sss), 10)}
    Philhealth                     ${pad(money(philhealth), 8)}          -     ${pad(money(philhealth), 10)}
    Pag-Ibig                       ${pad(money(pagibig), 8)}          -     ${pad(money(pagibig), 10)}
    TAX WITHHELD                   ${pad(money(tax), 8)}          -     ${pad(money(tax), 10)}
${payslipBoxRule()}
${payslipBoxRow('TOTAL DEDUCTIONS', money(totalDeductions))}
${payslipBoxRow('NET PAY', money(netPay))}
${payslipBoxRule()}

${payslipBoxRule()}
${payslipBoxRow('TAXABLE GROSS INCOME TO-DATE', money(taxableGrossToDate))}
${payslipBoxRow('WITHHOLDING TAX TO-DATE', money(withholdingTaxToDate))}
${payslipBoxRule()}
${'-'.repeat(PAYSLIP_WIDTH)}`;

  function exportPayslip() {
    if (!roleSettings.canExport) {
      setMessage('Your role is not allowed to export this payslip.');
      return;
    }

    if (!payslip) {
      setMessage('Load a payslip before exporting.');
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const employeeId = payslip.emp_code || payslip.employee_id || 'employee';
    const filenameBase = `payslip-${employeeId}-${date}`;

    if (exportFormat === 'csv') {
      downloadCsv(`${filenameBase}.csv`, payslipHeaders, payslipRows);
      return;
    }

    if (exportFormat === 'excel') {
      downloadExcel(`${filenameBase}.xls`, 'Payslip', payslipHeaders, payslipRows);
      return;
    }

    printPayslip();
  }

  return (
    <>
      <header className="header no-print">
        <h2>Payslip</h2>
        <p>Load and print the latest employee payslip.</p>
      </header>

      <section className="table-section no-print">
        <h3>Role-Based Settings</h3>
        <div className="summary react-summary">
          <div className="card"><span>Role</span><strong>{roleSettings.label}</strong></div>
          <div className="card"><span>Generate</span><strong>{roleSettings.canGenerate ? 'Allowed' : 'Restricted'}</strong></div>
          <div className="card"><span>Export</span><strong>{roleSettings.canExport ? 'Allowed' : 'Restricted'}</strong></div>
          <div className="card"><span>Formats</span><strong>{roleSettings.exportFormats.length ? roleSettings.exportFormats.join(', ') : 'None'}</strong></div>
        </div>
        <p className="message">{roleSettings.note}</p>
      </section>

      <section className="table-section no-print">
        <h3>Select Employee</h3>

        <div className="report-filter-grid">
          <label>
            Employee
            <select
              value={selectedEmpCode}
              onChange={(event) => setSelectedEmpCode(event.target.value)}
            >
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
          <button type="button" className="btn" onClick={loadLatestPayslip} disabled={loading}>
            {loading ? 'Loading...' : 'Load Latest Payslip'}
          </button>

          <button type="button" className="btn" onClick={printPayslip} disabled={!payslip}>
            Print Payslip
          </button>

          <label className="export-choice">
            Format
            <select
              value={roleSettings.exportFormats.includes(exportFormat) ? exportFormat : ''}
              onChange={(event) => setExportFormat(event.target.value)}
              disabled={!roleSettings.canExport}
            >
              {roleSettings.exportFormats.map((format) => (
                <option key={format} value={format}>{format.toUpperCase()}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn secondary"
            onClick={exportPayslip}
            disabled={!payslip || !roleSettings.canExport}
          >
            Export
          </button>
        </div>

        <p className="message">{message}</p>
      </section>

      <section className="summary react-summary no-print">
        <div className="card">
          <span>Employee</span>
          <strong>{payslip ? `${payslip.emp_code || ''} ${employeeName}`.trim() : '-'}</strong>
        </div>

        <div className="card">
          <span>Payroll Range</span>
          <strong>{payslip?.payroll_range || '-'}</strong>
        </div>

        <div className="card">
          <span>Date Generated</span>
          <strong>{formatDate(payslip?.date_generated)}</strong>
        </div>

        <div className="card">
          <span>Gross Pay</span>
          <strong>{money(grossPay)}</strong>
        </div>

        <div className="card">
          <span>Deductions</span>
          <strong>{money(totalDeductions)}</strong>
        </div>

        <div className="card">
          <span>Net Pay</span>
          <strong>{money(netPay)}</strong>
        </div>
      </section>

      <section className="table-section payslip-preview-section">
        <h3 className="no-print">Payslip Print Preview</h3>

        {!payslip ? (
          <p className="no-print">No payslip loaded.</p>
        ) : (
          <div className="payslip-paper">
            <pre className="payslip-exact">{payslipText}</pre>
          </div>
        )}
      </section>
    </>
  );
}
