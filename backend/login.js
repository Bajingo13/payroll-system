const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

// ----------- USER AUTHENTICATION -----------
module.exports = function (app, pool) {
  const ALLOWED_ROLES = ['System Administrator', 'HR', 'Employee'];
  const PRIVILEGED_ROLES = ['System Administrator', 'HR'];
  const PRIVILEGED_REGISTRATION_CODE = String(process.env.PRIVILEGED_REGISTRATION_CODE || '').trim();
  const rateLimitStore = new Map();

  function createRateLimiter(windowMs, maxRequests) {
    return (req, res, next) => {
      const key = `${req.ip || req.headers['x-forwarded-for'] || 'unknown'}:${req.path}`;
      const now = Date.now();
      const bucket = rateLimitStore.get(key);

      if (!bucket || (now - bucket.windowStart) >= windowMs) {
        rateLimitStore.set(key, { windowStart: now, count: 1 });
        return next();
      }

      if (bucket.count >= maxRequests) {
        return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
      }

      bucket.count += 1;
      return next();
    };
  }

  const loginRateLimit = createRateLimiter(15 * 60 * 1000, 20);
  const registerRateLimit = createRateLimiter(60 * 60 * 1000, 10);

  async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scryptAsync(password, salt, 64);
    return `scrypt$${salt}$${hash.toString('hex')}`;
  }

  async function verifyPassword(inputPassword, storedPassword) {
    const stored = String(storedPassword || '');
    if (!stored) return false;

    if (!stored.startsWith('scrypt$')) {
        return inputPassword === stored;
    }

    const parts = stored.split('$');
    if (parts.length !== 3) return false;

    const [, salt, storedHashHex] = parts;
    if (!salt || !storedHashHex) return false;

    const inputHash = await scryptAsync(inputPassword, salt, 64);
    const storedHash = Buffer.from(storedHashHex, 'hex');
    if (storedHash.length !== inputHash.length) return false;

    return crypto.timingSafeEqual(inputHash, storedHash);
  }

  // LOGIN
  app.post('/api/login', loginRateLimit, async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password)
      return res.json({ success: false });

    try {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          'SELECT * FROM users WHERE username = ? LIMIT 1',
          [username]
        );
        const user = rows[0];
        const isValidPassword = user ? await verifyPassword(password, user.password) : false;

        if (isValidPassword) {

            // Insert login event in audit_logs
            await conn.execute(
                "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
                [user.user_id, user.full_name, 'Admin Login', 'Success']
            );

            return res.json({ success: true, user_id: user.user_id, full_name: user.full_name });
        } else {
            return res.json({ success: false, message: "Invalid username or password" });
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // REGISTER
  app.post('/api/register', registerRateLimit, async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const fullName = String(req.body.full_name || '').trim();
    const role = String(req.body.role || '').trim();
    const registrationCode = String(req.body.registration_code || '').trim();

    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role selected" });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    if (PRIVILEGED_ROLES.includes(role)) {
      if (!PRIVILEGED_REGISTRATION_CODE || registrationCode !== PRIVILEGED_REGISTRATION_CODE) {
        return res.status(403).json({ success: false, message: "Invalid registration code for selected role" });
      }
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const hashedPassword = await hashPassword(password);
      const [result] = await conn.execute(
        'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
        [username, hashedPassword, fullName, role]
      );

      await conn.execute(
        "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
        [result.insertId, fullName, 'User Registration', 'Success']
      );

      return res.json({ success: true, message: "Account created successfully" });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: "Username already exists" });
      }
      console.error("Registration error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });
};
