import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';

// ── Main tabs ─────────────────────────────────────────────────────────────────
const MAIN_TABS = [
  { key: 'company',      label: 'Company Settings'    },
  { key: 'tax',          label: 'Tax Tables'          },
  { key: 'contributions',label: 'Contribution Tables' },
  { key: 'calendar',     label: 'Holiday Calendar'    },
  { key: 'audit',        label: 'Audit Logs'          },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function money(v) {
  return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(v) {
  return (Number(v || 0) * 100).toFixed(2);
}
function formatDate(str) {
  if (!str) return '-';
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? str : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}
function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-PH', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SystemConfigPage() {
  const [tab, setTab] = useState('company');

  return (
    <>
      <header className="header">
        <h2>System Configuration</h2>
        <p>Manage company profile, tax tables, contribution schedules, holiday calendar, and audit logs.</p>
      </header>

      <div className="report-filter-grid" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {MAIN_TABS.map((t) => (
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

      {tab === 'company'       && <CompanySettingsSection />}
      {tab === 'tax'           && <TaxTables />}
      {tab === 'contributions' && <ContributionTables />}
      {tab === 'calendar'      && <HolidayCalendar />}
      {tab === 'audit'         && <AuditLogs />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

const COMPANY_TABS = [
  { key: 'profile',  label: 'Company Profile' },
  { key: 'logos',    label: 'Logos'           },
  { key: 'policies', label: 'Policies'        },
];

const EMPTY_SETTINGS = {
  company_name: '', address: '', tin: '', email: '', phone: '',
  industry: '', website: '', registration_no: '', founded_year: '',
  logo_url: '', logo_main: '', logo_secondary: '', logo_email_signature: '',
  hr_policy: '', leave_policy: '', overtime_policy: '', code_of_conduct: '', data_privacy_policy: '',
};

function CompanySettingsSection() {
  const [subTab,   setSubTab]   = useState('profile');
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.get('/company_settings')
      .then(({ data }) => { if (data.data) setSettings((p) => ({ ...p, ...data.data })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings(updates) {
    const merged = { ...settings, ...updates };
    const { data } = await api.put('/company_settings', merged);
    if (data.success) {
      setSettings((p) => ({ ...p, ...data.data }));
      if (data.data?.company_name) {
        localStorage.setItem('sys_company_name', data.data.company_name);
        window.dispatchEvent(new CustomEvent('company-settings-updated', { detail: data.data }));
      }
    }
    return data;
  }

  return (
    <section className="table-section">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {COMPANY_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn${subTab === t.key ? '' : ' btn-outline'}`}
            style={{ fontSize: '0.85rem', padding: '0.3rem 0.9rem' }}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'profile'  && <CompanyProfile  settings={settings} loading={loading} onSave={saveSettings} />}
      {subTab === 'logos'    && <CompanyLogos    settings={settings} loading={loading} onSave={saveSettings} />}
      {subTab === 'policies' && <CompanyPolicies settings={settings} loading={loading} onSave={saveSettings} />}
    </section>
  );
}

// ── Company Profile ───────────────────────────────────────────────────────────
function CompanyProfile({ settings, loading, onSave }) {
  const [form, setForm] = useState({
    company_name: '', address: '', tin: '', email: '', phone: '',
    industry: '', website: '', registration_no: '', founded_year: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) setForm({
      company_name:    settings.company_name    || '',
      address:         settings.address         || '',
      tin:             settings.tin             || '',
      email:           settings.email           || '',
      phone:           settings.phone           || '',
      industry:        settings.industry        || '',
      website:         settings.website         || '',
      registration_no: settings.registration_no || '',
      founded_year:    settings.founded_year    || '',
    });
  }, [loading, settings]);

  function set(field, value) { setForm((p) => ({ ...p, [field]: value })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await onSave(form);
      if (data.success) toast.success('Company profile saved.');
      else toast.error(data.message || 'Failed to save.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save.');
    } finally { setSaving(false); }
  }

  if (loading) return <p className="empty-state">Loading…</p>;

  return (
    <form onSubmit={handleSave}>
      <div className="report-filter-grid">
        <label style={{ gridColumn: 'span 2' }}>
          Company Name *
          <input required value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="e.g. Astreablue Intelligence Inc." />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          Address
          <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Full company address" />
        </label>
        <label>
          TIN
          <input value={form.tin} onChange={(e) => set('tin', e.target.value)} placeholder="000-000-000-000" />
        </label>
        <label>
          Registration Number
          <input value={form.registration_no} onChange={(e) => set('registration_no', e.target.value)} placeholder="SEC / DTI registration number" />
        </label>
        <label>
          Industry
          <input value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="e.g. Technology, Manufacturing" />
        </label>
        <label>
          Founded Year
          <input value={form.founded_year} onChange={(e) => set('founded_year', e.target.value)} placeholder="e.g. 2010" />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="hr@company.com" />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+63 2 8xxx xxxx" />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          Website
          <input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://www.company.com" />
        </label>
        <div className="toolbar">
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</button>
        </div>
      </div>
    </form>
  );
}

// ── Logo Uploader ─────────────────────────────────────────────────────────────
function LogoUploader({ label, description, fieldKey, value, onChange }) {
  const inputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(fieldKey, String(reader.result || ''));
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const isBase64  = value && value.startsWith('data:');
  const urlValue  = isBase64 ? '' : (value || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: '0.15rem' }}>{label}</strong>
        {description && <span style={{ fontSize: '0.8rem', color: 'var(--muted,#6b7280)' }}>{description}</span>}
      </div>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <img src={value} alt={label} style={{ maxHeight: '72px', maxWidth: '220px', objectFit: 'contain', border: '1px solid var(--border,#e5e7eb)', borderRadius: '6px', padding: '0.35rem', background: '#fff' }} />
          <button type="button" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }} onClick={() => onChange(fieldKey, '')}>Remove</button>
        </div>
      ) : (
        <div role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          style={{ width: '220px', height: '72px', border: '2px dashed var(--border,#d1d5db)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', color: 'var(--muted,#9ca3af)', cursor: 'pointer' }}>
          Click to upload
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" style={{ fontSize: '0.82rem', padding: '0.25rem 0.7rem' }} onClick={() => inputRef.current?.click()}>Upload Image</button>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted,#9ca3af)' }}>or paste URL</span>
        <input value={urlValue} onChange={(e) => onChange(fieldKey, e.target.value)} placeholder="https://…" style={{ flex: 1, minWidth: '180px' }} />
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

// ── Company Logos ─────────────────────────────────────────────────────────────
function CompanyLogos({ settings, loading, onSave }) {
  const [form, setForm] = useState({ logo_main: '', logo_secondary: '', logo_email_signature: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) setForm({
      logo_main:            settings.logo_main            || settings.logo_url || '',
      logo_secondary:       settings.logo_secondary       || '',
      logo_email_signature: settings.logo_email_signature || '',
    });
  }, [loading, settings]);

  function set(field, value) { setForm((p) => ({ ...p, [field]: value })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await onSave({ ...form, logo_url: form.logo_main });
      if (data.success) toast.success('Logos saved.');
      else toast.error(data.message || 'Failed to save.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save.');
    } finally { setSaving(false); }
  }

  if (loading) return <p className="empty-state">Loading…</p>;

  return (
    <form onSubmit={handleSave}>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted,#6b7280)', marginBottom: '1.5rem' }}>
        Upload or link logos used across the system — reports, documents, and email signatures. Supported: PNG, JPG, SVG, WebP.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        <LogoUploader label="Main Logo" description="Used in payslips, reports, and the system header." fieldKey="logo_main" value={form.logo_main} onChange={set} />
        <div style={{ borderTop: '1px solid var(--border,#e5e7eb)' }} />
        <LogoUploader label="Secondary / Alt Logo" description="Optional alternate logo for documents or dark backgrounds." fieldKey="logo_secondary" value={form.logo_secondary} onChange={set} />
        <div style={{ borderTop: '1px solid var(--border,#e5e7eb)' }} />
        <LogoUploader label="Email Signature Logo" description="Smaller logo included in automated email footers." fieldKey="logo_email_signature" value={form.logo_email_signature} onChange={set} />
        <div className="toolbar">
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save Logos'}</button>
        </div>
      </div>
    </form>
  );
}

// ── Company Policies ──────────────────────────────────────────────────────────
const POLICY_FIELDS = [
  { key: 'hr_policy',           label: 'HR Policy',           placeholder: 'General HR policies, working hours, dress code, attendance rules…' },
  { key: 'leave_policy',        label: 'Leave Policy',        placeholder: 'Leave types, entitlements, filing procedures, carryover rules…'    },
  { key: 'overtime_policy',     label: 'Overtime Policy',     placeholder: 'Overtime eligibility, compensation rates, approval process…'       },
  { key: 'code_of_conduct',     label: 'Code of Conduct',     placeholder: 'Expected employee behavior, ethics, anti-harassment, disciplinary…' },
  { key: 'data_privacy_policy', label: 'Data Privacy Policy', placeholder: 'How employee personal data is collected, used, stored, and protected.' },
];

function CompanyPolicies({ settings, loading, onSave }) {
  const [form,   setForm]   = useState(Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, ''])));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) setForm(Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, settings[f.key] || ''])));
  }, [loading, settings]);

  function set(field, value) { setForm((p) => ({ ...p, [field]: value })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await onSave(form);
      if (data.success) toast.success('Policies saved.');
      else toast.error(data.message || 'Failed to save.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save.');
    } finally { setSaving(false); }
  }

  if (loading) return <p className="empty-state">Loading…</p>;

  return (
    <form onSubmit={handleSave}>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted,#6b7280)', marginBottom: '1.5rem' }}>
        Document corporate policies for reference by HR and employees. These can be printed alongside payslips and HR documents.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {POLICY_FIELDS.map((field) => (
          <label key={field.key}>
            <strong style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem' }}>{field.label}</strong>
            <textarea rows={4} value={form[field.key] || ''} onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder} style={{ width: '100%', resize: 'vertical', padding: '0.45rem 0.65rem' }} />
          </label>
        ))}
        <div className="toolbar">
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save Policies'}</button>
        </div>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAX TABLES
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_BIR = [
  { income_from:'0',        income_to:'20833',   base_tax:'0',         tax_rate:'0',   excess_over:'0'      },
  { income_from:'20833.01', income_to:'33332',   base_tax:'0',         tax_rate:'15',  excess_over:'20833'  },
  { income_from:'33333',    income_to:'66666',   base_tax:'1875',      tax_rate:'20',  excess_over:'33333'  },
  { income_from:'66667',    income_to:'166666',  base_tax:'8541.80',   tax_rate:'25',  excess_over:'66667'  },
  { income_from:'166667',   income_to:'666666',  base_tax:'33541.80',  tax_rate:'30',  excess_over:'166667' },
  { income_from:'666667',   income_to:'',        base_tax:'183541.80', tax_rate:'35',  excess_over:'666667' },
];

const EMPTY_BRACKET = { income_from: '', income_to: '', base_tax: '0', tax_rate: '0', excess_over: '' };

function TaxTables() {
  const [brackets, setBrackets] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    api.get('/tax_brackets')
      .then(({ data }) => {
        if (data.data?.length > 0) setBrackets(data.data.map(rowToForm));
        else setBrackets(DEFAULT_BIR.map((b) => ({ ...b, _key: Math.random() })));
      })
      .catch(() => {
        toast.error('Could not load tax brackets. Showing defaults.');
        setBrackets(DEFAULT_BIR.map((b) => ({ ...b, _key: Math.random() })));
      })
      .finally(() => setLoading(false));
  }, []);

  function rowToForm(r) {
    return {
      _key:         r.id ?? Math.random(),
      income_from:  String(r.income_from ?? ''),
      income_to:    r.income_to != null ? String(r.income_to) : '',
      base_tax:     String(r.base_tax ?? '0'),
      tax_rate:     String(Number(r.tax_rate || 0) * 100),
      excess_over:  String(r.excess_over ?? '0'),
    };
  }

  function updateRow(i, field, value) {
    setBrackets((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function handleSave() {
    const payload = brackets.map((b) => ({
      income_from:  Number(b.income_from) || 0,
      income_to:    b.income_to.trim() === '' ? null : Number(b.income_to),
      base_tax:     Number(b.base_tax) || 0,
      tax_rate:     (Number(b.tax_rate) || 0) / 100,
      excess_over:  Number(b.excess_over) || 0,
    }));
    setSaving(true);
    try {
      const { data } = await api.put('/tax_brackets', { brackets: payload });
      if (data.success) { toast.success('Tax brackets saved.'); setBrackets(data.data.map(rowToForm)); }
      else toast.error(data.message || 'Failed to save.');
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to save.'); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="empty-state">Loading…</p>;

  return (
    <section className="table-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>BIR Withholding Tax Brackets (Monthly)</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={() => { setBrackets(DEFAULT_BIR.map((b) => ({ ...b, _key: Math.random() }))); toast.info('TRAIN Act defaults loaded. Click Save to apply.'); }}>Load Defaults</button>
          <button type="button" className="btn btn-outline" onClick={() => setBrackets((p) => [...p, { ...EMPTY_BRACKET, _key: Math.random() }])}>+ Add Row</button>
          <button type="button" className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Brackets'}</button>
        </div>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted,#6b7280)', marginBottom: '0.75rem' }}>
        TRAIN Act rates. Tax rate entered as a percentage (e.g. 15 for 15%). Leave "To" blank for the last bracket.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: '750px' }}>
          <thead><tr><th>#</th><th>Income From (PHP)</th><th>Income To (PHP)</th><th>Base Tax (PHP)</th><th>Tax Rate (%)</th><th>Excess Over (PHP)</th><th /></tr></thead>
          <tbody>
            {brackets.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted,#6b7280)' }}>No brackets. Click "+ Add Row" to begin.</td></tr>
            ) : brackets.map((b, i) => (
              <tr key={b._key}>
                <td style={{ color: 'var(--muted,#6b7280)' }}>{i + 1}</td>
                <td><input type="number" value={b.income_from}  onChange={(e) => updateRow(i, 'income_from',  e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" value={b.income_to}    onChange={(e) => updateRow(i, 'income_to',    e.target.value)} placeholder="(no limit)" style={{ width: '100%' }} /></td>
                <td><input type="number" value={b.base_tax}     onChange={(e) => updateRow(i, 'base_tax',     e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" step="0.01" value={b.tax_rate} onChange={(e) => updateRow(i, 'tax_rate', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" value={b.excess_over}  onChange={(e) => updateRow(i, 'excess_over',  e.target.value)} style={{ width: '100%' }} /></td>
                <td><button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem' }} onClick={() => setBrackets((p) => p.filter((_, idx) => idx !== i))}>Remove</button></td>
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
              <thead><tr><th>Bracket</th><th>Monthly Income Range</th><th>Tax on Excess</th><th>Formula</th></tr></thead>
              <tbody>
                {brackets.map((b, i) => (
                  <tr key={b._key}>
                    <td>{i + 1}</td>
                    <td>PHP {money(b.income_from)}{b.income_to.trim() ? ` – PHP ${money(b.income_to)}` : ' and above'}</td>
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

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRIBUTION TABLES
// ═══════════════════════════════════════════════════════════════════════════════

const CONTRIB_TABS = [
  { key: 'sss',       label: 'SSS'       },
  { key: 'philhealth',label: 'PhilHealth' },
  { key: 'pagibig',   label: 'Pag-IBIG'  },
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
  { salary_from:'29750', salary_to:'',         employee_value:'1350',   employer_value:'2850',   label:'MSC 30,000 (Max)' },
];

const DEFAULT_PHILHEALTH = [
  { salary_from:'0',       salary_to:'10000',    employee_value:'2.5', employer_value:'2.5', label:'Min contribution PHP 500' },
  { salary_from:'10000.01',salary_to:'99999.99', employee_value:'2.5', employer_value:'2.5', label:'2.5% EE / 2.5% ER'       },
  { salary_from:'100000',  salary_to:'',         employee_value:'2.5', employer_value:'2.5', label:'Max contribution PHP 5,000' },
];

const DEFAULT_PAGIBIG = [
  { salary_from:'0',       salary_to:'1500',  employee_value:'1', employer_value:'2', label:'1% EE / 2% ER' },
  { salary_from:'1500.01', salary_to:'',      employee_value:'2', employer_value:'2', label:'2% EE / 2% ER (max PHP 100 each)' },
];

const CONTRIB_DEFAULTS = { sss: DEFAULT_SSS, philhealth: DEFAULT_PHILHEALTH, pagibig: DEFAULT_PAGIBIG };
const EMPTY_CONTRIB     = { salary_from: '', salary_to: '', employee_value: '', employer_value: '', label: '' };

function ContributionTables() {
  const [contribTab, setContribTab] = useState('sss');
  return (
    <section className="table-section">
      <h3>Government Contribution Tables</h3>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {CONTRIB_TABS.map((t) => (
          <button key={t.key} type="button" className={`btn${contribTab === t.key ? '' : ' btn-outline'}`}
            style={{ fontSize: '0.85rem', padding: '0.3rem 0.9rem' }} onClick={() => setContribTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <ContribTypeTable type={contribTab} key={contribTab} />
    </section>
  );
}

function ContribTypeTable({ type }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const isSSS = type === 'sss';

  function applyDefaults() {
    setRows((CONTRIB_DEFAULTS[type] || []).map((r) => ({ ...r, _key: Math.random() })));
  }

  useEffect(() => {
    api.get(`/contribution_tables/${type}`)
      .then(({ data }) => {
        if (data.data?.length > 0) {
          setRows(data.data.map((r) => ({
            _key:           r.id ?? Math.random(),
            salary_from:    String(r.salary_from ?? ''),
            salary_to:      r.salary_to != null ? String(r.salary_to) : '',
            employee_value: isSSS ? String(r.employee_value ?? '') : String(Number(r.employee_value || 0) * 100),
            employer_value: isSSS ? String(r.employer_value ?? '') : String(Number(r.employer_value || 0) * 100),
            label:          r.label || '',
          })));
        } else { applyDefaults(); }
      })
      .catch(() => { toast.error(`Could not load ${type.toUpperCase()} table. Showing defaults.`); applyDefaults(); })
      .finally(() => setLoading(false));
  }, [type]);

  function updateRow(i, field, value) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function handleSave() {
    const payload = rows.map((r) => ({
      salary_from:    Number(r.salary_from) || 0,
      salary_to:      r.salary_to.trim() === '' ? null : Number(r.salary_to),
      employee_value: isSSS ? Number(r.employee_value) || 0 : (Number(r.employee_value) || 0) / 100,
      employer_value: isSSS ? Number(r.employer_value) || 0 : (Number(r.employer_value) || 0) / 100,
      label:          r.label || null,
    }));
    setSaving(true);
    try {
      const { data } = await api.put(`/contribution_tables/${type}`, { rows: payload });
      if (data.success) toast.success(`${type.toUpperCase()} table saved.`);
      else toast.error(data.message || 'Failed to save.');
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to save.'); }
    finally { setSaving(false); }
  }

  const typeLabel = type === 'sss' ? 'SSS' : type === 'philhealth' ? 'PhilHealth' : 'Pag-IBIG';
  const eeLabel   = isSSS ? 'EE Amount (PHP)' : 'EE Rate (%)';
  const erLabel   = isSSS ? 'ER Amount (PHP)' : 'ER Rate (%)';
  const hint      = isSSS ? 'Fixed peso contributions per Monthly Salary Credit (MSC) bracket.'
                  : type === 'philhealth' ? 'Rates as percentage (e.g. 2.5 for 2.5%). Min/max enforced at computation.'
                  : 'Rates as percentage (e.g. 2 for 2%). Max PHP 100/month per party.';

  if (loading) return <p className="empty-state">Loading…</p>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <strong style={{ fontSize: '0.95rem' }}>{typeLabel} Contribution Schedule</strong>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={() => { applyDefaults(); toast.info(`${typeLabel} defaults loaded. Click Save to apply.`); }}>Load Defaults</button>
          <button type="button" className="btn btn-outline" onClick={() => setRows((p) => [...p, { ...EMPTY_CONTRIB, _key: Math.random() }])}>+ Add Row</button>
          <button type="button" className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : `Save ${typeLabel}`}</button>
        </div>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted,#6b7280)', marginBottom: '0.75rem' }}>{hint}</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: '700px' }}>
          <thead><tr><th>#</th><th>Salary From (PHP)</th><th>Salary To (PHP)</th><th>{eeLabel}</th><th>{erLabel}</th><th>Label / Description</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted,#6b7280)' }}>No rows. Click "+ Add Row" to begin.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r._key}>
                <td style={{ color: 'var(--muted,#6b7280)' }}>{i + 1}</td>
                <td><input type="number" value={r.salary_from}    onChange={(e) => updateRow(i, 'salary_from',    e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" value={r.salary_to}      onChange={(e) => updateRow(i, 'salary_to',      e.target.value)} placeholder="(no limit)" style={{ width: '100%' }} /></td>
                <td><input type="number" step="0.01" value={r.employee_value} onChange={(e) => updateRow(i, 'employee_value', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" step="0.01" value={r.employer_value} onChange={(e) => updateRow(i, 'employer_value', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input value={r.label} onChange={(e) => updateRow(i, 'label', e.target.value)} placeholder="Optional label" style={{ width: '100%' }} /></td>
                <td><button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem' }} onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}>Remove</button></td>
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
              <thead><tr><th>Salary Range</th><th>Employee</th><th>Employer</th><th>Total</th><th>Label</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const ee = Number(r.employee_value) || 0;
                  const er = Number(r.employer_value) || 0;
                  return (
                    <tr key={r._key}>
                      <td>PHP {money(r.salary_from)}{r.salary_to.trim() ? ` – PHP ${money(r.salary_to)}` : ' and above'}</td>
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

// ═══════════════════════════════════════════════════════════════════════════════
// HOLIDAY CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════

const EVENT_TYPES = ['Regular Holiday', 'Special Non-Working', 'Special Working', 'Company Event', 'Other'];

const EMPTY_EVENT = { event_date: '', title: '', event_type: 'Regular Holiday', description: '', is_paid_holiday: true };

function HolidayCalendar() {
  const currentYear = new Date().getFullYear();
  const [events,   setEvents]   = useState([]);
  const [year,     setYear]     = useState(String(currentYear));
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState(EMPTY_EVENT);
  const [editing,  setEditing]  = useState(null); // event_id or null
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [search,   setSearch]   = useState('');

  async function loadEvents() {
    setLoading(true);
    try {
      const { data } = await api.get('/company-calendar/events');
      setEvents(data.events || []);
    } catch (err) {
      toast.error(getApiMessage(err, 'Unable to load calendar events.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { loadEvents(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      const matchYear = !year || String(e.event_date || '').startsWith(year);
      const matchQ    = !q || `${e.title} ${e.event_type} ${e.description || ''}`.toLowerCase().includes(q);
      return matchYear && matchQ;
    });
  }, [events, year, search]);

  function openAdd() {
    setForm({ ...EMPTY_EVENT, event_date: `${year}-01-01` });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(ev) {
    setForm({
      event_date:      ev.event_date || '',
      title:           ev.title || '',
      event_type:      ev.event_type || 'Regular Holiday',
      description:     ev.description || '',
      is_paid_holiday: Boolean(ev.is_paid_holiday),
    });
    setEditing(ev.event_id);
    setShowForm(true);
  }

  function setF(field, value) { setForm((p) => ({ ...p, [field]: value })); }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.event_date || !form.title.trim()) { toast.error('Date and title are required.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, is_paid_holiday: form.is_paid_holiday ? 1 : 0 };
      if (editing) {
        await api.put(`/company-calendar/events/${editing}`, payload);
        toast.success('Event updated.');
      } else {
        await api.post('/company-calendar/events', payload);
        toast.success('Event added.');
      }
      setShowForm(false);
      setEditing(null);
      await loadEvents();
    } catch (err) {
      toast.error(getApiMessage(err, 'Failed to save event.'));
    } finally { setSaving(false); }
  }

  async function handleDelete(eventId, title) {
    if (deleting) return;
    setDeleting(eventId);
    try {
      await api.delete(`/company-calendar/events/${eventId}`);
      toast.success(`"${title}" deleted.`);
      await loadEvents();
    } catch (err) {
      toast.error(getApiMessage(err, 'Failed to delete event.'));
    } finally { setDeleting(null); }
  }

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - 1 + i));

  return (
    <section className="table-section">
      <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>Holiday &amp; Company Calendar</h3>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--muted,#6b7280)' }}>
            Philippine government holidays are auto-seeded. Add company events and special holidays below.
          </p>
        </div>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Filter by year">
            <option value="">All Years</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" style={{ width: 180 }} />
          <button type="button" className="btn" onClick={openAdd}>+ Add Event</button>
        </div>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border,#e2e8f0)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 1rem' }}>{editing ? 'Edit Event' : 'Add Event'}</h4>
          <form onSubmit={handleSave}>
            <div className="report-filter-grid">
              <label>
                Date *
                <input type="date" required value={form.event_date} onChange={(e) => setF('event_date', e.target.value)} />
              </label>
              <label>
                Event Type
                <select value={form.event_type} onChange={(e) => setF('event_type', e.target.value)}>
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Title *
                <input required value={form.title} onChange={(e) => setF('title', e.target.value)} placeholder="e.g. New Year's Day" />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Description
                <input value={form.description} onChange={(e) => setF('description', e.target.value)} placeholder="Optional description" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', gridColumn: 'span 2', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_paid_holiday} onChange={(e) => setF('is_paid_holiday', e.target.checked)} style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Paid Holiday</span>
              </label>
              <div className="toolbar" style={{ gridColumn: 'span 2' }}>
                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : (editing ? 'Update Event' : 'Add Event')}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {loading ? <p className="message">Loading events…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Type</th>
                <th>Paid</th>
                <th>Description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted,#6b7280)', padding: '1.5rem 0' }}>No events found.</td></tr>
              ) : filtered.map((ev) => (
                <tr key={ev.event_id}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDate(ev.event_date)}</td>
                  <td>{ev.title}</td>
                  <td>
                    <span className={`status ${ev.event_type === 'Regular Holiday' ? 'approved' : ev.event_type === 'Special Non-Working' ? 'pending' : 'completed'}`}>
                      {ev.event_type}
                    </span>
                  </td>
                  <td>{ev.is_paid_holiday ? 'Paid' : '-'}</td>
                  <td style={{ color: 'var(--muted,#6b7280)', fontSize: '0.82rem' }}>{ev.description || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }} onClick={() => openEdit(ev)}>Edit</button>
                      <button type="button" className="btn danger" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }} disabled={deleting === ev.event_id} onClick={() => handleDelete(ev.event_id, ev.title)}>
                        {deleting === ev.event_id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: '0.8rem', color: 'var(--muted,#6b7280)', marginTop: '0.5rem' }}>
        {filtered.length} event{filtered.length !== 1 ? 's' : ''} shown
        {year ? ` for ${year}` : ''}.
      </p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════════

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function escapeCsv(value) {
  const text = String(value ?? '');
  return (text.includes(',') || text.includes('"') || text.includes('\n'))
    ? `"${text.replace(/"/g, '""')}"` : text;
}

function AuditLogs() {
  const [logs,       setLogs]       = useState([]);
  const [search,     setSearch]     = useState('');
  const [entries,    setEntries]    = useState(20);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs,  setTotalLogs]  = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [message,    setMessage]    = useState('');

  async function loadLogs() {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await api.get('/audit_logs', { params: { limit: entries, page } });
      if (!data.success) throw new Error(data.message || 'Unable to load audit logs.');
      setLogs(data.logs || []);
      setTotalLogs(Number(data.totalLogs || 0));
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (err) {
      setLogs([]);
      setMessage(getApiMessage(err, 'Unable to load audit logs.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { loadLogs().catch(() => {}); }, [entries, page]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) => `${log.admin_name || ''} ${log.action || ''} ${log.status || ''}`.toLowerCase().includes(term));
  }, [logs, search]);

  function exportCsv() {
    const headers = ['Date/Time', 'User', 'Action', 'Status'];
    const body    = filteredLogs.map((r) => [formatDateTime(r.log_time), r.admin_name || '', r.action || '', r.status || '']);
    const csv     = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const url     = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const showingStart = totalLogs === 0 ? 0 : (page - 1) * entries + 1;
  const showingEnd   = Math.min(page * entries, totalLogs);

  return (
    <section className="table-section">
      <div className="table-header employee-mgmt-header">
        <h3>System Activity Log</h3>
        <div className="toolbar">
          <button type="button" className="btn secondary" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="employee-table-controls">
        <label>
          Show
          <select value={entries} onChange={(e) => { setPage(1); setEntries(Number(e.target.value)); }}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          entries
        </label>
        <label>
          Search:
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs…" />
        </label>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Date / Time</th><th>User</th><th>Action</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem 0' }}>Loading logs…</td></tr>}
            {!loading && filteredLogs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--muted,#6b7280)' }}>No activity logs found.</td></tr>}
            {!loading && filteredLogs.map((log, idx) => (
              <tr key={`${log.log_time}-${idx}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.log_time)}</td>
                <td>{log.admin_name || '—'}</td>
                <td>{log.action || '—'}</td>
                <td><span className="status completed">{log.status || '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="employee-table-footer">
        <div className="muted">Showing {showingStart} to {showingEnd} of {totalLogs} entries</div>
        <div className="pagination-react">
          <button type="button" className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <span className="page-chip">{page}</span>
          <button type="button" className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>

      {message && <p className="message">{message}</p>}
    </section>
  );
}
