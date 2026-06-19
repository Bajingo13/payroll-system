const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

module.exports = function (app, pool) {

  // ── Multer: save attendance selfies to uploads/attendance/ ──────────
  const attendanceUploadDir = path.join(__dirname, '../uploads/attendance');
  if (!fs.existsSync(attendanceUploadDir)) fs.mkdirSync(attendanceUploadDir, { recursive: true });

  const attendanceUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, attendanceUploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${req.body.user_id}_${Date.now()}_${req.body.type}_${file.fieldname}${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
  });

  function getOfficeLocationConfig() {
    const latitude = Number(process.env.OFFICE_LAT || 14.5512);
    const longitude = Number(process.env.OFFICE_LNG || 121.0188);
    const radiusM = Number(process.env.OFFICE_RADIUS_M || 250);
    return {
      latitude,
      longitude,
      radius_m: Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 250,
      name: process.env.OFFICE_NAME || 'Main Office'
    };
  }

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const a =
      Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(toRad(lng2 - lng1) / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Ensure audit_logs has location + photo columns (runs once at startup) ──
  async function ensureAuditLogsLocationColumns(conn) {
    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'audit_logs'
         AND COLUMN_NAME IN ('latitude', 'longitude', 'distance_m', 'photo_filename')`
    );
    const existing = new Set(cols.map((c) => c.COLUMN_NAME));
    if (!existing.has('latitude'))
      await conn.execute('ALTER TABLE audit_logs ADD COLUMN latitude DECIMAL(10,7) DEFAULT NULL');
    if (!existing.has('longitude'))
      await conn.execute('ALTER TABLE audit_logs ADD COLUMN longitude DECIMAL(10,7) DEFAULT NULL');
    if (!existing.has('distance_m'))
      await conn.execute('ALTER TABLE audit_logs ADD COLUMN distance_m DECIMAL(10,2) DEFAULT NULL');
    if (!existing.has('photo_filename'))
      await conn.execute('ALTER TABLE audit_logs ADD COLUMN photo_filename VARCHAR(255) DEFAULT NULL');
  }

  // ── Ensure users.profile_photo and push_token columns exist ─────────
  async function ensureUsersProfilePhoto(conn) {
    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('profile_photo', 'push_token')`
    );
    const existing = new Set(cols.map((c) => c.COLUMN_NAME));
    if (!existing.has('profile_photo'))
      await conn.execute('ALTER TABLE users ADD COLUMN profile_photo VARCHAR(255) DEFAULT NULL');
    if (!existing.has('push_token'))
      await conn.execute('ALTER TABLE users ADD COLUMN push_token VARCHAR(512) DEFAULT NULL');
  }

  (async () => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureAuditLogsLocationColumns(conn);
      await ensureUsersProfilePhoto(conn);
    } catch (err) {
      console.error('Failed to ensure schema columns:', err.message);
    } finally {
      if (conn) conn.release();
    }
  })();

  // ── GET /api/geoip ───────────────────────────────────────────────────
  // Proxies IP geolocation from the server (3 fallback services).
  // Mobile calls this via api.get('/geoip') — works on Android emulator
  // because the server always has full internet access.
  app.get('/api/geoip', async (_req, res) => {
    const office = getOfficeLocationConfig();
    const axios = require('axios');

    const services = [
      {
        url: 'https://ipwho.is/',
        extract: (d) => d.success && d.latitude ? { latitude: d.latitude, longitude: d.longitude, city: d.city } : null,
      },
      {
        url: 'http://ip-api.com/json/?fields=status,lat,lon,city',
        extract: (d) => d.status === 'success' ? { latitude: d.lat, longitude: d.lon, city: d.city } : null,
      },
      {
        url: 'https://ipapi.co/json/',
        extract: (d) => d.latitude ? { latitude: Number(d.latitude), longitude: Number(d.longitude), city: d.city } : null,
      },
    ];

    for (const svc of services) {
      try {
        const { data } = await axios.get(svc.url, { timeout: 6000 });
        const coords = svc.extract(data);
        if (coords) {
          return res.json({
            success: true,
            latitude: Number(coords.latitude),
            longitude: Number(coords.longitude),
            city: coords.city || '',
            office: { lat: office.latitude, lng: office.longitude, name: office.name, radius_m: office.radius_m },
          });
        }
      } catch (_) {}
    }

    res.status(503).json({ success: false, message: 'Geolocation unavailable' });
  });

  // ── GET /api/employee/payslip/:payrollId ────────────────────────────
  app.get('/api/employee/payslip/:payrollId', async (req, res) => {
    const payrollId = Number(req.params.payrollId);
    if (!payrollId) return res.status(400).json({ success: false, message: 'Invalid payroll ID' });

    let conn;
    try {
      conn = await pool.getConnection();

      const [rows] = await conn.execute(`
        SELECT
          ep.payroll_id, ep.payroll_status,
          ep.basic_salary, ep.overtime, ep.holiday_pay,
          ep.taxable_allowances, ep.non_taxable_allowances,
          ep.absence_time, ep.absence_deduction,
          ep.late_time, ep.late_deduction,
          ep.undertime, ep.undertime_deduction,
          ep.sss_employee, ep.philhealth_employee, ep.pagibig_employee,
          ep.gsis_employee, ep.tax_withheld,
          ep.loans, ep.other_deductions, ep.deductions, ep.adj_comp, ep.adj_non_comp,
          ep.gross_pay, ep.total_deductions, ep.net_pay,
          e.first_name, e.last_name, e.middle_name, e.emp_code,
          ee.position, ee.department, ee.company, ee.date_hired,
          pr.payroll_range, pr.status AS run_status
        FROM employee_payroll ep
        LEFT JOIN employees e ON e.employee_id = ep.employee_id
        LEFT JOIN employee_employment ee ON ee.employee_id = ep.employee_id
        LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
        WHERE ep.payroll_id = ?
        LIMIT 1
      `, [payrollId]);

      if (!rows.length) return res.status(404).json({ success: false, message: 'Payslip not found' });

      const payroll = rows[0];

      const [allowances] = await conn.execute(`
        SELECT epa.amount, at.allowance_name, at.is_taxable
        FROM employee_payroll_allowances epa
        LEFT JOIN allowance_types at ON at.allowance_type_id = epa.allowance_type_id
        WHERE epa.payroll_id = ?
      `, [payrollId]);

      const [deductions] = await conn.execute(`
        SELECT epd.amount, dt.deduction_name
        FROM employee_payroll_deductions epd
        LEFT JOIN deduction_types dt ON dt.deduction_type_id = epd.deduction_type_id
        WHERE epd.payroll_id = ?
      `, [payrollId]);

      return res.json({ success: true, payslip: { ...payroll, allowances, deductions } });
    } catch (err) {
      console.error('Payslip error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── Save device push token ───────────────────────────────────────────
  app.post('/api/employee/push-token', async (req, res) => {
    const userId = Number(req.body.user_id);
    const pushToken = String(req.body.push_token || '').trim();
    if (!userId || !pushToken) {
      return res.status(400).json({ success: false, message: 'Missing user_id or push_token' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute('UPDATE users SET push_token = ? WHERE user_id = ?', [pushToken, userId]);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── Profile photo upload ─────────────────────────────────────────────
  const profileUploadDir = path.join(__dirname, '../uploads/profiles');
  if (!fs.existsSync(profileUploadDir)) fs.mkdirSync(profileUploadDir, { recursive: true });

  const profileUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, profileUploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `user_${req.body.user_id}_${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
  });

  app.post('/api/employee/profile-photo', profileUpload.single('photo'), async (req, res) => {
    const userId = Number(req.body.user_id);
    if (!userId || !req.file) {
      return res.status(400).json({ success: false, message: 'Missing user_id or photo' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      // Delete old profile photo file if it exists
      const [existing] = await conn.execute('SELECT profile_photo FROM users WHERE user_id = ? LIMIT 1', [userId]);
      if (existing[0]?.profile_photo) {
        const oldPath = path.join(profileUploadDir, existing[0].profile_photo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await conn.execute('UPDATE users SET profile_photo = ? WHERE user_id = ?', [req.file.filename, userId]);
      return res.json({ success: true, filename: req.file.filename, url: `/uploads/profiles/${req.file.filename}` });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/attendance/location-config', (_req, res) => {
    const office = getOfficeLocationConfig();
    return res.json({ success: true, office });
  });

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

  function canManagePerformance(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized.includes('admin') || normalized.includes('hr') || normalized.includes('human resource');
  }

  async function ensureEmployeeEvaluationTable(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_evaluations (
        evaluation_id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        review_period VARCHAR(100) NOT NULL,
        review_date DATE NOT NULL,
        evaluator_name VARCHAR(150) NULL,
        productivity_score DECIMAL(5,2) NOT NULL DEFAULT 0,
        quality_score DECIMAL(5,2) NOT NULL DEFAULT 0,
        teamwork_score DECIMAL(5,2) NOT NULL DEFAULT 0,
        attendance_score DECIMAL(5,2) NOT NULL DEFAULT 0,
        initiative_score DECIMAL(5,2) NOT NULL DEFAULT 0,
        overall_score DECIMAL(5,2) NOT NULL DEFAULT 0,
        rating VARCHAR(50) NOT NULL DEFAULT 'Needs Improvement',
        strengths TEXT NULL,
        improvement_areas TEXT NULL,
        goals TEXT NULL,
        action_plan TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_employee_evaluations_employee_date (employee_id, review_date),
        CONSTRAINT fk_employee_evaluations_employee
          FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  function buildEvaluationSummary(evaluations) {
    const rows = Array.isArray(evaluations) ? evaluations : [];
    if (!rows.length) {
      return {
        count: 0,
        latestScore: null,
        latestRating: '',
        averageScore: null,
        growthDelta: null
      };
    }

    const scores = rows
      .map((row) => Number(row.overall_score))
      .filter((score) => Number.isFinite(score));
    const latest = rows[0] || {};
    const oldest = rows[rows.length - 1] || latest;
    const latestScore = Number(latest.overall_score);
    const oldestScore = Number(oldest.overall_score);

    return {
      count: rows.length,
      latestScore: Number.isFinite(latestScore) ? latestScore : null,
      latestRating: latest.rating || '',
      averageScore: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      growthDelta: Number.isFinite(latestScore) && Number.isFinite(oldestScore) ? latestScore - oldestScore : null
    };
  }

  async function getEmployeeEvaluations(conn, employeeId) {
    await ensureEmployeeEvaluationTable(conn);
    const [rows] = await conn.execute(
      `SELECT
          evaluation_id,
          review_period,
          DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date,
          evaluator_name,
          productivity_score,
          quality_score,
          teamwork_score,
          attendance_score,
          initiative_score,
          overall_score,
          rating,
          strengths,
          improvement_areas,
          goals,
          action_plan,
          DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM employee_evaluations
       WHERE employee_id = ?
       ORDER BY review_date DESC, evaluation_id DESC
       LIMIT 12`,
      [employeeId]
    );
    return rows;
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

      let overtimeStatuses = [
        { status: 'Pending', total: 0 },
        { status: 'Approved', total: 0 },
        { status: 'Rejected', total: 0 },
        { status: 'Cancelled', total: 0 }
      ];

      try {
        const [otRows] = await conn.execute(`
          SELECT status, COUNT(*) AS total
          FROM employee_overtime_requests
          GROUP BY status
        `);

        overtimeStatuses = overtimeStatuses.map((base) => {
          const match = otRows.find((row) => row.status === base.status);
          return match ? { status: base.status, total: Number(match.total || 0) } : base;
        });
      } catch (otErr) {
        if (otErr.code !== 'ER_NO_SUCH_TABLE') {
          throw otErr;
        }
      }

      let payrollRunHistory = [];
      try {
        const [payrollHistoryRows] = await conn.execute(`
          SELECT
            pr.run_id,
            pr.payroll_range,
            pr.status,
            COALESCE(SUM(ep.net_pay), 0) AS total_net_pay,
            COALESCE(SUM(ep.gross_pay), 0) AS total_gross_pay,
            COUNT(ep.employee_id) AS headcount
          FROM payroll_runs pr
          LEFT JOIN employee_payroll ep ON ep.run_id = pr.run_id
          WHERE pr.status IN ('Completed', 'Generated', 'Locked')
          GROUP BY pr.run_id, pr.payroll_range, pr.status
          ORDER BY pr.run_id DESC
          LIMIT 4
        `);
        payrollRunHistory = payrollHistoryRows;
      } catch (payrollHistErr) {
        if (payrollHistErr.code !== 'ER_NO_SUCH_TABLE') throw payrollHistErr;
      }

      conn.release();

      res.json({
        totalEmployees: employees[0].total,
        processedPayrolls: payrolls[0].total,
        systemLogs: logsToday[0].total,
        employeeStatuses,
        payrollStatuses,
        leaveStatuses,
        overtimeStatuses,
        payrollRunHistory
      });
    } catch (err) {
      console.error("Dashboard error:", err);
      res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  });

  app.get('/api/admin/performance-evaluations', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.execute(
        'SELECT user_id, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );
      const user = users[0] || null;
      if (!user || !canManagePerformance(user.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can view performance ratings.' });
      }

      await ensureEmployeeEvaluationTable(conn);

      const [rows] = await conn.execute(
        `SELECT
            e.employee_id,
            e.emp_code,
            CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
            COALESCE(ee.department, 'N/A') AS department,
            COALESCE(ee.position, 'N/A') AS position,
            ev.evaluation_id,
            ev.review_period,
            DATE_FORMAT(ev.review_date, '%Y-%m-%d') AS review_date,
            ev.evaluator_name,
            ev.overall_score,
            ev.rating,
            ev.goals,
            ev.action_plan
         FROM employee_evaluations ev
         INNER JOIN (
           SELECT employee_id, MAX(evaluation_id) AS evaluation_id
           FROM employee_evaluations
           GROUP BY employee_id
         ) latest ON latest.evaluation_id = ev.evaluation_id
         INNER JOIN employees e ON e.employee_id = ev.employee_id
         LEFT JOIN employee_employment ee
           ON ee.employment_id = (
             SELECT employment_id
             FROM employee_employment
             WHERE employee_id = e.employee_id
             ORDER BY employment_id DESC
             LIMIT 1
           )
         ORDER BY ev.review_date DESC, ev.evaluation_id DESC
         LIMIT 200`
      );

      const scores = rows
        .map((row) => Number(row.overall_score))
        .filter((score) => Number.isFinite(score));

      return res.json({
        success: true,
        evaluations: rows,
        summary: {
          employeesWithRatings: rows.length,
          averageScore: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
          latestRating: rows[0]?.rating || ''
        }
      });
    } catch (err) {
      console.error('Performance evaluations load error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
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
        'SELECT user_id, username, full_name, role, profile_photo FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = users[0];

      const employee = await findEmployeeByUser(conn, user);

      let payrollSummary = null;
      let payrollHistory = [];
      let evaluations = [];
      let evaluationSummary = buildEvaluationSummary([]);

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
              ep.payroll_id,
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

        evaluations = await getEmployeeEvaluations(conn, employee.employee_id);
        evaluationSummary = buildEvaluationSummary(evaluations);
      }

      let attendanceSummary = null;
      if (employee) {
        try {
          const [[adjRow]] = await conn.execute(
            `SELECT paa.late_time, paa.late_amt, paa.undertime_time, paa.undertime_amt,
                    pr.payroll_range
             FROM payroll_attendance_adjustments paa
             JOIN payroll_runs pr ON pr.run_id = paa.run_id
             WHERE paa.employee_id = ?
             ORDER BY paa.adj_id DESC LIMIT 1`,
            [employee.employee_id]
          );
          if (adjRow) {
            attendanceSummary = {
              late_minutes: Number(adjRow.late_time || 0),
              late_amt: Number(adjRow.late_amt || 0),
              undertime_minutes: Number(adjRow.undertime_time || 0),
              undertime_amt: Number(adjRow.undertime_amt || 0),
              period_range: adjRow.payroll_range || null
            };
          }
        } catch {
          // payroll_attendance_adjustments may not exist in all environments
        }
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

      const profilePhotoUrl = user.profile_photo
        ? `/uploads/profiles/${user.profile_photo}`
        : null;

      return res.json({
        success: true,
        user,
        employee,
        payrollSummary,
        payrollHistory,
        evaluations,
        evaluationSummary,
        attendanceSummary,
        todayTime,
        attendanceLogs: attendanceRows,
        profilePhotoUrl,
      });
    } catch (err) {
      console.error('Employee dashboard error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/employee/time-entry', attendanceUpload.single('photo'), async (req, res) => {
    const userId = Number(req.body.user_id);
    const type = String(req.body.type || '').toLowerCase();
    const latitude = req.body.latitude != null ? Number(req.body.latitude) : null;
    const longitude = req.body.longitude != null ? Number(req.body.longitude) : null;
    const postedDistanceM = req.body.distance_m != null ? Number(req.body.distance_m) : null;
    const cameraMode = String(req.body.camera_mode || '').toLowerCase();
    const uploadedPhotoFilename = req.file ? req.file.filename : null;
    const photoFilename = [
      cameraMode && `mode:${cameraMode}`,
      uploadedPhotoFilename && `photo:${uploadedPhotoFilename}`
    ]
      .filter(Boolean)
      .join(';') || null;

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
      const office = getOfficeLocationConfig();
      const computedDistanceM =
        Number.isFinite(latitude) && Number.isFinite(longitude)
          ? haversineMeters(latitude, longitude, office.latitude, office.longitude)
          : postedDistanceM;

      await conn.execute(
        'INSERT INTO audit_logs (user_id, admin_name, action, status, latitude, longitude, distance_m, photo_filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [user.user_id, user.full_name, action, 'Success',
          Number.isFinite(latitude) ? latitude : null,
          Number.isFinite(longitude) ? longitude : null,
          Number.isFinite(computedDistanceM) ? computedDistanceM : null,
          photoFilename]
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
    const filterUserId = Number(req.query.user_id || 0) || null;
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
             AND (? IS NULL OR u.user_id = ?)
         ),
         log_summary AS (
           SELECT
              user_id,
              DATE(log_time) AS attendance_date,
              MIN(CASE WHEN action = 'Employee Time In' THEN log_time END) AS time_in,
              MIN(CASE WHEN action = 'Employee Break Out' THEN log_time END) AS break_out,
              MIN(CASE WHEN action = 'Employee Break In' THEN log_time END) AS break_in,
              MAX(CASE WHEN action = 'Employee Time Out' THEN log_time END) AS time_out,
              MIN(CASE WHEN action = 'Employee Time In' THEN latitude END) AS time_in_lat,
              MIN(CASE WHEN action = 'Employee Time In' THEN longitude END) AS time_in_lng,
              MIN(CASE WHEN action = 'Employee Time In' THEN distance_m END) AS time_in_dist,
              MIN(CASE WHEN action = 'Employee Time In' THEN photo_filename END) AS time_in_photo,
              MIN(CASE WHEN action = 'Employee Break Out' THEN latitude END) AS break_out_lat,
              MIN(CASE WHEN action = 'Employee Break Out' THEN longitude END) AS break_out_lng,
              MIN(CASE WHEN action = 'Employee Break Out' THEN distance_m END) AS break_out_dist,
              MIN(CASE WHEN action = 'Employee Break In' THEN latitude END) AS break_in_lat,
              MIN(CASE WHEN action = 'Employee Break In' THEN longitude END) AS break_in_lng,
              MIN(CASE WHEN action = 'Employee Break In' THEN distance_m END) AS break_in_dist,
              MAX(CASE WHEN action = 'Employee Time Out' THEN latitude END) AS time_out_lat,
              MAX(CASE WHEN action = 'Employee Time Out' THEN longitude END) AS time_out_lng,
              MAX(CASE WHEN action = 'Employee Time Out' THEN distance_m END) AS time_out_dist
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
            ls.time_in_lat,
            ls.time_in_lng,
            ls.time_in_dist,
            ls.time_in_photo,
            ls.break_out_lat,
            ls.break_out_lng,
            ls.break_out_dist,
            ls.break_in_lat,
            ls.break_in_lng,
            ls.break_in_dist,
            ls.time_out_lat,
            ls.time_out_lng,
            ls.time_out_dist,
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
            ) AS ot_hours,
            CASE
              WHEN ls.time_in IS NOT NULL
              THEN GREATEST(0, TIMESTAMPDIFF(MINUTE,
                   CONCAT(DATE_FORMAT(sd.attendance_date, '%Y-%m-%d'), ' 08:00:00'),
                   ls.time_in))
              ELSE 0
            END AS late_minutes,
            CASE
              WHEN ls.time_in IS NOT NULL AND ls.time_out IS NOT NULL
              THEN GREATEST(0, 480 - (
                TIMESTAMPDIFF(MINUTE, ls.time_in, ls.time_out) -
                CASE
                  WHEN ls.break_out IS NOT NULL AND ls.break_in IS NOT NULL AND ls.break_in > ls.break_out
                  THEN TIMESTAMPDIFF(MINUTE, ls.break_out, ls.break_in)
                  ELSE 0
                END
              ))
              ELSE 0
            END AS undertime_minutes
         FROM selected_dates sd
         CROSS JOIN employee_users eu
         LEFT JOIN log_summary ls
           ON ls.user_id = eu.user_id
          AND ls.attendance_date = sd.attendance_date
         ORDER BY sd.attendance_date DESC, eu.employee_name ASC`,
        [fromDate, toDate, filterUserId, filterUserId, fromDate, toDate]
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

      // Save pre-computed values to hris_attendance so payroll can use them directly
      const [[empRecordForHris]] = await conn.execute(
        `SELECT e.employee_id FROM users u
         JOIN employees e ON LOWER(TRIM(e.emp_code)) = LOWER(TRIM(u.username))
         WHERE u.user_id = ? LIMIT 1`,
        [employeeUserId]
      );
      if (empRecordForHris) {
        // Compute late, undertime, OT from the edited attendance times
        const shiftStartMin = 8 * 60; // 08:00 = 480 min
        let hrisLateMin = 0, hrisUndertimeMin = 0, hrisOtHours = 0;
        const hrisStatus = normalizedTimes.time_in ? (normalizedTimes.time_out ? 'Present' : 'Incomplete') : 'Absent';

        if (normalizedTimes.time_in) {
          const [inH, inM] = normalizedTimes.time_in.split(':').map(Number);
          const timeInMin = inH * 60 + inM;
          if (timeInMin > shiftStartMin) hrisLateMin = timeInMin - shiftStartMin;
        }

        if (normalizedTimes.time_in && normalizedTimes.time_out) {
          const [inH, inM]   = normalizedTimes.time_in.split(':').map(Number);
          const [outH, outM] = normalizedTimes.time_out.split(':').map(Number);
          let workedMin = (outH * 60 + outM) - (inH * 60 + inM);
          if (normalizedTimes.break_out && normalizedTimes.break_in) {
            const [boH, boM] = normalizedTimes.break_out.split(':').map(Number);
            const [biH, biM] = normalizedTimes.break_in.split(':').map(Number);
            workedMin -= (biH * 60 + biM) - (boH * 60 + boM);
          }
          if (workedMin < 480) hrisUndertimeMin = 480 - workedMin;
          else if (workedMin > 480) hrisOtHours = Math.round((workedMin - 480) / 60 * 100) / 100;
        }

        try {
          await conn.execute(
            `INSERT INTO hris_attendance
               (employee_id, attendance_date, time_in, time_out, late_minutes, undertime_minutes, overtime_hours, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               time_in = VALUES(time_in), time_out = VALUES(time_out),
               late_minutes = VALUES(late_minutes), undertime_minutes = VALUES(undertime_minutes),
               overtime_hours = VALUES(overtime_hours), status = VALUES(status)`,
            [
              empRecordForHris.employee_id, attendanceDate,
              normalizedTimes.time_in || null, normalizedTimes.time_out || null,
              hrisLateMin, hrisUndertimeMin, hrisOtHours, hrisStatus
            ]
          );
        } catch (_) {} // non-critical: table may not exist on older deployments
      }

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
