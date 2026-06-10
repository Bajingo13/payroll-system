async function ensureNotificationsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP NULL,
      PRIMARY KEY (notification_id),
      KEY idx_notif_user (user_id),
      KEY idx_notif_is_read (is_read)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

async function createNotification(pool, userId, type, title, message) {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureNotificationsTable(conn);
    await conn.execute(
      'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
      [userId, type, title, message]
    );
    console.log(`[Notification] Created for user_id=${userId} type=${type}`);
  } catch (err) {
    console.error('[Notification] createNotification error:', err.message);
  } finally {
    if (conn) conn.release();
  }
}

async function createNotificationsForAdminHr(pool, type, title, message) {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureNotificationsTable(conn);
    const [adminUsers] = await conn.execute(`
      SELECT user_id, role FROM users
      WHERE (LOWER(role) LIKE '%admin%' OR LOWER(role) LIKE '%hr%' OR LOWER(role) LIKE '%human resource%')
        AND (account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated','deleted'))
      LIMIT 100
    `);
    console.log(`[Notification] Admin/HR targets for type=${type}:`, adminUsers.map(u => u.user_id));
    for (const u of adminUsers) {
      await conn.execute(
        'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
        [u.user_id, type, title, message]
      );
    }
    console.log(`[Notification] Inserted ${adminUsers.length} admin/hr notifications for type=${type}`);
  } catch (err) {
    console.error('[Notification] createNotificationsForAdminHr error:', err.message);
  } finally {
    if (conn) conn.release();
  }
}

async function createNotificationsForAllUsers(pool, type, title, message) {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureNotificationsTable(conn);
    const [allUsers] = await conn.execute(`
      SELECT user_id FROM users
      WHERE account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated','deleted')
      LIMIT 1000
    `);
    console.log(`[Notification] All-users targets for type=${type}: ${allUsers.length} users`);
    for (const u of allUsers) {
      await conn.execute(
        'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
        [u.user_id, type, title, message]
      );
    }
  } catch (err) {
    console.error('[Notification] createNotificationsForAllUsers error:', err.message);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  ensureNotificationsTable,
  createNotification,
  createNotificationsForAdminHr,
  createNotificationsForAllUsers
};
