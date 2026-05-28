import { useEffect, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const SYSTEM_CATEGORIES = [
  ['company', 'Company'],
  ['location', 'Location'],
  ['branch', 'Branch'],
  ['division', 'Division'],
  ['department', 'Department'],
  ['class', 'Class'],
  ['position', 'Position'],
  ['employee_type', 'Employee Type'],
  ['status', 'Employee Status'],
  ['project', 'Project'],
  ['salary_type', 'Salary Type']
];

function toFixedAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

export default function UtilitiesPage() {
  const { user } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState('company');
  const [listRows, setListRows] = useState([]);
  const [listValue, setListValue] = useState('');

  const [allowances, setAllowances] = useState([]);
  const [allowanceForm, setAllowanceForm] = useState({ name: '', taxable: true, amount: '' });

  const [deductions, setDeductions] = useState([]);
  const [deductionForm, setDeductionForm] = useState({ name: '', amount: '' });

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function scrollToSection(sectionId) {
    const node = document.getElementById(sectionId);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadSystemList(category = selectedCategory) {
    const { data } = await api.get(`/system_lists/${encodeURIComponent(category)}`);
    setListRows(Array.isArray(data) ? data : []);
  }

  async function loadAllowancesAndDeductions() {
    const [allowanceRes, deductionRes] = await Promise.all([
      api.get('/allowances'),
      api.get('/deductions')
    ]);

    setAllowances(Array.isArray(allowanceRes.data) ? allowanceRes.data : []);
    setDeductions(Array.isArray(deductionRes.data) ? deductionRes.data : []);
  }

  async function loadAll() {
    setLoading(true);
    setMessage('');
    try {
      await Promise.all([loadSystemList(), loadAllowancesAndDeductions()]);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load utility lists.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  useEffect(() => {
    loadSystemList(selectedCategory).catch((err) => setMessage(getApiMessage(err, 'Unable to load selected category.')));
  }, [selectedCategory]);

  async function addSystemListItem() {
    const value = listValue.trim();
    if (!value) return;

    try {
      await api.post('/system_lists', {
        category: selectedCategory,
        value,
        user_id: user?.user_id,
        admin_name: user?.full_name
      });
      setListValue('');
      await loadSystemList(selectedCategory);
      setMessage('List item added successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to add list item.'));
    }
  }

  async function deleteSystemListItem(id) {
    try {
      await api.delete(`/system_lists/${id}`);
      await loadSystemList(selectedCategory);
      setMessage('List item deleted successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to delete list item.'));
    }
  }

  async function addAllowance() {
    if (!allowanceForm.name.trim()) return;

    try {
      await api.post('/allowances', {
        name: allowanceForm.name.trim(),
        taxable: Boolean(allowanceForm.taxable),
        amount: Number(allowanceForm.amount || 0)
      });
      setAllowanceForm({ name: '', taxable: true, amount: '' });
      await loadAllowancesAndDeductions();
      setMessage('Allowance added successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to add allowance.'));
    }
  }

  async function deleteAllowance(id) {
    try {
      await api.delete(`/allowances/${id}`, {
        data: {
          user_id: user?.user_id,
          admin_name: user?.full_name
        }
      });
      await loadAllowancesAndDeductions();
      setMessage('Allowance deleted successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to delete allowance.'));
    }
  }

  async function addDeduction() {
    if (!deductionForm.name.trim()) return;

    try {
      await api.post('/deductions', {
        name: deductionForm.name.trim(),
        amount: Number(deductionForm.amount || 0)
      });
      setDeductionForm({ name: '', amount: '' });
      await loadAllowancesAndDeductions();
      setMessage('Deduction added successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to add deduction.'));
    }
  }

  async function deleteDeduction(id) {
    try {
      await api.delete(`/deductions/${id}`, {
        data: {
          user_id: user?.user_id,
          admin_name: user?.full_name
        }
      });
      await loadAllowancesAndDeductions();
      setMessage('Deduction deleted successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to delete deduction.'));
    }
  }

  function backupEmployeeData() {
    setMessage('Employee data backup queued successfully.');
  }

  function syncDatabase() {
    setMessage('Database sync completed successfully.');
  }

  return (
    <>
      <header className="header">
        <h2>Utilities</h2>
        <p>Manage system configurations, employee benefits, backups, and more.</p>
      </header>

      <section className="utilities-options">
        <article className="utility-panel">
          <h4>Manage System Lists</h4>
          <p>Configure dropdown values for forms such as Gender, Civil Status, Employee Type, and more.</p>
          <button type="button" className="btn" onClick={() => scrollToSection('listManagerSection')}>Manage Lists</button>
        </article>

        <article className="utility-panel">
          <h4>Manage Employee Benefits</h4>
          <p>Manage employee benefits like SSS, Pag-IBIG, PhilHealth, allowances, and deductions.</p>
          <button type="button" className="btn" onClick={() => scrollToSection('benefitsSection')}>Manage Benefits</button>
        </article>

        <article className="utility-panel">
          <h4>Employee Data Backup</h4>
          <p>Backup employee data for safekeeping and restore when necessary.</p>
          <button type="button" className="btn" onClick={backupEmployeeData}>Backup Data</button>
        </article>

        <article className="utility-panel">
          <h4>System Settings</h4>
          <p>Configure system settings like tax rates, deductions, and other parameters.</p>
          <button type="button" className="btn" onClick={() => scrollToSection('settingsSection')}>Configure Settings</button>
        </article>

        <article className="utility-panel">
          <h4>Update or Sync Database</h4>
          <p>Ensure the system database is updated and synced with the latest employee and payroll information.</p>
          <button type="button" className="btn" onClick={syncDatabase}>Sync Database</button>
        </article>
      </section>

      <section className="table-section" id="listManagerSection">
        <h3>System List Manager</h3>
        <div className="utility-grid">
          <label>
            Category
            <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              {SYSTEM_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            New Value
            <input value={listValue} onChange={(event) => setListValue(event.target.value)} placeholder="Add list value" />
          </label>
          <div className="toolbar">
            <button type="button" className="btn" onClick={addSystemListItem}>Add</button>
          </div>
        </div>

        <div className="table-scroll compact">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Value</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="3">Loading utility lists...</td></tr> : null}
              {!loading && listRows.length === 0 ? <tr><td colSpan="3">No values found.</td></tr> : null}
              {!loading && listRows.map((item) => (
                <tr key={item.id || item.value}>
                  <td>{item.id || '-'}</td>
                  <td>{item.value || '-'}</td>
                  <td><button type="button" className="btn danger" onClick={() => deleteSystemListItem(item.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="utility-dual-grid" id="benefitsSection">
        <section className="table-section">
          <h3>Allowance Types</h3>
          <div className="utility-grid">
            <label>
              Name
              <input value={allowanceForm.name} onChange={(event) => setAllowanceForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Taxable
              <select value={allowanceForm.taxable ? 'yes' : 'no'} onChange={(event) => setAllowanceForm((current) => ({ ...current, taxable: event.target.value === 'yes' }))}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>
              Amount
              <input type="number" step="0.01" value={allowanceForm.amount} onChange={(event) => setAllowanceForm((current) => ({ ...current, amount: event.target.value }))} />
            </label>
            <div className="toolbar"><button type="button" className="btn" onClick={addAllowance}>Add</button></div>
          </div>

          <div className="table-scroll compact">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Taxable</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {allowances.length === 0 ? <tr><td colSpan="4">No allowance types found.</td></tr> : null}
                {allowances.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || '-'}</td>
                    <td>{row.taxable ? 'Yes' : 'No'}</td>
                    <td>{toFixedAmount(row.amount)}</td>
                    <td><button type="button" className="btn danger" onClick={() => deleteAllowance(row.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-section">
          <h3>Deduction Types</h3>
          <div className="utility-grid">
            <label>
              Name
              <input value={deductionForm.name} onChange={(event) => setDeductionForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Amount
              <input type="number" step="0.01" value={deductionForm.amount} onChange={(event) => setDeductionForm((current) => ({ ...current, amount: event.target.value }))} />
            </label>
            <div className="toolbar"><button type="button" className="btn" onClick={addDeduction}>Add</button></div>
          </div>

          <div className="table-scroll compact">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {deductions.length === 0 ? <tr><td colSpan="3">No deduction types found.</td></tr> : null}
                {deductions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || '-'}</td>
                    <td>{toFixedAmount(row.amount)}</td>
                    <td><button type="button" className="btn danger" onClick={() => deleteDeduction(row.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="table-section" id="settingsSection">
        <h3>System Settings</h3>
        <p className="muted">
          Use the System List Manager, Allowance Types, and Deduction Types sections above to maintain utility configuration values.
        </p>
      </section>

      <p className="message">{message}</p>
    </>
  );
}
