module.exports = function (app, pool) {
    app.get("/api/audit_logs", async (req, res) => {
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 if no limit is provided
        const page = parseInt(req.query.page, 10) || 1;   // Default to page 1 if no page is provided
        const offset = (page - 1) * limit;

        try {
            const conn = await pool.getConnection();

            // Get the total number of logs
            const [countResult] = await conn.query("SELECT COUNT(*) as total FROM audit_logs");
            const totalLogs = countResult[0].total;
            const totalPages = Math.ceil(totalLogs / limit); // Calculate total pages

            // Get the logs for the current page
            const [logs] = await conn.query(
                "SELECT admin_name, action, status, log_time FROM audit_logs ORDER BY log_time DESC LIMIT ? OFFSET ?",
                [limit, offset]
            );

            conn.release();

            // Send response with logs and pagination info
            res.json({
                logs: logs,
                totalLogs: totalLogs,  // Include totalLogs in the response
                totalPages: totalPages,
                currentPage: page,
                success: true
            });
        } catch (err) {
            console.error("Error fetching audit logs:", err);
            res.status(500).json({ success: false, message: "Server error", error: err.message });
        }
    });
};