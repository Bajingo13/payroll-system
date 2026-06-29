'use strict';

const nodemailer = require('nodemailer');
const { buildEmail } = require('./emailTemplate');

module.exports = function (app, pool) {
  function getMailConfig() {
    const user = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.MAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.SMTP_PASS || process.env.MAIL_PASS;
    if (!user || !pass) return null;
    return {
      user,
      pass,
      from: { name: process.env.MAIL_FROM_NAME || 'Astreablue Intelligence Inc.', address: user }
    };
  }

  let _transporter = null;
  function getTransporter(config) {
    if (!_transporter) {
      _transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.user, pass: config.pass }
      });
    }
    return _transporter;
  }

  function money(v) {
    return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function ensureDeliveryTable(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS payslip_email_deliveries (
        delivery_id INT NOT NULL AUTO_INCREMENT,
        payroll_id INT NOT NULL,
        run_id INT NOT NULL,
        employee_id INT NOT NULL,
        recipient_email VARCHAR(255) NULL,
        status ENUM('Sent','Failed','Skipped') NOT NULL,
        error_message VARCHAR(500) NULL,
        sent_at DATETIME NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (delivery_id),
        UNIQUE KEY uq_payslip_delivery_payroll (payroll_id),
        KEY idx_payslip_delivery_run (run_id),
        KEY idx_payslip_delivery_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  function buildAutomaticPayslipEmail(payroll, company = {}) {
    const fullName = [payroll.first_name, payroll.middle_name ? `${payroll.middle_name[0]}.` : '', payroll.last_name]
      .filter(Boolean).join(' ') || payroll.emp_code || 'Employee';
    const period = payroll.payroll_range || 'Current Period';
    return {
      subject: `Your Payslip — ${period} | ${company.company_name || 'HRIS'}`,
      text: [
        `Hi ${fullName},`, '', `Your payslip for ${period} is ready.`, '',
        `Gross Pay: ₱${money(payroll.gross_pay)}`,
        `Total Deductions: ₱${money(payroll.total_deductions)}`,
        `Net Pay: ₱${money(payroll.net_pay)}`, '',
        'Please log in to the HRIS portal to view the full breakdown.'
      ].join('\n'),
      html: buildEmail({
        title: `Payslip — ${period}`,
        recipientName: fullName,
        intro: `Your payroll for ${period} has been generated. Here is your payslip summary.`,
        rows: [
          { label: 'Employee ID', value: payroll.emp_code || '-' },
          { label: 'Pay Period', value: period },
          { label: 'Basic Salary', value: `₱${money(payroll.basic_salary)}` },
          { label: 'Gross Pay', value: `₱${money(payroll.gross_pay)}` },
          { label: 'Total Deductions', value: `₱${money(payroll.total_deductions)}` },
          { label: 'Net Pay', value: `₱${money(payroll.net_pay)}`, isStatus: true },
        ],
        closing: 'Log in to the HRIS portal for the complete earnings and deductions breakdown. Contact HR if you have questions.',
        companyName: company.company_name || payroll.company || 'Astreablue Intelligence Inc.',
      })
    };
  }

  app.locals.sendPayslipsForRun = async function sendPayslipsForRun(runId) {
    const summary = { total: 0, sent: 0, skipped: 0, failed: 0 };
    const mailConfig = getMailConfig();
    if (!mailConfig) return { ...summary, configured: false, message: 'Payslip email is not configured.' };

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureDeliveryTable(conn);
      const [[company]] = await conn.execute('SELECT * FROM company_settings WHERE id = 1').catch(() => [[{}]]);
      const [rows] = await conn.execute(`
        SELECT ep.payroll_id, ep.run_id, ep.employee_id, ep.basic_salary,
               ep.gross_pay, ep.total_deductions, ep.net_pay,
               e.emp_code, e.first_name, e.middle_name, e.last_name,
               ee.company, pr.payroll_range,
               (SELECT ec.email FROM employee_contacts ec
                WHERE ec.employee_id = ep.employee_id
                  AND TRIM(COALESCE(ec.email, '')) <> ''
                ORDER BY ec.contact_id DESC LIMIT 1) AS recipient_email,
               ped.status AS delivery_status
        FROM employee_payroll ep
        JOIN employees e ON e.employee_id = ep.employee_id
        LEFT JOIN employee_employment ee ON ee.employee_id = ep.employee_id
        LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
        LEFT JOIN payslip_email_deliveries ped ON ped.payroll_id = ep.payroll_id
        WHERE ep.run_id = ?
          AND ep.gross_pay IS NOT NULL
          AND LOWER(COALESCE(ep.payroll_status, 'active')) <> 'hold'
          AND (ped.status IS NULL OR ped.status <> 'Sent')
        ORDER BY ep.payroll_id
      `, [Number(runId)]);
      summary.total = rows.length;
      const transporter = getTransporter(mailConfig);

      for (const payroll of rows) {
        const recipient = String(payroll.recipient_email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
          summary.skipped += 1;
          await conn.execute(`
            INSERT INTO payslip_email_deliveries
              (payroll_id, run_id, employee_id, recipient_email, status, error_message, sent_at)
            VALUES (?, ?, ?, NULL, 'Skipped', 'Employee has no valid email address', NULL)
            ON DUPLICATE KEY UPDATE status='Skipped', error_message=VALUES(error_message), sent_at=NULL
          `, [payroll.payroll_id, payroll.run_id, payroll.employee_id]);
          continue;
        }

        try {
          const mail = buildAutomaticPayslipEmail(payroll, company || {});
          await transporter.sendMail({
            from: { ...mailConfig.from, name: company?.company_name || mailConfig.from.name },
            replyTo: company?.email || undefined,
            to: recipient,
            ...mail
          });
          summary.sent += 1;
          await conn.execute(`
            INSERT INTO payslip_email_deliveries
              (payroll_id, run_id, employee_id, recipient_email, status, error_message, sent_at)
            VALUES (?, ?, ?, ?, 'Sent', NULL, NOW())
            ON DUPLICATE KEY UPDATE recipient_email=VALUES(recipient_email), status='Sent', error_message=NULL, sent_at=NOW()
          `, [payroll.payroll_id, payroll.run_id, payroll.employee_id, recipient]);
        } catch (error) {
          summary.failed += 1;
          await conn.execute(`
            INSERT INTO payslip_email_deliveries
              (payroll_id, run_id, employee_id, recipient_email, status, error_message, sent_at)
            VALUES (?, ?, ?, ?, 'Failed', ?, NULL)
            ON DUPLICATE KEY UPDATE recipient_email=VALUES(recipient_email), status='Failed', error_message=VALUES(error_message), sent_at=NULL
          `, [payroll.payroll_id, payroll.run_id, payroll.employee_id, recipient, String(error.message || 'Email delivery failed').slice(0, 500)]);
        }
      }

      return { ...summary, configured: true };
    } finally {
      if (conn) conn.release();
    }
  };

  // POST /api/payslip/send-email
  app.post('/api/payslip/send-email', async (req, res) => {
    const payrollId = Number(req.body.payroll_id) || null;
    const empCode   = String(req.body.emp_code || '').trim() || null;

    if (!payrollId && !empCode) {
      return res.status(400).json({ success: false, message: 'payroll_id or emp_code is required.' });
    }

    const mailConfig = getMailConfig();
    if (!mailConfig) {
      return res.status(503).json({
        success: false,
        message: 'Email is not configured on this server. Set GMAIL_USER and GMAIL_APP_PASSWORD in your environment.'
      });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [[companySettings]] = await conn.execute('SELECT * FROM company_settings WHERE id = 1').catch(() => [[{}]]);

      // Fetch payslip data
      let payroll;
      if (payrollId) {
        const [rows] = await conn.execute(`
          SELECT ep.payroll_id, ep.employee_id, ep.payroll_status,
                 ep.basic_salary, ep.overtime, ep.holiday_pay,
                 ep.taxable_allowances, ep.non_taxable_allowances,
                 ep.absence_deduction, ep.late_deduction, ep.undertime_deduction,
                 ep.sss_employee, ep.philhealth_employee, ep.pagibig_employee,
                 ep.gsis_employee, ep.tax_withheld, ep.loans, ep.other_deductions,
                 ep.adj_comp, ep.gross_pay, ep.total_deductions, ep.net_pay,
                 e.first_name, e.last_name, e.middle_name, e.emp_code,
                 ee.position, ee.department, ee.company,
                 pr.payroll_range
          FROM employee_payroll ep
          LEFT JOIN employees e ON e.employee_id = ep.employee_id
          LEFT JOIN employee_employment ee ON ee.employee_id = ep.employee_id
          LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
          WHERE ep.payroll_id = ?
          LIMIT 1
        `, [payrollId]);
        payroll = rows[0];
      } else {
        const [rows] = await conn.execute(`
          SELECT ep.payroll_id, ep.employee_id, ep.payroll_status,
                 ep.basic_salary, ep.overtime, ep.holiday_pay,
                 ep.taxable_allowances, ep.non_taxable_allowances,
                 ep.absence_deduction, ep.late_deduction, ep.undertime_deduction,
                 ep.sss_employee, ep.philhealth_employee, ep.pagibig_employee,
                 ep.gsis_employee, ep.tax_withheld, ep.loans, ep.other_deductions,
                 ep.adj_comp, ep.gross_pay, ep.total_deductions, ep.net_pay,
                 e.first_name, e.last_name, e.middle_name, e.emp_code,
                 ee.position, ee.department, ee.company,
                 pr.payroll_range
          FROM employee_payroll ep
          LEFT JOIN employees e ON e.employee_id = ep.employee_id
          LEFT JOIN employee_employment ee ON ee.employee_id = ep.employee_id
          LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
          WHERE e.emp_code = ? AND ep.gross_pay IS NOT NULL
          ORDER BY ep.run_id DESC
          LIMIT 1
        `, [empCode]);
        payroll = rows[0];
      }

      if (!payroll) {
        return res.status(404).json({ success: false, message: 'Payslip not found.' });
      }

      // Look up employee email from employee_contacts
      const [emailRows] = await conn.execute(`
        SELECT ec.email
        FROM employee_contacts ec
        WHERE ec.employee_id = ?
          AND TRIM(COALESCE(ec.email, '')) <> ''
        ORDER BY ec.contact_id DESC
        LIMIT 1
      `, [payroll.employee_id]);

      const recipientEmail = emailRows[0]?.email;
      if (!recipientEmail) {
        return res.status(404).json({
          success: false,
          message: 'No email address found for this employee. Please update their contact information.'
        });
      }

      const fullName = [
        payroll.first_name,
        payroll.middle_name ? payroll.middle_name[0] + '.' : '',
        payroll.last_name
      ].filter(Boolean).join(' ');

      const emailRows2 = [
        { label: 'Employee ID',      value: payroll.emp_code || '-' },
        { label: 'Position',         value: payroll.position  || '-' },
        { label: 'Department',       value: payroll.department || '-' },
        { label: 'Pay Period',       value: payroll.payroll_range || '-' },
        { label: 'Status',           value: payroll.payroll_status || '-', isStatus: true },
        { label: 'Basic Salary',     value: `₱${money(payroll.basic_salary)}` },
        ...(Number(payroll.overtime) > 0 ? [{ label: 'Overtime Pay',      value: `₱${money(payroll.overtime)}` }] : []),
        ...(Number(payroll.holiday_pay) > 0 ? [{ label: 'Holiday Pay',    value: `₱${money(payroll.holiday_pay)}` }] : []),
        { label: 'Gross Pay',        value: `₱${money(payroll.gross_pay)}` },
        ...(Number(payroll.absence_deduction) > 0 ? [{ label: 'Absences',   value: `-₱${money(payroll.absence_deduction)}` }] : []),
        ...(Number(payroll.late_deduction) > 0 ? [{ label: 'Tardiness',     value: `-₱${money(payroll.late_deduction)}` }] : []),
        ...(Number(payroll.undertime_deduction) > 0 ? [{ label: 'Undertime', value: `-₱${money(payroll.undertime_deduction)}` }] : []),
        ...(Number(payroll.sss_employee) > 0 ? [{ label: 'SSS Premium',     value: `-₱${money(payroll.sss_employee)}` }] : []),
        ...(Number(payroll.philhealth_employee) > 0 ? [{ label: 'PhilHealth', value: `-₱${money(payroll.philhealth_employee)}` }] : []),
        ...(Number(payroll.pagibig_employee) > 0 ? [{ label: 'Pag-IBIG',    value: `-₱${money(payroll.pagibig_employee)}` }] : []),
        ...(Number(payroll.gsis_employee) > 0 ? [{ label: 'GSIS',           value: `-₱${money(payroll.gsis_employee)}` }] : []),
        ...(Number(payroll.tax_withheld) > 0 ? [{ label: 'Tax Withheld',    value: `-₱${money(payroll.tax_withheld)}` }] : []),
        ...(Number(payroll.loans) > 0 ? [{ label: 'Loans',                  value: `-₱${money(payroll.loans)}` }] : []),
        { label: 'Total Deductions', value: `₱${money(payroll.total_deductions)}` },
        { label: '⭐ NET PAY',       value: `₱${money(payroll.net_pay)}` },
      ];

      const html = buildEmail({
        title: `Payslip — ${payroll.payroll_range || 'Current Period'}`,
        recipientName: fullName,
        intro: `Your payslip for the pay period ${payroll.payroll_range || 'most recent period'} is now available. Please review the details below.`,
        rows: emailRows2,
        closing: 'If you have questions about your payslip, please contact the HR department.',
        companyName: companySettings?.company_name || payroll.company || 'Astreablue Intelligence Inc.',
      });

      const transporter = getTransporter(mailConfig);
      await transporter.sendMail({
        from: { ...mailConfig.from, name: companySettings?.company_name || mailConfig.from.name },
        replyTo: companySettings?.email || undefined,
        to: recipientEmail,
        subject: `Your Payslip — ${payroll.payroll_range || 'Latest Period'} | ${companySettings?.company_name || 'HRIS'}`,
        text: [
          `Hi ${fullName},`,
          ``,
          `Your payslip for ${payroll.payroll_range || 'the most recent period'} is ready.`,
          ``,
          `  Gross Pay:        ₱${money(payroll.gross_pay)}`,
          `  Total Deductions: ₱${money(payroll.total_deductions)}`,
          `  NET PAY:          ₱${money(payroll.net_pay)}`,
          ``,
          `Please log in to the HRIS portal to view your full payslip.`,
          ``,
          `— ${companySettings?.company_name || 'Astreablue Intelligence Inc.'}`,
        ].join('\n'),
        html,
      });

      return res.json({ success: true, message: `Payslip sent to ${recipientEmail}` });
    } catch (err) {
      console.error('Payslip email error:', err);
      return res.status(500).json({ success: false, message: 'Server error while sending payslip email.' });
    } finally {
      if (conn) conn.release();
    }
  });
};
