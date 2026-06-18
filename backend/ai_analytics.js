const axios = require('axios');
const AI_MICRO_URL = process.env.AI_MICRO_URL || 'http://127.0.0.1:5001';

module.exports = function (app, pool) {
  function canViewAnalytics(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized.includes('admin') || normalized.includes('hr') || normalized.includes('human resource');
  }

  async function findUserById(conn, userId) {
    const [rows] = await conn.execute(
      'SELECT user_id, full_name, role FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  }

  function riskBand(score) {
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  }

  function insightForRisk(row) {
    const signals = [];
    if (Number(row.absent_days || 0) >= 3) signals.push(`${row.absent_days} absence day(s)`);
    if (Number(row.late_days || 0) >= 3) signals.push(`${row.late_days} tardy day(s)`);
    if (Number(row.leave_days || 0) >= 5) signals.push(`${Number(row.leave_days || 0).toFixed(1)} approved leave day(s)`);
    if (Number(row.approved_ot_hours || 0) >= 8) signals.push(`${Number(row.approved_ot_hours || 0).toFixed(1)} approved OT hour(s)`);
    if (Number(row.tenure_days || 0) < 180) signals.push('new employee');
    return signals.length ? signals.join(', ') : 'Stable attendance and workload signals';
  }

  app.get('/api/ai-analytics', async (req, res) => {
    const userId = Number(req.query.user_id || req.headers['x-user-id']);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const user = await findUserById(conn, userId);
      if (!user || !canViewAnalytics(user.role)) {
        return res.status(403).json({ success: false, message: 'Only Admin or HR users can view AI analytics.' });
      }

      const [attendanceSummaryRows] = await conn.execute(`
        WITH RECURSIVE selected_dates AS (
          SELECT DATE_SUB(CURDATE(), INTERVAL 29 DAY) AS attendance_date
          UNION ALL
          SELECT DATE_ADD(attendance_date, INTERVAL 1 DAY)
          FROM selected_dates
          WHERE attendance_date < CURDATE()
        ),
        employee_users AS (
          SELECT
            u.user_id,
            COALESCE(e_code.employee_id, e_name.employee_id) AS employee_id,
            COALESCE(e_code.emp_code, e_name.emp_code, u.username) AS emp_code,
            COALESCE(CONCAT_WS(' ', e_code.first_name, e_code.last_name), CONCAT_WS(' ', e_name.first_name, e_name.last_name), u.full_name) AS employee_name,
            COALESCE(ee.department, 'N/A') AS department
          FROM users u
          LEFT JOIN employees e_code ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
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
            MAX(CASE WHEN action = 'Employee Time Out' THEN log_time END) AS time_out
          FROM audit_logs
          WHERE action IN ('Employee Time In', 'Employee Time Out')
            AND DATE(log_time) BETWEEN DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND CURDATE()
          GROUP BY user_id, DATE(log_time)
        )
        SELECT
          COUNT(*) AS scheduled_days,
          SUM(CASE WHEN ls.time_in IS NULL THEN 1 ELSE 0 END) AS absent_days,
          SUM(CASE WHEN ls.time_in IS NOT NULL AND TIME(ls.time_in) > '09:00:00' THEN 1 ELSE 0 END) AS late_days,
          SUM(CASE WHEN ls.time_out IS NULL AND ls.time_in IS NOT NULL THEN 1 ELSE 0 END) AS incomplete_days,
          ROUND(AVG(CASE WHEN ls.time_in IS NULL THEN 1 ELSE 0 END) * 100, 2) AS absence_rate,
          ROUND(AVG(CASE WHEN ls.time_in IS NOT NULL AND TIME(ls.time_in) > '09:00:00' THEN 1 ELSE 0 END) * 100, 2) AS tardiness_rate
        FROM selected_dates sd
        CROSS JOIN employee_users eu
        LEFT JOIN log_summary ls
          ON ls.user_id = eu.user_id
         AND ls.attendance_date = sd.attendance_date
        WHERE WEEKDAY(sd.attendance_date) < 5
      `);

      const [tardinessRows] = await conn.execute(`
        SELECT
          DAYNAME(log_time) AS day_name,
          WEEKDAY(log_time) AS day_index,
          COUNT(*) AS late_count
        FROM audit_logs
        WHERE action = 'Employee Time In'
          AND TIME(log_time) > '09:00:00'
          AND DATE(log_time) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
        GROUP BY DAYNAME(log_time), WEEKDAY(log_time)
        ORDER BY day_index ASC
      `);

      const [absenceDepartmentRows] = await conn.execute(`
        WITH RECURSIVE selected_dates AS (
          SELECT DATE_SUB(CURDATE(), INTERVAL 29 DAY) AS attendance_date
          UNION ALL
          SELECT DATE_ADD(attendance_date, INTERVAL 1 DAY)
          FROM selected_dates
          WHERE attendance_date < CURDATE()
        ),
        employee_users AS (
          SELECT
            u.user_id,
            COALESCE(ee.department, 'N/A') AS department
          FROM users u
          LEFT JOIN employees e_code ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
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
        time_ins AS (
          SELECT user_id, DATE(log_time) AS attendance_date
          FROM audit_logs
          WHERE action = 'Employee Time In'
            AND DATE(log_time) BETWEEN DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND CURDATE()
          GROUP BY user_id, DATE(log_time)
        )
        SELECT
          eu.department,
          SUM(CASE WHEN ti.user_id IS NULL THEN 1 ELSE 0 END) AS absence_days
        FROM selected_dates sd
        CROSS JOIN employee_users eu
        LEFT JOIN time_ins ti
          ON ti.user_id = eu.user_id
         AND ti.attendance_date = sd.attendance_date
        WHERE WEEKDAY(sd.attendance_date) < 5
        GROUP BY eu.department
        ORDER BY absence_days DESC
        LIMIT 8
      `);

      const [turnoverRows] = await conn.execute(`
        WITH employee_users AS (
          SELECT
            u.user_id,
            COALESCE(e_code.employee_id, e_name.employee_id) AS employee_id,
            COALESCE(e_code.emp_code, e_name.emp_code, u.username) AS emp_code,
            COALESCE(CONCAT_WS(' ', e_code.first_name, e_code.last_name), CONCAT_WS(' ', e_name.first_name, e_name.last_name), u.full_name) AS employee_name,
            COALESCE(ee.department, 'N/A') AS department,
            COALESCE(ee.date_hired, e_code.date_created, e_name.date_created, CURDATE()) AS date_hired
          FROM users u
          LEFT JOIN employees e_code ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
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
        attendance_signals AS (
          SELECT
            user_id,
            SUM(CASE WHEN action = 'Employee Time In' AND TIME(log_time) > '09:00:00' THEN 1 ELSE 0 END) AS late_days,
            COUNT(DISTINCT CASE WHEN action = 'Employee Time In' THEN DATE(log_time) END) AS present_days
          FROM audit_logs
          WHERE DATE(log_time) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
          GROUP BY user_id
        ),
        leave_signals AS (
          SELECT employee_id, SUM(total_days) AS leave_days
          FROM employee_leave_requests
          WHERE status = 'Approved'
            AND start_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          GROUP BY employee_id
        ),
        ot_signals AS (
          SELECT employee_id, SUM(total_hours) AS approved_ot_hours
          FROM employee_overtime_requests
          WHERE status = 'Approved'
            AND overtime_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          GROUP BY employee_id
        )
        SELECT
          eu.employee_id,
          eu.emp_code,
          eu.employee_name,
          eu.department,
          DATEDIFF(CURDATE(), eu.date_hired) AS tenure_days,
          COALESCE(att.late_days, 0) AS late_days,
          GREATEST(0, 22 - COALESCE(att.present_days, 0)) AS absent_days,
          COALESCE(leave_signals.leave_days, 0) AS leave_days,
          COALESCE(ot_signals.approved_ot_hours, 0) AS approved_ot_hours,
          LEAST(100,
            (GREATEST(0, 22 - COALESCE(att.present_days, 0)) * 8) +
            (COALESCE(att.late_days, 0) * 5) +
            (COALESCE(leave_signals.leave_days, 0) * 2) +
            (COALESCE(ot_signals.approved_ot_hours, 0) * 1.5) +
            CASE WHEN DATEDIFF(CURDATE(), eu.date_hired) < 180 THEN 15 ELSE 0 END
          ) AS risk_score
        FROM employee_users eu
        LEFT JOIN attendance_signals att ON att.user_id = eu.user_id
        LEFT JOIN leave_signals ON leave_signals.employee_id = eu.employee_id
        LEFT JOIN ot_signals ON ot_signals.employee_id = eu.employee_id
        ORDER BY risk_score DESC, eu.employee_name ASC
        LIMIT 10
      `);

      const [overtimeRows] = await conn.execute(`
        SELECT
          YEARWEEK(overtime_date, 1) AS week_key,
          MIN(DATE(overtime_date)) AS week_start,
          COALESCE(ee.department, 'N/A') AS department,
          ROUND(SUM(total_hours), 2) AS total_hours,
          COUNT(*) AS request_count
        FROM employee_overtime_requests r
        JOIN employees e ON e.employee_id = r.employee_id
        LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
        WHERE r.status = 'Approved'
          AND r.overtime_date >= DATE_SUB(CURDATE(), INTERVAL 56 DAY)
        GROUP BY YEARWEEK(overtime_date, 1), COALESCE(ee.department, 'N/A')
        ORDER BY week_key ASC, department ASC
      `);

      const totalOtHours = overtimeRows.reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
      const weekKeys = [...new Set(overtimeRows.map((row) => String(row.week_key)))];
      const currentWeekHours = overtimeRows
        .filter((row) => String(row.week_key) === weekKeys[weekKeys.length - 1])
        .reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
      const priorWeekHours = overtimeRows
        .filter((row) => String(row.week_key) === weekKeys[weekKeys.length - 2])
        .reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
      const weeklyAverage = weekKeys.length ? totalOtHours / weekKeys.length : 0;
      const nextWeekForecast = Math.max(0, weeklyAverage + ((currentWeekHours - priorWeekHours) * 0.35));

      const attendanceSummary = attendanceSummaryRows[0] || {};

      // ── Python AI Microservice ────────────────────────────────────────────
      let mlPredictions = null;
      try {
        const mlResp = await axios.post(`${AI_MICRO_URL}/predict`, {
          employees: turnoverRows.map((r) => ({
            employee_id: r.employee_id || null,
            emp_code: r.emp_code || null,
            employee_name: r.employee_name || null,
            department: r.department || null,
            tenure_days: Number(r.tenure_days || 0),
            late_days: Number(r.late_days || 0),
            absent_days: Number(r.absent_days || 0),
            leave_days: Number(r.leave_days || 0),
            approved_ot_hours: Number(r.approved_ot_hours || 0),
          })),
          overtime_patterns: overtimeRows.map((r) => ({
            week_key: String(r.week_key),
            week_start: r.week_start || null,
            department: r.department || null,
            total_hours: Number(r.total_hours || 0),
            request_count: Number(r.request_count || 0),
          })),
        }, { timeout: 3000 });
        mlPredictions = mlResp.data;
      } catch (mlErr) {
        console.warn('[AI] Python microservice unavailable, using rule-based fallback:', mlErr.message);
      }

      // Use ML predictions if available, else fall back to rule-based
      const turnoverRisks = mlPredictions
        ? mlPredictions.attrition_risks
        : turnoverRows.map((row) => ({
            ...row,
            risk_score: Number(row.risk_score || 0),
            risk_band: riskBand(Number(row.risk_score || 0)),
            insight: insightForRisk(row),
          }));

      const mlOt = mlPredictions ? mlPredictions.ot_forecast : null;
      const finalNextWeekForecast = mlOt ? mlOt.next_week_forecast : Number(nextWeekForecast.toFixed(2));
      const finalDirection = mlOt
        ? mlOt.direction
        : currentWeekHours > priorWeekHours ? 'Increasing' : currentWeekHours < priorWeekHours ? 'Decreasing' : 'Stable';

      return res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        mlPowered: !!mlPredictions,
        summary: {
          scheduledDays: Number(attendanceSummary.scheduled_days || 0),
          absentDays: Number(attendanceSummary.absent_days || 0),
          lateDays: Number(attendanceSummary.late_days || 0),
          incompleteDays: Number(attendanceSummary.incomplete_days || 0),
          absenceRate: Number(attendanceSummary.absence_rate || 0),
          tardinessRate: Number(attendanceSummary.tardiness_rate || 0),
          totalOtHours: Number(totalOtHours.toFixed(2)),
          nextWeekOtForecast: finalNextWeekForecast,
          highTurnoverRisks: turnoverRisks.filter((row) => row.risk_band === 'High').length
        },
        tardinessPatterns: tardinessRows,
        absencePatterns: absenceDepartmentRows,
        turnoverRisks,
        overtimePatterns: overtimeRows,
        forecast: {
          currentWeekHours: mlOt ? mlOt.current_week_hours : Number(currentWeekHours.toFixed(2)),
          priorWeekHours: mlOt ? mlOt.prior_week_hours : Number(priorWeekHours.toFixed(2)),
          weeklyAverage: mlOt ? mlOt.weekly_average : Number(weeklyAverage.toFixed(2)),
          nextWeekHours: finalNextWeekForecast,
          direction: finalDirection,
        }
      });
    } catch (err) {
      console.error('AI analytics error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });
};
