export default function HelpPage() {
  return (
    <>
      <header className="header">
        <h2>Help</h2>
        <p>Guides, tips, and troubleshooting for the Payroll + HRIS system.</p>
      </header>

      <section className="table-section">
        <h3>Getting Started</h3>
        <ul className="help-list">
          <li><strong>Set Up Company Info:</strong> Go to <em>System Tools → Company Settings</em> to fill in your company profile, upload your logo, and define corporate policies.</li>
          <li><strong>Add Employees:</strong> Go to <em>HRIS → Employee File</em> and add each employee with their personal details, employment info, and government IDs (SSS, PhilHealth, Pag-IBIG, TIN).</li>
          <li><strong>Assign Schedules:</strong> Use <em>Schedule Management</em> to set up work schedules and assign them to employees before running payroll.</li>
          <li><strong>Configure Deductions:</strong> Review BIR tax brackets and government contribution tables under <em>System Tools → System Configuration</em> to make sure they are up to date.</li>
        </ul>
      </section>

      <section className="table-section">
        <h3>Running Payroll</h3>
        <ul className="help-list">
          <li><strong>Review Attendance:</strong> Confirm all attendance records are complete and approved under <em>Employee Attendance</em> before generating payroll.</li>
          <li><strong>Approve Leave & Overtime:</strong> Make sure all pending leave and overtime requests are approved or rejected before the payroll cut-off date.</li>
          <li><strong>Payroll Computation:</strong> Go to <em>Payroll Computation</em>, select the payroll period and group, then click <em>Generate</em> to compute payroll for all employees in that run.</li>
          <li><strong>Review Results:</strong> Check each employee's net pay, deductions, and allowances before finalizing. Use the <em>Payslip</em> report to preview individual payslips.</li>
          <li><strong>Generate Reports:</strong> Use <em>Payroll Summary Report</em> to export payroll journals, gross pay, net pay, and reconciliation details as PDF or CSV.</li>
        </ul>
      </section>

      <section className="table-section">
        <h3>Modules Overview</h3>
        <ul className="help-list">
          <li><strong>Employee File:</strong> Manage complete employee profiles including personal info, employment details, government IDs, and salary.</li>
          <li><strong>201 Files:</strong> Upload and manage employee documents such as contracts, clearances, and certifications.</li>
          <li><strong>Leave Management:</strong> Review and approve or reject employee leave requests. Track leave balances per employee.</li>
          <li><strong>Overtime Management:</strong> Review and process overtime requests. Approved overtime is automatically factored into payroll.</li>
          <li><strong>Loan Deductions:</strong> Add employee loans and set up automatic deduction schedules that apply each payroll period.</li>
          <li><strong>Year-End Payroll:</strong> Generate 13th month pay computation and year-end tax adjustments (annualization).</li>
          <li><strong>Government Reports:</strong> Generate SSS, PhilHealth, Pag-IBIG, and BIR alphalist reports for submission to government agencies.</li>
          <li><strong>Auditing:</strong> Review a full log of all system actions — who did what and when — for compliance and investigation.</li>
        </ul>
      </section>

      <section className="table-section">
        <h3>Troubleshooting</h3>
        <ul className="help-list">
          <li><strong>Server error on Generate:</strong> Make sure the server is running and the payroll run exists for the selected period. Refresh the page and try again.</li>
          <li><strong>No rows returned in reports:</strong> Try a different month/year or confirm employees have been included in the payroll run for that period.</li>
          <li><strong>Export does not download:</strong> Try a hard refresh (Ctrl+F5) or use a different browser. Disable pop-up blockers for this site.</li>
          <li><strong>Cannot log in:</strong> Check your Employee ID and password. If forgotten, ask your system administrator to reset your password under <em>User Settings</em>.</li>
          <li><strong>Payslip shows wrong deductions:</strong> Verify the BIR tax brackets and government contribution tables in <em>System Configuration</em> are correct for the current period.</li>
          <li><strong>Attendance not reflecting:</strong> Confirm that the attendance records have been saved and the date range matches the payroll period.</li>
          <li><strong>Logo not saving:</strong> Ensure the image file is under 5MB. PNG or JPG formats are recommended.</li>
        </ul>
      </section>

      <section className="table-section">
        <h3>Frequently Asked Questions</h3>
        <ul className="help-list">
          <li>
            <strong>How is the 13th month pay computed?</strong>
            <br />
            13th month pay is computed as 1/12 of the total basic salary earned during the calendar year. Go to <em>Year-End Payroll</em> to generate the computation.
          </li>
          <li>
            <strong>How do I reset an employee's password?</strong>
            <br />
            Administrators can reset passwords from <em>Employee File → select employee → Account tab</em> or from <em>User Settings</em>.
          </li>
          <li>
            <strong>Can employees view their own payslips?</strong>
            <br />
            Yes. Employees can log in and go to <em>Payroll Information</em> to view their payslip history and download their latest payslip.
          </li>
          <li>
            <strong>How do I update SSS, PhilHealth, or Pag-IBIG contribution rates?</strong>
            <br />
            Go to <em>System Tools → System Configuration → Contribution Tables</em> and update the brackets. Click <em>Load Defaults</em> to restore the latest standard rates.
          </li>
          <li>
            <strong>What happens if I miss approving a leave before payroll?</strong>
            <br />
            Unapproved leave will not be deducted from the employee's leave balance. You can still process the deduction manually in the next payroll period.
          </li>
        </ul>
      </section>
    </>
  );
}
