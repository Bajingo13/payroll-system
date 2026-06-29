import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import AppIcon from '../components/AppIcon.jsx';
import { getReportCompanyProfile } from '../utils/reportExport.js';

const DEPARTMENTS = [
  { icon: 'briefcase', title: 'Payroll Concerns', team: 'HR / Payroll Team', desc: 'Payslip disputes, salary adjustments, loan deductions, and government contribution queries.' },
  { icon: 'calendar', title: 'Leave & Attendance', team: 'HR Department', desc: 'Leave balance inquiries, attendance corrections, schedule adjustments, and overtime concerns.' },
  { icon: 'wrench', title: 'System Support', team: 'System Administrator', desc: 'Login issues, access requests, system errors, account management, and configuration concerns.' },
];

function IconBox({ name, color = '#1e40af', bg = '#eff6ff', size = 20 }) {
  return (
    <span style={{ width: 40, height: 40, borderRadius: 12, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
      <AppIcon name={name} size={size} />
    </span>
  );
}

export default function ContactsPage() {
  const [company, setCompany] = useState(() => getReportCompanyProfile());

  useEffect(() => {
    const updateCompany = (event) => setCompany(event?.detail || getReportCompanyProfile());
    api.get('/company_settings')
      .then(({ data }) => { if (data.data) setCompany(data.data); })
      .catch(() => {});
    window.addEventListener('company-settings-updated', updateCompany);
    return () => window.removeEventListener('company-settings-updated', updateCompany);
  }, []);

  const address = company?.address || '20th Floor, Unit 2004, Philippine AXA Life Centre, 1286 Sen. Gil Puyat Ave., Makati City';
  const email = company?.email || 'hris@astreablue.com';
  const phone = company?.phone || '';
  const website = company?.website || '';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 0 48px' }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f2044 0%, #1e40af 60%, #3b82f6 100%)',
        borderRadius: 20, padding: '48px 40px', marginBottom: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', right: -50, bottom: -60 }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Contact Us</div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: '#fff' }}>Get in Touch</h1>
        <p style={{ margin: '10px 0 24px', color: '#bfdbfe', fontSize: 15, maxWidth: 500, lineHeight: 1.6 }}>
          Reach out to our team for support, payroll inquiries, HR concerns, or system assistance.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {email && (
            <a href={`mailto:${email}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#fff', color: '#1e40af', borderRadius: 12,
              padding: '10px 20px', fontWeight: 700, fontSize: 14, textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              <AppIcon name="mail" size={16} /> Send Email
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { icon: 'mail', label: 'Email', value: email, href: `mailto:${email}`, desc: 'For all system-related inquiries and support requests.' },
          { icon: 'mapPin', label: 'Office Address', value: address, desc: 'Visit us during business hours by appointment.' },
          phone && { icon: 'phone', label: 'Phone', value: phone, desc: 'Weekdays 8:00 AM - 5:00 PM (PST).' },
          website && { icon: 'world', label: 'Website', value: website, href: website, ext: true, desc: 'Visit our website for resources and updates.' },
        ].filter(Boolean).filter(c => c.value).map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '22px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <IconBox name={c.icon} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{c.label}</div>
            {c.href
              ? <a href={c.href} target={c.ext ? '_blank' : undefined} rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', textDecoration: 'none', display: 'block', marginBottom: 6, wordBreak: 'break-all' }}>{c.value}</a>
              : <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6, lineHeight: 1.5 }}>{c.value}</div>}
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{c.desc}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Who to Contact</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 18 }}>Route your concern to the right team.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {DEPARTMENTS.map(d => (
            <div key={d.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <IconBox name={d.icon} />
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#eff6ff', borderRadius: 20, padding: '3px 10px', letterSpacing: 0.8, display: 'inline-block', marginBottom: 8, textTransform: 'uppercase' }}>{d.title}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{d.team}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{d.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, padding: '14px 18px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, fontSize: 13, color: '#0369a1', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AppIcon name="time" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong>Office hours:</strong> Monday to Friday, 8:00 AM - 5:00 PM (Philippine Standard Time). Concerns submitted outside business hours will be addressed the next working day.</span>
        </div>
      </div>
    </div>
  );
}
