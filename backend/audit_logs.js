module.exports = function (app, pool) {
    app.get("/api/audit_logs", async (req, res) => {
        const limit = parseInt(req.query.limit, 10) || 10;
        const page = parseInt(req.query.page, 10) || 1;
        const offset = (page - 1) * limit;

        try {
            const conn = await pool.getConnection();

            const [countResult] = await conn.query(
                "SELECT COUNT(*) as total FROM audit_logs"
            );
            const totalLogs = countResult[0].total;
            const totalPages = Math.ceil(totalLogs / limit);

            const [logs] = await conn.query(
                `SELECT
                    admin_name,
                    action,
                    status,
                    DATE_FORMAT(
                        DATE_ADD(log_time, INTERVAL 8 HOUR),
                        '%Y-%m-%d %H:%i:%s'
                    ) AS log_time
                 FROM audit_logs
                 ORDER BY log_time DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            conn.release();

            res.json({
                logs,
                totalLogs,
                totalPages,
                currentPage: page,
                success: true
            });
        } catch (err) {
            console.error("Error fetching audit logs:", err);
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    });
};