const { createNotification } = require('./notificationHelper');

module.exports = function (app, pool) {
    const puppeteer = require('puppeteer');
    const bcrypt = require('bcryptjs');
    const allowedSystemAccountRoles = ['Employee', 'HR', 'Admin'];

    function canManageSystemAccounts(role) {
        const value = String(role || '').trim().toLowerCase();
        return value === 'admin' || value === 'system administrator' || value.includes('admin') || value === 'hr' || value.includes('human resource');
    }

    async function ensureUserAccountColumns(conn) {
        const [columns] = await conn.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'users'
               AND COLUMN_NAME IN ('account_status', 'deactivated_at', 'deleted_at')`
        );
        const existing = new Set(columns.map((column) => column.COLUMN_NAME));

        if (!existing.has('account_status')) {
            await conn.execute("ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'Active'");
        }
        if (!existing.has('deactivated_at')) {
            await conn.execute('ALTER TABLE users ADD COLUMN deactivated_at DATETIME NULL');
        }
        if (!existing.has('deleted_at')) {
            await conn.execute('ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL');
        }
    }

    async function ensureEmployeeEvaluationTable(conn) {
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS employee_evaluations (
                evaluation_id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                review_period VARCHAR(80) NOT NULL,
                review_date DATE NOT NULL,
                evaluator_name VARCHAR(160) NULL,
                productivity_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                quality_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                teamwork_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                attendance_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                initiative_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                overall_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                rating VARCHAR(40) NOT NULL DEFAULT 'Needs Support',
                strengths TEXT NULL,
                improvement_areas TEXT NULL,
                goals TEXT NULL,
                action_plan TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_employee_evaluations_employee_date (employee_id, review_date),
                CONSTRAINT fk_employee_evaluations_employee
                    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
                    ON DELETE CASCADE
            )
        `);
    }

    function normalizeEvaluationScore(value) {
        const score = Number(value);
        if (!Number.isFinite(score)) return 0;
        return Math.max(0, Math.min(100, score));
    }

    function getEvaluationRating(score) {
        if (score >= 90) return 'Outstanding';
        if (score >= 80) return 'Exceeds Expectations';
        if (score >= 70) return 'Meets Expectations';
        if (score >= 60) return 'Developing';
        return 'Needs Support';
    }

    function buildEvaluationSummary(evaluations) {
        const rows = Array.isArray(evaluations) ? evaluations : [];
        if (!rows.length) {
            return {
                count: 0,
                averageScore: 0,
                latestScore: 0,
                latestRating: 'No Evaluation',
                growthDelta: 0
            };
        }

        const latest = rows[0];
        const oldest = rows[rows.length - 1];
        const averageScore = rows.reduce((total, row) => total + Number(row.overall_score || 0), 0) / rows.length;

        return {
            count: rows.length,
            averageScore: Number(averageScore.toFixed(2)),
            latestScore: Number(Number(latest.overall_score || 0).toFixed(2)),
            latestRating: latest.rating || getEvaluationRating(latest.overall_score),
            growthDelta: Number((Number(latest.overall_score || 0) - Number(oldest.overall_score || 0)).toFixed(2))
        };
    }

    async function getEmployeeEvaluations(conn, employeeId) {
        await ensureEmployeeEvaluationTable(conn);
        const [rows] = await conn.execute(
            `SELECT evaluation_id, review_period, DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date,
                    evaluator_name, productivity_score, quality_score, teamwork_score,
                    attendance_score, initiative_score, overall_score, rating,
                    strengths, improvement_areas, goals, action_plan,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM employee_evaluations
             WHERE employee_id = ?
             ORDER BY review_date DESC, evaluation_id DESC`,
            [employeeId]
        );

        return rows.map((row) => ({
            ...row,
            productivity_score: Number(row.productivity_score || 0),
            quality_score: Number(row.quality_score || 0),
            teamwork_score: Number(row.teamwork_score || 0),
            attendance_score: Number(row.attendance_score || 0),
            initiative_score: Number(row.initiative_score || 0),
            overall_score: Number(row.overall_score || 0)
        }));
    }

    function normalizeSystemAccount(body, fullName, employeeCode) {
        const account = body.systemAccount || {};
        const username = String(account.username || '').trim();
        const password = String(account.password || '');
        const role = allowedSystemAccountRoles.includes(account.role) ? account.role : 'Employee';
        const userId = Number(account.user_id || 0);

        if (!username && !password && !userId) return null;

        return {
            userId,
            username,
            password,
            role,
            fullName: String(fullName || '').trim(),
            employeeCode: String(employeeCode || '').trim()
        };
    }

    async function saveSystemAccount(conn, account, actorRole) {
        if (!account) return null;
        await ensureUserAccountColumns(conn);

        if (!canManageSystemAccounts(actorRole)) {
            const err = new Error('Only Admin and HR users can create employee system accounts.');
            err.statusCode = 403;
            throw err;
        }

        if (!account.username) {
            const err = new Error('Username is required for the employee system account.');
            err.statusCode = 400;
            throw err;
        }

        if (!account.fullName) {
            const err = new Error('Employee full name is required before creating a system account.');
            err.statusCode = 400;
            throw err;
        }

        if (!account.userId && !account.password) {
            const err = new Error('Password is required for the employee system account.');
            err.statusCode = 400;
            throw err;
        }

        if (account.password && account.password.length < 8) {
            const err = new Error('Password must be at least 8 characters.');
            err.statusCode = 400;
            throw err;
        }

        let targetUserId = account.userId;

        if (!targetUserId) {
            const [existingRows] = await conn.execute(
                `SELECT user_id
                FROM users
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))
                   OR LOWER(TRIM(username)) = LOWER(TRIM(?))
                   OR LOWER(TRIM(full_name)) = LOWER(TRIM(?))
                ORDER BY user_id DESC
                LIMIT 1`,
                [account.username, account.employeeCode || account.username, account.fullName]
            );
            targetUserId = Number(existingRows[0]?.user_id || 0);
        }

        const [duplicateRows] = await conn.execute(
            'SELECT user_id FROM users WHERE username = ? AND user_id != ? LIMIT 1',
            [account.username, targetUserId || 0]
        );

        if (duplicateRows.length > 0) {
            const err = new Error('Username already exists.');
            err.statusCode = 409;
            throw err;
        }

        if (targetUserId) {
            if (account.password) {
                const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
                const hashedPassword = await bcrypt.hash(account.password, bcryptRounds);
                await conn.execute(
                    "UPDATE users SET username = ?, password = ?, full_name = ?, role = ?, account_status = 'Active', deactivated_at = NULL, deleted_at = NULL WHERE user_id = ?",
                    [account.username, hashedPassword, account.fullName, account.role, targetUserId]
                );
            } else {
                await conn.execute(
                    "UPDATE users SET username = ?, full_name = ?, role = ?, account_status = 'Active', deactivated_at = NULL, deleted_at = NULL WHERE user_id = ?",
                    [account.username, account.fullName, account.role, targetUserId]
                );
            }

            return {
                user_id: targetUserId,
                username: account.username,
                role: account.role,
                account_status: 'Active'
            };
        }

        const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
        const hashedPassword = await bcrypt.hash(account.password, bcryptRounds);
        const [result] = await conn.execute(
            "INSERT INTO users (username, password, full_name, role, account_status) VALUES (?, ?, ?, ?, 'Active')",
            [account.username, hashedPassword, account.fullName, account.role]
        );

        return {
            user_id: result.insertId,
            username: account.username,
            role: account.role,
            account_status: 'Active'
        };
    }
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
    
    // ========== EMPLOYEE SUMMARY ==========
    app.get("/api/employee_summary", async (req, res) => {
    try {
        const conn = await pool.getConnection();
        const [employees] = await conn.execute("SELECT COUNT(*) AS total FROM employees");
        const [active] = await conn.execute("SELECT COUNT(*) AS total FROM employees WHERE status = 'Active'");
        const [inactive] = await conn.execute("SELECT COUNT(*) AS total FROM employees WHERE status = 'End of Contract' OR status = 'Resigned' OR status = 'Terminated'");
        const [newhires] = await conn.execute("SELECT COUNT(*) AS total FROM employee_employment WHERE date_regular IS NULL AND date_hired <= CURDATE()");
        conn.release();

        res.json({
        totalEmployees: employees[0].total,
        activeEmployees: active[0].total,
        inactiveEmployees: inactive[0].total,
        newHires: newhires[0].total
        });
    } catch (err) {
        console.error("Employee Files error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
    });

    // ========== EMPLOYEE LIST ==========
    app.get("/api/employee_list", async (req, res) => {
        const limit = parseInt(req.query.limit, 10) || 10;
        const page = parseInt(req.query.page, 10) || 1;
        const offset = (page - 1) * limit;

        // 🟢 Get sortBy from frontend (default: ID)
        const sortBy = req.query.sortBy || "ID";

        // 🟢 Choose which column to sort by
        let orderColumn;
        switch (sortBy) {
            case "Name":
            orderColumn = "full_name";
            break;
            case "Company":
            orderColumn = "ee.company";
            break;
            case "Department":
            orderColumn = "ee.department";
            break;
            case "Position":
            orderColumn = "ee.position";
            break;
            case "Status":
            orderColumn = "e.status";
            break;
            default:
            orderColumn = "e.emp_code"; // Default sort: Employee ID
        }

        try {
            const conn = await pool.getConnection();

            // Get the total number of employees
            const [countResult] = await conn.query("SELECT COUNT(*) as total FROM employees");
            const totalEmployees = countResult[0].total;
            const totalPages = Math.ceil(totalEmployees / limit);

            // 🟢 Query employees with dynamic sorting
            const [employees] = await conn.query(
            `SELECT e.emp_code,
                    CONCAT(e.first_name, ' ', e.last_name) AS full_name,
                    e.status,
                    ec.email,
                    ec.mobile_no,
                    ee.company,
                    ee.department,
                    ee.position
            FROM employees e
            JOIN employee_contacts ec ON e.employee_id = ec.employee_id
            JOIN employee_employment ee ON e.employee_id = ee.employee_id
            ORDER BY ${orderColumn} ASC
            LIMIT ? OFFSET ?`,
            [limit, offset]
            );

            res.json({
            employees,
            totalEmployees,
            totalPages,
            currentPage: page,
            success: true,
            });
        } catch (err) {
            console.error("Error fetching employee details:", err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });


    


        // ========== EMPLOYEE AUTOCOMPLETE ==========
app.get("/api/employee_autocomplete", async (req, res) => {
    const { q = "" } = req.query;

    let conn;
    try {
        conn = await pool.getConnection();

        const keyword = `%${String(q).trim()}%`;

        const [rows] = await conn.query(
            `SELECT 
                e.employee_id,
                e.emp_code,
                e.first_name,
                e.last_name,
                CONCAT(e.first_name, ' ', e.last_name) AS full_name
             FROM employees e
             WHERE
                e.emp_code LIKE ?
                OR e.first_name LIKE ?
                OR e.last_name LIKE ?
                OR CONCAT(e.first_name, ' ', e.last_name) LIKE ?
             ORDER BY e.first_name ASC, e.last_name ASC
             LIMIT 50`,
            [keyword, keyword, keyword, keyword]
        );

        res.json({
            success: true,
            employees: rows.map(emp => ({
                employee_id: emp.employee_id,
                emp_code: emp.emp_code,
                first_name: emp.first_name,
                last_name: emp.last_name,
                full_name: emp.full_name,
                display: `${emp.emp_code} - ${emp.full_name}`
            }))
        });
    } catch (err) {
        console.error("Error fetching employee autocomplete:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    } finally {
        if (conn) conn.release();
    }
});



// ===========employee details===========
app.get("/api/employee_details/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const conn = await pool.getConnection();

    const [rows] = await conn.query(`
            SELECT 
                e.employee_id,
                e.emp_code,
                e.first_name,
                e.last_name,
                e.status,
                ee.company,
                ee.department,
                ee.position,
                ee.employee_type,
                ea.salary_type,
                ec.email,
                ec.mobile_no
            FROM employees e
            LEFT JOIN employee_employment ee ON ee.employment_id = (
                SELECT em.employment_id
                FROM employee_employment em
                WHERE em.employee_id = e.employee_id
                ORDER BY em.employment_id DESC
                LIMIT 1
            )
            LEFT JOIN employee_accounts ea ON ea.account_id = (
                SELECT a.account_id
                FROM employee_accounts a
                WHERE a.employee_id = e.employee_id
                ORDER BY a.account_id DESC
                LIMIT 1
            )
            LEFT JOIN employee_contacts ec ON ec.contact_id = (
                SELECT c.contact_id
                FROM employee_contacts c
                WHERE c.employee_id = e.employee_id
                ORDER BY c.contact_id DESC
                LIMIT 1
            )
            WHERE e.employee_id = ?
    `, [id]);

    conn.release();

    if (rows.length === 0) {
      return res.json({ success: false });
    }

    res.json({
      success: true,
      employee: rows[0]
    });

  } catch (err) {
    console.error("Error fetching employee details:", err);
    res.status(500).json({ success: false });
  }
});




    // ========== ADD NEW EMPLOYEE ==========
    app.post("/api/add_employee", async (req, res) => {
        const conn = await pool.getConnection();
        try {
            const body = req.body || {};

            // Helper function for trimming and handling empty values
            const safe = (v) =>
            v === undefined || v === "" ? null : typeof v === "string" ? v.trim() : v;

            const emp_code = safe(body.emp_code);

            // Check for duplicate Employee Code
            const [exists] = await conn.execute(
            "SELECT emp_code FROM employees WHERE emp_code = ?",
            [emp_code]
            );
            if (exists.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Employee Code '${emp_code}' already exists`,
                });
            }

            // Personal details
            const last_name = safe(body.last_name) || "";
            const first_name = safe(body.first_name) || "";
            const middle_name = safe(body.middle_name) || "";
            const nickname = safe(body.nickname) || "";
            const gender = safe(body.gender) || null;
            const civil_status = safe(body.civil_status) || null;
            const birth_date = safe(body.birth_date) || null;

            // Address
            const street = safe(body.street) || "";
            const city = safe(body.city) || "";
            const country = safe(body.country) || "";
            const zip_code = safe(body.zip_code) || "";

            // Contact
            const tel_no = safe(body.tel_no) || "";
            const mobile_no = safe(body.mobile_no) || "";
            const fax_no = safe(body.fax_no) || "";
            const email = safe(body.email) || "";
            const website = safe(body.website) || "";

            // Employment details
            const company = safe(body.company) || "";
            const location = safe(body.location) || "";
            const branch = safe(body.branch) || "";
            const division = safe(body.division) || "";
            const department = safe(body.department) || "";
            const empClass = safe(body.class) || safe(body.class_field) || "";
            const position = safe(body.position) || "";
            const employee_type = safe(body.employee_type) || "";
            const status = safe(body.status) || "Active";

            const training_date = safe(body.training_date) || null;
            const date_hired = safe(body.date_hired) || null;
            const date_regular = safe(body.date_regular) || null;
            const date_resigned = safe(body.date_resigned) || null;
            const date_terminated = safe(body.date_terminated) || null;
            const end_of_contract = safe(body.end_of_contract) || null;
            const rehired_date = safe(body.rehired_date) || null;
            const rehired = body.rehired ? 1 : 0;

            // Account info
            const machine_id = safe(body.machine_id) || "";
            const sss_no = safe(body.sss_no) || "";
            const gsis_no = safe(body.gsis_no) || "";
            const pagibig_no = safe(body.pagibig_no) || "";
            const philhealth_no = safe(body.philhealth_no) || "";
            const tin_no = safe(body.tin_no) || "";
            const branch_code = safe(body.branch_code) || "";
            const atm_no = safe(body.atm_no) || "";
            const bank_name = safe(body.bank_name) || "";
            const bank_branch = safe(body.bank_branch) || "";
            const projects = safe(body.projects) || "";
            const salary_type = safe(body.salary_type) || "";

            const dependents = Array.isArray(body.dependents) ? body.dependents : [];

            // Basic validation
            if (!first_name || !last_name || !email || !date_hired) {
                console.error("❌ Missing field(s):", { first_name, last_name, email, date_hired });
                return res.status(400).json({
                    success: false,
                    message: "Missing required fields: first_name, last_name, email, or date_hired",
                });
            }

            const employeeFullName = [first_name, last_name].filter(Boolean).join(" ").trim();
            const systemAccount = normalizeSystemAccount(body, employeeFullName, emp_code);

            await conn.beginTransaction();

            // Insert into main employees table
            const [empResult] = await conn.execute(
            `INSERT INTO employees
            (emp_code, last_name, first_name, middle_name, nickname, gender, civil_status, birth_date, street, city, country, zip_code, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                emp_code,
                last_name,
                first_name,
                middle_name,
                nickname,
                gender,
                civil_status,
                birth_date,
                street,
                city,
                country,
                zip_code,
                status,
            ]
            );

            const employeeId = empResult.insertId;

            // Contacts
            await conn.execute(
                `INSERT INTO employee_contacts (employee_id, tel_no, mobile_no, fax_no, email, website)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [employeeId, tel_no, mobile_no, fax_no, email, website]
            );

            // Employment
            await conn.execute(
                `INSERT INTO employee_employment
                (employee_id, company, location, branch, division, department, \`class\`, position, employee_type,
                    training_date, date_hired, date_regular, date_resigned, date_terminated, end_of_contract, rehired_date, rehired)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    employeeId,
                    company,
                    location,
                    branch,
                    division,
                    department,
                    empClass,
                    position,
                    employee_type,
                    training_date,
                    date_hired,
                    date_regular,
                    date_resigned,
                    date_terminated,
                    end_of_contract,
                    rehired_date,
                    rehired,
                ]
            );

            // Optional accounts
            try {
                await conn.execute(
                    `INSERT INTO employee_accounts
                    (employee_id, machine_id, sss_no, gsis_no, pagibig_no, philhealth_no, tin_no,
                    branch_code, atm_no, bank_name, bank_branch, projects, salary_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                    employeeId,
                    machine_id,
                    sss_no,
                    gsis_no,
                    pagibig_no,
                    philhealth_no,
                    tin_no,
                    branch_code,
                    atm_no,
                    bank_name,
                    bank_branch,
                    projects,
                    salary_type,
                    ]
                );
            } catch (accErr) {
                console.warn(
                    "Warning: could not insert into employee_accounts:",
                    accErr.message || accErr
                );
            }

            // Dependents
            if (dependents.length > 0) {
                const depInsertStmt = `INSERT INTO employee_dependents (employee_id, name, birthday) VALUES (?, ?, ?)`;
                for (const d of dependents) {
                    const name = safe(d.name) || "";
                    const birthday = safe(d.birthday) || null;
                    if (!name) continue;
                    try {
                    await conn.execute(depInsertStmt, [employeeId, name, birthday]);
                    } catch (depErr) {
                    console.warn(
                        "Warning: failed to insert dependent:",
                        depErr.message || depErr
                    );
                    }
                }
            }

            // Tax & Insurance Entry
            const tax_status = safe(body.tax_status) || null;
            const tax_exemption = body.tax_exemption ? Number(body.tax_exemption) : null;
            const insurance = body.insurance ? Number(body.insurance) : 0.00;
            const regional_minimum_wage_rate_id = body.regional_minimum_wage_rate_id || null;

            try {
                await conn.execute(`
                    INSERT INTO employee_tax_insurance
                    (employee_id, tax_status, tax_exemption, insurance, regional_minimum_wage_rate_id)
                    VALUES (?, ?, ?, ?, ?)
                `, [employeeId, tax_status, tax_exemption, insurance, regional_minimum_wage_rate_id]);
            } catch (taxErr) {
                console.warn("Warning: failed to insert employee tax/insurance:", taxErr.message || taxErr);
            }

            // --- INSERT Payroll Computation Settings ---
            if (req.body.payrollComputation) {
                const comp = req.body.payrollComputation;

                const payroll_period =
                    ["Weekly", "Semi-Monthly", "Monthly"].includes(comp.payroll_period)
                    ? comp.payroll_period
                    : "Weekly";

                const payroll_rate =
                    ["Piece Rate", "Hourly Rate", "Daily Rate", "Weekly Rate", "Monthly Rate"].includes(comp.payroll_rate)
                    ? comp.payroll_rate
                    : "Daily Rate";

                const ot_rate = comp.ot_rate || null;

                const days_in_week =
                    payroll_period === "Weekly"
                    ? comp.days_in_week && Number(comp.days_in_week) > 0
                        ? comp.days_in_week
                        : 5
                    : null;

                await conn.query(
                `INSERT INTO employee_payroll_settings 
                (employee_id, payroll_period, payroll_rate, ot_rate, days_in_year, days_in_week, main_computation, basis_absences, basis_overtime, hours_in_day, week_in_year, days_in_year_ot, rate_basis_ot, strict_no_overtime)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    employeeId,
                    payroll_period,
                    payroll_rate,
                    ot_rate,
                    comp.days_in_year || null,
                    days_in_week,
                    comp.main_computation || null,
                    comp.basis_absences || null,
                    comp.basis_overtime || null,
                    comp.hours_in_day || null,
                    comp.week_in_year || null,
                    comp.days_in_year_ot || null,
                    comp.rate_basis_ot || null,
                    comp.strict_no_overtime ? 1 : 0
                ]
                );
            }

            // === Contributions Payroll Entry ===
            if (Array.isArray(body.contributions)) {
                for (const c of body.contributions) {
                    try {
                        await conn.query(`
                            INSERT INTO employee_contributions
                            (employee_id, contribution_type_id, enabled, start_date, period, type_option, computation, ee_share, er_share, ecc, annualize)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            employeeId,
                            safe(c.contribution_type_id),
                            c.enabled ? 1 : 0,
                            safe(c.start_date),
                            safe(c.period_id),
                            safe(c.type_option_id),
                            safe(c.computation_id),
                            c.ee_share !== undefined ? Number(c.ee_share) : 0,
                            c.er_share !== undefined ? Number(c.er_share) : 0,
                            c.ecc !== undefined ? Number(c.ecc) : 0,
                            c.annualize ? 1 : 0
                        ]);
                    } catch (conErr) {
                        console.warn("Warning: failed to insert contribution:", conErr.message || conErr);
                    }
                }
            }

            // Allowance Payroll Entry
            if (Array.isArray(body.allowances)) {
                for (const a of body.allowances) {
                    const allowanceTypeId = Number(a.allowance_type_id);
                    const amount = a.amount === '' || a.amount === undefined || a.amount === null ? null : Number(a.amount);
                    const period = ["Weekly", "Monthly", "First Half", "Second Half", "Both"].includes(a.period) ? a.period : null;

                    if (!allowanceTypeId || !period || amount === null || Number.isNaN(amount)) {
                        continue;
                    }

                    await conn.query(`
                        INSERT INTO employee_allowances (employee_id, allowance_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        allowanceTypeId,
                        period,
                        amount
                    ]);
                }
            }

            // Deduction Payroll Entry
            if (Array.isArray(body.deductions)) {
                for (const d of body.deductions) {
                    const deductionTypeId = Number(d.deduction_type_id);
                    const amount = d.amount === '' || d.amount === undefined || d.amount === null ? null : Number(d.amount);
                    const period = ["Weekly", "Monthly", "First Half", "Second Half", "Both"].includes(d.period) ? d.period : null;

                    if (!deductionTypeId || !period || amount === null || Number.isNaN(amount)) {
                        continue;
                    }

                    await conn.query(`
                        INSERT INTO employee_deductions (employee_id, deduction_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        deductionTypeId,
                        period,
                        amount
                    ]);
                }
            }

            const systemAccountResult = await saveSystemAccount(conn, systemAccount, body.actor_role);

            await conn.commit();
            conn.release();

            // Log audit (use pool separately)
            const userId = req.body.user_id || null;
            const adminName = req.body.admin_name || "Unknown";
            await logAudit(pool, userId, adminName, `Added Employee ${emp_code}`, "Success");

            res.json({
                success: true,
                message: "Employee added successfully",
                emp_code,
                systemAccount: systemAccountResult,
                systemAccountUserId: systemAccountResult?.user_id || null
            });
        } catch (err) {
            await conn.rollback().catch(() => {});
            console.error("❌ /api/add_employee error:", err);
            res
            .status(err.statusCode || 500)
            .json({
                success: false,
                message: err.statusCode ? err.message : "Server error while adding employee",
                error: err.message,
            });
        } finally {
            conn.release();
        }
    });

    // ========== VIEW EMPLOYEE DETAILS ==========
    app.get('/api/employee/:empCode', async (req, res) => {
        try {
            const empCode = req.params.empCode;
            const conn = await pool.getConnection();
            await ensureUserAccountColumns(conn);
            conn.release();

            const [employeeRows] = await pool.query(`
            SELECT 
                e.*,
                ec.tel_no, ec.mobile_no, ec.fax_no, ec.email, ec.website,
                ee.training_date, ee.date_hired, ee.date_regular, ee.date_resigned, ee.date_terminated, ee.end_of_contract, ee.rehired_date, ee.rehired,
                ea.machine_id, ea.sss_no, ea.gsis_no, ea.pagibig_no, ea.philhealth_no, ea.tin_no, ea.branch_code,
                ee.company, ee.location, ee.branch, ee.division, ee.department, ee.class, ee.position, ee.employee_type,
                ea.atm_no, ea.bank_name, ea.bank_branch, ea.projects, ea.salary_type, 
                eps.payroll_period, eps.payroll_rate,
                eps.main_computation, eps.days_in_year, eps.days_in_week, eps.hours_in_day, eps.week_in_year, 
                eps.ot_rate, eps.days_in_year_ot, eps.rate_basis_ot, eps.strict_no_overtime
            FROM employees e
            LEFT JOIN employee_contacts ec ON e.employee_id = ec.employee_id
            LEFT JOIN employee_employment ee ON e.employee_id = ee.employee_id
            LEFT JOIN employee_accounts ea ON e.employee_id = ea.employee_id
            LEFT JOIN employee_payroll_settings eps ON e.employee_id = eps.employee_id
            WHERE e.emp_code = ?
            LIMIT 1
            `, [empCode]);

            if (employeeRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
            }

            const employee = employeeRows[0];

            // Get dependents by employee_id
            const [dependents] = await pool.query(
            `SELECT name, birthday FROM employee_dependents WHERE employee_id = ?`,
            [employee.employee_id]
            );

            employee.dependents = dependents;

            // Get tax & insurance info by employee_id
            const [taxInsuranceRows] = await pool.query(`
                SELECT eti.tax_insurance_id, eti.tax_status, eti.tax_exemption, eti.insurance,
                    eti.regional_minimum_wage_rate_id, rmw.region_code
                FROM employee_tax_insurance eti
                LEFT JOIN regional_minimum_wage_rates rmw
                    ON eti.regional_minimum_wage_rate_id = rmw.regional_minimum_wage_rate_id
                WHERE eti.employee_id = ?
                LIMIT 1
            `, [employee.employee_id]);

            employee.taxInsurance = taxInsuranceRows[0] || null;

            // Get contributions by employee_id
            const [contributions] = await pool.query(
                `SELECT emp_contribution_id, contribution_type_id, enabled, 
                        DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, 
                        period, type_option, computation, ee_share, er_share, ecc, annualize
                FROM employee_contributions
                WHERE employee_id = ?`,
                [employee.employee_id]
            );

            employee.contributions = contributions || [];

            // Get allowances by employee_id, ordered by emp_allowance_id
            const [allowances] = await pool.query(`
                SELECT ea.*, at.allowance_name, at.is_taxable
                FROM employee_allowances ea
                JOIN allowance_types at ON ea.allowance_type_id = at.allowance_type_id
                WHERE ea.employee_id = ?
                ORDER BY ea.emp_allowance_id ASC
            `, [employee.employee_id]);

            // Get deductions by employee_id, ordered by emp_deduction_id
            const [deductions] = await pool.query(`
                SELECT ed.*, dt.deduction_name
                FROM employee_deductions ed
                JOIN deduction_types dt ON ed.deduction_type_id = dt.deduction_type_id
                WHERE ed.employee_id = ?
                ORDER BY ed.emp_deduction_id ASC
            `, [employee.employee_id]);

            employee.allowances = allowances;
            employee.deductions = deductions;
            employee.evaluations = await getEmployeeEvaluations(pool, employee.employee_id);
            employee.evaluationSummary = buildEvaluationSummary(employee.evaluations);

            const employeeFullName = [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim();
            const [systemAccountRows] = await pool.query(
                `SELECT user_id, username, full_name, role, account_status
                FROM users
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))
                   OR LOWER(TRIM(full_name)) = LOWER(TRIM(?))
                ORDER BY user_id DESC
                LIMIT 1`,
                [employee.emp_code || '', employeeFullName]
            );

            employee.systemAccount = systemAccountRows[0]
                ? {
                    user_id: systemAccountRows[0].user_id,
                    username: systemAccountRows[0].username || '',
                    role: allowedSystemAccountRoles.includes(systemAccountRows[0].role) ? systemAccountRows[0].role : 'Employee',
                    account_status: systemAccountRows[0].account_status || 'Active'
                }
                : null;

            res.json({ success: true, employee });
        } catch (error) {
            console.error('Error fetching employee:', error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    app.put('/api/employee/:empCode/system-account', async (req, res) => {
        const empCode = String(req.params.empCode || '').trim();
        const body = req.body || {};

        if (!empCode) {
            return res.status(400).json({ success: false, message: 'Employee ID is required.' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await ensureUserAccountColumns(conn);

            const [employeeRows] = await conn.execute(
                `SELECT employee_id, emp_code, first_name, last_name
                FROM employees
                WHERE emp_code = ?
                LIMIT 1`,
                [empCode]
            );

            if (!employeeRows.length) {
                return res.status(404).json({ success: false, message: 'Employee record not found.' });
            }

            const employee = employeeRows[0];
            const employeeFullName = [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim();
            const systemAccount = normalizeSystemAccount(body, employeeFullName, employee.emp_code);

            if (!systemAccount) {
                return res.status(400).json({ success: false, message: 'Username and password are required to create an account.' });
            }

            await conn.beginTransaction();
            const account = await saveSystemAccount(conn, systemAccount, body.actor_role);
            await conn.commit();

            await logAudit(pool, body.user_id, body.admin_name, `Saved Account for Employee ${empCode}`, 'Success');

            return res.json({
                success: true,
                message: `Account saved. Username '${account.username}' can now sign in.`,
                emp_code: employee.emp_code,
                systemAccount: account,
                systemAccountUserId: account.user_id
            });
        } catch (error) {
            if (conn) await conn.rollback().catch(() => {});
            console.error('❌ Error saving employee system account:', error);
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.statusCode ? error.message : 'Server error while saving employee account',
                error: error.message
            });
        } finally {
            if (conn) conn.release();
        }
    });

    async function handleSystemAccountStatusAction(req, res) {
        const empCode = String(req.params.empCode || '').trim();
        const body = req.body || {};
        const action = String(body.action || '').trim().toLowerCase();
        const validActions = ['deactivate', 'reactivate', 'delete'];

        if (!empCode) {
            return res.status(400).json({ success: false, message: 'Employee ID is required.' });
        }

        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, message: 'Select a valid account action.' });
        }

        if (!canManageSystemAccounts(body.actor_role)) {
            return res.status(403).json({ success: false, message: 'Only Admin and HR users can manage employee accounts.' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await ensureUserAccountColumns(conn);

            const [employeeRows] = await conn.execute(
                `SELECT employee_id, emp_code, first_name, last_name
                 FROM employees
                 WHERE emp_code = ?
                 LIMIT 1`,
                [empCode]
            );

            if (!employeeRows.length) {
                return res.status(404).json({ success: false, message: 'Employee record not found.' });
            }

            const employee = employeeRows[0];
            const employeeFullName = [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim();
            const [accountRows] = await conn.execute(
                `SELECT user_id, username, role, account_status
                 FROM users
                 WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))
                    OR LOWER(TRIM(full_name)) = LOWER(TRIM(?))
                 ORDER BY user_id DESC
                 LIMIT 1`,
                [employee.emp_code || '', employeeFullName]
            );

            if (!accountRows.length) {
                return res.status(404).json({ success: false, message: 'No login account is linked to this employee.' });
            }

            const account = accountRows[0];
            if (Number(account.user_id) === Number(body.user_id)) {
                return res.status(400).json({ success: false, message: 'You cannot change your own login account status here.' });
            }

            let nextStatus = 'Active';
            let sql = "UPDATE users SET account_status = 'Active', deactivated_at = NULL, deleted_at = NULL WHERE user_id = ?";
            let message = 'Account reactivated successfully.';
            let auditAction = `Reactivated Account for Employee ${empCode}`;

            if (action === 'deactivate') {
                nextStatus = 'Deactivated';
                sql = "UPDATE users SET account_status = 'Deactivated', deactivated_at = NOW(), deleted_at = NULL WHERE user_id = ?";
                message = 'Account deactivated. Employee information was kept.';
                auditAction = `Deactivated Account for Employee ${empCode}`;
            } else if (action === 'delete') {
                nextStatus = 'Deleted';
                sql = "UPDATE users SET account_status = 'Deleted', deactivated_at = NULL, deleted_at = NOW() WHERE user_id = ?";
                message = 'Account deleted from active access. Employee information was kept.';
                auditAction = `Deleted Account Access for Employee ${empCode}`;
            }

            await conn.execute(sql, [account.user_id]);
            await logAudit(pool, body.user_id, body.admin_name, auditAction, 'Success');

            return res.json({
                success: true,
                message,
                emp_code: employee.emp_code,
                systemAccount: {
                    user_id: account.user_id,
                    username: account.username || '',
                    role: allowedSystemAccountRoles.includes(account.role) ? account.role : 'Employee',
                    account_status: nextStatus
                },
                systemAccountUserId: account.user_id
            });
        } catch (error) {
            console.error('Error changing employee account status:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error while changing employee account status',
                error: error.message
            });
        } finally {
            if (conn) conn.release();
        }
    }

    app.patch('/api/employee/:empCode/system-account/status', handleSystemAccountStatusAction);
    app.post('/api/employee/:empCode/system-account/status', handleSystemAccountStatusAction);

    app.post('/api/employee/:empCode/evaluations', async (req, res) => {
        const empCode = String(req.params.empCode || '').trim();
        const body = req.body || {};
        const safe = (value) => value === undefined || value === null ? '' : String(value).trim();

        if (!empCode) {
            return res.status(400).json({ success: false, message: 'Employee ID is required.' });
        }

        const reviewPeriod = safe(body.review_period);
        const reviewDate = safe(body.review_date);

        if (!reviewPeriod || !reviewDate) {
            return res.status(400).json({ success: false, message: 'Review period and review date are required.' });
        }

        const scoreFields = [
            'productivity_score',
            'quality_score',
            'teamwork_score',
            'attendance_score',
            'initiative_score'
        ];
        const scores = scoreFields.map((field) => normalizeEvaluationScore(body[field]));
        const overallScore = Number((scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(2));
        const rating = getEvaluationRating(overallScore);

        let conn;
        try {
            conn = await pool.getConnection();
            await ensureEmployeeEvaluationTable(conn);

            const [employeeRows] = await conn.execute(
                `SELECT employee_id, emp_code FROM employees WHERE emp_code = ? LIMIT 1`,
                [empCode]
            );

            if (!employeeRows.length) {
                return res.status(404).json({ success: false, message: 'Employee record not found.' });
            }

            const employee = employeeRows[0];

            await conn.execute(
                `INSERT INTO employee_evaluations (
                    employee_id, review_period, review_date, evaluator_name,
                    productivity_score, quality_score, teamwork_score, attendance_score, initiative_score,
                    overall_score, rating, strengths, improvement_areas, goals, action_plan
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    employee.employee_id,
                    reviewPeriod,
                    reviewDate,
                    safe(body.evaluator_name) || null,
                    scores[0],
                    scores[1],
                    scores[2],
                    scores[3],
                    scores[4],
                    overallScore,
                    rating,
                    safe(body.strengths) || null,
                    safe(body.improvement_areas) || null,
                    safe(body.goals) || null,
                    safe(body.action_plan) || null
                ]
            );

            const evaluations = await getEmployeeEvaluations(conn, employee.employee_id);
            const evaluationSummary = buildEvaluationSummary(evaluations);

            await logAudit(pool, body.user_id, body.admin_name, `Added Evaluation for Employee ${empCode}`, 'Success');

            const [empUserRows] = await conn.execute(
              'SELECT user_id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) LIMIT 1',
              [empCode]
            );
            if (empUserRows.length) {
              await createNotification(
                pool,
                empUserRows[0].user_id,
                'evaluation',
                'Growth Evaluation Recorded',
                `Your growth evaluation for ${reviewPeriod} has been recorded. Score: ${overallScore} (${rating}).`
              );
            }

            return res.json({
                success: true,
                message: 'Employee evaluation saved successfully.',
                emp_code: employee.emp_code,
                evaluations,
                evaluationSummary
            });
        } catch (error) {
            console.error('Error saving employee evaluation:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error while saving employee evaluation',
                error: error.message
            });
        } finally {
            if (conn) conn.release();
        }
    });

    function formatExportValue(value) {
        if (value === null || value === undefined || value === '') return 'N/A';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (Array.isArray(value)) return value.length ? value.map(formatExportValue).join(', ') : 'N/A';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function buildEmployeeExportMeta(title, generatedBy) {
        return {
            companyName: 'Astreablue Intelligence Inc.',
            title: title || 'Employee File Export',
            generatedAt: new Date().toLocaleString('en-PH', {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            }),
            generatedBy: String(generatedBy || '').trim() || 'System User',
            signatories: ['Prepared By:', 'Checked By:', 'Verified By:', 'Approved By:']
        };
    }

    function buildEmployeeExportSections(employee) {
        return [
            {
                title: 'Basic Information',
                type: 'kv',
                rows: [
                    ['Employee ID', employee.emp_code],
                    ['First Name', employee.first_name],
                    ['Last Name', employee.last_name],
                    ['Middle Name', employee.middle_name],
                    ['Nickname', employee.nickname],
                    ['Gender', employee.gender],
                    ['Civil Status', employee.civil_status],
                    ['Birth Date', employee.birth_date],
                    ['Street', employee.street],
                    ['City', employee.city],
                    ['Country', employee.country],
                    ['Zip Code', employee.zip_code],
                    ['Status', employee.status]
                ]
            },
            {
                title: 'Payroll Information',
                type: 'kv',
                rows: [
                    ['Company', employee.company],
                    ['Location', employee.location],
                    ['Branch', employee.branch],
                    ['Division', employee.division],
                    ['Department', employee.department],
                    ['Class', employee.class],
                    ['Position', employee.position],
                    ['Employee Type', employee.employee_type],
                    ['Training Date', employee.training_date],
                    ['Date Hired', employee.date_hired],
                    ['Date Regular', employee.date_regular],
                    ['Date Resigned', employee.date_resigned],
                    ['Date Terminated', employee.date_terminated],
                    ['End of Contract', employee.end_of_contract],
                    ['Rehired Date', employee.rehired_date],
                    ['Rehired', employee.rehired],
                    ['Email', employee.email],
                    ['Mobile No.', employee.mobile_no],
                    ['Telephone No.', employee.tel_no],
                    ['Fax No.', employee.fax_no],
                    ['Website', employee.website]
                ]
            },
            {
                title: 'Payroll Computation',
                type: 'kv',
                rows: [
                    ['Payroll Period', employee.payroll_period],
                    ['Payroll Rate', employee.payroll_rate],
                    ['OT Rate', employee.ot_rate],
                    ['Main Computation', employee.main_computation],
                    ['Days in Year', employee.days_in_year],
                    ['Days in Week', employee.days_in_week],
                    ['Hours in Day', employee.hours_in_day],
                    ['Week in Year', employee.week_in_year],
                    ['Days in Year OT', employee.days_in_year_ot],
                    ['Rate Basis OT', employee.rate_basis_ot],
                    ['Basis Absences', employee.basis_absences],
                    ['Basis Overtime', employee.basis_overtime],
                    ['Strict No Overtime', employee.strict_no_overtime]
                ]
            },
            {
                title: 'Government / Account Information',
                type: 'kv',
                rows: [
                    ['Machine ID', employee.machine_id],
                    ['SSS No.', employee.sss_no],
                    ['GSIS No.', employee.gsis_no],
                    ['Pag-IBIG No.', employee.pagibig_no],
                    ['PhilHealth No.', employee.philhealth_no],
                    ['TIN No.', employee.tin_no],
                    ['Branch Code', employee.branch_code],
                    ['ATM No.', employee.atm_no],
                    ['Bank Name', employee.bank_name],
                    ['Bank Branch', employee.bank_branch],
                    ['Projects', employee.projects],
                    ['Salary Type', employee.salary_type],
                    ['Tax Status', employee.taxInsurance?.tax_status],
                    ['Tax Exemption', employee.taxInsurance?.tax_exemption],
                    ['Insurance', employee.taxInsurance?.insurance],
                    ['Regional Minimum Wage Rate ID', employee.taxInsurance?.regional_minimum_wage_rate_id]
                ]
            },
            {
                title: 'Allowance Payroll Entry',
                type: 'entry',
                rows: Array.isArray(employee.allowances) && employee.allowances.length
                    ? employee.allowances.map((row) => [row.allowance_name || row.allowance_type_id || '', row.period || '', row.amount || ''])
                    : [['No allowance entries', '', '']]
            },
            {
                title: 'Deduction Payroll Entry',
                type: 'entry',
                rows: Array.isArray(employee.deductions) && employee.deductions.length
                    ? employee.deductions.map((row) => [row.deduction_name || row.deduction_type_id || '', row.period || '', row.amount || ''])
                    : [['No deduction entries', '', '']]
            },
            {
                title: 'Growth Evaluations',
                type: 'evaluation',
                rows: Array.isArray(employee.evaluations) && employee.evaluations.length
                    ? employee.evaluations.map((row) => [
                        row.review_period || '',
                        row.review_date || '',
                        row.overall_score || '',
                        row.rating || '',
                        row.goals || '',
                        row.action_plan || ''
                    ])
                    : [['No evaluation records', '', '', '', '', '']]
            },
            {
                title: 'Dependents',
                type: 'dependent',
                rows: Array.isArray(employee.dependents) && employee.dependents.length
                    ? employee.dependents.map((row) => [row.name || '', row.birthday || ''])
                    : [['No dependents', '']]
            }
        ];
    }

    function buildEmployeeExportCsv(employee, meta) {
        const lines = [
            [meta.companyName],
            [meta.title],
            ['Generated', meta.generatedAt],
            ['Generated By', meta.generatedBy],
            ['']
        ];
        for (const section of buildEmployeeExportSections(employee)) {
            lines.push([section.title, '']);
            if (section.type === 'entry') {
                lines.push(['#', 'Name', 'Period', 'Amount']);
                section.rows.forEach((row, index) => {
                    lines.push([String(index + 1), row[0], row[1], row[2]]);
                });
            } else if (section.type === 'evaluation') {
                lines.push(['#', 'Period', 'Date', 'Score', 'Rating', 'Goals', 'Action Plan']);
                section.rows.forEach((row, index) => {
                    lines.push([String(index + 1), row[0], row[1], row[2], row[3], row[4], row[5]]);
                });
            } else if (section.type === 'dependent') {
                lines.push(['#', 'Name', 'Birthday']);
                section.rows.forEach((row, index) => {
                    lines.push([String(index + 1), row[0], row[1]]);
                });
            } else {
                lines.push(['Field', 'Value']);
                section.rows.forEach(([field, value]) => {
                    lines.push([field, formatExportValue(value)]);
                });
            }
            lines.push(['', '']);
        }

        meta.signatories.forEach((label) => lines.push([label]));

        return lines.map((line) => line.map((value) => {
            const text = String(value ?? '');
            const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
            return safe.includes(',') || safe.includes('"') || safe.includes('\n')
                ? `"${safe.replace(/"/g, '""')}"`
                : safe;
        }).join(',')).join('\n');
    }

    function buildEmployeeExportText(employee, meta) {
        const lines = [
            meta.companyName,
            meta.title,
            `Generated: ${meta.generatedAt}`,
            `Generated By: ${meta.generatedBy}`,
            ''
        ];
        for (const section of buildEmployeeExportSections(employee)) {
            lines.push(section.title);
            lines.push('='.repeat(section.title.length));
            if (section.type === 'entry') {
                section.rows.forEach((row, index) => {
                    lines.push(`${index + 1}. ${formatExportValue(row[0])} | Period: ${formatExportValue(row[1])} | Amount: ${formatExportValue(row[2])}`);
                });
            } else if (section.type === 'evaluation') {
                section.rows.forEach((row, index) => {
                    lines.push(`${index + 1}. ${formatExportValue(row[0])} | Date: ${formatExportValue(row[1])} | Score: ${formatExportValue(row[2])} | Rating: ${formatExportValue(row[3])}`);
                    lines.push(`Goals: ${formatExportValue(row[4])}`);
                    lines.push(`Action Plan: ${formatExportValue(row[5])}`);
                });
            } else if (section.type === 'dependent') {
                section.rows.forEach((row, index) => {
                    lines.push(`${index + 1}. ${formatExportValue(row[0])} | Birthday: ${formatExportValue(row[1])}`);
                });
            } else {
                section.rows.forEach(([field, value]) => {
                    lines.push(`${field}: ${formatExportValue(value)}`);
                });
            }
            lines.push('');
        }
        meta.signatories.forEach((label) => lines.push(label));
        return lines.join('\n');
    }

    function buildEmployeeExportHtml(employee, meta) {
        const sections = buildEmployeeExportSections(employee);
        const sectionHtml = sections.map((section) => {
            const isEntry = section.type === 'entry';
            const isDependent = section.type === 'dependent';
            const isEvaluation = section.type === 'evaluation';
            const rows = isEntry
                ? section.rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`).join('')
                : isEvaluation
                    ? section.rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td><td>${escapeHtml(row[3])}</td><td>${escapeHtml(row[4])}</td><td>${escapeHtml(row[5])}</td></tr>`).join('')
                : isDependent
                    ? section.rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td></tr>`).join('')
                    : section.rows.map(([field, value]) => `<tr><th>${escapeHtml(field)}</th><td>${escapeHtml(formatExportValue(value))}</td></tr>`).join('');

            const head = isEntry
                ? '<tr><th>#</th><th>Name</th><th>Period</th><th>Amount</th></tr>'
                : isEvaluation
                    ? '<tr><th>#</th><th>Period</th><th>Date</th><th>Score</th><th>Rating</th><th>Goals</th><th>Action Plan</th></tr>'
                : isDependent
                    ? '<tr><th>#</th><th>Name</th><th>Birthday</th></tr>'
                    : '';

            return `
                <section class="section-block">
                    <h2>${escapeHtml(section.title)}</h2>
                    <table>
                        ${head ? `<thead>${head}</thead>` : ''}
                        <tbody>${rows}</tbody>
                    </table>
                </section>
            `;
        }).join('');

        return `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
                    h1 { margin: 0 0 6px; font-size: 24px; }
                    .meta { margin: 0 0 18px; color: #6b7280; }
                    .report-header { text-align: center; }
                    .section-block { margin-bottom: 22px; page-break-inside: avoid; }
                    .section-block h2 { font-size: 16px; margin: 0 0 10px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
                    th { background: #f9fafb; width: 230px; }
                    thead th { background: #e5e7eb; width: auto; }
                    .signatories { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 34px; font-size: 12px; }
                    .signatories span { display: block; border-bottom: 1px solid #333; height: 30px; }
                </style>
            </head>
            <body>
                <div class="report-header">
                    <h1>${escapeHtml(meta.companyName)}</h1>
                    <p class="meta">
                        <strong>${escapeHtml(meta.title)}</strong><br>
                        Employee File Export - ${escapeHtml(employee.emp_code || '')}<br>
                        Generated: ${escapeHtml(meta.generatedAt)}<br>
                        Generated By: ${escapeHtml(meta.generatedBy)}
                    </p>
                </div>
                ${sectionHtml}
                <div class="signatories">
                    ${meta.signatories.map((label) => `<div><strong>${escapeHtml(label)}</strong><span></span></div>`).join('')}
                </div>
            </body>
            </html>
        `;
    }

    app.get('/api/employee/:empCode/export', async (req, res) => {
        const empCode = String(req.params.empCode || '').trim();
        const format = String(req.query.format || 'csv').trim().toLowerCase();

        if (!empCode) {
            return res.status(400).json({ success: false, message: 'Missing employee code.' });
        }

        if (!['csv', 'text', 'txt', 'pdf'].includes(format)) {
            return res.status(400).json({ success: false, message: 'Unsupported export format.' });
        }

        try {
            const [employeeRows] = await pool.query(`
                SELECT 
                    e.*,
                    ec.tel_no, ec.mobile_no, ec.fax_no, ec.email, ec.website,
                    ee.training_date, ee.date_hired, ee.date_regular, ee.date_resigned, ee.date_terminated, ee.end_of_contract, ee.rehired_date, ee.rehired,
                    ea.machine_id, ea.sss_no, ea.gsis_no, ea.pagibig_no, ea.philhealth_no, ea.tin_no, ea.branch_code,
                    ee.company, ee.location, ee.branch, ee.division, ee.department, ee.class, ee.position, ee.employee_type,
                    ea.atm_no, ea.bank_name, ea.bank_branch, ea.projects, ea.salary_type, 
                    eps.payroll_period, eps.payroll_rate,
                    eps.main_computation, eps.days_in_year, eps.days_in_week, eps.hours_in_day, eps.week_in_year, 
                    eps.ot_rate, eps.days_in_year_ot, eps.rate_basis_ot, eps.strict_no_overtime
                FROM employees e
                LEFT JOIN employee_contacts ec ON e.employee_id = ec.employee_id
                LEFT JOIN employee_employment ee ON e.employee_id = ee.employee_id
                LEFT JOIN employee_accounts ea ON e.employee_id = ea.employee_id
                LEFT JOIN employee_payroll_settings eps ON e.employee_id = eps.employee_id
                WHERE e.emp_code = ?
                LIMIT 1
            `, [empCode]);

            if (!employeeRows.length) {
                return res.status(404).json({ success: false, message: 'Employee not found' });
            }

            const employee = employeeRows[0];

            const [dependents] = await pool.query(`SELECT name, birthday FROM employee_dependents WHERE employee_id = ?`, [employee.employee_id]);
            employee.dependents = dependents || [];

            const [taxInsuranceRows] = await pool.query(`
                SELECT eti.tax_status, eti.tax_exemption, eti.insurance, eti.regional_minimum_wage_rate_id
                FROM employee_tax_insurance eti
                WHERE eti.employee_id = ?
                LIMIT 1
            `, [employee.employee_id]);
            employee.taxInsurance = taxInsuranceRows[0] || null;

            const [allowances] = await pool.query(`
                SELECT ea.*, at.allowance_name
                FROM employee_allowances ea
                LEFT JOIN allowance_types at ON ea.allowance_type_id = at.allowance_type_id
                WHERE ea.employee_id = ?
                ORDER BY ea.emp_allowance_id ASC
            `, [employee.employee_id]);
            employee.allowances = allowances || [];

            const [deductions] = await pool.query(`
                SELECT ed.*, dt.deduction_name
                FROM employee_deductions ed
                LEFT JOIN deduction_types dt ON ed.deduction_type_id = dt.deduction_type_id
                WHERE ed.employee_id = ?
                ORDER BY ed.emp_deduction_id ASC
            `, [employee.employee_id]);
            employee.deductions = deductions || [];
            employee.evaluations = await getEmployeeEvaluations(pool, employee.employee_id);

            const exportBase = `employee-${String(employee.emp_code || empCode).replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()}`;
            const meta = buildEmployeeExportMeta('Employee File Export', req.query.generated_by);

            if (format === 'pdf') {
                const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                try {
                    const page = await browser.newPage();
                    await page.setContent(buildEmployeeExportHtml(employee, meta), { waitUntil: 'networkidle0' });
                    const pdfBuffer = await page.pdf({
                        format: 'legal',
                        landscape: false,
                        printBackground: true,
                        margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' }
                    });

                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="${exportBase}.pdf"`);
                    return res.send(pdfBuffer);
                } finally {
                    await browser.close().catch(() => {});
                }
            }

            if (format === 'text' || format === 'txt') {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${exportBase}.txt"`);
                return res.send(buildEmployeeExportText(employee, meta));
            }

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${exportBase}.csv"`);
            return res.send(buildEmployeeExportCsv(employee, meta));
        } catch (err) {
            console.error('Employee export error:', err);
            return res.status(500).json({ success: false, message: 'Unable to export employee file.', error: err.message });
        }
    });

    // ========== SAVE EMPLOYEE DETAILS ==========
    app.put('/api/employee/update/:empCode', async (req, res) => {
        const empCode = req.params.empCode;
        const body = req.body || {};
        const safe = (v) => (v === undefined || v === "" ? null : typeof v === "string" ? v.trim() : v);

        try {
            const conn = await pool.getConnection();

            // Step 1: Get employee_id of the current record
            const [empRows] = await conn.query(`SELECT employee_id FROM employees WHERE emp_code = ?`, [empCode]);
            if (empRows.length === 0) {
            conn.release();
            return res.status(404).json({ success: false, message: "Employee not found" });
            }
            const employeeId = empRows[0].employee_id;

            // 🔹 Step 2: Check if new emp_code is already used by another employee
            if (body.emp_code && body.emp_code !== empCode) {
            const [dupRows] = await conn.query(
                `SELECT employee_id FROM employees WHERE emp_code = ? AND employee_id != ?`,
                [body.emp_code, employeeId]
            );

            if (dupRows.length > 0) {
                conn.release();
                return res.status(400).json({ success: false, message: "Employee ID already exists" });
            }
            }

            await conn.beginTransaction();

            // Step 3: Update employees table
            await conn.query(
            `UPDATE employees
            SET emp_code=?, first_name=?, last_name=?, middle_name=?, nickname=?, gender=?, civil_status=?, birth_date=?, street=?, city=?, country=?, zip_code=?, status=?
            WHERE employee_id=?`,
            [
                safe(body.emp_code),
                safe(body.first_name),
                safe(body.last_name),
                safe(body.middle_name),
                safe(body.nickname),
                safe(body.gender),
                safe(body.civil_status),
                safe(body.birth_date),
                safe(body.street),
                safe(body.city),
                safe(body.country),
                safe(body.zip_code),
                safe(body.status),
                employeeId,
            ]
            );

            // Step 4: Update other tables (contacts, employment, accounts)
            // 4a. employee_contacts
            await conn.query(`
                UPDATE employee_contacts
                SET tel_no=?, mobile_no=?, fax_no=?, email=?, website=?
                WHERE employee_id=?
                `, [
                safe(body.tel_no),
                safe(body.mobile_no),
                safe(body.fax_no),
                safe(body.email),
                safe(body.website),
                employeeId,
            ]);

            // 4b. employee_employment
            await conn.query(`
                UPDATE employee_employment
                SET company=?, location=?, branch=?, division=?, department=?, class=?, position=?, employee_type=?,
                    training_date=?, date_hired=?, date_regular=?, date_resigned=?, date_terminated=?, end_of_contract=?, rehired_date=?, rehired=?
                WHERE employee_id=?
                `, [
                safe(body.company),
                safe(body.location),
                safe(body.branch),
                safe(body.division),
                safe(body.department),
                safe(body.class),
                safe(body.position),
                safe(body.employee_type),
                safe(body.training_date),
                safe(body.date_hired),
                safe(body.date_regular),
                safe(body.date_resigned),
                safe(body.date_terminated),
                safe(body.end_of_contract),
                safe(body.rehired_date),
                body.rehired ? 1 : 0,
                employeeId,
            ]);

            // 4c. employee_accounts
            await conn.query(`
                UPDATE employee_accounts
                SET machine_id=?, sss_no=?, gsis_no=?, pagibig_no=?, philhealth_no=?, tin_no=?, branch_code=?, atm_no=?, bank_name=?, bank_branch=?, projects=?, salary_type=?
                WHERE employee_id=?
                `, [
                safe(body.machine_id),
                safe(body.sss_no),
                safe(body.gsis_no),
                safe(body.pagibig_no),
                safe(body.philhealth_no),
                safe(body.tin_no),
                safe(body.branch_code),
                safe(body.atm_no),
                safe(body.bank_name),
                safe(body.bank_branch),
                safe(body.projects),
                safe(body.salary_type),
                employeeId,
            ]);

            // 4d. employee_dependents (simplify by deleting old and re-inserting)
            await conn.query(`DELETE FROM employee_dependents WHERE employee_id = ?`, [employeeId]);
            if (Array.isArray(body.dependents) && body.dependents.length > 0) {
                for (const dep of body.dependents) {
                    await conn.query(
                    `INSERT INTO employee_dependents (employee_id, name, birthday) VALUES (?, ?, ?)`,
                    [employeeId, safe(dep.name), safe(dep.birthday)]
                    );
                }
            }

            // Step 5: Update or Insert into employee_payroll_settings (Payroll Computation Tab)
            if (body.payrollComputation) {
                const comp = body.payrollComputation;
                const payrollPeriods = ["Weekly", "Semi-Monthly", "Monthly"];
                const payrollRates = ["Piece Rate", "Hourly Rate", "Daily Rate", "Weekly Rate", "Monthly Rate"];
                const otRates = ["STANDARD OT RATE"];

                // Check if an existing record exists for this employee
                const [existingSettings] = await conn.query(`
                    SELECT setting_id
                    FROM employee_payroll_settings
                    WHERE employee_id = ?
                    LIMIT 1
                `, [employeeId]);

                if (existingSettings.length > 0) {
                    // Existing record found, perform UPDATE
                    await conn.query(`
                        UPDATE employee_payroll_settings
                        SET payroll_period = ?, payroll_rate = ?, main_computation = ?,
                            days_in_year = ?, days_in_week = ?, hours_in_day = ?, week_in_year = ?,
                            strict_no_overtime = ?, ot_rate = ?, days_in_year_ot = ?, rate_basis_ot = ?,
                            basis_absences = ?, basis_overtime = ?
                        WHERE employee_id = ?
                    `, [
                            payrollPeriods.includes(comp.payroll_period) ? comp.payroll_period : "Weekly",
                            payrollRates.includes(comp.payroll_rate) ? comp.payroll_rate : "Daily Rate",
                        comp.main_computation || null,
                        comp.days_in_year || null,
                        comp.days_in_week || null,
                        comp.hours_in_day || null,
                        comp.week_in_year || null,
                        comp.strict_no_overtime ? 1 : 0,
                            otRates.includes(comp.ot_rate) ? comp.ot_rate : "STANDARD OT RATE",
                        comp.days_in_year_ot || null,
                        comp.rate_basis_ot || null,
                        comp.basis_absences || null,
                        comp.basis_overtime || null,
                        employeeId,
                    ]);
                } else {
                    // No existing record found, perform INSERT
                    await conn.query(`
                        INSERT INTO employee_payroll_settings (
                            employee_id, payroll_period, payroll_rate, main_computation, days_in_year,
                            days_in_week, hours_in_day, week_in_year, strict_no_overtime, ot_rate,
                            days_in_year_ot, rate_basis_ot, basis_absences, basis_overtime
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        employeeId,
                            payrollPeriods.includes(comp.payroll_period) ? comp.payroll_period : "Weekly",
                            payrollRates.includes(comp.payroll_rate) ? comp.payroll_rate : "Daily Rate",
                        comp.main_computation || null,
                        comp.days_in_year || null,
                        comp.days_in_week || null,
                        comp.hours_in_day || null,
                        comp.week_in_year || null,
                        comp.strict_no_overtime ? 1 : 0,
                            otRates.includes(comp.ot_rate) ? comp.ot_rate : "STANDARD OT RATE",
                        comp.days_in_year_ot || null,
                        comp.rate_basis_ot || null,
                        comp.basis_absences || null,
                        comp.basis_overtime || null,
                    ]);
                }
            }

            // Step 6: Update or Insert into employee_tax_insurance (Payroll Computation Tab)
            const taxInsurance = body.taxInsurance || {}; // get from frontend

            // Check if existing record exists
            const [existingTax] = await conn.query(
                `SELECT tax_insurance_id FROM employee_tax_insurance WHERE employee_id = ? LIMIT 1`,
                [employeeId]
            );

            if (existingTax.length > 0) {
                // Update existing record
                await conn.query(
                    `UPDATE employee_tax_insurance
                    SET tax_status = ?, tax_exemption = ?, insurance = ?, regional_minimum_wage_rate_id = ?
                    WHERE employee_id = ?`,
                    [
                        taxInsurance.tax_status || null,
                        taxInsurance.tax_exemption || null,
                        taxInsurance.insurance || 0.00,
                        taxInsurance.regional_minimum_wage_rate_id || null,
                        employeeId
                    ]
                );
            } else {
                // Insert new record
                await conn.query(
                    `INSERT INTO employee_tax_insurance (employee_id, tax_status, tax_exemption, insurance, regional_minimum_wage_rate_id)
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        employeeId,
                        taxInsurance.tax_status || null,
                        taxInsurance.tax_exemption || null,
                        taxInsurance.insurance || 0.00,
                        taxInsurance.regional_minimum_wage_rate_id || null
                    ]
                );
            }

            // Step 7: Update or Insert into employee_contributions (Payroll Computation Tab)
            const contributions = req.body.contributions || {};
            const contributionTypes = {
                sss: 1,
                pagibig: 2,
                philhealth: 3,
                wtax: 4
            };

            for (const c of contributions) {
                const typeId = c.contribution_type_id;

                if (!c) continue; // skip if no data provided

                const enabled = c.enabled ? 1 : 0;

                try {
                    const [existing] = await conn.query(
                        `SELECT emp_contribution_id 
                        FROM employee_contributions 
                        WHERE employee_id = ? AND contribution_type_id = ? 
                        LIMIT 1`,
                        [employeeId, typeId]
                    );

                    if (existing.length > 0) {
                        // Existing record found, perform update
                        await conn.query(
                            `UPDATE employee_contributions SET
                                enabled = ?,
                                start_date = ?,
                                period = ?,
                                type_option = ?,
                                computation = ?,
                                ee_share = ?,
                                er_share = ?,
                                ecc = ?,
                                annualize = ?
                            WHERE emp_contribution_id = ?`,
                            [
                                enabled,
                                c.start_date || null,
                                c.period || null,
                                c.type_option || null,
                                c.computation || null,
                                c.ee_share || 0,
                                c.er_share || 0,
                                c.ecc || 0,
                                c.annualize ? 1 : 0,
                                existing[0].emp_contribution_id
                            ]
                        );
                    } else {
                        // No existing record, perform insert
                        await conn.query(
                            `INSERT INTO employee_contributions (
                                employee_id, contribution_type_id,
                                enabled, start_date, period, type_option, computation,
                                ee_share, er_share, ecc, annualize
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                employeeId,
                                typeId,
                                enabled,
                                c.start_date || null,
                                c.period || null,
                                c.type_option || null,
                                c.computation || null,
                                c.ee_share || 0,
                                c.er_share || 0,
                                c.ecc || 0,
                                c.annualize ? 1 : 0
                            ]
                        );
                    }
                } catch (err) {
                    console.error("Error processing contribution for typeId", typeId, err);
                }
            }
            
            //  Allowance Payroll Entry
            await conn.query(`DELETE FROM employee_allowances WHERE employee_id = ?`, [employeeId]);

            if (Array.isArray(body.allowances)) {
                for (const a of body.allowances) {
                    const allowanceTypeId = Number(a.allowance_type_id);
                    const amount = a.amount === '' || a.amount === undefined || a.amount === null ? null : Number(a.amount);
                    const period = ["Weekly", "Monthly", "First Half", "Second Half", "Both"].includes(a.period) ? a.period : null;

                    if (!allowanceTypeId || !period || amount === null || Number.isNaN(amount)) {
                        continue;
                    }

                    await conn.query(`
                        INSERT INTO employee_allowances (employee_id, allowance_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        allowanceTypeId,
                        period,
                        amount
                    ]);
                }
            }

            //  Deduction Payroll Entry
            await conn.query(`DELETE FROM employee_deductions WHERE employee_id = ?`, [employeeId]);

            if (Array.isArray(body.deductions)) {
                for (const d of body.deductions) {
                    const deductionTypeId = Number(d.deduction_type_id);
                    const amount = d.amount === '' || d.amount === undefined || d.amount === null ? null : Number(d.amount);
                    const period = ["Weekly", "Monthly", "First Half", "Second Half", "Both"].includes(d.period) ? d.period : null;

                    if (!deductionTypeId || !period || amount === null || Number.isNaN(amount)) {
                        continue;
                    }

                    await conn.query(`
                        INSERT INTO employee_deductions (employee_id, deduction_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        deductionTypeId,
                        period,
                        amount
                    ]);
                }
            }

            const employeeFullName = [safe(body.first_name), safe(body.last_name)].filter(Boolean).join(" ").trim();
            const systemAccount = normalizeSystemAccount(body, employeeFullName, safe(body.emp_code) || empCode);
            const systemAccountResult = await saveSystemAccount(conn, systemAccount, body.actor_role);

            await conn.commit();
            await logAudit(pool, req.body.user_id, req.body.admin_name, `Updated Employee ${empCode}`, 'Success');
            res.json({
                success: true,
                message: "Employee updated successfully",
                emp_code: body.emp_code || empCode,
                systemAccount: systemAccountResult,
                systemAccountUserId: systemAccountResult?.user_id || null
            });
            conn.release();
        } catch (error) {
            console.error("❌ Error updating employee:", error);
            if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ success: false, message: "Employee ID already exists" });
            }
            res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Server error while updating employee", error: error.message });
        }
    });

     // ========== DELETE EMPLOYEE DETAILS ==========
    app.delete('/api/employee/:empCode', async (req, res) => {
      const empCode = req.params.empCode;

      try {
        const conn = await pool.getConnection();

        const [rows] = await conn.query(
          `SELECT employee_id FROM employees WHERE emp_code = ?`,
          [empCode]
        );

        if (rows.length === 0) {
          conn.release();
          return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const employeeId = rows[0].employee_id;

        await ensureEmployeeEvaluationTable(conn);
        await conn.beginTransaction();

        await conn.query(`DELETE FROM employee_evaluations WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_contacts WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_employment WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_accounts WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_dependents WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_payroll_settings WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_tax_insurance WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employees WHERE employee_id = ?`, [employeeId]);

        await conn.commit();

        await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted Employee ${empCode}`, 'Success');
        res.json({ success: true, message: 'Employee deleted successfully' });
        conn.release();
      } catch (error) {
        console.error('❌ Error deleting employee:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting employee' });
      }
    });

    /* ====== FOR PAYSLIP PRINTING ====== */
    app.get("/api/employees", async (req, res) => {
      try {
        const [rows] = await pool.query(`
          SELECT 
            e.employee_id,
            e.emp_code,
            e.first_name,
            e.last_name,
            ee.company,
            ee.department,
            ee.position,
            e.status
          FROM employees e
          LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
          ORDER BY e.last_name, e.first_name
        `);

        res.json({ success: true, employees: rows });
      } catch (err) {
        console.error("Error fetching employees:", err);
        res.status(500).json({ success: false, message: "Failed to load employees." });
      }
    });

};

