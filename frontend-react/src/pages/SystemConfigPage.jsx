import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { api } from '../api/client.js';

const TABS = [
  { key: 'company', label: 'Company Settings' },
  { key: 'tax', label: 'Tax Tables' },
  { key: 'contributions', label: 'Contribution Tables' }
];

const CONTRIB_TABS = [
  { key: 'sss', label: 'SSS' },
  { key: 'philhealth', label: 'PhilHealth' },
  { key: 'pagibig', label: 'Pag-IBIG' }
];

function money(v) {
  return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v) {
  return (Number(v || 0) * 100).toFixed(2);
}

// ── Philippine default data (used by "Load Defaults" buttons) ─────────────────

const DEFAULT_BIR = [
  { income_from: '0',       income_to: '20833',   base_tax: '0',         tax_rate: '0',   excess_over: '0' },
  { income_from: '20833.01',income_to: '33332',   base_tax: '0',         tax_rate: '15',  excess_over: '20833' },
  { income_from: '33333',   income_to: '66666',   base_tax: '1875',      tax_rate: '20',  excess_over: '33333' },
  { income_from: '66667',   income_to: '166666',  base_tax: '8541.80',   tax_rate: '25',  excess_over: '66667' },
  { income_from: '166667',  income_to: '666666',  base_tax: '33541.80',  tax_rate: '30',  excess_over: '166667' },
  { income_from: '666667',  income_to: '',        base_tax: '183541.80', tax_rate: '35',  excess_over: '666667' }
];

