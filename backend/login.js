// ----------- USER AUTHENTICATION -----------
module.exports = function (app, pool) {
    const ALLOWED_ROLES = ['System Administrator', 'HR', 'Employee'];

    // LOGIN
    app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.json({ success: false });

    try {
        const conn = await pool.getConnection();
        try {
        const [rows] = await conn.execute(
            'SELECT * FROM users WHERE username = ? AND password = ?',
            [username, password]
        );
        
        if (rows.length > 0) {
            const user = rows[0];

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
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const fullName = String(req.body.full_name || '').trim();
    const role = String(req.body.role || '').trim();

    if (!username || !password || !fullName || !role) {
        return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role selected" });
    }

    if (password.length < 4) {
        return res.status(400).json({ success: false, message: "Password must be at least 4 characters" });
    }

    let conn;
    try {
        conn = await pool.getConnection();

        const [existing] = await conn.execute(
        'SELECT user_id FROM users WHERE username = ? LIMIT 1',
        [username]
        );

        if (existing.length > 0) {
        return res.status(409).json({ success: false, message: "Username already exists" });
        }

        const [result] = await conn.execute(
        'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
        [username, password, fullName, role]
        );

        await conn.execute(
        "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
        [result.insertId, fullName, 'User Registration', 'Success']
        );

        return res.json({ success: true, message: "Account created successfully" });
    } catch (err) {
        console.error("Registration error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    } finally {
        if (conn) conn.release();
    }
    });
};
