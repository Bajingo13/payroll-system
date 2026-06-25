import AppIcon from './AppIcon.jsx';

function MiniCard({ icon, tag, title, desc, accent = '#1e40af', accentBg = '#eff6ff' }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
      padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: accentBg, color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}><AppIcon name={icon} size={18} /></div>
      <div>
        {tag && <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>{tag}</div>}
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{desc}</div>}
      </div>
    </div>
  );
}

export function AboutUsContent() {
  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #0f2044, #1e40af)',
        borderRadius: 14, padding: '20px 20px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>About the Platform</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', marginBottom: 6 }}>Astreablue Intelligence Inc.</div>
        <div style={{ fontSize: 12, color: '#bfdbfe', lineHeight: 1.6 }}>
          A comprehensive HRIS and Payroll platform for employee records, timekeeping, payroll computation, and government compliance - all in one system.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        {[['6+', 'Modules'], ['3', 'User Roles'], ['PH', 'Compliant']].map(([v, l]) => (
          <div key={l} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e40af' }}>{v}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 600 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MiniCard icon="user" tag="HRIS" title="Employee Records" desc="Complete profiles, government IDs, 201 files, and org setup." accentBg="#eff6ff" />
        <MiniCard icon="wallet" tag="Payroll" title="Computation & Processing" desc="Automated payroll with BIR, SSS, PhilHealth, and Pag-IBIG." accentBg="#f0fdf4" accent="#15803d" />
        <MiniCard icon="chart" tag="Reports" title="Compliance Reports" desc="Payslips, payroll journals, government reports, and auditing." accentBg="#fef3c7" accent="#d97706" />
        <MiniCard icon="smartphone" tag="Mobile" title="HRIS Mobile App" desc="Employees can clock in/out, file requests, and view payslips." accentBg="#f5f3ff" accent="#7c3aed" />
      </div>
    </div>
  );
}

export function HelpContent() {
  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #0f2044, #1e40af)',
        borderRadius: 14, padding: '20px 20px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Help Center</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', marginBottom: 4 }}>How can we help?</div>
        <div style={{ fontSize: 12, color: '#bfdbfe', lineHeight: 1.6 }}>Quick guides and troubleshooting for the HRIS + Payroll system.</div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Quick Start</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
        {[
          ['building', '01', 'Company Setup', 'System Tools -> Company Settings -> fill in your profile.'],
          ['user', '02', 'Add Employees', 'HRIS -> Employee File -> add profiles and government IDs.'],
          ['calendar', '03', 'Assign Schedules', 'Schedule Management -> assign work schedules.'],
          ['wallet', '04', 'Run Payroll', 'Payroll Computation -> select period -> Generate.'],
        ].map(([icon, step, title, desc]) => (
          <div key={step} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AppIcon name={icon} size={14} /></div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Troubleshooting</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[
          ['alert', 'Server error on Generate', 'Confirm the server is running and your payroll run exists.'],
          ['clipboard', 'No records returned', 'Try a different period/month/year with generated payroll.'],
          ['download', 'Export not downloading', 'Hard refresh (Ctrl+F5) or try a different browser.'],
          ['key', 'Cannot log in', 'Ask your admin to reset your password under User Settings.'],
        ].map(([icon, problem, fix]) => (
          <div key={problem} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: '#eff6ff', color: '#1e40af', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><AppIcon name={icon} size={14} /></span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{problem}</div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{fix}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContactsContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f2044 0%, #1d4ed8 100%)',
        borderRadius: 16, padding: '22px 22px 20px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', right: -30, top: -30, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', right: 40, bottom: -20 }} />
        <div style={{ fontSize: 10, fontWeight: 800, color: '#93c5fd', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Contact Us</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 6, lineHeight: 1.2 }}>Get in Touch</div>
        <div style={{ fontSize: 12, color: '#bfdbfe', lineHeight: 1.6, marginBottom: 14 }}>
          Reach out to our team for support, HR concerns, or payroll inquiries.
        </div>
        <a href="mailto:astreablueintelligenceinc@gmail.com" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#fff', color: '#1e40af', borderRadius: 10,
          padding: '8px 16px', fontWeight: 800, fontSize: 12, textDecoration: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}><AppIcon name="mail" size={14} /> Send Email</a>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
        {[
          { icon: 'mail', color: '#eff6ff', iconColor: '#1e40af', label: 'Email', value: 'astreablueintelligenceinc@gmail.com', href: 'mailto:astreablueintelligenceinc@gmail.com' },
          { icon: 'mapPin', color: '#fef3c7', iconColor: '#d97706', label: 'Address', value: '20F Unit 2004, Philippine AXA Life Centre, 1286 Sen. Gil Puyat Ave., Makati City' },
          { icon: 'time', color: '#f0fdf4', iconColor: '#15803d', label: 'Hours', value: 'Mon - Fri, 8:00 AM - 5:00 PM (PST)' },
        ].map((item, i) => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: item.color, color: item.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AppIcon name={item.icon} size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{item.label}</div>
              {item.href
                ? <a href={item.href} style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', textDecoration: 'none', wordBreak: 'break-all' }}>{item.value}</a>
                : <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', lineHeight: 1.4 }}>{item.value}</div>}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>Who to Contact</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { icon: 'briefcase', label: 'Payroll', sub: 'HR / Payroll Team', color: '#eff6ff' },
            { icon: 'calendar', label: 'Leave & OT', sub: 'HR Department', color: '#f0fdf4' },
            { icon: 'wrench', label: 'System', sub: 'Sys. Admin', color: '#fef3c7' },
          ].map(d => (
            <div key={d.label} style={{ background: d.color, borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
              <div style={{ color: '#1e40af', marginBottom: 6 }}><AppIcon name={d.icon} size={18} /></div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', marginBottom: 3, lineHeight: 1.2 }}>{d.label}</div>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>{d.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
