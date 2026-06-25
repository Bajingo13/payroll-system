module.exports = function (app, pool) {
    // Helper: For audit logs
    async function logAudit(pool, user_id, admin_name, action, status) {
        if (!user_id || !admin_name) {
            console.error("logAudit aborted: Missing user_id or admin_name");
            return; // Don’t try to insert invalid data
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.execute(
            "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
            [user_id, admin_name, action, status]
            );
            console.log(`Audit logged: ${admin_name} → ${action}`);
        } catch (err) {
            console.error("Failed to log audit:", err.message);
        } finally {
            if (conn) conn.release();
        }
    }

    function normalizeSelectorValue(value) {
        return String(value ?? "").trim().toLowerCase();
    }

    function addCandidate(candidates, value) {
        const normalized = normalizeSelectorValue(value);
        if (normalized) candidates.add(normalized);
    }

    async function getSelectorCandidates(conn, table, idColumn, labelColumn, value) {
        const candidates = new Set();
        addCandidate(candidates, value);

        const [rows] = await conn.query(
            `SELECT ${idColumn} AS id_value, ${labelColumn} AS label_value
             FROM ${table}
             WHERE CAST(${idColumn} AS CHAR) = ?
                OR CONVERT(LOWER(TRIM(CAST(${labelColumn} AS CHAR))) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                   CONVERT(LOWER(TRIM(CAST(? AS CHAR))) USING utf8mb4) COLLATE utf8mb4_unicode_ci`,
            [value, value]
        );

        rows.forEach((row) => {
            addCandidate(candidates, row.id_value);
            addCandidate(candidates, row.label_value);
        });

        return Array.from(candidates);
    }

    async function getPayrollRunCandidates(conn, filters) {
        const groupCandidates = await getSelectorCandidates(conn, "payroll_groups", "group_id", "group_name", filters.payroll_group);
        const periodCandidates = await getSelectorCandidates(conn, "payroll_periods", "period_id", "period_name", filters.payroll_period);
        const monthCandidates = await getSelectorCandidates(conn, "payroll_months", "month_id", "month_name", filters.month);
        const yearCandidates = await getSelectorCandidates(conn, "payroll_years", "year_id", "year_value", filters.year);

        const [rows] = await conn.query(
            `SELECT
                pr.run_id,
                pr.status,
                pr.payroll_range,
                COUNT(ep.employee_id) AS employee_count
            FROM payroll_runs pr
            LEFT JOIN employee_payroll ep ON ep.run_id = pr.run_id
            WHERE LOWER(TRIM(CAST(pr.group_id AS CHAR))) IN (?)
                AND LOWER(TRIM(CAST(pr.period_id AS CHAR))) IN (?)
                AND LOWER(TRIM(CAST(pr.month_id AS CHAR))) IN (?)
                AND LOWER(TRIM(CAST(pr.year_id AS CHAR))) IN (?)
            GROUP BY pr.run_id, pr.status, pr.payroll_range
            ORDER BY
                CASE WHEN pr.status = 'Pending' THEN 1 ELSE 0 END,
                employee_count DESC,
                pr.run_id DESC`,
            [groupCandidates, periodCandidates, monthCandidates, yearCandidates]
        );

        return rows;
    }

    async function getPayrollRunSortIndex(conn, filters) {
        const [periodRows] = await conn.query(
            `SELECT period_id
             FROM payroll_periods
             WHERE CAST(period_id AS CHAR) = ?
                OR CONVERT(LOWER(TRIM(period_name)) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                   CONVERT(LOWER(TRIM(CAST(? AS CHAR))) USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LIMIT 1`,
            [filters.period, filters.period]
        );
        const [monthRows] = await conn.query(
            `SELECT month_id
             FROM payroll_months
             WHERE CAST(month_id AS CHAR) = ?
                OR CONVERT(LOWER(TRIM(month_name)) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                   CONVERT(LOWER(TRIM(CAST(? AS CHAR))) USING utf8mb4) COLLATE utf8mb4_unicode_ci
             LIMIT 1`,
            [filters.month, filters.month]
        );
        const [yearRows] = await conn.query(
            "SELECT year_value FROM payroll_years WHERE CAST(year_id AS CHAR) = ? OR CAST(year_value AS CHAR) = ? LIMIT 1",
            [filters.year, filters.year]
        );

        return {
            period: Number(periodRows[0]?.period_id || filters.period),
            month: Number(monthRows[0]?.month_id || filters.month),
            year: Number(yearRows[0]?.year_value || filters.year)
        };
    }

    async function getPayrollRunsInRange(conn, filters) {
        const groupCandidates = await getSelectorCandidates(conn, "payroll_groups", "group_id", "group_name", filters.payroll_group);
        const fromIndex = await getPayrollRunSortIndex(conn, {
            period: filters.from_period,
            month: filters.from_month,
            year: filters.from_year
        });
        const toIndex = await getPayrollRunSortIndex(conn, {
            period: filters.to_period,
            month: filters.to_month,
            year: filters.to_year
        });

        const [rows] = await conn.query(
            `SELECT
                pr.run_id,
                pr.group_id,
                pr.period_id,
                pr.month_id,
                pr.year_id,
                pr.status,
                COALESCE(pg_by_id.group_id, pg_by_name.group_id) AS normalized_group_id,
                COALESCE(pp_by_id.period_id, pp_by_name.period_id) AS normalized_period_id,
                COALESCE(pm_by_id.month_id, pm_by_name.month_id) AS normalized_month_id,
                COALESCE(py_by_id.year_value, py_by_value.year_value) AS normalized_year_value
            FROM payroll_runs pr
            LEFT JOIN payroll_groups pg_by_id ON CONVERT(TRIM(CAST(pg_by_id.group_id AS CHAR)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(TRIM(pr.group_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            LEFT JOIN payroll_groups pg_by_name ON CONVERT(LOWER(TRIM(pg_by_name.group_name)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(LOWER(TRIM(pr.group_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            LEFT JOIN payroll_periods pp_by_id ON CONVERT(TRIM(CAST(pp_by_id.period_id AS CHAR)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(TRIM(pr.period_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            LEFT JOIN payroll_periods pp_by_name ON CONVERT(LOWER(TRIM(pp_by_name.period_name)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(LOWER(TRIM(pr.period_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            LEFT JOIN payroll_months pm_by_id ON CONVERT(TRIM(CAST(pm_by_id.month_id AS CHAR)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(TRIM(pr.month_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            LEFT JOIN payroll_months pm_by_name ON CONVERT(LOWER(TRIM(pm_by_name.month_name)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(LOWER(TRIM(pr.month_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            LEFT JOIN payroll_years py_by_id ON CONVERT(TRIM(CAST(py_by_id.year_id AS CHAR)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(TRIM(pr.year_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            LEFT JOIN payroll_years py_by_value ON CONVERT(TRIM(CAST(py_by_value.year_value AS CHAR)) USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(TRIM(pr.year_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
            WHERE CONVERT(LOWER(TRIM(CAST(pr.group_id AS CHAR))) USING utf8mb4) COLLATE utf8mb4_unicode_ci IN (?)
            ORDER BY
                COALESCE(py_by_id.year_value, py_by_value.year_value),
                COALESCE(pm_by_id.month_id, pm_by_name.month_id),
                COALESCE(pp_by_id.period_id, pp_by_name.period_id)`,
            [groupCandidates]
        );

        const key = (item) => (Number(item.year) * 10000) + (Number(item.month) * 100) + Number(item.period);
        const fromKey = key(fromIndex);
        const toKey = key(toIndex);
        const minKey = Math.min(fromKey, toKey);
        const maxKey = Math.max(fromKey, toKey);

        return rows.filter((row) => {
            const rowKey = key({
                year: row.normalized_year_value,
                month: row.normalized_month_id,
                period: row.normalized_period_id
            });
            return Number.isFinite(rowKey) && rowKey >= minKey && rowKey <= maxKey;
        });
    }



    // === EMPLOYEE PAYROLL === 
    // GET payroll periods selectors from the payroll_periods, payroll_groups, payroll_months, payroll_years
    app.get("/api/payroll_periods", async (req, res) => {
        const { groupId } = req.query;
        let conn;

        try {
            conn = await pool.getConnection();

            // Fetch payroll groups, months, and years in parallel
            const [payrollGroups, payrollMonths, payrollYears] = await Promise.all([
                conn.query("SELECT group_id, group_name FROM payroll_groups ORDER BY group_id ASC"),
                conn.query("SELECT month_id, month_name FROM payroll_months ORDER BY month_id ASC"),
                conn.query("SELECT year_id, year_value FROM payroll_years")
            ]);

            // Fetch payroll periods, optionally filtered by groupId
            const [payrollPeriods] = await conn.query(
                "SELECT period_id, period_name FROM payroll_periods" + (groupId ? " WHERE group_id = ?" : ""),
                groupId ? [groupId] : []
            );

            // Release connection
            conn.release();

            // Respond with all data
            res.json({
                success: true,
                data: {
                    payrollGroups: payrollGroups[0],
                    payrollMonths: payrollMonths[0],
                    payrollYears: payrollYears[0],
                    payrollPeriods
                }
            });

        } catch (err) {
            console.error("Error fetching payroll data:", err, "Query:", req.query);
            res.status(500).json({ success: false, message: "Server error" });
        } finally {
            if (conn) conn.release();
        }
    });

    // GET category selectors from the system_lists
    app.get("/api/system_lists/:category", async (req, res) => {
        const { category } = req.params;

        try {
            const conn = await pool.getConnection();
            let rows;

            [rows] = await conn.query(
                "SELECT value FROM system_lists WHERE category = ? ORDER BY value ASC",
                [category]
            );

            conn.release();
            res.json(rows);
        } catch (err) {
            console.error("Error fetching system lists:", err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });

//YUNG TAAS NITO NABABASA DAHIL MERON SA PAYROLL_COMPUTATION

    // GET run_id based on the filters for Period covered date
    app.get("/api/get_run_id_payroll_journal", async (req, res) => {
        const { payroll_group, payroll_period, month, year } = req.query;

        if (!payroll_group || !payroll_period || !month || !year) {
            return res.status(400).json({ success: false, message: "All filters (payroll_group, payroll_period, month, year) are required" });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await getPayrollRunCandidates(conn, {
                payroll_group,
                payroll_period,
                month,
                year
            });

            if (rows.length > 0) {
                res.json({
                    success: true,
                    run_id: rows[0].run_id,
                    status: rows[0].status,
                    payroll_range: rows[0].payroll_range
                });
            } else {
                res.json({ success: false, message: "No matching payroll run found" });
            }
        } catch (err) {
            console.error("Error fetching run_id:", err);
            res.status(500).json({ success: false, message: "Server error", error: err.message });
        } finally {
            if (conn) conn.release();
        }
    });

    // GET run_id based on the filters for Range covered date
    app.get("/api/get_run_ids_range", async (req, res) => {
        const {
            payroll_group,
            from_period,
            from_month,
            from_year,
            to_period,
            to_month,
            to_year,
            start_period,
            start_month,
            start_year,
            end_period,
            end_month,
            end_year
        } = req.query;

        const rangeFromPeriod = from_period || start_period;
        const rangeFromMonth = from_month || start_month;
        const rangeFromYear = from_year || start_year;
        const rangeToPeriod = to_period || end_period;
        const rangeToMonth = to_month || end_month;
        const rangeToYear = to_year || end_year;

        if (
            !payroll_group ||
            !rangeFromPeriod || !rangeFromMonth || !rangeFromYear ||
            !rangeToPeriod || !rangeToMonth || !rangeToYear
        ) {
            return res.status(400).json({ success: false, message: "All filters are required" });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await getPayrollRunsInRange(conn, {
                payroll_group,
                from_period: rangeFromPeriod,
                from_month: rangeFromMonth,
                from_year: rangeFromYear,
                to_period: rangeToPeriod,
                to_month: rangeToMonth,
                to_year: rangeToYear
            });
            res.json({
            success: true,
            run_ids: rows.map(r => r.run_id)
            });

        } catch (err) {
            console.error("Error fetching run_ids by range:", err);
            res.status(500).json({ success: false, message: "Server error" });
        } finally {
            if (conn) conn.release();
        }
    });

    // GET filtered employees from employee_payroll based on MULTIPLE payroll_runs
    app.get("/api/employees_for_multiple_runs", async (req, res) => {
        const { run_ids, status } = req.query;

        if (!run_ids) {
            return res.status(400).json({
                success: false,
                message: "run_ids is required"
            });
        }

        // Convert "1,2,3" → [1,2,3]
        const runIdArray = run_ids
            .split(",")
            .map(id => parseInt(id, 10))
            .filter(Boolean);

        if (!runIdArray.length) {
            return res.json({ success: true, employees: [] });
        }

        try {
            // build WHERE clauses and params
            let whereClauses = [`ep.run_id IN (?)`];
            let params = [runIdArray];

            // Filter by employee status
            if (status === "active") {
                whereClauses.push(`e.status = 'Active'`);
                whereClauses.push(`(ep.payroll_status != 'Hold' OR ep.payroll_status IS NULL)`);
            } else if (status === "hold") {
                whereClauses.push(`ep.payroll_status = 'Hold'`);
            }
            
            // Add filters only if a value is selected
            const filters = [
                { key: 'company', column: 'ee.company' },
                { key: 'location', column: 'ee.location' },
                { key: 'branch', column: 'ee.branch' },
                { key: 'division', column: 'ee.division' },
                { key: 'department', column: 'ee.department' },
                { key: 'class', column: 'ee.class' },
                { key: 'position', column: 'ee.position' },
                { key: 'empType', column: 'ee.employee_type' },
                { key: 'salaryType', column: 'ea.salary_type' }
            ];
            
            filters.forEach(f => {
                const value = req.query[f.key];

                if (value !== undefined && value !== null && value !== "") {
                    whereClauses.push(`${f.column} = ?`);
                    params.push(value);
                }
            });

            const query = `
                SELECT
                    ep.employee_id,
                    MIN(ep.basic_salary) AS basic_salary,
                    e.first_name,
                    e.last_name,
                    e.emp_code
                FROM employee_payroll ep
                JOIN employees e ON ep.employee_id = e.employee_id
                JOIN employee_employment ee ON ep.employee_id = ee.employee_id
                JOIN employee_accounts ea ON ep.employee_id = ea.employee_id
                WHERE ${whereClauses.join(" AND ")}
                GROUP BY ep.employee_id, e.first_name, e.last_name, e.emp_code
                ORDER BY e.first_name, e.last_name ASC
            `;
            
            console.log(params);

            const conn = await pool.getConnection();
            const [rows] = await conn.query(query, params);
            conn.release();

            res.json({
                success: true,
                employees: rows
            });
        } catch (err) {
            console.error("Error fetching employees for multiple runs:", err);
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    });

    // GET payroll runs info for journal header
    app.get("/api/payroll_runs_by_ids", async (req, res) => {
        try {
            const { run_ids } = req.query;

            if (!run_ids) {
            return res.status(400).json({
                success: false,
                message: "run_ids is required"
            });
            }

            // Convert "1,2,3" → [1,2,3]
            const runIdsArray = run_ids
            .split(",")
            .map(id => parseInt(id, 10))
            .filter(Boolean);

            if (!runIdsArray.length) {
            return res.json({ success: true, runs: [] });
            }

            const conn = await pool.getConnection();

            const query = `
            SELECT
                run_id,
                payroll_range,
                group_id,
                period_id,
                month_id,
                year_id
            FROM payroll_runs
            WHERE run_id IN (?)
            ORDER BY year_id ASC, month_id ASC, period_id ASC;
            `;

            const [rows] = await conn.query(query, [runIdsArray]);
            conn.release();

            res.json({
            success: true,
            runs: rows
            });

        } catch (err) {
            console.error("Error fetching payroll runs:", err);
            res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
            });
        }
    });

    async function ensureEmployeesForPayrollJournal(conn, runIdArray) {
        for (const runId of runIdArray) {
            await conn.query(
                `INSERT INTO employee_payroll (run_id, employee_id, payroll_status)
                SELECT ?, e.employee_id, 'Active'
                FROM employees e
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM employee_payroll existing
                    WHERE existing.run_id = ?
                        AND existing.employee_id = e.employee_id
                )
                AND (
                    e.status IS NULL
                    OR TRIM(e.status) = ''
                    OR LOWER(TRIM(e.status)) = 'active'
                )`,
                [runId, runId]
            );
        }
    }

    // GET full payroll journal data based on MULTIPLE payroll_runs
    app.get("/api/payroll_journal_employees", async (req, res) => {
        const {
            run_ids,
            status,
            orderBy,

            company,
            location,
            branch,
            division,
            department,
            class: empClass,
            position,
            empType,
            salaryType,
            employeeId
        } = req.query;

        if (!run_ids) {
            return res.status(400).json({
            success: false,
            message: "run_ids is required"
            });
        }

        // Convert "1,2,3" → [1,2,3]
        const runIdArray = run_ids
            .split(",")
            .map(id => parseInt(id, 10))
            .filter(Boolean);

        if (!runIdArray.length) {
            return res.json({ success: true, employees: [] });
        }

        // ===============================
        // ORDER BY mapping
        // ===============================
        let orderClause = "ee.company, ee.department, e.last_name";

        switch (orderBy) {
        case "department_employeeid":
            orderClause = "ee.company, ee.department, ep.employee_id";
            break;

        case "division_surname":
            orderClause = "ee.company, ee.division, e.last_name";
            break;

        case "division_employeeid":
            orderClause = "ee.company, ee.division, ep.employee_id";
            break;

        case "branch_department_surname":
            orderClause = "ee.company, ee.branch, ee.department, e.last_name";
            break;

        case "branch_department_employeeid":
            orderClause = "ee.company, ee.branch, ee.department, ep.employee_id";
            break;

        case "project_salary-type_surname":
            orderClause = "ee.company, ea.projects, ea.salary_type, e.last_name";
            break;

        case "project_salary-type_employeeid":
            orderClause = "ee.company, ea.projects, ea.salary_type, ep.employee_id";
            break;

        case "surname":
            orderClause = "ee.company, e.last_name";
            break;

        case "employeeid":
            orderClause = "ee.company, ep.employee_id";
            break;
        }

        try {
            const conn = await pool.getConnection();

            let whereClauses = [
                "ep.run_id IN (?)"
            ];

            // Status filter
            if (status === "active") {
                whereClauses.push("(ep.payroll_status IS NULL OR LOWER(TRIM(ep.payroll_status)) != 'hold')");
            } else if (status === "hold") {
                whereClauses.push("LOWER(TRIM(ep.payroll_status)) = 'hold'");
            }

            // Optional filters
            if (company) whereClauses.push("ee.company = ?");
            if (location) whereClauses.push("ee.location = ?");
            if (branch) whereClauses.push("ee.branch = ?");
            if (division) whereClauses.push("ee.division = ?");
            if (department) whereClauses.push("ee.department = ?");
            if (empClass) whereClauses.push("ee.class = ?");
            if (position) whereClauses.push("ee.position = ?");
            if (empType) whereClauses.push("ee.employee_type = ?");
            if (salaryType) whereClauses.push("ea.salary_type = ?");
            if (employeeId) whereClauses.push("e.employee_id = ?");

            const queryValues = [runIdArray];
            [company, location, branch, division, department, empClass, position, empType, salaryType, employeeId]
            .forEach(v => { if (v) queryValues.push(v); });

            const query = `
                SELECT
                    ep.employee_id,

                    -- Tax details
                    tet.code AS tax_exemption_code,

                    -- Payroll totals
                    SUM(COALESCE(ep.basic_salary, CAST(NULLIF(eps.main_computation, '') AS DECIMAL(10,2)), 0)) AS basic_salary,
                    SUM(COALESCE(ep.absence_deduction, 0)) AS absence_deduction,
                    SUM(COALESCE(ep.late_deduction, 0)) AS late_deduction,
                    SUM(COALESCE(ep.undertime_deduction, 0)) AS undertime_deduction,
                    SUM(COALESCE(ep.overtime, 0)) AS overtime,
                    SUM(paa.basic_salary_amt) AS basic_salary_adj,
                    SUM(paa.absences_amt) AS absence_deduction_adj,
                    SUM(paa.late_amt) AS late_deduction_adj,
                    SUM(paa.undertime_amt) AS undertime_deduction_adj,

                    -- Overtime
                    SUM(pon.rg_rate) AS rg_rate,
                    SUM(pon.rg_ot) AS rg_ot,
                    SUM(pon.rd_rate) AS rd_rate,
                    SUM(pon.rd_ot) AS rd_ot,
                    SUM(pon.sd_rate) AS sd_rate,
                    SUM(pon.sd_ot) AS sd_ot,
                    SUM(pon.sdrd_rate) AS sdrd_rate,
                    SUM(pon.sdrd_ot) AS sdrd_ot,
                    SUM(pon.hd_rate) AS hd_rate,
                    SUM(pon.hd_ot) AS hd_ot,
                    SUM(pon.hdrd_rate) AS hdrd_rate,
                    SUM(pon.hdrd_ot) AS hdrd_ot,

                    -- Night Differential
                    SUM(pon.rg_rate_nd) AS rg_rate_nd,
                    SUM(pon.rg_ot_nd) AS rg_ot_nd,
                    SUM(pon.rd_rate_nd) AS rd_rate_nd,
                    SUM(pon.rd_ot_nd) AS rd_ot_nd,
                    SUM(pon.sd_rate_nd) AS sd_rate_nd,
                    SUM(pon.sd_ot_nd) AS sd_ot_nd,
                    SUM(pon.sdrd_rate_nd) AS sdrd_rate_nd,
                    SUM(pon.sdrd_ot_nd) AS sdrd_ot_nd,
                    SUM(pon.hd_rate_nd) AS hd_rate_nd,
                    SUM(pon.hd_ot_nd) AS hd_ot_nd,
                    SUM(pon.hdrd_rate_nd) AS hdrd_rate_nd,
                    SUM(pon.hdrd_ot_nd) AS hdrd_ot_nd,

                    -- Overtime Adjustments
                    SUM(pona.ot_adj_rg_rate)   AS ot_adj_rg_rate,
                    SUM(pona.ot_adj_rg_ot)     AS ot_adj_rg_ot,
                    SUM(pona.ot_adj_rd_rate)   AS ot_adj_rd_rate,
                    SUM(pona.ot_adj_rd_ot)     AS ot_adj_rd_ot,
                    SUM(pona.ot_adj_sd_rate)   AS ot_adj_sd_rate,
                    SUM(pona.ot_adj_sd_ot)     AS ot_adj_sd_ot,
                    SUM(pona.ot_adj_sdrd_rate) AS ot_adj_sdrd_rate,
                    SUM(pona.ot_adj_sdrd_ot)   AS ot_adj_sdrd_ot,
                    SUM(pona.ot_adj_hd_rate)   AS ot_adj_hd_rate,
                    SUM(pona.ot_adj_hd_ot)     AS ot_adj_hd_ot,
                    SUM(pona.ot_adj_hdrd_rate) AS ot_adj_hdrd_rate,
                    SUM(pona.ot_adj_hdrd_ot)   AS ot_adj_hdrd_ot,

                    -- Night Differential Adjustments
                    SUM(pona.nd_adj_rg_rate)   AS nd_adj_rg_rate,
                    SUM(pona.nd_adj_rg_ot)     AS nd_adj_rg_ot,
                    SUM(pona.nd_adj_rd_rate)   AS nd_adj_rd_rate,
                    SUM(pona.nd_adj_rd_ot)     AS nd_adj_rd_ot,
                    SUM(pona.nd_adj_sd_rate)   AS nd_adj_sd_rate,
                    SUM(pona.nd_adj_sd_ot)     AS nd_adj_sd_ot,
                    SUM(pona.nd_adj_sdrd_rate) AS nd_adj_sdrd_rate,
                    SUM(pona.nd_adj_sdrd_ot)   AS nd_adj_sdrd_ot,
                    SUM(pona.nd_adj_hd_rate)   AS nd_adj_hd_rate,
                    SUM(pona.nd_adj_hd_ot)     AS nd_adj_hd_ot,
                    SUM(pona.nd_adj_hdrd_rate) AS nd_adj_hdrd_rate,
                    SUM(pona.nd_adj_hdrd_ot)   AS nd_adj_hdrd_ot,

                    SUM(COALESCE(ep.adj_comp, 0)) AS adj_comp,
                    SUM(COALESCE(ep.taxable_allowances, employee_allowance_totals.taxable_allowances, 0)) AS taxable_allowances,
                    SUM(
                        COALESCE(
                            ep.gross_pay,
                            COALESCE(ep.basic_salary, CAST(NULLIF(eps.main_computation, '') AS DECIMAL(10,2)), 0)
                                - COALESCE(ep.absence_deduction, 0)
                                - COALESCE(ep.late_deduction, 0)
                                - COALESCE(ep.undertime_deduction, 0)
                                + COALESCE(ep.overtime, 0)
                                + COALESCE(ep.adj_comp, 0)
                                + COALESCE(employee_allowance_totals.taxable_allowances, 0)
                                + COALESCE(ep.adj_non_comp, 0)
                                + COALESCE(employee_allowance_totals.non_taxable_allowances, 0),
                            0
                        )
                    ) AS gross_pay,
                    SUM(
                        COALESCE(
                            ep.gross_pay - COALESCE(ep.adj_non_comp, 0) - COALESCE(ep.non_taxable_allowances, employee_allowance_totals.non_taxable_allowances, 0),
                            COALESCE(ep.basic_salary, CAST(NULLIF(eps.main_computation, '') AS DECIMAL(10,2)), 0)
                                - COALESCE(ep.absence_deduction, 0)
                                - COALESCE(ep.late_deduction, 0)
                                - COALESCE(ep.undertime_deduction, 0)
                                + COALESCE(ep.overtime, 0)
                                + COALESCE(ep.adj_comp, 0)
                                + COALESCE(employee_allowance_totals.taxable_allowances, 0),
                            0
                        )
                    ) AS gross_taxable,
                    SUM(COALESCE(ep.adj_non_comp, 0)) AS adj_non_comp,
                    SUM(COALESCE(ep.non_taxable_allowances, employee_allowance_totals.non_taxable_allowances, 0)) AS non_taxable_allowances,

                    SUM(COALESCE(ep.sss_employee, 0)) AS sss_employee,
                    SUM(COALESCE(ep.philhealth_employee, 0)) AS philhealth_employee,
                    SUM(COALESCE(ep.pagibig_employee, 0)) AS pagibig_employee,
                    SUM(COALESCE(ep.tax_withheld, 0)) AS tax_withheld,
                    SUM(COALESCE(ep.sss_employer, 0)) AS sss_employer,
                    SUM(COALESCE(ep.sss_ecc, 0)) AS sss_ecc,
                    SUM(COALESCE(ep.philhealth_employer, 0)) AS philhealth_employer,
                    SUM(COALESCE(ep.pagibig_employer, 0)) AS pagibig_employer,
                    SUM(paa.sss_emp) AS sss_emp_adj,
                    SUM(paa.philhealth_emp) AS philhealth_emp_adj,
                    SUM(paa.pagibig_emp) AS pagibig_emp_adj,
                    SUM(paa.tax_withheld) AS tax_withheld_adj,
                    SUM(paa.sss_employer) AS sss_employer_adj,
                    SUM(paa.sss_ecc) AS sss_ecc_adj,
                    SUM(paa.philhealth_employer) AS philhealth_employer_adj,
                    SUM(paa.pagibig_employer) AS pagibig_employer_adj,

                    SUM(COALESCE(ep.deductions, employee_deduction_totals.deductions, 0)) AS deductions,
                    SUM(COALESCE(ep.loans, 0)) AS loans,
                    SUM(COALESCE(ep.other_deductions, 0)) AS other_deductions,
                    SUM(
                        COALESCE(
                            ep.total_deductions,
                            COALESCE(employee_deduction_totals.deductions, 0)
                                + COALESCE(ep.sss_employee, 0)
                                + COALESCE(ep.philhealth_employee, 0)
                                + COALESCE(ep.pagibig_employee, 0)
                                + COALESCE(ep.tax_withheld, 0)
                                + COALESCE(ep.loans, 0)
                                + COALESCE(ep.other_deductions, 0),
                            0
                        )
                    ) AS total_deductions,
                    SUM(
                        COALESCE(
                            ep.net_pay,
                            (
                                COALESCE(ep.basic_salary, CAST(NULLIF(eps.main_computation, '') AS DECIMAL(10,2)), 0)
                                    - COALESCE(ep.absence_deduction, 0)
                                    - COALESCE(ep.late_deduction, 0)
                                    - COALESCE(ep.undertime_deduction, 0)
                                    + COALESCE(ep.overtime, 0)
                                    + COALESCE(ep.adj_comp, 0)
                                    + COALESCE(employee_allowance_totals.taxable_allowances, 0)
                                    + COALESCE(ep.adj_non_comp, 0)
                                    + COALESCE(employee_allowance_totals.non_taxable_allowances, 0)
                            )
                            - (
                                COALESCE(employee_deduction_totals.deductions, 0)
                                    + COALESCE(ep.sss_employee, 0)
                                    + COALESCE(ep.philhealth_employee, 0)
                                    + COALESCE(ep.pagibig_employee, 0)
                                    + COALESCE(ep.tax_withheld, 0)
                                    + COALESCE(ep.loans, 0)
                                    + COALESCE(ep.other_deductions, 0)
                            ),
                            0
                        )
                    ) AS net_pay,
                    MAX(ep.payroll_status) AS payroll_status,

                    -- Computation
                    MAX(eps.main_computation) AS main_computation,

                    -- Employee info
                    e.first_name,
                    e.last_name,
                    e.emp_code,

                    -- Employment info
                    ee.branch,
                    ee.division,
                    ee.department,
                    ee.class,
                    ee.company,

                    -- Account info
                    ea.projects,
                    ea.salary_type

                FROM employee_payroll ep
                JOIN employees e ON ep.employee_id = e.employee_id
                LEFT JOIN employee_payroll_settings eps ON eps.employee_id = ep.employee_id
                LEFT JOIN employee_employment ee ON ee.employee_id = ep.employee_id
                LEFT JOIN employee_accounts ea ON ea.employee_id = ep.employee_id
                LEFT JOIN employee_tax_insurance eti ON eti.employee_id = ep.employee_id
                LEFT JOIN tax_exemptions_table tet ON tet.description = eti.tax_status
                LEFT JOIN (
                    SELECT
                        employee_allowances.employee_id,
                        SUM(CASE WHEN allowance_types.is_taxable = 1 THEN employee_allowances.amount ELSE 0 END) AS taxable_allowances,
                        SUM(CASE WHEN allowance_types.is_taxable = 1 THEN 0 ELSE employee_allowances.amount END) AS non_taxable_allowances
                    FROM employee_allowances
                    LEFT JOIN allowance_types ON allowance_types.allowance_type_id = employee_allowances.allowance_type_id
                    GROUP BY employee_allowances.employee_id
                ) employee_allowance_totals ON employee_allowance_totals.employee_id = ep.employee_id
                LEFT JOIN (
                    SELECT
                        employee_id,
                        SUM(amount) AS deductions
                    FROM employee_deductions
                    GROUP BY employee_id
                ) employee_deduction_totals ON employee_deduction_totals.employee_id = ep.employee_id
                LEFT JOIN payroll_ot_nd pon ON pon.employee_id = ep.employee_id AND pon.run_id = ep.run_id
                LEFT JOIN payroll_ot_nd_adjustments pona ON pona.employee_id = ep.employee_id AND pona.run_id = ep.run_id
                LEFT JOIN payroll_attendance_adjustments paa ON paa.employee_id = ep.employee_id AND paa.run_id = ep.run_id

                WHERE ${whereClauses.join(" AND ")}

                GROUP BY
                    ep.employee_id,
                    e.first_name,
                    e.last_name,
                    e.emp_code,
                    ee.branch,
                    ee.division,
                    ee.department,
                    ee.class,
                    ee.company,
                    ea.projects,
                    ea.salary_type,
                    tet.code

                ORDER BY ${orderClause};
            `;

            const [rows] = await conn.query(query, queryValues);
            conn.release();

            res.json({
            success: true,
            employees: rows
            });

        } catch (err) {
            console.error("Error fetching payroll journal employees:", err);
            res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
            });
        }
    });

    // -------------------------------
    // PDF PRINT ROUTE (Puppeteer)
    // -------------------------------
    const puppeteer = require('puppeteer'); // Make sure puppeteer is installed

    app.post('/api/payroll_journal/pdf', async (req, res) => {
        try {
            const { headerHtml, tableHtml, paperSize = 'legal', landscape = true } = req.body;

            if (!headerHtml || !tableHtml) {
                return res.status(400).json({ success: false, message: "Missing header or table HTML" });
            }

            const browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();

            const htmlContent = `
                <html>
                <head>
                    <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h3 { margin: 0; font-weight: 700; }
                    p { font-size: 13px; color: #555; margin: 5px 0 20px 0; }

                    .journal-table thead th { text-align: center; }
                    table { width: 100%; border-collapse: collapse; font-size: 9px; }
                    table, th, td { border: 1px solid black; }
                    th, td { padding: 4px 5px; text-align: left; vertical-align: middle; }
                    th { background-color: #c0c0c0; }
                    thead { display: table-header-group; }

                    .company-row { page-break-inside: avoid; background-color: #e6e6e6; }
                    .group-row { page-break-inside: avoid; background-color: #f9f9f9; }
                    .subtotal-row { page-break-inside: avoid; background-color: #f9f9f9; }
                    .subtotal-company-row { page-break-inside: avoid; background-color: #d9edf7; }
                    .grand-total-row { background-color: #eef6ee; }

                    .journal-header { display: flex; justify-content: center; align-items: center; margin-bottom: 15px; }
                    .journal-header-center { text-align: center; }
                    .journal-header-center h3 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
                    .journal-header-center p { font-size: 13px; color: #555; }
                    .report-export-header { text-align: center; margin-bottom: 8px; }
                    .report-export-header h2 { margin: 0 0 4px; font-size: 17px; }
                    .report-export-header p { margin: 2px 0; font-size: 11px; color: #333; }
                    .report-signatories { page-break-inside: avoid; }
                    </style>
                </head>
                <body>
                    ${headerHtml}
                    ${tableHtml}
                </body>
                </html>
            `;

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

            const pdfBuffer = await page.pdf({
            format: paperSize,
            landscape: landscape,
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: `<div style="width:100%; font-family: Arial, sans-serif; font-size:9px; padding:0 20px; text-align:right;">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
            `,
            footerTemplate: `<div></div>`, // keep empty if footer is not needed
            margin: { top: '36px', right: '14px', bottom: '28px', left: '14px' }
            });

            await browser.close();

            // Send PDF to client
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename=Payroll_Journal.pdf',
                'Content-Length': pdfBuffer.length
            });

            res.send(pdfBuffer);
        } catch (err) {
            console.error("Error generating PDF:", err);
            res.status(500).json({ success: false, message: "Failed to generate PDF", error: err.message });
        }
    });
}

