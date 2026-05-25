const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);
const ALLOWED_ROLES = new Set(["Employee", "Admin", "HR"]);

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
    return storedPassword === password;
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

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Please enter both username and password."
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
        return res.json({ success: false, message: "Invalid username or password." });
      }

      const user = rows[0];
      const isValidPassword = await verifyPassword(password, user.password);

      if (!isValidPassword) {
        return res.json({ success: false, message: "Invalid username or password." });
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

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Username must be at least 3 characters long."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long."
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