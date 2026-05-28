module.exports = function (app, pool) {
  app.get("/api/thirteenth_month_report", async (req, res) => {
    const requestedYear = Number(req.query.year) || new Date().getFullYear();
    let conn;

    try {
      conn = await pool.getConnection();

      const [rows] = await conn.query(
        `
          SELECT
            e.employee_id,
            e.emp_code,
            TRIM(CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name)) AS employee_name,
            ee.department,
            ee.position,
            ee.date_hired,
            COUNT(DISTINCT CASE
              WHEN CAST(pr.year_id AS UNSIGNED) = ?
                OR py.year_value = ?
                OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
              THEN ep.payroll_id
            END) AS payroll_records,
            COALESCE(SUM(CASE
              WHEN CAST(pr.year_id AS UNSIGNED) = ?
                OR py.year_value = ?
                OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
              THEN ep.basic_salary
              ELSE 0
            END), 0) AS annual_basic,
            COALESCE(SUM(CASE
              WHEN CAST(pr.year_id AS UNSIGNED) = ?
                OR py.year_value = ?
                OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
              THEN ep.absence_deduction
              ELSE 0
            END), 0) AS absence_deductions
          FROM employees e
          LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
          LEFT JOIN employee_payroll ep ON ep.employee_id = e.employee_id
          LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
          LEFT JOIN payroll_years py
            ON py.year_id = CAST(pr.year_id AS UNSIGNED)
            OR py.year_value = CAST(pr.year_id AS UNSIGNED)
          WHERE COALESCE(e.status, 'Active') = 'Active'
          GROUP BY
            e.employee_id,
            e.emp_code,
            e.first_name,
            e.middle_name,
            e.last_name,
            ee.department,
            ee.position,
            ee.date_hired
          ORDER BY ee.department ASC, e.last_name ASC, e.first_name ASC
        `,
        [
          requestedYear,
          requestedYear,
          requestedYear,
          requestedYear,
          requestedYear,
          requestedYear,
          requestedYear,
          requestedYear,
          requestedYear
        ]
      );

      const reportRows = rows.map((row) => {
        const annualBasic = Number(row.annual_basic || 0);
        const absenceDeductions = Number(row.absence_deductions || 0);
        const netBasic = Math.max(0, annualBasic - absenceDeductions);

        return {
          ...row,
          annual_basic: annualBasic,
          absence_deductions: absenceDeductions,
          net_basic: netBasic,
          thirteenth_month_pay: netBasic / 12
        };
      });

      const totals = reportRows.reduce(
        (sum, row) => {
          sum.employees += 1;
          sum.annual_basic += row.annual_basic;
          sum.absence_deductions += row.absence_deductions;
          sum.net_basic += row.net_basic;
          sum.thirteenth_month_pay += row.thirteenth_month_pay;
          return sum;
        },
        {
          employees: 0,
          annual_basic: 0,
          absence_deductions: 0,
          net_basic: 0,
          thirteenth_month_pay: 0
        }
      );

      res.json({
        success: true,
        year: requestedYear,
        rows: reportRows,
        totals
      });
    } catch (err) {
      console.error("13th month report error:", err);
      res.status(500).json({
        success: false,
        message: "Unable to generate 13th month report."
      });
    } finally {
      if (conn) conn.release();
    }
  });
};
