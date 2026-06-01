function Card({ label, value, note }) {
  return (
    <article className="card">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <p className="muted">{note}</p> : null}
    </article>
  );
}

export function AboutUsContent() {
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        AstreaBlue provides HRIS and payroll solutions to streamline employee records, attendance,
        leave, payroll processing, and compliance reporting.
      </p>
      <div className="card-grid" style={{ marginTop: 14 }}>
        <Card label="Platform" value="HRIS + Payroll" note="Employee data, timekeeping, payroll runs, and exports." />
        <Card label="Security" value="Role-based access" note="Designed for admin, HR, and employee roles." />
        <Card label="Reporting" value="Operational + Compliance" note="Payroll journals, payslips, audit logs, and templates." />
      </div>
    </>
  );
}

export function HelpContent() {
  return (
    <>
      <h4 style={{ margin: 0 }}>Getting Started</h4>
      <ul className="help-list">
        <li><strong>Employee Records:</strong> Complete employee profile, employment info, and government IDs.</li>
        <li><strong>Attendance & Leave:</strong> Review logs and approvals before generating payroll.</li>
        <li><strong>Payroll Computation:</strong> Create a payroll run and generate payroll entries.</li>
        <li><strong>Reports:</strong> Select payroll group, period, month, and year then generate/export.</li>
      </ul>

      <h4 style={{ margin: '14px 0 0' }}>Troubleshooting</h4>
      <ul className="help-list">
        <li><strong>Server error on Generate:</strong> Confirm the server is running and your payroll run exists.</li>
        <li><strong>No records returned:</strong> Try another period/month/year with generated payroll.</li>
        <li><strong>Export not downloading:</strong> Use Ctrl+F5 or try a different browser.</li>
      </ul>
    </>
  );
}

export function ContactsContent() {
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Use the details below for support requests and service coordination.
      </p>
      <div className="card-grid" style={{ marginTop: 14 }}>
        <Card label="Email" value="support@astreablue.example" note="Bug reports, exports, and access concerns." />
        <Card label="Phone" value="(+63) 000 000 0000" note="Weekdays 8:00 AM – 5:00 PM (Asia/Manila)." />
        <Card label="Location" value="Manila, Philippines" note="Business hours by appointment." />
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Tell me your real contact details and I’ll replace these placeholders.
      </p>
    </>
  );
}

