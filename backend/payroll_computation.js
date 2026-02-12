module.exports = function (app, pool) {
    // Helper: For audit logs
    async function logAudit(pool, user_id, admin_name, action, status) {
        if (!user_id || !admin_name) {
            console.error("🚫 logAudit aborted: Missing user_id or admin_name");
            return; // Don’t try to insert invalid data
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.execute(
            "INSERT INTO audit_logs (user_id, admin_name, action, status) VALUES (?, ?, ?, ?)",
            [user_id, admin_name, action, status]
            );
            console.log(`✅ Audit logged: ${admin_name} → ${action}`);
        } catch (err) {
            console.error("❌ Failed to log audit:", err.message);
        } finally {
            if (conn) conn.release();
        }
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

    // GET run_id based on the filters
    app.get("/api/get_run_id_payroll_computation", async (req, res) => {
        const { payroll_group, payroll_period, month, year } = req.query;

        if (!payroll_group || !payroll_period || !month || !year) {
            return res.status(400).json({ success: false, message: "All filters (payroll_group, payroll_period, month, year) are required" });
        }

        try {
            // Query the payroll_runs table to find the run_id based on the filters
            const query = `
                SELECT run_id 
                FROM payroll_runs 
                WHERE group_id = ? 
                AND period_id = ? 
                AND month_id = ? 
                AND year_id = ?
            `;
            
            const params = [payroll_group, payroll_period, month, year];
            const conn = await pool.getConnection();
            const [rows] = await conn.query(query, params);
            conn.release();

            if (rows.length > 0) {
                res.json({ success: true, run_id: rows[0].run_id }); // Return the first found run_id
            } else {
                res.json({ success: false, message: "No matching payroll run found" });
            }
        } catch (err) {
            console.error("Error fetching run_id:", err);
            res.status(500).json({ success: false, message: "Server error", error: err.message });
        }
    });

    // GET filtered employees from the employee_payroll based on payroll_runs
    app.get("/api/employees_for_payroll_run", async (req, res) => {
        const { run_id, status } = req.query;

        if (!run_id) {
            return res.status(400).json({ success: false, message: "run_id is required" });
        }

        try {
            let query = `
                SELECT ep.employee_id, e.first_name, e.last_name, e.emp_code
                FROM employee_payroll ep
                JOIN employees e ON ep.employee_id = e.employee_id
                JOIN employee_employment ee ON ep.employee_id = ee.employee_id
                JOIN employee_accounts ea ON ep.employee_id = ea.employee_id
                WHERE ep.run_id = ?
            `;

            const params = [run_id];

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
                if (value) {
                    query += ` AND ${f.column} = ?`;
                    params.push(value);
                }
            });

            if (status === "active") {
            query += `
                AND e.status = 'Active'
                AND (ep.payroll_status != 'Hold' OR ep.payroll_status IS NULL)
            `;
            } else if (status === "hold") {
            query += " AND ep.payroll_status = 'Hold'";
            }

            query += " ORDER BY e.first_name, e.last_name ASC";

            const conn = await pool.getConnection();
            const [rows] = await conn.query(query, params);
            conn.release();

            if (rows.length > 0) {
            res.json({ success: true, employees: rows });
            } else {
            res.json({ success: false, message: "No employees found for this payroll run" });
            }
        } catch (err) {
            console.error("Error fetching employees for payroll run:", err);
            res.status(500).json({ success: false, message: "Server error", error: err.message });
        }
    });

    // === FETCHING AND CREATING PAYROLL RUNS/RECORD INSIDE payroll_runs ===
    // GET /api/payroll_runs?group_id=&period_id=&month_id=&year_id=
    app.get("/api/payroll_runs", async (req, res) => {
        const { group_id, period_id, month_id, year_id } = req.query;

        try {
            const conn = await pool.getConnection();
            const [rows] = await conn.query(
                `SELECT * FROM payroll_runs WHERE group_id = ? AND period_id = ? AND month_id = ? AND year_id = ? LIMIT 1`,
                [group_id, period_id, month_id, year_id]
            );

            conn.release();
            
            if (rows.length > 0) return res.json({ success: true, run: rows[0] });
            return res.status(404).json({ success: false, message: "Not found" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });

    // POST /api/payroll_runs
    app.post("/api/payroll_runs", async (req, res) => {
        const { group_id, period_id, month_id, year_id, payroll_range, user_id, admin_name } = req.body;

        try {
            const conn = await pool.getConnection();
            await conn.beginTransaction();

            // double-check if run already exists
            const [existing] = await conn.query(
            `SELECT run_id FROM payroll_runs WHERE group_id=? AND period_id=? AND month_id=? AND year_id=? LIMIT 1`,
            [group_id, period_id, month_id, year_id]
            );

            if (existing.length > 0) {
                await conn.rollback();
                conn.release();
                return res.json({ success: true, run_id: existing[0].run_id, message: "Existing run found" });
            }

            const [r] = await conn.query(
                `INSERT INTO payroll_runs (group_id, period_id, month_id, year_id, payroll_range, status)
                VALUES (?, ?, ?, ?, ?, 'Pending')`,
                [group_id, period_id, month_id, year_id, payroll_range]
            );

            // ==================== LOG AUDIT ====================
            // Construct audit text for payroll creation
            const auditText = `Payroll run created (${payroll_range})`;

            // Log audit
            await logAudit(pool, user_id, admin_name, auditText, "Success");
            await conn.commit();
            conn.release();
            return res.json({ success: true, run_id: r.insertId, message: "Payroll run created", run: { run_id: r.insertId }});
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });

    // === FETCHING AND CREATING LIST OF EMPLOYEES INSIDE employee_payroll ===
    // GET /api/payroll_runs/:run_id/employees
    app.get("/api/payroll_runs/:run_id/employees", async (req, res) => {
        const { run_id } = req.params;

        try {
            const conn = await pool.getConnection();

            const [rows] = await conn.query(
                `SELECT ep.employee_id, e.first_name, e.last_name, e.emp_code
                FROM employee_payroll ep
                JOIN employees e ON ep.employee_id = e.employee_id
                WHERE ep.run_id = ?`,
                [run_id]
            );

            conn.release();

            return res.json({
                success: true,
                exists: rows.length > 0,
                employees: rows
            });

        } catch (err) {
            console.error("Error checking payroll run employees:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }
    });

    // POST /api/payroll_runs/:run_id/employees
    app.post("/api/payroll_runs/:run_id/employees", async (req, res) => {
        const { run_id } = req.params;
        const { employees } = req.body;

        if (!Array.isArray(employees) || employees.length === 0) {
            return res.status(400).json({ success: false, message: "No employees provided" });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            const insertQuery = `
                INSERT INTO employee_payroll (run_id, employee_id, payroll_status)
                VALUES (?, ?, 'Active')
            `;

            for (const empId of employees) {
                await conn.query(insertQuery, [run_id, empId]);
            }

            await conn.commit();
            conn.release();

            return res.json({ success: true, message: "Employees added to payroll" });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error("Error inserting payroll run employees:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }
    });

    // GET employees with negative net pay
    app.get("/api/employees_negative_netpay", async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();

            const [rows] = await conn.query(`
            SELECT 
                ep.employee_id,
                e.emp_code,
                e.last_name,
                e.first_name,
                ep.net_pay
            FROM employee_payroll ep
            JOIN employees e 
                ON ep.employee_id = e.employee_id
            WHERE ep.net_pay < 0
                AND ep.payroll_status = 'active'
            `);

            res.json({
            success: true,
            employees: rows // empty array is OK
            });

        } catch (err) {
            console.error("Negative net pay check error:", err);
            res.status(500).json({
            success: false,
            message: "Server error"
            });
        } finally {
            if (conn) conn.release();
        }
    });

    // POST to update payroll_status to 'Hold' for selected employees
    app.post("/api/employee_payroll/hold_negative", async (req, res) => {
        const { employeeIds } = req.body; // Expecting an array of IDs
        if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({ success: false, message: "No employees selected" });
        }

        let conn;
        try {
            conn = await pool.getConnection();

            await conn.query(`
                UPDATE employee_payroll
                SET payroll_status = 'Hold'
                WHERE employee_id IN (?) 
                AND net_pay < 0
                AND payroll_status = 'Active'
            `, [employeeIds]);

            res.json({ success: true });
        } catch (err) {
            console.error("Hold negative payroll error:", err);
            res.status(500).json({ success: false, message: "Server error" });
        } finally {
            if (conn) conn.release();
        }
    });

    // GET filtered employees for payroll computation
    app.get("/api/employees_for_payroll", async (req, res) => {
        const {
            payroll_period,
            company,
            location,
            branch,
            division,
            department,
            class: empClass,
            position,
            empType,
            salaryType,
            employee,
            option, // all / active / hold
            run_id,
            search,
            searchBy
        } = req.query;

        let orderColumn = "e.emp_code"; // default sorting

        let query = `
            SELECT DISTINCT
                e.employee_id,
                e.emp_code,
                e.last_name,
                e.first_name,
                ee.company,
                ee.department,
                ee.position,
                e.status
            FROM employees e
            LEFT JOIN employee_employment ee ON e.employee_id = ee.employee_id
            LEFT JOIN employee_accounts ea ON e.employee_id = ea.employee_id
            LEFT JOIN employee_payroll_settings eps ON e.employee_id = eps.employee_id
        `;

        const params = [];

        if (run_id) {
            query += `
                JOIN employee_payroll ep
                ON ep.employee_id = e.employee_id
                AND ep.run_id = ?
            `;
            params.push(run_id);
        } else {
            query += `
                LEFT JOIN employee_payroll ep
                ON ep.employee_id = e.employee_id
            `;
        }

        const normalizedSearch = (search || "").trim();
        const normalizedSearchBy = (searchBy || "").trim();

        const SEARCH_COLUMNS = {
            employee_id: "e.emp_code",
            last_name: "e.last_name",
            first_name: "e.first_name"
        };

        const searchColumn = SEARCH_COLUMNS[normalizedSearchBy] || null;

        query += ` WHERE 1=1 `;

        if (payroll_period) { query += " AND eps.payroll_period = ?"; params.push(payroll_period); }
        if (company) { query += " AND ee.company = ?"; params.push(company); }
        if (location) { query += " AND ee.location = ?"; params.push(location); }
        if (branch) { query += " AND ee.branch = ?"; params.push(branch); }
        if (division) { query += " AND ee.division = ?"; params.push(division); }
        if (department) { query += " AND ee.department = ?"; params.push(department); }
        if (empClass) { query += " AND ee.class = ?"; params.push(empClass); }
        if (position) { query += " AND ee.position = ?"; params.push(position); }
        if (empType) { query += " AND ee.employee_type = ?"; params.push(empType); }
        if (salaryType) { query += " AND ea.salary_type = ?"; params.push(salaryType); }
        if (employee) { query += " AND e.employee_id = ?"; params.push(employee); }

        if (option === "active") {
            query += " AND (e.status = 'Active' AND (ep.payroll_status != 'Hold' OR ep.payroll_status IS NULL))";
        }
        else if (option === "hold") query += " AND ep.payroll_status = 'Hold'";

        if (normalizedSearch && searchColumn) {
            query += ` AND ${searchColumn} LIKE ?`;
            params.push(`%${normalizedSearch}%`);
        }

        query += ` ORDER BY ${orderColumn} ASC`;

        try {
            const conn = await pool.getConnection();
            const [rows] = await conn.query(query, params);
            conn.release();

            res.json({ success: true, employees: rows });
        } catch (err) {
            console.error("Error fetching employees for payroll:", err);
            res.status(500).json({ success: false, message: "Server error", error: err.message });
        }
    });
    
    // GET payroll settings for one employee
    app.get("/api/employee_payroll_settings/:employeeId", async (req, res) => {
        const { employeeId } = req.params;
        const { periodOption, run_id } = req.query;

        try {
            const conn = await pool.getConnection();

            // Fetch main payroll settings
            const [rows] = await conn.query(
                `SELECT e.employee_id,
                        ep.payroll_status,
                        ep.absence_time,
                        ep.absence_deduction,
                        ep.late_time,
                        ep.late_deduction,
                        ep.undertime,
                        ep.undertime_deduction,
                        ep.overtime,
                        ep.adj_comp,
                        ep.adj_non_comp,
                        ep.total_leaves_used,
                        ep.loans,
                        ep.other_deductions,
                        ep.premium_adj,
                        eps.payroll_period, 
                        eps.main_computation,
                        eps.days_in_year_ot,
                        eps.days_in_year,
                        eps.days_in_week,
                        eps.hours_in_day,
                        eps.week_in_year
                FROM employees e
                LEFT JOIN employee_payroll ep ON e.employee_id = ep.employee_id AND ep.run_id = ?
                LEFT JOIN employee_payroll_settings eps ON e.employee_id = eps.employee_id
                WHERE e.employee_id = ?`,
                [run_id, employeeId]
            );

            if (rows.length === 0) {
                conn.release();
                return res.json({ success: false, message: "No payroll data found for this employee." });
            }

            const employee = rows[0];

            // Fetch OT / ND record for this employee and run_id
            const [otNdRows] = await conn.query(`
                SELECT *
                FROM payroll_ot_nd
                WHERE employee_id = ? AND run_id = ?
                LIMIT 1
            `, [employee.employee_id, run_id]);

            employee.ot_nd = otNdRows.length > 0 ? otNdRows[0] : null;

            // Fetch OT / ND adjustment record for this employee and run_id
            const [otNdAdjRows] = await conn.query(`
                SELECT *
                FROM payroll_ot_nd_adjustments
                WHERE employee_id = ? AND run_id = ?
                LIMIT 1
            `, [employee.employee_id, run_id]);

            employee.ot_nd_adj = otNdAdjRows.length > 0 ? otNdAdjRows[0] : null;

            // Fetch Attendance Adjustment record for this employee and run_id
            const [attAdjRows] = await conn.query(`
                SELECT *
                FROM payroll_attendance_adjustments
                WHERE employee_id = ? AND run_id = ?
                LIMIT 1
            `, [employee.employee_id, run_id]);

            employee.attendance_adj = attAdjRows.length > 0 ? attAdjRows[0] : null;

            // Get contributions by employee_id
            const [contributions] = await pool.query(
                `SELECT emp_contribution_id, contribution_type_id, enabled, period,
                        type_option, computation, ee_share, er_share, ecc, annualize
                FROM employee_contributions
                WHERE employee_id = ?`,
                [employee.employee_id, run_id]
            );

            // GET previous YTD values based on actual payroll order
            const [prevYtdRows] = await conn.query(`
                SELECT ep.ytd_sss, ep.ytd_wtax, ep.ytd_philhealth, ep.ytd_gsis, ep.ytd_pagibig, ep.ytd_gross
                FROM employee_payroll ep
                JOIN payroll_runs pr ON pr.run_id = ep.run_id
                JOIN payroll_runs current_run ON current_run.run_id = ?
                WHERE ep.employee_id = ?
                    AND pr.status != 'Pending'
                    AND pr.group_id = current_run.group_id
                    AND pr.year_id = current_run.year_id
                    AND (pr.month_id, pr.period_id) < (current_run.month_id, current_run.period_id)
                ORDER BY pr.year_id DESC, pr.month_id DESC, pr.period_id DESC
                LIMIT 1
            `, [run_id, employee.employee_id]);

            employee.previousYtd = prevYtdRows[0] || {
                ytd_sss: 0,
                ytd_wtax: 0,
                ytd_philhealth: 0,
                ytd_gsis: 0,
                ytd_pagibig: 0,
                ytd_gross: 0
            };

            // === FILTER CONTRIBUTIONS BASED ON periodOption ===
            if (periodOption && periodOption.toLowerCase() === "first half") {
                // Include contributions for "First Half" or "Both"
               employee.contributions = (contributions || []).filter(c =>
                    ["first half", "both"].includes((c.period || "").toLowerCase())
                );
            } else if (periodOption && periodOption.toLowerCase() === "second half") {
                // Include contributions for "Second Half" or "Both"
               employee.contributions = (contributions || []).filter(c =>
                    ["second half", "both"].includes((c.period || "").toLowerCase())
                );
            } else {
                // No filtering (return all)
                employee.contributions = contributions || [];
            }

            // === Auto-compute Contribution if type_option = 'Computed' ===
            function getContributionRecord(contributions, typeId) {
                return contributions.find(c => c.contribution_type_id === typeId);
            }

            function shouldCompute(record) {
                return record && (record.type_option || "").toLowerCase() === "computed";
            }

            const sssRecord = getContributionRecord(contributions, 1);
            const pagibigRecord = getContributionRecord(contributions, 2);
            const philhealthRecord = getContributionRecord(contributions, 3);

            const computeSSS = shouldCompute(sssRecord);
            const computePagibig = shouldCompute(pagibigRecord);
            const computePhilhealth = shouldCompute(philhealthRecord);

            if (computeSSS) {
                // STEP 1: Get main computation (salary) + period
                const [mainRow] = await conn.query(
                    `SELECT main_computation, payroll_period 
                    FROM employee_payroll_settings 
                    WHERE employee_id = ? LIMIT 1`,
                    [employeeId]
                );

                let computedBasic = parseFloat(mainRow[0]?.main_computation || 0);
                const period = (mainRow[0]?.payroll_period || "").toLowerCase();

                // Apply your same divisor adjustments
                if (period === "weekly") computedBasic /= 4;
                else if (period === "semi-monthly") computedBasic /= 2;

                // STEP 2: Lookup SSS table
                const [sssTableMatch] = await conn.query(
                    `SELECT ee_share, er_share, ecc
                    FROM sss_contribution_table
                    WHERE ? BETWEEN salary_low AND salary_high
                    LIMIT 1`,
                    [computedBasic]
                );

                if (sssTableMatch && sssTableMatch.length > 0) {
                    const match = sssTableMatch[0];

                    // If no SSS record exists, create one in memory
                    if (!sssRecord) {
                        contributions.push({
                            contribution_type_id: 1,
                            type_option: "Computed",
                            ee_share: match.ee_share,
                            er_share: match.er_share,
                            ecc: match.ecc
                        });
                    } else {
                        // If record exists but type_option = 'Computed', override values
                        sssRecord.ee_share = match.ee_share;
                        sssRecord.er_share = match.er_share;
                        sssRecord.ecc = match.ecc;
                    }
                }
            }
            
            if (computePagibig) {
                // STEP 1: Get main computation (salary) + period
                const [mainRow] = await conn.query(
                    `SELECT main_computation, payroll_period 
                    FROM employee_payroll_settings 
                    WHERE employee_id = ? LIMIT 1`,
                    [employeeId]
                );

                let computedBasic = parseFloat(mainRow[0]?.main_computation || 0);
                const period = (mainRow[0]?.payroll_period || "").toLowerCase();

                // Apply your same divisor adjustments
                if (period === "weekly") computedBasic /= 4;
                else if (period === "semi-monthly") computedBasic /= 2;

                // STEP 2: Lookup Pag-Ibig table
                const [pagibigTableMatch] = await conn.query(
                    `SELECT ee_share, er_share
                    FROM pagibig_contribution_table
                    WHERE ? BETWEEN salary_low AND salary_high
                    LIMIT 1`,
                    [computedBasic]
                );

                if (pagibigTableMatch && pagibigTableMatch.length > 0) {
                    const match = pagibigTableMatch[0];
                    // If no Pag-Ibig record exists, create one in memory
                    if (!pagibigRecord) {
                        contributions.push({
                            contribution_type_id: 1,
                            type_option: "Computed",
                            ee_share: match.ee_share,
                            er_share: match.er_share
                        });
                    } else if (pagibigRecord.type_option == "Computed" && pagibigRecord.computation == null) {
                        pagibigRecord.ee_share = match.ee_share;
                        pagibigRecord.er_share = match.er_share;
                    }
                }
            }
            
            if (computePhilhealth) {
                // STEP 1: Get main computation (salary) + period
                const [mainRow] = await conn.query(
                    `SELECT main_computation, payroll_period 
                    FROM employee_payroll_settings 
                    WHERE employee_id = ? LIMIT 1`,
                    [employeeId]
                );

                let computedBasic = parseFloat(mainRow[0]?.main_computation || 0);
                const period = (mainRow[0]?.payroll_period || "").toLowerCase();

                // Apply your same divisor adjustments
                if (period === "weekly") computedBasic /= 4;
                else if (period === "semi-monthly") computedBasic /= 2;

                // STEP 2: Lookup PhilHealth table
                const [philhealthTableMatch] = await conn.query(
                    `SELECT ee_share, er_share
                    FROM philhealth_contribution_table
                    WHERE ? BETWEEN salary_low AND salary_high
                    LIMIT 1`,
                    [computedBasic]
                );

                if (philhealthTableMatch && philhealthTableMatch.length > 0) {
                    const match = philhealthTableMatch[0];

                    // If no PhilHealth record exists, create one in memory
                    if (!philhealthRecord) {
                        contributions.push({
                            contribution_type_id: 1,
                            type_option: "Computed",
                            ee_share: match.ee_share,
                            er_share: match.er_share
                        });
                    } else {
                        philhealthRecord.ee_share = match.ee_share;
                        philhealthRecord.er_share = match.er_share;
                    }
                }
            }

            // Check if there is a payroll record for this employee and run_id
            const [employeePayroll] = await pool.query(`
                SELECT *
                FROM employee_payroll
                WHERE employee_id = ? AND run_id = ?
            `, [employee.employee_id, run_id]);

            let allAllowances = [];
            let allDeductions = [];

            if (employeePayroll.length > 0 && employeePayroll[0].basic_salary !== null) {
                // Payroll record exists → use payroll-specific allowances/deductions
                const payrollId = employeePayroll[0].payroll_id;
                
                const [payrollAllowances] = await pool.query(`
                    SELECT epa.*, at.allowance_name, at.is_taxable
                    FROM employee_payroll_allowances epa
                    LEFT JOIN allowance_types at ON epa.allowance_type_id = at.allowance_type_id
                    WHERE epa.employee_id = ? AND epa.payroll_id = ?
                `, [employee.employee_id, payrollId]);
                
                const [payrollDeductions] = await pool.query(`
                    SELECT epd.*, dt.deduction_name
                    FROM employee_payroll_deductions epd
                    LEFT JOIN deduction_types dt ON epd.deduction_type_id = dt.deduction_type_id
                    WHERE epd.employee_id = ? AND epd.payroll_id = ?
                `, [employee.employee_id, payrollId]);

                allAllowances = payrollAllowances.map(a => ({ ...a, isPayrollOverride: true }));
                allDeductions = payrollDeductions.map(d => ({ ...d, isPayrollOverride: true }));
            } else {
                // Payroll record does not exist → use default allowances/deductions
                const [allowances] = await pool.query(`
                    SELECT ea.*, at.allowance_name, at.is_taxable
                    FROM employee_allowances ea
                    JOIN allowance_types at ON ea.allowance_type_id = at.allowance_type_id
                    WHERE ea.employee_id = ?
                    ORDER BY ea.emp_allowance_id ASC
                `, [employee.employee_id]);
                allAllowances = allowances;

                const [deductions] = await pool.query(`
                    SELECT ed.*, dt.deduction_name
                    FROM employee_deductions ed
                    JOIN deduction_types dt ON ed.deduction_type_id = dt.deduction_type_id
                    WHERE ed.employee_id = ?
                    ORDER BY ed.emp_deduction_id ASC
                `, [employee.employee_id]);
                allDeductions = deductions;
            }

            // === FILTER ALLOWANCES & DEDUCTIONS BASED ON periodOption ===
            if (periodOption && periodOption.toLowerCase() === "first half") {
                employee.allowances = allAllowances.filter(a =>
                    ["first half", "both"].includes((a.period || "").toLowerCase())
                );
                employee.deductions = allDeductions.filter(d =>
                    ["first half", "both"].includes((d.period || "").toLowerCase())
                );
            } else if (periodOption && periodOption.toLowerCase() === "second half") {
                employee.allowances = allAllowances.filter(a =>
                    ["second half", "both"].includes((a.period || "").toLowerCase())
                );
                employee.deductions = allDeductions.filter(d =>
                    ["second half", "both"].includes((d.period || "").toLowerCase())
                );
            } else {
                // No filtering (return all)
                employee.allowances = allAllowances;
                employee.deductions = allDeductions;
            }

            conn.release();

            return res.json({ success: true, data: employee });
        } catch (err) {
            console.error("Error fetching payroll settings:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }
    });
    
    // === UPDATE PAYROLL EMPLOYEE DETAILS FOR A SPECIFIC EMPLOYEE ON A SPECIFIC RUN ===
    app.put("/api/update_employee_payroll/:employeeId", async (req, res) => {
        const { employeeId } = req.params;
        const {
            run_id, basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction, 
            overtime, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
            gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
            pagibig_employee, pagibig_employer, pagibig_ecc, philhealth_employee, philhealth_employer, philhealth_ecc,
            tax_withheld, total_deductions, loans, other_deductions, premium_adj,
            ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
            payroll_status, gross_pay, grand_total_deductions, net_pay, ot_nd, ot_nd_adj, att_adj,
            periodOption, allowances, deductions, user_id, admin_name
        } = req.body;

        const periodToUse = periodOption || null;
        let conn;

        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // check existing
            const [existing] = await conn.query(
                `SELECT 
                    ep.payroll_id,
                    GROUP_CONCAT(epa.payroll_id) AS allowance_ids,
                    GROUP_CONCAT(epd.payroll_id) AS deduction_ids
                FROM employee_payroll ep
                LEFT JOIN employee_payroll_allowances epa ON ep.payroll_id = epa.payroll_id
                LEFT JOIN employee_payroll_deductions epd ON ep.payroll_id = epd.payroll_id
                WHERE ep.employee_id = ? AND ep.run_id = ?
                GROUP BY ep.payroll_id
                LIMIT 1`,
                [employeeId, run_id]
            );

            if (existing.length > 0) {
                // UPDATE existing payroll record
                await conn.query(
                    `UPDATE employee_payroll SET
                        basic_salary = ?, absence_time = ?, absence_deduction = ?, late_time = ?, late_deduction = ?, undertime = ?, undertime_deduction = ?, 
                        overtime = ?, taxable_allowances = ?, non_taxable_allowances = ?, adj_comp = ?, adj_non_comp = ?, total_leaves_used = ?,
                        gsis_employee = ?, gsis_employer = ?, gsis_ecc = ?, sss_employee = ?, sss_employer = ?, sss_ecc = ?,
                        pagibig_employee = ?, pagibig_employer = ?, pagibig_ecc = ?, philhealth_employee = ?, philhealth_employer = ?, philhealth_ecc = ?,
                        tax_withheld = ?, deductions = ?, loans = ?, other_deductions = ?, premium_adj = ?,
                        ytd_sss = ?, ytd_wtax = ?, ytd_philhealth = ?, ytd_gsis = ?, ytd_pagibig = ?, ytd_gross = ?,
                        payroll_status = ?, gross_pay = ?, total_deductions = ?, net_pay = ?
                    WHERE employee_id = ? AND run_id = ?`,
                    [
                        basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction,
                        overtime, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
                        gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
                        pagibig_employee, pagibig_employer, pagibig_ecc, philhealth_employee, philhealth_employer, philhealth_ecc,
                        tax_withheld, total_deductions, loans, other_deductions, premium_adj,
                        ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
                        payroll_status || "null", gross_pay, grand_total_deductions, net_pay,
                        employeeId, run_id, existing[0].payroll_id
                    ]
                );

                payrollId = existing[0].payroll_id;

                // ==================== OT/ND SAVING ====================
                const OT_ND_COLUMNS = [
                    // OVERTIME AMOUNT
                    "rg_rate", "rg_ot",
                    "rd_rate", "rd_ot",
                    "sd_rate", "sd_ot",
                    "sdrd_rate", "sdrd_ot",
                    "hd_rate", "hd_ot",
                    "hdrd_rate", "hdrd_ot",

                    // NIGHT DIFFERENTIAL AMOUNT
                    "rg_rate_nd", "rg_ot_nd",
                    "rd_rate_nd", "rd_ot_nd",
                    "sd_rate_nd", "sd_ot_nd",
                    "sdrd_rate_nd", "sdrd_ot_nd",
                    "hd_rate_nd", "hd_ot_nd",
                    "hdrd_rate_nd", "hdrd_ot_nd",

                    // OVERTIME TIME
                    "rg_rate_time", "rg_ot_time",
                    "rd_rate_time", "rd_ot_time",
                    "sd_rate_time", "sd_ot_time",
                    "sdrd_rate_time", "sdrd_ot_time",
                    "hd_rate_time", "hd_ot_time",
                    "hdrd_rate_time", "hdrd_ot_time",

                    // NIGHT DIFFERENTIAL TIME
                    "rg_rate_nd_time", "rg_ot_nd_time",
                    "rd_rate_nd_time", "rd_ot_nd_time",
                    "sd_rate_nd_time", "sd_ot_nd_time",
                    "sdrd_rate_nd_time", "sdrd_ot_nd_time",
                    "hd_rate_nd_time", "hd_ot_nd_time",
                    "hdrd_rate_nd_time", "hdrd_ot_nd_time"
                ];

                function normalizeOTNDData(ot_nd) {
                    const data = {};

                    OT_ND_COLUMNS.forEach(col => {
                        data[col] = Number(ot_nd[col]) || 0;
                    });

                    return data;
                }

                if (ot_nd && typeof ot_nd === "object") {
                    const data = normalizeOTNDData(ot_nd);

                    // Check existing
                    const [rows] = await conn.query(
                        `SELECT ot_nd_id FROM payroll_ot_nd
                        WHERE employee_id = ? AND run_id = ?
                        LIMIT 1`,
                        [employeeId, run_id]
                    );

                    if (rows.length > 0) {
                        // UPDATE
                        const setClause = OT_ND_COLUMNS
                            .map(col => `${col} = ?`)
                            .join(", ");

                        const values = [
                            ...OT_ND_COLUMNS.map(col => data[col]),
                            employeeId,
                            run_id
                        ];

                        await conn.query(
                            `UPDATE payroll_ot_nd
                            SET ${setClause}
                            WHERE employee_id = ? AND run_id = ?`,
                            values
                        );

                    } else {
                        // INSERT
                        const columns = [
                            "payroll_id",
                            "run_id",
                            "employee_id",
                            ...OT_ND_COLUMNS
                        ];

                        const placeholders = columns.map(() => "?").join(", ");

                        const values = [
                            payrollId,
                            run_id,
                            employeeId,
                            ...OT_ND_COLUMNS.map(col => data[col])
                        ];

                        await conn.query(
                            `INSERT INTO payroll_ot_nd (${columns.join(", ")})
                            VALUES (${placeholders})`,
                            values
                        );
                    }
                }

                // ==================== OT/ND ADJUSTMENTS SAVING ====================
                const OT_ND_ADJ_COLUMNS = [
                    // OVERTIME AMOUNT
                    "ot_adj_rg_rate", "ot_adj_rg_ot",
                    "ot_adj_rd_rate", "ot_adj_rd_ot",
                    "ot_adj_sd_rate", "ot_adj_sd_ot",
                    "ot_adj_sdrd_rate", "ot_adj_sdrd_ot",
                    "ot_adj_hd_rate", "ot_adj_hd_ot",
                    "ot_adj_hdrd_rate", "ot_adj_hdrd_ot",

                    // NIGHT DIFFERENTIAL AMOUNT
                    "nd_adj_rg_rate", "nd_adj_rg_ot",
                    "nd_adj_rd_rate", "nd_adj_rd_ot",
                    "nd_adj_sd_rate", "nd_adj_sd_ot",
                    "nd_adj_sdrd_rate", "nd_adj_sdrd_ot",
                    "nd_adj_hd_rate", "nd_adj_hd_ot",
                    "nd_adj_hdrd_rate", "nd_adj_hdrd_ot",

                    // OVERTIME TIME
                    "ot_adj_rg_rate_time", "ot_adj_rg_ot_time",
                    "ot_adj_rd_rate_time", "ot_adj_rd_ot_time",
                    "ot_adj_sd_rate_time", "ot_adj_sd_ot_time",
                    "ot_adj_sdrd_rate_time", "ot_adj_sdrd_ot_time",
                    "ot_adj_hd_rate_time", "ot_adj_hd_ot_time",
                    "ot_adj_hdrd_rate_time", "ot_adj_hdrd_ot_time",

                    // NIGHT DIFFERENTIAL TIME
                    "nd_adj_rg_rate_time", "nd_adj_rg_ot_time",
                    "nd_adj_rd_rate_time", "nd_adj_rd_ot_time",
                    "nd_adj_sd_rate_time", "nd_adj_sd_ot_time",
                    "nd_adj_sdrd_rate_time", "nd_adj_sdrd_ot_time",
                    "nd_adj_hd_rate_time", "nd_adj_hd_ot_time",
                    "nd_adj_hdrd_rate_time", "nd_adj_hdrd_ot_time"
                ];
                
                function normalizeOTNDAdjustmentData(ot_nd_adj) {
                    const data = {};
                    OT_ND_ADJ_COLUMNS.forEach(col => {
                        data[col] = Number(ot_nd_adj[col]) || 0;
                    });
                    return data;
                }

                if (ot_nd_adj && typeof ot_nd_adj === "object") {
                    const data = normalizeOTNDAdjustmentData(ot_nd_adj);

                    // Check existing
                    const [rows] = await conn.query(
                        `SELECT adj_id FROM payroll_ot_nd_adjustments
                        WHERE employee_id = ? AND run_id = ?
                        LIMIT 1`,
                        [employeeId, run_id]
                    );

                    if (rows.length > 0) {
                        // UPDATE
                        const setClause = OT_ND_ADJ_COLUMNS
                            .map(col => `${col} = ?`)
                            .join(", ");

                        await conn.query(
                            `UPDATE payroll_ot_nd_adjustments
                            SET ${setClause}
                            WHERE employee_id = ? AND run_id = ?`,
                            [
                                ...OT_ND_ADJ_COLUMNS.map(col => data[col]),
                                employeeId,
                                run_id
                            ]
                        );

                    } else {
                        // INSERT
                        const columns = [
                            "payroll_id",
                            "run_id",
                            "employee_id",
                            ...OT_ND_ADJ_COLUMNS
                        ];

                        const placeholders = columns.map(() => "?").join(", ");

                        await conn.query(
                            `INSERT INTO payroll_ot_nd_adjustments (${columns.join(", ")})
                            VALUES (${placeholders})`,
                            [
                                payrollId,
                                run_id,
                                employeeId,
                                ...OT_ND_ADJ_COLUMNS.map(col => data[col])
                            ]
                        );
                    }
                }

                // ==================== ATTENDANCE ADJUSTMENTS SAVING ====================
                const ATT_ADJ_COLUMNS = [
                    "basic_salary_time", "basic_salary_amt",
                    "absences_time", "absences_amt",
                    "late_time", "late_amt",
                    "undertime_time", "undertime_amt",
                    "others_amt",

                    "gsis_emp", "gsis_employer", "gsis_ecc",
                    "sss_emp", "sss_employer", "sss_ecc",
                    "pagibig_emp", "pagibig_employer", "pagibig_ecc",
                    "philhealth_emp", "philhealth_employer", "philhealth_ecc",
                    "tax_withheld"
                ];

                function normalizeAttendanceAdj(att_adj) {
                    const result = {};
                    ATT_ADJ_COLUMNS.forEach(c => result[c] = Number(att_adj[c]) || 0);
                    return result;
                }

                if (att_adj && typeof att_adj === "object") {
                    const normalized = normalizeAttendanceAdj(att_adj);

                    // Check existing
                    const [existing] = await conn.query(
                        `SELECT adj_id FROM payroll_attendance_adjustments
                        WHERE employee_id = ? AND run_id = ? LIMIT 1`,
                        [employeeId, run_id]
                    );

                    if (existing.length > 0) {
                        // UPDATE
                        const setClause = ATT_ADJ_COLUMNS.map(c => `${c} = ?`).join(", ");
                        await conn.query(
                            `UPDATE payroll_attendance_adjustments
                            SET ${setClause}
                            WHERE employee_id = ? AND run_id = ?`,
                            [...ATT_ADJ_COLUMNS.map(c => normalized[c]), employeeId, run_id]
                        );
                    } else {
                        // INSERT
                        const columns = ["payroll_id", "run_id", "employee_id", ...ATT_ADJ_COLUMNS];
                        const placeholders = columns.map(() => "?").join(", ");
                        await conn.query(
                            `INSERT INTO payroll_attendance_adjustments (${columns.join(", ")})
                            VALUES (${placeholders})`,
                            [payrollId, run_id, employeeId, ...ATT_ADJ_COLUMNS.map(c => normalized[c])]
                        );
                    }
                }

                // ==================== ALLOWANCES ====================
                if (Array.isArray(allowances)) {
                    const updateQuery = `
                        UPDATE employee_payroll_allowances
                        SET allowance_type_id = ?, amount = ?
                        WHERE emp_payroll_allowance_id = ?
                    `;
                    const insertQuery = `
                        INSERT INTO employee_payroll_allowances
                        (source_emp_allowance_id, payroll_id, employee_id, allowance_type_id, amount, period)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;
                    const deleteQuery = `
                        DELETE FROM employee_payroll_allowances
                        WHERE emp_payroll_allowance_id = ?
                    `;

                    const [rows] = await conn.query(
                        `SELECT emp_payroll_allowance_id, source_emp_allowance_id
                        FROM employee_payroll_allowances
                        WHERE payroll_id = ? AND employee_id = ? AND period = ?
                        ORDER BY emp_payroll_allowance_id`,
                        [payrollId, employeeId, periodToUse]
                    );

                    const remainingRows = [...rows];

                    console.log("============== FOR ALLOWANCES ==============");
                    for (const a of allowances) {
                        let existing;

                        if (a.emp_allowance_id !== null) {
                            existing = remainingRows.find(r => r.source_emp_allowance_id === a.emp_allowance_id);
                        } else {
                            existing = remainingRows.find(r => r.source_emp_allowance_id === null);
                        }

                        if (a.deleted) {
                            if (existing) {
                                console.log("DELETING record that is existing in the payroll...");

                                let empPayrollAllowanceIdToUpdate = existing.emp_payroll_allowance_id;
                                
                                if (a.emp_allowance_id === null && existing.source_emp_allowance_id === null) {
                                    console.log("DELETING record with null source_emp_allowance_id, using its emp_payroll_allowance_id:", empPayrollAllowanceIdToUpdate);
                                } else {
                                    console.log("DELETING record that matches emp_allowance_id:", empPayrollAllowanceIdToUpdate);
                                }

                                await conn.query(deleteQuery, [existing.emp_payroll_allowance_id]);
                                remainingRows.splice(remainingRows.indexOf(existing), 1);
                            } else {
                                console.log("Deleted record that is not yet in the payroll or not yet existing");
                            }
                            continue;
                        }

                        if (existing) {
                            console.log("UPDATING record that is existing in the payroll...");
                            
                            let empPayrollAllowanceIdToUpdate = existing.emp_payroll_allowance_id;
                            
                            if (a.emp_allowance_id === null && existing.source_emp_allowance_id === null) {
                                console.log("UPDATING record with null source_emp_allowance_id, using its emp_payroll_allowance_id:", empPayrollAllowanceIdToUpdate);
                            } else {
                                console.log("UPDATING record that matches emp_allowance_id:", empPayrollAllowanceIdToUpdate);
                            }

                            await conn.query(updateQuery, [
                                a.allowance_type_id,
                                a.amount,
                                existing.emp_payroll_allowance_id
                            ]);
                            remainingRows.splice(remainingRows.indexOf(existing), 1);
                            continue;
                        }

                        // Insert new allowance
                        console.log("INSERTING/ADDING record that is not yet in the payroll or not yet existing:", a.emp_allowance_id || null);
                        await conn.query(insertQuery, [
                            a.emp_allowance_id || null,
                            payrollId,
                            employeeId,
                            a.allowance_type_id,
                            a.amount,
                            periodToUse
                        ]);
                    }
                }

                // ==================== DEDUCTIONS ====================
                if (Array.isArray(deductions)) {
                    const updateQuery = `
                        UPDATE employee_payroll_deductions
                        SET deduction_type_id = ?, amount = ?
                        WHERE emp_payroll_deduction_id = ?
                    `;
                    const insertQuery = `
                        INSERT INTO employee_payroll_deductions
                        (source_emp_deduction_id, payroll_id, employee_id, deduction_type_id, amount, period)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;
                    const deleteQuery = `
                        DELETE FROM employee_payroll_deductions
                        WHERE emp_payroll_deduction_id = ?
                    `;

                    const [rows] = await conn.query(
                        `SELECT emp_payroll_deduction_id, source_emp_deduction_id
                        FROM employee_payroll_deductions
                        WHERE payroll_id = ? AND employee_id = ? AND period = ?
                        ORDER BY emp_payroll_deduction_id`,
                        [payrollId, employeeId, periodToUse]
                    );

                    const remainingRows = [...rows];

                    console.log("============== FOR DEDUCTIONS ==============");
                    for (const d of deductions) {
                        let existing;

                        if (d.emp_deduction_id !== null) {
                            existing = remainingRows.find(r => r.source_emp_deduction_id === d.emp_deduction_id);
                        } else {
                            existing = remainingRows.find(r => r.source_emp_deduction_id === null);
                        }

                        if (d.deleted) {
                            if (existing) {
                                console.log("DELETING record that is existing in the payroll...");
                                
                                let empPayrollDeductionIdToUpdate = existing.emp_payroll_deduction_id;
                                
                                if (d.emp_deduction_id === null && existing.source_emp_deduction_id === null) {
                                    console.log("DELETING record with null source_emp_deduction_id, using its emp_payroll_deduction_id:", empPayrollDeductionIdToUpdate);
                                } else {
                                    console.log("DELETING record that matches emp_deduction_id:", empPayrollDeductionIdToUpdate);
                                }

                                await conn.query(deleteQuery, [existing.emp_payroll_deduction_id]);
                                remainingRows.splice(remainingRows.indexOf(existing), 1);
                            } else {
                                console.log("Deleted record that is not yet in the payroll or not yet existing");
                            }
                            continue;
                        }

                        if (existing) {
                            console.log("UPDATING record that is existing in the payroll...");
                            
                            let empPayrollDeductionIdToUpdate = existing.emp_payroll_deduction_id;
                            
                            if (d.emp_deduction_id === null && existing.source_emp_deduction_id === null) {
                                console.log("UPDATING record with null source_emp_deduction_id, using its emp_payroll_deduction_id:", empPayrollDeductionIdToUpdate);
                            } else {
                                console.log("UPDATING record that matches emp_deduction_id:", empPayrollDeductionIdToUpdate);
                            }

                            await conn.query(updateQuery, [
                                d.deduction_type_id,
                                d.amount,
                                existing.emp_payroll_deduction_id
                            ]);
                            remainingRows.splice(remainingRows.indexOf(existing), 1);
                            continue;
                        }

                        // Insert new deduction
                        console.log("INSERTING/ADDING record that is not yet in the payroll or not yet existing:", d.emp_deduction_id || null);
                        await conn.query(insertQuery, [
                            d.emp_deduction_id || null,
                            payrollId,
                            employeeId,
                            d.deduction_type_id,
                            d.amount,
                            d.period || periodToUse
                        ]);
                    }
                }
            } else {
                // i think this won't trigger at all, gawin nalang fallback error
                // INSERT new payroll record
                const [insertedPayroll] = await conn.query(
                    `INSERT INTO employee_payroll
                        (run_id, employee_id, basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction, 
                        overtime, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
                        gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
                        pagibig_employee, pagibig_employer, pagibig_ecc, philhealth_employee, philhealth_employer, philhealth_ecc,
                        tax_withheld, deductions, loans, other_deductions, premium_adj,
                        ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
                        payroll_status, gross_pay, total_deductions, net_pay)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        run_id, employeeId, basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction,
                        overtime, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
                        gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
                        pagibig_employee, pagibig_employer, pagibig_ecc, philhealth_employee, philhealth_employer, philhealth_ecc,
                        tax_withheld, total_deductions, loans, other_deductions, premium_adj,
                        ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
                        payroll_status || "null", gross_pay, grand_total_deductions, net_pay
                    ]
                );
                
                payrollId = insertedPayroll.insertId;

                // INSERT allowances
                if (Array.isArray(allowances)) {
                    const insertQuery = `
                        INSERT INTO employee_payroll_allowances (payroll_id, employee_id, allowance_type_id, amount, period)
                        VALUES (?, ?, ?, ?, ?)
                    `;

                    for (const a of allowances) {
                        console.log("existing.length > 0 is not triggering");
                        await conn.query(insertQuery, [
                            payrollId,
                            employeeId,
                            a.allowance_type_id,
                            a.amount,
                            a.period || periodToUse
                        ]);
                    }
                }

                // INSERT deductions
                if (Array.isArray(deductions)) {
                    const insertQuery = `
                        INSERT INTO employee_payroll_deductions (payroll_id, employee_id, deduction_type_id, amount, period)
                        VALUES (?, ?, ?, ?, ?)
                    `;

                    for (const d of deductions) {
                        console.log("existing.length > 0 is not triggering");
                        await conn.query(insertQuery, [
                            payrollId,
                            employeeId,
                            d.deduction_type_id,
                            d.amount,
                            d.period || periodToUse
                        ]);
                    }
                }
            }

            // ==================== LOG AUDIT ====================
            // Fetch employee code
            const [empResult] = await conn.query(
                `SELECT emp_code FROM employees WHERE employee_id = ?`,
                [employeeId]
            );
            const empCode = empResult[0]?.emp_code || "Unknown ID";

            // Fetch payroll run info
            const [payrollRunInfo] = await conn.query(
                `SELECT payroll_range FROM payroll_runs WHERE run_id = ? LIMIT 1`,
                [run_id]
            );
            const payrollRange = payrollRunInfo[0]?.payroll_range || "Unknown Range";

            // Construct audit text for deletion
            const auditText = existing.length > 0 
                ? `Payroll record successfully updated for ${empCode} (${payrollRange} | run ${run_id})`
                : `Payroll record successfully created for ${empCode} (${payrollRange} | run ${run_id})`;

            // Log audit
            await logAudit(pool, user_id, admin_name, auditText, "Success");
            await conn.commit();

            res.json({ success: true, message: "Payroll saved", payroll_id: payrollId });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error("Error updating payroll:", err);
            res.status(500).json({ success: false, message: "Server error" });
        } finally {
            if (conn) conn.release();
        }
    });

    // === DELETE PAYROLL EMPLOYEE DETAILS FOR A SPECIFIC EMPLOYEE ON A SPECIFIC RUN ===
    app.post("/api/delete-employee", async (req, res) => {
        const { employeeId, runId, user_id, admin_name } = req.body;

        if (!employeeId || !runId) {
            return res.json({ success: false, message: "Missing employee ID or run ID" });
        }

        try {
            const conn = await pool.getConnection();

            // Delete only the record for this employee and this payroll run
            const [result] = await conn.query(
                "DELETE FROM employee_payroll WHERE employee_id = ? AND run_id = ?",
                [employeeId, runId]
            );

            conn.release();

            if (result.affectedRows === 0) {
                return res.json({ success: false, message: "No matching record found for this run" });
            }

            // ==================== LOG AUDIT ====================
            // Fetch employee code
            const [empResult] = await conn.query(
                `SELECT emp_code FROM employees WHERE employee_id = ?`,
                [employeeId]
            );
            const empCode = empResult[0]?.emp_code || "Unknown ID";

            // Fetch payroll run info
            const [payrollRunInfo] = await conn.query(
                `SELECT payroll_range FROM payroll_runs WHERE run_id = ? LIMIT 1`,
                [runId]
            );
            const payrollRange = payrollRunInfo[0]?.payroll_range || "Unknown Range";

            // Construct audit text for deletion
            const auditText = `Payroll record successfully deleted for ${empCode} (${payrollRange} | run ${runId})`;

            // Log audit
            await logAudit(pool, user_id, admin_name, auditText, "Success");
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.json({ success: false, message: err.message });
        }
    });

    // === SAVE ALL EMPLOYEE PAYROLLS AUTOMATICALLY ===
    app.post("/api/save_all_employee_payroll", async (req, res) => {
        const { run_id, payrolls, user_id, admin_name } = req.body;

        if (!Array.isArray(payrolls) || payrolls.length === 0) {
            return res.status(400).json({ success: false, message: "No payroll data to save" });
        }

        let conn;

        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // Fetch group_id for the payroll run
            const [runInfo] = await conn.query(
                `SELECT group_id FROM payroll_runs WHERE run_id = ? LIMIT 1`,
                [run_id]
            );

            const group_id = (runInfo[0]?.group_id || "").toLowerCase();

            for (const p of payrolls) {
                const {
                    employee_id,
                    basic_salary, absence_time, absence_deduction,
                    late_time, late_deduction,
                    undertime, undertime_deduction,
                    overtime,
                    taxable_allowances, non_taxable_allowances,
                    adj_comp, adj_non_comp, total_leaves_used,
                    gsis_employee, gsis_employer, gsis_ecc,
                    sss_employee, sss_employer, sss_ecc,
                    pagibig_employee, pagibig_employer, pagibig_ecc,
                    philhealth_employee, philhealth_employer, philhealth_ecc,
                    tax_withheld, total_deductions, loans, other_deductions, premium_adj,
                    ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
                    payroll_status, allowances = [], deductions = [], periodOption
                } = p;

                // --- Adjust values based on group_id ---
                function adjustByGroup(amount, group_id) {
                    let value = Number(amount || 0);

                    switch (group_id) {
                        case "weekly":
                            return value / 4;
                        case "semi-monthly":
                            return value / 2;
                        case "monthly":
                        default:
                            return value;
                    }
                }

                let adjustedSalary = adjustByGroup(basic_salary, group_id);
                let adjustedTaxableAllowances = adjustByGroup(taxable_allowances, group_id);
                let adjustedNonTaxableAllowances = adjustByGroup(non_taxable_allowances, group_id);
                let adjustedDeductions = adjustByGroup(total_deductions, group_id);
                let adjustedSSS = adjustByGroup(sss_employee, group_id);
                let adjustedPagIbig = adjustByGroup(pagibig_employee, group_id);
                let adjustedPhilhealth = adjustByGroup(philhealth_employee, group_id);
                let adjustedTaxWithheld = adjustByGroup(tax_withheld, group_id);

                const [existingPayroll] = await conn.query(
                    `SELECT basic_salary FROM employee_payroll
                    WHERE employee_id = ? AND run_id = ?
                    LIMIT 1`,
                    [employee_id, run_id]
                );

                const dbBasicSalary = existingPayroll[0]?.basic_salary;

                p.basic_salary = adjustedSalary;
                if (dbBasicSalary == null) {
                    p.taxable_allowances = adjustedTaxableAllowances;
                    p.non_taxable_allowances = adjustedNonTaxableAllowances;
                    p.total_deductions = adjustedDeductions;
                }
                
                p.sss_employee = adjustedSSS;
                p.pagibig_employee = adjustedPagIbig;
                p.philhealth_employee = adjustedPhilhealth;
                p.tax_withheld = adjustedTaxWithheld;

                console.log("employee_id:", employee_id);

                console.log("==============================");
                console.log("sss_employee:", sss_employee);
                console.log("tax_withheld:", tax_withheld);
                console.log("philhealth_employee:", philhealth_employee);
                console.log("pagibig_employee:", pagibig_employee);

                console.log("==============================");
                console.log("adjustedSSS:", adjustedSSS);
                console.log("adjustedPagIbig:", adjustedPagIbig);
                console.log("adjustedPhilhealth:", adjustedPhilhealth);
                console.log("adjustedTaxWithheld:", adjustedTaxWithheld);

                console.log("==============================");
                console.log("p.sss_employee:", p.sss_employee);
                console.log("p.tax_withheld:", p.tax_withheld);
                console.log("p.philhealth_employee:", p.philhealth_employee);
                console.log("p.pagibig_employee:", p.pagibig_employee);

                const grossPay =
                    Number(p.basic_salary || 0) -
                    Number(p.absence_deduction || 0) -
                    Number(p.late_deduction || 0) -
                    Number(p.undertime_deduction || 0) +
                    Number(p.overtime || 0) +
                    Number(p.taxable_allowances || 0) +
                    Number(p.non_taxable_allowances || 0) +
                    Number(p.adj_comp || 0) +
                    Number(p.adj_non_comp || 0) +
                    Number(p.total_leaves_used || 0);

                const grandTotalDeductions =
                    Number(p.sss_employee || 0) +
                    Number(p.pagibig_employee || 0) +
                    Number(p.philhealth_employee || 0) +
                    Number(p.tax_withheld || 0) +
                    Number(p.total_deductions || 0);

                const netPay = grossPay - grandTotalDeductions;

                console.log("==============================");
                console.log("Number(ytd_sss || 0):", Number(ytd_sss || 0));
                console.log("Number(ytd_wtax || 0):", Number(ytd_wtax || 0));
                console.log("umber(ytd_philhealth || 0):", Number(ytd_philhealth || 0));
                console.log("Number(ytd_pagibig || 0):", Number(ytd_pagibig || 0));
                console.log("Number(ytd_gsis || 0):", Number(ytd_gsis || 0));
                console.log("Number(ytd_gross || 0):", Number(ytd_gross || 0));

                // Compute current YTD
                const currentYtdSss = Number(ytd_sss || 0) + Number(p.sss_employee || 0);
                const currentYtdWtax = Number(ytd_wtax || 0) + Number(p.tax_withheld || 0);
                const currentYtdPhilhealth = Number(ytd_philhealth || 0) + Number(p.philhealth_employee || 0);
                const currentYtdPagibig = Number(ytd_pagibig || 0) + Number(p.pagibig_employee || 0);
                const currentYtdGsis = Number(ytd_gsis || 0) + Number(gsis_employee || 0);

                // gross YTD uses grossPay
                const currentYtdGross = Number(ytd_gross || 0) + Number(grossPay || 0);

                console.log("==============================");
                console.log("Number(p.sss_employee || 0):", Number(p.sss_employee || 0));
                console.log("Number(p.tax_withheld || 0):", Number(p.tax_withheld || 0));
                console.log("Number(p.philhealth_employee || 0):", Number(p.philhealth_employee || 0));
                console.log("Number(p.pagibig_employee || 0):", Number(p.pagibig_employee || 0));
                console.log("Number(gsis_employee || 0):", Number(gsis_employee || 0));
                console.log("Number(grossPay || 0):", Number(grossPay || 0));

                console.log("==============================");
                console.log("currentYtdSss:", currentYtdSss);
                console.log("currentYtdWtax:", currentYtdWtax);
                console.log("currentYtdPhilhealth:", currentYtdPhilhealth);
                console.log("currentYtdPagibig:", currentYtdPagibig);
                console.log("currentYtdGsis:", currentYtdGsis);
                console.log("currentYtdGross:", currentYtdGross);

                // --- Update payroll record ---
                await conn.query(
                    `UPDATE employee_payroll SET
                        basic_salary = ?, absence_time = ?, absence_deduction = ?, late_time = ?, late_deduction = ?, undertime = ?, undertime_deduction = ?,
                        overtime = ?, taxable_allowances = ?, non_taxable_allowances = ?, adj_comp = ?, adj_non_comp = ?, total_leaves_used = ?,
                        gsis_employee = ?, gsis_employer = ?, gsis_ecc = ?, sss_employee = ?, sss_employer = ?, sss_ecc = ?,
                        pagibig_employee = ?, pagibig_employer = ?, pagibig_ecc = ?, philhealth_employee = ?, philhealth_employer = ?, philhealth_ecc = ?,
                        tax_withheld = ?, deductions = ?, loans = ?, other_deductions = ?, premium_adj = ?,
                        ytd_sss = ?, ytd_wtax = ?, ytd_philhealth = ?, ytd_gsis = ?, ytd_pagibig = ?, ytd_gross = ?,
                        payroll_status = ?, gross_pay = ?, total_deductions = ?, net_pay = ?
                    WHERE employee_id = ? AND run_id = ?`,
                    [
                        p.basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction,
                        overtime, p.taxable_allowances, p.non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
                        gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
                        pagibig_employee, pagibig_employer, pagibig_ecc,philhealth_employee, philhealth_employer, philhealth_ecc,
                        tax_withheld, p.total_deductions, loans, other_deductions, premium_adj,
                        currentYtdSss, currentYtdWtax, currentYtdPhilhealth, currentYtdGsis, currentYtdPagibig, currentYtdGross,
                        payroll_status || "null", grossPay, grandTotalDeductions, netPay,
                        employee_id, run_id
                    ]
                );

                const periodToUse = periodOption || null;
                
                const [existing] = await conn.query(
                    `SELECT payroll_id FROM employee_payroll WHERE employee_id = ? AND run_id = ? LIMIT 1`,
                    [employee_id, run_id]
                );

                if (!existing.length) {
                    throw new Error(`Payroll record not found for employee ${employee_id}`);
                }

                const payrollId = existing[0].payroll_id;

                // ==================== ALLOWANCES ====================
                if (Array.isArray(allowances)) {
                    const updateQuery = `
                        UPDATE employee_payroll_allowances
                        SET allowance_type_id = ?, amount = ?
                        WHERE emp_payroll_allowance_id = ?
                    `;
                    const insertQuery = `
                        INSERT INTO employee_payroll_allowances (source_emp_allowance_id, payroll_id, employee_id, allowance_type_id, amount, period)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    // Fetch existing allowances from DB for this payroll
                    const [existingAllowances] = await conn.query(
                        `SELECT emp_payroll_allowance_id, allowance_type_id, period, source_emp_allowance_id 
                        FROM employee_payroll_allowances
                        WHERE payroll_id = ? AND employee_id = ?`,
                        [payrollId, employee_id]
                    );

                    console.log("==============================");
                    console.log("existingAllowances:", existingAllowances);

                    const usedNulls = new Set();
                    
                    for (const a of allowances) {
                        // --- Adjust amount based on group_id ---
                        const adjustedAmount = adjustByGroup(a.amount, group_id);

                        // Match by source_emp_allowance_id and not null
                        const existing = existingAllowances.find(
                            x => x.source_emp_allowance_id === a.source_emp_allowance_id
                        );
                        
                        console.log("a.source_emp_allowance_id:", a.source_emp_allowance_id);

                        // Match records WITHOUT source_emp_allowance_id (NULL) and mark their IDs
                        const withoutSource = existingAllowances.find(
                            x => x.source_emp_allowance_id == null &&
                                !usedNulls.has(x.emp_payroll_allowance_id)
                        );
                        
                        if (existing) {
                            // UPDATE records with matching source_emp_allowance_id and not null
                            await conn.query(updateQuery, [
                                a.allowance_type_id,
                                a.amount,
                                existing.emp_payroll_allowance_id
                            ]);
                            console.log("updated allowance id:", existing.emp_payroll_allowance_id);
                            continue;
                        } else if (withoutSource) {
                            // UPDATE records without source_emp_allowance_id
                            usedNulls.add(withoutSource.emp_payroll_allowance_id);

                            await conn.query(updateQuery, [
                                a.allowance_type_id,
                                a.amount,
                                withoutSource.emp_payroll_allowance_id
                            ]);
                            console.log("updated (no source) id:", withoutSource.emp_payroll_allowance_id);
                            continue;
                        } else {
                            // INSERT new record
                            await conn.query(insertQuery, [
                                a.source_emp_allowance_id || null,
                                payrollId,
                                employee_id,
                                a.allowance_type_id,
                                adjustedAmount,
                                periodToUse
                            ]);
                            console.log("inserted new allowance");
                        }
                    }
                }

                // ==================== DEDUCTIONS ====================
                if (Array.isArray(deductions)) {
                    const updateQuery = `
                        UPDATE employee_payroll_deductions
                        SET deduction_type_id = ?, amount = ?
                        WHERE emp_payroll_deduction_id = ?
                    `;
                    const insertQuery = `
                        INSERT INTO employee_payroll_deductions (source_emp_deduction_id, payroll_id, employee_id, deduction_type_id, amount, period)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    // Fetch existing deductions from DB for this payroll
                    const [existingDeductions] = await conn.query(
                        `SELECT emp_payroll_deduction_id, deduction_type_id, period, source_emp_deduction_id
                        FROM employee_payroll_deductions
                        WHERE payroll_id = ? AND employee_id = ?`,
                        [payrollId, employee_id]
                    );

                    const usedNulls = new Set();
                    
                    for (const d of deductions) {
                        // --- Adjust amount based on group_id ---
                        const adjustedAmount = adjustByGroup(d.amount, group_id);

                        // Match by source_emp_deduction_id and not null
                        const existing = existingDeductions.find(
                            x => x.source_emp_deduction_id === d.source_emp_deduction_id
                        );

                        // Match records WITHOUT source_emp_deduction_id (NULL) and mark their IDs
                        const withoutSource = existingDeductions.find(
                            x => x.source_emp_deduction_id == null &&
                                !usedNulls.has(x.emp_payroll_deduction_id)
                        );

                        if (existing) {
                            // UPDATE records with matching source_emp_deduction_id and not null
                            await conn.query(updateQuery, [
                                d.deduction_type_id,
                                d.amount,
                                existing.emp_payroll_deduction_id
                            ]);
                            console.log("updated deduction id:", existing.emp_payroll_deduction_id);
                            continue;
                        } else if (withoutSource) {
                            // UPDATE records without source_emp_allowance_id
                            usedNulls.add(withoutSource.emp_payroll_deduction_id);
                            
                            await conn.query(updateQuery, [
                                d.deduction_type_id,
                                d.amount,
                                withoutSource.emp_payroll_deduction_id
                            ]);
                            console.log("updated (no source) id:", withoutSource.emp_payroll_deduction_id);
                            continue;
                        } else {
                            // INSERT new record
                            await conn.query(insertQuery, [
                                d.source_emp_deduction_id || null,
                                payrollId,
                                employee_id,
                                d.deduction_type_id,
                                adjustedAmount,
                                periodToUse
                            ]);
                            console.log("inserted new deduction");
                        }
                    }
                }
            }
            
            // --- MARK PAYROLL RUN AS GENERATED ---
            await conn.query(
                `UPDATE payroll_runs 
                SET status = 'Generated'
                WHERE run_id = ?`,
                [run_id]
            );

            // --- LOG AUDIT ---
            // Fetch payroll run info
            const [payrollRunInfo] = await conn.query(
                `SELECT payroll_range FROM payroll_runs WHERE run_id = ? LIMIT 1`,
                [run_id]
            );
            const payrollRange = payrollRunInfo[0]?.payroll_range || "Unknown Range";

            // Construct audit text for saving payroll records
            const auditText = `Payroll records for run ${run_id} (${payrollRange}) processed successfully.`

            await logAudit(pool, user_id, admin_name, auditText, "Success");
            await conn.commit();
            res.json({ success: true });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error("Payroll save error:", err);
            res.status(500).json({ success: false, message: err.message });
        } finally {
            if (conn) conn.release();
        }
    });
}