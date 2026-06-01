export default function HelpPage() {
  return (
    <>
      <header className="header">
        <h2>Help</h2>
        <p>Quick tips for using the system.</p>
      </header>

      <section className="table-section">
        <h3>Getting Started</h3>
        <ul className="help-list">
          <li><strong>Employee Records:</strong> Add employees and complete government IDs and employment details.</li>
          <li><strong>Attendance & Leave:</strong> Review logs and approve requests before payroll generation.</li>
          <li><strong>Payroll Computation:</strong> Create a payroll run and generate payroll per group/period.</li>
          <li><strong>Reports:</strong> Use Payroll Summary Report filters to generate and export the report.</li>
        </ul>
      </section>

      <section className="table-section">
        <h3>Troubleshooting</h3>
        <ul className="help-list">
          <li><strong>Server error on Generate:</strong> Make sure the server is running and your payroll run exists for the selected period.</li>
          <li><strong>No rows returned:</strong> Try another month/year or confirm employees are included in the run.</li>
          <li><strong>Export does not download:</strong> Try a hard refresh (Ctrl+F5) or use another browser.</li>
        </ul>
      </section>
    </>
  );
}

