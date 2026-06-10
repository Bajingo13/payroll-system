import { useEffect, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { exportReport } from '../utils/reportExport.js';

const CATEGORY_GROUPS = [
  {
    label: 'Company / Internal',
    options: [
      'Cash Advance',
      'Salary Loan',
      'Emergency Loan',
      'Educational Loan',
      'Medical Loan',
      'Housing Assistance Loan',
      'Equipment / Computer Loan',
      'Company Loan',
    ]
  },
  {
    label: 'SSS',
    options: [
      'SSS Salary Loan',
      'SSS Calamity Loan',
      'SSS Loan',
    ]
  },
  {
    label: 'Pag-IBIG / HDMF',
    options: [
      'Pag-IBIG Multi-Purpose Loan',
      'Pag-IBIG Calamity Loan',
      'Pag-IBIG Housing Loan',
      'Pag-IBIG Loan',
    ]
  }
];
const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.options);
const FREQUENCIES = ['Weekly', 'Monthly', 'First Half', 'Second Half', 'Both'];
const STATUSES = ['Active', 'Paid', 'Closed', 'Cancelled'];

const EMPTY_FORM = {
  employee_id: '',
  loan_category: 'Company Loan',
  loan_reference: '',
  principal_amount: '',
  terms_total: '',
  amortization_amount: '',
  payment_frequency: 'Monthly',
  start_date: '',
  end_date: '',
  status: 'Active',
  notes: ''
};

