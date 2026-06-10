module.exports = function (app, pool) {
  function toMoney(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function roundMoney(v) {
    return Math.round(toMoney(v) * 100) / 100;
  }

  // TRAIN Law annual income tax brackets (effective 2023+)
  function annualTaxDue(annualTaxable) {
    const t = Math.max(0, annualTaxable);
    if (t <= 250000) return 0;
    if (t <= 400000) return (t - 250000) * 0.15;
    if (t <= 800000) return 22500 + (t - 400000) * 0.20;
    if (t <= 2000000) return 102500 + (t - 800000) * 0.25;
    if (t <= 8000000) return 402500 + (t - 2000000) * 0.30;
    return 2202500 + (t - 8000000) * 0.35;
  }

  // ── Annual Payroll Summary ─────────────────────────────────────────────────
  app.get('/api/annual_payroll_summary', async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    let conn;
    try {
      conn = await pool.getConnection();

      const [rows] = await conn.query(
        `SELECT
          e.employee_id,
          e.emp_code,
          TRIM(CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name)) AS employee_name,
          ee.department,
          ee.position,
          COUNT(DISTINCT CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.payroll_id
          END) AS payroll_count,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.gross_pay ELSE 0
          END), 0) AS annual_gross,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.sss_employee ELSE 0
          END), 0) AS annual_sss,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.philhealth_employee ELSE 0
          END), 0) AS annual_philhealth,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.pagibig_employee ELSE 0
          END), 0) AS annual_pagibig,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.tax_withheld ELSE 0
          END), 0) AS annual_tax_withheld,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.net_pay ELSE 0
          END), 0) AS annual_net
        FROM employees e
        LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
        LEFT JOIN employee_payroll ep ON ep.employee_id = e.employee_id
        LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
        LEFT JOIN payroll_years py
          ON py.year_id = CAST(pr.year_id AS UNSIGNED)
          OR py.year_value = CAST(pr.year_id AS UNSIGNED)
        WHERE COALESCE(e.status, 'Active') = 'Active'
        GROUP BY
          e.employee_id, e.emp_code,
          e.first_name, e.middle_name, e.last_name,
          ee.department, ee.position
        HAVING annual_gross > 0
        ORDER BY ee.department ASC, e.last_name ASC, e.first_name ASC`,
        new Array(21).fill(year)
      );

      const reportRows = rows.map((row) => {
        const gross = toMoney(row.annual_gross);
        const net = toMoney(row.annual_net);
        return {
          ...row,
          annual_gross: gross,
          annual_sss: toMoney(row.annual_sss),
          annual_philhealth: toMoney(row.annual_philhealth),
          annual_pagibig: toMoney(row.annual_pagibig),
          annual_tax_withheld: toMoney(row.annual_tax_withheld),
          annual_net: net,
          annual_total_deductions: roundMoney(gross - net)
        };
      });

      const totals = reportRows.reduce(
        (acc, row) => {
          acc.employees += 1;
          acc.annual_gross += row.annual_gross;
          acc.annual_sss += row.annual_sss;
          acc.annual_philhealth += row.annual_philhealth;
          acc.annual_pagibig += row.annual_pagibig;
          acc.annual_tax_withheld += row.annual_tax_withheld;
          acc.annual_net += row.annual_net;
          acc.annual_total_deductions += row.annual_total_deductions;
          return acc;
        },
        {
          employees: 0,
          annual_gross: 0,
          annual_sss: 0,
          annual_philhealth: 0,
          annual_pagibig: 0,
          annual_tax_withheld: 0,
          annual_net: 0,
          annual_total_deductions: 0
        }
      );

      res.json({ success: true, year, rows: reportRows, totals });
    } catch (err) {
      console.error('Annual payroll summary error:', err);
      res.status(500).json({ success: false, message: 'Unable to generate annual payroll summary.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── Year-End Tax Adjustment (YETA) ─────────────────────────────────────────
  app.get('/api/year_end_tax_adjustment', async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    let conn;
    try {
      conn = await pool.getConnection();

      const [rows] = await conn.query(
        `SELECT
          e.employee_id,
          e.emp_code,
          TRIM(CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name)) AS employee_name,
          ee.department,
          ee.position,
          COALESCE(MAX(eti.tax_status), 'ME') AS tax_status,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN (
              COALESCE(ep.gross_pay, 0)
              - COALESCE(ep.adj_non_comp, 0)
              - COALESCE(ep.non_taxable_allowances, 0)
              - COALESCE(ep.sss_employee, 0)
              - COALESCE(ep.philhealth_employee, 0)
              - COALESCE(ep.pagibig_employee, 0)
            )
            ELSE 0
          END), 0) AS annual_taxable,
          COALESCE(SUM(CASE
            WHEN CAST(pr.year_id AS UNSIGNED) = ?
              OR py.year_value = ?
              OR (pr.run_id IS NULL AND YEAR(ep.date_generated) = ?)
            THEN ep.tax_withheld ELSE 0
          END), 0) AS tax_withheld
        FROM employees e
        LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
        LEFT JOIN employee_tax_insurance eti ON eti.employee_id = e.employee_id
        LEFT JOIN employee_payroll ep ON ep.employee_id = e.employee_id
        LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
        LEFT JOIN payroll_years py
          ON py.year_id = CAST(pr.year_id AS UNSIGNED)
          OR py.year_value = CAST(pr.year_id AS UNSIGNED)
        WHERE COALESCE(e.status, 'Active') = 'Active'
        GROUP BY
          e.employee_id, e.emp_code,
          e.first_name, e.middle_name, e.last_name,
          ee.department, ee.position
        HAVING annual_taxable > 0
        ORDER BY ee.department ASC, e.last_name ASC, e.first_name ASC`,
        [year, year, year, year, year, year]
      );

      const reportRows = rows.map((row) => {
        const annualTaxable = Math.max(0, toMoney(row.annual_taxable));
        const taxWithheld = toMoney(row.tax_withheld);
        const taxDue = roundMoney(annualTaxDue(annualTaxable));
        const yeta = roundMoney(taxDue - taxWithheld);

        return {
          ...row,
          annual_taxable: annualTaxable,
          tax_withheld: taxWithheld,
          tax_due: taxDue,
          yeta,
          yeta_status: yeta > 0 ? 'Additional Payable' : yeta < 0 ? 'For Refund' : 'Balanced'
        };
      });

      const totals = reportRows.reduce(
        (acc, row) => {
          acc.employees += 1;
          acc.annual_taxable += row.annual_taxable;
          acc.tax_withheld += row.tax_withheld;
          acc.tax_due += row.tax_due;
          acc.yeta += row.yeta;
          acc.refund_count += row.yeta < 0 ? 1 : 0;
          acc.payable_count += row.yeta > 0 ? 1 : 0;
          return acc;
        },
        {
          employees: 0,
          annual_taxable: 0,
          tax_withheld: 0,
          tax_due: 0,
          yeta: 0,
          refund_count: 0,
          payable_count: 0
        }
      );

      res.json({ success: true, year, rows: reportRows, totals });
    } catch (err) {
      console.error('YETA error:', err);
      res.status(500).json({ success: false, message: 'Unable to generate year-end tax adjustment.' });
    } finally {
      if (conn) conn.release();
    }
  });
};
