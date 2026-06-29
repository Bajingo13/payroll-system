import { useEffect, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';

// ─── constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'sss',        label: 'SSS' },
  { key: 'philhealth', label: 'PhilHealth' },
  { key: 'pagibig',    label: 'Pag-IBIG' },
  { key: 'bir',        label: 'BIR' },
  { key: 'tracker',    label: 'Filing Tracker' },
];

const FILING_STATUSES = ['Draft', 'Validated', 'Reviewed', 'Approved', 'Filed', 'Paid'];

const ALL_REPORT_TYPES = ['SSS-R3', 'PhilHealth-RF1', 'PagIBIG-MCRF', 'BIR-1601C', 'BIR-2316', 'BIR-1604C', 'BIR-Alphalist'];

const REPORT_META = {
  'SSS-R3':        { label: 'SSS R3/R5',        deadline: '10th of the following month',     type: 'monthly' },
  'PhilHealth-RF1':{ label: 'PhilHealth RF-1',   deadline: '10th of the following month',     type: 'monthly' },
  'PagIBIG-MCRF':  { label: 'Pag-IBIG MCRF',     deadline: '10th–15th of the following month',type: 'monthly' },
  'BIR-1601C':     { label: 'BIR 1601-C',         deadline: '10th of the following month',     type: 'monthly' },
  'BIR-2316':      { label: 'BIR 2316',           deadline: 'January 31 of the following year',type: 'annual'  },
  'BIR-1604C':     { label: 'BIR 1604-C',         deadline: 'January 31 of the following year',type: 'annual'  },
  'BIR-Alphalist': { label: 'BIR Alphalist',      deadline: 'January 31 of the following year',type: 'annual'  },
};

const REPORT_COLORS = {
  'SSS-R3':        '#0ea5e9',
  'PhilHealth-RF1':'#10b981',
  'PagIBIG-MCRF':  '#f59e0b',
  'BIR-1601C':     '#8b5cf6',
  'BIR-2316':      '#ef4444',
  'BIR-1604C':     '#f97316',
  'BIR-Alphalist': '#ec4899',
};

