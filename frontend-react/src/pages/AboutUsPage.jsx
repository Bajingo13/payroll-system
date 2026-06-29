import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import AppIcon from '../components/AppIcon.jsx';
import { getReportCompanyProfile } from '../utils/reportExport.js';

const FEATURES = [
  { icon: 'user', tag: 'HRIS', title: 'Employee Records', desc: 'Complete employee profiles, government IDs, 201 files, and full organizational hierarchy.' },
  { icon: 'time', tag: 'Timekeeping', title: 'Time & Attendance', desc: 'Attendance monitoring, leave management, overtime tracking, and work schedule management.' },
  { icon: 'wallet', tag: 'Payroll', title: 'Payroll Computation', desc: 'Automated payroll with BIR, SSS, PhilHealth, and Pag-IBIG deductions computed every run.' },
  { icon: 'chart', tag: 'Reports', title: 'Compliance Reports', desc: 'Payslips, payroll journals, government reports, audit logs, and year-end payroll exports.' },
  { icon: 'lock', tag: 'Security', title: 'Role-Based Access', desc: 'Granular access control for Admin, HR, and Employee roles with encrypted sensitive data.' },
  { icon: 'smartphone', tag: 'Mobile', title: 'HRIS Mobile App', desc: 'Employees can clock in/out, file leaves and overtime, and view payslips from their phones.' },
];

const STATS = [
  { value: '6+', label: 'Core Modules' },
  { value: '3', label: 'User Roles' },
  { value: '100%', label: 'Cloud Ready' },
  { value: 'PH', label: 'Government Compliant' },
];

const INFO_ICON = {
  Address: 'mapPin',
  Email: 'mail',
  Phone: 'phone',
  Website: 'world',
  'Reg. No.': 'building',
  Founded: 'calendar',
};

export default function AboutUsPage() {
  const [company, setCompany] = useState(() => getReportCompanyProfile());

  useEffect(() => {
    const updateCompany = (event) => setCompany(event?.detail || getReportCompanyProfile());
    api.get('/company_settings')
      .then(({ data }) => { if (data.data) setCompany(data.data); })
      .catch(() => {});
    window.addEventListener('company-settings-updated', updateCompany);
    return () => window.removeEventListener('company-settings-updated', updateCompany);
  }, []);

  const name = company?.company_name || 'Astreablue Intelligence Inc.';
  const address = company?.address || '20th Floor, Unit 2004, Philippine AXA Life Centre, 1286 Sen. Gil Puyat Ave., Makati City';
  const email = company?.email || 'hris@astreablue.com';
  const phone = company?.phone || '';
  const website = company?.website || '';
  const industry = company?.industry || 'Information Technology';
  const regNo = company?.registration_no || '';
  const founded = company?.founded_year || '';
  const logo = company?.logo_main || company?.logo_url || '';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 0 48px' }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f2044 0%, #1e40af 60%, #3b82f6 100%)',
        borderRadius: 20, padding: '48px 40px', marginBottom: 28,
        display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', right: -60, top: -80 }} />
        {logo && (
          <img src={logo} alt={name} style={{ height: 72, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9, position: 'relative', zIndex: 1 }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>{industry}</div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{name}</h1>
          <p style={{ margin: '10px 0 0', color: '#bfdbfe', fontSize: 15, maxWidth: 560, lineHeight: 1.6 }}>
            Providing a comprehensive HRIS and Payroll platform to streamline employee records,
            timekeeping, payroll computation, and government compliance - all in one integrated system.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px 16px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#1e40af' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Platform Capabilities</h2>
        <p style={{ color: '#64748b', marginBottom: 18, fontSize: 14 }}>Everything your HR team needs in one place.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'box-shadow .2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 12, background: '#eff6ff', color: '#1e40af', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AppIcon name={f.icon} size={19} />
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#eff6ff', borderRadius: 20, padding: '3px 10px', letterSpacing: 0.8, textTransform: 'uppercase' }}>{f.tag}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {(address || email || phone || website || regNo || founded) && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: '24px 28px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Company Information</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px 24px' }}>
            {[
              { label: 'Address', val: address },
              { label: 'Email', val: email, href: `mailto:${email}` },
              { label: 'Phone', val: phone },
              { label: 'Website', val: website, href: website, ext: true },
              { label: 'Reg. No.', val: regNo },
              { label: 'Founded', val: founded },
            ].filter(i => i.val).map(i => (
              <div key={i.label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AppIcon name={INFO_ICON[i.label]} size={13} /> {i.label}
                </div>
                {i.href
                  ? <a href={i.href} target={i.ext ? '_blank' : undefined} rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', textDecoration: 'none' }}>{i.val}</a>
                  : <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{i.val}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