const DEFAULT_SSS = [
  { salary_from:'0',     salary_to:'3249.99',  employee_value:'135',    employer_value:'285',    label:'MSC 3,000' },
  { salary_from:'3250',  salary_to:'3749.99',  employee_value:'157.50', employer_value:'332.50', label:'MSC 3,500' },
  { salary_from:'3750',  salary_to:'4249.99',  employee_value:'180',    employer_value:'380',    label:'MSC 4,000' },
  { salary_from:'4250',  salary_to:'4749.99',  employee_value:'202.50', employer_value:'427.50', label:'MSC 4,500' },
  { salary_from:'4750',  salary_to:'5249.99',  employee_value:'225',    employer_value:'475',    label:'MSC 5,000' },
  { salary_from:'5250',  salary_to:'5749.99',  employee_value:'247.50', employer_value:'522.50', label:'MSC 5,500' },
  { salary_from:'5750',  salary_to:'6249.99',  employee_value:'270',    employer_value:'570',    label:'MSC 6,000' },
  { salary_from:'6250',  salary_to:'6749.99',  employee_value:'292.50', employer_value:'617.50', label:'MSC 6,500' },
  { salary_from:'6750',  salary_to:'7249.99',  employee_value:'315',    employer_value:'665',    label:'MSC 7,000' },
  { salary_from:'7250',  salary_to:'7749.99',  employee_value:'337.50', employer_value:'712.50', label:'MSC 7,500' },
  { salary_from:'7750',  salary_to:'8249.99',  employee_value:'360',    employer_value:'760',    label:'MSC 8,000' },
  { salary_from:'8250',  salary_to:'8749.99',  employee_value:'382.50', employer_value:'807.50', label:'MSC 8,500' },
  { salary_from:'8750',  salary_to:'9249.99',  employee_value:'405',    employer_value:'855',    label:'MSC 9,000' },
  { salary_from:'9250',  salary_to:'9749.99',  employee_value:'427.50', employer_value:'902.50', label:'MSC 9,500' },
  { salary_from:'9750',  salary_to:'10249.99', employee_value:'450',    employer_value:'950',    label:'MSC 10,000' },
  { salary_from:'10250', salary_to:'10749.99', employee_value:'472.50', employer_value:'997.50', label:'MSC 10,500' },
  { salary_from:'10750', salary_to:'11249.99', employee_value:'495',    employer_value:'1045',   label:'MSC 11,000' },
  { salary_from:'11250', salary_to:'11749.99', employee_value:'517.50', employer_value:'1092.50',label:'MSC 11,500' },
  { salary_from:'11750', salary_to:'12249.99', employee_value:'540',    employer_value:'1140',   label:'MSC 12,000' },
  { salary_from:'12250', salary_to:'12749.99', employee_value:'562.50', employer_value:'1187.50',label:'MSC 12,500' },
  { salary_from:'12750', salary_to:'13249.99', employee_value:'585',    employer_value:'1235',   label:'MSC 13,000' },
  { salary_from:'13250', salary_to:'13749.99', employee_value:'607.50', employer_value:'1282.50',label:'MSC 13,500' },
  { salary_from:'13750', salary_to:'14249.99', employee_value:'630',    employer_value:'1330',   label:'MSC 14,000' },
  { salary_from:'14250', salary_to:'14749.99', employee_value:'652.50', employer_value:'1377.50',label:'MSC 14,500' },
  { salary_from:'14750', salary_to:'15249.99', employee_value:'675',    employer_value:'1425',   label:'MSC 15,000' },
  { salary_from:'15250', salary_to:'15749.99', employee_value:'697.50', employer_value:'1472.50',label:'MSC 15,500' },
  { salary_from:'15750', salary_to:'16249.99', employee_value:'720',    employer_value:'1520',   label:'MSC 16,000' },
  { salary_from:'16250', salary_to:'16749.99', employee_value:'742.50', employer_value:'1567.50',label:'MSC 16,500' },
  { salary_from:'16750', salary_to:'17249.99', employee_value:'765',    employer_value:'1615',   label:'MSC 17,000' },
  { salary_from:'17250', salary_to:'17749.99', employee_value:'787.50', employer_value:'1662.50',label:'MSC 17,500' },
  { salary_from:'17750', salary_to:'18249.99', employee_value:'810',    employer_value:'1710',   label:'MSC 18,000' },
  { salary_from:'18250', salary_to:'18749.99', employee_value:'832.50', employer_value:'1757.50',label:'MSC 18,500' },
  { salary_from:'18750', salary_to:'19249.99', employee_value:'855',    employer_value:'1805',   label:'MSC 19,000' },
  { salary_from:'19250', salary_to:'19749.99', employee_value:'877.50', employer_value:'1852.50',label:'MSC 19,500' },
  { salary_from:'19750', salary_to:'20249.99', employee_value:'900',    employer_value:'1900',   label:'MSC 20,000' },
  { salary_from:'20250', salary_to:'20749.99', employee_value:'922.50', employer_value:'1947.50',label:'MSC 20,500' },
  { salary_from:'20750', salary_to:'21249.99', employee_value:'945',    employer_value:'1995',   label:'MSC 21,000' },
  { salary_from:'21250', salary_to:'21749.99', employee_value:'967.50', employer_value:'2042.50',label:'MSC 21,500' },
  { salary_from:'21750', salary_to:'22249.99', employee_value:'990',    employer_value:'2090',   label:'MSC 22,000' },
  { salary_from:'22250', salary_to:'22749.99', employee_value:'1012.50',employer_value:'2137.50',label:'MSC 22,500' },
  { salary_from:'22750', salary_to:'23249.99', employee_value:'1035',   employer_value:'2185',   label:'MSC 23,000' },
  { salary_from:'23250', salary_to:'23749.99', employee_value:'1057.50',employer_value:'2232.50',label:'MSC 23,500' },
  { salary_from:'23750', salary_to:'24249.99', employee_value:'1080',   employer_value:'2280',   label:'MSC 24,000' },
  { salary_from:'24250', salary_to:'24749.99', employee_value:'1102.50',employer_value:'2327.50',label:'MSC 24,500' },
  { salary_from:'24750', salary_to:'25249.99', employee_value:'1125',   employer_value:'2375',   label:'MSC 25,000' },
  { salary_from:'25250', salary_to:'25749.99', employee_value:'1147.50',employer_value:'2422.50',label:'MSC 25,500' },
  { salary_from:'25750', salary_to:'26249.99', employee_value:'1170',   employer_value:'2470',   label:'MSC 26,000' },
  { salary_from:'26250', salary_to:'26749.99', employee_value:'1192.50',employer_value:'2517.50',label:'MSC 26,500' },
  { salary_from:'26750', salary_to:'27249.99', employee_value:'1215',   employer_value:'2565',   label:'MSC 27,000' },
  { salary_from:'27250', salary_to:'27749.99', employee_value:'1237.50',employer_value:'2612.50',label:'MSC 27,500' },
  { salary_from:'27750', salary_to:'28249.99', employee_value:'1260',   employer_value:'2660',   label:'MSC 28,000' },
  { salary_from:'28250', salary_to:'28749.99', employee_value:'1282.50',employer_value:'2707.50',label:'MSC 28,500' },
  { salary_from:'28750', salary_to:'29249.99', employee_value:'1305',   employer_value:'2755',   label:'MSC 29,000' },
  { salary_from:'29250', salary_to:'29749.99', employee_value:'1327.50',employer_value:'2802.50',label:'MSC 29,500' },
  { salary_from:'29750', salary_to:'',         employee_value:'1350',   employer_value:'2850',   label:'MSC 30,000 (Max)' }
];