const METRIC_CARDS = [
  { key: 'employees', label: 'Active Employees', color: '#64748b', icon: '👥' },
  { key: 'sss',       label: 'SSS',              color: '#0ea5e9', icon: '🔵' },
  { key: 'philhealth',label: 'PhilHealth',        color: '#10b981', icon: '🟢' },
  { key: 'pagibig',   label: 'Pag-IBIG',         color: '#f59e0b', icon: '🟡' },
  { key: 'bir',       label: 'BIR Withheld',     color: '#8b5cf6', icon: '🟣' },
  { key: 'issues',    label: 'Compliance Issues', color: null,      icon: '⚠️' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function money(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad2(n) { return String(n).padStart(2, '0'); }

async function downloadFromApi(url, filename) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    const text = await response.text();
    let msg = `Export failed (${response.status})`;
    try { msg = JSON.parse(text)?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

// ─── shared sub-components ────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls = status === 'Paid' || status === 'Filed' ? 'completed'
    : status === 'Approved' ? 'approved'
    : status === 'Reviewed' || status === 'Validated' ? 'pending'
    : 'inactive';
  return <span className={`status ${cls}`}>{status || 'Not started'}</span>;
}

function SectionCard({ title, description, deadline, badge, onExport, onPreview, onPrint, loading, color, children }) {
  const btnBase = {
    padding: '0.4rem 0.85rem',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: '0.82rem',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.15s',
    opacity: loading ? 0.6 : 1,
  };
  return (
    <div style={{
      background: '#fff',
      border: '1.5px solid var(--border,#e2e8f0)',
      borderRadius: 14,
      padding: '1.1rem 1.25rem',
      marginBottom: '1rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      borderTop: color ? `3px solid ${color}` : undefined,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{title}</h4>
          {description && <p style={{ margin: '0 0 2px', fontSize: '0.82rem', color: 'var(--muted,#64748b)' }}>{description}</p>}
          {deadline && (
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
              ⏱ Deadline: {deadline}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          {badge}
          {onPreview && (
            <button type="button" onClick={onPreview} disabled={loading} style={{
              ...btnBase,
              border: `1.5px solid ${color || 'var(--border,#e2e8f0)'}`,
              background: 'transparent',
              color: color || 'var(--primary,#2563eb)',
            }}>
              {loading ? 'Loading…' : 'Preview Data'}
            </button>
          )}
          {onPrint && (
            <button type="button" onClick={onPrint} disabled={loading} style={{
              ...btnBase,
              border: `1.5px solid ${color || '#64748b'}`,
              background: color ? `${color}18` : '#f8fafc',
              color: color || '#334155',
            }}>
              🖨 Print PDF
            </button>
          )}
          {onExport && (
            <button type="button" onClick={onExport} disabled={loading} style={{
              ...btnBase,
              border: 'none',
              background: color
                ? `linear-gradient(135deg, ${color}, ${color}cc)`
                : 'linear-gradient(135deg, #1e40af, #3b82f6)',
              color: '#fff',
              boxShadow: color ? `0 2px 8px ${color}44` : undefined,
            }}>
              ↓ Export CSV
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function PreviewTable({ columns, rows, totalsRow, message, empty = 'No data for the selected period.' }) {
  if (message) return <p className="message" style={{ margin: '0.5rem 0' }}>{message}</p>;
  if (!rows) return null;
  if (!rows.length) return <p style={{ fontSize: '0.85rem', color: 'var(--muted,#6b7280)', margin: '0.5rem 0' }}>{empty}</p>;
  return (
    <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
      <table>
        <thead>
          <tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {col.format ? col.format(row[col.key]) : (row[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totalsRow && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--surface-alt,#f8fafc)' }}>
              {columns.map((col) => (
                <td key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {totalsRow[col.key] !== undefined ? (col.format ? col.format(totalsRow[col.key]) : totalsRow[col.key]) : (col.isTotalLabel ? 'TOTAL' : '')}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function GovernmentReportsPage() {
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year,  setYear]  = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [tab,   setTab]   = useState('overview');

  // Dashboard / compliance data
  const [dashboard,        setDashboard]        = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [filingHistory,    setFilingHistory]    = useState([]);

  // Per-report preview state
  const [previews,  setPreviews]  = useState({});
  const [prevLoad,  setPrevLoad]  = useState({});
  const [prevMsg,   setPrevMsg]   = useState({});

  // SSS Collection options
  const [runs,       setRuns]       = useState([]);
  const [colFilters, setColFilters] = useState({ companies: [], departments: [] });
  const [fromRun,    setFromRun]    = useState('');
  const [toRun,      setToRun]      = useState('');
  const [transaction, setTransaction] = useState('active');
  const [excludeZero, setExcludeZero] = useState(true);
  const [filterCo,    setFilterCo]  = useState('');
  const [filterDept,  setFilterDept] = useState('');

  // Filing tracker state
  const [selReport, setSelReport] = useState('SSS-R3');
  const [filing, setFiling] = useState({
    status: 'Draft', filing_reference: '', payment_reference: '',
    filed_at: '', paid_at: '', amount_paid: '', notes: '',
    receipt_name: '', receipt_data: ''
  });

  const [busy,    setBusy]    = useState(false);
  const [message, setMessage] = useState('');

  // QA state
  const [qaData,    setQaData]    = useState(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaMessage, setQaMessage] = useState('');
  const [qaExpanded, setQaExpanded] = useState({});

  // ── loaders ─────────────────────────────────────────────────────────────────

  async function loadDashboard() {
    setDashboardLoading(true);
    setMessage('');
    try {
      const [dr, hr] = await Promise.all([
        api.get('/government-reports/dashboard', { params: { year, month } }),
        api.get('/government-reports/filings/history')
      ]);
      setDashboard(dr.data);
      setFilingHistory(hr.data?.data || []);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load compliance dashboard.'));
    } finally {
      setDashboardLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear stale preview data and QA results when the period changes
  useEffect(() => {
    setPreviews({});
    setPrevLoad({});
    setPrevMsg({});
    setQaData(null);
    setQaMessage('');
  }, [year, month]);

  // Clear status message when switching tabs
  useEffect(() => {
    setMessage('');
  }, [tab]);

  // Pre-fill filing form when selected report or dashboard changes
  useEffect(() => {
    const isAnnual = ['BIR-2316', 'BIR-1604C', 'BIR-Alphalist'].includes(selReport);
    const saved = dashboard?.filings?.find(
      (f) => f.report_type === selReport && Number(f.report_month) === (isAnnual ? 0 : Number(month))
    );
    setFiling({
      status:            saved?.status            || 'Draft',
      filing_reference:  saved?.filing_reference  || '',
      payment_reference: saved?.payment_reference || '',
      filed_at:  saved?.filed_at  ? String(saved.filed_at).slice(0, 10)  : '',
      paid_at:   saved?.paid_at   ? String(saved.paid_at).slice(0, 10)   : '',
      amount_paid:  saved?.amount_paid  || '',
      notes:        saved?.notes        || '',
      receipt_name: saved?.receipt_name || '',
      receipt_data: ''
    });
  }, [dashboard, selReport, month]);

  // Load SSS collection run options once
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/government-reports/sss/options', { credentials: 'include' });
        const d = await r.json();
        if (r.ok && d?.success) {
          setRuns(Array.isArray(d.runs) ? d.runs : []);
          setColFilters(d.filters || { companies: [], departments: [] });
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // ── preview loader ───────────────────────────────────────────────────────────

  async function loadPreview(key, endpoint, params) {
    setPrevLoad((p) => ({ ...p, [key]: true }));
    setPrevMsg((p)  => ({ ...p, [key]: '' }));
    try {
      const { data } = await api.get(endpoint, { params });
      setPreviews((p) => ({ ...p, [key]: data }));
    } catch (err) {
      setPrevMsg((p) => ({ ...p, [key]: getApiMessage(err, 'Unable to load preview data.') }));
      setPreviews((p) => ({ ...p, [key]: null }));
    } finally {
      setPrevLoad((p) => ({ ...p, [key]: false }));
    }
  }

  // ── export helpers ───────────────────────────────────────────────────────────

  async function exportOne(url, filename) {
    setBusy(true); setMessage('');
    try {
      await downloadFromApi(url, filename);
      setMessage(`${filename} exported.`);
    } catch (err) {
      setMessage(err?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function exportAll() {
    setBusy(true); setMessage('');
    try {
      const mp = pad2(month);
      const jobs = [
        [`/api/government-reports/sss?year=${year}&month=${month}`,          `SSS-R3-R5-${year}-${mp}.csv`],
        [`/api/government-reports/philhealth?year=${year}&month=${month}`,   `PhilHealth-RF1-${year}-${mp}.csv`],
        [`/api/government-reports/pagibig?year=${year}&month=${month}`,      `PagIBIG-MCRF-${year}-${mp}.csv`],
        [`/api/government-reports/bir-1601c?year=${year}&month=${month}`,    `BIR-1601C-${year}-${mp}.csv`],
        [`/api/government-reports/bir-2316?year=${year}`,                    `BIR-2316-${year}.csv`],
        [`/api/government-reports/bir-1604c?year=${year}`,                   `BIR-1604C-${year}.csv`],
        [`/api/government-reports/bir-alphalist?year=${year}`,               `BIR-Alphalist-${year}.csv`],
      ];
      for (const [url, name] of jobs) await downloadFromApi(url, name);
      setMessage('All reports exported successfully.');
    } catch (err) {
      setMessage(err?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function exportSssCollection() {
    if (!fromRun || !toRun) { setMessage('Select From and To payroll runs.'); return; }
    setBusy(true); setMessage('');
    try {
      const p = new URLSearchParams({ from_run_id: fromRun, to_run_id: toRun, transaction, exclude_zero: excludeZero ? '1' : '0' });
      if (filterCo)   p.set('company', filterCo);
      if (filterDept) p.set('department', filterDept);
      await downloadFromApi(`/api/government-reports/sss-collection?${p}`, `SSS-Collection-${fromRun}-to-${toRun}.csv`);
      setMessage('SSS Collection exported.');
    } catch (err) {
      setMessage(err?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  // ── filing tracker ───────────────────────────────────────────────────────────

  async function saveFiling() {
    setBusy(true); setMessage('');
    try {
      await api.put(`/government-reports/filings/${encodeURIComponent(selReport)}`, { ...filing, year, month });
      setMessage(`${selReport} filing record saved.`);
      await loadDashboard();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save filing record.'));
    } finally {
      setBusy(false);
    }
  }

  function selectReceipt(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage('Receipt must be smaller than 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setFiling((prev) => ({ ...prev, receipt_name: file.name, receipt_data: String(reader.result || '') }));
    reader.readAsDataURL(file);
  }

  async function downloadReceipt() {
    try {
      const response = await api.get(`/government-reports/filings/${encodeURIComponent(selReport)}/receipt`, { params: { year, month }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = filing.receipt_name || 'filing-receipt'; link.click();
      URL.revokeObjectURL(url);
    } catch (err) { setMessage(getApiMessage(err, 'Unable to download receipt.')); }
  }

  // ── Print / PDF ──────────────────────────────────────────────────────────────

  async function printReport(endpoint, params = {}) {
    setBusy(true); setMessage('');
    try {
      const response = await api.get(`/government-reports/print/${endpoint}`, {
        params,
        responseType: 'text',
        transformResponse: [(data) => data]
      });
      const html = response.data;
      const win = window.open('', '_blank', 'width=960,height=780');
      if (!win) { setMessage('Popup blocked — please allow popups to print.'); return; }
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } catch (err) {
      setMessage(err?.message || 'Unable to generate print preview.');
    } finally {
      setBusy(false);
    }
  }

  // ── QA ───────────────────────────────────────────────────────────────────────

  async function runQA() {
    setQaLoading(true);
    setQaMessage('');
    setQaData(null);
    setQaExpanded({});
    try {
      const { data } = await api.get('/government-reports/qa', { params: { year, month } });
      if (!data.success) throw new Error(data.message || 'QA check failed.');
      setQaData(data);
    } catch (err) {
      setQaMessage(getApiMessage(err, 'Unable to run QA checks.'));
    } finally {
      setQaLoading(false);
    }
  }

  function toggleQaDetail(id) {
    setQaExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function exportQAReport() {
    if (!qaData) return;
    const lines = [];
    lines.push(`QA REPORT — ${MONTHS[month - 1]} ${year}`);
    lines.push(`Generated: ${new Date().toLocaleString('en-PH')}`);
    lines.push('');
    lines.push(`Active Employees,${qaData.summary.activeEmployees}`);
    lines.push(`Employees with Payroll,${qaData.summary.payrollCount}`);
    lines.push(`Checks Passed,${qaData.summary.passCount}`);
    lines.push(`Warnings,${qaData.summary.warnCount}`);
    lines.push(`Failed,${qaData.summary.failCount}`);
    lines.push('');
    lines.push('CHECK,CATEGORY,STATUS,ISSUES,TOTAL');
    for (const c of qaData.checks) {
      lines.push(`"${c.label}","${c.category}",${c.status.toUpperCase()},${c.issues},${c.total}`);
    }

    const addDetail = (title, rows, cols) => {
      if (!rows?.length) return;
      lines.push('');
      lines.push(title);
      lines.push(cols.map((c) => c.key).join(','));
      for (const r of rows) lines.push(cols.map((col) => `"${r[col.key] ?? ''}"`).join(','));
    };

    addDetail('EMPLOYER ISSUES', qaData.details.employerIssues.map((l) => ({ label: l })), [{ key: 'label' }]);
    addDetail('MISSING SSS NUMBER', qaData.details.missingSSS, [{ key: 'emp_code' }, { key: 'employee_name' }]);
    addDetail('MISSING PHILHEALTH NUMBER', qaData.details.missingPhilHealth, [{ key: 'emp_code' }, { key: 'employee_name' }]);
    addDetail('MISSING PAG-IBIG MID', qaData.details.missingPagIBIG, [{ key: 'emp_code' }, { key: 'employee_name' }]);
    addDetail('MISSING TIN', qaData.details.missingTIN, [{ key: 'emp_code' }, { key: 'employee_name' }]);
    addDetail('MISSING BIRTH DATE', qaData.details.missingBirthDate, [{ key: 'emp_code' }, { key: 'employee_name' }]);
    addDetail('MISSING GENDER', qaData.details.missingGender, [{ key: 'emp_code' }, { key: 'employee_name' }]);
    addDetail('NO PAYROLL THIS PERIOD', qaData.details.missingFromPayroll, [{ key: 'emp_code' }, { key: 'employee_name' }]);
    addDetail('ZERO SSS CONTRIBUTIONS', qaData.details.zeroSSS, [{ key: 'emp_code' }, { key: 'employee_name' }, { key: 'gross_pay' }]);
    addDetail('ZERO PHILHEALTH CONTRIBUTIONS', qaData.details.zeroPhilHealth, [{ key: 'emp_code' }, { key: 'employee_name' }, { key: 'gross_pay' }]);
    addDetail('ZERO PAG-IBIG CONTRIBUTIONS', qaData.details.zeroPagIBIG, [{ key: 'emp_code' }, { key: 'employee_name' }, { key: 'gross_pay' }]);
    addDetail('PHILHEALTH RATE ANOMALIES', qaData.details.phAnomalies, [{ key: 'emp_code' }, { key: 'employee_name' }, { key: 'basic_salary' }, { key: 'expected' }, { key: 'actual' }, { key: 'variance_pct' }]);
    addDetail('PAG-IBIG CEILING ANOMALIES', qaData.details.piAnomalies, [{ key: 'emp_code' }, { key: 'employee_name' }, { key: 'pi_ee' }, { key: 'pi_er' }]);
    addDetail('TAX WITHHELD BELOW MIN WAGE', qaData.details.taxAnomalies, [{ key: 'emp_code' }, { key: 'employee_name' }, { key: 'gross_pay' }, { key: 'tax_withheld' }]);

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `QA-Report-${year}-${pad2(month)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ── filing status badge for each report ─────────────────────────────────────

  function filingBadge(reportType) {
    const isAnnual = ['BIR-2316', 'BIR-1604C', 'BIR-Alphalist'].includes(reportType);
    const saved = dashboard?.filings?.find(
      (f) => f.report_type === reportType && Number(f.report_month) === (isAnnual ? 0 : Number(month))
    );
    return <StatusBadge status={saved?.status || 'Not filed'} />;
  }

  // ── render ───────────────────────────────────────────────────────────────────

  const payroll = dashboard?.payroll || {};
  const issueCount = (dashboard?.employerIssues?.length || 0) + (dashboard?.employeeIssues?.length || 0);

  return (
    <div className="employee-modern-page">

      {/* ── Header ── */}
      <header style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 60%, #3b82f6 100%)',
        borderRadius: 16,
        padding: '1.5rem 2rem',
        marginBottom: '1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        color: '#fff',
        boxShadow: '0 4px 20px rgba(30,64,175,0.25)',
      }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.75 }}>
            Compliance
          </p>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Government Reports
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
            BIR · SSS · PhilHealth · Pag-IBIG — Generate, preview, track, and file.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Year
            <input
              type="number" min="2000" max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value || currentYear))}
              style={{ width: 80, borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '0.35rem 0.6rem', fontSize: '0.9rem', fontWeight: 700 }}
            />
          </label>
          <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Month
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{ borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '0.35rem 0.6rem', fontSize: '0.9rem', fontWeight: 700 }}
            >
              {MONTHS.map((name, i) => <option key={i + 1} value={i + 1} style={{ color: '#000' }}>{name}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={exportAll}
            disabled={busy}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: 8,
              border: '1.5px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: busy ? 'not-allowed' : 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            {busy ? 'Exporting…' : '↓ Export All CSV'}
          </button>
        </div>
      </header>

      {/* ── Tab nav ── */}
      <nav style={{
        display: 'flex',
        gap: '0.2rem',
        marginBottom: '1.25rem',
        background: 'var(--surface,#f1f5f9)',
        padding: '4px',
        borderRadius: 12,
        flexWrap: 'wrap',
        border: '1px solid var(--border,#e2e8f0)',
      }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.45rem 1.1rem',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: '0.875rem',
              background: tab === t.key
                ? 'linear-gradient(135deg, #1e40af, #3b82f6)'
                : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--muted,#6b7280)',
              boxShadow: tab === t.key ? '0 2px 8px rgba(30,64,175,0.25)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ────────────────────── OVERVIEW TAB ────────────────────── */}
      {tab === 'overview' && (
        <>
          {dashboardLoading ? (
            <p className="message">Loading compliance dashboard…</p>
          ) : (
            <>
              {/* Summary metric strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {[
                  { label: 'Active Employees', value: payroll.employee_count || 0, format: 'count', color: '#64748b' },
                  { label: 'SSS',              value: payroll.sss_total,            format: 'money', color: '#0ea5e9' },
                  { label: 'PhilHealth',       value: payroll.philhealth_total,     format: 'money', color: '#10b981' },
                  { label: 'Pag-IBIG',         value: payroll.pagibig_total,        format: 'money', color: '#f59e0b' },
                  { label: 'BIR Withheld',     value: payroll.bir_total,            format: 'money', color: '#8b5cf6' },
                  { label: 'Compliance Issues',value: issueCount,                   format: 'issues',color: issueCount ? '#dc2626' : '#16a34a' },
                ].map(({ label, value, format, color }) => (
                  <div key={label} style={{
                    background: '#fff',
                    border: '1px solid var(--border,#e2e8f0)',
                    borderTop: `3px solid ${color}`,
                    borderRadius: 12,
                    padding: '1rem 1.1rem',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}>
                    <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted,#6b7280)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {label}
                    </p>
                    <p style={{ margin: 0, fontSize: format === 'count' ? '1.6rem' : '1.1rem', fontWeight: 800, color: format === 'issues' ? color : '#0f172a', lineHeight: 1 }}>
                      {format === 'count' ? value
                        : format === 'issues' ? (value || 'None')
                        : `PHP ${money(value)}`}
                    </p>
                    {format === 'money' && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--muted,#6b7280)' }}>{MONTHS[month - 1]} {year}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Filing status cards */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Filing Status — {MONTHS[month - 1]} {year}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted,#6b7280)' }}>Click any card to update status</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem' }}>
                  {ALL_REPORT_TYPES.map((key) => {
                    const meta     = REPORT_META[key];
                    const isAnnual = meta.type === 'annual';
                    const color    = REPORT_COLORS[key];
                    const saved    = dashboard?.filings?.find(
                      (f) => f.report_type === key && Number(f.report_month) === (isAnnual ? 0 : Number(month))
                    );
                    const status   = saved?.status || 'Not filed';
                    const isPaid   = status === 'Paid';
                    const isFiled  = status === 'Filed';
                    const isDone   = isPaid || isFiled;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setTab('tracker'); setSelReport(key); }}
                        style={{
                          background: isDone
                            ? `linear-gradient(135deg, ${color}18, ${color}08)`
                            : '#fff',
                          border: `1.5px solid ${isDone ? color : 'var(--border,#e2e8f0)'}`,
                          borderRadius: 14,
                          padding: '1rem 1.1rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                          boxShadow: isDone
                            ? `0 2px 12px ${color}22`
                            : '0 1px 4px rgba(0,0,0,0.06)',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'box-shadow 0.15s, transform 0.15s',
                        }}
                      >
                        {/* color accent bar */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '14px 14px 0 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 4 }}>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.07em', color,
                            background: `${color}18`, padding: '2px 7px', borderRadius: 100,
                          }}>
                            {isAnnual ? 'Annual' : 'Monthly'}
                          </span>
                          {isDone && (
                            <span style={{ fontSize: '0.9rem' }}>{isPaid ? '✓' : '📋'}</span>
                          )}
                        </div>

                        <p style={{ margin: '8px 0 2px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                          {meta.label}
                        </p>

                        <StatusBadge status={status} />

                        {saved?.amount_paid > 0 && (
                          <p style={{ margin: '6px 0 0', fontSize: '0.78rem', fontWeight: 700, color: '#16a34a' }}>
                            PHP {money(saved.amount_paid)}
                          </p>
                        )}

                        <p style={{ margin: '6px 0 0', fontSize: '0.71rem', color: 'var(--muted,#94a3b8)' }}>
                          Due: {meta.deadline}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Compliance issues */}
              {issueCount > 0 ? (
                <div style={{
                  background: '#fffbeb',
                  border: '1.5px solid #fde68a',
                  borderRadius: 14,
                  padding: '1rem 1.25rem',
                  marginBottom: '1.25rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <strong style={{ color: '#92400e', fontSize: '0.95rem' }}>
                      {issueCount} compliance issue{issueCount !== 1 ? 's' : ''} need attention before filing
                    </strong>
                  </div>
                  {dashboard.employerIssues?.length > 0 && (
                    <div style={{
                      background: '#fef3c7',
                      borderRadius: 8,
                      padding: '0.6rem 0.85rem',
                      marginBottom: '0.6rem',
                      fontSize: '0.83rem',
                      color: '#78350f',
                    }}>
                      <strong>Employer setup:</strong>{' '}
                      {dashboard.employerIssues.map((i) => i.label).join(' · ')}
                      <span style={{ color: '#92400e', marginLeft: 8 }}>→ Fix in Company Settings</span>
                    </div>
                  )}
                  {dashboard.employeeIssues?.length > 0 && (
                    <>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.83rem', color: '#78350f' }}>
                        <strong>{dashboard.employeeIssues.length} employee record(s)</strong> missing government IDs:
                      </p>
                      <div className="table-scroll">
                        <table style={{ fontSize: '0.82rem' }}>
                          <thead><tr><th>Employee</th><th>Missing</th></tr></thead>
                          <tbody>
                            {dashboard.employeeIssues.slice(0, 30).map((row) => (
                              <tr key={row.employee_id}>
                                <td>{row.emp_code} — {row.employee_name}</td>
                                <td style={{ color: '#b45309' }}>{row.issues.join(', ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#92400e' }}>
                        Update IDs in Employee Management → Accounts.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: 12,
                  padding: '0.85rem 1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.9rem',
                  color: '#15803d',
                  fontWeight: 600,
                }}>
                  ✓ All employer and employee compliance fields are complete.
                </div>
              )}

              {/* Report guide */}
              <section className="table-section employee-modern-panel" style={{ borderRadius: 14 }}>
                <h3>Report Guide</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Report</th><th>Type</th><th>Purpose</th><th>Deadline</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>SSS R3/R5</td><td>Monthly</td><td>SSS contribution collection list — employee EE share, employer ER share, and ECC per payroll run.</td><td>10th of following month</td></tr>
                      <tr><td>PhilHealth RF-1</td><td>Monthly</td><td>PhilHealth employer premium remittance report — lists EE and ER share per employee.</td><td>10th of following month</td></tr>
                      <tr><td>Pag-IBIG MCRF</td><td>Monthly</td><td>Pag-IBIG monthly contribution remittance form — EE and ER share per employee.</td><td>10th–15th of following month</td></tr>
                      <tr><td>BIR 1601-C</td><td>Monthly</td><td>Monthly withholding tax remittance — compensation income and tax withheld per employee.</td><td>10th of following month</td></tr>
                      <tr><td>BIR 2316</td><td>Annual</td><td>Certificate of compensation payment and tax withheld issued to each employee.</td><td>January 31</td></tr>
                      <tr><td>BIR 1604-C</td><td>Annual</td><td>Annual information return of all income taxes withheld on compensation.</td><td>January 31</td></tr>
                      <tr><td>BIR Alphalist</td><td>Annual</td><td>Alphabetical employee list with annual compensation and tax withheld for eAFS submission.</td><td>January 31</td></tr>
                      <tr><td>SSS Collection List</td><td>By Run Range</td><td>Detailed SSS contribution collection by payroll run range — used for R-3/R-5 filing.</td><td>Per remittance schedule</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* ────────────────────── SSS TAB ────────────────────── */}
      {tab === 'sss' && (
        <section className="table-section employee-modern-panel">
          <div className="table-header employee-mgmt-header" style={{ marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>SSS R3/R5 — Contribution Collection List</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.83rem', color: 'var(--muted,#6b7280)' }}>
                The R-3/R-5 is the official SSS submission format — grouped by company and department with subtotals.
                Use <strong>Preview Data</strong> to verify amounts, then <strong>Export R-3/R-5 CSV</strong> to generate the file for remittance.
              </p>
            </div>
            {filingBadge('SSS-R3')}
          </div>

          {/* Data preview (read-only, month-based) */}
          <SectionCard
            color={REPORT_COLORS['SSS-R3']}
            title={`Data Preview — ${MONTHS[month - 1]} ${year}`}
            description="Verify employee SSS contributions before exporting. Shows all payroll runs within the selected month."
            loading={prevLoad['sss']}
            onPreview={() => loadPreview('sss', '/government-reports/data/sss', { year, month })}
            onPrint={() => printReport('sss', { year, month })}
          >
            {previews['sss'] && (
              <>
                <div className="summary employee-mini-summary employee-metric-strip" style={{ margin: '0.5rem 0' }}>
                  <div className="card"><span>Employees</span><strong>{previews['sss'].count}</strong></div>
                  <div className="card"><span>EE Share</span><strong>PHP {money(previews['sss'].totals?.ee)}</strong></div>
                  <div className="card"><span>ER Share</span><strong>PHP {money(previews['sss'].totals?.er)}</strong></div>
                  <div className="card"><span>ECC</span><strong>PHP {money(previews['sss'].totals?.ecc)}</strong></div>
                  <div className="card"><span>Grand Total</span><strong>PHP {money(previews['sss'].totals?.total)}</strong></div>
                </div>
                <PreviewTable
                  columns={[
                    { key: 'emp_code',      label: 'ID' },
                    { key: 'employee_name', label: 'Employee Name' },
                    { key: 'sss_no',        label: 'SSS Number' },
                    { key: 'sss_employee',  label: 'EE Share',  align: 'right', format: money },
                    { key: 'sss_employer',  label: 'ER Share',  align: 'right', format: money },
                    { key: 'sss_ecc',       label: 'ECC',       align: 'right', format: money },
                    { key: 'total',         label: 'Total',     align: 'right', format: money },
                  ]}
                  rows={previews['sss'].data}
                  totalsRow={{ employee_name: 'TOTAL', sss_employee: previews['sss'].totals?.ee, sss_employer: previews['sss'].totals?.er, sss_ecc: previews['sss'].totals?.ecc, total: previews['sss'].totals?.total }}
                />
              </>
            )}
            {prevMsg['sss'] && !previews['sss'] && <p className="message">{prevMsg['sss']}</p>}
          </SectionCard>

          {/* SSS Collection List — the actual R-3/R-5 export */}
          <div style={{
            background: '#fff',
            border: `1.5px solid ${REPORT_COLORS['SSS-R3']}`,
            borderRadius: 14,
            padding: '1.1rem 1.25rem',
            boxShadow: `0 2px 12px ${REPORT_COLORS['SSS-R3']}18`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', color: '#0f172a' }}>Export R-3/R-5 — Grouped by Company &amp; Department</h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted,#64748b)' }}>
                  This is the file you submit to SSS. Select the payroll run range that covers the remittance period.
                  For <strong>monthly payroll</strong>, use Auto-fill. For <strong>semi-monthly or weekly</strong>, select runs manually.
                </p>
              </div>
              <button
                type="button"
                onClick={() => printReport('sss-collection', {
                  from_run_id: fromRun, to_run_id: toRun,
                  transaction, exclude_zero: excludeZero ? '1' : '0',
                  ...(filterCo   ? { company:    filterCo   } : {}),
                  ...(filterDept ? { department: filterDept } : {}),
                })}
                disabled={busy || !fromRun || !toRun}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: 8,
                  border: `1.5px solid ${REPORT_COLORS['SSS-R3']}`,
                  background: `${REPORT_COLORS['SSS-R3']}18`,
                  color: REPORT_COLORS['SSS-R3'],
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  cursor: (busy || !fromRun || !toRun) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: (busy || !fromRun || !toRun) ? 0.5 : 1,
                }}
              >
                🖨 Print PDF
              </button>
              <button
                type="button"
                onClick={exportSssCollection}
                disabled={busy || !fromRun || !toRun}
                style={{
                  padding: '0.5rem 1.2rem',
                  borderRadius: 8,
                  border: 'none',
                  background: (busy || !fromRun || !toRun)
                    ? '#e2e8f0'
                    : `linear-gradient(135deg, ${REPORT_COLORS['SSS-R3']}, ${REPORT_COLORS['SSS-R3']}cc)`,
                  color: (busy || !fromRun || !toRun) ? '#94a3b8' : '#fff',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  cursor: (busy || !fromRun || !toRun) ? 'not-allowed' : 'pointer',
                  boxShadow: (!busy && fromRun && toRun) ? `0 2px 8px ${REPORT_COLORS['SSS-R3']}44` : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                ↓ Export R-3/R-5 CSV
              </button>
            </div>

            {/* Auto-fill shortcut */}
            <div style={{
              background: `${REPORT_COLORS['SSS-R3']}0c`,
              border: `1px dashed ${REPORT_COLORS['SSS-R3']}66`,
              borderRadius: 8,
              padding: '0.6rem 0.9rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.82rem', color: '#0369a1', fontWeight: 600 }}>
                Quick select:
              </span>
              <button
                type="button"
                onClick={() => {
                  const monthRuns = runs.filter(
                    (r) => String(r.month_id) === String(month) && String(r.year_id) === String(year)
                  );
                  if (!monthRuns.length) { setMessage(`No payroll runs found for ${MONTHS[month - 1]} ${year}.`); return; }
                  const ids = monthRuns.map((r) => Number(r.run_id));
                  setFromRun(String(Math.min(...ids)));
                  setToRun(String(Math.max(...ids)));
                  setMessage(`Auto-filled ${monthRuns.length} run(s) for ${MONTHS[month - 1]} ${year}.`);
                }}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: 6,
                  border: `1.5px solid ${REPORT_COLORS['SSS-R3']}`,
                  background: '#fff',
                  color: REPORT_COLORS['SSS-R3'],
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                Auto-fill {MONTHS[month - 1]} {year} runs
              </button>
              {fromRun && toRun && (
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Run {fromRun} → {toRun}
                </span>
              )}
            </div>

            <div className="report-filter-grid">
              <label>From Run
                <select value={fromRun} onChange={(e) => setFromRun(e.target.value)}>
                  <option value="">Select</option>
                  {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.run_id} — {r.payroll_range || `Run ${r.run_id}`}</option>)}
                </select>
              </label>
              <label>To Run
                <select value={toRun} onChange={(e) => setToRun(e.target.value)}>
                  <option value="">Select</option>
                  {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.run_id} — {r.payroll_range || `Run ${r.run_id}`}</option>)}
                </select>
              </label>
              <label>Transaction
                <select value={transaction} onChange={(e) => setTransaction(e.target.value)}>
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="hold">Hold</option>
                </select>
              </label>
              <label>Company
                <select value={filterCo} onChange={(e) => setFilterCo(e.target.value)}>
                  <option value="">All</option>
                  {colFilters.companies.map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label>Department
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                  <option value="">All</option>
                  {colFilters.departments.map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: '1.4rem' }}>
                <input type="checkbox" checked={excludeZero} onChange={(e) => setExcludeZero(e.target.checked)} />
                Exclude zero-contribution rows
              </label>
            </div>
          </div>
        </section>
      )}

      {/* ────────────────────── PHILHEALTH TAB ────────────────────── */}
      {tab === 'philhealth' && (
        <section className="table-section employee-modern-panel">
          <h3>PhilHealth RF-1 — {MONTHS[month - 1]} {year}</h3>

          <SectionCard
            color={REPORT_COLORS['PhilHealth-RF1']}
            title="PhilHealth RF-1 — Employer Premium Remittance Report"
            description="Lists each employee's PhilHealth EE and ER premium contributions for the selected month. Submit to PhilHealth for monthly remittance."
            deadline="10th of the following month"
            badge={filingBadge('PhilHealth-RF1')}
            loading={prevLoad['philhealth']}
            onPreview={() => loadPreview('philhealth', '/government-reports/data/philhealth', { year, month })}
            onPrint={() => printReport('philhealth', { year, month })}
            onExport={() => exportOne(`/api/government-reports/philhealth?year=${year}&month=${month}`, `PhilHealth-RF1-${year}-${pad2(month)}.csv`)}
          >
            {previews['philhealth'] && (
              <>
                <div className="summary employee-mini-summary employee-metric-strip" style={{ margin: '0.5rem 0' }}>
                  <div className="card"><span>Employees</span><strong>{previews['philhealth'].count}</strong></div>
                  <div className="card"><span>EE Share Total</span><strong>PHP {money(previews['philhealth'].totals?.ee)}</strong></div>
                  <div className="card"><span>ER Share Total</span><strong>PHP {money(previews['philhealth'].totals?.er)}</strong></div>
                  <div className="card"><span>Grand Total</span><strong>PHP {money(previews['philhealth'].totals?.total)}</strong></div>
                </div>
                <PreviewTable
                  message={prevMsg['philhealth']}
                  columns={[
                    { key: 'emp_code',      label: 'ID' },
                    { key: 'employee_name', label: 'Employee Name' },
                    { key: 'philhealth_no', label: 'PhilHealth No.' },
                    { key: 'ee_share',      label: 'EE Share', align: 'right', format: money },
                    { key: 'er_share',      label: 'ER Share', align: 'right', format: money },
                    { key: 'total',         label: 'Total',    align: 'right', format: money },
                  ]}
                  rows={previews['philhealth'].data}
                  totalsRow={{ employee_name: 'TOTAL', ee_share: previews['philhealth'].totals?.ee, er_share: previews['philhealth'].totals?.er, total: previews['philhealth'].totals?.total }}
                />
              </>
            )}
            {prevMsg['philhealth'] && !previews['philhealth'] && <p className="message">{prevMsg['philhealth']}</p>}
          </SectionCard>
        </section>
      )}

      {/* ────────────────────── PAG-IBIG TAB ────────────────────── */}
      {tab === 'pagibig' && (
        <section className="table-section employee-modern-panel">
          <h3>Pag-IBIG MCRF — {MONTHS[month - 1]} {year}</h3>

          <SectionCard
            color={REPORT_COLORS['PagIBIG-MCRF']}
            title="Pag-IBIG MCRF — Monthly Contribution Remittance Form"
            description="Lists each employee's Pag-IBIG (HDMF) EE and ER contributions for the selected month. Submit to Pag-IBIG for monthly remittance."
            deadline="10th–15th of the following month"
            badge={filingBadge('PagIBIG-MCRF')}
            loading={prevLoad['pagibig']}
            onPreview={() => loadPreview('pagibig', '/government-reports/data/pagibig', { year, month })}
            onPrint={() => printReport('pagibig', { year, month })}
            onExport={() => exportOne(`/api/government-reports/pagibig?year=${year}&month=${month}`, `PagIBIG-MCRF-${year}-${pad2(month)}.csv`)}
          >
            {previews['pagibig'] && (
              <>
                <div className="summary employee-mini-summary employee-metric-strip" style={{ margin: '0.5rem 0' }}>
                  <div className="card"><span>Employees</span><strong>{previews['pagibig'].count}</strong></div>
                  <div className="card"><span>EE Share Total</span><strong>PHP {money(previews['pagibig'].totals?.ee)}</strong></div>
                  <div className="card"><span>ER Share Total</span><strong>PHP {money(previews['pagibig'].totals?.er)}</strong></div>
                  <div className="card"><span>Grand Total</span><strong>PHP {money(previews['pagibig'].totals?.total)}</strong></div>
                </div>
                <PreviewTable
                  message={prevMsg['pagibig']}
                  columns={[
                    { key: 'emp_code',      label: 'ID' },
                    { key: 'employee_name', label: 'Employee Name' },
                    { key: 'pagibig_no',    label: 'Pag-IBIG MID' },
                    { key: 'ee_share',      label: 'EE Share', align: 'right', format: money },
                    { key: 'er_share',      label: 'ER Share', align: 'right', format: money },
                    { key: 'total',         label: 'Total',    align: 'right', format: money },
                  ]}
                  rows={previews['pagibig'].data}
                  totalsRow={{ employee_name: 'TOTAL', ee_share: previews['pagibig'].totals?.ee, er_share: previews['pagibig'].totals?.er, total: previews['pagibig'].totals?.total }}
                />
              </>
            )}
            {prevMsg['pagibig'] && !previews['pagibig'] && <p className="message">{prevMsg['pagibig']}</p>}
          </SectionCard>
        </section>
      )}

      {/* ────────────────────── BIR TAB ────────────────────── */}
      {tab === 'bir' && (
        <section className="table-section employee-modern-panel">
          <h3>BIR Reports</h3>

          {/* BIR 1601-C Monthly */}
          <SectionCard
            color={REPORT_COLORS['BIR-1601C']}
            title={`BIR 1601-C — Monthly Withholding Tax Return (${MONTHS[month - 1]} ${year})`}
            description="Monthly Remittance Return of Income Taxes Withheld on Compensation. Lists each employee's gross compensation, taxable income, and tax withheld for the month."
            deadline="10th of the following month"
            badge={filingBadge('BIR-1601C')}
            loading={prevLoad['bir-monthly']}
            onPreview={() => loadPreview('bir-monthly', '/government-reports/data/bir-monthly', { year, month })}
            onPrint={() => printReport('bir-monthly', { year, month })}
            onExport={() => exportOne(`/api/government-reports/bir-1601c?year=${year}&month=${month}`, `BIR-1601C-${year}-${pad2(month)}.csv`)}
          >
            {previews['bir-monthly'] && (
              <>
                <div className="summary employee-mini-summary employee-metric-strip" style={{ margin: '0.5rem 0' }}>
                  <div className="card"><span>Employees</span><strong>{previews['bir-monthly'].count}</strong></div>
                  <div className="card"><span>Gross Pay Total</span><strong>PHP {money(previews['bir-monthly'].totals?.gross_pay)}</strong></div>
                  <div className="card"><span>Tax Withheld Total</span><strong>PHP {money(previews['bir-monthly'].totals?.tax_withheld)}</strong></div>
                </div>
                <PreviewTable
                  message={prevMsg['bir-monthly']}
                  columns={[
                    { key: 'emp_code',               label: 'ID' },
                    { key: 'employee_name',           label: 'Employee Name' },
                    { key: 'tin_no',                  label: 'TIN' },
                    { key: 'basic_salary',            label: 'Basic Salary',        align: 'right', format: money },
                    { key: 'taxable_allowances',      label: 'Taxable Allow.',      align: 'right', format: money },
                    { key: 'non_taxable_allowances',  label: 'Non-Taxable Allow.',  align: 'right', format: money },
                    { key: 'gross_pay',               label: 'Gross Pay',           align: 'right', format: money },
                    { key: 'tax_withheld',            label: 'Tax Withheld',        align: 'right', format: money },
                  ]}
                  rows={previews['bir-monthly'].data}
                  totalsRow={{ employee_name: 'TOTAL', gross_pay: previews['bir-monthly'].totals?.gross_pay, tax_withheld: previews['bir-monthly'].totals?.tax_withheld }}
                />
              </>
            )}
            {prevMsg['bir-monthly'] && !previews['bir-monthly'] && <p className="message">{prevMsg['bir-monthly']}</p>}
          </SectionCard>

          {/* Annual BIR Reports */}
          <h3 style={{ marginTop: '1.5rem' }}>Annual BIR Reports — {year}</h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--muted,#6b7280)', marginBottom: '1rem' }}>
            Annual reports use the selected year only. Use the preview to verify totals before exporting.
          </p>

          {/* Shared preview load for annual */}
          {!previews['bir-annual'] && !prevLoad['bir-annual'] && (
            <button type="button" className="btn secondary" style={{ marginBottom: '1rem' }}
              onClick={() => loadPreview('bir-annual', '/government-reports/data/bir-annual', { year })}>
              Load Annual BIR Data for {year}
            </button>
          )}
          {prevLoad['bir-annual'] && <p className="message">Loading annual BIR data…</p>}
          {prevMsg['bir-annual'] && <p className="message">{prevMsg['bir-annual']}</p>}

          {previews['bir-annual'] && (
            <div className="summary employee-mini-summary employee-metric-strip" style={{ marginBottom: '1rem' }}>
              <div className="card"><span>Employees</span><strong>{previews['bir-annual'].count}</strong></div>
              <div className="card"><span>Annual Gross Pay</span><strong>PHP {money(previews['bir-annual'].totals?.gross_pay)}</strong></div>
              <div className="card"><span>Annual Tax Withheld</span><strong>PHP {money(previews['bir-annual'].totals?.tax_withheld)}</strong></div>
            </div>
          )}

          {/* BIR 2316 */}
          <SectionCard
            color={REPORT_COLORS['BIR-2316']}
            title="BIR 2316 — Certificate of Compensation Payment/Tax Withheld"
            description="Issued per employee — shows annual basic salary, allowances, gross pay, and total tax withheld. Given to employees and submitted to BIR."
            deadline="January 31 of the following year"
            badge={filingBadge('BIR-2316')}
            onPrint={() => printReport('bir-annual', { year, type: 'BIR-2316' })}
            onExport={() => exportOne(`/api/government-reports/bir-2316?year=${year}`, `BIR-2316-${year}.csv`)}
          >
            {previews['bir-annual'] && (
              <PreviewTable
                columns={[
                  { key: 'emp_code',              label: 'ID' },
                  { key: 'employee_name',          label: 'Employee Name' },
                  { key: 'tin_no',                 label: 'TIN' },
                  { key: 'basic_salary',           label: 'Basic Salary',    align: 'right', format: money },
                  { key: 'taxable_allowances',     label: 'Taxable Allow.', align: 'right', format: money },
                  { key: 'non_taxable_allowances', label: 'Non-Tax Allow.', align: 'right', format: money },
                  { key: 'gross_pay',              label: 'Gross Pay',       align: 'right', format: money },
                  { key: 'tax_withheld',           label: 'Tax Withheld',    align: 'right', format: money },
                ]}
                rows={previews['bir-annual'].data}
              />
            )}
          </SectionCard>

          {/* BIR 1604-C */}
          <SectionCard
            color={REPORT_COLORS['BIR-1604C']}
            title="BIR 1604-C — Annual Information Return of Taxes Withheld"
            description="Annual summary return filed by the employer listing all employees' annual gross pay and total withholding tax. Includes summary and detail rows."
            deadline="January 31 of the following year"
            badge={filingBadge('BIR-1604C')}
            onPrint={() => printReport('bir-annual', { year, type: 'BIR-1604C' })}
            onExport={() => exportOne(`/api/government-reports/bir-1604c?year=${year}`, `BIR-1604C-${year}.csv`)}
          >
            {previews['bir-annual'] && (
              <div style={{ fontSize: '0.83rem', color: 'var(--muted,#6b7280)' }}>
                {previews['bir-annual'].count} employee(s) — Total Gross Pay: PHP {money(previews['bir-annual'].totals?.gross_pay)} — Total Tax Withheld: PHP {money(previews['bir-annual'].totals?.tax_withheld)}
              </div>
            )}
          </SectionCard>

          {/* BIR Alphalist */}
          <SectionCard
            color={REPORT_COLORS['BIR-Alphalist']}
            title="BIR Alphalist — Annual Alphabetical List of Employees"
            description="Alphabetical list of employees with their annual compensation and taxes withheld. Required for eAFS (Electronic Audited Financial Statements) submission."
            deadline="January 31 of the following year"
            badge={filingBadge('BIR-Alphalist')}
            onPrint={() => printReport('bir-annual', { year, type: 'BIR-Alphalist' })}
            onExport={() => exportOne(`/api/government-reports/bir-alphalist?year=${year}`, `BIR-Alphalist-${year}.csv`)}
          >
            {previews['bir-annual'] && (
              <div style={{ fontSize: '0.83rem', color: 'var(--muted,#6b7280)' }}>
                {previews['bir-annual'].count} employee(s) sorted alphabetically.
              </div>
            )}
          </SectionCard>
        </section>
      )}

      {/* ────────────────────── FILING TRACKER TAB ────────────────────── */}
      {tab === 'tracker' && (
        <>
          <section className="table-section employee-modern-panel">
            <h3>Filing Lifecycle Tracker</h3>
            <p style={{ fontSize: '0.83rem', color: 'var(--muted,#6b7280)', marginBottom: '1rem' }}>
              Track the status of each government report from Draft through Filed and Paid. Upload proof of remittance for your records.
              Reports are locked after being marked Filed or Paid.
            </p>

            {/* Filing status grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.65rem', marginBottom: '1rem' }}>
              {ALL_REPORT_TYPES.map((key) => {
                const isAnnual = ['BIR-2316', 'BIR-1604C', 'BIR-Alphalist'].includes(key);
                const color    = REPORT_COLORS[key];
                const saved    = dashboard?.filings?.find(
                  (f) => f.report_type === key && Number(f.report_month) === (isAnnual ? 0 : Number(month))
                );
                const status   = saved?.status || 'Not filed';
                const selected = selReport === key;
                return (
                  <button key={key} type="button"
                    onClick={() => setSelReport(key)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: 12,
                      padding: '0.85rem 1rem',
                      border: selected ? `2px solid ${color}` : '1.5px solid var(--border,#e2e8f0)',
                      background: selected ? `${color}10` : '#fff',
                      boxShadow: selected ? `0 0 0 3px ${color}22` : '0 1px 3px rgba(0,0,0,0.05)',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
                    <small style={{ color, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {isAnnual ? 'Annual' : MONTHS[month - 1]}
                    </small>
                    <strong style={{ display: 'block', margin: '5px 0 6px', fontSize: '0.9rem', color: '#0f172a' }}>
                      {REPORT_META[key]?.label}
                    </strong>
                    <StatusBadge status={status} />
                    {saved?.amount_paid > 0 && (
                      <p style={{ fontSize: '0.75rem', margin: '5px 0 0', color: '#16a34a', fontWeight: 700 }}>
                        PHP {money(saved.amount_paid)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filing form */}
            <div className="card">
              <h4 style={{ marginTop: 0 }}>
                {REPORT_META[selReport]?.label} — {['BIR-2316','BIR-1604C','BIR-Alphalist'].includes(selReport) ? String(year) : `${MONTHS[month - 1]} ${year}`}
              </h4>
              <div className="report-filter-grid">
                <label>Report
                  <select value={selReport} onChange={(e) => setSelReport(e.target.value)}>
                    {ALL_REPORT_TYPES.map((t) => <option key={t} value={t}>{REPORT_META[t]?.label}</option>)}
                  </select>
                </label>
                <label>Status
                  <select value={filing.status} onChange={(e) => setFiling((p) => ({ ...p, status: e.target.value }))}>
                    {FILING_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label>Filing Reference
                  <input value={filing.filing_reference} onChange={(e) => setFiling((p) => ({ ...p, filing_reference: e.target.value }))} placeholder="Reference no." />
                </label>
                <label>Payment Reference
                  <input value={filing.payment_reference} onChange={(e) => setFiling((p) => ({ ...p, payment_reference: e.target.value }))} placeholder="OR / confirmation no." />
                </label>
                <label>Filed Date
                  <input type="date" value={filing.filed_at} onChange={(e) => setFiling((p) => ({ ...p, filed_at: e.target.value }))} />
                </label>
                <label>Paid Date
                  <input type="date" value={filing.paid_at} onChange={(e) => setFiling((p) => ({ ...p, paid_at: e.target.value }))} />
                </label>
                <label>Amount Paid (PHP)
                  <input type="number" min="0" step="0.01" value={filing.amount_paid} onChange={(e) => setFiling((p) => ({ ...p, amount_paid: e.target.value }))} />
                </label>
                <label>
                  Proof of Remittance
                  <input type="file" accept="image/*,.pdf" onChange={selectReceipt} />
                  <small style={{ color: 'var(--muted,#6b7280)' }}>{filing.receipt_name || 'No file attached (max 2 MB)'}</small>
                  {filing.receipt_name && !filing.receipt_data && (
                    <button type="button" className="btn secondary" onClick={downloadReceipt} style={{ marginTop: 6 }}>
                      Download saved proof
                    </button>
                  )}
                </label>
                <label style={{ gridColumn: 'span 2' }}>
                  Notes
                  <textarea rows={3} value={filing.notes} onChange={(e) => setFiling((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes or remarks" />
                </label>
              </div>
              <div className="row-actions" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn" onClick={saveFiling} disabled={busy}>
                  {busy ? 'Saving…' : 'Save Filing Record'}
                </button>
              </div>
              <p style={{ fontSize: '0.78rem', margin: '8px 0 0', color: 'var(--muted,#6b7280)' }}>
                Reports are locked once marked Filed or Paid. Every status change is recorded in the audit history below.
              </p>
            </div>
          </section>

          {/* Audit history */}
          {filingHistory.length > 0 && (
            <section className="table-section employee-modern-panel">
              <h3>Filing Audit History</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Report</th><th>Period</th><th>Status Change</th><th>Changed By</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {filingHistory.slice(0, 25).map((row) => (
                      <tr key={row.history_id}>
                        <td>{row.report_type}</td>
                        <td>{row.report_month ? `${pad2(row.report_month)}/${row.report_year}` : row.report_year}</td>
                        <td>{row.previous_status || 'New'} → {row.new_status}</td>
                        <td>{row.changed_by || '-'}</td>
                        <td>{new Date(row.created_at).toLocaleString('en-PH')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* ────────────────────── QA TAB ────────────────────── */}
      {tab === 'qa' && (
        <>
          <section className="table-section employee-modern-panel">
            <div className="table-header employee-mgmt-header">
              <div>
                <h3>QA Check — {MONTHS[month - 1]} {year}</h3>
                <p>Validates employer setup, employee IDs, payroll coverage, contribution completeness, and rate accuracy before filing.</p>
              </div>
              <div className="row-actions">
                <button type="button" className="btn" onClick={runQA} disabled={qaLoading}>
                  {qaLoading ? 'Running checks…' : `Run QA for ${MONTHS[month - 1]} ${year}`}
                </button>
                {qaData && (
                  <button type="button" className="btn secondary" onClick={exportQAReport}>
                    Export QA Report
                  </button>
                )}
              </div>
            </div>

            {qaLoading && <p className="message">Running quality assurance checks…</p>}
            {qaMessage && <p className="message">{qaMessage}</p>}

            {!qaData && !qaLoading && (
              <p style={{ color: 'var(--muted,#6b7280)', fontSize: '0.9rem' }}>
                Click <strong>Run QA</strong> to validate government report data before filing.
              </p>
            )}

            {qaData && (() => {
              const s = qaData.summary;
              const allPassed = s.failCount === 0 && s.warnCount === 0;

              return (
                <>
                  {/* ── Result banner ── */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 8,
                    background: allPassed ? '#dcfce7' : s.failCount > 0 ? '#fee2e2' : '#fffbeb',
                    border: `1px solid ${allPassed ? '#86efac' : s.failCount > 0 ? '#fca5a5' : '#fde68a'}`,
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>{allPassed ? '✓' : s.failCount > 0 ? '✗' : '⚠'}</span>
                    <div>
                      <strong style={{ color: allPassed ? '#15803d' : s.failCount > 0 ? '#b91c1c' : '#b45309' }}>
                        {allPassed
                          ? 'All checks passed — data looks ready for filing.'
                          : s.failCount > 0
                            ? `${s.failCount} critical issue(s) must be resolved before filing.`
                            : `${s.warnCount} warning(s) found — review before filing.`}
                      </strong>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted,#6b7280)' }}>
                        {s.passCount} passed · {s.warnCount} warnings · {s.failCount} failed
                      </p>
                    </div>
                  </div>

                  {/* ── Summary cards ── */}
                  <section className="summary employee-modern-summary" style={{ marginBottom: '1rem' }}>
                    <div className="card" style={{ borderTop: '3px solid #16a34a' }}>
                      <span>Passed</span>
                      <strong style={{ color: '#16a34a' }}>{s.passCount}</strong>
                    </div>
                    <div className="card" style={{ borderTop: '3px solid #f59e0b' }}>
                      <span>Warnings</span>
                      <strong style={{ color: '#b45309' }}>{s.warnCount}</strong>
                    </div>
                    <div className="card" style={{ borderTop: '3px solid #dc2626' }}>
                      <span>Failed</span>
                      <strong style={{ color: '#dc2626' }}>{s.failCount}</strong>
                    </div>
                    <div className="card">
                      <span>Active Employees</span>
                      <strong>{s.activeEmployees}</strong>
                    </div>
                    <div className="card">
                      <span>With Payroll</span>
                      <strong>{s.payrollCount}</strong>
                    </div>
                    <div className="card">
                      <span>Payroll Coverage</span>
                      <strong>{s.activeEmployees > 0 ? `${Math.round(s.payrollCount / s.activeEmployees * 100)}%` : '—'}</strong>
                    </div>
                  </section>

                  {/* ── Contributions totals ── */}
                  <section className="summary employee-mini-summary employee-metric-strip" style={{ marginBottom: '1rem' }}>
                    <div className="card"><span>Gross Pay</span><strong>PHP {money(s.gross_pay)}</strong></div>
                    <div className="card"><span>SSS Total</span><strong>PHP {money(s.sss_total)}</strong></div>
                    <div className="card"><span>PhilHealth Total</span><strong>PHP {money(s.ph_total)}</strong></div>
                    <div className="card"><span>Pag-IBIG Total</span><strong>PHP {money(s.pi_total)}</strong></div>
                    <div className="card"><span>BIR Tax Withheld</span><strong>PHP {money(s.tax_withheld)}</strong></div>
                  </section>

                  {/* ── Checklist table ── */}
                  <div className="table-scroll" style={{ marginBottom: '1rem' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Check</th>
                          <th>Status</th>
                          <th>Issues</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qaData.checks.map((c) => (
                          <tr key={c.id}
                            style={{ cursor: c.issues > 0 ? 'pointer' : undefined, background: qaExpanded[c.id] ? 'var(--surface-alt,#f8fafc)' : undefined }}
                            onClick={() => c.issues > 0 && toggleQaDetail(c.id)}
                          >
                            <td style={{ color: 'var(--muted,#6b7280)', fontSize: '0.83rem' }}>{c.category}</td>
                            <td><strong>{c.label}</strong></td>
                            <td>
                              {c.status === 'pass'
                                ? <span className="status completed">PASS</span>
                                : c.status === 'fail'
                                  ? <span className="status inactive">FAIL</span>
                                  : <span className="status pending">WARN</span>}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {c.issues > 0
                                ? <span style={{ color: c.status === 'fail' ? '#b91c1c' : '#b45309', fontWeight: 700 }}>
                                    {c.issues} / {c.total} {c.issues > 0 ? '▾' : ''}
                                  </span>
                                : <span style={{ color: '#16a34a' }}>—</span>}
                            </td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--muted,#6b7280)' }}>{c.note || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Detail panels (expand on row click) ── */}

                  {/* Employer issues */}
                  {qaExpanded['employer_setup'] && qaData.details.employerIssues.length > 0 && (
                    <div className="card" style={{ borderLeft: '4px solid #dc2626', marginBottom: '0.75rem' }}>
                      <strong>Missing employer fields — fix in Company Settings:</strong>
                      <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                        {qaData.details.employerIssues.map((l) => <li key={l}>{l}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Generic detail table helper */}
                  {[
                    { id: 'sss_ids',         title: 'Missing SSS Number',            data: qaData.details.missingSSS,         cols: ['emp_code', 'employee_name'] },
                    { id: 'philhealth_ids',   title: 'Missing PhilHealth Number',     data: qaData.details.missingPhilHealth,  cols: ['emp_code', 'employee_name'] },
                    { id: 'pagibig_ids',      title: 'Missing Pag-IBIG MID',          data: qaData.details.missingPagIBIG,     cols: ['emp_code', 'employee_name'] },
                    { id: 'tin_ids',          title: 'Missing TIN',                   data: qaData.details.missingTIN,         cols: ['emp_code', 'employee_name'] },
                    { id: 'birth_dates',      title: 'Missing Birth Date',            data: qaData.details.missingBirthDate,   cols: ['emp_code', 'employee_name'] },
                    { id: 'gender',           title: 'Missing Sex/Gender',            data: qaData.details.missingGender,      cols: ['emp_code', 'employee_name'] },
                    { id: 'payroll_coverage', title: 'No Payroll This Period',        data: qaData.details.missingFromPayroll, cols: ['emp_code', 'employee_name'] },
                    { id: 'zero_sss',         title: 'Zero SSS Contributions',        data: qaData.details.zeroSSS,            cols: ['emp_code', 'employee_name', 'gross_pay'] },
                    { id: 'zero_philhealth',  title: 'Zero PhilHealth Contributions', data: qaData.details.zeroPhilHealth,     cols: ['emp_code', 'employee_name', 'gross_pay'] },
                    { id: 'zero_pagibig',     title: 'Zero Pag-IBIG Contributions',   data: qaData.details.zeroPagIBIG,        cols: ['emp_code', 'employee_name', 'gross_pay'] },
                  ].map(({ id, title, data, cols }) => (
                    qaExpanded[id] && data?.length > 0 ? (
                      <div key={id} className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '0.75rem' }}>
                        <strong>{title} ({data.length})</strong>
                        <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>ID</th>
                                <th>Employee</th>
                                {cols.includes('gross_pay') && <th style={{ textAlign: 'right' }}>Gross Pay</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {data.slice(0, 50).map((r, i) => (
                                <tr key={i}>
                                  <td>{r.emp_code}</td>
                                  <td>{r.employee_name}</td>
                                  {cols.includes('gross_pay') && <td style={{ textAlign: 'right' }}>PHP {money(r.gross_pay)}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {data.length > 50 && <p style={{ fontSize: '0.8rem', color: 'var(--muted,#6b7280)', margin: '4px 0 0' }}>Showing 50 of {data.length}. Export the QA report for the full list.</p>}
                        </div>
                      </div>
                    ) : null
                  ))}

                  {/* PhilHealth rate anomalies */}
                  {qaExpanded['ph_rates'] && qaData.details.phAnomalies?.length > 0 && (
                    <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '0.75rem' }}>
                      <strong>PhilHealth Rate Anomalies ({qaData.details.phAnomalies.length})</strong>
                      <p style={{ fontSize: '0.8rem', margin: '4px 0 8px', color: 'var(--muted,#6b7280)' }}>
                        Expected total premium = 5% of basic salary (2.5% EE + 2.5% ER). Flagged when actual differs by more than 15%.
                      </p>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr><th>ID</th><th>Employee</th><th style={{ textAlign: 'right' }}>Basic Salary</th><th style={{ textAlign: 'right' }}>Expected</th><th style={{ textAlign: 'right' }}>Actual</th><th style={{ textAlign: 'right' }}>Variance</th></tr>
                          </thead>
                          <tbody>
                            {qaData.details.phAnomalies.map((r, i) => (
                              <tr key={i}>
                                <td>{r.emp_code}</td>
                                <td>{r.employee_name}</td>
                                <td style={{ textAlign: 'right' }}>PHP {money(r.basic_salary)}</td>
                                <td style={{ textAlign: 'right' }}>PHP {money(r.expected)}</td>
                                <td style={{ textAlign: 'right' }}>PHP {money(r.actual)}</td>
                                <td style={{ textAlign: 'right', color: '#b45309' }}>{r.variance_pct}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Pag-IBIG ceiling anomalies */}
                  {qaExpanded['pi_ceiling'] && qaData.details.piAnomalies?.length > 0 && (
                    <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '0.75rem' }}>
                      <strong>Pag-IBIG EE Above PHP 200 Ceiling ({qaData.details.piAnomalies.length})</strong>
                      <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
                        <table>
                          <thead>
                            <tr><th>ID</th><th>Employee</th><th style={{ textAlign: 'right' }}>EE Share</th><th style={{ textAlign: 'right' }}>ER Share</th></tr>
                          </thead>
                          <tbody>
                            {qaData.details.piAnomalies.map((r, i) => (
                              <tr key={i}>
                                <td>{r.emp_code}</td>
                                <td>{r.employee_name}</td>
                                <td style={{ textAlign: 'right', color: '#b91c1c' }}>PHP {money(r.pi_ee)}</td>
                                <td style={{ textAlign: 'right' }}>PHP {money(r.pi_er)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tax below minimum wage */}
                  {qaExpanded['tax_below_mw'] && qaData.details.taxAnomalies?.length > 0 && (
                    <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: '0.75rem' }}>
                      <strong>Tax Withheld on Below-Minimum-Wage Earners ({qaData.details.taxAnomalies.length})</strong>
                      <p style={{ fontSize: '0.8rem', margin: '4px 0 8px', color: 'var(--muted,#6b7280)' }}>
                        Gross pay is below the NCR minimum wage threshold (PHP 18,200/month). Minimum wage earners are income-tax exempt.
                      </p>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr><th>ID</th><th>Employee</th><th style={{ textAlign: 'right' }}>Gross Pay</th><th style={{ textAlign: 'right' }}>Tax Withheld</th></tr>
                          </thead>
                          <tbody>
                            {qaData.details.taxAnomalies.map((r, i) => (
                              <tr key={i}>
                                <td>{r.emp_code}</td>
                                <td>{r.employee_name}</td>
                                <td style={{ textAlign: 'right' }}>PHP {money(r.gross_pay)}</td>
                                <td style={{ textAlign: 'right', color: '#b91c1c' }}>PHP {money(r.tax_withheld)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        </>
      )}

      {/* Global status message */}
      {message && <p className="message" style={{ marginTop: '0.5rem' }}>{message}</p>}
    </div>
  );
}
