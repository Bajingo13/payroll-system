// ----------- USER AUTHENTICATION -----------
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

module.exports = function (app, pool) {
  console.log('AUTH ROUTES LOADED: login.js (password-route-v3)');

  let passwordResetTransporter = null;

  function getPasswordResetMailConfig() {
    const user = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.MAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.SMTP_PASS || process.env.MAIL_PASS;
    if (!user || !pass) return null;
    return {
      user,
      pass,
      from: {
        name: process.env.MAIL_FROM_NAME || 'Astreablue Intelligence Inc.',
        address: user
      }
    };
  }

  function getPasswordResetTransporter() {
    const config = getPasswordResetMailConfig();
    if (!config) return null;
    if (!passwordResetTransporter) {
      passwordResetTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.user, pass: config.pass }
      });
    }
    return passwordResetTransporter;
  }

  async function ensurePasswordResetTable(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        reset_id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        email VARCHAR(150) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (reset_id),
        UNIQUE KEY uq_password_reset_token_hash (token_hash),
        KEY idx_password_reset_user (user_id),
        KEY idx_password_reset_expires (expires_at),
        CONSTRAINT fk_password_reset_user
          FOREIGN KEY (user_id) REFERENCES users (user_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async function ensureUserAccountColumns(conn) {
    const [columns] = await conn.execute(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('account_status', 'deactivated_at', 'deleted_at', 'email')`
    );
    const existing = new Set(columns.map((column) => column.COLUMN_NAME));

    if (!existing.has('account_status')) {
      await conn.execute("ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'Active'");
    }
    if (!existing.has('deactivated_at')) {
      await conn.execute('ALTER TABLE users ADD COLUMN deactivated_at DATETIME NULL');
    }
    if (!existing.has('deleted_at')) {
      await conn.execute('ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL');
    }
    if (!existing.has('email')) {
      await conn.execute('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL DEFAULT NULL');
      // Pre-populate from employee_contacts for existing users who have a matching employee record
      await conn.execute(`
        UPDATE users u
        JOIN employees e ON LOWER(TRIM(e.emp_code)) = LOWER(TRIM(u.username))
        JOIN employee_contacts ec ON ec.employee_id = e.employee_id
          AND ec.email IS NOT NULL AND ec.email != ''
        SET u.email = ec.email
        WHERE u.email IS NULL
      `).catch(() => {});
    }
  }

  async function findUserByResetUsername(conn, username) {
    const [rows] = await conn.execute(
      `SELECT u.user_id, u.username, u.full_name, ec.email
       FROM users u
       LEFT JOIN employees e ON
         LOWER(TRIM(e.emp_code)) = LOWER(TRIM(u.username))
         OR LOWER(TRIM(CONCAT_WS(' ', e.first_name, e.last_name))) = LOWER(TRIM(u.full_name))
       LEFT JOIN employee_contacts ec ON ec.contact_id = (
         SELECT c.contact_id
         FROM employee_contacts c
         WHERE c.employee_id = e.employee_id
           AND TRIM(COALESCE(c.email, '')) <> ''
         ORDER BY c.contact_id DESC
         LIMIT 1
       )
       WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(?))
       LIMIT 1`,
      [username]
    );
    return rows[0] || null;
  }

  function escapeMailHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isRunningOnRailway() {
    return (
      !!process.env.RAILWAY_ENVIRONMENT ||
      !!process.env.RAILWAY_PROJECT_ID ||
      !!process.env.RAILWAY_SERVICE_ID ||
      !!process.env.RAILWAY_PUBLIC_DOMAIN
    );
  }

  function normalizePublicBaseUrl(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';
    const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

    try {
      const url = new URL(withProtocol);
      return `${url.protocol}//${url.host}`.replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  function getRequestBaseUrl(req) {
    const host = String(req?.get?.('host') || '').trim();
    if (!host) return '';

    const forwardedProto = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim();
    const protocol = forwardedProto || req?.protocol || (isRunningOnRailway() ? 'https' : 'http');
    return normalizePublicBaseUrl(`${protocol}://${host}`);
  }

  function getPasswordResetBaseUrl(req) {
    const configuredBaseUrl = normalizePublicBaseUrl(
      process.env.APP_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.FRONTEND_URL ||
      process.env.CLIENT_URL ||
      process.env.SITE_URL
    );
    if (configuredBaseUrl) return configuredBaseUrl;

    const railwayBaseUrl = normalizePublicBaseUrl(process.env.RAILWAY_PUBLIC_DOMAIN);
    if (railwayBaseUrl) return railwayBaseUrl;

    const requestBaseUrl = getRequestBaseUrl(req);
    if (requestBaseUrl) return requestBaseUrl;

    if (isRunningOnRailway()) {
      throw new Error('Public app URL is not configured. Set APP_BASE_URL to your Railway app URL.');
    }

    return 'http://localhost:12687';
  }

  async function sendPasswordResetEmail(user, token, req) {
    const config = getPasswordResetMailConfig();
    const transporter = getPasswordResetTransporter();
    if (!config || !transporter) {
      console.warn('Password reset email skipped: SMTP credentials are not configured.');
      return false;
    }

    const baseUrl = getPasswordResetBaseUrl(req);
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const escapedResetUrl = escapeMailHtml(resetUrl);
    const recipient = String(user.email || '').trim();
    const displayName = escapeMailHtml(user.full_name || user.username || 'there');

    await transporter.sendMail({
      from: config.from,
      to: recipient,
      subject: 'Password reset request',
      text: [
        `Hi ${user.full_name || user.username || 'there'},`,
        '',
        'We received a request to reset your Astreablue Intelligence Inc. HRIS & Payroll System password.',
        `Open this link to set a new password: ${resetUrl}`,
        '',
        'This link expires in 30 minutes. If you did not request this, you can ignore this email.',
        '',
        'Astreablue Intelligence Inc. HRIS & Payroll System'
      ].join('\n'),
      html: `
        <p>Hi ${displayName},</p>
        <p>We received a request to reset your Astreablue Intelligence Inc. HRIS & Payroll System password.</p>
        <p><a href="${escapedResetUrl}">Set a new password</a></p>
        <p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
        <p>Astreablue Intelligence Inc. HRIS & Payroll System</p>
      `
    });

    return true;
  }
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
      await ensureUserAccountColumns(conn);
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
      const accountStatus = String(user.account_status || 'Active').trim();
      if (accountStatus !== 'Active') {
        return res.status(403).json({
          success: false,
          message: accountStatus === 'Deleted'
            ? 'This account has been deleted. Please contact Admin or HR.'
            : 'This account is deactivated. Please contact Admin or HR.'
        });
      }

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

  app.post('/api/password-reset/request', async (req, res) => {
    const username = String(req.body?.username || '').trim();

    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    let conn;

    try {
      conn = await pool.getConnection();
      await ensurePasswordResetTable(conn);

      const user = await findUserByResetUsername(conn, username);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Username was not found.' });
      }

      const email = String(user.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'This username has no linked employee email. Please add an email to the employee contact record first.'
        });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await conn.execute(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = ? AND used_at IS NULL`,
        [user.user_id]
      );

      await conn.execute(
        `INSERT INTO password_reset_tokens (user_id, token_hash, email, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
        [user.user_id, tokenHash, email]
      );

      const emailSent = await sendPasswordResetEmail(user, rawToken, req);
      if (!emailSent) {
        return res.status(500).json({
          success: false,
          message: 'Email service is not configured. Please check the Gmail account and app password.'
        });
      }

      return res.json({ success: true, message: `Password reset instructions were sent to ${email}.` });
    } catch (err) {
      console.error('PASSWORD RESET REQUEST ERROR:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Unable to request password reset.'
      });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/password-reset/confirm', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Reset token, new password, and confirmation are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation do not match.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    let conn;
    let transactionStarted = false;

    try {
      conn = await pool.getConnection();
      await ensurePasswordResetTable(conn);

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await conn.beginTransaction();
      transactionStarted = true;

      const [rows] = await conn.execute(
        `SELECT prt.reset_id, prt.user_id, u.username
         FROM password_reset_tokens prt
         INNER JOIN users u ON u.user_id = prt.user_id
         WHERE prt.token_hash = ?
           AND prt.used_at IS NULL
           AND prt.expires_at > NOW()
         LIMIT 1`,
        [tokenHash]
      );

      if (!rows.length) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(400).json({ success: false, message: 'This password reset link is invalid or expired.' });
      }

      const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
      const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds);

      const [updateResult] = await conn.execute(
        'UPDATE users SET password = ? WHERE user_id = ?',
        [hashedPassword, rows[0].user_id]
      );

      if (updateResult.affectedRows !== 1) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(404).json({ success: false, message: 'User account was not found. Password was not reset.' });
      }

      const [verifyRows] = await conn.execute(
        'SELECT password FROM users WHERE user_id = ? LIMIT 1',
        [rows[0].user_id]
      );
      const savedPassword = String(verifyRows?.[0]?.password || '');
      const savedPasswordMatches = savedPassword
        ? await bcrypt.compare(newPassword, savedPassword)
        : false;

      if (!savedPasswordMatches) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(500).json({ success: false, message: 'Password reset could not be saved. Please try again.' });
      }

      await conn.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE reset_id = ?', [rows[0].reset_id]);
      await conn.commit();
      transactionStarted = false;

      console.log('PASSWORD RESET SAVED FOR USER:', rows[0].username || rows[0].user_id);

      return res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
      if (conn && transactionStarted) await conn.rollback().catch(() => {});
      console.error('PASSWORD RESET CONFIRM ERROR:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Unable to reset password.'
      });
    } finally {
      if (conn) conn.release();
    }
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

  app.get('/api/user/email', async (req, res) => {
    const userId = Number(req.session?.user?.user_id || req.query?.user_id || 0);
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated.' });

    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT email FROM users WHERE user_id = ? LIMIT 1', [userId]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
      res.json({ success: true, email: rows[0].email || '' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/user/email', async (req, res) => {
    const userId = Number(req.session?.user?.user_id || req.body?.user_id || 0);
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute('UPDATE users SET email = ? WHERE user_id = ?', [email || null, userId]);
      if (req.session?.user) req.session.user.email = email || null;
      res.json({ success: true, message: 'Email updated successfully.', email: email || null });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Server error.' });
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
      await ensureUserAccountColumns(conn);

      const [result] = await conn.execute(
        "INSERT INTO users (username, password, full_name, role, account_status) VALUES (?, ?, ?, ?, 'Active')",
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
