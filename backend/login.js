const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);
const ALLOWED_ROLES = new Set(["Employee", "Admin", "HR"]);
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttemptStore = new Map();

function getRateLimitKey(req, identifier) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const ipAddress = forwardedFor || req.ip || req.socket?.remoteAddress || "unknown";
  return `${ipAddress}:${String(identifier || "").trim().toLowerCase()}`;
}

function clearExpiredLoginAttempts(now = Date.now()) {
  for (const [key, value] of loginAttemptStore.entries()) {
    if (value.expiresAt <= now) {
      loginAttemptStore.delete(key);
    }
  }
}

function isRateLimited(key, now = Date.now()) {
  clearExpiredLoginAttempts(now);
  const entry = loginAttemptStore.get(key);
  return !!entry && entry.count >= MAX_LOGIN_ATTEMPTS && entry.expiresAt > now;
}

function recordFailedAttempt(key, now = Date.now()) {
  const entry = loginAttemptStore.get(key);

  if (!entry || entry.expiresAt <= now) {
    loginAttemptStore.set(key, {
      count: 1,
      expiresAt: now + LOGIN_RATE_LIMIT_WINDOW_MS
    });
    return;
  }

  entry.count += 1;
}

function clearFailedAttempts(key) {
  loginAttemptStore.delete(key);
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  const roleMap = {
    employee: "Employee",
    admin: "Admin",
    hr: "HR"
  };

  return roleMap[value] || null;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;

  if (!storedPassword.includes(":")) {
    // Backward compatibility: support legacy plaintext passwords until those
    // records are migrated to hashed values.
    const storedBuffer = Buffer.from(String(storedPassword), "utf8");
    const passwordBuffer = Buffer.from(String(password), "utf8");

    if (storedBuffer.length !== passwordBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedBuffer, passwordBuffer);
  }

  const [salt, storedHash] = storedPassword.split(":");
  if (!salt || !storedHash) return false;

  const derivedKey = await scryptAsync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

// ----------- USER AUTHENTICATION -----------
module.exports = function (app, pool) {
  app.post("/api/login", async (req, res) => {
    const identifier = String(req.body.username || req.body.identifier || "").trim();
    const password = String(req.body.password || "");
    const rateLimitKey = getRateLimitKey(req, identifier);

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Please enter both username and password."
      });
    }

    if (isRateLimited(rateLimitKey)) {
      return res.status(429).json({
        success: false,
        message: "Too many failed login attempts. Please try again later."
      });
    }

    let conn;

    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute(
        "SELECT * FROM users WHERE username = ? LIMIT 1",
        [identifier]
      );

      if (rows.length === 0) {
        recordFailedAttempt(rateLimitKey);
        return res.json({ success: false, message: "Invalid username or password." });
      }

      const user = rows[0];
      const isLegacyPassword = !String(user.password || "").includes(":");
      const isValidPassword = await verifyPassword(password, user.password);

      if (!isValidPassword) {
        recordFailedAttempt(rateLimitKey);
        return res.json({ success: false, message: "Invalid username or password." });
      }

      clearFailedAttempts(rateLimitKey);

      if (isLegacyPassword) {
        const upgradedPassword = await hashPassword(password);
        await conn.execute(
          "UPDATE users SET password = ? WHERE user_id = ?",
          [upgradedPassword, user.user_id]
        );
      }

      req.session.user = {
        user_id: user.user_id,
        full_name: user.full_name,
        role: user.role
      };

      await conn.execute(
        "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
        [user.user_id, user.full_name, `${user.role || "User"} Login`, "Success"]
      );

      return res.json({
        success: true,
        user_id: user.user_id,
        full_name: user.full_name,
        role: user.role
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post("/api/register", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const fullName = String(req.body.full_name || "").trim();
    const password = String(req.body.password || "");
    const role = normalizeRole(req.body.role);

    if (!fullName || !username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Full name, username, password, and role are required."
      });
    }

    if (username.length < MIN_USERNAME_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Username must be at least ${MIN_USERNAME_LENGTH} characters long.`
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid role."
      });
    }

    let conn;

    try {
      conn = await pool.getConnection();

      const [existingUsers] = await conn.execute(
        "SELECT user_id FROM users WHERE username = ? LIMIT 1",
        [username]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: "That username is already registered."
        });
      }

      const hashedPassword = await hashPassword(password);
      const [result] = await conn.execute(
        "INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)",
        [username, hashedPassword, fullName, role]
      );

      await conn.execute(
        "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
        [result.insertId, fullName, "Account Registration", "Success"]
      );

      return res.status(201).json({
        success: true,
        message: "Registration successful. Please log in."
      });
    } catch (err) {
      console.error("Registration error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post("/api/logout", (req, res) => {
    if (!req.session) {
      return res.json({ success: true });
    }

    req.session.destroy(err => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ success: false, message: "Unable to log out." });
      }

      res.clearCookie("connect.sid");
      return res.json({ success: true });
    });
  });
};