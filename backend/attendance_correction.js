const { createNotification, createNotificationsForAdminHr } = require('./notificationHelper');
const { buildEmail, statusBadge } = require('./emailTemplate');
const nodemailer = require('nodemailer');

module.exports = function (app, pool) {
  let mailer = null;

  function canManage(role) {
    const r = String(role || '').trim().toLowerCase();
    return r.includes('admin') || r.includes('hr') || r.includes('human resource');
  }

  function isTimeOnly(v) {
    return /^\d{2}:\d{2}$/.test(String(v || '').trim());
  }

  function isDateOnly(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());
  }

  function getMailConfig() {
    const user = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.MAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.SMTP_PASS || process.env.MAIL_PASS;
    if (!user || !pass) return null;
    return { user, pass, from: { name: process.env.MAIL_FROM_NAME || 'Astreablue Intelligence Inc.', address: user } };
  }

  function getMailer() {
    const cfg = getMailConfig();
    if (!cfg) return null;
    if (!mailer) mailer = nodemailer.createTransport({ service: 'gmail', auth: { user: cfg.user, pass: cfg.pass } });
    return mailer;
  }

  function formatDate(v) {
    if (!v) return 'N/A';
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'long', day: '2-digit', year: 'numeric' });
  }

  function formatTime(v) {
    if (!v) return '—';
    const t = String(v).slice(0, 5);
    const d = new Date(`2000-01-01T${t}:00`);
    return Number.isNaN(d.getTime()) ? t : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  async function ensureTable(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS attendance_correction_requests (
        correction_id       INT NOT NULL AUTO_INCREMENT,
        employee_id         INT NOT NULL,
        attendance_date     DATE NOT NULL,
        requested_time_in   TIME NULL,
        requested_break_out TIME NULL,
        requested_break_in  TIME NULL,
        requested_time_out  TIME NULL,
        reason              TEXT NOT NULL,
        status              ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
        rejection_reason    TEXT NULL,
        reviewed_by         INT NULL,
        reviewed_at         TIMESTAMP NULL,
        created_at          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (correction_id),
        KEY idx_acr_employee (employee_id),
        KEY idx_acr_date     (attendance_date),
        KEY idx_acr_status   (status),
        CONSTRAINT fk_acr_employee FOREIGN KEY (employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async function findUser(conn, userId) {
    const [rows] = await conn.execute(
      'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  }

  async function findEmployee(conn, user) {
    const username = String(user?.username || '').trim();
    if (username) {
      const [rows] = await conn.execute(
        `SELECT e.employee_id, e.emp_code FROM employees e
         WHERE LOWER(TRIM(e.emp_code)) = LOWER(TRIM(?))
         ORDER BY (e.status='Active') DESC, e.employee_id DESC LIMIT 1`,
        [username]
      );
      if (rows[0]) return rows[0];
    }
    const name = String(user?.full_name || '').trim();
    if (!name) return null;
    const [rows] = await conn.execute(
      `SELECT e.employee_id, e.emp_code FROM employees e
       WHERE LOWER(TRIM(CONCAT(e.first_name,' ',e.last_name))) = LOWER(TRIM(?))
       ORDER BY (e.status='Active') DESC, e.employee_id DESC LIMIT 1`,
      [name]
    );
    return rows[0] || null;
  }

  async function getEmployeeEmail(conn, employeeId) {
    const [rows] = await conn.execute(
      `SELECT ec.email FROM employee_contacts ec
       WHERE ec.employee_id = ? AND ec.email IS NOT NULL AND ec.email <> ''
       ORDER BY ec.contact_id DESC LIMIT 1`,
      [employeeId]
    );
    return rows[0]?.email || null;
  }

  async function getAdminHrEmails(conn) {
    const emails = new Set();
    const envEmails = (process.env.NOTIFY_ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
    envEmails.forEach((e) => emails.add(e));
    const [rows] = await conn.execute(
      `SELECT email FROM users
       WHERE (LOWER(role) LIKE '%admin%' OR LOWER(role) LIKE '%hr%')
         AND email IS NOT NULL AND email <> ''
         AND (account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated','deleted'))
         AND deleted_at IS NULL`
    );
    rows.forEach((r) => r.email && emails.add(r.email));
    return [...emails];
  }

  function buildMail(req, status) {
    const name = req.employee_name || req.emp_code || 'Employee';
    const display = status === 'Pending' ? 'For Review' : status;
    const templates = {
      Pending: {
        subject: 'Attendance Correction Request Submitted',
        intro: 'Your attendance correction request has been submitted and is awaiting review by HR/Admin.',
        closing: 'You will be notified once a decision has been made.',
      },
      Approved: {
        subject: 'Attendance Correction Request Approved',
        intro: 'Your attendance correction request has been reviewed and approved. Your attendance record has been updated accordingly.',
        closing: 'Please contact HR if you have any further questions.',
      },
      Rejected: {
        subject: 'Attendance Correction Request Not Approved',
        intro: 'Your attendance correction request has been reviewed and was not approved.',
        closing: 'For clarification, please contact your supervisor or the Human Resources Department.',
      },
    };
    const tmpl = templates[status] || templates.Pending;
    const rows = [
      { label: 'Date',            value: formatDate(req.attendance_date) },
      { label: 'Requested Time In',    value: req.requested_time_in    ? formatTime(req.requested_time_in)    : 'No change' },
      { label: 'Requested Break Out',  value: req.requested_break_out  ? formatTime(req.requested_break_out)  : 'No change' },
      { label: 'Requested Break In',   value: req.requested_break_in   ? formatTime(req.requested_break_in)   : 'No change' },
      { label: 'Requested Time Out',   value: req.requested_time_out   ? formatTime(req.requested_time_out)   : 'No change' },
      { label: 'Reason',          value: req.reason || 'N/A' },
      { label: 'Status',          value: statusBadge(display), isStatus: true },
    ];
    if (status === 'Rejected' && req.rejection_reason) {
      rows.push({ label: 'Rejection Reason', value: req.rejection_reason });
    }
    const html = buildEmail({ title: `Attendance Correction — ${display}`, recipientName: name, intro: tmpl.intro, rows, rejectionReason: status === 'Rejected' ? req.rejection_reason : null, closing: tmpl.closing });
    return { subject: tmpl.subject, html };
  }

  async function sendMail(to, mail) {
    const t = getMailer();
    if (!t || !to) return;
    const cfg = getMailConfig();
    try {
      await t.sendMail({ from: cfg.from, to, subject: mail.subject, html: mail.html });
    } catch (err) {
      console.error('[AttendanceCorrection] mail error:', err.message);
    }
  }

  // ── Apply approved correction to audit_logs ────────────────────────────────
  async function applyCorrection(conn, req, adminUserId) {
    const date = String(req.attendance_date).slice(0, 10);
    const actions = [
      { field: 'requested_time_in',    action: 'Employee Time In' },
      { field: 'requested_break_out',  action: 'Employee Break Out' },
      { field: 'requested_break_in',   action: 'Employee Break In' },
      { field: 'requested_time_out',   action: 'Employee Time Out' },
    ];

    // Resolve username for audit_logs
    const [empRows] = await conn.execute(
      `SELECT e.emp_code, CONCAT_WS(' ',e.first_name,e.last_name) AS full_name
       FROM employees e WHERE e.employee_id = ? LIMIT 1`,
      [req.employee_id]
    );
    const emp = empRows[0] || {};

    // Resolve user_id in users table matching this employee
    const [userRows] = await conn.execute(
      `SELECT user_id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) LIMIT 1`,
      [emp.emp_code || '']
    );
    const empUserId = userRows[0]?.user_id || null;

    for (const { field, action } of actions) {
      const newTime = req[field] ? String(req[field]).slice(0, 5) : null;
      if (!newTime) continue; // employee left blank → no change

      const newTimestamp = `${date} ${newTime}:00`;

      // Check if a log entry already exists for this action on this date
      const [existing] = await conn.execute(
        `SELECT log_id FROM audit_logs
         WHERE user_id = ? AND DATE(log_time) = ? AND action = ?
         ORDER BY log_id ASC LIMIT 1`,
        [empUserId, date, action]
      );

      if (existing[0]) {
        // Update existing entry
        await conn.execute(
          `UPDATE audit_logs SET log_time = ?, status = 'Correction Applied' WHERE log_id = ?`,
          [newTimestamp, existing[0].log_id]
        );
      } else if (empUserId) {
        // Insert new entry
        await conn.execute(
          `INSERT INTO audit_logs (user_id, admin_name, action, status, log_time)
           VALUES (?, ?, ?, 'Correction Applied', ?)`,
          [empUserId, emp.full_name || emp.emp_code || '', action, newTimestamp]
        );
      }
    }

    // Write audit trail of the correction itself
    const [adminUser] = await conn.execute('SELECT full_name FROM users WHERE user_id = ? LIMIT 1', [adminUserId]);
    const adminName = adminUser[0]?.full_name || `User #${adminUserId}`;
    await conn.execute(
      `INSERT INTO audit_logs (user_id, admin_name, action, status, log_time)
       VALUES (?, ?, ?, 'Approved', NOW())`,
      [adminUserId, adminName, `Attendance Correction Applied for ${emp.full_name || emp.emp_code} on ${date}`]
    );
  }

  // ── EMPLOYEE: submit correction request ────────────────────────────────────
  app.post('/api/employee/attendance-correction-request', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureTable(conn);

      const { user_id, attendance_date, requested_time_in, requested_break_out, requested_break_in, requested_time_out, reason } = req.body || {};

      if (!user_id || !attendance_date || !reason?.trim()) {
        return res.status(400).json({ success: false, message: 'user_id, attendance_date, and reason are required.' });
      }
      if (!isDateOnly(attendance_date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
      }

      const timeFields = { requested_time_in, requested_break_out, requested_break_in, requested_time_out };
      for (const [key, val] of Object.entries(timeFields)) {
        if (val && !isTimeOnly(val)) {
          return res.status(400).json({ success: false, message: `Invalid time format for ${key}. Use HH:MM.` });
        }
      }

      const hasAtLeastOneTime = Object.values(timeFields).some((v) => v && v.trim());
      if (!hasAtLeastOneTime) {
        return res.status(400).json({ success: false, message: 'Please provide at least one time field to correct.' });
      }

      const user = await findUser(conn, user_id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      const emp = await findEmployee(conn, user);
      if (!emp) return res.status(404).json({ success: false, message: 'Employee record not found.' });

      // Prevent duplicate pending request for same date
      const [dupe] = await conn.execute(
        `SELECT correction_id FROM attendance_correction_requests
         WHERE employee_id = ? AND attendance_date = ? AND status = 'Pending' LIMIT 1`,
        [emp.employee_id, attendance_date]
      );
      if (dupe[0]) {
        return res.status(409).json({ success: false, message: 'You already have a pending correction request for this date.' });
      }

      const [result] = await conn.execute(
        `INSERT INTO attendance_correction_requests
           (employee_id, attendance_date, requested_time_in, requested_break_out, requested_break_in, requested_time_out, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [
          emp.employee_id,
          attendance_date,
          requested_time_in || null,
          requested_break_out || null,
          requested_break_in || null,
          requested_time_out || null,
          reason.trim()
        ]
      );
      const correctionId = result.insertId;

      // Notifications — correct signature: (pool, type, title, message)
      await createNotificationsForAdminHr(
        pool,
        'attendance_correction',
        'Attendance Correction Request',
        `${user.full_name} submitted an attendance correction request for ${formatDate(attendance_date)}.`
      );

      // Email to admins
      const adminEmails = await getAdminHrEmails(conn);
      if (adminEmails.length) {
        const mail = buildMail(
          { employee_name: user.full_name, emp_code: user.username, attendance_date, ...timeFields, reason: reason.trim(), rejection_reason: null },
          'Pending'
        );
        for (const email of adminEmails) await sendMail(email, mail);
      }

      return res.json({ success: true, message: 'Attendance correction request submitted successfully.', correction_id: correctionId });
    } catch (err) {
      console.error('[AttendanceCorrection] submit error:', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── EMPLOYEE: list own requests ────────────────────────────────────────────
  app.get('/api/employee/attendance-correction-requests', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureTable(conn);

      const userId = parseInt(req.query.user_id, 10);
      if (!userId) return res.status(400).json({ success: false, message: 'user_id required.' });

      const user = await findUser(conn, userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      const emp = await findEmployee(conn, user);
      if (!emp) return res.json({ success: true, requests: [] });

      const [rows] = await conn.execute(
        `SELECT correction_id, attendance_date, requested_time_in, requested_break_out,
                requested_break_in, requested_time_out, reason, status, rejection_reason,
                created_at, updated_at
         FROM attendance_correction_requests
         WHERE employee_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [emp.employee_id]
      );

      return res.json({ success: true, requests: rows });
    } catch (err) {
      console.error('[AttendanceCorrection] list error:', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── EMPLOYEE: cancel own request ───────────────────────────────────────────
  app.patch('/api/employee/attendance-correction-requests/:id/cancel', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureTable(conn);

      const correctionId = parseInt(req.params.id, 10);
      const userId = parseInt(req.body?.user_id, 10);
      if (!correctionId || !userId) return res.status(400).json({ success: false, message: 'Invalid request.' });

      const user = await findUser(conn, userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
      const emp = await findEmployee(conn, user);
      if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

      const [rows] = await conn.execute(
        `SELECT correction_id, status FROM attendance_correction_requests
         WHERE correction_id = ? AND employee_id = ? LIMIT 1`,
        [correctionId, emp.employee_id]
      );
      if (!rows[0]) return res.status(404).json({ success: false, message: 'Request not found.' });
      if (rows[0].status !== 'Pending') return res.status(409).json({ success: false, message: 'Only pending requests can be cancelled.' });

      await conn.execute(
        `UPDATE attendance_correction_requests SET status='Cancelled' WHERE correction_id=?`,
        [correctionId]
      );
      return res.json({ success: true, message: 'Request cancelled.' });
    } catch (err) {
      console.error('[AttendanceCorrection] cancel error:', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── ADMIN/HR: list all requests ────────────────────────────────────────────
  app.get('/api/admin/attendance-correction-requests', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureTable(conn);

      const userId = parseInt(req.query.user_id, 10);
      if (!userId) return res.status(400).json({ success: false, message: 'user_id required.' });

      const user = await findUser(conn, userId);
      if (!user || !canManage(user.role)) return res.status(403).json({ success: false, message: 'Access denied.' });

      const statusFilter = req.query.status && req.query.status !== 'All' ? req.query.status : null;
      const params = statusFilter ? [statusFilter] : [];
      const where = statusFilter ? 'WHERE r.status = ?' : '';

      const [rows] = await conn.execute(
        `SELECT r.correction_id, r.attendance_date,
                r.requested_time_in, r.requested_break_out, r.requested_break_in, r.requested_time_out,
                r.reason, r.status, r.rejection_reason, r.reviewed_at, r.created_at, r.updated_at,
                e.emp_code,
                IFNULL(ee.department, '') AS department,
                CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
                rv.full_name AS reviewed_by_name
         FROM attendance_correction_requests r
         JOIN employees e ON e.employee_id = r.employee_id
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         LEFT JOIN users rv ON rv.user_id = r.reviewed_by
         ${where}
         ORDER BY FIELD(r.status,'Pending','Approved','Rejected','Cancelled'), r.created_at DESC
         LIMIT 500`,
        params
      );

      const [summary] = await conn.execute(
        `SELECT status, COUNT(*) AS cnt FROM attendance_correction_requests GROUP BY status`
      );
      const counts = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
      summary.forEach((s) => { counts[s.status] = Number(s.cnt); });

      return res.json({ success: true, requests: rows, summary: counts });
    } catch (err) {
      console.error('[AttendanceCorrection] admin list error:', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── ADMIN/HR: approve or reject ────────────────────────────────────────────
  app.patch('/api/admin/attendance-correction-requests/:id/status', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureTable(conn);

      const correctionId = parseInt(req.params.id, 10);
      const { user_id, status, rejection_reason } = req.body || {};

      if (!correctionId || !user_id || !status) return res.status(400).json({ success: false, message: 'correction_id, user_id, and status are required.' });
      if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be Approved or Rejected.' });
      if (status === 'Rejected' && !rejection_reason?.trim()) return res.status(400).json({ success: false, message: 'Rejection reason is required.' });

      const reviewer = await findUser(conn, user_id);
      if (!reviewer || !canManage(reviewer.role)) return res.status(403).json({ success: false, message: 'Access denied.' });

      const [rows] = await conn.execute(
        `SELECT r.*, CONCAT_WS(' ',e.first_name,e.last_name) AS employee_name, e.emp_code, e.employee_id AS emp_id
         FROM attendance_correction_requests r
         JOIN employees e ON e.employee_id = r.employee_id
         WHERE r.correction_id = ? LIMIT 1`,
        [correctionId]
      );
      const request = rows[0];
      if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
      if (request.status !== 'Pending') return res.status(409).json({ success: false, message: 'Only pending requests can be reviewed.' });

      await conn.execute(
        `UPDATE attendance_correction_requests
         SET status=?, rejection_reason=?, reviewed_by=?, reviewed_at=NOW()
         WHERE correction_id=?`,
        [status, status === 'Rejected' ? rejection_reason.trim() : null, user_id, correctionId]
      );

      // Apply the correction to audit_logs if approved
      if (status === 'Approved') {
        await applyCorrection(conn, request, user_id);
      }

      // Notify the employee — correct signature: (pool, userId, type, title, message)
      const [empUserRows] = await conn.execute(
        'SELECT user_id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) LIMIT 1',
        [request.emp_code || '']
      );
      const empUserId = empUserRows[0]?.user_id || null;
      if (empUserId) {
        await createNotification(
          pool,
          empUserId,
          'attendance_correction',
          `Attendance Correction ${status}`,
          `Your attendance correction request for ${formatDate(request.attendance_date)} has been ${status.toLowerCase()}.`
        );
      }

      // Email the employee
      const empEmail = await getEmployeeEmail(conn, request.employee_id);
      const mail = buildMail({ ...request, rejection_reason: status === 'Rejected' ? rejection_reason.trim() : null }, status);
      if (empEmail) await sendMail(empEmail, mail);

      return res.json({ success: true, message: `Request ${status.toLowerCase()} successfully.` });
    } catch (err) {
      console.error('[AttendanceCorrection] review error:', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });
};
