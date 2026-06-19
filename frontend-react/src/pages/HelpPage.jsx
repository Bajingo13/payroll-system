import { useState } from 'react';

const QUICKSTART = [
  { step: '01', title: 'Set Up Company Info', desc: 'Go to System Tools → Company Settings to fill in your company profile, upload your logo, and define policies.', icon: '🏢' },
  { step: '02', title: 'Add Employees', desc: 'Go to HRIS → Employee File and add employees with personal details, employment info, and government IDs.', icon: '👤' },
  { step: '03', title: 'Assign Schedules', desc: 'Use Schedule Management to create work schedules and assign them to employees before running payroll.', icon: '📅' },
  { step: '04', title: 'Run Payroll', desc: 'Go to Payroll Computation, select the period and group, then click Generate to compute payroll.', icon: '💰' },
];

const MODULES = [
  { icon: '👥', name: 'Employee File', desc: 'Complete profiles, government IDs, salary, and 201 documents.' },
  { icon: '🕐', name: 'Attendance', desc: 'Daily timekeeping, overtime tracking, and schedule management.' },
  { icon: '🌿', name: 'Leave Management', desc: 'Approve/reject leaves and track balances per employee.' },
  { icon: '⏰', name: 'Overtime', desc: 'Review and approve OT requests — auto-applied to payroll.' },
  { icon: '💳', name: 'Loan Deductions', desc: 'Employee loans with automatic per-period deduction schedules.' },
  { icon: '📄', name: 'Payroll', desc: 'Computation, payslips, payroll journal, and reconciliation.' },
  { icon: '🏛️', name: 'Gov. Reports', desc: 'SSS, PhilHealth, Pag-IBIG, and BIR alphalist submissions.' },
  { icon: '🎄', name: 'Year-End', desc: '13th month pay computation and annualization.' },
  { icon: '🔍', name: 'Auditing', desc: 'Full action log — who did what and when for compliance.' },
];

const FAQS = [
  { q: 'How is the 13th month pay computed?', a: '13th month pay = 1/12 of total basic salary earned during the calendar year. Generate it from Year-End Payroll.' },
  { q: 'How do I reset an employee\'s password?', a: 'Admins can reset passwords from Employee File → select employee → Account tab, or from User Settings.' },
  { q: 'Can employees view their own payslips?', a: 'Yes. Employees can log in and go to Payroll Information to view and download their payslip history.' },
  { q: 'How do I update SSS/PhilHealth/Pag-IBIG rates?', a: 'Go to System Tools → System Configuration → Contribution Tables. Click Load Defaults to restore latest standard rates.' },
  { q: 'What if I miss approving leave before payroll?', a: 'Unapproved leave won\'t deduct from balance. You can manually process the deduction in the next payroll period.' },
];

const ISSUES = [
  { icon: '⚠️', problem: 'Server error on Generate', fix: 'Make sure the server is running and the payroll run exists. Refresh and try again.' },
  { icon: '📋', problem: 'No rows in reports', fix: 'Check the month/year or confirm employees are included in the payroll run for that period.' },
  { icon: '💾', problem: 'Export does not download', fix: 'Hard refresh (Ctrl+F5) or use a different browser. Disable pop-up blockers for this site.' },
  { icon: '🔑', problem: 'Cannot log in', fix: 'Check your credentials. Ask your admin to reset your password under User Settings.' },
  { icon: '🧾', problem: 'Wrong deductions on payslip', fix: 'Verify BIR tax brackets and contribution tables in System Configuration are correct.' },
];

export default function HelpPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 0 48px' }}>

      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f2044 0%, #1e40af 60%, #3b82f6 100%)',
        borderRadius: 20, padding: '48px 40px', marginBottom: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', right: -40, top: -60 }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Help Center</div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: '#fff' }}>How can we help?</h1>
        <p style={{ margin: '10px 0 0', color: '#bfdbfe', fontSize: 15, maxWidth: 520, lineHeight: 1.6 }}>
          Find guides, module references, troubleshooting tips, and answers to common questions about the HRIS + Payroll system.
        </p>
      </div>

      {/* ── Quick Start ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Getting Started</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 18 }}>Follow these steps to set up the system.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 }}>
          {QUICKSTART.map(q => (
            <div key={q.step} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', position: 'relative' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#1e40af', background: '#eff6ff', borderRadius: 8, padding: '2px 8px', display: 'inline-block', marginBottom: 10 }}>STEP {q.step}</div>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{q.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{q.title}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{q.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modules ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Modules Overview</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 18 }}>Everything available in the system.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {MODULES.map(m => (
            <div key={m.name} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{m.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Troubleshooting ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Troubleshooting</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 18 }}>Common issues and how to fix them.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ISSUES.map(i => (
            <div key={i.problem} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize: 20 }}>{i.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{i.problem}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{i.fix}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ── */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Frequently Asked Questions</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 18 }}>Tap a question to see the answer.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQS.map((f, i) => (
            <div key={i} style={{ background: '#fff', border: `1.5px solid ${openFaq === i ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'border-color .2s' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{f.q}</span>
                <span style={{ fontSize: 18, color: '#3b82f6', marginLeft: 12, flexShrink: 0, transition: 'transform .2s', transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
              </button>
              {openFaq === i && (
                <div style={{ padding: '0 20px 16px', fontSize: 13, color: '#475569', lineHeight: 1.7, borderTop: '1px solid #f1f5f9' }}>
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
