const { ensureNotificationsTable, createNotification } = require('./notificationHelper');

module.exports = function (app, pool) {

  // Debug endpoint — visit /api/notifications/test?user_id=X to insert a test notification
  app.get('/api/notifications/test', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) return res.status(400).json({ success: false, message: 'Pass ?user_id=X' });
    try {
      await createNotification(pool, userId, 'test', 'Test Notification', 'This is a test notification inserted directly.');
      let conn;
      try {
        conn = await pool.getConnection();
        const [rows] = await conn.execute(
          'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]
        );
        return res.json({ success: true, message: 'Test notification inserted.', rows });
      } finally {
        if (conn) conn.release();
      }
    } catch (err) {
      console.error('[Notification] test endpoint error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/notifications', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) return res.status(400).json({ success: false, message: 'Missing user_id' });

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureNotificationsTable(conn);

      const [rows] = await conn.execute(
        `SELECT notification_id, type, title, message, is_read, created_at, read_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );

      const [countRow] = await conn.execute(
        'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
        [userId]
      );

      return res.json({
        success: true,
        notifications: rows,
        unread_count: Number((countRow[0] || {}).unread_count || 0)
      });
    } catch (err) {
      console.error('Get notifications error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.patch('/api/notifications/read-all', async (req, res) => {
    const userId = Number(req.body.user_id);
    if (!userId) return res.status(400).json({ success: false, message: 'Missing user_id' });

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute(
        'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
        [userId]
      );
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.patch('/api/notifications/:id/read', async (req, res) => {
    const notifId = Number(req.params.id);
    const userId = Number(req.body.user_id);
    if (!notifId || !userId) return res.status(400).json({ success: false, message: 'Missing required fields' });

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute(
        'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE notification_id = ? AND user_id = ?',
        [notifId, userId]
      );
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });
};
