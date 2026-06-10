import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { api } from '../api/client.js';

const TABS = [
  { key: 'profile', label: 'Company Profile' },
  { key: 'logos', label: 'Logos' },
  { key: 'policies', label: 'Policies' }
];

const EMPTY_SETTINGS = {
  company_name: '', address: '', tin: '', email: '', phone: '',
  industry: '', website: '', registration_no: '', founded_year: '',
  logo_url: '', logo_main: '', logo_secondary: '', logo_email_signature: '',
  hr_policy: '', leave_policy: '', overtime_policy: '', code_of_conduct: '', data_privacy_policy: ''
};

export default function CompanySettingsPage() {
  const [tab, setTab] = useState('profile');
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/company_settings')
      .then(({ data }) => { if (data.data) setSettings((prev) => ({ ...prev, ...data.data })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings(updates) {
    const merged = { ...settings, ...updates };
    const { data } = await api.put('/company_settings', merged);
    if (data.success) {
      setSettings((prev) => ({ ...prev, ...data.data }));
      if (data.data?.company_name) {
        localStorage.setItem('sys_company_name', data.data.company_name);
        window.dispatchEvent(new CustomEvent('company-settings-updated', { detail: data.data }));
      }
    }
    return data;
  }

  return (
    <>
      <header className="header">
        <h2>Company Settings</h2>
        <p>Manage company information, branding logos, and corporate policies.</p>
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

      {tab === 'profile' && <CompanyProfile settings={settings} loading={loading} onSave={saveSettings} />}
      {tab === 'logos' && <CompanyLogos settings={settings} loading={loading} onSave={saveSettings} />}
      {tab === 'policies' && <CompanyPolicies settings={settings} loading={loading} onSave={saveSettings} />}
    </>
  );
}

// ── Company Profile ───────────────────────────────────────────────────────────

function CompanyProfile({ settings, loading, onSave }) {
  const [form, setForm] = useState({
    company_name: '', address: '', tin: '', email: '', phone: '',
    industry: '', website: '', registration_no: '', founded_year: ''
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
      founded_year:    settings.founded_year    || ''
    });
  }, [loading, settings]);

  function set(field, value) { setForm((prev) => ({ ...prev, [field]: value })); }

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
            Registration Number
            <input
              value={form.registration_no}
              onChange={(e) => set('registration_no', e.target.value)}
              placeholder="SEC / DTI registration number"
            />
          </label>

          <label>
            Industry
            <input
              value={form.industry}
              onChange={(e) => set('industry', e.target.value)}
              placeholder="e.g. Technology, Manufacturing"
            />
          </label>

          <label>
            Founded Year
            <input
              value={form.founded_year}
              onChange={(e) => set('founded_year', e.target.value)}
              placeholder="e.g. 2010"
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

          <label style={{ gridColumn: 'span 2' }}>
            Website
            <input
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://www.company.com"
            />
          </label>

          <div className="toolbar">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

// ── Logo Uploader (reusable) ──────────────────────────────────────────────────

function LogoUploader({ label, description, fieldKey, value, onChange }) {
  const inputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(fieldKey, String(reader.result || ''));
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const isBase64 = value && value.startsWith('data:');
  const urlValue = isBase64 ? '' : (value || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: '0.15rem' }}>{label}</strong>
        {description && (
          <span style={{ fontSize: '0.8rem', color: 'var(--muted, #6b7280)' }}>{description}</span>
        )}
      </div>

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <img
            src={value}
            alt={label}
            style={{
              maxHeight: '72px', maxWidth: '220px', objectFit: 'contain',
              border: '1px solid var(--border, #e5e7eb)', borderRadius: '6px',
              padding: '0.35rem', background: '#fff'
            }}
          />
          <button
            type="button"
            className="btn btn-outline"
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
            onClick={() => onChange(fieldKey, '')}
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          style={{
            width: '220px', height: '72px',
            border: '2px dashed var(--border, #d1d5db)', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.82rem', color: 'var(--muted, #9ca3af)', cursor: 'pointer'
          }}
        >
          Click to upload
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-outline"
          style={{ fontSize: '0.82rem', padding: '0.25rem 0.7rem' }}
          onClick={() => inputRef.current?.click()}
        >
          Upload Image
        </button>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted, #9ca3af)' }}>or paste URL</span>
        <input
          value={urlValue}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          placeholder="https://..."
          style={{ flex: 1, minWidth: '180px' }}
        />
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
      logo_email_signature: settings.logo_email_signature || ''
    });
  }, [loading, settings]);

  function set(field, value) { setForm((prev) => ({ ...prev, [field]: value })); }

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

  if (loading) return <p className="empty-state">Loading...</p>;

  return (
    <section className="table-section">
      <h3>Company Logos</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted, #6b7280)', marginBottom: '1.5rem' }}>
        Upload or link logos used across the system — reports, documents, and email signatures.
        Supported formats: PNG, JPG, SVG, WebP.
      </p>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          <LogoUploader
            label="Main Logo"
            description="Used in payslips, reports, and the system header."
            fieldKey="logo_main"
            value={form.logo_main}
            onChange={set}
          />
          <div style={{ borderTop: '1px solid var(--border, #e5e7eb)' }} />
          <LogoUploader
            label="Secondary / Alt Logo"
            description="Optional alternate logo for documents or dark backgrounds."
            fieldKey="logo_secondary"
            value={form.logo_secondary}
            onChange={set}
          />
          <div style={{ borderTop: '1px solid var(--border, #e5e7eb)' }} />
          <LogoUploader
            label="Email Signature Logo"
            description="Smaller logo included in automated email footers."
            fieldKey="logo_email_signature"
            value={form.logo_email_signature}
            onChange={set}
          />
          <div className="toolbar">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Logos'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

// ── Company Policies ──────────────────────────────────────────────────────────

const POLICY_FIELDS = [
  { key: 'hr_policy',          label: 'HR Policy',          placeholder: 'General HR policies, working hours, dress code, attendance rules, etc.' },
  { key: 'leave_policy',       label: 'Leave Policy',       placeholder: 'Leave types, entitlements, filing procedures, carryover rules, etc.' },
  { key: 'overtime_policy',    label: 'Overtime Policy',    placeholder: 'Overtime eligibility, compensation rates, approval process, etc.' },
  { key: 'code_of_conduct',    label: 'Code of Conduct',    placeholder: 'Expected employee behavior, ethics, anti-harassment, disciplinary procedures, etc.' },
  { key: 'data_privacy_policy',label: 'Data Privacy Policy',placeholder: 'How employee personal data is collected, used, stored, and protected.' }
];

function CompanyPolicies({ settings, loading, onSave }) {
  const [form, setForm] = useState(Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, ''])));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) setForm(Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, settings[f.key] || ''])));
  }, [loading, settings]);

  function set(field, value) { setForm((prev) => ({ ...prev, [field]: value })); }

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

  if (loading) return <p className="empty-state">Loading...</p>;

  return (
    <section className="table-section">
      <h3>Company Policies</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted, #6b7280)', marginBottom: '1.5rem' }}>
        Document corporate policies for reference by HR and employees.
        These can be printed alongside payslips and HR documents.
      </p>
      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {POLICY_FIELDS.map((field) => (
            <label key={field.key}>
              <strong style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                {field.label}
              </strong>
              <textarea
                rows={5}
                value={form[field.key] || ''}
                onChange={(e) => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                style={{ width: '100%', resize: 'vertical', padding: '0.45rem 0.65rem' }}
              />
            </label>
          ))}
          <div className="toolbar">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Policies'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
