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

  const FILING_STATUSES = ['Draft', 'Validated', 'Reviewed', 'Approved', 'Filed', 'Paid'];
  const REPORT_TYPES = ['SSS-R3', 'PhilHealth-RF1', 'PagIBIG-MCRF', 'BIR-1601C', 'BIR-2316', 'BIR-1604C', 'BIR-Alphalist'];

  async function ensureComplianceTables(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS government_report_filings (
        filing_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        report_type VARCHAR(40) NOT NULL,
        report_year INT NOT NULL,
        report_month INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'Draft',
        filing_reference VARCHAR(150) DEFAULT '',
        payment_reference VARCHAR(150) DEFAULT '',
        filed_at DATETIME NULL,
        paid_at DATETIME NULL,
        amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
        receipt_name VARCHAR(255) DEFAULT '',
        receipt_data MEDIUMTEXT NULL,
        notes TEXT NULL,
        prepared_by VARCHAR(150) DEFAULT '',
        reviewed_by VARCHAR(150) DEFAULT '',
        approved_by VARCHAR(150) DEFAULT '',
        locked_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_government_filing_period (report_type, report_year, report_month)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS government_report_filing_history (
        history_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        filing_id INT NOT NULL,
        previous_status VARCHAR(20) DEFAULT '',
        new_status VARCHAR(20) NOT NULL,
        changed_by VARCHAR(150) DEFAULT '',
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_government_filing_history (filing_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  function filingPeriod(reportType, year, month) {
    return reportType === 'BIR-2316' || reportType === 'BIR-1604C' || reportType === 'BIR-Alphalist'
      ? 0
      : month;
  }

  async function getValidation(conn, year, month) {
    const [companyRows] = await conn.query('SELECT * FROM company_settings WHERE id = 1');
    const company = companyRows[0] || {};
    const employerChecks = [
      ['Company TIN', 'tin'], ['Company address', 'address'], ['SSS Employer Number', 'sss_employer_no'],
      ['PhilHealth PEN', 'philhealth_pen'], ['Pag-IBIG Employer ID', 'pagibig_employer_id'],
      ['BIR RDO Code', 'bir_rdo_code'], ['Authorized signatory', 'authorized_signatory'],
      ['Signatory designation', 'signatory_designation']
    ];
    const employerIssues = employerChecks.filter(([, field]) => !normalizeString(company[field])).map(([label, field]) => ({ label, field }));

    const [employees] = await conn.query(`
      SELECT e.employee_id, e.emp_code, e.first_name, e.middle_name, e.last_name, e.birth_date, e.gender,
             a.sss_no, a.philhealth_no, a.pagibig_no, a.tin_no
      FROM employees e
      LEFT JOIN employee_accounts a ON a.employee_id = e.employee_id
      WHERE e.status IS NULL OR LOWER(e.status) NOT IN ('inactive', 'terminated', 'resigned')
      ORDER BY e.emp_code ASC
    `);
    const employeeIssues = employees.map((row) => {
      const issues = [];
      if (!decryptSensitiveValue(row.sss_no)) issues.push('Missing SSS number');
      if (!decryptSensitiveValue(row.philhealth_no)) issues.push('Missing PhilHealth number');
      if (!decryptSensitiveValue(row.pagibig_no)) issues.push('Missing Pag-IBIG MID');
      if (!decryptSensitiveValue(row.tin_no)) issues.push('Missing TIN');
      if (!row.birth_date) issues.push('Missing birth date');
      if (!normalizeString(row.gender)) issues.push('Missing sex/gender');
      return { employee_id: row.employee_id, emp_code: row.emp_code, employee_name: `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`, issues };
    }).filter((row) => row.issues.length);

    const [payrollRows] = await conn.query(`
      SELECT COUNT(DISTINCT p.employee_id) employee_count,
             COALESCE(SUM(p.sss_employee + p.sss_employer + p.sss_ecc), 0) sss_total,
             COALESCE(SUM(p.philhealth_employee + p.philhealth_employer), 0) philhealth_total,
             COALESCE(SUM(p.pagibig_employee + p.pagibig_employer), 0) pagibig_total,
             COALESCE(SUM(p.tax_withheld), 0) bir_total
      FROM employee_payroll p INNER JOIN payroll_runs r ON r.run_id = p.run_id
      WHERE r.year_id = ? AND r.month_id = ? AND (p.payroll_status IS NULL OR p.payroll_status = 'Active')
    `, [String(year), String(month)]);
    return { company, employerIssues, employeeIssues, activeEmployees: employees.length, payroll: payrollRows[0] || {} };
  }

  app.get('/api/government-reports/dashboard', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });
    const conn = await pool.getConnection();
    try {
      await ensureComplianceTables(conn);
      const validation = await getValidation(conn, year, month);
      const [filings] = await conn.query(`SELECT filing_id, report_type, report_year, report_month, status, filing_reference,
        payment_reference, filed_at, paid_at, amount_paid, receipt_name, notes, prepared_by, reviewed_by,
        approved_by, locked_at, updated_at FROM government_report_filings WHERE report_year = ? AND report_month IN (?, 0)`, [year, month]);
      res.json({ success: true, year, month, ...validation, filings, statuses: FILING_STATUSES, reportTypes: REPORT_TYPES });
    } catch (err) {
      console.error('Government dashboard error:', err);
      res.status(500).json({ success: false, message: 'Unable to load government report dashboard.' });
    } finally { conn.release(); }
  });

  app.get('/api/government-reports/validation', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });
    const conn = await pool.getConnection();
    try { res.json({ success: true, ...(await getValidation(conn, year, month)) }); }
    catch (err) { console.error('Government validation error:', err); res.status(500).json({ success: false, message: 'Unable to validate report data.' }); }
    finally { conn.release(); }
  });

  app.put('/api/government-reports/filings/:reportType', async (req, res) => {
    const reportType = decodeURIComponent(req.params.reportType || '');
    const year = asNumber(req.body?.year);
    const requestedMonth = asNumber(req.body?.month) || 0;
    const month = filingPeriod(reportType, year, requestedMonth);
    const status = normalizeString(req.body?.status) || 'Draft';
    if (!REPORT_TYPES.includes(reportType) || !year || !FILING_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid report type, period, or status.' });
    }
    if (month !== 0 && (month < 1 || month > 12)) return res.status(400).json({ success: false, message: 'Invalid month.' });
    const receiptData = normalizeString(req.body?.receipt_data);
    if (receiptData.length > 3_000_000) return res.status(413).json({ success: false, message: 'Receipt must be smaller than 2 MB.' });
    const actor = normalizeString(req.session?.user?.full_name || req.session?.user?.email || 'System user');
    const conn = await pool.getConnection();
    try {
      await ensureComplianceTables(conn);
      const [currentRows] = await conn.query('SELECT * FROM government_report_filings WHERE report_type = ? AND report_year = ? AND report_month = ?', [reportType, year, month]);
      const current = currentRows[0];
      if (current?.locked_at && !['Filed', 'Paid'].includes(status)) return res.status(409).json({ success: false, message: 'Filed reports are locked and cannot return to an earlier status.' });
      const preparedBy = status === 'Draft' || status === 'Validated' ? actor : (current?.prepared_by || actor);
      const reviewedBy = FILING_STATUSES.indexOf(status) >= 2 ? actor : (current?.reviewed_by || '');
      const approvedBy = FILING_STATUSES.indexOf(status) >= 3 ? actor : (current?.approved_by || '');
      await conn.query(`INSERT INTO government_report_filings
        (report_type, report_year, report_month, status, filing_reference, payment_reference, filed_at, paid_at,
         amount_paid, receipt_name, receipt_data, notes, prepared_by, reviewed_by, approved_by, locked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status=VALUES(status), filing_reference=VALUES(filing_reference),
        payment_reference=VALUES(payment_reference), filed_at=VALUES(filed_at), paid_at=VALUES(paid_at),
        amount_paid=VALUES(amount_paid), receipt_name=IF(VALUES(receipt_name)='', receipt_name, VALUES(receipt_name)),
        receipt_data=IF(VALUES(receipt_data) IS NULL OR VALUES(receipt_data)='', receipt_data, VALUES(receipt_data)),
        notes=VALUES(notes), prepared_by=VALUES(prepared_by), reviewed_by=VALUES(reviewed_by),
        approved_by=VALUES(approved_by), locked_at=VALUES(locked_at)`, [
        reportType, year, month, status, normalizeString(req.body?.filing_reference), normalizeString(req.body?.payment_reference),
        req.body?.filed_at || null, req.body?.paid_at || null, Number(req.body?.amount_paid || 0),
        normalizeString(req.body?.receipt_name), receiptData || null, normalizeString(req.body?.notes), preparedBy, reviewedBy, approvedBy,
        ['Filed', 'Paid'].includes(status) ? (current?.locked_at || new Date()) : null
      ]);
      const [savedRows] = await conn.query('SELECT * FROM government_report_filings WHERE report_type = ? AND report_year = ? AND report_month = ?', [reportType, year, month]);
      const saved = savedRows[0];
      if (!current || current.status !== status) await conn.query(`INSERT INTO government_report_filing_history
        (filing_id, previous_status, new_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)`,
        [saved.filing_id, current?.status || '', status, actor, normalizeString(req.body?.notes)]);
      delete saved.receipt_data;
      res.json({ success: true, data: saved });
    } catch (err) {
      console.error('Government filing save error:', err);
      res.status(500).json({ success: false, message: 'Unable to save filing record.' });
    } finally { conn.release(); }
  });

  app.get('/api/government-reports/filings/history', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      await ensureComplianceTables(conn);
      const [rows] = await conn.query(`SELECT h.*, f.report_type, f.report_year, f.report_month
        FROM government_report_filing_history h INNER JOIN government_report_filings f ON f.filing_id = h.filing_id
        ORDER BY h.created_at DESC LIMIT 200`);
      res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: 'Unable to load filing history.' }); }
    finally { conn.release(); }
  });

  app.get('/api/government-reports/filings/:reportType/receipt', async (req, res) => {
    const reportType = decodeURIComponent(req.params.reportType || '');
    const year = asNumber(req.query.year);
    const requestedMonth = asNumber(req.query.month) || 0;
    const month = filingPeriod(reportType, year, requestedMonth);
    if (!REPORT_TYPES.includes(reportType) || !year) return res.status(400).json({ success: false, message: 'Invalid report or period.' });
    const conn = await pool.getConnection();
    try {
      await ensureComplianceTables(conn);
      const [rows] = await conn.query('SELECT receipt_name, receipt_data FROM government_report_filings WHERE report_type=? AND report_year=? AND report_month=?', [reportType, year, month]);
      const receipt = rows[0];
      if (!receipt?.receipt_data) return res.status(404).json({ success: false, message: 'No receipt is attached.' });
      const match = String(receipt.receipt_data).match(/^data:([^;,]+);base64,(.+)$/s);
      if (!match) return res.status(422).json({ success: false, message: 'Stored receipt format is invalid.' });
      const filename = String(receipt.receipt_name || 'filing-receipt').replace(/[\r\n"\\]/g, '_');
      res.setHeader('Content-Type', match[1]);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(match[2], 'base64'));
    } catch (err) { res.status(500).json({ success: false, message: 'Unable to retrieve receipt.' }); }
    finally { conn.release(); }
  });

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
