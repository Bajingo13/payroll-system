module.exports = function (app, pool) {
    app.get('/api/profile', async (req, res) => {
    const userId = req.query.user_id;

    if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user_id" });
    }

    let conn;
    try {
    conn = await pool.getConnection();
    let rows;
    try {
        [rows] = await conn.execute(
            'SELECT full_name, role, profile_photo FROM users WHERE user_id = ?',
            [userId]
        );
    } catch (err) {
        if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
        [rows] = await conn.execute(
            'SELECT full_name, role FROM users WHERE user_id = ?',
            [userId]
        );
    }

    if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = rows[0];
    res.json({
        success: true,
        user,
        profilePhotoUrl: user.profile_photo ? `/uploads/profiles/${user.profile_photo}` : null
    });
    } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ success: false, message: "Server error" });
    } finally {
    if (conn) conn.release();
    }
    });
}
