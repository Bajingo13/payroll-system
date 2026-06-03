// ----------- USER AUTHENTICATION -----------
const bcrypt = require('bcryptjs');

module.exports = function (app, pool) {
  console.log('AUTH ROUTES LOADED: login.js (password-route-v3)');
  // LOGIN
  app.post('/api/login', async (req, res) => {
    console.log('LOGIN API HIT:', req.body?.username);

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    let conn;

    try {
      conn = await pool.getConnection();
      console.log('LOGIN DB CONNECTION OK');

      const [rows] = await conn.execute(
        'SELECT * FROM users WHERE username = ? LIMIT 1',
        [username]
      );

      console.log('LOGIN USER ROWS:', rows.length);

      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.'
        });
      }

      const user = rows[0];
      const storedPassword = user.password || '';

      const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2x$', '$2y$'];
      const isBcrypt = BCRYPT_PREFIXES.some((prefix) =>
        storedPassword.startsWith(prefix)
      );

      const passwordMatch = isBcrypt
        ? await bcrypt.compare(password, storedPassword)
        : storedPassword === password;

      console.log('LOGIN PASSWORD MATCH:', passwordMatch);

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.'
        });
      }

      req.session.user = {
        user_id: user.user_id,
        full_name: user.full_name,
        role: user.role
      };

      // Do not let audit_logs block login.
      try {
        await conn.execute(
          'INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)',
          [user.user_id, user.full_name, 'Admin Login', 'Success']
        );
        console.log('LOGIN AUDIT LOG INSERTED');
      } catch (auditErr) {
        console.error('LOGIN AUDIT LOG ERROR:', auditErr.message);
      }

      console.log('LOGIN SENDING RESPONSE');

      return res.json({
        success: true,
        user_id: user.user_id,
        full_name: user.full_name,
        role: user.role
      });
    } catch (err) {
      console.error('LOGIN ERROR:', err);

      return res.status(500).json({
        success: false,
        message: err.message || 'Server error.'
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // LOGOUT
  app.post('/api/logout', (req, res) => {
    if (!req.session) {
      return res.json({ success: true });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error('LOGOUT ERROR:', err);
        return res.status(500).json({
          success: false,
          message: 'Unable to sign out.'
        });
      }

      res.clearCookie('connect.sid');
      return res.json({ success: true });
    });
  });

  // CHANGE OWN PASSWORD
  app.put('/api/user/password', async (req, res) => {
    const body = req.body || {};
    const parseUserId = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };

    const sessionUserId = Number(
      req.session?.user?.user_id ||
      req.session?.user?.id ||
      req.session?.user_id ||
      0
    );
    const requestUserId = parseUserId(
      body.user_id ||
      body.userId ||
      req.query?.user_id ||
      req.query?.userId ||
      req.headers['x-user-id'] ||
      req.headers['x-userid'] ||
      0
    );
    let userId = sessionUserId || requestUserId;
    const requestFullName = String(
      body.full_name ||
      body.fullName ||
      req.session?.user?.full_name ||
      ''
    ).trim();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (sessionUserId && requestUserId && sessionUserId !== requestUserId) {
      return res.status(403).json({
        success: false,
        message: 'Session user does not match the requested account.'
      });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password, new password, and confirmation are required.'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation do not match.'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters.'
      });
    }

    let conn;

    try {
      conn = await pool.getConnection();

      if (!userId && requestFullName) {
        const [userLookupRows] = await conn.execute(
          'SELECT user_id FROM users WHERE TRIM(full_name) = TRIM(?) ORDER BY user_id DESC LIMIT 1',
          [requestFullName]
        );
        userId = Number(userLookupRows?.[0]?.user_id || 0);
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Please sign in again before changing your password.'
        });
      }

      const [rows] = await conn.execute(
        'SELECT user_id, password FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: 'User account was not found.'
        });
      }

      const storedPassword = rows[0].password || '';
      const bcryptPrefixes = ['$2a$', '$2b$', '$2x$', '$2y$'];
      const isBcrypt = bcryptPrefixes.some((prefix) => storedPassword.startsWith(prefix));
      const passwordMatch = isBcrypt
        ? await bcrypt.compare(currentPassword, storedPassword)
        : storedPassword === currentPassword;

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect.'
        });
      }

      const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
      const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds);

      await conn.execute(
        'UPDATE users SET password = ? WHERE user_id = ?',
        [hashedPassword, userId]
      );

      return res.json({
        success: true,
        message: 'Password changed successfully.'
      });
    } catch (err) {
      console.error('CHANGE PASSWORD ERROR:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Unable to change password.'
      });
    } finally {
      if (conn) conn.release();
    }
  });

  // REGISTER
  app.post('/api/register', async (req, res) => {
    console.log('REGISTER API HIT:', req.body?.username);

    const { username, password, full_name, role } = req.body;

    if (!username || !password || !full_name || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    const ALLOWED_ROLES = ['Employee', 'HR', 'Admin'];

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      });
    }

    let conn;

    try {
      conn = await pool.getConnection();

      const [existing] = await conn.execute(
        'SELECT user_id FROM users WHERE username = ? LIMIT 1',
        [username]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Username already exists.'
        });
      }

      const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const [result] = await conn.execute(
        'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
        [username, hashedPassword, full_name, role]
      );

      return res.json({
        success: true,
        user_id: result.insertId,
        message: 'Registration successful.'
      });
    } catch (err) {
      console.error('REGISTER ERROR:', err);

      return res.status(500).json({
        success: false,
        message: err.message || 'Server error.'
      });
    } finally {
      if (conn) conn.release();
    }
  });
};
