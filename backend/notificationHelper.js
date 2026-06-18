const https = require('https');

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

// Send a real Expo push notification to a device token (fire-and-forget)
function sendExpoPush(pushToken, title, body, data = {}) {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return;

  const payload = JSON.stringify({
    to: pushToken,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  });

  const options = {
    hostname: 'exp.host',
    path: '/api/v2/push/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
  };

  const req = https.request(options, (res) => {
    let raw = '';
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(raw);
        if (json?.data?.status === 'error') {
          console.warn('[Push] Expo error:', json.data.message);
        }
      } catch (_) {}
    });
  });
  req.on('error', (err) => console.warn('[Push] Request error:', err.message));
  req.write(payload);
  req.end();
}

// Get push token for a user
async function getUserPushToken(conn, userId) {
  try {
    const [rows] = await conn.execute(
      'SELECT push_token FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0]?.push_token || null;
  } catch (_) { return null; }
}

function emitUnreadCount(userId, pool) {
  if (!global._io) return;
  pool.getConnection()
    .then((conn) => conn.execute(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    ).then(([rows]) => {
      global._io.to(`user_${userId}`).emit('notification_count', Number(rows[0]?.cnt || 0));
      conn.release();
    }).catch(() => conn.release()))
    .catch(() => {});
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
    // Send real push notification
    const token = await getUserPushToken(conn, userId);
    sendExpoPush(token, title, message, { type });
    console.log(`[Notification] Created for user_id=${userId} type=${type}`);
    // Emit real-time count update via Socket.io
    emitUnreadCount(userId, pool);
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
      SELECT user_id, push_token FROM users
      WHERE (LOWER(role) LIKE '%admin%' OR LOWER(role) LIKE '%hr%' OR LOWER(role) LIKE '%human resource%')
        AND (account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated','deleted'))
      LIMIT 100
    `);
    for (const u of adminUsers) {
      await conn.execute(
        'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
        [u.user_id, type, title, message]
      );
      sendExpoPush(u.push_token, title, message, { type });
      emitUnreadCount(u.user_id, pool);
    }
    console.log(`[Notification] Sent to ${adminUsers.length} admin/hr users for type=${type}`);
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
      SELECT user_id, push_token FROM users
      WHERE account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated','deleted')
      LIMIT 1000
    `);
    for (const u of allUsers) {
      await conn.execute(
        'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
        [u.user_id, type, title, message]
      );
      sendExpoPush(u.push_token, title, message, { type });
    }
    console.log(`[Notification] Sent to ${allUsers.length} users for type=${type}`);
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
  createNotificationsForAllUsers,
};