let currentEmployees = [];

function fullName(emp) {
  return `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
}

function getSelectedEmployee(inputId = "summaryEmployee") {
  const input = document.getElementById(inputId);
  if (!input) return null;

  const value = input.value.trim();
  if (!value) return null;

  return currentEmployees.find(emp => emp.display === value) || null;
}

function clearEmployeeInput(inputId = "summaryEmployee", nameId = "summaryEmployeeName") {
  const input = document.getElementById(inputId);
  const name = document.getElementById(nameId);
  const list = document.getElementById(`${inputId}List`);

  if (input) input.value = "";
  if (name) name.value = "";
  if (list) list.innerHTML = "";
  currentEmployees = [];
}

async function loadEmployeeSuggestions({
  inputId = "summaryEmployee",
  listId = "summaryEmployeeList",
  nameId = "summaryEmployeeName",
  q = "",
  run_id = "",
  run_ids = "",
  company = "",
  location = "",
  branch = "",
  division = "",
  department = "",
  empClass = "",
  position = "",
  empType = "",
  salaryType = "",
  option = "active"
} = {}) {
  const list = document.getElementById(listId);
  const nameInput = document.getElementById(nameId);

  if (!list) return;

  const qs = new URLSearchParams();

  if (q) qs.set("q", q);
  if (run_id) qs.set("run_id", run_id);
  if (run_ids) qs.set("run_ids", run_ids);
  if (company) qs.set("company", company);
  if (location) qs.set("location", location);
  if (branch) qs.set("branch", branch);
  if (division) qs.set("division", division);
  if (department) qs.set("department", department);
  if (empClass) qs.set("class", empClass);
  if (position) qs.set("position", position);
  if (empType) qs.set("empType", empType);
  if (salaryType) qs.set("salaryType", salaryType);
  if (option) qs.set("option", option);

  const res = await fetch(`/api/employee_autocomplete?${qs.toString()}`);
  const data = await res.json();

  list.innerHTML = "";
  currentEmployees = data.success ? data.employees || [] : [];

  currentEmployees.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp.display;
    list.appendChild(opt);
  });

  const selected = getSelectedEmployee(inputId);
  if (nameInput) {
    nameInput.value = selected ? selected.full_name : "";
  }
}



