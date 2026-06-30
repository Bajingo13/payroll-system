const session = require('express-session');

class MySqlSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        session_id VARCHAR(128) PRIMARY KEY,
        session_data LONGTEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_app_sessions_expires (expires_at)
      ) ENGINE=InnoDB
    `);
    await this.pool.query('DELETE FROM app_sessions WHERE expires_at <= NOW()');
  }

  get(sid, callback) {
    this.pool.query(
      'SELECT session_data FROM app_sessions WHERE session_id = ? AND expires_at > NOW() LIMIT 1',
      [sid]
    ).then(([rows]) => callback(null, rows[0] ? JSON.parse(rows[0].session_data) : null))
      .catch(callback);
  }

  set(sid, value, callback = () => {}) {
    const expiresAt = value?.cookie?.expires
      ? new Date(value.cookie.expires)
      : new Date(Date.now() + 15 * 60 * 1000);
    this.pool.query(
      `INSERT INTO app_sessions (session_id, session_data, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE session_data = VALUES(session_data), expires_at = VALUES(expires_at)`,
      [sid, JSON.stringify(value), expiresAt]
    ).then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.pool.query('DELETE FROM app_sessions WHERE session_id = ?', [sid])
      .then(() => callback(null)).catch(callback);
  }

  touch(sid, value, callback = () => {}) {
    const expiresAt = value?.cookie?.expires
      ? new Date(value.cookie.expires)
      : new Date(Date.now() + 15 * 60 * 1000);
    this.pool.query('UPDATE app_sessions SET expires_at = ? WHERE session_id = ?', [expiresAt, sid])
      .then(() => callback(null)).catch(callback);
  }
}

module.exports = MySqlSessionStore;
