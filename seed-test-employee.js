/**
 * Seed script: creates a complete test employee for payroll computation testing.
 * Run with: node seed-test-employee.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host:     process.env.LOCAL_DB_HOST     || '127.0.0.1',
  port:     Number(process.env.LOCAL_DB_PORT) || 3306,
  user:     process.env.LOCAL_DB_USER     || 'root',
  password: process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME     || 'payroll_system',
};

const EMP_CODE     = 'PAYTEST01';
const BASIC_SALARY = 25000;
const DAYS_IN_YEAR = 313;
const HOURS_IN_DAY = 8;

// ─── Math helpers ────────────────────────────────────────────────────────────
const round2  = (n) => Math.round(n * 100) / 100;
const dailyRate  = round2(BASIC_SALARY * 12 / DAYS_IN_YEAR);
const hourlyRate = round2(dailyRate / HOURS_IN_DAY);
const OT_HOURS        = 4;      // 4 hrs OT on 2026-06-05
const LEAVE_DAYS      = 1;      // 1 day absence on 2026-06-12
const LATE_MINUTES    = 45;     // 45 minutes late
const UNDERTIME_MINS  = 30;     // 30 minutes undertime
const RICE_ALLOWANCE      = 2000;
const TRANSPORT_ALLOWANCE = 1500;
const LOAN_AMORTIZATION   = 1000;

async function seed() {
  const pool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true });
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // ── 1. Employee core ──────────────────────────────────────────────────
    const [existRows] = await conn.query(
      'SELECT employee_id FROM employees WHERE emp_code = ? LIMIT 1', [EMP_CODE]
    );
    let empId;

    if (existRows.length) {
      empId = existRows[0].employee_id;
      console.log(`ℹ  Employee ${EMP_CODE} already exists (ID ${empId}). Updating records...`);
    } else {
      const [r] = await conn.query(`
        INSERT INTO employees (emp_code, last_name, first_name, gender, civil_status, status)
        VALUES (?, 'Reyes', 'Maria', 'Female', 'Single', 'Active')
      `, [EMP_CODE]);
      empId = r.insertId;
      console.log(`✅ Created employee ID ${empId}`);
    }

    // ── 2. Employment ─────────────────────────────────────────────────────
    await conn.query(`
      INSERT INTO employee_employment (employee_id, company, department, position, employee_type, date_hired)
      VALUES (?, 'Astreablue Inc.', 'Finance', 'Accountant', 'Regular', '2024-01-15')
      ON DUPLICATE KEY UPDATE department='Finance', position='Accountant'
    `, [empId]);

    // ── 3. Accounts ───────────────────────────────────────────────────────
    await conn.query(`
      INSERT INTO employee_accounts (employee_id, sss_no, pagibig_no, philhealth_no, tin_no, salary_type)
      VALUES (?, '33-1234567-8', '1234-5678-9012', '12-345678901-2', '123-456-789-000', 'Monthly')
      ON DUPLICATE KEY UPDATE salary_type='Monthly'
    `, [empId]);

    // ── 4. Payroll settings ───────────────────────────────────────────────
    await conn.query(`
      INSERT INTO employee_payroll_settings
        (employee_id, payroll_period, main_computation, days_in_year, hours_in_day)
      VALUES (?, 'Semi-Monthly', ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        payroll_period='Semi-Monthly', main_computation=?, days_in_year=?, hours_in_day=?
    `, [empId, BASIC_SALARY, DAYS_IN_YEAR, HOURS_IN_DAY,
               BASIC_SALARY, DAYS_IN_YEAR, HOURS_IN_DAY]);

    // ── 5. Allowance types (create if missing) ────────────────────────────
    await conn.query(`
      INSERT IGNORE INTO allowance_types (allowance_name, is_taxable, default_amount)
      VALUES ('Rice Allowance', 0, 2000), ('Transportation Allowance', 0, 1500)
    `);
    const [[riceType]] = await conn.query(
      "SELECT allowance_type_id FROM allowance_types WHERE allowance_name='Rice Allowance' LIMIT 1"
    );
    const [[transType]] = await conn.query(
      "SELECT allowance_type_id FROM allowance_types WHERE allowance_name='Transportation Allowance' LIMIT 1"
    );

    // ── 6. Employee allowances ────────────────────────────────────────────
    await conn.query('DELETE FROM employee_allowances WHERE employee_id = ?', [empId]);
    await conn.query(`
      INSERT INTO employee_allowances (employee_id, allowance_type_id, amount, period)
      VALUES (?, ?, ?, 'Both'), (?, ?, ?, 'Both')
    `, [empId, riceType.allowance_type_id, RICE_ALLOWANCE,
        empId, transType.allowance_type_id, TRANSPORT_ALLOWANCE]);

    // ── 7. Active loan ────────────────────────────────────────────────────
    await conn.query(
      "DELETE FROM employee_loans WHERE employee_id = ? AND status = 'Active'", [empId]
    );
    await conn.query(`
      INSERT INTO employee_loans
        (employee_id, loan_category, principal_amount, balance_amount,
         amortization_amount, terms_total, terms_paid, payment_frequency, status, start_date)
      VALUES (?, 'Company Loan', 12000, 12000, ?, 12, 0, 'Monthly', 'Active', '2026-01-01')
    `, [empId, LOAN_AMORTIZATION]);

    // ── 8. Approved OT request (June 2026) ───────────────────────────────
    await conn.query(
      "DELETE FROM employee_overtime_requests WHERE employee_id = ? AND overtime_date = '2026-06-05'",
      [empId]
    );
    await conn.query(`
      INSERT INTO employee_overtime_requests
        (employee_id, overtime_date, start_time, end_time, total_hours, reason, status)
      VALUES (?, '2026-06-05', '17:00:00', '21:00:00', ?, 'Month-end closing', 'Approved')
    `, [empId, OT_HOURS]);

    // ── 9. Leave type (create if missing) ────────────────────────────────
    await conn.query(`
      INSERT IGNORE INTO leave_types (leave_name) VALUES ('Vacation Leave')
    `).catch(() => {}); // ignore if column structure differs
    const [[leaveType]] = await conn.query(
      "SELECT leave_type_id FROM leave_types LIMIT 1"
    );
    const leaveTypeId = leaveType?.leave_type_id || 1;

    // ── 10. Approved leave request (1 day, June 2026) ─────────────────────
    await conn.query(
      "DELETE FROM employee_leave_requests WHERE employee_id = ? AND start_date = '2026-06-12'",
      [empId]
    );
    await conn.query(`
      INSERT INTO employee_leave_requests
        (employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
      VALUES (?, ?, '2026-06-12', '2026-06-12', 1, 'Personal errand', 'Approved')
    `, [empId, leaveTypeId]);

    // ── 11. Payroll run for June 2026 First Half ─────────────────────────
    // Use "First Half" (covers Jun 1-15) so OT on Jun-05 and leave on Jun-12 are in range
    const [[grpRow]]    = await conn.query("SELECT group_id  FROM payroll_groups  ORDER BY group_id  LIMIT 1");
    const [[periodRow2]]= await conn.query("SELECT period_id FROM payroll_periods WHERE LOWER(period_name) LIKE '%first%' LIMIT 1");
    const [[monthRow2]] = await conn.query("SELECT month_id  FROM payroll_months  WHERE LOWER(month_name) = 'june'  LIMIT 1");
    const [[yearRow2]]  = await conn.query("SELECT year_id   FROM payroll_years   WHERE year_value        = 2026    LIMIT 1");

    let runId = null;
    let payrollId = null;

    if (grpRow && periodRow2 && monthRow2 && yearRow2) {
      // Check if run already exists
      const [[existRun]] = await conn.query(
        `SELECT run_id FROM payroll_runs
         WHERE group_id=? AND period_id=? AND month_id=? AND year_id=? LIMIT 1`,
        [grpRow.group_id, periodRow2.period_id, monthRow2.month_id, yearRow2.year_id]
      );

      if (existRun) {
        runId = existRun.run_id;
      } else {
        const [runResult] = await conn.query(
          `INSERT INTO payroll_runs (group_id, period_id, month_id, year_id, payroll_range, status)
           VALUES (?, ?, ?, ?, 'First Half June 2026', 'Pending')`,
          [grpRow.group_id, periodRow2.period_id, monthRow2.month_id, yearRow2.year_id]
        );
        runId = runResult.insertId;
      }

      // Check / create employee_payroll record
      const [[existEp]] = await conn.query(
        "SELECT payroll_id FROM employee_payroll WHERE employee_id=? AND run_id=? LIMIT 1",
        [empId, runId]
      );

      if (existEp) {
        payrollId = existEp.payroll_id;
      } else {
        const [epResult] = await conn.query(
          `INSERT INTO employee_payroll (run_id, employee_id, basic_salary, payroll_status)
           VALUES (?, ?, ?, 'Active')`,
          [runId, empId, BASIC_SALARY]
        );
        payrollId = epResult.insertId;
      }

      // ── 12. Attendance adjustment (late + undertime) ─────────────────
      const [[existAdj]] = await conn.query(
        "SELECT adj_id FROM payroll_attendance_adjustments WHERE employee_id=? AND run_id=? LIMIT 1",
        [empId, runId]
      );

      const lateAmt      = round2((LATE_MINUTES   / 60) * hourlyRate);
      const undertimeAmt = round2((UNDERTIME_MINS / 60) * hourlyRate);

      if (existAdj) {
        await conn.query(
          `UPDATE payroll_attendance_adjustments
           SET late_time=?, late_amt=?, undertime_time=?, undertime_amt=?
           WHERE employee_id=? AND run_id=?`,
          [LATE_MINUTES, lateAmt, UNDERTIME_MINS, undertimeAmt, empId, runId]
        );
      } else {
        await conn.query(
          `INSERT INTO payroll_attendance_adjustments
             (payroll_id, run_id, employee_id, late_time, late_amt, undertime_time, undertime_amt,
              basic_salary_time, basic_salary_amt, absences_time, absences_amt, others_amt,
              gsis_emp, gsis_employer, gsis_ecc, sss_emp, sss_employer, sss_ecc,
              pagibig_emp, pagibig_employer, pagibig_ecc,
              philhealth_emp, philhealth_employer, philhealth_ecc, tax_withheld)
           VALUES (?,?,?, ?,?, ?,?, 0,0, 0,0, 0, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0)`,
          [payrollId, runId, empId, LATE_MINUTES, lateAmt, UNDERTIME_MINS, undertimeAmt]
        );
      }

      console.log(`✅ Payroll run ID ${runId}, attendance seeded (late=${LATE_MINUTES}min, undertime=${UNDERTIME_MINS}min)`);
    } else {
      console.log('⚠  Could not create payroll run — payroll_groups/periods/months/years may be empty.');
      console.log('   Late/undertime test data was NOT seeded. Create a payroll run manually first.');
    }

    await conn.commit();

    // ── Print expected payroll summary ────────────────────────────────────
    const otPay           = round2(OT_HOURS * hourlyRate * 1.25);
    const absenceDeduct   = round2(LEAVE_DAYS * dailyRate);
    const lateDeduct      = round2((LATE_MINUTES   / 60) * hourlyRate);
    const undertimeDeduct = round2((UNDERTIME_MINS / 60) * hourlyRate);
    const grossPay        = round2(
      BASIC_SALARY + otPay - absenceDeduct - lateDeduct - undertimeDeduct
      + RICE_ALLOWANCE + TRANSPORT_ALLOWANCE
    );

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  TEST EMPLOYEE CREATED');
    console.log('══════════════════════════════════════════════════════');
    console.log(`  Emp Code    : ${EMP_CODE}`);
    console.log(`  Name        : Maria Reyes`);
    console.log(`  Department  : Finance`);
    console.log(`  Payroll ID  : ${empId}`);
    console.log('');
    console.log('  ── Payroll Computation (June 2026 Monthly) ──');
    console.log(`  Basic Salary                            : PHP ${BASIC_SALARY.toLocaleString('en-PH', {minimumFractionDigits:2})}`);
    console.log(`  Daily Rate  (${BASIC_SALARY}×12÷${DAYS_IN_YEAR})          : PHP ${dailyRate}`);
    console.log(`  Hourly Rate (÷${HOURS_IN_DAY})                      : PHP ${hourlyRate}`);
    console.log('');
    console.log(`  + OT Pay       (${OT_HOURS} hrs × ${hourlyRate} × 1.25) : PHP ${otPay}`);
    console.log(`  - Absence Ded. (1 day × ${dailyRate})       : PHP ${absenceDeduct}`);
    console.log(`  - Late Ded.    (${LATE_MINUTES} min × ${hourlyRate}/hr ÷ 60)  : PHP ${lateDeduct}`);
    console.log(`  - Undertime    (${UNDERTIME_MINS} min × ${hourlyRate}/hr ÷ 60)  : PHP ${undertimeDeduct}`);
    console.log(`  + Rice Allowance       (non-taxable)    : PHP ${RICE_ALLOWANCE.toLocaleString()}`);
    console.log(`  + Transportation       (non-taxable)    : PHP ${TRANSPORT_ALLOWANCE.toLocaleString()}`);
    console.log(`  - Loan Deduction       (monthly)        : PHP ${LOAN_AMORTIZATION.toLocaleString()}`);
    console.log('');
    console.log(`  Estimated Gross Pay                     : PHP ${grossPay.toLocaleString('en-PH', {minimumFractionDigits:2})}`);
    console.log('  SSS / Pag-IBIG / PhilHealth / Tax → computed from tables');
    console.log('══════════════════════════════════════════════════════');
    if (runId) {
      console.log(`\n  → In Payroll Computation: Payroll Group = any, Period = First Half,`);
      console.log(`    Month = June, Year = 2026 → Proceed to Computation (run ID ${runId})`);
      console.log(`    Click PAYTEST01 (Maria Reyes) — all fields should auto-fill.\n`);
    }

  } catch (err) {
    await conn.rollback();
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();