function money(v) {
  return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusClass(s) {
  if (s === 'Active') return 'status present';
  if (s === 'Paid') return 'status completed';
  if (s === 'Cancelled') return 'status absent';
  return 'status';
}

export default function LoanDeductionPage() {
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('Active');

  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const [paymentsModal, setPaymentsModal] = useState(null);
  const [forceCloseModal, setForceCloseModal] = useState(null);
  const [forceCloseReason, setForceCloseReason] = useState('');
  const [forceClosing, setForceClosing] = useState(false);

  useEffect(() => { loadAll(); }, [filterCategory, filterStatus]);

  useEffect(() => {
    api.get('/employees').then(({ data }) => {
      if (data.success) setEmployees(data.employees || []);
    }).catch(() => {});
  }, []);

  async function loadAll() {
    setLoading(true);
    setMessage('');
    try {
      const params = {};
      if (filterCategory) params.category = filterCategory;
      if (filterStatus) params.status = filterStatus;

      const [loansRes, summaryRes] = await Promise.all([
        api.get('/loan_deductions', { params }),
        api.get('/loan_deductions/summary', { params })
      ]);

      if (loansRes.data.success) setLoans(loansRes.data.loans || []);
      if (summaryRes.data.success) setSummary(summaryRes.data.summary || null);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load loans.'));
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setModal({ mode: 'add', form: { ...EMPTY_FORM } });
    setModalMessage('');
  }

  function openEdit(loan) {
    setModal({
      mode: 'edit',
      loanId: loan.loan_id,
      form: {
        employee_id: loan.employee_id,
        loan_category: loan.loan_category,
        loan_reference: loan.loan_reference || '',
        principal_amount: loan.principal_amount,
        terms_total: loan.terms_total,
        amortization_amount: loan.amortization_amount,
        payment_frequency: loan.payment_frequency,
        start_date: loan.start_date ? String(loan.start_date).slice(0, 10) : '',
        end_date: loan.end_date ? String(loan.end_date).slice(0, 10) : '',
        status: loan.status,
        notes: loan.notes || ''
      }
    });
    setModalMessage('');
  }

  async function openPayments(loan) {
    try {
      const { data } = await api.get(`/loan_deductions/${loan.loan_id}/payments`);
      setPaymentsModal({ loan, payments: data.success ? data.payments : [] });
    } catch {
      setPaymentsModal({ loan, payments: [] });
    }
  }

  function updateForm(field, value) {
    setModal((prev) => ({ ...prev, form: { ...prev.form, [field]: value } }));
  }

  async function saveModal() {
    const { mode, loanId, form } = modal;
    setModalMessage('');

    if (!form.employee_id && mode === 'add') return setModalMessage('Select an employee.');
    if (!form.principal_amount || Number(form.principal_amount) <= 0) return setModalMessage('Enter a valid principal amount.');
    if (!form.start_date) return setModalMessage('Start date is required.');

    setSaving(true);
    try {
      if (mode === 'add') {
        await api.post('/loan_deductions', form);
      } else {
        await api.patch(`/loan_deductions/${loanId}`, form);
      }
      setModal(null);
      loadAll();
    } catch (err) {
      setModalMessage(getApiMessage(err, 'Unable to save loan.'));
    } finally {
      setSaving(false);
    }
  }

  function openForceClose(loan) {
    setForceCloseModal({ loan });
    setForceCloseReason('');
  }

  async function confirmForceClose() {
    setForceClosing(true);
    try {
      await api.post(`/loan_deductions/${forceCloseModal.loan.loan_id}/force-close`, { notes: forceCloseReason });
      setForceCloseModal(null);
      loadAll();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to force close loan.'));
      setForceCloseModal(null);
    } finally {
      setForceClosing(false);
    }
  }

  async function cancelLoan(loan) {
    if (!window.confirm(`Cancel loan for ${loan.employee_name}? This cannot be undone.`)) return;
    try {
      await api.patch(`/loan_deductions/${loan.loan_id}`, { status: 'Cancelled' });
      loadAll();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to cancel loan.'));
    }
  }

  const exportRows = () => loans.map((l) => [
    l.emp_code, l.employee_name, l.loan_category, l.loan_reference || '-',
    money(l.principal_amount), money(l.balance_amount), money(l.amortization_amount),
    `${l.terms_paid}/${l.terms_total}`, l.payment_frequency, l.status
  ]);
  const EXPORT_HEADERS = ['Code', 'Employee', 'Category', 'Reference', 'Principal', 'Balance', 'Amortization', 'Terms', 'Frequency', 'Status'];
  const EXPORT_TITLE = `Loan Deductions${filterStatus ? ` — ${filterStatus}` : ''}`;

  return (
    <>
      <header className="header">
        <h2>Loan Deduction Management</h2>
        <p>Track and manage employee loans — company, SSS, and Pag-IBIG.</p>
      </header>

      <section className="summary react-summary">
        <div className="card"><span>Total Loans</span><strong>{summary?.totalLoans ?? 0}</strong></div>
        <div className="card"><span>Active Loans</span><strong>{summary?.activeLoans ?? 0}</strong></div>
        <div className="card"><span>Total Balance</span><strong>PHP {money(summary?.totalBalance)}</strong></div>
        <div className="card"><span>Total Amortization</span><strong>PHP {money(summary?.totalAmortization)}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">All Categories</option>
              {CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="btn secondary" onClick={loadAll} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <div className="toolbar">
            <button type="button" className="btn secondary" onClick={() => exportReport('csv', 'loan-deductions', EXPORT_TITLE, EXPORT_HEADERS, exportRows())} disabled={!loans.length}>CSV</button>
            <button type="button" className="btn secondary" onClick={() => exportReport('txt', 'loan-deductions', EXPORT_TITLE, EXPORT_HEADERS, exportRows())} disabled={!loans.length}>TXT</button>
            <button type="button" className="btn secondary" onClick={() => exportReport('pdf', 'loan-deductions', EXPORT_TITLE, EXPORT_HEADERS, exportRows())} disabled={!loans.length}>PDF</button>
            <button type="button" className="btn" onClick={openAdd}>+ Add Loan</button>
          </div>
        </div>

        {message ? <p className="message">{message}</p> : null}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Category</th>
                <th>Reference</th>
                <th style={{ textAlign: 'right' }}>Principal</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th style={{ textAlign: 'right' }}>Amortization</th>
                <th>Terms</th>
                <th>Frequency</th>
                <th>Start Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 && !loading ? (
                <tr><td colSpan={12}>{message || 'No loan records found.'}</td></tr>
              ) : null}
              {loans.map((l) => (
                <tr key={l.loan_id}>
                  <td>{l.emp_code}</td>
                  <td>{l.employee_name}</td>
                  <td>{l.loan_category}</td>
                  <td>{l.loan_reference || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{money(l.principal_amount)}</td>
                  <td style={{ textAlign: 'right' }}><strong>{money(l.balance_amount)}</strong></td>
                  <td style={{ textAlign: 'right' }}>{money(l.amortization_amount)}</td>
                  <td>{l.terms_paid}/{l.terms_total}</td>
                  <td>{l.payment_frequency}</td>
                  <td>{l.start_date ? String(l.start_date).slice(0, 10) : '—'}</td>
                  <td><span className={statusClass(l.status)}>{l.status}</span></td>
                  <td>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, minWidth: 136 }}>
                      <button type="button" className="btn secondary" style={{ padding: '4px 0', fontSize: 11, borderRadius: 6, boxShadow: 'none', textAlign: 'center' }} onClick={() => openEdit(l)}>Edit</button>
                      <button type="button" className="btn secondary" style={{ padding: '4px 0', fontSize: 11, borderRadius: 6, boxShadow: 'none', textAlign: 'center' }} onClick={() => openPayments(l)}>History</button>
                      {l.status === 'Active' ? (
                        <>
                          <button type="button" className="btn" style={{ padding: '4px 0', fontSize: 11, borderRadius: 6, boxShadow: 'none', background: '#d97706', textAlign: 'center' }} onClick={() => openForceClose(l)}>Force Close</button>
                          <button type="button" className="btn danger" style={{ padding: '4px 0', fontSize: 11, borderRadius: 6, boxShadow: 'none', textAlign: 'center' }} onClick={() => cancelLoan(l)}>Cancel</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modal ? (
        <LoanModal
          mode={modal.mode}
          form={modal.form}
          employees={employees}
          message={modalMessage}
          saving={saving}
          onChange={updateForm}
          onSave={saveModal}
          onClose={() => setModal(null)}
        />
      ) : null}

      {paymentsModal ? (
        <PaymentHistoryModal
          loan={paymentsModal.loan}
          payments={paymentsModal.payments}
          onClose={() => setPaymentsModal(null)}
        />
      ) : null}

      {forceCloseModal ? (
        <ForceCloseModal
          loan={forceCloseModal.loan}
          reason={forceCloseReason}
          onReasonChange={setForceCloseReason}
          saving={forceClosing}
          onConfirm={confirmForceClose}
          onClose={() => setForceCloseModal(null)}
        />
      ) : null}
    </>
  );
}

function LoanModal({ mode, form, employees, message, saving, onChange, onSave, onClose }) {
  const principal = Number(form.principal_amount || 0);
  const terms = Math.max(1, Number(form.terms_total || 1));
  const autoAmort = principal > 0 ? (principal / terms).toFixed(2) : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'add' ? 'Add Loan' : 'Edit Loan'}</h3>
          <button type="button" className="btn secondary" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>

          {mode === 'add' ? (
            <label style={{ gridColumn: '1 / -1' }}>
              Employee
              <select value={form.employee_id} onChange={(e) => onChange('employee_id', e.target.value)}>
                <option value="">— Select Employee —</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.emp_code} — {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            Category
            <select value={form.loan_category} onChange={(e) => onChange('loan_category', e.target.value)}>
              {CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          <label>
            Reference / Loan No. <span className="muted">(optional)</span>
            <input type="text" value={form.loan_reference} onChange={(e) => onChange('loan_reference', e.target.value)} placeholder="e.g. SSS-2026-001" />
          </label>

          <label>
            Principal Amount
            <input type="number" min="0" step="0.01" value={form.principal_amount} onChange={(e) => onChange('principal_amount', e.target.value)} />
          </label>

          <label>
            Terms (no. of payments)
            <input type="number" min="1" step="1" value={form.terms_total} onChange={(e) => onChange('terms_total', e.target.value)} />
          </label>

          <label>
            Amortization per Period
            <input type="number" min="0" step="0.01" value={form.amortization_amount} onChange={(e) => onChange('amortization_amount', e.target.value)} placeholder={autoAmort || 'Auto-computed'} />
          </label>

          <label>
            Payment Frequency
            <select value={form.payment_frequency} onChange={(e) => onChange('payment_frequency', e.target.value)}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>

          <label>
            Start Date
            <input type="date" value={form.start_date} onChange={(e) => onChange('start_date', e.target.value)} />
          </label>

          <label>
            End Date <span className="muted">(optional)</span>
            <input type="date" value={form.end_date} onChange={(e) => onChange('end_date', e.target.value)} />
          </label>

          {mode === 'edit' ? (
            <label>
              Status
              <select value={form.status} onChange={(e) => onChange('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          ) : null}

          <label style={{ gridColumn: '1 / -1' }}>
            Notes <span className="muted">(optional)</span>
            <textarea rows={2} value={form.notes} onChange={(e) => onChange('notes', e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
          </label>

          {message ? <p className="message" style={{ gridColumn: '1 / -1', margin: 0 }}>{message}</p> : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function ForceCloseModal({ loan, reason, onReasonChange, saving, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Force Close Loan</h3>
          <button type="button" className="btn secondary" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0 }}>
            Force closing the <strong>{loan.loan_category}</strong> loan for <strong>{loan.employee_name}</strong>.
          </p>
          <p style={{ margin: 0, color: '#b45309', fontSize: '0.9rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px' }}>
            The remaining balance of <strong>PHP {money(loan.balance_amount)}</strong> will be written off. This action cannot be undone.
          </p>
          <label>
            Reason <span className="muted">(optional)</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g. Employee resigned, management-approved write-off..."
              style={{ width: '100%', resize: 'vertical' }}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn" style={{ background: '#b45309', borderColor: '#b45309' }} onClick={onConfirm} disabled={saving}>
            {saving ? 'Closing...' : 'Force Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentHistoryModal({ loan, payments, onClose }) {
  const exportRows = payments.map((p) => [
    p.payment_id,
    p.paid_period || '—',
    money(p.payment_amount),
    money(p.balance_before),
    money(p.balance_after),
    p.notes || '—',
    p.created_at ? String(p.created_at).slice(0, 10) : '—'
  ]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Payment History</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {loan.employee_name} — {loan.loan_category}{loan.loan_reference ? ` (${loan.loan_reference})` : ''}
            </p>
          </div>
          <button type="button" className="btn secondary" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
            <span className="muted" style={{ fontSize: 12 }}>Principal: <strong>PHP {money(loan.principal_amount)}</strong></span>
            <span className="muted" style={{ fontSize: 12, marginLeft: 12 }}>Balance: <strong>PHP {money(loan.balance_amount)}</strong></span>
            <span className="muted" style={{ fontSize: 12, marginLeft: 12 }}>Terms: <strong>{loan.terms_paid}/{loan.terms_total}</strong></span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '2px 8px' }}
                onClick={() => exportReport('csv', `loan-payments-${loan.loan_id}`, `Loan Payments — ${loan.employee_name}`,
                  ['#', 'Period', 'Amount', 'Balance Before', 'Balance After', 'Notes', 'Date'], exportRows)}
                disabled={!payments.length}>CSV</button>
              <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '2px 8px' }}
                onClick={() => exportReport('pdf', `loan-payments-${loan.loan_id}`, `Loan Payments — ${loan.employee_name}`,
                  ['#', 'Period', 'Amount', 'Balance Before', 'Balance After', 'Notes', 'Date'], exportRows)}
                disabled={!payments.length}>PDF</button>
            </div>
          </div>
          <div className="table-scroll" style={{ maxHeight: 360 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Period</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Balance Before</th>
                  <th style={{ textAlign: 'right' }}>Balance After</th>
                  <th>Notes</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={7}>No payment records found.</td></tr>
                ) : null}
                {payments.map((p, i) => (
                  <tr key={p.payment_id}>
                    <td>{payments.length - i}</td>
                    <td>{p.paid_period || '—'}</td>
                    <td style={{ textAlign: 'right' }}><strong>{money(p.payment_amount)}</strong></td>
                    <td style={{ textAlign: 'right' }}>{money(p.balance_before)}</td>
                    <td style={{ textAlign: 'right' }}>{money(p.balance_after)}</td>
                    <td>{p.notes || '—'}</td>
                    <td>{p.created_at ? String(p.created_at).slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
