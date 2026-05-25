module.exports = function (app, pool) {
  const ACTION_TO_COLUMN = {
    time_in: "time_in",
    break_out: "break_out",
    break_in: "break_in",
    time_out: "time_out"
  };
  const ACTION_UPDATE_QUERY = {
    time_in: `UPDATE employee_attendance_records
              SET time_in = ?, source = ?
              WHERE employee_id = ? AND attendance_date = ?`,
    break_out: `UPDATE employee_attendance_records
                SET break_out = ?, source = ?
                WHERE employee_id = ? AND attendance_date = ?`,
    break_in: `UPDATE employee_attendance_records
               SET break_in = ?, source = ?
               WHERE employee_id = ? AND attendance_date = ?`,
    time_out: `UPDATE employee_attendance_records
               SET time_out = ?, source = ?
               WHERE employee_id = ? AND attendance_date = ?`
  };

  function isValidDate(dateStr) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""));
  }

  function isValidTime(timeStr) {
    return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(String(timeStr || ""));
  }

  function toDateTimeString(dateStr, value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 19).replace("T", " ");
    if (!isValidTime(value)) return null;
    return `${dateStr} ${String(value).length === 5 ? `${value}:00` : value}`;
  }

  function minutesBetween(dateA, dateB) {
    if (!dateA || !dateB) return 0;
    const a = new Date(dateA);
    const b = new Date(dateB);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.max(0, (b.getTime() - a.getTime()) / 60000);
  }

  function minutesFromTime(value) {
    if (!value) return null;
    const text = String(value).slice(0, 8);
    const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60;
  }

  function roundHours(minutes) {
    return Math.round((Math.max(0, minutes) / 60) * 100) / 100;
  }

  function deriveMetrics(record, shift) {
    const workedMinutes = minutesBetween(record.time_in, record.time_out) - minutesBetween(record.break_out, record.break_in);
    const workedHours = roundHours(workedMinutes);

    let scheduledMinutes = 0;
    if (shift && !shift.is_rest_day) {
      scheduledMinutes = (minutesFromTime(shift.end_time) || 0) - (minutesFromTime(shift.start_time) || 0);
      if (shift.break_start && shift.break_end) {
        scheduledMinutes -= (minutesFromTime(shift.break_end) || 0) - (minutesFromTime(shift.break_start) || 0);
      }
      scheduledMinutes = Math.max(0, scheduledMinutes);
    }

    const overtimeHours = roundHours(Math.max(0, workedMinutes - scheduledMinutes));

    let status = "Absent";
    if (record.time_in && record.time_out) {
      status = "Present";
      if (shift && shift.start_time && !shift.is_rest_day) {
        const shiftStart = minutesFromTime(shift.start_time);
        const actualIn = minutesFromTime(new Date(record.time_in).toTimeString().slice(0, 8));
        if (shiftStart !== null && actualIn !== null && actualIn > shiftStart) {
          status = "Late";
        }
      }
    } else if (record.time_in || record.break_out || record.break_in || record.time_out) {
      status = "Incomplete";
    }

    return { workedHours, overtimeHours, status };
  }

  async function ensureAttendanceTables() {
    const conn = await pool.getConnection();
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS employee_shift_schedules (
          shift_id INT NOT NULL AUTO_INCREMENT,
          employee_id INT NOT NULL,
          shift_date DATE NOT NULL,
          shift_name VARCHAR(100) NOT NULL DEFAULT 'Regular Shift',
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          break_start TIME NULL,
          break_end TIME NULL,
          is_rest_day TINYINT(1) NOT NULL DEFAULT 0,
          notes VARCHAR(255) NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (shift_id),
          UNIQUE KEY uk_employee_shift_date (employee_id, shift_date),
          KEY idx_shift_date (shift_date),
          CONSTRAINT employee_shift_schedules_ibfk_1
            FOREIGN KEY (employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS employee_attendance_records (
          attendance_id INT NOT NULL AUTO_INCREMENT,
          employee_id INT NOT NULL,
          shift_id INT NULL,
          attendance_date DATE NOT NULL,
          time_in DATETIME NULL,
          break_out DATETIME NULL,
          break_in DATETIME NULL,
          time_out DATETIME NULL,
          worked_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
          overtime_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
          status ENUM('Present', 'Late', 'Absent', 'Incomplete') NOT NULL DEFAULT 'Incomplete',
          source VARCHAR(50) NOT NULL DEFAULT 'manual',
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (attendance_id),
          UNIQUE KEY uk_employee_attendance_date (employee_id, attendance_date),
          KEY idx_attendance_date (attendance_date),
          KEY idx_attendance_shift (shift_id),
          CONSTRAINT employee_attendance_records_ibfk_1
            FOREIGN KEY (employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE,
          CONSTRAINT employee_attendance_records_ibfk_2
            FOREIGN KEY (shift_id) REFERENCES employee_shift_schedules (shift_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
    } finally {
      conn.release();
    }
  }

  async function getShift(conn, employeeId, date) {
    const [rows] = await conn.query(
      `SELECT shift_id, employee_id, shift_date, start_time, end_time, break_start, break_end, is_rest_day
       FROM employee_shift_schedules
       WHERE employee_id = ? AND shift_date = ?
       LIMIT 1`,
      [employeeId, date]
    );
    return rows[0] || null;
  }

  async function getOrCreateAttendanceRecord(conn, employeeId, attendanceDate, source = "manual") {
    await conn.query(
      `INSERT INTO employee_attendance_records (employee_id, attendance_date, status, source)
       VALUES (?, ?, 'Incomplete', ?)
       ON DUPLICATE KEY UPDATE source = VALUES(source)`,
      [employeeId, attendanceDate, source]
    );

    const [rows] = await conn.query(
      `SELECT * FROM employee_attendance_records WHERE employee_id = ? AND attendance_date = ? LIMIT 1`,
      [employeeId, attendanceDate]
    );

    return rows[0] || null;
  }

  async function recalculateAttendance(conn, employeeId, attendanceDate) {
    const [records] = await conn.query(
      `SELECT * FROM employee_attendance_records WHERE employee_id = ? AND attendance_date = ? LIMIT 1`,
      [employeeId, attendanceDate]
    );

    if (!records[0]) return null;
    const record = records[0];
    const shift = await getShift(conn, employeeId, attendanceDate);
    const metrics = deriveMetrics(record, shift);

    await conn.query(
      `UPDATE employee_attendance_records
       SET shift_id = ?, worked_hours = ?, overtime_hours = ?, status = ?
       WHERE attendance_id = ?`,
      [shift ? shift.shift_id : null, metrics.workedHours, metrics.overtimeHours, metrics.status, record.attendance_id]
    );

    const [updated] = await conn.query(
      `SELECT * FROM employee_attendance_records WHERE attendance_id = ? LIMIT 1`,
      [record.attendance_id]
    );

    return updated[0] || null;
  }

  // ========== ATTENDANCE EMPLOYEES ==========
  app.get("/api/attendance/employees", async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.query(
        `SELECT e.employee_id, e.emp_code,
                CONCAT(e.first_name, ' ', e.last_name) AS full_name,
                ee.department
         FROM employees e
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         WHERE e.status = 'Active'
         ORDER BY e.first_name ASC, e.last_name ASC`
      );

      const departments = [...new Set(rows.map(r => r.department).filter(Boolean))].sort();
      res.json({ success: true, employees: rows, departments });
    } catch (err) {
      console.error("Error loading attendance employees:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== ATTENDANCE SUMMARY ==========
  app.get("/api/attendance/summary", async (req, res) => {
    const attendanceDate = req.query.date;
    if (!isValidDate(attendanceDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [[employees]] = await conn.query(
        `SELECT COUNT(*) AS total FROM employees WHERE status = 'Active'`
      );

      const [[present]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM employee_attendance_records
         WHERE attendance_date = ? AND status IN ('Present', 'Late')`,
        [attendanceDate]
      );

      const [[lateOrIncomplete]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM employee_attendance_records
         WHERE attendance_date = ? AND status IN ('Late', 'Incomplete')`,
        [attendanceDate]
      );

      res.json({
        success: true,
        date: attendanceDate,
        totalEmployees: employees.total || 0,
        present: present.total || 0,
        lateOrIncomplete: lateOrIncomplete.total || 0
      });
    } catch (err) {
      console.error("Error loading attendance summary:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== ATTENDANCE RECORDS ==========
  app.get("/api/attendance/records", async (req, res) => {
    const attendanceDate = req.query.date;
    if (!isValidDate(attendanceDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
    }

    const department = (req.query.department || "").trim();
    const employeeCode = String(req.query.employee_code || "").trim();
    const normalizedEmployeeFilter = employeeCode.split(" - ")[0].trim();
    const status = (req.query.status || "All").trim();
    const search = (req.query.search || "").trim();

    const allowedStatuses = ["All", "Present", "Late", "Absent", "Incomplete"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status filter" });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const params = [attendanceDate, attendanceDate];
      const conditions = ["e.status = 'Active'"];

      if (department) {
        conditions.push("ee.department = ?");
        params.push(department);
      }

      if (normalizedEmployeeFilter) {
        conditions.push("(e.emp_code LIKE ? OR CONCAT(e.first_name, ' ', e.last_name) LIKE ?)");
        params.push(`%${normalizedEmployeeFilter}%`, `%${normalizedEmployeeFilter}%`);
      }

      if (search) {
        conditions.push("(e.emp_code LIKE ? OR CONCAT(e.first_name, ' ', e.last_name) LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }

      const [rows] = await conn.query(
        `SELECT
            e.employee_id,
            e.emp_code,
            CONCAT(e.first_name, ' ', e.last_name) AS full_name,
            ee.department,
            ar.time_in,
            ar.break_out,
            ar.break_in,
            ar.time_out,
            ar.worked_hours,
            ar.overtime_hours,
            COALESCE(ar.status, 'Absent') AS status,
            ss.shift_name,
            ss.start_time,
            ss.end_time,
            ss.break_start,
            ss.break_end,
            ss.is_rest_day
         FROM employees e
         LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
         LEFT JOIN employee_attendance_records ar
                ON ar.employee_id = e.employee_id
               AND ar.attendance_date = ?
         LEFT JOIN employee_shift_schedules ss
                ON ss.employee_id = e.employee_id
               AND ss.shift_date = ?
         WHERE ${conditions.join(" AND ")}
         ORDER BY e.first_name ASC, e.last_name ASC`,
        params
      );

      const filtered = status === "All" ? rows : rows.filter(r => r.status === status);
      res.json({ success: true, records: filtered });
    } catch (err) {
      console.error("Error loading attendance records:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== REAL-TIME CLOCK ACTION ==========
  app.post("/api/attendance/clock", async (req, res) => {
    const employeeId = Number(req.body.employee_id || 0);
    const action = String(req.body.action || "").trim();
    const source = String(req.body.source || "realtime").trim() || "realtime";
    const attendanceDate = String(req.body.attendance_date || new Date().toISOString().slice(0, 10));

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "employee_id is required" });
    }
    if (!ACTION_TO_COLUMN[action]) {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }
    if (!isValidDate(attendanceDate)) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await getOrCreateAttendanceRecord(conn, employeeId, attendanceDate, source);

      const timeValue = new Date().toISOString().slice(0, 19).replace("T", " ");
      await conn.query(ACTION_UPDATE_QUERY[action], [timeValue, source, employeeId, attendanceDate]);

      const updated = await recalculateAttendance(conn, employeeId, attendanceDate);
      res.json({ success: true, attendance: updated });
    } catch (err) {
      console.error("Error updating real-time attendance:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== MANUAL OT UPDATE ==========
  app.post("/api/attendance/overtime", async (req, res) => {
    const employeeId = Number(req.body.employee_id || 0);
    const attendanceDate = String(req.body.attendance_date || "");
    const overtimeHours = Number(req.body.overtime_hours);

    if (!employeeId || !isValidDate(attendanceDate) || Number.isNaN(overtimeHours) || overtimeHours < 0) {
      return res.status(400).json({
        success: false,
        message: "employee_id, attendance_date (YYYY-MM-DD), and non-negative overtime_hours are required"
      });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await getOrCreateAttendanceRecord(conn, employeeId, attendanceDate, "manual");

      await conn.query(
        `UPDATE employee_attendance_records
         SET overtime_hours = ?
         WHERE employee_id = ? AND attendance_date = ?`,
        [overtimeHours, employeeId, attendanceDate]
      );

      const [rows] = await conn.query(
        `SELECT * FROM employee_attendance_records WHERE employee_id = ? AND attendance_date = ? LIMIT 1`,
        [employeeId, attendanceDate]
      );

      res.json({ success: true, attendance: rows[0] || null });
    } catch (err) {
      console.error("Error updating overtime:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== SHIFT SCHEDULE LIST ==========
  app.get("/api/shifts", async (req, res) => {
    const dateFrom = String(req.query.date_from || "");
    const dateTo = String(req.query.date_to || "");

    if (!isValidDate(dateFrom) || !isValidDate(dateTo)) {
      return res.status(400).json({ success: false, message: "date_from and date_to are required (YYYY-MM-DD)" });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const params = [dateFrom, dateTo];

      const [rows] = await conn.query(
        `SELECT ss.shift_id, ss.employee_id, ss.shift_date, ss.shift_name,
                ss.start_time, ss.end_time, ss.break_start, ss.break_end,
                ss.is_rest_day, ss.notes,
                e.emp_code, CONCAT(e.first_name, ' ', e.last_name) AS full_name
         FROM employee_shift_schedules ss
         JOIN employees e ON e.employee_id = ss.employee_id
         WHERE ss.shift_date BETWEEN ? AND ?
         ORDER BY ss.shift_date ASC, e.first_name ASC, e.last_name ASC`,
        params
      );

      res.json({ success: true, shifts: rows });
    } catch (err) {
      console.error("Error loading shifts:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  // ========== CREATE/UPDATE SHIFT ==========
  app.post("/api/shifts", async (req, res) => {
    const employeeId = Number(req.body.employee_id || 0);
    const shiftDate = String(req.body.shift_date || "");
    const shiftName = String(req.body.shift_name || "Regular Shift").trim() || "Regular Shift";
    const startTime = String(req.body.start_time || "");
    const endTime = String(req.body.end_time || "");
    const breakStart = req.body.break_start ? String(req.body.break_start) : null;
    const breakEnd = req.body.break_end ? String(req.body.break_end) : null;
    const isRestDay = req.body.is_rest_day ? 1 : 0;
    const notes = req.body.notes ? String(req.body.notes).slice(0, 255) : null;

    if (!employeeId || !isValidDate(shiftDate)) {
      return res.status(400).json({ success: false, message: "employee_id and shift_date are required" });
    }

    if (!isRestDay && (!isValidTime(startTime) || !isValidTime(endTime))) {
      return res.status(400).json({ success: false, message: "start_time and end_time are required for non-rest day shifts" });
    }

    if ((breakStart && !isValidTime(breakStart)) || (breakEnd && !isValidTime(breakEnd))) {
      return res.status(400).json({ success: false, message: "break_start and break_end must be valid time values" });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query(
        `INSERT INTO employee_shift_schedules
          (employee_id, shift_date, shift_name, start_time, end_time, break_start, break_end, is_rest_day, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           shift_name = VALUES(shift_name),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           break_start = VALUES(break_start),
           break_end = VALUES(break_end),
           is_rest_day = VALUES(is_rest_day),
           notes = VALUES(notes)`,
        [
          employeeId,
          shiftDate,
          shiftName,
          // Use 00:00:00 as sentinel for rest days because start_time/end_time are NOT NULL columns.
          isRestDay ? "00:00:00" : (startTime.length === 5 ? `${startTime}:00` : startTime),
          isRestDay ? "00:00:00" : (endTime.length === 5 ? `${endTime}:00` : endTime),
          breakStart ? (breakStart.length === 5 ? `${breakStart}:00` : breakStart) : null,
          breakEnd ? (breakEnd.length === 5 ? `${breakEnd}:00` : breakEnd) : null,
          isRestDay,
          notes
        ]
      );

      await recalculateAttendance(conn, employeeId, shiftDate);

      const [rows] = await conn.query(
        `SELECT * FROM employee_shift_schedules WHERE employee_id = ? AND shift_date = ? LIMIT 1`,
        [employeeId, shiftDate]
      );

      res.json({ success: true, shift: rows[0] || null });
    } catch (err) {
      console.error("Error saving shift:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete("/api/shifts/:shiftId", async (req, res) => {
    const shiftId = Number(req.params.shiftId || 0);
    if (!shiftId) {
      return res.status(400).json({ success: false, message: "Invalid shift id" });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [target] = await conn.query(
        `SELECT employee_id, shift_date FROM employee_shift_schedules WHERE shift_id = ? LIMIT 1`,
        [shiftId]
      );

      await conn.query(`DELETE FROM employee_shift_schedules WHERE shift_id = ?`, [shiftId]);

      if (target[0]) {
        await recalculateAttendance(conn, target[0].employee_id, target[0].shift_date);
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting shift:", err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  ensureAttendanceTables().catch(err => {
    console.error("Failed to ensure attendance tables:", err);
  });
};
