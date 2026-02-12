module.exports = function (app, pool) {
    app.get('/api/profile', async (req, res) => {
    const userId = req.query.user_id;

    if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user_id" });
    }

    try {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
        'SELECT full_name, role FROM users WHERE user_id = ?',
        [userId]
    );
    conn.release();

    if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: rows[0] });
    } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ success: false, message: "Server error" });
    }
    });
}