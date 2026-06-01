export default function AboutUsPage() {
  return (
    <>
      <header className="header">
        <h2>About Us</h2>
        <p>Learn more about AstreaBlue and the Payroll + HRIS platform.</p>
      </header>

      <section className="table-section">
        <h3>AstreaBlue</h3>
        <p>
          AstreaBlue provides HRIS and payroll solutions designed to streamline employee records,
          attendance, leave, payroll computation, and statutory reporting.
        </p>

        <div className="card-grid" style={{ marginTop: 14 }}>
          <article className="card">
            <span>Focus</span>
            <strong>HRIS + Payroll</strong>
            <p className="muted">Employee data, timekeeping, payroll processing, and compliance exports.</p>
          </article>
          <article className="card">
            <span>Security</span>
            <strong>Data protection</strong>
            <p className="muted">Role-based access and encrypted storage for sensitive IDs.</p>
          </article>
          <article className="card">
            <span>Reporting</span>
            <strong>Operational + Compliance</strong>
            <p className="muted">Payroll summaries, payslips, audit logs, and government report exports.</p>
          </article>
        </div>
      </section>
    </>
  );
}

