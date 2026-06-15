require('dotenv').config();

const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST,
    port: process.env.LOCAL_DB_PORT || process.env.DB_PORT,
    user: process.env.LOCAL_DB_USER || process.env.DB_USER,
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME,
  });

  const [[run]] = await conn.query(
    `SELECT run_id, group_id, period_id, month_id, year_id, payroll_range
     FROM payroll_runs
     WHERE run_id = 34`
  );
  console.log(JSON.stringify(run, null, 2));
  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
