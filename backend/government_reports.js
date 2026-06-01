const crypto = require('crypto');

module.exports = function registerGovernmentReportRoutes(app, pool) {
  const ID_CIPHER_PREFIX = 'enc:v1';

  function getEncryptionKey() {
    const source = process.env.EMPLOYEE_ID_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'payroll_secret_key';
    return crypto.createHash('sha256').update(source).digest();
  }

  function decryptSensitiveValue(storedValue) {
    const value = String(storedValue || '').trim();
    if (!value) return '';

    if (!value.startsWith(`${ID_CIPHER_PREFIX}:`)) {
      return value;
    }

    try {
      const [, ivB64, tagB64, encryptedB64] = value.split(':');
      const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedB64, 'base64')),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch {
      return '';
    }
  }

  function asNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function escapeCsv(value) {
    const text = String(value ?? '');
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  }

  function sendCsv(res, filename, headers, rows) {
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(`\ufeff${csv}`);
  }

  function normalizeString(value) {
    const text = String(value ?? '').trim();
    return text;
  }

  function parsePositiveInt(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function parseBoolean(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(text);
  }

  function parseTransactionOption(value) {
    const text = String(value ?? '').trim().toLowerCase();
    if (text === 'active' || text === 'hold') return text;
    return 'all';
  }

  async function fetchRuns(conn, { groupId }) {
    const params = [];
    const where = [];

    if (groupId) {
      where.push('group_id = ?');
      params.push(groupId);
    }

    const [rows] = await conn.query(
      `
        SELECT run_id, group_id, period_id, month_id, year_id, payroll_range, status, date_created
        FROM payroll_runs
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY run_id DESC
        LIMIT 250
      `,
      params
    );

    return rows;
  }

  async function fetchEmploymentFilters(conn) {
    const [companyRows] = await conn.query(
      `SELECT DISTINCT TRIM(company) AS value FROM employee_employment WHERE company IS NOT NULL AND TRIM(company) <> '' ORDER BY value ASC`
    );
    const [departmentRows] = await conn.query(
      `SELECT DISTINCT TRIM(department) AS value FROM employee_employment WHERE department IS NOT NULL AND TRIM(department) <> '' ORDER BY value ASC`
    );

    return {
      companies: companyRows.map((row) => row.value).filter(Boolean),
      departments: departmentRows.map((row) => row.value).filter(Boolean)
    };
  }

  app.get('/api/government-reports/sss/options', async (req, res) => {
    const groupId = normalizeString(req.query.group_id);

    const conn = await pool.getConnection();
    try {
      const [runs, filters] = await Promise.all([
        fetchRuns(conn, { groupId }),
        fetchEmploymentFilters(conn)
      ]);

      res.json({ success: true, runs, filters });
    } catch (err) {
      console.error('SSS options error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      conn.release();
    }
  });

  app.get('/api/government-reports/sss-collection', async (req, res) => {
    const fromRunId = parsePositiveInt(req.query.from_run_id || req.query.fromRunId);
    const toRunId = parsePositiveInt(req.query.to_run_id || req.query.toRunId);
    const transaction = parseTransactionOption(req.query.transaction);
    const excludeZero = parseBoolean(req.query.exclude_zero ?? req.query.excludeZero ?? true);
    const company = normalizeString(req.query.company);
    const department = normalizeString(req.query.department);

    if (!fromRunId || !toRunId) {
      return res.status(400).json({ success: false, message: 'from_run_id and to_run_id are required' });
    }

    const runStart = Math.min(fromRunId, toRunId);
    const runEnd = Math.max(fromRunId, toRunId);

    const conn = await pool.getConnection();
    try {
      const [runRows] = await conn.query(
        `
          SELECT run_id, payroll_range
          FROM payroll_runs
          WHERE run_id BETWEEN ? AND ?
          ORDER BY run_id ASC
        `,
        [runStart, runEnd]
      );

      if (!runRows.length) {
        return res.status(404).json({ success: false, message: 'No payroll runs found in the selected range.' });
      }

      const params = [runStart, runEnd];
      const where = [
        'p.run_id BETWEEN ? AND ?'
      ];

      if (transaction !== 'all') {
        where.push('p.payroll_status = ?');
        params.push(transaction === 'active' ? 'Active' : 'Hold');
      }

      if (company) {
        where.push('TRIM(em.company) = TRIM(?)');
        params.push(company);
      }

      if (department) {
        where.push('TRIM(em.department) = TRIM(?)');
        params.push(department);
      }

      const [rows] = await conn.query(
        `
          SELECT
            e.employee_id,
            e.emp_code,
            e.last_name,
            e.first_name,
            e.middle_name,
            a.sss_no AS sss_no,
            em.company AS company,
            em.department AS department,
            SUM(p.sss_employee) AS sss_employee,
            SUM(p.sss_employer) AS sss_employer,
            SUM(p.sss_ecc) AS sss_ecc
          FROM employee_payroll p
          INNER JOIN employees e ON e.employee_id = p.employee_id
          LEFT JOIN employee_accounts a ON a.employee_id = e.employee_id
          LEFT JOIN employee_employment em ON em.employee_id = e.employee_id
          WHERE ${where.join(' AND ')}
          GROUP BY
            e.employee_id, e.emp_code, e.last_name, e.first_name, e.middle_name,
            a.sss_no, em.company, em.department
          ORDER BY
            TRIM(em.company) ASC,
            TRIM(em.department) ASC,
            e.emp_code ASC
        `,
        params
      );

      const normalizedRows = rows.map((row) => {
        const ee = Number(row.sss_employee || 0);
        const er = Number(row.sss_employer || 0);
        const ecc = Number(row.sss_ecc || 0);
        const total = ee + er + ecc;

        return {
          ...row,
          sss_no: decryptSensitiveValue(row.sss_no),
          company: normalizeString(row.company) || 'Business Setup',
          department: normalizeString(row.department) || 'Unassigned',
          sss_employee: ee,
          sss_employer: er,
          sss_ecc: ecc,
          total
        };
      }).filter((row) => (excludeZero ? row.total !== 0 : true));

      const ranges = runRows
        .map((r) => normalizeString(r.payroll_range))
        .filter(Boolean);
      const rangeLabel =
        ranges.length === 1
          ? ranges[0]
          : `${ranges[0] || `Run ${runStart}`} - ${ranges[ranges.length - 1] || `Run ${runEnd}`}`;

      const grouped = new Map();
      for (const row of normalizedRows) {
        const key = `${row.company}|||${row.department}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
      }

      const outputRows = [];
      let grandEe = 0;
      let grandEr = 0;
      let grandEcc = 0;
      let grandTotal = 0;

      for (const [key, groupRows] of grouped.entries()) {
        const [groupCompany, groupDepartment] = key.split('|||');
        outputRows.push([`Company Name: ${groupCompany}`, '', '', '', '', '', '']);
        outputRows.push([`Department: ${groupDepartment}`, '', '', '', '', '', '']);

        let subEe = 0;
        let subEr = 0;
        let subEcc = 0;
        let subTotal = 0;

        for (const row of groupRows) {
          const employeeName = `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim();
          outputRows.push([
            employeeName,
            row.emp_code || '',
            row.sss_no || '',
            row.sss_employee.toFixed(2),
            row.sss_employer.toFixed(2),
            row.sss_ecc.toFixed(2),
            row.total.toFixed(2)
          ]);
          subEe += row.sss_employee;
          subEr += row.sss_employer;
          subEcc += row.sss_ecc;
          subTotal += row.total;
        }

        outputRows.push(['SUBTOTAL', '', '', subEe.toFixed(2), subEr.toFixed(2), subEcc.toFixed(2), subTotal.toFixed(2)]);
        outputRows.push(['', '', '', '', '', '', '']);

        grandEe += subEe;
        grandEr += subEr;
        grandEcc += subEcc;
        grandTotal += subTotal;
      }

      outputRows.push(['GRAND TOTAL', '', '', grandEe.toFixed(2), grandEr.toFixed(2), grandEcc.toFixed(2), grandTotal.toFixed(2)]);

      outputRows.unshift(['', '', '', '', '', '', '']);
      outputRows.unshift([`Covered Range: ${rangeLabel}`, '', '', '', '', '', '']);
      outputRows.unshift(['SSS CONTRIBUTION COLLECTION LIST', '', '', '', '', '', '']);

      sendCsv(
        res,
        `SSS-Collection-${runStart}-to-${runEnd}.csv`,
        [
          'Employee Name',
          'Employee ID',
          'Employee SSS ID',
          'EMPLOYEE SSS',
          'EMPLOYER SSS',
          'ECC',
          'TOTAL'
        ],
        outputRows
      );
    } catch (err) {
      console.error('SSS collection export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      conn.release();
    }
  });

  async function fetchMonthlyContributions({ year, month, fields, idField }) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `
          SELECT
            e.employee_id,
            e.emp_code,
            e.last_name,
            e.first_name,
            e.middle_name,
            a.${idField} AS government_id,
            ${fields.map((field) => `SUM(p.${field}) AS ${field}`).join(',\n            ')}
          FROM employee_payroll p
          INNER JOIN payroll_runs r ON r.run_id = p.run_id
          INNER JOIN employees e ON e.employee_id = p.employee_id
          LEFT JOIN employee_accounts a ON a.employee_id = e.employee_id
          WHERE r.year_id = ? AND r.month_id = ? AND (p.payroll_status IS NULL OR p.payroll_status = 'Active')
          GROUP BY e.employee_id, e.emp_code, e.last_name, e.first_name, e.middle_name, a.${idField}
          ORDER BY e.emp_code ASC
        `,
        [String(year), String(month)]
      );

      return rows.map((row) => ({
        ...row,
        government_id: decryptSensitiveValue(row.government_id)
      }));
    } finally {
      conn.release();
    }
  }

  async function fetchMonthlyBir({ year, month }) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `
          SELECT
            e.employee_id,
            e.emp_code,
            e.last_name,
            e.first_name,
            e.middle_name,
            a.tin_no AS tin_no,
            SUM(p.basic_salary) AS basic_salary,
            SUM(p.taxable_allowances) AS taxable_allowances,
            SUM(p.non_taxable_allowances) AS non_taxable_allowances,
            SUM(p.gross_pay) AS gross_pay,
            SUM(p.tax_withheld) AS tax_withheld
          FROM employee_payroll p
          INNER JOIN payroll_runs r ON r.run_id = p.run_id
          INNER JOIN employees e ON e.employee_id = p.employee_id
          LEFT JOIN employee_accounts a ON a.employee_id = e.employee_id
          WHERE r.year_id = ? AND r.month_id = ? AND (p.payroll_status IS NULL OR p.payroll_status = 'Active')
          GROUP BY e.employee_id, e.emp_code, e.last_name, e.first_name, e.middle_name, a.tin_no
          ORDER BY e.emp_code ASC
        `,
        [String(year), String(month)]
      );

      return rows.map((row) => ({
        ...row,
        tin_no: decryptSensitiveValue(row.tin_no)
      }));
    } finally {
      conn.release();
    }
  }

  async function fetchAnnualBir({ year }) {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `
          SELECT
            e.employee_id,
            e.emp_code,
            e.last_name,
            e.first_name,
            e.middle_name,
            a.tin_no AS tin_no,
            SUM(p.basic_salary) AS basic_salary,
            SUM(p.taxable_allowances) AS taxable_allowances,
            SUM(p.non_taxable_allowances) AS non_taxable_allowances,
            SUM(p.gross_pay) AS gross_pay,
            SUM(p.tax_withheld) AS tax_withheld
          FROM employee_payroll p
          INNER JOIN payroll_runs r ON r.run_id = p.run_id
          INNER JOIN employees e ON e.employee_id = p.employee_id
          LEFT JOIN employee_accounts a ON a.employee_id = e.employee_id
          WHERE r.year_id = ? AND (p.payroll_status IS NULL OR p.payroll_status = 'Active')
          GROUP BY e.employee_id, e.emp_code, e.last_name, e.first_name, e.middle_name, a.tin_no
          ORDER BY e.emp_code ASC
        `,
        [String(year)]
      );

      return rows.map((row) => ({
        ...row,
        tin_no: decryptSensitiveValue(row.tin_no)
      }));
    } finally {
      conn.release();
    }
  }

  app.get('/api/government-reports/sss', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });

    try {
      const data = await fetchMonthlyContributions({
        year,
        month,
        idField: 'sss_no',
        fields: ['sss_employee', 'sss_employer', 'sss_ecc']
      });

      const rows = data.map((row) => ([
        row.emp_code,
        `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim(),
        row.government_id,
        Number(row.sss_employee || 0).toFixed(2),
        Number(row.sss_employer || 0).toFixed(2),
        Number(row.sss_ecc || 0).toFixed(2),
        (Number(row.sss_employee || 0) + Number(row.sss_employer || 0) + Number(row.sss_ecc || 0)).toFixed(2)
      ]));

      sendCsv(res, `SSS-R3-R5-${year}-${String(month).padStart(2, '0')}.csv`, [
        'Employee Code',
        'Employee Name',
        'SSS Number',
        'EE Share',
        'ER Share',
        'ECC',
        'Total'
      ], rows);
    } catch (err) {
      console.error('SSS export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/philhealth', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });

    try {
      const data = await fetchMonthlyContributions({
        year,
        month,
        idField: 'philhealth_no',
        fields: ['philhealth_employee', 'philhealth_employer']
      });

      const rows = data.map((row) => ([
        row.emp_code,
        `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim(),
        row.government_id,
        Number(row.philhealth_employee || 0).toFixed(2),
        Number(row.philhealth_employer || 0).toFixed(2),
        (Number(row.philhealth_employee || 0) + Number(row.philhealth_employer || 0)).toFixed(2)
      ]));

      sendCsv(res, `PhilHealth-RF1-${year}-${String(month).padStart(2, '0')}.csv`, [
        'Employee Code',
        'Employee Name',
        'PhilHealth Number',
        'EE Share',
        'ER Share',
        'Total'
      ], rows);
    } catch (err) {
      console.error('PhilHealth export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/pagibig', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });

    try {
      const data = await fetchMonthlyContributions({
        year,
        month,
        idField: 'pagibig_no',
        fields: ['pagibig_employee', 'pagibig_employer']
      });

      const rows = data.map((row) => ([
        row.emp_code,
        `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim(),
        row.government_id,
        Number(row.pagibig_employee || 0).toFixed(2),
        Number(row.pagibig_employer || 0).toFixed(2),
        (Number(row.pagibig_employee || 0) + Number(row.pagibig_employer || 0)).toFixed(2)
      ]));

      sendCsv(res, `PagIBIG-MCRF-${year}-${String(month).padStart(2, '0')}.csv`, [
        'Employee Code',
        'Employee Name',
        'Pag-IBIG Number',
        'EE Share',
        'ER Share',
        'Total'
      ], rows);
    } catch (err) {
      console.error('Pag-IBIG export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/bir-1601c', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });

    try {
      const data = await fetchMonthlyBir({ year, month });
      const rows = data.map((row) => ([
        row.emp_code,
        `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim(),
        row.tin_no,
        Number(row.basic_salary || 0).toFixed(2),
        Number(row.taxable_allowances || 0).toFixed(2),
        Number(row.non_taxable_allowances || 0).toFixed(2),
        Number(row.gross_pay || 0).toFixed(2),
        Number(row.tax_withheld || 0).toFixed(2)
      ]));

      sendCsv(res, `BIR-1601C-${year}-${String(month).padStart(2, '0')}.csv`, [
        'Employee Code',
        'Employee Name',
        'TIN',
        'Basic Salary',
        'Taxable Allowances',
        'Non-Taxable Allowances',
        'Gross Pay',
        'Tax Withheld'
      ], rows);
    } catch (err) {
      console.error('BIR 1601-C export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/bir-2316', async (req, res) => {
    const year = asNumber(req.query.year);
    if (!year) return res.status(400).json({ success: false, message: 'year is required' });

    try {
      const data = await fetchAnnualBir({ year });
      const rows = data.map((row) => ([
        row.emp_code,
        `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim(),
        row.tin_no,
        Number(row.basic_salary || 0).toFixed(2),
        Number(row.taxable_allowances || 0).toFixed(2),
        Number(row.non_taxable_allowances || 0).toFixed(2),
        Number(row.gross_pay || 0).toFixed(2),
        Number(row.tax_withheld || 0).toFixed(2)
      ]));

      sendCsv(res, `BIR-2316-${year}.csv`, [
        'Employee Code',
        'Employee Name',
        'TIN',
        'Annual Basic Salary',
        'Annual Taxable Allowances',
        'Annual Non-Taxable Allowances',
        'Annual Gross Pay',
        'Annual Tax Withheld'
      ], rows);
    } catch (err) {
      console.error('BIR 2316 export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/bir-1604c', async (req, res) => {
    const year = asNumber(req.query.year);
    if (!year) return res.status(400).json({ success: false, message: 'year is required' });

    try {
      const data = await fetchAnnualBir({ year });
      const totals = data.reduce((acc, row) => {
        acc.basic_salary += Number(row.basic_salary || 0);
        acc.taxable_allowances += Number(row.taxable_allowances || 0);
        acc.non_taxable_allowances += Number(row.non_taxable_allowances || 0);
        acc.gross_pay += Number(row.gross_pay || 0);
        acc.tax_withheld += Number(row.tax_withheld || 0);
        return acc;
      }, { basic_salary: 0, taxable_allowances: 0, non_taxable_allowances: 0, gross_pay: 0, tax_withheld: 0 });

      const rows = data.map((row) => ([
        'DETAIL',
        row.emp_code,
        `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim(),
        row.tin_no,
        Number(row.gross_pay || 0).toFixed(2),
        Number(row.tax_withheld || 0).toFixed(2)
      ]));

      rows.unshift([
        'SUMMARY',
        '',
        `Employee Count: ${data.length}`,
        '',
        totals.gross_pay.toFixed(2),
        totals.tax_withheld.toFixed(2)
      ]);

      sendCsv(res, `BIR-1604C-${year}.csv`, [
        'Row Type',
        'Employee Code',
        'Employee Name',
        'TIN',
        'Annual Gross Pay',
        'Annual Tax Withheld'
      ], rows);
    } catch (err) {
      console.error('BIR 1604-C export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/bir-alphalist', async (req, res) => {
    const year = asNumber(req.query.year);
    if (!year) return res.status(400).json({ success: false, message: 'year is required' });

    try {
      const data = await fetchAnnualBir({ year });
      const rows = data.map((row) => ([
        row.emp_code,
        `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim(),
        row.tin_no,
        Number(row.basic_salary || 0).toFixed(2),
        Number(row.taxable_allowances || 0).toFixed(2),
        Number(row.non_taxable_allowances || 0).toFixed(2),
        Number(row.gross_pay || 0).toFixed(2),
        Number(row.tax_withheld || 0).toFixed(2)
      ]));

      sendCsv(res, `BIR-Alphalist-${year}.csv`, [
        'Employee Code',
        'Employee Name',
        'TIN',
        'Annual Basic Salary',
        'Annual Taxable Allowances',
        'Annual Non-Taxable Allowances',
        'Annual Gross Pay',
        'Annual Tax Withheld'
      ], rows);
    } catch (err) {
      console.error('BIR Alphalist export error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });
};
