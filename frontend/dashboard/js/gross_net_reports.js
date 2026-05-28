function money(value) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function parseApiJson(res, fallbackMessage) {
  const raw = await res.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(fallbackMessage || 'Invalid server response. Please refresh and try again.');
  }

  if (!res.ok) {
    throw new Error((data && data.message) || fallbackMessage || 'Request failed.');
  }

  return data;
}

function getReportType() {
  return String(document.body.dataset.reportType || '').trim();
}

function getTitle(type) {
  return type === 'gross-pay' ? 'Gross Pay Report' : 'Net Pay Report';
}

function getColumnLabel(type) {
  return type === 'gross-pay' ? 'Gross Pay' : 'Net Pay';
}

function renderTable(rows, type) {
  const tbody = document.querySelector('#reportTable tbody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5">No report rows yet.</td></tr>`;
    return;
  }

  const valueKey = type === 'gross-pay' ? 'gross_pay' : 'net_pay';

  tbody.innerHTML = rows.map((row) => {
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-';
    return `
      <tr>
        <td>${escapeHtml(row.emp_code || row.employee_id || '-')}</td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(row.company || '-')}</td>
        <td>${escapeHtml(row.department || '-')}</td>
        <td>${money(row[valueKey])}</td>
      </tr>
    `;
  }).join('');
}

function updateSummary(runId, rows, type) {
  const runNode = document.getElementById('runIdValue');
  const countNode = document.getElementById('rowCountValue');
  const totalNode = document.getElementById('totalValue');
  const labelNode = document.getElementById('totalLabel');

  if (runNode) runNode.textContent = runId || '-';
  if (countNode) countNode.textContent = String(rows.length);
  if (labelNode) labelNode.textContent = type === 'gross-pay' ? 'Total Gross' : 'Total Net';

  const total = rows.reduce((sum, row) => sum + Number(type === 'gross-pay' ? row.gross_pay : row.net_pay || 0), 0);
  if (totalNode) totalNode.textContent = money(total);
}

async function loadReportOptions() {
  const res = await fetch('/api/payroll_periods');
  const data = await parseApiJson(res, 'Unable to load report setup.');
  const payload = data.data || {};

  return {
    payrollGroups: payload.payrollGroups || [],
    payrollPeriods: payload.payrollPeriods || [],
    payrollMonths: payload.payrollMonths || [],
    payrollYears: payload.payrollYears || []
  };
}

function fillSelect(select, items, valueKey, labelKey) {
  if (!select) return;
  select.innerHTML = '<option value="">Select</option>' + items.map((item) => `<option value="${escapeHtml(item[valueKey])}">${escapeHtml(item[labelKey])}</option>`).join('');
}

async function generateReport() {
  const type = getReportType();
  const messageNode = document.getElementById('reportMessage');
  const runIdNode = document.getElementById('runIdValue');
  const rowsNode = document.getElementById('rowCountValue');
  const totalNode = document.getElementById('totalValue');
  const generateBtn = document.getElementById('generateReportBtn');
  const body = document.body;

  const payroll_group = document.getElementById('payroll_group')?.value || '';
  const payroll_period = document.getElementById('payroll_period')?.value || '';
  const month = document.getElementById('month')?.value || '';
  const year = document.getElementById('year')?.value || '';

  if (!payroll_group || !payroll_period || !month || !year) {
    if (messageNode) messageNode.textContent = 'Please select payroll group, period, month, and year.';
    return;
  }

  try {
    if (messageNode) messageNode.textContent = 'Generating report...';
    if (generateBtn) generateBtn.disabled = true;
    body.classList.add('report-loading');

    const runRes = await fetch(`/api/get_run_id_payroll_journal?payroll_group=${encodeURIComponent(payroll_group)}&payroll_period=${encodeURIComponent(payroll_period)}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`);
    const runData = await parseApiJson(runRes, 'Unable to resolve payroll run.');

    if (!runData.success || !runData.run_id) {
      throw new Error(runData.message || 'No matching payroll run found.');
    }

    const rowsRes = await fetch(`/api/payroll_journal_employees?run_ids=${encodeURIComponent(runData.run_id)}&status=active&orderBy=employeeid`);
    const rowsData = await parseApiJson(rowsRes, 'Unable to load report rows.');

    if (!rowsData.success) {
      throw new Error(rowsData.message || 'Unable to load report rows.');
    }

    const rows = rowsData.employees || [];
    updateSummary(runData.run_id, rows, type);
    renderTable(rows, type);
    if (messageNode) messageNode.textContent = rows.length ? '' : 'No records returned for the selected filters.';
  } catch (error) {
    console.error('Report load error:', error);
    if (messageNode) messageNode.textContent = error.message || 'Unable to generate report.';
    renderTable([], type);
    updateSummary('', [], type);
  } finally {
    if (generateBtn) generateBtn.disabled = false;
    body.classList.remove('report-loading');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const type = getReportType();
  const titleNode = document.getElementById('reportTitle');
  const subtitleNode = document.getElementById('reportSubtitle');
  const tableTitleNode = document.getElementById('tableTitle');
  const columnTitleNode = document.getElementById('valueColumnTitle');

  if (titleNode) titleNode.textContent = getTitle(type);
  if (subtitleNode) subtitleNode.textContent = type === 'gross-pay' ? 'Review total gross earnings for all employees.' : 'Review net earnings after deductions for all employees.';
  if (tableTitleNode) tableTitleNode.textContent = `${getTitle(type)} Rows`;
  if (columnTitleNode) columnTitleNode.textContent = getColumnLabel(type);

  try {
    const meta = await loadReportOptions();
    fillSelect(document.getElementById('payroll_group'), meta.payrollGroups, 'group_id', 'group_name');
    fillSelect(document.getElementById('payroll_period'), meta.payrollPeriods, 'period_id', 'period_name');
    fillSelect(document.getElementById('month'), meta.payrollMonths, 'month_id', 'month_name');
    fillSelect(document.getElementById('year'), meta.payrollYears, 'year_id', 'year_value');
  } catch (error) {
    const messageNode = document.getElementById('reportMessage');
    if (messageNode) messageNode.textContent = error.message || 'Unable to load report setup.';
  }

  document.getElementById('generateReportBtn')?.addEventListener('click', generateReport);
});
