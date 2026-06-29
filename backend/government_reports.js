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

  // ── Print / PDF helpers ────────────────────────────────────────────────────

  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(v) {
    return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildPrintPage(title, bodyHtml, landscape = false, metadata = {}) {
    const generatedAt = new Date().toLocaleString('en-PH', {
      timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    const companyName = metadata.companyName || 'Astreablue Intelligence Inc.';
    const generatedBy = metadata.generatedBy || 'System User';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    @page { size: ${landscape ? 'A4 landscape' : 'A4 portrait'}; margin: 14mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #1a2333; background: #fff; }

    .doc-header { text-align: center; margin-bottom: 12px; }
    .doc-header .company-name { color: #142647; font-size: 17px; line-height: 1.2; font-weight: 900; }
    .doc-header .report-name { color: #334155; font-size: 12px; font-weight: 700; margin-top: 4px; }
    .doc-header .generated-meta { display: flex; justify-content: center; gap: 22px; flex-wrap: wrap; color: #64748b; font-size: 8.5px; margin-top: 6px; }
    .doc-header .generated-meta strong { color: #334155; }

    .rpt-header { text-align: center; margin-bottom: 10px; padding: 0 0 10px; border-bottom: 2px solid #1e40af; }
    .rpt-header h1 { color: #142647; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
    .rpt-header h2 { color: #142647; font-size: 11px; font-weight: 700; margin-top: 4px; }
    .rpt-header p  { font-size: 9px; margin-top: 3px; color: #5f6f84; }

    .rpt-meta { display: flex; justify-content: space-between; margin: 6px 0 8px; font-size: 9px; flex-wrap: wrap; gap: 4px; }
    .rpt-meta .field { margin-right: 18px; }
    .rpt-meta .field span { font-weight: 700; }

    table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9px; }
    th { background: #e8f2ff; color: #142647; font-weight: 900; padding: 5px; border: 1px solid #9eacbe; text-align: center; text-transform: uppercase; font-size: 8.5px; }
    td { padding: 4px 5px; border: 1px solid #c4cdd8; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .num { text-align: right; }
    .ctr { text-align: center; }

    .grp-row td  { background: #dbeafe !important; color: #142647; font-weight: 900; padding: 4px 5px; font-size: 9px; }
    .sub-row td  { background: #eff6ff !important; font-weight: 700; }
    .tot-row td  { background: #e8f2ff !important; color: #142647; font-weight: 900; border-top: 2px solid #1e40af; }

    .sigs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 34px; break-inside: avoid; }
    .sig  { flex: 1; min-width: 130px; text-align: center; }
    .sig .line  { border-top: 1px solid #334155; margin-top: 34px; padding-top: 4px; font-size: 8.5px; font-weight: 700; }
    .sig .label { font-size: 8px; color: #64748b; }
    .rpt-footer { margin-top: 18px; padding-top: 6px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 8px; display: flex; justify-content: space-between; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body><div class="doc-header">
  <div class="company-name">${esc(companyName)}</div>
  <div class="report-name">${esc(title)}</div>
  <div class="generated-meta"><span><strong>Generated By:</strong> ${esc(generatedBy)}</span><span><strong>Generated:</strong> ${esc(generatedAt)} PHT</span></div>
</div>${bodyHtml}<div class="rpt-footer"><span>${esc(companyName)} - System-generated government compliance report</span><span>Generated by ${esc(generatedBy)} on ${esc(generatedAt)} PHT</span></div></body>
</html>`;
  }

  function getCompanyInfo(company) {
    return {
      name:   esc(company.company_name || company.name || 'Astreablue Intelligence Inc.'),
      tin:    esc(company.tin    || ''),
      address:esc(company.address || ''),
      sss:    esc(company.sss_employer_no   || ''),
      ph:     esc(company.philhealth_pen    || ''),
      pi:     esc(company.pagibig_employer_id || ''),
      rdo:    esc(company.bir_rdo_code      || ''),
    };
  }

  function signaturesHtml(labels) {
    const standardLabels = ['Prepared By', 'Checked By', 'Verified By', 'Approved By'];
    return `<div class="sigs">${standardLabels.map((l) => `
      <div class="sig">
        <div class="line">${esc(l)}</div>
        <div class="label">Signature over Printed Name / Date</div>
      </div>`).join('')}</div>`;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // JSON PREVIEW ENDPOINTS — return structured data for in-page tables
  // ═══════════════════════════════════════════════════════════════════════════

  function buildName(row) {
    return `${row.last_name || ''}, ${row.first_name || ''}${row.middle_name ? ` ${row.middle_name}` : ''}`.trim();
  }

  app.get('/api/government-reports/data/sss', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });
    try {
      const rows = await fetchMonthlyContributions({ year, month, idField: 'sss_no', fields: ['sss_employee', 'sss_employer', 'sss_ecc'] });
      const data = rows.map((row) => {
        const ee = Number(row.sss_employee || 0);
        const er = Number(row.sss_employer || 0);
        const ecc = Number(row.sss_ecc || 0);
        return { emp_code: row.emp_code, employee_name: buildName(row), sss_no: row.government_id, sss_employee: ee, sss_employer: er, sss_ecc: ecc, total: ee + er + ecc };
      });
      const totals = data.reduce((acc, r) => ({ ee: acc.ee + r.sss_employee, er: acc.er + r.sss_employer, ecc: acc.ecc + r.sss_ecc, total: acc.total + r.total }), { ee: 0, er: 0, ecc: 0, total: 0 });
      res.json({ success: true, data, totals, count: data.length });
    } catch (err) {
      console.error('SSS preview error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/data/philhealth', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });
    try {
      const rows = await fetchMonthlyContributions({ year, month, idField: 'philhealth_no', fields: ['philhealth_employee', 'philhealth_employer'] });
      const data = rows.map((row) => {
        const ee = Number(row.philhealth_employee || 0);
        const er = Number(row.philhealth_employer || 0);
        return { emp_code: row.emp_code, employee_name: buildName(row), philhealth_no: row.government_id, ee_share: ee, er_share: er, total: ee + er };
      });
      const totals = data.reduce((acc, r) => ({ ee: acc.ee + r.ee_share, er: acc.er + r.er_share, total: acc.total + r.total }), { ee: 0, er: 0, total: 0 });
      res.json({ success: true, data, totals, count: data.length });
    } catch (err) {
      console.error('PhilHealth preview error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/data/pagibig', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });
    try {
      const rows = await fetchMonthlyContributions({ year, month, idField: 'pagibig_no', fields: ['pagibig_employee', 'pagibig_employer'] });
      const data = rows.map((row) => {
        const ee = Number(row.pagibig_employee || 0);
        const er = Number(row.pagibig_employer || 0);
        return { emp_code: row.emp_code, employee_name: buildName(row), pagibig_no: row.government_id, ee_share: ee, er_share: er, total: ee + er };
      });
      const totals = data.reduce((acc, r) => ({ ee: acc.ee + r.ee_share, er: acc.er + r.er_share, total: acc.total + r.total }), { ee: 0, er: 0, total: 0 });
      res.json({ success: true, data, totals, count: data.length });
    } catch (err) {
      console.error('Pag-IBIG preview error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/data/bir-monthly', async (req, res) => {
    const year = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });
    try {
      const rows = await fetchMonthlyBir({ year, month });
      const data = rows.map((row) => ({
        emp_code: row.emp_code,
        employee_name: buildName(row),
        tin_no: row.tin_no,
        basic_salary: Number(row.basic_salary || 0),
        taxable_allowances: Number(row.taxable_allowances || 0),
        non_taxable_allowances: Number(row.non_taxable_allowances || 0),
        gross_pay: Number(row.gross_pay || 0),
        tax_withheld: Number(row.tax_withheld || 0)
      }));
      const totals = data.reduce((acc, r) => ({
        basic_salary: acc.basic_salary + r.basic_salary,
        taxable_allowances: acc.taxable_allowances + r.taxable_allowances,
        non_taxable_allowances: acc.non_taxable_allowances + r.non_taxable_allowances,
        gross_pay: acc.gross_pay + r.gross_pay,
        tax_withheld: acc.tax_withheld + r.tax_withheld
      }), { basic_salary: 0, taxable_allowances: 0, non_taxable_allowances: 0, gross_pay: 0, tax_withheld: 0 });
      res.json({ success: true, data, totals, count: data.length });
    } catch (err) {
      console.error('BIR monthly preview error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.get('/api/government-reports/data/bir-annual', async (req, res) => {
    const year = asNumber(req.query.year);
    if (!year) return res.status(400).json({ success: false, message: 'year is required' });
    try {
      const rows = await fetchAnnualBir({ year });
      const data = rows.map((row) => ({
        emp_code: row.emp_code,
        employee_name: buildName(row),
        tin_no: row.tin_no,
        basic_salary: Number(row.basic_salary || 0),
        taxable_allowances: Number(row.taxable_allowances || 0),
        non_taxable_allowances: Number(row.non_taxable_allowances || 0),
        gross_pay: Number(row.gross_pay || 0),
        tax_withheld: Number(row.tax_withheld || 0)
      }));
      const totals = data.reduce((acc, r) => ({
        basic_salary: acc.basic_salary + r.basic_salary,
        taxable_allowances: acc.taxable_allowances + r.taxable_allowances,
        non_taxable_allowances: acc.non_taxable_allowances + r.non_taxable_allowances,
        gross_pay: acc.gross_pay + r.gross_pay,
        tax_withheld: acc.tax_withheld + r.tax_withheld
      }), { basic_salary: 0, taxable_allowances: 0, non_taxable_allowances: 0, gross_pay: 0, tax_withheld: 0 });
      res.json({ success: true, data, totals, count: data.length });
    } catch (err) {
      console.error('BIR annual preview error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRINT / PDF ENDPOINTS — return styled HTML pages for browser print-to-PDF
  // ═══════════════════════════════════════════════════════════════════════════

  async function getCompany(conn) {
    const [rows] = await conn.query('SELECT * FROM company_settings WHERE id = 1 LIMIT 1');
    return rows[0] || {};
  }

  // ── SSS R3/R5 ──────────────────────────────────────────────────────────────
  app.get('/api/government-reports/print/sss', async (req, res) => {
    const year  = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).send('year and month are required');
    const conn = await pool.getConnection();
    try {
      const [company, rows] = await Promise.all([
        getCompany(conn),
        fetchMonthlyContributions({ year, month, idField: 'sss_no', fields: ['sss_employee', 'sss_employer', 'sss_ecc'] })
      ]);
      const co = getCompanyInfo(company);
      const MONTHS_PH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const periodLabel = `${MONTHS_PH[month - 1]} ${year}`;

      let eeT = 0, erT = 0, eccT = 0, totT = 0;
      const tableRows = rows.map((r) => {
        const ee  = Number(r.sss_employee || 0);
        const er  = Number(r.sss_employer || 0);
        const ecc = Number(r.sss_ecc      || 0);
        const tot = ee + er + ecc;
        eeT += ee; erT += er; eccT += ecc; totT += tot;
        return `<tr>
          <td>${esc(buildName(r))}</td>
          <td class="ctr">${esc(decryptSensitiveValue(r.government_id))}</td>
          <td class="num">${fmt(ee)}</td>
          <td class="num">${fmt(er)}</td>
          <td class="num">${fmt(ecc)}</td>
          <td class="num">${fmt(tot)}</td>
        </tr>`;
      }).join('');

      const body = `
<div class="rpt-header">
  <h1>Social Security System</h1>
  <h2>Contribution Collection List (R-3)</h2>
  <p>Period: ${esc(periodLabel)}</p>
</div>
<div class="rpt-meta">
  <div>
    <span class="field"><span>Employer:</span> ${co.name}</span>
    <span class="field"><span>SSS Employer No.:</span> ${co.sss || '—'}</span>
    <span class="field"><span>TIN:</span> ${co.tin || '—'}</span>
  </div>
  <div><span class="field"><span>Address:</span> ${co.address || '—'}</span></div>
</div>
<table>
  <thead>
    <tr>
      <th>Employee Name</th><th>SS Number</th>
      <th>EE Share</th><th>ER Share</th><th>ECC</th><th>Total</th>
    </tr>
  </thead>
  <tbody>${tableRows || '<tr><td colspan="6" class="ctr">No records found.</td></tr>'}</tbody>
  <tfoot>
    <tr class="tot-row">
      <td colspan="2"><strong>GRAND TOTAL</strong></td>
      <td class="num">${fmt(eeT)}</td>
      <td class="num">${fmt(erT)}</td>
      <td class="num">${fmt(eccT)}</td>
      <td class="num">${fmt(totT)}</td>
    </tr>
  </tfoot>
</table>
${signaturesHtml(['Prepared By', 'Checked By', 'Authorized Signatory'])}`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildPrintPage(`SSS R3 — ${periodLabel}`, body, false, { companyName: company.company_name, generatedBy: req.session?.user?.full_name }));
    } catch (err) {
      console.error('SSS print error:', err);
      res.status(500).send('Unable to generate SSS print.');
    } finally { conn.release(); }
  });

  // ── PhilHealth RF-1 ────────────────────────────────────────────────────────
  app.get('/api/government-reports/print/philhealth', async (req, res) => {
    const year  = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).send('year and month are required');
    const conn = await pool.getConnection();
    try {
      const [company, rows] = await Promise.all([
        getCompany(conn),
        fetchMonthlyContributions({ year, month, idField: 'philhealth_no', fields: ['philhealth_employee', 'philhealth_employer'] })
      ]);
      const co = getCompanyInfo(company);
      const MONTHS_PH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const periodLabel = `${MONTHS_PH[month - 1]} ${year}`;

      let eeT = 0, erT = 0, totT = 0;
      const tableRows = rows.map((r) => {
        const ee  = Number(r.philhealth_employee || 0);
        const er  = Number(r.philhealth_employer || 0);
        const tot = ee + er;
        eeT += ee; erT += er; totT += tot;
        return `<tr>
          <td>${esc(buildName(r))}</td>
          <td class="ctr">${esc(decryptSensitiveValue(r.government_id))}</td>
          <td class="num">${fmt(ee)}</td>
          <td class="num">${fmt(er)}</td>
          <td class="num">${fmt(tot)}</td>
        </tr>`;
      }).join('');

      const body = `
<div class="rpt-header">
  <h1>Philippine Health Insurance Corporation</h1>
  <h2>Employer Premium Remittance Report (RF-1)</h2>
  <p>Period: ${esc(periodLabel)}</p>
</div>
<div class="rpt-meta">
  <div>
    <span class="field"><span>Employer:</span> ${co.name}</span>
    <span class="field"><span>PhilHealth PEN:</span> ${co.ph || '—'}</span>
    <span class="field"><span>TIN:</span> ${co.tin || '—'}</span>
  </div>
  <div><span class="field"><span>Address:</span> ${co.address || '—'}</span></div>
</div>
<table>
  <thead>
    <tr><th>Employee Name</th><th>PhilHealth No.</th><th>EE Premium</th><th>ER Premium</th><th>Total</th></tr>
  </thead>
  <tbody>${tableRows || '<tr><td colspan="5" class="ctr">No records found.</td></tr>'}</tbody>
  <tfoot>
    <tr class="tot-row">
      <td colspan="2"><strong>GRAND TOTAL</strong></td>
      <td class="num">${fmt(eeT)}</td>
      <td class="num">${fmt(erT)}</td>
      <td class="num">${fmt(totT)}</td>
    </tr>
  </tfoot>
</table>
${signaturesHtml(['Prepared By', 'Checked By', 'Authorized Signatory'])}`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildPrintPage(`PhilHealth RF-1 — ${periodLabel}`, body, false, { companyName: company.company_name, generatedBy: req.session?.user?.full_name }));
    } catch (err) {
      console.error('PhilHealth print error:', err);
      res.status(500).send('Unable to generate PhilHealth print.');
    } finally { conn.release(); }
  });

  // ── Pag-IBIG MCRF ─────────────────────────────────────────────────────────
  app.get('/api/government-reports/print/pagibig', async (req, res) => {
    const year  = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).send('year and month are required');
    const conn = await pool.getConnection();
    try {
      const [company, rows] = await Promise.all([
        getCompany(conn),
        fetchMonthlyContributions({ year, month, idField: 'pagibig_no', fields: ['pagibig_employee', 'pagibig_employer'] })
      ]);
      const co = getCompanyInfo(company);
      const MONTHS_PH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const periodLabel = `${MONTHS_PH[month - 1]} ${year}`;

      let eeT = 0, erT = 0, totT = 0;
      const tableRows = rows.map((r) => {
        const ee  = Number(r.pagibig_employee || 0);
        const er  = Number(r.pagibig_employer || 0);
        const tot = ee + er;
        eeT += ee; erT += er; totT += tot;
        return `<tr>
          <td>${esc(buildName(r))}</td>
          <td class="ctr">${esc(decryptSensitiveValue(r.government_id))}</td>
          <td class="num">${fmt(ee)}</td>
          <td class="num">${fmt(er)}</td>
          <td class="num">${fmt(tot)}</td>
        </tr>`;
      }).join('');

      const body = `
<div class="rpt-header">
  <h1>Home Development Mutual Fund (Pag-IBIG Fund)</h1>
  <h2>Monthly Contribution Remittance Form (MCRF)</h2>
  <p>Period: ${esc(periodLabel)}</p>
</div>
<div class="rpt-meta">
  <div>
    <span class="field"><span>Employer:</span> ${co.name}</span>
    <span class="field"><span>Pag-IBIG Employer ID:</span> ${co.pi || '—'}</span>
    <span class="field"><span>TIN:</span> ${co.tin || '—'}</span>
  </div>
  <div><span class="field"><span>Address:</span> ${co.address || '—'}</span></div>
</div>
<table>
  <thead>
    <tr><th>Employee Name</th><th>Pag-IBIG MID</th><th>EE Contribution</th><th>ER Contribution</th><th>Total</th></tr>
  </thead>
  <tbody>${tableRows || '<tr><td colspan="5" class="ctr">No records found.</td></tr>'}</tbody>
  <tfoot>
    <tr class="tot-row">
      <td colspan="2"><strong>GRAND TOTAL</strong></td>
      <td class="num">${fmt(eeT)}</td>
      <td class="num">${fmt(erT)}</td>
      <td class="num">${fmt(totT)}</td>
    </tr>
  </tfoot>
</table>
${signaturesHtml(['Prepared By', 'Checked By', 'Authorized Signatory'])}`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildPrintPage(`Pag-IBIG MCRF — ${periodLabel}`, body, false, { companyName: company.company_name, generatedBy: req.session?.user?.full_name }));
    } catch (err) {
      console.error('Pag-IBIG print error:', err);
      res.status(500).send('Unable to generate Pag-IBIG print.');
    } finally { conn.release(); }
  });

  // ── BIR 1601-C (Monthly) ───────────────────────────────────────────────────
  app.get('/api/government-reports/print/bir-monthly', async (req, res) => {
    const year  = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).send('year and month are required');
    const conn = await pool.getConnection();
    try {
      const [company, rows] = await Promise.all([
        getCompany(conn),
        fetchMonthlyBir({ year, month })
      ]);
      const co = getCompanyInfo(company);
      const MONTHS_PH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const periodLabel = `${MONTHS_PH[month - 1]} ${year}`;

      let grossT = 0, taxT = 0;
      const tableRows = rows.map((r) => {
        const gross = Number(r.gross_pay     || 0);
        const tax   = Number(r.tax_withheld  || 0);
        grossT += gross; taxT += tax;
        return `<tr>
          <td>${esc(buildName(r))}</td>
          <td class="ctr">${esc(r.tin_no)}</td>
          <td class="num">${fmt(r.basic_salary)}</td>
          <td class="num">${fmt(r.taxable_allowances)}</td>
          <td class="num">${fmt(r.non_taxable_allowances)}</td>
          <td class="num">${fmt(gross)}</td>
          <td class="num">${fmt(tax)}</td>
        </tr>`;
      }).join('');

      const body = `
<div class="rpt-header">
  <h1>Bureau of Internal Revenue</h1>
  <h2>BIR Form 1601-C — Monthly Remittance Return of Income Taxes Withheld on Compensation</h2>
  <p>Period: ${esc(periodLabel)}</p>
</div>
<div class="rpt-meta">
  <div>
    <span class="field"><span>Employer:</span> ${co.name}</span>
    <span class="field"><span>TIN:</span> ${co.tin || '—'}</span>
    <span class="field"><span>RDO Code:</span> ${co.rdo || '—'}</span>
  </div>
  <div><span class="field"><span>Address:</span> ${co.address || '—'}</span></div>
</div>
<table>
  <thead>
    <tr>
      <th>Employee Name</th><th>TIN</th>
      <th>Basic Salary</th><th>Taxable Allow.</th><th>Non-Taxable Allow.</th>
      <th>Gross Pay</th><th>Tax Withheld</th>
    </tr>
  </thead>
  <tbody>${tableRows || '<tr><td colspan="7" class="ctr">No records found.</td></tr>'}</tbody>
  <tfoot>
    <tr class="tot-row">
      <td colspan="5"><strong>TOTAL</strong></td>
      <td class="num">${fmt(grossT)}</td>
      <td class="num">${fmt(taxT)}</td>
    </tr>
  </tfoot>
</table>
${signaturesHtml(['Prepared By', 'Checked By', 'Authorized Signatory'])}`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildPrintPage(`BIR 1601-C — ${periodLabel}`, body, true, { companyName: company.company_name, generatedBy: req.session?.user?.full_name }));
    } catch (err) {
      console.error('BIR monthly print error:', err);
      res.status(500).send('Unable to generate BIR 1601-C print.');
    } finally { conn.release(); }
  });

  // ── BIR Annual (2316 / 1604-C / Alphalist) ────────────────────────────────
  app.get('/api/government-reports/print/bir-annual', async (req, res) => {
    const year      = asNumber(req.query.year);
    const reportType = normalizeString(req.query.type || 'BIR-2316');
    if (!year) return res.status(400).send('year is required');
    const conn = await pool.getConnection();
    try {
      const [company, rows] = await Promise.all([
        getCompany(conn),
        fetchAnnualBir({ year })
      ]);
      const co = getCompanyInfo(company);

      const TITLES = {
        'BIR-2316':      'BIR Form 2316 — Certificate of Compensation Payment / Tax Withheld',
        'BIR-1604C':     'BIR Form 1604-C — Annual Information Return of Taxes Withheld on Compensation',
        'BIR-Alphalist': 'BIR Alphalist — Annual Alphabetical List of Employees',
      };
      const title = TITLES[reportType] || TITLES['BIR-2316'];

      let grossT = 0, taxT = 0;
      const sorted = reportType === 'BIR-Alphalist'
        ? [...rows].sort((a, b) => String(a.last_name || '').localeCompare(String(b.last_name || '')))
        : rows;

      const tableRows = sorted.map((r) => {
        const gross = Number(r.gross_pay    || 0);
        const tax   = Number(r.tax_withheld || 0);
        grossT += gross; taxT += tax;
        return `<tr>
          <td>${esc(buildName(r))}</td>
          <td class="ctr">${esc(r.tin_no)}</td>
          <td class="num">${fmt(r.basic_salary)}</td>
          <td class="num">${fmt(r.taxable_allowances)}</td>
          <td class="num">${fmt(r.non_taxable_allowances)}</td>
          <td class="num">${fmt(gross)}</td>
          <td class="num">${fmt(tax)}</td>
        </tr>`;
      }).join('');

      const body = `
<div class="rpt-header">
  <h1>Bureau of Internal Revenue</h1>
  <h2>${esc(title)}</h2>
  <p>Taxable Year: ${esc(String(year))}</p>
</div>
<div class="rpt-meta">
  <div>
    <span class="field"><span>Employer:</span> ${co.name}</span>
    <span class="field"><span>TIN:</span> ${co.tin || '—'}</span>
    <span class="field"><span>RDO Code:</span> ${co.rdo || '—'}</span>
  </div>
  <div><span class="field"><span>Address:</span> ${co.address || '—'}</span></div>
</div>
<table>
  <thead>
    <tr>
      <th>Employee Name</th><th>TIN</th>
      <th>Basic Salary</th><th>Taxable Allow.</th><th>Non-Taxable Allow.</th>
      <th>Annual Gross Pay</th><th>Tax Withheld</th>
    </tr>
  </thead>
  <tbody>${tableRows || '<tr><td colspan="7" class="ctr">No records found.</td></tr>'}</tbody>
  <tfoot>
    <tr class="tot-row">
      <td colspan="5"><strong>TOTAL (${rows.length} employees)</strong></td>
      <td class="num">${fmt(grossT)}</td>
      <td class="num">${fmt(taxT)}</td>
    </tr>
  </tfoot>
</table>
${signaturesHtml(['Prepared By', 'Checked By', 'Authorized Signatory'])}`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildPrintPage(`${reportType} — ${year}`, body, true, { companyName: company.company_name, generatedBy: req.session?.user?.full_name }));
    } catch (err) {
      console.error('BIR annual print error:', err);
      res.status(500).send('Unable to generate BIR annual print.');
    } finally { conn.release(); }
  });

  // ── SSS Collection List (R-3/R-5 grouped) ─────────────────────────────────
  app.get('/api/government-reports/print/sss-collection', async (req, res) => {
    const fromRunId   = parsePositiveInt(req.query.from_run_id);
    const toRunId     = parsePositiveInt(req.query.to_run_id);
    const transaction = parseTransactionOption(req.query.transaction);
    const excludeZero = parseBoolean(req.query.exclude_zero ?? true);
    const company_f   = normalizeString(req.query.company);
    const dept_f      = normalizeString(req.query.department);
    if (!fromRunId || !toRunId) return res.status(400).send('from_run_id and to_run_id are required');

    const runStart = Math.min(fromRunId, toRunId);
    const runEnd   = Math.max(fromRunId, toRunId);
    const conn = await pool.getConnection();
    try {
      const [companyRow] = await pool.query('SELECT * FROM company_settings WHERE id = 1 LIMIT 1');
      const co = getCompanyInfo(companyRow[0] || {});

      const [runRows] = await conn.query(
        'SELECT run_id, payroll_range FROM payroll_runs WHERE run_id BETWEEN ? AND ? ORDER BY run_id ASC',
        [runStart, runEnd]
      );

      const params = [runStart, runEnd];
      const where  = ['p.run_id BETWEEN ? AND ?'];
      if (transaction !== 'all') { where.push('p.payroll_status = ?'); params.push(transaction === 'active' ? 'Active' : 'Hold'); }
      if (company_f) { where.push('TRIM(em.company) = TRIM(?)'); params.push(company_f); }
      if (dept_f)    { where.push('TRIM(em.department) = TRIM(?)'); params.push(dept_f); }

      const [rows] = await conn.query(`
        SELECT e.employee_id, e.emp_code, e.last_name, e.first_name, e.middle_name,
               a.sss_no, em.company, em.department,
               SUM(p.sss_employee) AS sss_employee,
               SUM(p.sss_employer) AS sss_employer,
               SUM(p.sss_ecc)      AS sss_ecc
        FROM employee_payroll p
        INNER JOIN employees e ON e.employee_id = p.employee_id
        LEFT  JOIN employee_accounts a    ON a.employee_id = e.employee_id
        LEFT  JOIN employee_employment em ON em.employee_id = e.employee_id
        WHERE ${where.join(' AND ')}
        GROUP BY e.employee_id, e.emp_code, e.last_name, e.first_name, e.middle_name, a.sss_no, em.company, em.department
        ORDER BY TRIM(em.company) ASC, TRIM(em.department) ASC, e.emp_code ASC`, params);

      const normalized = rows.map((r) => ({
        ...r,
        sss_no:     decryptSensitiveValue(r.sss_no),
        company:    normalizeString(r.company)    || 'Business Setup',
        department: normalizeString(r.department) || 'Unassigned',
        sss_ee:  Number(r.sss_employee || 0),
        sss_er:  Number(r.sss_employer || 0),
        sss_ecc: Number(r.sss_ecc     || 0),
        total:   Number(r.sss_employee || 0) + Number(r.sss_employer || 0) + Number(r.sss_ecc || 0),
      })).filter((r) => excludeZero ? r.total !== 0 : true);

      const grouped = new Map();
      for (const r of normalized) {
        const key = `${r.company}|||${r.department}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(r);
      }

      const ranges   = runRows.map((r) => normalizeString(r.payroll_range)).filter(Boolean);
      const rangeLabel = ranges.length === 1 ? ranges[0]
        : `${ranges[0] || `Run ${runStart}`} — ${ranges[ranges.length - 1] || `Run ${runEnd}`}`;

      let bodyRows = '';
      let grandEe = 0, grandEr = 0, grandEcc = 0, grandTot = 0;

      for (const [key, grpRows] of grouped) {
        const [grpCo, grpDept] = key.split('|||');
        let subEe = 0, subEr = 0, subEcc = 0, subTot = 0;
        bodyRows += `<tr class="grp-row"><td colspan="6">${esc(grpCo)} — ${esc(grpDept)}</td></tr>`;
        for (const r of grpRows) {
          subEe += r.sss_ee; subEr += r.sss_er; subEcc += r.sss_ecc; subTot += r.total;
          bodyRows += `<tr>
            <td>${esc(buildName(r))}</td>
            <td class="ctr">${esc(r.emp_code)}</td>
            <td class="ctr">${esc(r.sss_no) || '—'}</td>
            <td class="num">${fmt(r.sss_ee)}</td>
            <td class="num">${fmt(r.sss_er)}</td>
            <td class="num">${fmt(r.sss_ecc)}</td>
          </tr>`;
        }
        grandEe += subEe; grandEr += subEr; grandEcc += subEcc; grandTot += subTot;
        bodyRows += `<tr class="sub-row">
          <td colspan="3" class="num">Subtotal</td>
          <td class="num">${fmt(subEe)}</td>
          <td class="num">${fmt(subEr)}</td>
          <td class="num">${fmt(subEcc)}</td>
        </tr>`;
      }

      const body = `
<div class="rpt-header">
  <h1>Social Security System</h1>
  <h2>Contribution Collection List (R-3 / R-5)</h2>
  <p>Payroll Run Range: ${esc(rangeLabel)}</p>
</div>
<div class="rpt-meta">
  <div>
    <span class="field"><span>Employer:</span> ${co.name}</span>
    <span class="field"><span>SSS Employer No.:</span> ${co.sss || '—'}</span>
    <span class="field"><span>TIN:</span> ${co.tin || '—'}</span>
  </div>
  <div><span class="field"><span>Address:</span> ${co.address || '—'}</span></div>
</div>
<table>
  <thead>
    <tr>
      <th>Employee Name</th><th>Employee ID</th><th>SS Number</th>
      <th>EE Share</th><th>ER Share</th><th>ECC</th>
    </tr>
  </thead>
  <tbody>${bodyRows || '<tr><td colspan="6" class="ctr">No records found.</td></tr>'}</tbody>
  <tfoot>
    <tr class="tot-row">
      <td colspan="3"><strong>GRAND TOTAL</strong></td>
      <td class="num">${fmt(grandEe)}</td>
      <td class="num">${fmt(grandEr)}</td>
      <td class="num">${fmt(grandEcc)}</td>
    </tr>
  </tfoot>
</table>
${signaturesHtml(['Prepared By', 'Checked By', 'Authorized Signatory'])}`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(buildPrintPage(`SSS R3/R5 Collection — ${rangeLabel}`, body, false, { companyName: companyRow[0]?.company_name, generatedBy: req.session?.user?.full_name }));
    } catch (err) {
      console.error('SSS collection print error:', err);
      res.status(500).send('Unable to generate SSS collection print.');
    } finally { conn.release(); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // QA CHECK ENDPOINT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get('/api/government-reports/qa', async (req, res) => {
    const year  = asNumber(req.query.year);
    const month = asNumber(req.query.month);
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month are required' });

    const conn = await pool.getConnection();
    try {
      // ── 1. Employer setup ──────────────────────────────────────────────────
      const [companyRows] = await conn.query('SELECT * FROM company_settings WHERE id = 1');
      const company = companyRows[0] || {};
      const EMPLOYER_FIELDS = [
        ['Company TIN',          'tin'],
        ['Company Address',      'address'],
        ['SSS Employer Number',  'sss_employer_no'],
        ['PhilHealth PEN',       'philhealth_pen'],
        ['Pag-IBIG Employer ID', 'pagibig_employer_id'],
        ['BIR RDO Code',         'bir_rdo_code'],
        ['Authorized Signatory', 'authorized_signatory'],
        ['Signatory Designation','signatory_designation'],
      ];
      const employerIssues = EMPLOYER_FIELDS
        .filter(([, field]) => !normalizeString(company[field]))
        .map(([label]) => label);

      // ── 2. Active employees + government IDs ───────────────────────────────
      const [employees] = await conn.query(`
        SELECT e.employee_id, e.emp_code, e.first_name, e.middle_name, e.last_name,
               e.birth_date, e.gender, e.status,
               a.sss_no, a.philhealth_no, a.pagibig_no, a.tin_no
        FROM employees e
        LEFT JOIN employee_accounts a ON a.employee_id = e.employee_id
        WHERE e.status IS NULL OR LOWER(e.status) NOT IN ('inactive','terminated','resigned')
        ORDER BY e.emp_code ASC
      `);

      const missingSSS = [], missingPhilHealth = [], missingPagIBIG = [],
            missingTIN = [], missingBirthDate = [], missingGender = [];

      for (const emp of employees) {
        const row = { emp_code: emp.emp_code, employee_name: buildName(emp) };
        if (!decryptSensitiveValue(emp.sss_no))        missingSSS.push(row);
        if (!decryptSensitiveValue(emp.philhealth_no)) missingPhilHealth.push(row);
        if (!decryptSensitiveValue(emp.pagibig_no))    missingPagIBIG.push(row);
        if (!decryptSensitiveValue(emp.tin_no))        missingTIN.push(row);
        if (!emp.birth_date)                           missingBirthDate.push(row);
        if (!normalizeString(emp.gender))              missingGender.push(row);
      }

      // ── 3. Payroll data for period ─────────────────────────────────────────
      const [payrollData] = await conn.query(`
        SELECT
          p.employee_id,
          e.emp_code,
          e.first_name, e.middle_name, e.last_name,
          SUM(p.sss_employee)        AS sss_ee,
          SUM(p.sss_employer)        AS sss_er,
          SUM(p.sss_ecc)             AS sss_ecc,
          SUM(p.philhealth_employee) AS ph_ee,
          SUM(p.philhealth_employer) AS ph_er,
          SUM(p.pagibig_employee)    AS pi_ee,
          SUM(p.pagibig_employer)    AS pi_er,
          SUM(p.tax_withheld)        AS tax_withheld,
          SUM(p.gross_pay)           AS gross_pay,
          SUM(p.basic_salary)        AS basic_salary
        FROM employee_payroll p
        INNER JOIN payroll_runs r ON r.run_id = p.run_id
        INNER JOIN employees e ON e.employee_id = p.employee_id
        WHERE r.year_id = ? AND r.month_id = ?
          AND (p.payroll_status IS NULL OR p.payroll_status = 'Active')
        GROUP BY p.employee_id, e.emp_code, e.first_name, e.middle_name, e.last_name
        ORDER BY e.emp_code ASC
      `, [String(year), String(month)]);

      // ── 4. Payroll coverage ────────────────────────────────────────────────
      const idsWithPayroll = new Set(payrollData.map((p) => Number(p.employee_id)));
      const missingFromPayroll = employees
        .filter((e) => !idsWithPayroll.has(Number(e.employee_id)))
        .map((e) => ({ emp_code: e.emp_code, employee_name: buildName(e) }));

      // ── 5. Zero-contribution employees ────────────────────────────────────
      const zeroSSS = payrollData
        .filter((p) => Number(p.sss_ee || 0) === 0 && Number(p.sss_er || 0) === 0)
        .map((p) => ({ emp_code: p.emp_code, employee_name: buildName(p), gross_pay: Number(p.gross_pay || 0) }));

      const zeroPhilHealth = payrollData
        .filter((p) => Number(p.ph_ee || 0) === 0 && Number(p.ph_er || 0) === 0)
        .map((p) => ({ emp_code: p.emp_code, employee_name: buildName(p), gross_pay: Number(p.gross_pay || 0) }));

      const zeroPagIBIG = payrollData
        .filter((p) => Number(p.pi_ee || 0) === 0 && Number(p.pi_er || 0) === 0)
        .map((p) => ({ emp_code: p.emp_code, employee_name: buildName(p), gross_pay: Number(p.gross_pay || 0) }));

      // ── 6. Rate anomaly checks ─────────────────────────────────────────────
      // PhilHealth: total premium should be ~5% of basic salary (2.5% EE + 2.5% ER)
      const phAnomalies = payrollData
        .filter((p) => {
          const basic  = Number(p.basic_salary || 0);
          const actual = Number(p.ph_ee || 0) + Number(p.ph_er || 0);
          if (basic === 0 || actual === 0) return false;
          const expected = basic * 0.05;
          return Math.abs(actual - expected) / expected > 0.15; // >15% deviation
        })
        .map((p) => {
          const basic    = Number(p.basic_salary || 0);
          const actual   = Number(p.ph_ee || 0) + Number(p.ph_er || 0);
          const expected = basic * 0.05;
          return {
            emp_code: p.emp_code, employee_name: buildName(p),
            basic_salary: basic, expected, actual,
            variance_pct: expected > 0 ? ((actual - expected) / expected * 100).toFixed(1) : 'N/A'
          };
        });

      // Pag-IBIG: EE contribution should not exceed PHP 200
      const piAnomalies = payrollData
        .filter((p) => Number(p.pi_ee || 0) > 200.01)
        .map((p) => ({
          emp_code: p.emp_code, employee_name: buildName(p),
          pi_ee: Number(p.pi_ee || 0), pi_er: Number(p.pi_er || 0)
        }));

      // Tax withheld but gross pay < minimum wage threshold (possible over-withholding)
      const MIN_WAGE_MONTHLY = 18200; // NCR minimum wage approximation
      const taxAnomalies = payrollData
        .filter((p) => Number(p.tax_withheld || 0) > 0 && Number(p.gross_pay || 0) < MIN_WAGE_MONTHLY)
        .map((p) => ({
          emp_code: p.emp_code, employee_name: buildName(p),
          gross_pay: Number(p.gross_pay || 0), tax_withheld: Number(p.tax_withheld || 0)
        }));

      // ── 7. Build checks list ───────────────────────────────────────────────
      const n = employees.length;
      const payrollCount = payrollData.length;

      const checks = [
        // Employer setup
        { id: 'employer_setup',    category: 'Employer',    label: 'Employer Setup Complete',          status: employerIssues.length  === 0 ? 'pass' : 'fail', issues: employerIssues.length,  total: EMPLOYER_FIELDS.length, note: 'TIN, address, SSS/PhilHealth/Pag-IBIG/BIR IDs, authorized signatory' },
        // Employee IDs
        { id: 'sss_ids',           category: 'Employee IDs', label: 'SSS Numbers Complete',            status: missingSSS.length         === 0 ? 'pass' : 'warn', issues: missingSSS.length,         total: n },
        { id: 'philhealth_ids',    category: 'Employee IDs', label: 'PhilHealth Numbers Complete',     status: missingPhilHealth.length   === 0 ? 'pass' : 'warn', issues: missingPhilHealth.length,   total: n },
        { id: 'pagibig_ids',       category: 'Employee IDs', label: 'Pag-IBIG MIDs Complete',          status: missingPagIBIG.length      === 0 ? 'pass' : 'warn', issues: missingPagIBIG.length,      total: n },
        { id: 'tin_ids',           category: 'Employee IDs', label: 'TIN Numbers Complete',            status: missingTIN.length          === 0 ? 'pass' : 'warn', issues: missingTIN.length,          total: n },
        { id: 'birth_dates',       category: 'Employee IDs', label: 'Birth Dates Complete',            status: missingBirthDate.length    === 0 ? 'pass' : 'warn', issues: missingBirthDate.length,    total: n },
        { id: 'gender',            category: 'Employee IDs', label: 'Sex/Gender Complete',             status: missingGender.length       === 0 ? 'pass' : 'warn', issues: missingGender.length,       total: n },
        // Payroll coverage
        { id: 'payroll_coverage',  category: 'Coverage',    label: 'All Active Employees Have Payroll', status: missingFromPayroll.length  === 0 ? 'pass' : 'warn', issues: missingFromPayroll.length,  total: n, note: 'Active employees with no payroll record this period' },
        // Contributions
        { id: 'zero_sss',          category: 'Contributions', label: 'No Zero SSS Contributions',      status: zeroSSS.length             === 0 ? 'pass' : 'warn', issues: zeroSSS.length,             total: payrollCount },
        { id: 'zero_philhealth',   category: 'Contributions', label: 'No Zero PhilHealth Contributions',status: zeroPhilHealth.length      === 0 ? 'pass' : 'warn', issues: zeroPhilHealth.length,      total: payrollCount },
        { id: 'zero_pagibig',      category: 'Contributions', label: 'No Zero Pag-IBIG Contributions', status: zeroPagIBIG.length         === 0 ? 'pass' : 'warn', issues: zeroPagIBIG.length,         total: payrollCount },
        // Rate checks
        { id: 'ph_rates',          category: 'Rates',       label: 'PhilHealth Rate Accuracy (±15%)',  status: phAnomalies.length         === 0 ? 'pass' : 'warn', issues: phAnomalies.length,         total: payrollCount, note: 'Expected ~5% of basic salary (2.5% EE + 2.5% ER)' },
        { id: 'pi_ceiling',        category: 'Rates',       label: 'Pag-IBIG EE within PHP 200 ceiling',status: piAnomalies.length        === 0 ? 'pass' : 'warn', issues: piAnomalies.length,         total: payrollCount },
        { id: 'tax_below_mw',      category: 'Rates',       label: 'No Tax Withheld Below Minimum Wage',status: taxAnomalies.length       === 0 ? 'pass' : 'warn', issues: taxAnomalies.length,        total: payrollCount, note: 'Minimum wage earners are tax-exempt' },
      ];

      // ── 8. Totals ──────────────────────────────────────────────────────────
      const totals = payrollData.reduce((acc, p) => ({
        gross_pay:   acc.gross_pay   + Number(p.gross_pay   || 0),
        sss_total:   acc.sss_total   + Number(p.sss_ee  || 0) + Number(p.sss_er  || 0) + Number(p.sss_ecc || 0),
        ph_total:    acc.ph_total    + Number(p.ph_ee   || 0) + Number(p.ph_er   || 0),
        pi_total:    acc.pi_total    + Number(p.pi_ee   || 0) + Number(p.pi_er   || 0),
        tax_withheld:acc.tax_withheld+ Number(p.tax_withheld|| 0),
      }), { gross_pay: 0, sss_total: 0, ph_total: 0, pi_total: 0, tax_withheld: 0 });

      res.json({
        success: true,
        year,
        month,
        summary: {
          activeEmployees: n,
          payrollCount,
          ...totals,
          passCount: checks.filter((c) => c.status === 'pass').length,
          warnCount: checks.filter((c) => c.status === 'warn').length,
          failCount: checks.filter((c) => c.status === 'fail').length,
        },
        checks,
        details: {
          employerIssues,
          missingSSS,
          missingPhilHealth,
          missingPagIBIG,
          missingTIN,
          missingBirthDate,
          missingGender,
          missingFromPayroll,
          zeroSSS,
          zeroPhilHealth,
          zeroPagIBIG,
          phAnomalies,
          piAnomalies,
          taxAnomalies,
        },
      });
    } catch (err) {
      console.error('QA check error:', err);
      res.status(500).json({ success: false, message: 'Unable to run QA checks.' });
    } finally {
      conn.release();
    }
  });
};
