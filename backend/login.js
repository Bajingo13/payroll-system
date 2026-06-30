// ----------- USER AUTHENTICATION -----------
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const https  = require('https');
const nodemailer = require('nodemailer');
const { buildEmail } = require('./emailTemplate');
const { createNotificationsForAdminHr } = require('./notificationHelper');

const MAX_ATTEMPTS = 3;
const OTP_EXPIRY_MINUTES = Number(process.env.LOGIN_OTP_EXPIRY_MINUTES || 5);
const OTP_SEND_TIMEOUT_MS = Number(process.env.LOGIN_OTP_SEND_TIMEOUT_MS || 15000);

module.exports = function (app, pool) {
  console.log('AUTH ROUTES LOADED: login.js (2fa-v1)');

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function safeAddCol(conn, table, column, def) {
    try { await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`); }
    catch (e) { if (e.errno !== 1060) throw e; }
  }

  async function ensureAuthTables(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        reset_id   INT NOT NULL AUTO_INCREMENT,
        user_id    INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        email      VARCHAR(150) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at    DATETIME NULL DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (reset_id),
        UNIQUE KEY uq_password_reset_token_hash (token_hash),
        KEY idx_password_reset_user (user_id),
        KEY idx_password_reset_expires (expires_at),
        CONSTRAINT fk_password_reset_user
          FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS login_otp (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        otp_hash     VARCHAR(64) NOT NULL,
        expires_at   DATETIME NOT NULL,
        used_at      DATETIME NULL,
        otp_attempts INT NOT NULL DEFAULT 0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_otp_user    (user_id),
        KEY idx_otp_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // users table extensions
    const [cols] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('account_status','deactivated_at','deleted_at','email',
                             'failed_attempts','locked_at','phone','is_temp_password')`
    );
    const existing = new Set(cols.map(c => c.COLUMN_NAME));

    if (!existing.has('account_status'))   await conn.execute("ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'Active'");
    if (!existing.has('deactivated_at'))   await conn.execute('ALTER TABLE users ADD COLUMN deactivated_at DATETIME NULL');
    if (!existing.has('deleted_at'))       await conn.execute('ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL');
    if (!existing.has('email'))            await conn.execute('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL DEFAULT NULL');
    if (!existing.has('failed_attempts'))  await conn.execute('ALTER TABLE users ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0');
    if (!existing.has('locked_at'))        await conn.execute('ALTER TABLE users ADD COLUMN locked_at DATETIME NULL');
    if (!existing.has('phone'))            await conn.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL');
    if (!existing.has('is_temp_password')) await conn.execute('ALTER TABLE users ADD COLUMN is_temp_password TINYINT(1) NOT NULL DEFAULT 0');

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS account_unlock_requests (
        request_id    INT NOT NULL AUTO_INCREMENT,
        user_id       INT NOT NULL,
        username      VARCHAR(100) NOT NULL,
        full_name     VARCHAR(150) NULL,
        reason        TEXT NULL,
        status        VARCHAR(20) NOT NULL DEFAULT 'pending',
        requested_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at   DATETIME NULL,
        resolved_by   VARCHAR(150) NULL,
        PRIMARY KEY (request_id),
        KEY idx_unlock_req_user   (user_id),
        KEY idx_unlock_req_status (status),
        CONSTRAINT fk_unlock_req_user
          FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Back-fill email from employee_contacts for existing users
    await conn.execute(`
      UPDATE users u
      JOIN employees e ON LOWER(TRIM(e.emp_code)) = LOWER(TRIM(u.username))
      JOIN employee_contacts ec ON ec.employee_id = e.employee_id
        AND ec.email IS NOT NULL AND ec.email != ''
      SET u.email = ec.email
      WHERE u.email IS NULL
    `).catch(() => {});

    // Back-fill phone from employee_contacts
    await conn.execute(`
      UPDATE users u
      JOIN employees e ON LOWER(TRIM(e.emp_code)) = LOWER(TRIM(u.username))
      JOIN employee_contacts ec ON ec.employee_id = e.employee_id
        AND ec.mobile_number IS NOT NULL AND ec.mobile_number != ''
      SET u.phone = ec.mobile_number
      WHERE u.phone IS NULL
    `).catch(() => {});
  }

  // ── Mail transporter ────────────────────────────────────────────────────────

  let _transporter = null;
  function getMailConfig() {
    const user = process.env.GMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
    if (!user || !pass) return null;
    return { user, pass, from: { name: process.env.MAIL_FROM_NAME || 'Astreablue Intelligence Inc.', address: user } };
  }
  function getTransporter() {
    const cfg = getMailConfig();
    if (!cfg) return null;
    if (!_transporter) {
      _transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: OTP_SEND_TIMEOUT_MS,
        greetingTimeout: OTP_SEND_TIMEOUT_MS,
        socketTimeout: OTP_SEND_TIMEOUT_MS
      });
    }
    return _transporter;
  }

  // ── OTP helpers ─────────────────────────────────────────────────────────────

  function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
  }

  function hashOtp(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  function maskEmail(email) {
    const [local, domain] = String(email || '').split('@');
    if (!domain) return '***';
    const visible = local.length <= 2
      ? '*'.repeat(local.length)
      : local[0] + '*'.repeat(Math.min(local.length - 2, 4)) + local[local.length - 1];
    return `${visible}@${domain}`;
  }

  function maskPhone(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length >= 4 ? `***-***-${d.slice(-4)}` : '***';
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function getOtpEmail(user) {
    if (isValidEmail(user?.email)) return String(user.email).trim();

    // The bootstrap/system administrator may not be linked to an employee
    // contact. In that case, deliver its OTP to the explicitly configured
    // fallback, or to the system mailbox already used to send security mail.
    const role = String(user?.role || '').toLowerCase();
    const isPrivileged = role.includes('admin') || role.includes('human resource') || role === 'hr';
    if (!isPrivileged) return null;

    const fallback = process.env.LOGIN_OTP_FALLBACK_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER;
    return isValidEmail(fallback) ? String(fallback).trim() : null;
  }

  async function sendOtpEmail(user, otp) {
    const transporter = getTransporter();
    const cfg = getMailConfig();
    const recipient = getOtpEmail(user);
    if (!transporter || !cfg || !recipient) return false;
    try {
      await transporter.sendMail({
        from: cfg.from,
        to: recipient,
        subject: 'Your Login Verification Code — AstreaBlue HRIS',
        text: `Hi ${user.full_name || user.username},\n\nYour login verification code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\nDo not share this code with anyone.\n\nIf you did not attempt to log in, contact HR immediately.`,
        html: buildEmail({
          title:         'Login Verification Code',
          recipientName: user.full_name || user.username || 'there',
          intro:         'A login attempt was made for your AstreaBlue HRIS account. Use the verification code below to complete sign-in.',
          rows: [
            { label: 'Verification Code', value: `<strong style="font-size:1.5rem;letter-spacing:0.2em">${otp}</strong>`, isStatus: true },
            { label: 'Expires In',        value: `${OTP_EXPIRY_MINUTES} minutes` },
          ],
          closing: 'If you did not attempt to log in, contact your HR Administrator immediately and change your password.',
        }),
      });
      return true;
    } catch (e) {
      console.error('OTP email error:', e.message);
      return false;
    }
  }

  async function sendOtpSms(phone, otp) {
    const apiKey = process.env.SEMAPHORE_API_KEY;
    if (!apiKey || !phone) return false;
    const senderName = process.env.SEMAPHORE_SENDER_NAME || 'PAYROLL';
    const message = `AstreaBlue HRIS login code: ${otp}. Valid ${OTP_EXPIRY_MINUTES} min. Do not share.`;
    const postData = JSON.stringify({ apikey: apiKey, number: phone, message, sendername: senderName });
    return new Promise(resolve => {
      const req = https.request({
        hostname: 'api.semaphore.co', path: '/api/v4/messages', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
      }, res => resolve(res.statusCode >= 200 && res.statusCode < 300));
      req.on('error', () => resolve(false));
      req.setTimeout(OTP_SEND_TIMEOUT_MS, () => {
        req.destroy();
        resolve(false);
      });
      req.write(postData);
      req.end();
    });
  }

  // ── Temp password helpers ───────────────────────────────────────────────────

  function generateTempPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[crypto.randomInt(0, chars.length)]).join('');
  }

  async function sendTempPasswordEmail(user, tempPassword) {
    const transporter = getTransporter();
    const cfg = getMailConfig();
    if (!transporter || !cfg || !user.email) return false;
    try {
      await transporter.sendMail({
        from: cfg.from,
        to: String(user.email).trim(),
        subject: 'Your Account Has Been Unlocked — AstreaBlue HRIS',
        html: buildEmail({
          title:         'Account Unlocked',
          recipientName: user.full_name || user.username || 'there',
          intro:         'Your AstreaBlue HRIS account has been unlocked by an administrator. Use the temporary password below to log in. You will be required to change it upon next login.',
          rows: [
            { label: 'Username',           value: user.username },
            { label: 'Temporary Password', value: `<strong style="font-size:1.1rem;letter-spacing:0.1em">${tempPassword}</strong>`, isStatus: true },
          ],
          closing: 'For security, please change your password immediately after logging in.',
        }),
      });
      return true;
    } catch (e) {
      console.error('Temp password email error:', e.message);
      return false;
    }
  }

  // ── One-time DB init ────────────────────────────────────────────────────────

  const initReady = (async () => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureAuthTables(conn);
      console.log('OK > auth tables ready');
    } catch (e) {
      console.error('WARN > auth init failed:', e.message);
    } finally {
      if (conn) conn.release();
    }
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Verify credentials, send OTP
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/api/login', async (req, res) => {
    await initReady;
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [rows] = await conn.execute('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
      if (!rows.length) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      const user = rows[0];
      const status = String(user.account_status || 'Active').trim();

      if (status === 'Deleted') {
        return res.status(403).json({ success: false, locked: false, message: 'This account has been deleted. Please contact Admin or HR.' });
      }

      if (status === 'Locked') {
        return res.status(403).json({ success: false, locked: true, message: 'Your account is locked after too many failed login attempts. Please contact Admin or HR to reactivate your account.' });
      }

      if (status !== 'Active') {
        return res.status(403).json({ success: false, locked: true, message: 'This account is deactivated. Please contact Admin or HR.' });
      }

      // Verify password
      const stored = user.password || '';
      const isBcrypt = ['$2a$','$2b$','$2x$','$2y$'].some(p => stored.startsWith(p));
      const match = isBcrypt ? await bcrypt.compare(password, stored) : stored === password;

      if (!match) {
        const newAttempts = Number(user.failed_attempts || 0) + 1;
        const remaining = MAX_ATTEMPTS - newAttempts;

        if (newAttempts >= MAX_ATTEMPTS) {
          await conn.execute(
            "UPDATE users SET failed_attempts = ?, locked_at = NOW(), account_status = 'Locked' WHERE user_id = ?",
            [newAttempts, user.user_id]
          );
          await conn.execute(
            "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, 'Login', 'Account Locked - Too Many Failed Attempts')",
            [user.user_id, user.full_name]
          ).catch(() => {});
          return res.status(403).json({
            success: false,
            locked: true,
            message: 'Your account has been locked after 3 failed login attempts. Please contact Admin or HR to reactivate your account.'
          });
        }

        await conn.execute('UPDATE users SET failed_attempts = ? WHERE user_id = ?', [newAttempts, user.user_id]);
        await conn.execute(
          "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, 'Login', 'Failed')",
          [user.user_id, user.full_name]
        ).catch(() => {});

        return res.status(401).json({
          success: false,
          locked: false,
          attemptsLeft: remaining,
          message: `Invalid username or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before your account is locked.`
        });
      }

      // Credentials valid — generate OTP
      const otp = generateOtp();
      const otpHash = hashOtp(otp);

      // Invalidate any previous OTPs for this user
      await conn.execute('UPDATE login_otp SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [user.user_id]);

      await conn.execute(
        'INSERT INTO login_otp (user_id, otp_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
        [user.user_id, otpHash, OTP_EXPIRY_MINUTES]
      );

      const [emailSent, smsSent] = await Promise.all([
        sendOtpEmail(user, otp),
        sendOtpSms(user.phone, otp)
      ]);

      if (!emailSent && !smsSent) {
        // No channel configured — skip 2FA and log in directly (fallback for unconfigured systems)
        await conn.execute('UPDATE users SET failed_attempts = 0, locked_at = NULL WHERE user_id = ?', [user.user_id]);
        req.session.user = { user_id: user.user_id, full_name: user.full_name, role: user.role };
        await conn.execute(
          "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, 'Admin Login', 'Success (No 2FA channel)')",
          [user.user_id, user.full_name]
        ).catch(() => {});
        return res.json({ success: true, requiresOtp: false, user_id: user.user_id, full_name: user.full_name, role: user.role, isTempPassword: Boolean(user.is_temp_password) });
      }

      const channels = [];
      const otpEmail = getOtpEmail(user);
      if (emailSent && otpEmail) channels.push(`email (${maskEmail(otpEmail)})`);
      if (smsSent   && user.phone) channels.push(`SMS (${maskPhone(user.phone)})`);

      return res.json({
        success: true,
        requiresOtp: true,
        userId: user.user_id,
        isTempPassword: Boolean(user.is_temp_password),
        channels,
        maskedEmail: otpEmail ? maskEmail(otpEmail) : null,
        maskedPhone: user.phone ? maskPhone(user.phone) : null,
        message: `Verification code sent to ${channels.join(' and ')}.`
      });

    } catch (err) {
      console.error('LOGIN ERROR:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Verify OTP, create session
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/api/login/verify-otp', async (req, res) => {
    await initReady;
    const userId = Number(req.body?.userId || 0);
    const otp    = String(req.body?.otp || '').trim();

    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'User ID and OTP are required.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const [otpRows] = await conn.execute(
        `SELECT * FROM login_otp
         WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()
         ORDER BY id DESC LIMIT 1`,
        [userId]
      );

      if (!otpRows.length) {
        return res.status(400).json({ success: false, message: 'Verification code has expired. Please log in again.' });
      }

      const otpRow = otpRows[0];

      if (otpRow.otp_attempts >= MAX_ATTEMPTS) {
        await conn.execute('UPDATE login_otp SET used_at = NOW() WHERE id = ?', [otpRow.id]);
        return res.status(400).json({ success: false, expired: true, message: 'Too many incorrect attempts. Please log in again.' });
      }

      if (hashOtp(otp) !== otpRow.otp_hash) {
        const newAttempts = otpRow.otp_attempts + 1;
        const remaining = MAX_ATTEMPTS - newAttempts;
        await conn.execute('UPDATE login_otp SET otp_attempts = ? WHERE id = ?', [newAttempts, otpRow.id]);

        if (newAttempts >= MAX_ATTEMPTS) {
          await conn.execute('UPDATE login_otp SET used_at = NOW() WHERE id = ?', [otpRow.id]);
          return res.status(400).json({ success: false, expired: true, message: 'Verification code is incorrect. Please log in again.' });
        }

        return res.status(400).json({
          success: false,
          attemptsLeft: remaining,
          message: `Incorrect verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
        });
      }

      // OTP correct — mark used
      await conn.execute('UPDATE login_otp SET used_at = NOW() WHERE id = ?', [otpRow.id]);

      const [userRows] = await conn.execute('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId]);
      if (!userRows.length) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      const user = userRows[0];

      // Clear failed attempts
      await conn.execute('UPDATE users SET failed_attempts = 0, locked_at = NULL WHERE user_id = ?', [userId]);

      req.session.user = { user_id: user.user_id, full_name: user.full_name, role: user.role };

      await conn.execute(
        "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, 'Admin Login', 'Success')",
        [user.user_id, user.full_name]
      ).catch(() => {});

      return res.json({
        success: true,
        requiresOtp: false,
        isTempPassword: Boolean(user.is_temp_password),
        user_id: user.user_id,
        full_name: user.full_name,
        role: user.role
      });

    } catch (err) {
      console.error('OTP VERIFY ERROR:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESEND OTP
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/api/login/resend-otp', async (req, res) => {
    await initReady;
    const userId = Number(req.body?.userId || 0);
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required.' });

    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
      const user = rows[0];

      await conn.execute('UPDATE login_otp SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);

      const otp = generateOtp();
      await conn.execute(
        'INSERT INTO login_otp (user_id, otp_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
        [userId, hashOtp(otp), OTP_EXPIRY_MINUTES]
      );

      const [emailSent, smsSent] = await Promise.all([
        sendOtpEmail(user, otp),
        sendOtpSms(user.phone, otp)
      ]);
      const channels  = [];
      const otpEmail = getOtpEmail(user);
      if (emailSent && otpEmail) channels.push(`email (${maskEmail(otpEmail)})`);
      if (smsSent   && user.phone) channels.push(`SMS (${maskPhone(user.phone)})`);

      if (!channels.length) {
        await conn.execute('UPDATE login_otp SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);
        return res.status(503).json({
          success: false,
          message: 'Unable to deliver a verification code. Please verify the account email and mail configuration.'
        });
      }

      return res.json({ success: true, channels, message: `New code sent to ${channels.join(' and ')}.` });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUEST UNLOCK (no auth — user is locked out)
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/api/login/request-unlock', async (req, res) => {
    await initReady;
    const username = String(req.body?.username || '').trim();
    const reason   = String(req.body?.reason   || '').trim().slice(0, 500);
    if (!username) return res.status(400).json({ success: false, message: 'Username is required.' });

    let conn;
    try {
      conn = await pool.getConnection();

      const [rows] = await conn.execute(
        "SELECT user_id, username, full_name, account_status FROM users WHERE username = ? LIMIT 1",
        [username]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Username not found.' });
      }
      const user = rows[0];

      if (user.account_status !== 'Locked') {
        return res.status(400).json({ success: false, message: 'This account is not currently locked.' });
      }

      // Check for existing pending request
      const [existing] = await conn.execute(
        "SELECT request_id FROM account_unlock_requests WHERE user_id = ? AND status = 'pending' LIMIT 1",
        [user.user_id]
      );
      if (existing.length) {
        return res.json({ success: true, alreadyRequested: true, message: 'An unlock request has already been submitted for this account. Please wait for admin review.' });
      }

      await conn.execute(
        "INSERT INTO account_unlock_requests (user_id, username, full_name, reason) VALUES (?, ?, ?, ?)",
        [user.user_id, user.username, user.full_name, reason || null]
      );

      // In-app notification to all admins/HR
      await createNotificationsForAdminHr(
        pool,
        'account_unlock',
        'Account Unlock Request',
        `${user.full_name || user.username} is requesting to unlock their locked account.${reason ? ` Reason: ${reason}` : ''}`
      );

      // Email notification to admins (best-effort)
      try {
        const transporter = getTransporter();
        const cfg = getMailConfig();
        if (transporter && cfg) {
          const [admins] = await conn.execute(
            `SELECT email, full_name FROM users
             WHERE (LOWER(role) LIKE '%admin%' OR LOWER(role) LIKE '%hr%' OR LOWER(role) LIKE '%human resource%')
               AND email IS NOT NULL AND email != ''
               AND (account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated','deleted'))
             LIMIT 20`
          );
          for (const admin of admins) {
            await transporter.sendMail({
              from: cfg.from,
              to: String(admin.email).trim(),
              subject: 'Account Unlock Request — AstreaBlue HRIS',
              html: buildEmail({
                title: 'Account Unlock Request',
                recipientName: admin.full_name || 'Admin',
                intro: 'An employee is requesting to have their locked account unlocked.',
                rows: [
                  { label: 'Username',   value: user.username },
                  { label: 'Full Name',  value: user.full_name || '—' },
                  ...(reason ? [{ label: 'Reason', value: reason }] : []),
                ],
                closing: 'Please log in to the admin panel to review and unlock this account.',
              }),
            }).catch(() => {});
          }
        }
      } catch (_) { /* non-critical */ }

      return res.json({ success: true, message: 'Your unlock request has been sent to the administrator. You will be contacted once your account is reactivated.' });
    } catch (err) {
      console.error('REQUEST UNLOCK ERROR:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/api/session', (req, res) => {
    const user = req.session?.user;
    if (!user?.user_id) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    return res.json({ success: true, user });
  });

  app.post('/api/logout', (req, res) => {
    if (!req.session) return res.json({ success: true });
    req.session.destroy(err => {
      if (err) return res.status(500).json({ success: false, message: 'Unable to sign out.' });
      res.clearCookie('payroll.sid');
      return res.json({ success: true });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — List locked accounts
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/api/admin/locked-accounts', async (req, res) => {
    await initReady;
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute(
        `SELECT u.user_id, u.username, u.full_name, u.role, u.email, u.phone,
                u.failed_attempts, u.locked_at, u.account_status,
                (SELECT r.reason FROM account_unlock_requests r
                 WHERE r.user_id = u.user_id AND r.status = 'pending'
                 ORDER BY r.requested_at DESC LIMIT 1) AS unlock_request_reason,
                (SELECT r.requested_at FROM account_unlock_requests r
                 WHERE r.user_id = u.user_id AND r.status = 'pending'
                 ORDER BY r.requested_at DESC LIMIT 1) AS unlock_requested_at
         FROM users u
         WHERE u.account_status IN ('Locked','Deactivated')
         ORDER BY u.locked_at DESC`
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — Unlock account + send temp password
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/api/admin/unlock-account', async (req, res) => {
    await initReady;
    const targetUserId = Number(req.body?.user_id || 0);
    if (!targetUserId) return res.status(400).json({ success: false, message: 'user_id is required.' });

    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT * FROM users WHERE user_id = ? LIMIT 1', [targetUserId]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
      const user = rows[0];

      const tempPassword = generateTempPassword();
      const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
      const hashed = await bcrypt.hash(tempPassword, bcryptRounds);

      await conn.execute(
        "UPDATE users SET account_status='Active', failed_attempts=0, locked_at=NULL, password=?, is_temp_password=1 WHERE user_id=?",
        [hashed, targetUserId]
      );

      // Resolve any pending unlock requests for this user
      const adminName = req.session?.user?.full_name || 'Admin';
      await conn.execute(
        "UPDATE account_unlock_requests SET status='approved', resolved_at=NOW(), resolved_by=? WHERE user_id=? AND status='pending'",
        [adminName, targetUserId]
      ).catch(() => {});

      await conn.execute(
        "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, 'Account Unlock', 'Success')",
        [targetUserId, user.full_name]
      ).catch(() => {});

      const emailSent = await sendTempPasswordEmail(user, tempPassword);

      return res.json({
        success: true,
        emailSent,
        message: emailSent
          ? `Account unlocked. Temporary password sent to ${maskEmail(user.email)}.`
          : `Account unlocked. Email not sent — no email on record. Temporary password: ${tempPassword}`,
        tempPassword: emailSent ? undefined : tempPassword
      });
    } catch (err) {
      console.error('UNLOCK ERROR:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSWORD RESET (existing flow)
  // ═══════════════════════════════════════════════════════════════════════════

  function isRunningOnRailway() {
    return !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID ||
              process.env.RAILWAY_SERVICE_ID  || process.env.RAILWAY_PUBLIC_DOMAIN);
  }
  function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try { const u = new URL(withProto); return `${u.protocol}//${u.host}`.replace(/\/+$/, ''); } catch { return ''; }
  }
  function getBaseUrl(req) {
    const host = String(req?.get?.('host') || '').trim();
    if (!host) return '';
    const proto = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim() || req?.protocol || (isRunningOnRailway() ? 'https' : 'http');
    return normalizeUrl(`${proto}://${host}`);
  }
  function getResetBaseUrl(req) {
    const cfgUrl = normalizeUrl(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || '');
    if (cfgUrl) return cfgUrl;
    const railUrl = normalizeUrl(process.env.RAILWAY_PUBLIC_DOMAIN);
    if (railUrl) return railUrl;
    const reqUrl = getBaseUrl(req);
    if (reqUrl) return reqUrl;
    if (isRunningOnRailway()) throw new Error('Set APP_BASE_URL to your Railway URL.');
    return 'http://localhost:12687';
  }

  async function findUserByUsername(conn, username) {
    const [rows] = await conn.execute(
      `SELECT u.user_id, u.username, u.full_name, u.email,
              COALESCE(u.email, ec.email) AS resolved_email
       FROM users u
       LEFT JOIN employees e ON LOWER(TRIM(e.emp_code)) = LOWER(TRIM(u.username))
       LEFT JOIN employee_contacts ec ON ec.contact_id = (
         SELECT c.contact_id FROM employee_contacts c
         WHERE c.employee_id = e.employee_id AND TRIM(COALESCE(c.email,'')) <> ''
         ORDER BY c.contact_id DESC LIMIT 1
       )
       WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(?)) LIMIT 1`,
      [username]
    );
    return rows[0] || null;
  }

  app.post('/api/password-reset/request', async (req, res) => {
    await initReady;
    const username = String(req.body?.username || '').trim();
    if (!username) return res.status(400).json({ success: false, message: 'Username is required.' });

    let conn;
    try {
      conn = await pool.getConnection();
      const user = await findUserByUsername(conn, username);
      if (!user) return res.status(404).json({ success: false, message: 'Username was not found.' });

      const email = String(user.resolved_email || user.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ success: false, message: 'This username has no linked email. Please contact HR.' });

      const rawToken  = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await conn.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [user.user_id]);
      await conn.execute(
        'INSERT INTO password_reset_tokens (user_id, token_hash, email, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
        [user.user_id, tokenHash, email]
      );

      const baseUrl   = getResetBaseUrl(req);
      const resetUrl  = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
      const transporter = getTransporter();
      const cfg = getMailConfig();

      if (!transporter || !cfg) {
        return res.status(500).json({ success: false, message: 'Email service is not configured. Please contact HR directly.' });
      }

      await transporter.sendMail({
        from: cfg.from, to: email,
        subject: 'Password Reset Request — AstreaBlue HRIS',
        html: buildEmail({
          title: 'Password Reset Request',
          recipientName: user.full_name || user.username || 'there',
          intro: 'We received a request to reset your AstreaBlue HRIS password. Click the button below.',
          rows: [
            { label: 'Requested For', value: user.full_name || user.username },
            { label: 'Link Expires',  value: '30 minutes' },
          ],
          cta: { label: 'Reset My Password', url: resetUrl },
          closing: 'If you did not request this, you can safely ignore this email.',
        }),
      });

      return res.json({ success: true, message: `Password reset instructions sent to ${maskEmail(email)}.` });
    } catch (err) {
      console.error('PASSWORD RESET REQUEST ERROR:', err);
      return res.status(500).json({ success: false, message: err.message || 'Unable to request password reset.' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/password-reset/confirm', async (req, res) => {
    await initReady;
    const token           = String(req.body?.token || '').trim();
    const newPassword     = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!token || !newPassword || !confirmPassword) return res.status(400).json({ success: false, message: 'All fields are required.' });
    if (newPassword !== confirmPassword)             return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    if (newPassword.length < 8)                      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });

    let conn; let started = false;
    try {
      conn = await pool.getConnection();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await conn.beginTransaction(); started = true;

      const [rows] = await conn.execute(
        `SELECT prt.reset_id, prt.user_id, u.username
         FROM password_reset_tokens prt
         INNER JOIN users u ON u.user_id = prt.user_id
         WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > NOW() LIMIT 1`,
        [tokenHash]
      );
      if (!rows.length) { await conn.rollback(); started = false; return res.status(400).json({ success: false, message: 'This reset link is invalid or expired.' }); }

      const hashed = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
      await conn.execute('UPDATE users SET password = ?, is_temp_password = 0 WHERE user_id = ?', [hashed, rows[0].user_id]);
      await conn.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE reset_id = ?', [rows[0].reset_id]);
      await conn.commit(); started = false;

      return res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
      if (conn && started) await conn.rollback().catch(() => {});
      return res.status(500).json({ success: false, message: err.message || 'Unable to reset password.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANGE OWN PASSWORD
  // ═══════════════════════════════════════════════════════════════════════════
  app.put('/api/user/password', async (req, res) => {
    const body = req.body || {};
    const sessionUserId = Number(req.session?.user?.user_id || 0);
    const requestUserId = Number(body.user_id || req.query?.user_id || 0);
    let userId = sessionUserId || requestUserId;
    const { currentPassword, newPassword, confirmPassword } = body;

    if (sessionUserId && requestUserId && sessionUserId !== requestUserId) {
      return res.status(403).json({ success: false, message: 'Session user does not match the requested account.' });
    }
    if (!newPassword || !confirmPassword) return res.status(400).json({ success: false, message: 'New password and confirmation are required.' });
    if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: 'New password and confirmation do not match.' });
    if (newPassword.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });

    let conn;
    try {
      conn = await pool.getConnection();
      if (!userId && body.full_name) {
        const [ul] = await conn.execute('SELECT user_id FROM users WHERE TRIM(full_name) = TRIM(?) ORDER BY user_id DESC LIMIT 1', [body.full_name]);
        userId = Number(ul?.[0]?.user_id || 0);
      }
      if (!userId) return res.status(401).json({ success: false, message: 'Please sign in again before changing your password.' });

      const [rows] = await conn.execute('SELECT user_id, password, is_temp_password FROM users WHERE user_id = ? LIMIT 1', [userId]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });

      const isTempPw = Boolean(rows[0].is_temp_password);

      if (!isTempPw) {
        // Normal account: current password is required
        if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password is required.' });
        const stored = rows[0].password || '';
        const isBcrypt = ['$2a$','$2b$','$2x$','$2y$'].some(p => stored.startsWith(p));
        const match = isBcrypt ? await bcrypt.compare(currentPassword, stored) : stored === currentPassword;
        if (!match) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }

      const hashed = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
      await conn.execute('UPDATE users SET password = ?, is_temp_password = 0 WHERE user_id = ?', [hashed, userId]);

      return res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Unable to change password.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // USER EMAIL GET/SET
  // ═══════════════════════════════════════════════════════════════════════════
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
    const email  = String(req.body?.email || '').trim().toLowerCase();
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email format.' });
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute('UPDATE users SET email = ? WHERE user_id = ?', [email || null, userId]);
      if (req.session?.user) req.session.user.email = email || null;
      res.json({ success: true, message: 'Email updated.', email: email || null });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTER
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/api/register', async (req, res) => {
    await initReady;
    const { username, password, full_name, role, email } = req.body || {};
    if (!username || !full_name || !role) return res.status(400).json({ success: false, message: 'Username, full name, and role are required.' });
    if (!['Employee','HR','Admin'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role.' });

    // If password provided manually, validate it; otherwise auto-generate a temp password
    const useManualPassword = Boolean(password);
    if (useManualPassword && password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });

    let conn;
    try {
      conn = await pool.getConnection();
      const [existing] = await conn.execute('SELECT user_id FROM users WHERE username = ? LIMIT 1', [username]);
      if (existing.length) return res.status(409).json({ success: false, message: 'Username already exists.' });

      const finalPassword = useManualPassword ? password : generateTempPassword();
      const isTempPassword = useManualPassword ? 0 : 1;
      const hashed = await bcrypt.hash(finalPassword, parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
      const resolvedEmail = String(email || '').trim().toLowerCase() || null;

      const [result] = await conn.execute(
        "INSERT INTO users (username, password, full_name, role, account_status, email, is_temp_password) VALUES (?, ?, ?, ?, 'Active', ?, ?)",
        [username, hashed, full_name, role, resolvedEmail, isTempPassword]
      );

      let emailSent = false;
      if (isTempPassword && resolvedEmail) {
        emailSent = await sendTempPasswordEmail(
          { email: resolvedEmail, full_name, username },
          finalPassword
        );
      }

      return res.json({
        success: true,
        user_id: result.insertId,
        emailSent,
        isTempPassword: Boolean(isTempPassword),
        message: isTempPassword
          ? (emailSent
              ? `Account created. Temporary password sent to ${maskEmail(resolvedEmail)}.`
              : `Account created. No email on record — temporary password: ${finalPassword}`)
          : 'Account created successfully.',
        tempPassword: (isTempPassword && !emailSent) ? finalPassword : undefined,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || 'Server error.' });
    } finally {
      if (conn) conn.release();
    }
  });
};
