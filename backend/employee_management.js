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
            const gender = safe(body.gender) || "";
            const civil_status = safe(body.civil_status) || "";
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
                    await conn.query(`
                        INSERT INTO employee_allowances (employee_id, allowance_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        a.allowance_type_id,
                        a.period,
                        a.amount
                    ]);
                }
            }

            // Deduction Payroll Entry
            if (Array.isArray(body.deductions)) {
                for (const d of body.deductions) {
                    await conn.query(`
                        INSERT INTO employee_deductions (employee_id, deduction_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        d.deduction_type_id,
                        d.period,
                        d.amount
                    ]);
                }
            }

            await conn.commit();
            conn.release();

            // Log audit (use pool separately)
            const userId = req.body.user_id || null;
            const adminName = req.body.admin_name || "Unknown";
            await logAudit(pool, userId, adminName, `Added Employee ${emp_code}`, "Success");

            res.json({ success: true, message: "Employee added successfully", emp_code });
        } catch (err) {
            await conn.rollback().catch(() => {});
            console.error("❌ /api/add_employee error:", err);
            res
            .status(500)
            .json({
                success: false,
                message: "Server error while adding employee",
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

            res.json({ success: true, employee });
        } catch (error) {
            console.error('Error fetching employee:', error);
            res.status(500).json({ success: false, message: 'Server error' });
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
                        comp.payroll_period || null,
                        comp.payroll_rate || null,
                        comp.main_computation || null,
                        comp.days_in_year || null,
                        comp.days_in_week || null,
                        comp.hours_in_day || null,
                        comp.week_in_year || null,
                        comp.strict_no_overtime ? 1 : 0,
                        comp.ot_rate || null,
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
                        comp.payroll_period || null,
                        comp.payroll_rate || null,
                        comp.main_computation || null,
                        comp.days_in_year || null,
                        comp.days_in_week || null,
                        comp.hours_in_day || null,
                        comp.week_in_year || null,
                        comp.strict_no_overtime ? 1 : 0,
                        comp.ot_rate || null,
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
                    await conn.query(`
                        INSERT INTO employee_allowances (employee_id, allowance_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        a.allowance_type_id,
                        a.period,
                        a.amount
                    ]);
                }
            }

            //  Deduction Payroll Entry
            await conn.query(`DELETE FROM employee_deductions WHERE employee_id = ?`, [employeeId]);

            if (Array.isArray(body.deductions)) {
                for (const d of body.deductions) {
                    await conn.query(`
                        INSERT INTO employee_deductions (employee_id, deduction_type_id, period, amount)
                        VALUES (?, ?, ?, ?)
                    `, [
                        employeeId,
                        d.deduction_type_id,
                        d.period,
                        d.amount
                    ]);
                }
            }

            await conn.commit();
            await logAudit(pool, req.body.user_id, req.body.admin_name, `Updated Employee ${empCode}`, 'Success');
            res.json({ success: true, message: "Employee updated successfully", emp_code: body.emp_code || empCode });
            conn.release();
        } catch (error) {
            console.error("❌ Error updating employee:", error);
            if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ success: false, message: "Employee ID already exists" });
            }
            res.status(500).json({ success: false, message: "Server error while updating employee", error: error.message });
        }
    });

    // ========== DELETE EMPLOYEE DETAILS ==========
    app.delete('/api/employee/:empCode', async (req, res) => {
    const empCode = req.params.empCode;

    try {
        const conn = await pool.getConnection();

        // 1️⃣ Find the employee_id first
        const [rows] = await conn.query(`SELECT employee_id FROM employees WHERE emp_code = ?`, [empCode]);
        
        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const employeeId = rows[0].employee_id;

        await conn.beginTransaction();

        // 2️⃣ Delete related records first (foreign key safe)
        await conn.query(`DELETE FROM employee_contacts WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_employment WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_accounts WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_dependents WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_payroll_settings WHERE employee_id = ?`, [employeeId]);
        await conn.query(`DELETE FROM employee_tax_insurance WHERE employee_id = ?`, [employeeId]);

        // 3️⃣ Finally, delete from main employees table
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
};