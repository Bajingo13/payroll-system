const nodemailer = require('nodemailer');

module.exports = function (app, pool) {
  let leaveMailTransporter = null;

  function getLeaveMailConfig() {
    const user = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.MAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.SMTP_PASS || process.env.MAIL_PASS;

    if (!user || !pass) return null;

    return {
      user,
      pass,
      from: {
        name: process.env.MAIL_FROM_NAME || 'Astreablue Intelligence Inc.',
        address: user
      }
    };
  }

  function getLeaveMailTransporter() {
    const config = getLeaveMailConfig();
    if (!config) return null;

    if (!leaveMailTransporter) {
      leaveMailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: config.user,
          pass: config.pass
        }
      });
    }

    return leaveMailTransporter;
  }

  function formatLeaveDate(value) {
    if (!value) return 'N/A';

    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('en-PH', {
      month: 'long',
      day: '2-digit',
      year: 'numeric'
    });
  }

  function escapeMailHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildLeaveMailContent(request, status) {
    const employeeName = request.employee_name || request.emp_code || 'Employee';
    const leaveName = request.leave_name || 'Leave';
    const dateRange = `${formatLeaveDate(request.start_date)} to ${formatLeaveDate(request.end_date)}`;
    const totalDays = Number(request.total_days || 0).toFixed(2);
    const reason = request.reason || 'N/A';
    const statusText = String(status || request.status || 'Pending');

    const templates = {
      Pending: {
        subject: `Leave request for review: ${leaveName}`,
        intro: 'Your leave request has been submitted and is now for review.',
        closing: 'You will receive another email once HR/Admin approves or rejects your request.'
      },
      Approved: {
        subject: `Leave request approved: ${leaveName}`,
        intro: 'Good news. Your leave request has been approved.',
        closing: 'Please coordinate with your supervisor or HR if you need any further schedule guidance.'
      },
      Rejected: {
        subject: `Leave request rejected: ${leaveName}`,
        intro: 'Your leave request has been reviewed and rejected.',
        closing: 'Please contact HR or your supervisor if you need clarification about this decision.'
      }
    };

    const template = templates[statusText] || templates.Pending;
    const text = [
      `Hi ${employeeName},`,
      '',
      template.intro,
      '',
      `Leave Type: ${leaveName}`,
      `Date Range: ${dateRange}`,
      `Total Days: ${totalDays}`,
      `Reason: ${reason}`,
      `Status: ${statusText === 'Pending' ? 'For Review' : statusText}`,
      '',
      template.closing,
      '',
      'Payroll System'
    ].join('\n');

    const htmlEmployeeName = escapeMailHtml(employeeName);
    const htmlLeaveName = escapeMailHtml(leaveName);
    const htmlDateRange = escapeMailHtml(dateRange);
    const htmlTotalDays = escapeMailHtml(totalDays);
    const htmlReason = escapeMailHtml(reason);
    const htmlStatus = escapeMailHtml(statusText === 'Pending' ? 'For Review' : statusText);

    const html = `
      <p>Hi ${htmlEmployeeName},</p>
      <p>${escapeMailHtml(template.intro)}</p>
      <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0;"><strong>Leave Type</strong></td><td>${htmlLeaveName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;"><strong>Date Range</strong></td><td>${htmlDateRange}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;"><strong>Total Days</strong></td><td>${htmlTotalDays}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;"><strong>Reason</strong></td><td>${htmlReason}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;"><strong>Status</strong></td><td>${htmlStatus}</td></tr>
      </table>
      <p>${escapeMailHtml(template.closing)}</p>
      <p>Payroll System</p>
    `;

    return { subject: template.subject, text, html };
  }

  async function getLeaveRequestForNotification(conn, requestId) {
    const [rows] = await conn.execute(
      `SELECT
         r.request_id,
         r.status,
         r.start_date,
         r.end_date,
         r.total_days,
         r.reason,
         e.emp_code,
         CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
         ec.email,
         t.leave_name
       FROM employee_leave_requests r
       JOIN employees e ON e.employee_id = r.employee_id
       LEFT JOIN employee_contacts ec ON ec.contact_id = (
         SELECT c.contact_id
         FROM employee_contacts c
         WHERE c.employee_id = e.employee_id
         ORDER BY c.contact_id DESC
         LIMIT 1
       )
       JOIN leave_types t ON t.leave_type_id = r.leave_type_id
       WHERE r.request_id = ?
       LIMIT 1`,
      [requestId]
    );

    return rows[0] || null;
  }

  async function sendLeaveRequestNotification(conn, requestId, status) {
    try {
      const config = getLeaveMailConfig();
      const transporter = getLeaveMailTransporter();
      if (!config || !transporter) {
        console.warn('Leave email skipped: Gmail SMTP credentials are not configured.');
        return false;
      }

      const request = await getLeaveRequestForNotification(conn, requestId);
      const recipient = String((request && request.email) || '').trim();
      if (!request || !recipient) {
        console.warn(`Leave email skipped: no employee email found for request #${requestId}.`);
        return false;
      }

      const mail = buildLeaveMailContent(request, status);
      await transporter.sendMail({
        from: config.from,
        to: recipient,
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      });

      return true;
    } catch (err) {
      console.warn('Leave email notification skipped:', err.message);
      return false;
    }
  }

  async function findEmployeeByUser(conn, user) {
    const username = String((user && user.username) || '').trim();
    if (username) {
      const [codeRows] = await conn.execute(
        `SELECT e.employee_id, e.emp_code, e.status
         FROM employees e
         WHERE LOWER(TRIM(e.emp_code)) = LOWER(TRIM(?))
         ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
         LIMIT 1`,
        [username]
      );
      if (codeRows[0]) return codeRows[0];
    }

    const fullName = String((user && user.full_name) || '').trim();
    if (!fullName) return null;

    const [exactRows] = await conn.execute(
      `SELECT e.employee_id, e.emp_code, e.status
       FROM employees e
       WHERE LOWER(TRIM(CONCAT(e.first_name, ' ', e.last_name))) = LOWER(TRIM(?))
       ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
       LIMIT 1`,
      [fullName]
    );
    if (exactRows[0]) return exactRows[0];

    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const [rows] = await conn.execute(
        `SELECT e.employee_id, e.emp_code, e.status
         FROM employees e
         WHERE LOWER(TRIM(e.first_name)) = LOWER(TRIM(?))
           AND LOWER(TRIM(e.last_name)) = LOWER(TRIM(?))
         ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
         LIMIT 1`,
        [parts[0], parts[parts.length - 1]]
      );
      if (rows[0]) return rows[0];
    }

    const [likeRows] = await conn.execute(
      `SELECT e.employee_id, e.emp_code, e.status
       FROM employees e
       WHERE LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER(?)
       ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
       LIMIT 1`,
      [`%${fullName}%`]
    );

    return likeRows[0] || null;
  }

  async function createEmployeeSkeletonForUser(conn, user) {
    const fullName = String((user && user.full_name) || '').trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Employee';
    const lastName = parts.length > 1 ? parts[parts.length - 1] : 'User';

    const baseRaw = String((user && user.username) || `USR${user.user_id || '0'}`)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const baseCode = baseRaw || `USR${user.user_id || '0'}`;

    let candidateCode = baseCode;
    let suffix = 1;
    while (true) {
      const [exists] = await conn.execute('SELECT employee_id FROM employees WHERE emp_code = ? LIMIT 1', [candidateCode]);
      if (!exists.length) break;
      candidateCode = `${baseCode}${suffix}`;
      suffix += 1;
    }

    const [insertResult] = await conn.execute(
      `INSERT INTO employees (emp_code, first_name, last_name, status)
       VALUES (?, ?, ?, 'Active')`,
      [candidateCode, firstName, lastName]
    );

    const employeeId = insertResult.insertId;

    await conn.execute(
      `INSERT INTO employee_contacts (employee_id, mobile_no, email)
       VALUES (?, NULL, NULL)`,
      [employeeId]
    );

    await conn.execute(
      `INSERT INTO employee_employment (employee_id, company, department, position, date_hired)
       VALUES (?, 'N/A', NULL, NULL, CURDATE())`,
      [employeeId]
    );

    await conn.execute(
      `INSERT INTO employee_accounts (employee_id)
       VALUES (?)`,
      [employeeId]
    );

    const [rows] = await conn.execute(
      'SELECT employee_id, emp_code, status FROM employees WHERE employee_id = ? LIMIT 1',
      [employeeId]
    );

    return rows[0] || null;
  }

  async function ensureLeaveTables(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS leave_types (
        leave_type_id INT NOT NULL AUTO_INCREMENT,
        leave_name VARCHAR(100) NOT NULL,
        annual_allocation_days DECIMAL(6,2) NOT NULL DEFAULT 0,
        PRIMARY KEY (leave_type_id),
        UNIQUE KEY uq_leave_name (leave_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_leave_requests (
        request_id INT NOT NULL AUTO_INCREMENT,
        employee_id INT NOT NULL,
        leave_type_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days DECIMAL(6,2) NOT NULL,
        reason TEXT NULL,
        status ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (request_id),
        KEY idx_leave_employee (employee_id),
        KEY idx_leave_range (start_date, end_date),
        KEY idx_leave_status (status),
        CONSTRAINT fk_leave_employee
          FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_leave_type
          FOREIGN KEY (leave_type_id) REFERENCES leave_types (leave_type_id)
          ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS leave_balance_rules (
        rule_id INT NOT NULL AUTO_INCREMENT,
        rule_name VARCHAR(120) NOT NULL,
        leave_type_id INT NOT NULL,
        accrual_days DECIMAL(6,2) NOT NULL DEFAULT 0,
        accrual_frequency ENUM('Monthly','Quarterly','Yearly','Manual') NOT NULL DEFAULT 'Monthly',
        carry_over_limit DECIMAL(6,2) NOT NULL DEFAULT 0,
        adjustment_days DECIMAL(6,2) NOT NULL DEFAULT 0,
        reset_month TINYINT NOT NULL DEFAULT 12,
        reset_day TINYINT NOT NULL DEFAULT 31,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (rule_id),
        KEY idx_leave_balance_rule_type (leave_type_id),
        CONSTRAINT fk_leave_balance_rule_type
          FOREIGN KEY (leave_type_id) REFERENCES leave_types (leave_type_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await conn.execute(
      `INSERT IGNORE INTO leave_types (leave_name, annual_allocation_days)
       VALUES
         ('Vacation Leave', 15),
         ('Sick Leave', 15),
         ('Emergency Leave', 5),
         ('Maternity Leave', 105),
         ('Paternity Leave', 7),
         ('Bereavement Leave', 5)`
    );

    const [ruleCountRows] = await conn.execute('SELECT COUNT(*) AS total FROM leave_balance_rules');
    if (Number(ruleCountRows[0]?.total || 0) === 0) {
      await conn.execute(`
        INSERT INTO leave_balance_rules
          (rule_name, leave_type_id, accrual_days, accrual_frequency, carry_over_limit, adjustment_days, reset_month, reset_day)
        SELECT CONCAT(leave_name, ' Standard Rule'), leave_type_id, annual_allocation_days, 'Yearly', 5, 0, 12, 31
        FROM leave_types
        WHERE leave_name IN ('Vacation Leave', 'Sick Leave', 'Emergency Leave')
      `);
    }
  }

  function daysInclusive(startDate, endDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const diff = end.getTime() - start.getTime();
    if (Number.isNaN(diff)) return 0;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  }

  function canManageLeave(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized.includes('admin') || normalized.includes('hr') || normalized.includes('human resource');
  }

  async function findUserById(conn, userId) {
    const [users] = await conn.execute(
      'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    );

    return users[0] || null;
  }

  async function writeLeaveAudit(conn, user, action, status) {
    try {
      await conn.execute(
        "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
        [user.user_id, user.full_name, action, status]
      );
    } catch (err) {
      console.warn('Leave audit log skipped:', err.message);
    }
  }

  app.get('/api/employee/leave-overview', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLeaveTables(conn);

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const normalizedRole = String(users[0].role || '').trim().toLowerCase();

      let employee = await findEmployeeByUser(conn, users[0]);
      if (!employee && normalizedRole !== 'admin' && normalizedRole !== 'hr') {
        employee = await createEmployeeSkeletonForUser(conn, users[0]);
      }
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found' });
      }

      const [types] = await conn.execute(
        'SELECT leave_type_id, leave_name, annual_allocation_days FROM leave_types ORDER BY leave_name ASC'
      );

      const [approvedUsage] = await conn.execute(
        `SELECT leave_type_id, SUM(total_days) AS used_days
         FROM employee_leave_requests
         WHERE employee_id = ?
           AND status = 'Approved'
           AND YEAR(start_date) = YEAR(CURDATE())
         GROUP BY leave_type_id`,
        [employee.employee_id]
      );

      const usageMap = new Map(
        approvedUsage.map((row) => [Number(row.leave_type_id), Number(row.used_days || 0)])
      );

      const balances = types.map((type) => {
        const allocation = Number(type.annual_allocation_days || 0);
        const used = usageMap.get(Number(type.leave_type_id)) || 0;
        return {
          leave_type_id: type.leave_type_id,
          leave_name: type.leave_name,
          allocation_days: allocation,
          used_days: used,
          remaining_days: Math.max(allocation - used, 0)
        };
      });

      const [requests] = await conn.execute(
        `SELECT r.request_id, r.leave_type_id, t.leave_name, r.start_date, r.end_date, r.total_days, r.reason, r.status, r.created_at
         FROM employee_leave_requests r
         JOIN leave_types t ON t.leave_type_id = r.leave_type_id
         WHERE r.employee_id = ?
         ORDER BY r.created_at DESC
         LIMIT 120`,
        [employee.employee_id]
      );

      return res.json({
        success: true,
        leaveTypes: types,
        leaveBalances: balances,
        leaveRequests: requests
      });
    } catch (err) {
      console.error('Leave overview error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/employee/leave-request', async (req, res) => {
    const userId = Number(req.body.user_id);
    const leaveTypeId = Number(req.body.leave_type_id);
    const startDate = String(req.body.start_date || '').trim();
    const endDate = String(req.body.end_date || '').trim();
    const reason = String(req.body.reason || '').trim();

    if (!userId || !leaveTypeId || !startDate || !endDate || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required leave request fields' });
    }

    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date' });
    }

    const totalDays = daysInclusive(startDate, endDate);
    if (totalDays <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid leave date range' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLeaveTables(conn);

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const normalizedRole = String(users[0].role || '').trim().toLowerCase();

      let employee = await findEmployeeByUser(conn, users[0]);
      if (!employee && normalizedRole !== 'admin' && normalizedRole !== 'hr') {
        employee = await createEmployeeSkeletonForUser(conn, users[0]);
      }
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found' });
      }

      const [typeRows] = await conn.execute(
        'SELECT leave_type_id, leave_name FROM leave_types WHERE leave_type_id = ? LIMIT 1',
        [leaveTypeId]
      );

      if (!typeRows.length) {
        return res.status(404).json({ success: false, message: 'Invalid leave type selected' });
      }

      const [overlap] = await conn.execute(
        `SELECT request_id
         FROM employee_leave_requests
         WHERE employee_id = ?
           AND status IN ('Pending', 'Approved')
           AND NOT (end_date < ? OR start_date > ?)
         LIMIT 1`,
        [employee.employee_id, startDate, endDate]
      );

      if (overlap.length) {
        return res.status(409).json({
          success: false,
          message: 'You already have an overlapping pending/approved leave request.'
        });
      }

      const [insertResult] = await conn.execute(
        `INSERT INTO employee_leave_requests
         (employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
        [employee.employee_id, leaveTypeId, startDate, endDate, totalDays, reason]
      );

      const emailSent = await sendLeaveRequestNotification(conn, insertResult.insertId, 'Pending');

      return res.json({
        success: true,
        message: 'Leave request submitted successfully.',
        emailNotificationSent: emailSent
      });
    } catch (err) {
      console.error('Leave request save error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/admin/leave-requests', async (req, res) => {
    const userId = Number(req.query.user_id);
    const status = String(req.query.status || '').trim();
    const allowedStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid leave status filter' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLeaveTables(conn);

      const adminUser = await findUserById(conn, userId);
      if (!adminUser || !canManageLeave(adminUser.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can manage leave requests.' });
      }

      const params = [];
      let whereClause = '';
      if (status) {
        whereClause = 'WHERE r.status = ?';
        params.push(status);
      }

      const [requests] = await conn.execute(
        `SELECT
           r.request_id,
           r.employee_id,
           e.emp_code,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
           ee.department,
           r.leave_type_id,
           t.leave_name,
           r.start_date,
           r.end_date,
           r.total_days,
           r.reason,
           r.status,
           r.created_at,
           r.updated_at
         FROM employee_leave_requests r
         JOIN employees e ON e.employee_id = r.employee_id
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         JOIN leave_types t ON t.leave_type_id = r.leave_type_id
         ${whereClause}
         ORDER BY
           CASE r.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 WHEN 'Rejected' THEN 2 ELSE 3 END,
           r.created_at DESC
         LIMIT 200`,
        params
      );

      const [summaryRows] = await conn.execute(
        `SELECT status, COUNT(*) AS count
         FROM employee_leave_requests
         GROUP BY status`
      );

      const summary = {
        Pending: 0,
        Approved: 0,
        Rejected: 0,
        Cancelled: 0
      };

      summaryRows.forEach((row) => {
        summary[row.status] = Number(row.count || 0);
      });

      return res.json({ success: true, requests, summary });
    } catch (err) {
      console.error('Admin leave requests error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/admin/leave-balance-rules', async (req, res) => {
    const userId = Number(req.query.user_id);

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLeaveTables(conn);

      const adminUser = await findUserById(conn, userId);
      if (!adminUser || !canManageLeave(adminUser.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can manage leave balance rules.' });
      }

      const [leaveTypes] = await conn.execute(
        'SELECT leave_type_id, leave_name, annual_allocation_days FROM leave_types ORDER BY leave_name ASC'
      );

      const [rules] = await conn.execute(
        `SELECT
           r.rule_id,
           r.rule_name,
           r.leave_type_id,
           t.leave_name,
           r.accrual_days,
           r.accrual_frequency,
           r.carry_over_limit,
           r.adjustment_days,
           r.reset_month,
           r.reset_day,
           r.is_active,
           r.updated_at
         FROM leave_balance_rules r
         JOIN leave_types t ON t.leave_type_id = r.leave_type_id
         ORDER BY r.is_active DESC, t.leave_name ASC, r.rule_name ASC`
      );

      return res.json({ success: true, leaveTypes, rules });
    } catch (err) {
      console.error('Leave balance rules load error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/admin/leave-balance-rules', async (req, res) => {
    const userId = Number(req.body.user_id);
    const ruleId = Number(req.body.rule_id || 0);
    const ruleName = String(req.body.rule_name || '').trim();
    const leaveTypeId = Number(req.body.leave_type_id);
    const accrualDays = Number(req.body.accrual_days || 0);
    const accrualFrequency = String(req.body.accrual_frequency || 'Monthly').trim();
    const carryOverLimit = Number(req.body.carry_over_limit || 0);
    const adjustmentDays = Number(req.body.adjustment_days || 0);
    const resetMonth = Number(req.body.reset_month || 12);
    const resetDay = Number(req.body.reset_day || 31);
    const isActive = Number(req.body.is_active) === 0 ? 0 : 1;
    const allowedFrequencies = ['Monthly', 'Quarterly', 'Yearly', 'Manual'];

    if (!userId || !ruleName || !leaveTypeId) {
      return res.status(400).json({ success: false, message: 'Rule name and leave type are required.' });
    }

    if (!allowedFrequencies.includes(accrualFrequency)) {
      return res.status(400).json({ success: false, message: 'Invalid accrual frequency.' });
    }

    if (resetMonth < 1 || resetMonth > 12 || resetDay < 1 || resetDay > 31) {
      return res.status(400).json({ success: false, message: 'Invalid year-end reset date.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLeaveTables(conn);

      const adminUser = await findUserById(conn, userId);
      if (!adminUser || !canManageLeave(adminUser.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can manage leave balance rules.' });
      }

      const [typeRows] = await conn.execute(
        'SELECT leave_type_id, leave_name FROM leave_types WHERE leave_type_id = ? LIMIT 1',
        [leaveTypeId]
      );

      if (!typeRows.length) {
        return res.status(404).json({ success: false, message: 'Leave type not found.' });
      }

      if (ruleId) {
        await conn.execute(
          `UPDATE leave_balance_rules
           SET rule_name = ?,
               leave_type_id = ?,
               accrual_days = ?,
               accrual_frequency = ?,
               carry_over_limit = ?,
               adjustment_days = ?,
               reset_month = ?,
               reset_day = ?,
               is_active = ?
           WHERE rule_id = ?`,
          [ruleName, leaveTypeId, accrualDays, accrualFrequency, carryOverLimit, adjustmentDays, resetMonth, resetDay, isActive, ruleId]
        );
      } else {
        await conn.execute(
          `INSERT INTO leave_balance_rules
           (rule_name, leave_type_id, accrual_days, accrual_frequency, carry_over_limit, adjustment_days, reset_month, reset_day, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ruleName, leaveTypeId, accrualDays, accrualFrequency, carryOverLimit, adjustmentDays, resetMonth, resetDay, isActive]
        );
      }

      await writeLeaveAudit(
        conn,
        adminUser,
        `${ruleId ? 'Updated' : 'Created'} leave balance rule "${ruleName}"`,
        'Success'
      );

      return res.json({ success: true, message: 'Leave balance rule saved successfully.' });
    } catch (err) {
      console.error('Leave balance rule save error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.patch('/api/admin/leave-requests/:requestId/status', async (req, res) => {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.body.user_id);
    const nextStatus = String(req.body.status || '').trim();
    const allowedStatuses = ['Approved', 'Rejected'];

    if (!requestId || !userId || !nextStatus) {
      return res.status(400).json({ success: false, message: 'Missing required approval fields' });
    }

    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Leave request can only be approved or rejected here.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLeaveTables(conn);

      const adminUser = await findUserById(conn, userId);
      if (!adminUser || !canManageLeave(adminUser.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can manage leave requests.' });
      }

      await conn.beginTransaction();

      const [requests] = await conn.execute(
        `SELECT
           r.request_id,
           r.status,
           e.emp_code,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
           t.leave_name
         FROM employee_leave_requests r
         JOIN employees e ON e.employee_id = r.employee_id
         JOIN leave_types t ON t.leave_type_id = r.leave_type_id
         WHERE r.request_id = ?
         LIMIT 1
         FOR UPDATE`,
        [requestId]
      );

      if (!requests.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Leave request not found.' });
      }

      const request = requests[0];
      if (request.status !== 'Pending') {
        await conn.rollback();
        return res.status(409).json({ success: false, message: `Leave request is already ${request.status}.` });
      }

      await conn.execute(
        `UPDATE employee_leave_requests
         SET status = ?
         WHERE request_id = ?`,
        [nextStatus, requestId]
      );

      await writeLeaveAudit(
        conn,
        adminUser,
        `${nextStatus} leave request #${requestId} for ${request.employee_name || request.emp_code} (${request.leave_name})`,
        'Success'
      );

      await conn.commit();

      const emailSent = await sendLeaveRequestNotification(conn, requestId, nextStatus);

      return res.json({
        success: true,
        message: `Leave request ${nextStatus.toLowerCase()} successfully.`,
        emailNotificationSent: emailSent
      });
    } catch (err) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackErr) {
          console.error('Leave approval rollback error:', rollbackErr);
        }
      }
      console.error('Admin leave status update error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });
};
