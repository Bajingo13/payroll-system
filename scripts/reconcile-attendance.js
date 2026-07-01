require('dotenv').config();

const mysql = require('mysql2/promise');

async function main() {
  const apply = process.argv.includes('--apply');
  const conn = await mysql.createConnection({
    host: process.env.LOCAL_DB_HOST || '127.0.0.1',
    port: Number(process.env.LOCAL_DB_PORT || 3306),
    user: process.env.LOCAL_DB_USER || 'root',
    password: process.env.LOCAL_DB_PASSWORD || '',
    database: process.env.LOCAL_DB_NAME || 'payroll_system',
    dateStrings: true
  });

  try {
    const [summary] = await conn.query(`
      WITH employee_hire_dates AS (
        SELECT employee_id, MIN(date_hired) AS date_hired
        FROM employee_employment
        WHERE date_hired IS NOT NULL
        GROUP BY employee_id
      ),
      clock_logs AS (
        SELECT
          COALESCE(e_code.employee_id, e_name.employee_id) AS employee_id,
          DATE(al.log_time) AS attendance_date,
          MIN(CASE WHEN al.action = 'Employee Time In' THEN TIME(al.log_time) END) AS time_in,
          MAX(CASE WHEN al.action = 'Employee Time Out' THEN TIME(al.log_time) END) AS time_out
        FROM audit_logs al
        JOIN users u ON u.user_id = al.user_id
        LEFT JOIN employees e_code
          ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
        LEFT JOIN employees e_name
          ON e_code.employee_id IS NULL
         AND LOWER(TRIM(CONCAT(e_name.first_name, ' ', e_name.last_name))) = LOWER(TRIM(u.full_name))
        WHERE al.action IN ('Employee Time In', 'Employee Break Out', 'Employee Break In', 'Employee Time Out')
        GROUP BY COALESCE(e_code.employee_id, e_name.employee_id), DATE(al.log_time)
      )
      SELECT
        (SELECT COUNT(*) FROM hris_attendance) AS cached_rows,
        (SELECT COUNT(*) FROM clock_logs WHERE employee_id IS NOT NULL) AS system_days,
        (SELECT COUNT(*)
           FROM hris_attendance ha
           JOIN employee_hire_dates ehd ON ehd.employee_id = ha.employee_id
          WHERE ha.attendance_date < ehd.date_hired) AS before_hire_rows,
        (SELECT COUNT(*)
           FROM hris_attendance ha
           JOIN employees e ON e.employee_id = ha.employee_id
           JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(e.emp_code))
          WHERE LOWER(TRIM(u.role)) <> 'employee'
            AND LOWER(TRIM(ha.status)) = 'absent') AS non_employee_absent_rows,
        (SELECT COUNT(*)
           FROM audit_logs al
           JOIN users u ON u.user_id = al.user_id
           LEFT JOIN employees e_code
             ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
           LEFT JOIN employees e_name
             ON e_code.employee_id IS NULL
            AND LOWER(TRIM(CONCAT(e_name.first_name, ' ', e_name.last_name))) = LOWER(TRIM(u.full_name))
           JOIN employee_hire_dates ehd
             ON ehd.employee_id = COALESCE(e_code.employee_id, e_name.employee_id)
          WHERE al.action IN ('Employee Time In', 'Employee Break Out', 'Employee Break In', 'Employee Time Out')
            AND DATE(al.log_time) < ehd.date_hired) AS before_hire_clock_rows,
        (SELECT COUNT(*)
           FROM hris_attendance ha
           JOIN clock_logs cl
             ON cl.employee_id = ha.employee_id
            AND cl.attendance_date = ha.attendance_date
          WHERE NOT (ha.time_in <=> cl.time_in)
             OR NOT (ha.time_out <=> cl.time_out)) AS stale_cached_rows,
        (SELECT MIN(ehd.date_hired) FROM employee_hire_dates ehd) AS earliest_hire_date,
        (SELECT MIN(attendance_date) FROM clock_logs WHERE employee_id IS NOT NULL) AS earliest_system_attendance,
        (SELECT MAX(attendance_date) FROM clock_logs WHERE employee_id IS NOT NULL) AS latest_system_attendance
    `);

    const report = summary[0];
    let deletedBeforeHire = 0;
    let deletedBeforeHireClock = 0;
    let deletedNonEmployeeAbsences = 0;
    let deletedStaleCache = 0;

    if (apply) {
      await conn.beginTransaction();
      try {
        const [beforeHire] = await conn.query(`
          DELETE ha
          FROM hris_attendance ha
          JOIN (
            SELECT employee_id, MIN(date_hired) AS date_hired
            FROM employee_employment
            WHERE date_hired IS NOT NULL
            GROUP BY employee_id
          ) ehd ON ehd.employee_id = ha.employee_id
          WHERE ha.attendance_date < ehd.date_hired
        `);
        deletedBeforeHire = beforeHire.affectedRows;

        const [nonEmployeeAbsences] = await conn.query(`
          DELETE ha
          FROM hris_attendance ha
          JOIN employees e ON e.employee_id = ha.employee_id
          JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(e.emp_code))
          WHERE LOWER(TRIM(u.role)) <> 'employee'
            AND LOWER(TRIM(ha.status)) = 'absent'
        `);
        deletedNonEmployeeAbsences = nonEmployeeAbsences.affectedRows;

        const [beforeHireClock] = await conn.query(`
          DELETE al
          FROM audit_logs al
          JOIN users u ON u.user_id = al.user_id
          LEFT JOIN employees e_code
            ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
          LEFT JOIN employees e_name
            ON e_code.employee_id IS NULL
           AND LOWER(TRIM(CONCAT(e_name.first_name, ' ', e_name.last_name))) = LOWER(TRIM(u.full_name))
          JOIN (
            SELECT employee_id, MIN(date_hired) AS date_hired
            FROM employee_employment
            WHERE date_hired IS NOT NULL
            GROUP BY employee_id
          ) ehd ON ehd.employee_id = COALESCE(e_code.employee_id, e_name.employee_id)
          WHERE al.action IN ('Employee Time In', 'Employee Break Out', 'Employee Break In', 'Employee Time Out')
            AND DATE(al.log_time) < ehd.date_hired
        `);
        deletedBeforeHireClock = beforeHireClock.affectedRows;

        const [stale] = await conn.query(`
          DELETE ha
          FROM hris_attendance ha
          JOIN (
            SELECT
              COALESCE(e_code.employee_id, e_name.employee_id) AS employee_id,
              DATE(al.log_time) AS attendance_date,
              MIN(CASE WHEN al.action = 'Employee Time In' THEN TIME(al.log_time) END) AS time_in,
              MAX(CASE WHEN al.action = 'Employee Time Out' THEN TIME(al.log_time) END) AS time_out
            FROM audit_logs al
            JOIN users u ON u.user_id = al.user_id
            LEFT JOIN employees e_code
              ON LOWER(TRIM(e_code.emp_code)) = LOWER(TRIM(u.username))
            LEFT JOIN employees e_name
              ON e_code.employee_id IS NULL
             AND LOWER(TRIM(CONCAT(e_name.first_name, ' ', e_name.last_name))) = LOWER(TRIM(u.full_name))
            WHERE al.action IN ('Employee Time In', 'Employee Break Out', 'Employee Break In', 'Employee Time Out')
            GROUP BY COALESCE(e_code.employee_id, e_name.employee_id), DATE(al.log_time)
          ) cl
            ON cl.employee_id = ha.employee_id
           AND cl.attendance_date = ha.attendance_date
          WHERE NOT (ha.time_in <=> cl.time_in)
             OR NOT (ha.time_out <=> cl.time_out)
        `);
        deletedStaleCache = stale.affectedRows;
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      ...report,
      deleted_before_hire: deletedBeforeHire,
      deleted_before_hire_clock: deletedBeforeHireClock,
      deleted_non_employee_absences: deletedNonEmployeeAbsences,
      deleted_stale_cache: deletedStaleCache
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