const DEFAULT_PHILHEALTH = [
  { salary_from:'0',      salary_to:'10000',    employee_value:'2.5', employer_value:'2.5', label:'Min contribution PHP 500' },
  { salary_from:'10000.01',salary_to:'99999.99',employee_value:'2.5', employer_value:'2.5', label:'2.5% EE / 2.5% ER' },
  { salary_from:'100000', salary_to:'',         employee_value:'2.5', employer_value:'2.5', label:'Max contribution PHP 5,000' }
];

const DEFAULT_PAGIBIG = [
  { salary_from:'0',      salary_to:'1500',  employee_value:'1', employer_value:'2', label:'1% EE / 2% ER' },
  { salary_from:'1500.01',salary_to:'',      employee_value:'2', employer_value:'2', label:'2% EE / 2% ER (max PHP 100 each)' }
];

const CONTRIB_DEFAULTS = { sss: DEFAULT_SSS, philhealth: DEFAULT_PHILHEALTH, pagibig: DEFAULT_PAGIBIG };

export default function SystemConfigPage() {
  const [tab, setTab] = useState('company');

  return (
    <>
      <header className="header">
        <h2>System Configuration</h2>
        <p>Manage company profile, BIR tax rate tables, and government contribution schedules.</p>
      </header>

      <div className="report-filter-grid" style={{ marginBottom: '1.25rem' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn${tab === t.key ? '' : ' btn-outline'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && <CompanySettings />}
      {tab === 'tax' && <TaxTables />}
      {tab === 'contributions' && <ContributionTables />}
    </>
  );
}

// ── Company Settings ──────────────────────────────────────────────────────────

function CompanySettings() {
  const [form, setForm] = useState({
    company_name: '', address: '', tin: '', email: '', phone: '', logo_url: '', hr_policy: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/company_settings')
      .then(({ data }) => {
        if (data.data) setForm((prev) => ({ ...prev, ...data.data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/company_settings', form);
      if (data.success) {
        toast.success('Company settings saved.');
        // Cache company name so reports pick it up immediately
        if (data.data?.company_name) {
          localStorage.setItem('sys_company_name', data.data.company_name);
          window.dispatchEvent(new CustomEvent('company-settings-updated', { detail: data.data }));
        }
      } else {
        toast.error(data.message || 'Failed to save settings.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="empty-state">Loading...</p>;

  return (
    <section className="table-section">
      <h3>Company Profile</h3>
      <form onSubmit={handleSave}>
        <div className="report-filter-grid">
          <label style={{ gridColumn: 'span 2' }}>
            Company Name *
            <input
              required
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
              placeholder="e.g. Astreablue Intelligence Inc."
            />
          </label>

          <label style={{ gridColumn: 'span 2' }}>
            Address
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Full company address"
            />
          </label>

          <label>
            TIN
            <input
              value={form.tin}
              onChange={(e) => set('tin', e.target.value)}
              placeholder="000-000-000-000"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="hr@company.com"
            />
          </label>

          <label>
            Phone
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+63 2 8xxx xxxx"
            />
          </label>

          <label>
            Logo URL
            <input
              value={form.logo_url}
              onChange={(e) => set('logo_url', e.target.value)}
              placeholder="https://..."
            />
          </label>

          <label style={{ gridColumn: 'span 2' }}>
            HR Policy / Notes
            <textarea
              rows={4}
              value={form.hr_policy}
              onChange={(e) => set('hr_policy', e.target.value)}
              placeholder="Company policies, working hours, leave rules, etc."
              style={{ width: '100%', resize: 'vertical', padding: '0.4rem 0.6rem' }}
            />
          </label>

          <div className="toolbar">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}


// ── BIR Tax Brackets ──────────────────────────────────────────────────────────

const EMPTY_BRACKET = { income_from: '', income_to: '', base_tax: '0', tax_rate: '0', excess_over: '' };

function TaxTables() {
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/tax_brackets')
      .then(({ data }) => {
        if (data.data && data.data.length > 0) {
          setBrackets(data.data.map(rowToForm));
        } else {
          setBrackets(DEFAULT_BIR.map((b) => ({ ...b, _key: Math.random() })));
        }
      })
      .catch(() => {
        toast.error('Could not load tax brackets from server. Showing defaults.');
        setBrackets(DEFAULT_BIR.map((b) => ({ ...b, _key: Math.random() })));
      })
      .finally(() => setLoading(false));
  }, []);

  function rowToForm(r) {
    return {
      _key: r.id ?? Math.random(),
      income_from: String(r.income_from ?? ''),
      income_to: r.income_to != null ? String(r.income_to) : '',
      base_tax: String(r.base_tax ?? '0'),
      tax_rate: String(Number(r.tax_rate || 0) * 100),
      excess_over: String(r.excess_over ?? '0')
    };
  }

  function updateRow(index, field, value) {
    setBrackets((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setBrackets((prev) => [...prev, { ...EMPTY_BRACKET, _key: Math.random() }]);
  }

  function removeRow(index) {
    setBrackets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const payload = brackets.map((b) => ({
      income_from: Number(b.income_from) || 0,
      income_to: b.income_to.trim() === '' ? null : Number(b.income_to),
      base_tax: Number(b.base_tax) || 0,
      tax_rate: (Number(b.tax_rate) || 0) / 100,
      excess_over: Number(b.excess_over) || 0
    }));
    setSaving(true);
    try {
      const { data } = await api.put('/tax_brackets', { brackets: payload });
      if (data.success) {
        toast.success('Tax brackets saved.');
        setBrackets(data.data.map(rowToForm));
      } else {
        toast.error(data.message || 'Failed to save.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="empty-state">Loading...</p>;

  return (
    <section className="table-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>BIR Withholding Tax Brackets (Monthly)</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setBrackets(DEFAULT_BIR.map((b) => ({ ...b, _key: Math.random() })));
              toast.info('TRAIN Act defaults loaded. Click Save to apply.');
            }}
          >
            Load Defaults
          </button>
          <button type="button" className="btn btn-outline" onClick={addRow}>+ Add Row</button>
          <button type="button" className="btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Brackets'}
          </button>
        </div>
      </div>

      <p style={{ fontSize: '0.82rem', color: 'var(--muted, #6b7280)', marginBottom: '0.75rem' }}>
        TRAIN Act rates. Tax rate is entered as a percentage (e.g., 15 for 15%). Leave &quot;To&quot; blank for the last bracket (no upper limit).
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: '750px' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Income From (PHP)</th>
              <th>Income To (PHP)</th>
              <th>Base Tax (PHP)</th>
              <th>Tax Rate (%)</th>
              <th>Excess Over (PHP)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {brackets.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted,#6b7280)' }}>No brackets. Click &quot;+ Add Row&quot; to begin.</td></tr>
            ) : brackets.map((b, i) => (
              <tr key={b._key}>
                <td style={{ color: 'var(--muted,#6b7280)' }}>{i + 1}</td>
                <td><input type="number" value={b.income_from} onChange={(e) => updateRow(i, 'income_from', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" value={b.income_to} onChange={(e) => updateRow(i, 'income_to', e.target.value)} placeholder="(no limit)" style={{ width: '100%' }} /></td>
                <td><input type="number" value={b.base_tax} onChange={(e) => updateRow(i, 'base_tax', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" step="0.01" value={b.tax_rate} onChange={(e) => updateRow(i, 'tax_rate', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" value={b.excess_over} onChange={(e) => updateRow(i, 'excess_over', e.target.value)} style={{ width: '100%' }} /></td>
                <td>
                  <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem' }} onClick={() => removeRow(i)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {brackets.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Preview</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: '650px' }}>
              <thead>
                <tr>
                  <th>Bracket</th>
                  <th>Monthly Income Range</th>
                  <th>Tax on Excess</th>
                  <th>Formula</th>
                </tr>
              </thead>
              <tbody>
                {brackets.map((b, i) => (
                  <tr key={b._key}>
                    <td>{i + 1}</td>
                    <td>
                      PHP {money(b.income_from)}
                      {b.income_to.trim() ? ` – PHP ${money(b.income_to)}` : ' and above'}
                    </td>
                    <td>{pct(Number(b.tax_rate) / 100)}%</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--muted,#6b7280)' }}>
                      {Number(b.base_tax) > 0 ? `PHP ${money(b.base_tax)} + ` : ''}
                      {Number(b.tax_rate) > 0 ? `${b.tax_rate}% × (income − PHP ${money(b.excess_over)})` : '₱0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}


// ── Contribution Tables ───────────────────────────────────────────────────────

function ContributionTables() {
  const [contribTab, setContribTab] = useState('sss');

  return (
    <section className="table-section">
      <h3>Government Contribution Tables</h3>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {CONTRIB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn${contribTab === t.key ? '' : ' btn-outline'}`}
            style={{ fontSize: '0.85rem', padding: '0.3rem 0.9rem' }}
            onClick={() => setContribTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ContribTypeTable type={contribTab} key={contribTab} />
    </section>
  );
}

const EMPTY_CONTRIB = { salary_from: '', salary_to: '', employee_value: '', employer_value: '', label: '' };

function ContribTypeTable({ type }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isSSS = type === 'sss';

  function applyDefaults() {
    const defs = CONTRIB_DEFAULTS[type] || [];
    setRows(defs.map((r) => ({ ...r, _key: Math.random() })));
  }

  useEffect(() => {
    api.get(`/contribution_tables/${type}`)
      .then(({ data }) => {
        if (data.data && data.data.length > 0) {
          setRows(data.data.map((r) => ({
            _key: r.id ?? Math.random(),
            salary_from: String(r.salary_from ?? ''),
            salary_to: r.salary_to != null ? String(r.salary_to) : '',
            employee_value: isSSS ? String(r.employee_value ?? '') : String(Number(r.employee_value || 0) * 100),
            employer_value: isSSS ? String(r.employer_value ?? '') : String(Number(r.employer_value || 0) * 100),
            label: r.label || ''
          })));
        } else {
          applyDefaults();
        }
      })
      .catch(() => {
        toast.error(`Could not load ${type.toUpperCase()} table from server. Showing defaults.`);
        applyDefaults();
      })
      .finally(() => setLoading(false));
  }, [type]);

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_CONTRIB, _key: Math.random() }]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const payload = rows.map((r) => ({
      salary_from: Number(r.salary_from) || 0,
      salary_to: r.salary_to.trim() === '' ? null : Number(r.salary_to),
      employee_value: isSSS ? Number(r.employee_value) || 0 : (Number(r.employee_value) || 0) / 100,
      employer_value: isSSS ? Number(r.employer_value) || 0 : (Number(r.employer_value) || 0) / 100,
      label: r.label || null
    }));
    setSaving(true);
    try {
      const { data } = await api.put(`/contribution_tables/${type}`, { rows: payload });
      if (data.success) {
        toast.success(`${type.toUpperCase()} table saved.`);
      } else {
        toast.error(data.message || 'Failed to save.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = type === 'sss' ? 'SSS' : type === 'philhealth' ? 'PhilHealth' : 'Pag-IBIG';
  const eeLabel = isSSS ? 'EE Amount (PHP)' : 'EE Rate (%)';
  const erLabel = isSSS ? 'ER Amount (PHP)' : 'ER Rate (%)';
  const hint = isSSS
    ? 'Fixed peso contributions per Monthly Salary Credit (MSC) bracket.'
    : type === 'philhealth'
    ? 'Rates as percentage (e.g., 2.5 for 2.5%). Min/max enforced at computation.'
    : 'Rates as percentage (e.g., 2 for 2%). Max PHP 100/month per party.';

  if (loading) return <p className="empty-state">Loading...</p>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.95rem' }}>{typeLabel} Contribution Schedule</strong>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              applyDefaults();
              toast.info(`${typeLabel} defaults loaded. Click Save to apply.`);
            }}
          >
            Load Defaults
          </button>
          <button type="button" className="btn btn-outline" onClick={addRow}>+ Add Row</button>
          <button type="button" className="btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : `Save ${typeLabel}`}
          </button>
        </div>
      </div>

      <p style={{ fontSize: '0.82rem', color: 'var(--muted, #6b7280)', marginBottom: '0.75rem' }}>{hint}</p>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: '700px' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Salary From (PHP)</th>
              <th>Salary To (PHP)</th>
              <th>{eeLabel}</th>
              <th>{erLabel}</th>
              <th>Label / Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted,#6b7280)' }}>No rows. Click &quot;+ Add Row&quot; to begin.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r._key}>
                <td style={{ color: 'var(--muted,#6b7280)' }}>{i + 1}</td>
                <td><input type="number" value={r.salary_from} onChange={(e) => updateRow(i, 'salary_from', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" value={r.salary_to} onChange={(e) => updateRow(i, 'salary_to', e.target.value)} placeholder="(no limit)" style={{ width: '100%' }} /></td>
                <td><input type="number" step={isSSS ? '0.01' : '0.01'} value={r.employee_value} onChange={(e) => updateRow(i, 'employee_value', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" step={isSSS ? '0.01' : '0.01'} value={r.employer_value} onChange={(e) => updateRow(i, 'employer_value', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input value={r.label} onChange={(e) => updateRow(i, 'label', e.target.value)} placeholder="Optional label" style={{ width: '100%' }} /></td>
                <td>
                  <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem' }} onClick={() => removeRow(i)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Preview</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: '550px' }}>
              <thead>
                <tr>
                  <th>Salary Range</th>
                  <th>Employee</th>
                  <th>Employer</th>
                  <th>Total</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ee = Number(r.employee_value) || 0;
                  const er = Number(r.employer_value) || 0;
                  return (
                    <tr key={r._key}>
                      <td>
                        PHP {money(r.salary_from)}
                        {r.salary_to.trim() ? ` – PHP ${money(r.salary_to)}` : ' and above'}
                      </td>
                      <td>{isSSS ? `PHP ${money(ee)}` : `${ee.toFixed(2)}%`}</td>
                      <td>{isSSS ? `PHP ${money(er)}` : `${er.toFixed(2)}%`}</td>
                      <td>{isSSS ? `PHP ${money(ee + er)}` : `${(ee + er).toFixed(2)}%`}</td>
                      <td style={{ color: 'var(--muted,#6b7280)', fontSize: '0.8rem' }}>{r.label || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
