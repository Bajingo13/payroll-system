module.exports = function (app, pool) {
    // ========== DASHBOARD SUMMARY ==========
    app.get("/api/dashboard", async (req, res) => {
    try {
        const conn = await pool.getConnection();
        const [employees] = await conn.execute("SELECT COUNT(*) AS total FROM employees");
        const [payrolls] = await conn.execute("SELECT COUNT(*) AS total FROM payroll_runs WHERE status IN ('Generated', 'Completed', 'Locked')");
        const [logsToday] = await conn.execute("SELECT COUNT(*) AS total FROM audit_logs WHERE DATE(log_time) = CURDATE()");
        conn.release();

        res.json({
        totalEmployees: employees[0].total,
        processedPayrolls: payrolls[0].total,
        systemLogs: logsToday[0].total
        });
    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
    });

    // Recent logs under dashboard summary
    app.get("/api/logs", async (req, res) => {
    try {
        const conn = await pool.getConnection();
        const [logs] = await conn.execute(
            "SELECT admin_name, action, status, log_time FROM audit_logs ORDER BY log_time DESC LIMIT 10"
        );
        conn.release();
        res.json(logs);
    } catch (err) {
        console.error("Error fetching logs:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
    });
};