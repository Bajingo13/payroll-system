const crypto = require('crypto');

module.exports = function (app, pool) {
  const ID_CIPHER_PREFIX = 'enc:v1';

  function getEncryptionKey() {
    const source = process.env.EMPLOYEE_ID_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'payroll_secret_key';
    return crypto.createHash('sha256').update(source).digest();
  }

  function encryptSensitiveValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return null;

    const iv = crypto.randomBytes(12);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${ID_CIPHER_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
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

  function toNullable(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return typeof value === 'string' ? value.trim() : value;
  }

  function canManageAttendance(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized.includes('admin') || normalized.includes('hr') || normalized.includes('human resource');
  }

  function isDateOnly(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
  }

  function isTimeOnly(value) {
    return /^\d{2}:\d{2}$/.test(String(value || '').trim());
  }

  function buildAttendanceDateTime(date, time) {
    if (!isDateOnly(date) || !isTimeOnly(time)) return null;
    return `${date} ${time}:00`;
  }

  async function ensureEmployeeDocumentsTable(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        employee_id INT NOT NULL,
        files_201 TEXT NULL,
        contracts TEXT NULL,
        certifications TEXT NULL,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (employee_id),
        CONSTRAINT fk_employee_documents_employee
          FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async function findEmployeeByUser(conn, user) {
    const username = String((user && user.username) || '').trim();
    if (username) {
      const [codeRows] = await conn.execute(
        `SELECT
            e.employee_id,
            e.emp_code,
            e.status,
            CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
            ee.company,
            ee.department,
            ee.position
         FROM employees e
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         WHERE LOWER(TRIM(e.emp_code)) = LOWER(TRIM(?))
         ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
         LIMIT 1`,
        [username]
      );

      if (codeRows[0]) {
        return codeRows[0];
      }
    }

    const fullName = String((user && user.full_name) || '').trim();

    if (!fullName) {
      return null;
    }

    const [employees] = await conn.execute(
      `SELECT
          e.employee_id,
          e.emp_code,
          e.status,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          ee.company,
          ee.department,
          ee.position
       FROM employees e
       LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
       WHERE LOWER(TRIM(CONCAT(e.first_name, ' ', e.last_name))) = LOWER(TRIM(?))
       ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
       LIMIT 1`,
      [fullName]
    );

    if (employees[0]) {
      return employees[0];
    }

    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const [fallback] = await conn.execute(
        `SELECT
            e.employee_id,
            e.emp_code,
            e.status,
            CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
            ee.company,
            ee.department,
            ee.position
         FROM employees e
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         WHERE LOWER(TRIM(e.first_name)) = LOWER(TRIM(?))
           AND LOWER(TRIM(e.last_name)) = LOWER(TRIM(?))
         ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
         LIMIT 1`,
        [firstName, lastName]
      );

      if (fallback[0]) {
        return fallback[0];
      }
    }

    const [nameLikeRows] = await conn.execute(
      `SELECT
          e.employee_id,
          e.emp_code,
          e.status,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          ee.company,
          ee.department,
          ee.position
       FROM employees e
       LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
       WHERE LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER(?)
       ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
       LIMIT 1`,
      [`%${fullName}%`]
    );

    return nameLikeRows[0] || null;
  }
  async function getTodayTimeEntries(conn, userId) {
    const [rows] = await conn.execute(
      `SELECT action, status, log_time
       FROM audit_logs
       WHERE user_id = ?
         AND action IN ('Employee Time In', 'Employee Break Out', 'Employee Break In', 'Employee Time Out')
         AND DATE(log_time) = CURDATE()
       ORDER BY log_time ASC`,
      [userId]
    );

    const timeIn = rows.find((row) => row.action === 'Employee Time In') || null;
    const breakOut = rows.find((row) => row.action === 'Employee Break Out') || null;
    const breakIn = rows.find((row) => row.action === 'Employee Break In') || null;
    const timeOut = [...rows].reverse().find((row) => row.action === 'Employee Time Out') || null;

    return {
      timeIn: timeIn ? timeIn.log_time : null,
      breakOut: breakOut ? breakOut.log_time : null,
      breakIn: breakIn ? breakIn.log_time : null,
      timeOut: timeOut ? timeOut.log_time : null,
      hasTimeIn: !!timeIn,
      hasBreakOut: !!breakOut,
      hasBreakIn: !!breakIn,
      hasTimeOut: !!timeOut
    };
  }

  async function ensureEmployeeScheduleSettings(conn, employeeId) {
    const [existing] = await conn.execute(
      `SELECT setting_id
       FROM employee_payroll_settings
       WHERE employee_id = ?
       ORDER BY setting_id DESC
       LIMIT 1`,
      [employeeId]
    );

    if (existing.length) {
      return;
    }

    await conn.execute(
      `INSERT INTO employee_payroll_settings (
          employee_id,
          payroll_period,
          payroll_rate,
          ot_rate,
          days_in_year,
          days_in_week,
          hours_in_day,
          week_in_year,
          strict_no_overtime,
          days_in_year_ot,
          rate_basis_ot,
          main_computation,
          basis_absences,
          basis_overtime
       ) VALUES (?, 'Semi-Monthly', 'Monthly Rate', 'STANDARD OT RATE', 313, 5, 8, 52, 0, 313, 0.00, NULL, NULL, NULL)`,
      [employeeId]
    );
  }

  // ========== DASHBOARD SUMMARY ==========
  app.get("/api/dashboard", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [employees] = await conn.execute(
        "SELECT COUNT(*) AS total FROM employees"
      );

      const [payrolls] = await conn.execute(
        "SELECT COUNT(*) AS total FROM payroll_runs WHERE status IN ('Generated', 'Completed', 'Locked')"
      );

      const [logsToday] = await conn.execute(`
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE DATE(DATE_ADD(log_time, INTERVAL 8 HOUR)) = CURDATE()
      `);

      const [employeeStatuses] = await conn.execute(`
        SELECT COALESCE(NULLIF(TRIM(status), ''), 'Unspecified') AS status, COUNT(*) AS total
        FROM employees
        GROUP BY COALESCE(NULLIF(TRIM(status), ''), 'Unspecified')
        ORDER BY total DESC
      `);

      const [payrollStatuses] = await conn.execute(`
        SELECT COALESCE(NULLIF(TRIM(status), ''), 'Draft') AS status, COUNT(*) AS total
        FROM payroll_runs
        GROUP BY COALESCE(NULLIF(TRIM(status), ''), 'Draft')
        ORDER BY total DESC
      `);

      let leaveStatuses = [
        { status: 'Pending', total: 0 },
        { status: 'Approved', total: 0 },
        { status: 'Rejected', total: 0 },
        { status: 'Cancelled', total: 0 }
      ];

      try {
        const [leaveRows] = await conn.execute(`
          SELECT status, COUNT(*) AS total
          FROM employee_leave_requests
          GROUP BY status
        `);

        leaveStatuses = leaveStatuses.map((base) => {
          const match = leaveRows.find((row) => row.status === base.status);
          return match ? { status: base.status, total: Number(match.total || 0) } : base;
        });
      } catch (leaveErr) {
        if (leaveErr.code !== 'ER_NO_SUCH_TABLE') {
          throw leaveErr;
        }
      }

      conn.release();

      res.json({
        totalEmployees: employees[0].total,
        processedPayrolls: payrolls[0].total,
        systemLogs: logsToday[0].total,
        employeeStatuses,
        payrollStatuses,
        leaveStatuses
      });
    } catch (err) {
      console.error("Dashboard error:", err);
      res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  });

  // ========== RECENT LOGS UNDER DASHBOARD ==========
  app.get("/api/logs", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [logs] = await conn.execute(`
        SELECT
          admin_name,
          action,
          status,
          DATE_FORMAT(log_time, INTERVAL 8 HOUR) 
          AS log_time
          FROM audit_logs
          ORDER BY log_time DESC
          LIMIT 10
      `);

      conn.release();
      res.json(logs);
    } catch (err) {
      console.error("Error fetching logs:", err);
      res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  });

  // ========== EMPLOYEE DASHBOARD ==========
  app.get('/api/employee_dashboard', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = users[0];

      const employee = await findEmployeeByUser(conn, user);

      let payrollSummary = null;
      let payrollHistory = [];

      if (employee) {
        const [summaryRows] = await conn.execute(
          `SELECT
              ep.gross_pay,
              ep.total_deductions,
              ep.net_pay,
              ep.payroll_status,
              ep.date_generated,
              pr.payroll_range,
              pr.status AS run_status
           FROM employee_payroll ep
           LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
           WHERE ep.employee_id = ?
           ORDER BY ep.date_generated DESC
           LIMIT 1`,
          [employee.employee_id]
        );

        payrollSummary = summaryRows[0] || null;

        const [historyRows] = await conn.execute(
          `SELECT
              ep.date_generated,
              ep.gross_pay,
              ep.total_deductions,
              ep.net_pay,
              ep.payroll_status,
              pr.payroll_range
           FROM employee_payroll ep
           LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
           WHERE ep.employee_id = ?
           ORDER BY ep.date_generated DESC
           LIMIT 10`,
          [employee.employee_id]
        );

        payrollHistory = historyRows;
      }

      const todayTime = await getTodayTimeEntries(conn, userId);

      const [attendanceRows] = await conn.execute(
        `SELECT action, status, log_time
         FROM audit_logs
         WHERE user_id = ?
           AND action IN ('Employee Time In', 'Employee Break Out', 'Employee Break In', 'Employee Time Out')
         ORDER BY log_time DESC
         LIMIT 12`,
        [userId]
      );

      return res.json({
        success: true,
        user,
        employee,
        payrollSummary,
        payrollHistory,
        todayTime,
        attendanceLogs: attendanceRows
      });
    } catch (err) {
      console.error('Employee dashboard error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/employee/time-entry', async (req, res) => {
    const userId = Number(req.body.user_id);
    const type = String(req.body.type || '').toLowerCase();

    if (!userId || !['time_in', 'break_out', 'break_in', 'time_out'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.execute(
        'SELECT user_id, full_name FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = users[0];
      const todayState = await getTodayTimeEntries(conn, userId);

      if (type === 'time_in' && todayState.hasTimeIn) {
        return res.status(409).json({ success: false, message: 'You already timed in today.' });
      }

      if (type === 'break_out' && !todayState.hasTimeIn) {
        return res.status(409).json({ success: false, message: 'Please time in first.' });
      }

      if (type === 'break_out' && todayState.hasBreakOut) {
        return res.status(409).json({ success: false, message: 'You already have a break out record today.' });
      }

      if (type === 'break_out' && todayState.hasTimeOut) {
        return res.status(409).json({ success: false, message: 'You already timed out today.' });
      }

      if (type === 'break_in' && !todayState.hasBreakOut) {
        return res.status(409).json({ success: false, message: 'Please break out first.' });
      }

      if (type === 'break_in' && todayState.hasBreakIn) {
        return res.status(409).json({ success: false, message: 'You already have a break in record today.' });
      }

      if (type === 'break_in' && todayState.hasTimeOut) {
        return res.status(409).json({ success: false, message: 'You already timed out today.' });
      }

      if (type === 'time_out' && !todayState.hasTimeIn) {
        return res.status(409).json({ success: false, message: 'Please time in first.' });
      }

      if (type === 'time_out' && todayState.hasBreakOut && !todayState.hasBreakIn) {
        return res.status(409).json({ success: false, message: 'Please break in before timing out.' });
      }

      if (type === 'time_out' && todayState.hasTimeOut) {
        return res.status(409).json({ success: false, message: 'You already timed out today.' });
      }

      const actionMap = {
        time_in: 'Employee Time In',
        break_out: 'Employee Break Out',
        break_in: 'Employee Break In',
        time_out: 'Employee Time Out'
      };

      const action = actionMap[type];
      await conn.execute(
        'INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)',
        [user.user_id, user.full_name, action, 'Success']
      );

      const updatedState = await getTodayTimeEntries(conn, userId);

      return res.json({
        success: true,
        message: action.replace('Employee ', '') + ' recorded.',
        todayTime: updatedState
      });
    } catch (err) {
      console.error('Employee time entry error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/employee_profile_edit_legacy', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureEmployeeDocumentsTable(conn);

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const employee = await findEmployeeByUser(conn, users[0]);
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found' });
      }

      const [rows] = await conn.execute(
        `SELECT
            e.first_name, e.last_name, e.middle_name, e.nickname, e.gender, e.civil_status, e.birth_date,
            e.street, e.city, e.country, e.zip_code, e.status,
            ec.tel_no, ec.mobile_no, ec.fax_no, ec.email, ec.website,
            ee.date_hired, ee.department, ee.position,
            ea.sss_no, ea.pagibig_no, ea.philhealth_no, ea.tin_no,
            ed.files_201, ed.contracts, ed.certifications
         FROM employees e
         LEFT JOIN employee_contacts ec ON ec.employee_id = e.employee_id
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         LEFT JOIN employee_accounts ea ON ea.employee_id = e.employee_id
         LEFT JOIN employee_documents ed ON ed.employee_id = e.employee_id
         WHERE e.employee_id = ?
         LIMIT 1`,
        [employee.employee_id]
      );

      const base = rows[0] || {};

      return res.json({
        success: true,
        profile: {
          employee_id: employee.employee_id,
          personal: {
            first_name: base.first_name || '',
            last_name: base.last_name || '',
            middle_name: base.middle_name || '',
            nickname: base.nickname || '',
            gender: base.gender || '',
            civil_status: base.civil_status || '',
            birth_date: base.birth_date || null,
            mobile_no: base.mobile_no || '',
            email: base.email || '',
            street: base.street || '',
            city: base.city || '',
            country: base.country || '',
            zip_code: base.zip_code || ''
          },
          government_ids: {
            sss_no: decryptSensitiveValue(base.sss_no),
            philhealth_no: decryptSensitiveValue(base.philhealth_no),
            pagibig_no: decryptSensitiveValue(base.pagibig_no),
            tin_no: decryptSensitiveValue(base.tin_no)
          },
          employment: {
            date_hired: base.date_hired || null,
            status: base.status || '',
            department: base.department || '',
            designation: base.position || ''
          },
          documents: {
            files_201: base.files_201 || '',
            contracts: base.contracts || '',
            certifications: base.certifications || ''
          }
        }
      });
    } catch (err) {
      console.error('Employee profile edit load error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/employee_profile_edit_legacy', async (req, res) => {
    const body = req.body || {};
    const userId = Number(body.user_id);
    const employeeIdFromBody = Number(body.employee_id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    const personal = body.personal || {};
    const government = body.government_ids || {};
    const employment = body.employment || {};
    const documents = body.documents || {};

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureEmployeeDocumentsTable(conn);

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      let employee = null;

      if (employeeIdFromBody) {
        const [employeeRows] = await conn.execute(
          `SELECT
              e.employee_id,
              e.emp_code,
              e.status,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              ee.company,
              ee.department,
              ee.position
           FROM employees e
           LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
           WHERE e.employee_id = ?
           LIMIT 1`,
          [employeeIdFromBody]
        );
        employee = employeeRows[0] || null;
      }

      if (!employee) {
        employee = await findEmployeeByUser(conn, users[0]);
      }

      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found' });
      }

      const [currentEmployeeRows] = await conn.execute(
        `SELECT first_name, last_name, status
         FROM employees
         WHERE employee_id = ?
         LIMIT 1`,
        [employee.employee_id]
      );

      const currentEmployee = currentEmployeeRows[0] || {};
      const nextFirstName = toNullable(personal.first_name) || currentEmployee.first_name || '';
      const nextLastName = toNullable(personal.last_name) || currentEmployee.last_name || '';
      const nextStatus = toNullable(employment.status) || currentEmployee.status || 'Active';

      const normalizedFirstName = String(nextFirstName || '').trim();
      const normalizedLastName = String(nextLastName || '').trim();
      const updatedFullName = (normalizedFirstName || normalizedLastName)
        ? `${normalizedFirstName} ${normalizedLastName}`.trim()
        : String(users[0].full_name || '').trim();

      await conn.beginTransaction();

      await conn.execute(
        `UPDATE employees
         SET first_name=?, last_name=?, middle_name=?, nickname=?, gender=?, civil_status=?, birth_date=?,
             street=?, city=?, country=?, zip_code=?, status=?
         WHERE employee_id=?`,
        [
          nextFirstName,
          nextLastName,
          toNullable(personal.middle_name),
          toNullable(personal.nickname),
          toNullable(personal.gender),
          toNullable(personal.civil_status),
          toNullable(personal.birth_date),
          toNullable(personal.street),
          toNullable(personal.city),
          toNullable(personal.country),
          toNullable(personal.zip_code),
          nextStatus,
          employee.employee_id
        ]
      );

      if (updatedFullName) {
        await conn.execute(
          `UPDATE users
           SET full_name = ?
           WHERE user_id = ?`,
          [updatedFullName, userId]
        );
      }

      const [contactRows] = await conn.execute(
        `SELECT contact_id FROM employee_contacts WHERE employee_id = ? LIMIT 1`,
        [employee.employee_id]
      );

      if (contactRows.length) {
        await conn.execute(
          `UPDATE employee_contacts
           SET mobile_no = ?, email = ?
           WHERE employee_id = ?`,
          [toNullable(personal.mobile_no), toNullable(personal.email), employee.employee_id]
        );
      } else {
        await conn.execute(
          `INSERT INTO employee_contacts (employee_id, mobile_no, email)
           VALUES (?, ?, ?)`,
          [employee.employee_id, toNullable(personal.mobile_no), toNullable(personal.email)]
        );
      }

      const [employmentRows] = await conn.execute(
        `SELECT employment_id FROM employee_employment WHERE employee_id = ? LIMIT 1`,
        [employee.employee_id]
      );

      if (employmentRows.length) {
        await conn.execute(
          `UPDATE employee_employment
           SET date_hired = ?, department = ?, position = ?
           WHERE employee_id = ?`,
          [
            toNullable(employment.date_hired),
            toNullable(employment.department),
            toNullable(employment.designation),
            employee.employee_id
          ]
        );
      } else {
        await conn.execute(
          `INSERT INTO employee_employment (employee_id, date_hired, department, position)
           VALUES (?, ?, ?, ?)`,
          [
            employee.employee_id,
            toNullable(employment.date_hired),
            toNullable(employment.department),
            toNullable(employment.designation)
          ]
        );
      }

      const encryptedSss = encryptSensitiveValue(government.sss_no);
      const encryptedPagibig = encryptSensitiveValue(government.pagibig_no);
      const encryptedPhilhealth = encryptSensitiveValue(government.philhealth_no);
      const encryptedTin = encryptSensitiveValue(government.tin_no);

      const [accountRows] = await conn.execute(
        `SELECT account_id FROM employee_accounts WHERE employee_id = ? LIMIT 1`,
        [employee.employee_id]
      );

      if (accountRows.length) {
        await conn.execute(
          `UPDATE employee_accounts
           SET sss_no = ?, pagibig_no = ?, philhealth_no = ?, tin_no = ?
           WHERE employee_id = ?`,
          [encryptedSss, encryptedPagibig, encryptedPhilhealth, encryptedTin, employee.employee_id]
        );
      } else {
        await conn.execute(
          `INSERT INTO employee_accounts (employee_id, sss_no, pagibig_no, philhealth_no, tin_no)
           VALUES (?, ?, ?, ?, ?)`,
          [employee.employee_id, encryptedSss, encryptedPagibig, encryptedPhilhealth, encryptedTin]
        );
      }

      await conn.execute(
        `INSERT INTO employee_documents (employee_id, files_201, contracts, certifications)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           files_201=VALUES(files_201),
           contracts=VALUES(contracts),
           certifications=VALUES(certifications)`,
        [
          employee.employee_id,
          toNullable(documents.files_201),
          toNullable(documents.contracts),
          toNullable(documents.certifications)
        ]
      );

      await conn.commit();

      return res.json({
        success: true,
        message: 'Profile updated successfully. Employee File list will reflect your latest information.'
      });
    } catch (err) {
      if (conn) {
        await conn.rollback().catch(() => {});
      }
      console.error('Employee profile edit save error:', err);
      return res.status(500).json({
        success: false,
        message: err && err.message ? err.message : 'Server error while saving profile'
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== HR/ADMIN EMPLOYEE ATTENDANCE OVERVIEW ==========
  app.get('/api/attendance_overview', async (req, res) => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const todayParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date()).reduce((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
    const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    const fromDate = datePattern.test(String(req.query.from || '')) ? String(req.query.from) : today;
    const toDate = datePattern.test(String(req.query.to || '')) ? String(req.query.to) : fromDate;
    const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
    const toMs = Date.parse(`${toDate}T00:00:00Z`);

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      return res.status(400).json({ success: false, message: 'Invalid attendance date range.' });
    }

    const maxRangeDays = 62;
    const rangeDays = Math.floor((toMs - fromMs) / 86400000) + 1;
    if (rangeDays > maxRangeDays) {
      return res.status(400).json({ success: false, message: `Attendance range cannot exceed ${maxRangeDays} days.` });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [rows] = await conn.execute(
        `WITH RECURSIVE selected_dates AS (
           SELECT CAST(? AS DATE) AS attendance_date
           UNION ALL
           SELECT DATE_ADD(attendance_date, INTERVAL 1 DAY)
           FROM selected_dates
           WHERE attendance_date < CAST(? AS DATE)
         ),
         employee_users AS (
           SELECT
              u.user_id,
              u.username,
              u.full_name,
              COALESCE(e_code.emp_code, e_name.emp_code, 'N/A') AS emp_code,
              COALESCE(CONCAT(e_code.first_name, ' ', e_code.last_name), CONCAT(e_name.first_name, ' ', e_name.last_name), u.full_name) AS employee_name,
              COALESCE(ee.department, 'N/A') AS department
           FROM users u
           LEFT JOIN employees e_code
             ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
           LEFT JOIN employees e_name
             ON e_code.employee_id IS NULL
            AND LOWER(TRIM(CONCAT(e_name.first_name, ' ', e_name.last_name))) = LOWER(TRIM(u.full_name))
           LEFT JOIN employee_employment ee
             ON ee.employment_id = (
               SELECT em.employment_id
               FROM employee_employment em
               WHERE em.employee_id = COALESCE(e_code.employee_id, e_name.employee_id)
               ORDER BY em.employment_id DESC
               LIMIT 1
             )
           WHERE LOWER(TRIM(u.role)) = 'employee'
         ),
         log_summary AS (
           SELECT
              user_id,
              DATE(log_time) AS attendance_date,
              MIN(CASE WHEN action = 'Employee Time In' THEN log_time END) AS time_in,
              MIN(CASE WHEN action = 'Employee Break Out' THEN log_time END) AS break_out,
              MIN(CASE WHEN action = 'Employee Break In' THEN log_time END) AS break_in,
              MAX(CASE WHEN action = 'Employee Time Out' THEN log_time END) AS time_out
           FROM audit_logs
           WHERE action IN ('Employee Time In', 'Employee Break Out', 'Employee Break In', 'Employee Time Out')
             AND DATE(log_time) BETWEEN ? AND ?
           GROUP BY user_id, DATE(log_time)
         )
         SELECT
            DATE_FORMAT(sd.attendance_date, '%Y-%m-%d') AS attendance_date,
            eu.user_id,
            eu.username,
            eu.full_name,
            eu.emp_code,
            eu.employee_name,
            eu.department,
            ls.time_in,
            ls.break_out,
            ls.break_in,
            ls.time_out,
            ROUND(
              GREATEST(
                ((
                  CASE
                    WHEN ls.time_in IS NULL OR ls.time_out IS NULL
                    THEN 0
                    ELSE TIMESTAMPDIFF(SECOND, ls.time_in, ls.time_out)
                  END
                ) - (
                  CASE
                    WHEN ls.break_out IS NOT NULL
                      AND ls.break_in IS NOT NULL
                      AND ls.break_in > ls.break_out
                    THEN TIMESTAMPDIFF(SECOND, ls.break_out, ls.break_in)
                    ELSE 0
                  END
                )) / 3600 - 8,
                0
              ),
              2
            ) AS ot_hours
         FROM selected_dates sd
         CROSS JOIN employee_users eu
         LEFT JOIN log_summary ls
           ON ls.user_id = eu.user_id
          AND ls.attendance_date = sd.attendance_date
         ORDER BY sd.attendance_date DESC, eu.employee_name ASC`,
        [fromDate, toDate, fromDate, toDate]
      );

      res.json({
        success: true,
        date: fromDate,
        from: fromDate,
        to: toDate,
        records: rows
      });
    } catch (err) {
      console.error('Attendance overview error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/attendance_overview', async (req, res) => {
    const body = req.body || {};
    const adminUserId = Number(body.admin_user_id || body.editor_user_id || body.updated_by);
    const employeeUserId = Number(body.user_id);
    const originalDate = String(body.original_date || body.attendance_date || '').trim();
    const attendanceDate = String(body.attendance_date || '').trim();
    const timeFields = {
      time_in: body.time_in,
      break_out: body.break_out,
      break_in: body.break_in,
      time_out: body.time_out
    };

    if (!adminUserId || !employeeUserId || !isDateOnly(originalDate) || !isDateOnly(attendanceDate)) {
      return res.status(400).json({ success: false, message: 'Missing attendance edit details.' });
    }

    const normalizedTimes = {};
    for (const [field, value] of Object.entries(timeFields)) {
      const trimmed = String(value || '').trim();
      if (trimmed && !isTimeOnly(trimmed)) {
        return res.status(400).json({ success: false, message: 'Attendance times must use HH:mm format.' });
      }
      normalizedTimes[field] = trimmed || null;
    }

    const orderedTimes = [
      normalizedTimes.time_in,
      normalizedTimes.break_out,
      normalizedTimes.break_in,
      normalizedTimes.time_out
    ].filter(Boolean);

    for (let index = 1; index < orderedTimes.length; index += 1) {
      if (orderedTimes[index] <= orderedTimes[index - 1]) {
        return res.status(400).json({ success: false, message: 'Attendance times must be in chronological order.' });
      }
    }

    if ((normalizedTimes.break_out || normalizedTimes.break_in || normalizedTimes.time_out) && !normalizedTimes.time_in) {
      return res.status(400).json({ success: false, message: 'Time In is required before other attendance times.' });
    }

    if (normalizedTimes.break_in && !normalizedTimes.break_out) {
      return res.status(400).json({ success: false, message: 'Break Out is required before Break In.' });
    }

    if (normalizedTimes.time_out && normalizedTimes.break_out && !normalizedTimes.break_in) {
      return res.status(400).json({ success: false, message: 'Break In is required before Time Out after a break.' });
    }

    const actionByField = {
      time_in: 'Employee Time In',
      break_out: 'Employee Break Out',
      break_in: 'Employee Break In',
      time_out: 'Employee Time Out'
    };

    let conn;
    try {
      conn = await pool.getConnection();

      const [adminRows] = await conn.execute(
        'SELECT user_id, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [adminUserId]
      );
      const adminUser = adminRows[0] || null;
      if (!adminUser || !canManageAttendance(adminUser.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can edit attendance.' });
      }

      const [employeeRows] = await conn.execute(
        'SELECT user_id, full_name FROM users WHERE user_id = ? LIMIT 1',
        [employeeUserId]
      );
      const employeeUser = employeeRows[0] || null;
      if (!employeeUser) {
        return res.status(404).json({ success: false, message: 'Employee user not found.' });
      }

      await conn.beginTransaction();

      for (const [field, action] of Object.entries(actionByField)) {
        const nextDateTime = buildAttendanceDateTime(attendanceDate, normalizedTimes[field]);
        const [existingRows] = await conn.execute(
          `SELECT log_id
           FROM audit_logs
           WHERE user_id = ?
             AND action = ?
             AND DATE(log_time) = ?
           ORDER BY log_time ASC, log_id ASC`,
          [employeeUserId, action, originalDate]
        );

        const primaryLog = existingRows[0] || null;
        const duplicateIds = existingRows.slice(1).map((row) => row.log_id);

        if (duplicateIds.length) {
          await conn.execute(
            `DELETE FROM audit_logs
             WHERE log_id IN (${duplicateIds.map(() => '?').join(',')})`,
            duplicateIds
          );
        }

        if (nextDateTime && primaryLog) {
          await conn.execute(
            `UPDATE audit_logs
             SET admin_name = ?, status = 'Success', log_time = ?
             WHERE log_id = ?`,
            [employeeUser.full_name, nextDateTime, primaryLog.log_id]
          );
        } else if (nextDateTime) {
          await conn.execute(
            `INSERT INTO audit_logs (user_id, admin_name, action, status, log_time)
             VALUES (?, ?, ?, 'Success', ?)`,
            [employeeUserId, employeeUser.full_name, action, nextDateTime]
          );
        } else if (primaryLog) {
          await conn.execute('DELETE FROM audit_logs WHERE log_id = ?', [primaryLog.log_id]);
        }
      }

      await conn.execute(
        `INSERT INTO audit_logs (user_id, admin_name, action, status)
         VALUES (?, ?, ?, 'Success')`,
        [
          adminUserId,
          adminUser.full_name,
          `Edited attendance for ${employeeUser.full_name} (${originalDate}${originalDate === attendanceDate ? '' : ` to ${attendanceDate}`})`
        ]
      );

      await conn.commit();

      return res.json({ success: true, message: 'Attendance updated successfully.' });
    } catch (err) {
      if (conn) {
        await conn.rollback().catch(() => {});
      }
      console.error('Attendance edit error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== EMPLOYEE SCHEDULE ==========
  app.get('/api/employee_schedule', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = users[0];
      const employee = await findEmployeeByUser(conn, user);

      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found' });
      }

      await ensureEmployeeScheduleSettings(conn, employee.employee_id);

      const [settingsRows] = await conn.execute(
        `SELECT
            setting_id,
            payroll_period,
            payroll_rate,
            ot_rate,
            days_in_year,
            days_in_week,
            hours_in_day,
            week_in_year,
            strict_no_overtime,
            days_in_year_ot,
            rate_basis_ot,
            main_computation,
            basis_absences,
            basis_overtime
         FROM employee_payroll_settings
         WHERE employee_id = ?
         ORDER BY setting_id DESC
         LIMIT 1`,
        [employee.employee_id]
      );

      const schedule = settingsRows[0] || null;

      return res.json({
        success: true,
        user,
        employee,
        schedule
      });
    } catch (err) {
      console.error('Employee schedule load error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== ADMIN SCHEDULE MANAGEMENT ==========
  app.get('/api/admin_schedule_management_list', async (req, res) => {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim().toLowerCase();

    let conn;
    try {
      conn = await pool.getConnection();

      let query = `SELECT
          e.employee_id,
          e.emp_code,
          CONCAT(e.first_name, ' ', e.last_name) AS full_name,
          e.status,
          ee.department
        FROM employees e
        LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
        WHERE 1 = 1`;

      const params = [];

      if (status && status !== 'all') {
        query += ' AND LOWER(TRIM(e.status)) = ?';
        params.push(status);
      }

      if (search) {
        query += `
          AND (
            e.emp_code LIKE ?
            OR e.first_name LIKE ?
            OR e.last_name LIKE ?
            OR CONCAT(e.first_name, ' ', e.last_name) LIKE ?
            OR COALESCE(ee.department, '') LIKE ?
          )`;
        const wildcard = `%${search}%`;
        params.push(wildcard, wildcard, wildcard, wildcard, wildcard);
      }

      query += ' ORDER BY e.last_name ASC, e.first_name ASC';

      const [rows] = await conn.execute(query, params);

      return res.json({
        success: true,
        employees: rows || []
      });
    } catch (err) {
      console.error('Admin schedule employee list error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/admin_schedule_management/:employeeId', async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [employeeRows] = await conn.execute(
        `SELECT
            e.employee_id,
            e.emp_code,
            CONCAT(e.first_name, ' ', e.last_name) AS full_name,
            e.status,
            ee.department
         FROM employees e
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         WHERE e.employee_id = ?
         LIMIT 1`,
        [employeeId]
      );

      if (!employeeRows.length) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      await ensureEmployeeScheduleSettings(conn, employeeId);

      const [scheduleRows] = await conn.execute(
        `SELECT
            setting_id,
            payroll_period,
            payroll_rate,
            ot_rate,
            days_in_year,
            days_in_week,
            hours_in_day,
            week_in_year,
            strict_no_overtime,
            days_in_year_ot,
            rate_basis_ot,
            main_computation,
            basis_absences,
            basis_overtime
         FROM employee_payroll_settings
         WHERE employee_id = ?
         ORDER BY setting_id DESC
         LIMIT 1`,
        [employeeId]
      );

      return res.json({
        success: true,
        employee: employeeRows[0],
        schedule: scheduleRows[0] || null
      });
    } catch (err) {
      console.error('Admin schedule details load error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/admin_schedule_management/:employeeId', async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }

    const payload = req.body || {};
    const cleanText = (value) => {
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text ? text : null;
    };
    const cleanNumber = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    let conn;
    try {
      conn = await pool.getConnection();

      const [employeeRows] = await conn.execute(
        'SELECT employee_id FROM employees WHERE employee_id = ? LIMIT 1',
        [employeeId]
      );
      if (!employeeRows.length) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      await ensureEmployeeScheduleSettings(conn, employeeId);

      await conn.execute(
        `UPDATE employee_payroll_settings
         SET payroll_period = ?,
             payroll_rate = ?,
             main_computation = ?,
             days_in_year = ?,
             days_in_week = ?,
             hours_in_day = ?,
             week_in_year = ?,
             strict_no_overtime = ?,
             ot_rate = ?,
             days_in_year_ot = ?,
             rate_basis_ot = ?,
             basis_absences = ?,
             basis_overtime = ?
         WHERE employee_id = ?`,
        [
          cleanText(payload.payroll_period),
          cleanText(payload.payroll_rate),
          cleanNumber(payload.main_computation),
          cleanNumber(payload.days_in_year),
          cleanNumber(payload.days_in_week),
          cleanNumber(payload.hours_in_day),
          cleanNumber(payload.week_in_year),
          payload.strict_no_overtime ? 1 : 0,
          cleanText(payload.ot_rate),
          cleanNumber(payload.days_in_year_ot),
          cleanNumber(payload.rate_basis_ot),
          cleanText(payload.basis_absences),
          cleanText(payload.basis_overtime),
          employeeId
        ]
      );

      return res.json({ success: true, message: 'Schedule settings updated successfully.' });
    } catch (err) {
      console.error('Admin schedule update error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });
};
