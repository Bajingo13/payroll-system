const nodemailer = require('nodemailer');
const { createNotification, createNotificationsForAdminHr } = require('./notificationHelper');
const { buildEmail, statusBadge } = require('./emailTemplate');

module.exports = function (app, pool) {
  let overtimeMailTransporter = null;

  function canManageOvertime(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized.includes('admin') || normalized.includes('hr') || normalized.includes('human resource');
  }

  function isDateOnly(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
  }

  function isTimeOnly(value) {
    return /^\d{2}:\d{2}$/.test(String(value || '').trim());
  }

  function getMailConfig() {
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

  function getMailTransporter() {
    const config = getMailConfig();
    if (!config) return null;
    if (!overtimeMailTransporter) {
      overtimeMailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.user, pass: config.pass }
      });
    }
    return overtimeMailTransporter;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-PH', { month: 'long', day: '2-digit', year: 'numeric' });
  }

  function formatTime(value) {
    if (!value) return 'N/A';
    const text = String(value).slice(0, 5);
    const date = new Date(`2000-01-01T${text}:00`);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function computeHours(startTime, endTime) {
    const start = new Date(`2000-01-01T${startTime}:00`);
    const end = new Date(`2000-01-01T${endTime}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
    return Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100;
  }

  async function ensureOvertimeTables(conn) {
    try {
      await conn.execute(`ALTER TABLE employee_overtime_requests ADD COLUMN rejection_reason TEXT NULL AFTER status`);
    } catch { /* column already exists */ }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_overtime_requests (
        overtime_request_id INT NOT NULL AUTO_INCREMENT,
        employee_id INT NOT NULL,
        overtime_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        total_hours DECIMAL(6,2) NOT NULL,
        reason TEXT NULL,
        status ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (overtime_request_id),
        KEY idx_overtime_employee (employee_id),
        KEY idx_overtime_date (overtime_date),
        KEY idx_overtime_status (status),
        CONSTRAINT fk_overtime_employee
          FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async function findUserById(conn, userId) {
    const [users] = await conn.execute(
      'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return users[0] || null;
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

    return null;
  }

  async function getOvertimeRequestForNotification(conn, requestId) {
    const [rows] = await conn.execute(
      `SELECT
         r.overtime_request_id,
         r.overtime_date,
         r.start_time,
         r.end_time,
         r.total_hours,
         r.reason,
         r.rejection_reason,
         r.status,
         e.emp_code,
         CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
         ec.email
       FROM employee_overtime_requests r
       JOIN employees e ON e.employee_id = r.employee_id
       LEFT JOIN employee_contacts ec ON ec.contact_id = (
         SELECT c.contact_id
         FROM employee_contacts c
         WHERE c.employee_id = e.employee_id
         ORDER BY c.contact_id DESC
         LIMIT 1
       )
       WHERE r.overtime_request_id = ?
       LIMIT 1`,
      [requestId]
    );
    return rows[0] || null;
  }

  function buildOvertimeMail(request, status) {
    const employeeName    = request.employee_name || request.emp_code || 'Employee';
    const statusText      = String(status || request.status || 'Pending');
    const displayStatus   = statusText === 'Pending' ? 'For Review' : statusText;
    const rejectionReason = request.rejection_reason || null;

    const templates = {
      Pending: {
        subject: 'Overtime Request Submitted — For Review',
        intro:   'Your overtime request has been successfully submitted and is currently awaiting review by HR/Admin. You will be notified once a decision has been made.',
        closing: 'Thank you for submitting your overtime request. Please monitor your notifications for updates.',
      },
      Approved: {
        subject: 'Overtime Request Approved',
        intro:   'Great news! Your overtime request has been reviewed and approved. The corresponding pay will be reflected in your next payroll run.',
        closing: 'Please coordinate with your supervisor if you have any questions regarding overtime compensation.',
      },
      Rejected: {
        subject: 'Overtime Request Not Approved',
        intro:   'Your overtime request has been reviewed and was not approved at this time.',
        closing: 'For further clarification regarding this decision, please contact your supervisor or the Human Resources Department.',
      },
    };

    const template = templates[statusText] || templates.Pending;

    // Plain-text fallback
    const lines = [
      `Hi ${employeeName},`, '', template.intro, '',
      `Date        : ${formatDate(request.overtime_date)}`,
      `Time        : ${formatTime(request.start_time)} to ${formatTime(request.end_time)}`,
      `Total Hours : ${Number(request.total_hours || 0).toFixed(2)}`,
      `Reason      : ${request.reason || 'N/A'}`,
      `Status      : ${displayStatus}`,
    ];
    if (statusText === 'Rejected' && rejectionReason) {
      lines.push(`Rejection Reason: ${rejectionReason}`);
    }
    lines.push('', template.closing, '', 'AstreaBlue Intelligence Inc. HRIS & Payroll System');

    // Modern HTML
    const html = buildEmail({
      title:         `Overtime Request — ${displayStatus}`,
      recipientName: employeeName,
      intro:         template.intro,
      rows: [
        { label: 'Date',         value: formatDate(request.overtime_date) },
        { label: 'Time',         value: `${formatTime(request.start_time)} to ${formatTime(request.end_time)}` },
        { label: 'Total Hours',  value: `${Number(request.total_hours || 0).toFixed(2)} hr(s)` },
        { label: 'Reason',       value: request.reason || 'N/A' },
        { label: 'Status',       value: statusBadge(displayStatus), isStatus: true },
      ],
      rejectionReason: statusText === 'Rejected' ? rejectionReason : null,
      closing: template.closing,
    });

    return { subject: template.subject, text: lines.join('\n'), html };
  }

  async function getAdminHrEmails(conn) {
    const emails = new Set();

    const envEmails = (process.env.NOTIFY_ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
    console.log('[Overtime] NOTIFY_ADMIN_EMAILS from env:', envEmails);
    envEmails.forEach((e) => emails.add(e));

    try {
      const [adminUsers] = await conn.execute(`
        SELECT user_id, username, full_name, email FROM users
        WHERE (LOWER(role) LIKE '%admin%' OR LOWER(role) LIKE '%hr%')
          AND (account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated','deleted'))
          AND deleted_at IS NULL
        LIMIT 50
      `);

      for (const u of adminUsers) {
        // Primary: use email column on users table directly
        if (u.email && u.email.trim()) {
          emails.add(u.email.trim());
          continue;
        }
        // Fallback: look up via employee_contacts by emp_code match
        const [byCode] = await conn.execute(
          `SELECT ec.email FROM employee_contacts ec
           JOIN employees e ON e.employee_id = ec.employee_id
           WHERE LOWER(TRIM(e.emp_code)) = LOWER(TRIM(?))
             AND ec.email IS NOT NULL AND ec.email != ''
           ORDER BY ec.contact_id DESC LIMIT 1`,
          [u.username || '']
        );
        if (byCode.length && byCode[0].email) { emails.add(byCode[0].email.trim()); continue; }

        if (u.full_name) {
          const parts = u.full_name.trim().split(/\s+/).filter(Boolean);
          if (parts.length >= 2) {
            const [byName] = await conn.execute(
              `SELECT ec.email FROM employee_contacts ec
               JOIN employees e ON e.employee_id = ec.employee_id
               WHERE LOWER(TRIM(e.first_name)) = LOWER(?) AND LOWER(TRIM(e.last_name)) = LOWER(?)
                 AND ec.email IS NOT NULL AND ec.email != ''
               ORDER BY ec.contact_id DESC LIMIT 1`,
              [parts[0], parts[parts.length - 1]]
            );
            if (byName.length && byName[0].email) emails.add(byName[0].email.trim());
          }
        }
      }
    } catch (err) {
      console.warn('getAdminHrEmails error:', err.message);
    }

    return [...emails].filter(Boolean);
  }

  async function sendOvertimeAdminNotification(requestId) {
    let conn;
    try {
      const config = getMailConfig();
      const transporter = getMailTransporter();
      if (!config || !transporter) return false;

      conn = await pool.getConnection();

      const adminEmails = await getAdminHrEmails(conn);
      if (!adminEmails.length) {
        console.warn('Overtime admin notification skipped: no admin/HR email addresses found.');
        return false;
      }

      const request = await getOvertimeRequestForNotification(conn, requestId);
      if (!request) return false;

      const employeeName = request.employee_name || request.emp_code || 'Employee';
      const dateStr = formatDate(request.overtime_date);
      const timeRange = `${formatTime(request.start_time)} to ${formatTime(request.end_time)}`;
      const totalHours = Number(request.total_hours || 0).toFixed(2);
      const reason = request.reason || 'N/A';

      const subject = `Action Required: New Overtime Request — ${employeeName}`;
      const text = [
        'A new overtime request has been submitted and requires your review.',
        '',
        `Employee   : ${employeeName}`,
        `Date       : ${dateStr}`,
        `Time       : ${timeRange}`,
        `Total Hours: ${totalHours}`,
        `Reason     : ${reason}`,
        `Status     : For Review`,
        '',
        'Please log in to the HRIS system to approve or reject this request.',
        '',
        'AstreaBlue Intelligence Inc. HRIS & Payroll System'
      ].join('\n');

      const html = buildEmail({
        title:         'New Overtime Request — Action Required',
        recipientName: 'HR / Admin',
        intro:         `A new overtime request has been submitted by ${employeeName} and is awaiting your review and action.`,
        rows: [
          { label: 'Employee',    value: employeeName },
          { label: 'Date',        value: dateStr      },
          { label: 'Time',        value: timeRange    },
          { label: 'Total Hours', value: `${totalHours} hr(s)` },
          { label: 'Reason',      value: reason       },
          { label: 'Status',      value: statusBadge('For Review'), isStatus: true },
        ],
        closing: 'Please log in to the HRIS system to approve or reject this request at your earliest convenience.',
      });

      await transporter.sendMail({ from: config.from, to: adminEmails.join(', '), subject, text, html });
      console.log(`Overtime admin notification sent to: ${adminEmails.join(', ')}`);
      return true;
    } catch (err) {
      console.warn('Overtime admin notification error:', err.message);
      return false;
    } finally {
      if (conn) conn.release();
    }
  }

  async function sendOvertimeNotification(conn, requestId, status) {
    try {
      const config = getMailConfig();
      const transporter = getMailTransporter();
      if (!config || !transporter) {
        console.warn('Overtime email skipped: Gmail SMTP credentials are not configured.');
        return false;
      }

      const request = await getOvertimeRequestForNotification(conn, requestId);
      const recipient = String((request && request.email) || '').trim();
      if (!request || !recipient) {
        console.warn(`Overtime email skipped: no employee email found for request #${requestId}.`);
        return false;
      }

      const mail = buildOvertimeMail(request, status);
      await transporter.sendMail({
        from: config.from,
        to: recipient,
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      });
      return true;
    } catch (err) {
      console.warn('Overtime email notification skipped:', err.message);
      return false;
    }
  }

  async function writeOvertimeAudit(conn, user, action, status) {
    try {
      await conn.execute(
        'INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)',
        [user.user_id, user.full_name, action, status]
      );
    } catch (err) {
      console.warn('Overtime audit log skipped:', err.message);
    }
  }

  app.get('/api/employee/overtime-overview', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) return res.status(400).json({ success: false, message: 'Missing user_id' });

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureOvertimeTables(conn);

      const user = await findUserById(conn, userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const employee = await findEmployeeByUser(conn, user);
      if (!employee) return res.status(404).json({ success: false, message: 'Employee record not found' });

      const [requests] = await conn.execute(
        `SELECT overtime_request_id, overtime_date, start_time, end_time, total_hours, reason, status, created_at, updated_at
         FROM employee_overtime_requests
         WHERE employee_id = ?
         ORDER BY created_at DESC
         LIMIT 120`,
        [employee.employee_id]
      );

      return res.json({ success: true, requests });
    } catch (err) {
      console.error('Employee overtime overview error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/employee/overtime-request', async (req, res) => {
    const userId = Number(req.body.user_id);
    const overtimeDate = String(req.body.overtime_date || '').trim();
    const startTime = String(req.body.start_time || '').trim();
    const endTime = String(req.body.end_time || '').trim();
    const reason = String(req.body.reason || '').trim();

    if (!userId || !isDateOnly(overtimeDate) || !isTimeOnly(startTime) || !isTimeOnly(endTime) || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required overtime request fields.' });
    }

    const totalHours = computeHours(startTime, endTime);
    if (totalHours <= 0) {
      return res.status(400).json({ success: false, message: 'End time must be later than start time.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureOvertimeTables(conn);

      const user = await findUserById(conn, userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const employee = await findEmployeeByUser(conn, user);
      if (!employee) return res.status(404).json({ success: false, message: 'Employee record not found' });

      const [overlap] = await conn.execute(
        `SELECT overtime_request_id
         FROM employee_overtime_requests
         WHERE employee_id = ?
           AND overtime_date = ?
           AND status IN ('Pending', 'Approved')
           AND NOT (end_time <= ? OR start_time >= ?)
         LIMIT 1`,
        [employee.employee_id, overtimeDate, startTime, endTime]
      );

      if (overlap.length) {
        return res.status(409).json({ success: false, message: 'You already have an overlapping pending/approved overtime request.' });
      }

      const [insertResult] = await conn.execute(
        `INSERT INTO employee_overtime_requests
         (employee_id, overtime_date, start_time, end_time, total_hours, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
        [employee.employee_id, overtimeDate, startTime, endTime, totalHours, reason]
      );

      sendOvertimeAdminNotification(insertResult.insertId).catch((err) => console.warn('Overtime admin notify error:', err.message));

      const employeeDisplayName = user.full_name || user.username || 'An employee';
      await createNotificationsForAdminHr(
        pool,
        'overtime_request',
        'New Overtime Request',
        `${employeeDisplayName} submitted an overtime request for ${overtimeDate} (${startTime}–${endTime}, ${totalHours} hrs).`
      );

      return res.json({ success: true, message: 'Overtime request submitted successfully.' });
    } catch (err) {
      console.error('Employee overtime request error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.patch('/api/employee/overtime-requests/:requestId/cancel', async (req, res) => {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.body.user_id);

    if (!requestId || !userId) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureOvertimeTables(conn);

      const [rows] = await conn.execute(
        `SELECT r.overtime_request_id, r.status
         FROM employee_overtime_requests r
         JOIN employees e ON e.employee_id = r.employee_id
         WHERE r.overtime_request_id = ? AND e.employee_id = (
           SELECT employee_id FROM employees WHERE user_id = ? LIMIT 1
         )
         LIMIT 1`,
        [requestId, userId]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Overtime request not found.' });
      }

      if (rows[0].status !== 'Pending') {
        return res.status(409).json({ success: false, message: `Overtime request is already ${rows[0].status} and cannot be cancelled.` });
      }

      await conn.execute(
        `UPDATE employee_overtime_requests SET status = 'Cancelled', updated_at = NOW() WHERE overtime_request_id = ?`,
        [requestId]
      );

      return res.json({ success: true, message: 'Overtime request cancelled successfully.' });
    } catch (err) {
      console.error('Overtime cancel error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/admin/overtime-requests', async (req, res) => {
    const userId = Number(req.query.user_id);
    const status = String(req.query.status || '').trim();
    const allowedStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

    if (!userId) return res.status(400).json({ success: false, message: 'Missing user_id' });
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid overtime status filter.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureOvertimeTables(conn);

      const adminUser = await findUserById(conn, userId);
      if (!adminUser || !canManageOvertime(adminUser.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can manage overtime requests.' });
      }

      const params = [];
      let whereClause = '';
      if (status) {
        whereClause = 'WHERE r.status = ?';
        params.push(status);
      }

      const [requests] = await conn.execute(
        `SELECT
           r.overtime_request_id,
           r.employee_id,
           e.emp_code,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
           ee.department,
           r.overtime_date,
           r.start_time,
           r.end_time,
           r.total_hours,
           r.reason,
           r.rejection_reason,
           r.status,
           r.created_at,
           r.updated_at
         FROM employee_overtime_requests r
         JOIN employees e ON e.employee_id = r.employee_id
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         ${whereClause}
         ORDER BY r.updated_at DESC, r.created_at DESC
         LIMIT 200`,
        params
      );

      const [summaryRows] = await conn.execute(
        `SELECT status, COUNT(*) AS count
         FROM employee_overtime_requests
         GROUP BY status`
      );

      const summary = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
      summaryRows.forEach((row) => {
        summary[row.status] = Number(row.count || 0);
      });

      return res.json({ success: true, requests, summary });
    } catch (err) {
      console.error('Admin overtime requests error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.patch('/api/admin/overtime-requests/:requestId/status', async (req, res) => {
    const requestId = Number(req.params.requestId);
    const userId = Number(req.body.user_id);
    const nextStatus = String(req.body.status || '').trim();
    const rejectionReason = String(req.body.rejection_reason || '').trim();
    const allowedStatuses = ['Approved', 'Rejected'];

    if (!requestId || !userId || !nextStatus) {
      return res.status(400).json({ success: false, message: 'Missing required approval fields.' });
    }

    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Overtime request can only be approved or rejected here.' });
    }

    if (nextStatus === 'Rejected' && !rejectionReason) {
      return res.status(400).json({ success: false, message: 'A rejection reason is required when rejecting an overtime request.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureOvertimeTables(conn);

      const adminUser = await findUserById(conn, userId);
      if (!adminUser || !canManageOvertime(adminUser.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can manage overtime requests.' });
      }

      await conn.beginTransaction();

      const [requests] = await conn.execute(
        `SELECT
           r.overtime_request_id,
           r.status,
           r.overtime_date,
           r.total_hours,
           e.emp_code,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name
         FROM employee_overtime_requests r
         JOIN employees e ON e.employee_id = r.employee_id
         WHERE r.overtime_request_id = ?
         LIMIT 1
         FOR UPDATE`,
        [requestId]
      );

      if (!requests.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Overtime request not found.' });
      }

      const request = requests[0];
      if (request.status !== 'Pending') {
        await conn.rollback();
        return res.status(409).json({ success: false, message: `Overtime request is already ${request.status}.` });
      }

      await conn.execute(
        `UPDATE employee_overtime_requests
         SET status = ?, rejection_reason = ?
         WHERE overtime_request_id = ?`,
        [nextStatus, nextStatus === 'Rejected' ? rejectionReason : null, requestId]
      );

      await writeOvertimeAudit(
        conn,
        adminUser,
        `${nextStatus} overtime request #${requestId} for ${request.employee_name || request.emp_code} (${Number(request.total_hours || 0).toFixed(2)} hours)`,
        'Success'
      );

      await conn.commit();

      const emailSent = await sendOvertimeNotification(conn, requestId, nextStatus);

      let [empUserRows] = await conn.execute(
        'SELECT user_id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) LIMIT 1',
        [request.emp_code || '']
      );
      if (!empUserRows.length && request.employee_name) {
        [empUserRows] = await conn.execute(
          'SELECT user_id FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) LIMIT 1',
          [request.employee_name]
        );
      }
      console.log(`[Notification] Overtime status lookup emp_code=${request.emp_code} employee_name=${request.employee_name} -> user_id=${empUserRows[0]?.user_id ?? 'NOT FOUND'}`);
      if (empUserRows.length) {
        const notifMsg = nextStatus === 'Rejected' && rejectionReason
          ? `Your overtime request for ${formatDate(request.overtime_date)} was rejected. Reason: ${rejectionReason}`
          : `Your overtime request for ${formatDate(request.overtime_date)} has been ${nextStatus.toLowerCase()}.`;
        await createNotification(pool, empUserRows[0].user_id, 'overtime_status', `Overtime Request ${nextStatus}`, notifMsg);
      }

      return res.json({ success: true, message: `Overtime request ${nextStatus.toLowerCase()} successfully.`, emailNotificationSent: emailSent });
    } catch (err) {
      if (conn) {
        await conn.rollback().catch(() => {});
      }
      console.error('Admin overtime status update error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });
};
``
