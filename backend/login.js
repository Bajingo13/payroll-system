// ----------- USER AUTHENTICATION -----------
const bcrypt = require('bcryptjs');

module.exports = function (app, pool) {
    // LOGIN
    app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.json({ success: false });

    try {
        const conn = await pool.getConnection();
        try {
        const [rows] = await conn.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (rows.length > 0) {
            const user = rows[0];

            // Support both bcrypt-hashed passwords (new accounts) and legacy plaintext passwords
            const storedPassword = user.password || '';
            const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2x$', '$2y$'];
            const isBcrypt = BCRYPT_PREFIXES.some(prefix => storedPassword.startsWith(prefix));
            const passwordMatch = isBcrypt
                ? await bcrypt.compare(password, storedPassword)
                : storedPassword === password;

            if (!passwordMatch) {
                return res.json({ success: false, message: "Invalid username or password" });
            }

            // Insert login event in audit_logs
            await conn.execute(
                "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
                [user.user_id, user.full_name, 'Admin Login', 'Success']
            );

            res.json({ success: true, user_id: user.user_id, full_name: user.full_name });
        } else {
            res.json({ success: false, message: "Invalid username or password" });
        }} finally {
            conn.release();
        }
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
    });

    // REGISTER
    app.post('/api/register', async (req, res) => {
        const { username, password, full_name, role } = req.body;

        if (!username || !password || !full_name || !role) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }

        const ALLOWED_ROLES = ['Employee', 'HR', 'Admin'];
        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role selected." });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
        }

        try {
            const conn = await pool.getConnection();
            try {
                // Check if username already exists
                const [existing] = await conn.execute(
                    'SELECT user_id FROM users WHERE username = ?',
                    [username]
                );

                if (existing.length > 0) {
                    return res.status(409).json({ success: false, message: "Username already exists." });
                }

                const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
                const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

                await conn.execute(
                    'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
                    [username, hashedPassword, full_name, role]
                );

                res.json({ success: true });
            } finally {
                conn.release();
            }
        } catch (err) {
            console.error("Register error:", err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });
};