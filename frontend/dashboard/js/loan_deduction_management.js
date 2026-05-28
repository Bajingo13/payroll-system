async function parseLoanJson(res, fallbackMessage) {
  const raw = await res.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(fallbackMessage || 'Invalid server response.');
  }

  if (!res.ok) {
    throw new Error((data && data.message) || fallbackMessage || 'Request failed.');
  }

  return data;
}

function loanMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function setLoanMessage(message, ok = false) {
  const node = document.getElementById('loanMessage');
  if (!node) return;
  node.textContent = message || '';
  node.className = ok ? 'time-message tag-success' : 'time-message tag-warn';
}

function loanStatusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'approved';
  if (normalized === 'closed') return 'completed';
  if (normalized === 'cancelled') return 'rejected';
  return 'pending';
}

let loanRefreshTimer = null;
const LOAN_REFRESH_INTERVAL_MS = 15000;

function stopLoanAutoRefresh() {
  if (!loanRefreshTimer) return;
  clearInterval(loanRefreshTimer);
  loanRefreshTimer = null;
}

function startLoanAutoRefresh() {
  if (loanRefreshTimer) return;

  loanRefreshTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    loadLoanModule().catch((err) => console.error('Loan refresh failed:', err));
  }, LOAN_REFRESH_INTERVAL_MS);
}

async function fetchLoanSummary() {
  const employeeId = document.getElementById('loanEmployeeFilter')?.value.trim();
  const category = document.getElementById('loanCategoryFilter')?.value || '';
  const status = document.getElementById('loanStatusFilter')?.value || '';

  const params = new URLSearchParams();
  if (employeeId) params.set('employee_id', employeeId);
  if (category) params.set('category', category);
  if (status) params.set('status', status);

  const res = await fetch(`/api/loan_deductions/summary?${params.toString()}&_ts=${Date.now()}`, { cache: 'no-store' });
  const data = await parseLoanJson(res, 'Unable to load loan summary.');

  document.getElementById('loanTotalLoans').textContent = String(data.summary?.totalLoans || 0);
  document.getElementById('loanActiveLoans').textContent = String(data.summary?.activeLoans || 0);
  document.getElementById('loanTotalBalance').textContent = loanMoney(data.summary?.totalBalance || 0);
  document.getElementById('loanTotalAmortization').textContent = loanMoney(data.summary?.totalAmortization || 0);
}

async function fetchLoans() {
  const employeeId = document.getElementById('loanEmployeeFilter')?.value.trim();
  const category = document.getElementById('loanCategoryFilter')?.value || '';
  const status = document.getElementById('loanStatusFilter')?.value || '';

  const params = new URLSearchParams();
  if (employeeId) params.set('employee_id', employeeId);
  if (category) params.set('category', category);
  if (status) params.set('status', status);

  const tbody = document.getElementById('loanTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="10">Loading loan records...</td></tr>';

  const res = await fetch(`/api/loan_deductions?${params.toString()}&_ts=${Date.now()}`, { cache: 'no-store' });
  const data = await parseLoanJson(res, 'Unable to load loans.');

  if (!data.loans || data.loans.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10">No loan records found.</td></tr>';
    return false;
  }

  tbody.innerHTML = data.loans.map((loan) => `
    <tr>
      <td>
        <strong>${loan.employee_name || 'Employee'}</strong>
        <small>${loan.emp_code || ''}</small>
      </td>
      <td>${loan.loan_category || ''}</td>
      <td>${loanMoney(loan.principal_amount)}</td>
      <td>${loanMoney(loan.balance_amount)}</td>
      <td>${loanMoney(loan.amortization_amount)}</td>
      <td>${Number(loan.terms_paid || 0)} / ${Number(loan.terms_total || 0)}</td>
      <td>${loanMoney(loan.total_paid)}</td>
      <td>${loan.payment_frequency || ''}</td>
      <td><span class="status ${loanStatusClass(loan.status)}">${loan.status || ''}</span></td>
      <td>
        <button type="button" class="btn loan-pay-btn" data-loan-id="${loan.loan_id}">Apply Payment</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.loan-pay-btn').forEach((button) => {
    button.addEventListener('click', () => applyLoanPayment(button.dataset.loanId));
  });

  return true;
}

async function loadLoanModule() {
  try {
    await fetchLoanSummary();
    const hasLoans = await fetchLoans();

    if (hasLoans) {
      startLoanAutoRefresh();
    } else {
      stopLoanAutoRefresh();
    }
  } catch (err) {
    console.error(err);
    setLoanMessage(err.message || 'Unable to load loan module data.');
  }
}

async function createLoan() {
  try {
    const payload = {
      employee_id: Number(document.getElementById('loanEmployeeId').value),
      loan_category: document.getElementById('loanCategory').value,
      loan_reference: document.getElementById('loanReference').value.trim(),
      principal_amount: Number(document.getElementById('loanPrincipal').value),
      terms_total: Number(document.getElementById('loanTerms').value || 1),
      amortization_amount: Number(document.getElementById('loanAmortization').value || 0),
      payment_frequency: document.getElementById('loanFrequency').value,
      start_date: document.getElementById('loanStartDate').value,
      end_date: document.getElementById('loanEndDate').value,
      notes: document.getElementById('loanNotes').value.trim()
    };

    const res = await fetch('/api/loan_deductions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseLoanJson(res, 'Unable to create loan.');
    setLoanMessage(data.message || 'Loan created successfully.', true);
    await loadLoanModule();
  } catch (err) {
    console.error(err);
    setLoanMessage(err.message || 'Unable to create loan.');
  }
}

async function applyLoanPayment(loanId) {
  try {
    const payrollIdInput = window.prompt('Payroll ID to tag this payment (optional):', '');
    const paymentAmountInput = window.prompt('Payment amount to apply (blank uses amortization amount):', '');

    const payload = {};
    if (payrollIdInput && payrollIdInput.trim()) {
      payload.payroll_id = Number(payrollIdInput.trim());
    }
    if (paymentAmountInput && paymentAmountInput.trim()) {
      payload.payment_amount = Number(paymentAmountInput.trim());
    }

    const res = await fetch(`/api/loan_deductions/${encodeURIComponent(loanId)}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseLoanJson(res, 'Unable to apply payment.');
    setLoanMessage(data.message || 'Loan payment applied successfully.', true);
    await loadLoanModule();
  } catch (err) {
    console.error(err);
    setLoanMessage(err.message || 'Unable to apply payment.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadLoanModule();

  const refreshBtn = document.getElementById('refreshLoanBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadLoanModule);

  const createBtn = document.getElementById('createLoanBtn');
  if (createBtn) createBtn.addEventListener('click', createLoan);

  ['loanEmployeeFilter', 'loanCategoryFilter', 'loanStatusFilter'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('change', loadLoanModule);
  });

  window.addEventListener('beforeunload', stopLoanAutoRefresh);
});