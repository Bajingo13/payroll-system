// ----------- USER AUTHENTICATION -----------
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
};