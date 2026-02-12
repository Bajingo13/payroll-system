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

//YUNG TAAS NITO NABABASA DAHIL MERON SA PAYROLL_COMPUTATION

    // GET run_id based on the filters for Period covered date
    app.get("/api/get_run_id_payroll_journal", async (req, res) => {
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
                    AND status != 'Pending'
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

    // GET run_id based on the filters for Range covered date
    app.get("/api/get_run_ids_range", async (req, res) => {
        const {
            payroll_group,
            from_period, from_month, from_year,
            to_period, to_month, to_year
        } = req.query;

        if (
            !payroll_group ||
            !from_period || !from_month || !from_year ||
            !to_period || !to_month || !to_year
        ) {
            return res.status(400).json({ success: false, message: "All filters are required" });
        }

        try {
            const conn = await pool.getConnection();

            const query = `
                SELECT run_id
                FROM payroll_runs
                WHERE group_id = ?
                    AND status != 'Pending'
                    AND (
                        (year_id > ? OR (year_id = ? AND month_id > ?) OR (year_id = ? AND month_id = ? AND period_id >= ?))
                        AND
                        (year_id < ? OR (year_id = ? AND month_id < ?) OR (year_id = ? AND month_id = ? AND period_id <= ?))
                    )
                ORDER BY year_id, month_id, period_id;
            `;

            const params = [
                payroll_group,   // 1 -> group_id

                from_year,       // 2 -> year_id >
                from_year,       // 3 -> year_id =
                from_month,      // 4 -> month_id >
                from_year,       // 5 -> year_id =
                from_month,      // 6 -> month_id =
                from_period,     // 7 -> period_id >=

                to_year,         // 8 -> year_id <
                to_year,         // 9 -> year_id =
                to_month,        // 10 -> month_id <
                to_year,         // 11 -> year_id =
                to_month,        // 12 -> month_id =
                to_period        // 13 -> period_id <=
            ];

            const [rows] = await conn.query(query, params);
            conn.release();

            res.json({
            success: true,
            run_ids: rows.map(r => r.run_id)
            });

        } catch (err) {
            console.error("Error fetching run_ids by range:", err);
            res.status(500).json({ success: false, message: "Server error" });
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
                whereClauses.push("(e.status = 'Active' AND (ep.payroll_status != 'Hold' OR ep.payroll_status IS NULL))");
            } else if (status === "hold") {
                whereClauses.push("ep.payroll_status = 'Hold'");
            }

            // Optional filters
            if (company) whereClauses.push("ee.company = ?");
            if (location) whereClauses.push("ee.location = ?");
            if (branch) whereClauses.push("ee.branch = ?");
            if (division) whereClauses.push("ee.division = ?");
            if (department) whereClauses.push("ee.department = ?");
            if (empClass) whereClauses.push("ee.class = ?");
            if (position) whereClauses.push("ee.position = ?");
            if (empType) whereClauses.push("ee.emp_type = ?");
            if (salaryType) whereClauses.push("ea.salary_type = ?");
            if (employeeId) whereClauses.push("e.employee_id = ?");

            const queryValues = [runIdArray];
            [company, branch, division, department, empClass, position, empType, salaryType, employeeId]
            .forEach(v => { if (v) queryValues.push(v); });

            const query = `
                SELECT
                    ep.employee_id,

                    -- Tax details
                    tet.code AS tax_exemption_code,

                    -- Payroll totals
                    SUM(ep.basic_salary) AS basic_salary,
                    SUM(ep.absence_deduction) AS absence_deduction,
                    SUM(ep.late_deduction) AS late_deduction,
                    SUM(ep.undertime_deduction) AS undertime_deduction,
                    SUM(ep.overtime) AS overtime,
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

                    SUM(ep.adj_comp) AS adj_comp,
                    SUM(ep.taxable_allowances) AS taxable_allowances,
                    SUM(ep.gross_pay) AS gross_pay,
                    SUM(ep.gross_pay - ep.adj_non_comp - ep.non_taxable_allowances) AS gross_taxable,
                    SUM(ep.adj_non_comp) AS adj_non_comp,
                    SUM(ep.non_taxable_allowances) AS non_taxable_allowances,

                    SUM(ep.sss_employee) AS sss_employee,
                    SUM(ep.philhealth_employee) AS philhealth_employee,
                    SUM(ep.pagibig_employee) AS pagibig_employee,
                    SUM(ep.tax_withheld) AS tax_withheld,
                    SUM(paa.sss_emp) AS sss_emp_adj,
                    SUM(paa.philhealth_emp) AS philhealth_emp_adj,
                    SUM(paa.pagibig_emp) AS pagibig_emp_adj,
                    SUM(paa.tax_withheld) AS tax_withheld_adj,
                    SUM(paa.sss_employer) AS sss_employer_adj,
                    SUM(paa.sss_ecc) AS sss_ecc_adj,
                    SUM(paa.philhealth_employer) AS philhealth_employer_adj,
                    SUM(paa.pagibig_employer) AS pagibig_employer_adj,

                    SUM(ep.deductions) AS deductions,
                    SUM(ep.loans) AS loans,
                    SUM(ep.other_deductions) AS other_deductions,
                    SUM(ep.total_deductions) AS total_deductions,
                    SUM(ep.net_pay) AS net_pay,

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
                LEFT JOIN payroll_ot_nd pon ON pon.employee_id = ep.employee_id
                LEFT JOIN payroll_ot_nd_adjustments pona ON pona.employee_id = ep.employee_id
                LEFT JOIN payroll_attendance_adjustments paa ON paa.employee_id = ep.employee_id

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
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    table, th, td { border: 1px solid black; }
                    th, td { padding: 4px 6px; text-align: left; }
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
                    </style>
                </head>
                <body>
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
            headerTemplate: `
                <div style="width:100%; font-family: Arial, sans-serif; font-size:12px; padding:0 20px; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight: 600;">
                    Date: ${new Date().toLocaleDateString()} <br>
                    Time: ${new Date().toLocaleTimeString()}
                </div>
                <div style="text-align:center; flex-grow:1;">
                    ${headerHtml}
                </div>
                <div style="text-align:right; font-weight: 600;">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
                </div>
            `,
            footerTemplate: `<div></div>`, // keep empty if footer is not needed
            margin: { top: '120px', right: '20px', bottom: '40px', left: '20px' }
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