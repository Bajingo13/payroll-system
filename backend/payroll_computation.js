module.exports = function (app, pool) {
    function toMoney(value) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? number : 0;
    }

    function roundMoney(value) {
        return Math.round(toMoney(value) * 100) / 100;
    }

    const OT_ND_ADJ_COLUMNS = [
        "ot_adj_rg_rate", "ot_adj_rg_ot",
        "ot_adj_rd_rate", "ot_adj_rd_ot",
        "ot_adj_sd_rate", "ot_adj_sd_ot",
        "ot_adj_sdrd_rate", "ot_adj_sdrd_ot",
        "ot_adj_hd_rate", "ot_adj_hd_ot",
        "ot_adj_hdrd_rate", "ot_adj_hdrd_ot",
        "nd_adj_rg_rate", "nd_adj_rg_ot",
        "nd_adj_rd_rate", "nd_adj_rd_ot",
        "nd_adj_sd_rate", "nd_adj_sd_ot",
        "nd_adj_sdrd_rate", "nd_adj_sdrd_ot",
        "nd_adj_hd_rate", "nd_adj_hd_ot",
        "nd_adj_hdrd_rate", "nd_adj_hdrd_ot",
        "ot_adj_rg_rate_time", "ot_adj_rg_ot_time",
        "ot_adj_rd_rate_time", "ot_adj_rd_ot_time",
        "ot_adj_sd_rate_time", "ot_adj_sd_ot_time",
        "ot_adj_sdrd_rate_time", "ot_adj_sdrd_ot_time",
        "ot_adj_hd_rate_time", "ot_adj_hd_ot_time",
        "ot_adj_hdrd_rate_time", "ot_adj_hdrd_ot_time",
        "nd_adj_rg_rate_time", "nd_adj_rg_ot_time",
        "nd_adj_rd_rate_time", "nd_adj_rd_ot_time",
        "nd_adj_sd_rate_time", "nd_adj_sd_ot_time",
        "nd_adj_sdrd_rate_time", "nd_adj_sdrd_ot_time",
        "nd_adj_hd_rate_time", "nd_adj_hd_ot_time",
        "nd_adj_hdrd_rate_time", "nd_adj_hdrd_ot_time"
    ];

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

    function normalizeNumericColumns(source, columns) {
        const result = {};
        columns.forEach(col => {
            result[col] = Number(source?.[col]) || 0;
        });
        return result;
    }

    async function upsertPayrollAdjustment(conn, tableName, columns, payrollId, runId, employeeId, source) {
        if (!source || typeof source !== "object") return;
        const normalized = normalizeNumericColumns(source, columns);
        const [existing] = await conn.query(
            `SELECT adj_id FROM ${tableName} WHERE employee_id = ? AND run_id = ? LIMIT 1`,
            [employeeId, runId]
        );
        if (existing.length > 0) {
            const setClause = columns.map(col => `${col} = ?`).join(", ");
            await conn.query(
                `UPDATE ${tableName} SET ${setClause} WHERE employee_id = ? AND run_id = ?`,
                [...columns.map(col => normalized[col]), employeeId, runId]
            );
            return;
        }
        const insertColumns = ["payroll_id", "run_id", "employee_id", ...columns];
        const placeholders = insertColumns.map(() => "?").join(", ");
        await conn.query(
            `INSERT INTO ${tableName} (${insertColumns.join(", ")}) VALUES (${placeholders})`,
            [payrollId, runId, employeeId, ...columns.map(col => normalized[col])]
        );
    }

    function fixedPhilippineHolidayDates(year) {
        return new Set([
            `${year}-01-01`,
            `${year}-04-09`,
            `${year}-05-01`,
            `${year}-06-12`,
            `${year}-11-30`,
            `${year}-12-25`,
            `${year}-12-30`
        ]);
    }

    async function getNonWorkingHolidayDates(conn, startDate, endDate) {
        const years = new Set([String(startDate).slice(0, 4), String(endDate).slice(0, 4)]);
        const holidayDates = new Set();
        years.forEach((year) => {
            fixedPhilippineHolidayDates(year).forEach((date) => {
                if (date >= startDate && date <= endDate) holidayDates.add(date);
            });
        });
        try {
            const [rows] = await conn.query(
                `SELECT DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date
                 FROM company_calendar_events
                 WHERE event_date BETWEEN ? AND ?
                   AND (
                     is_paid_holiday = 1
                     OR LOWER(event_type) LIKE '%holiday%'
                     OR LOWER(event_type) LIKE '%non-working%'
                   )`,
                [startDate, endDate]
            );
            rows.forEach(row => {
                if (row.event_date) holidayDates.add(String(row.event_date).slice(0, 10));
            });
        } catch (_) {
            // Calendar table may not exist in older deployments; fixed holidays still apply.
        }
        return holidayDates;
    }

    // Returns Map<dateStr, 'regular'|'special'> for holiday premium pay computation.
    async function getClassifiedHolidayDates(conn, startDate, endDate) {
        const years = new Set([String(startDate).slice(0, 4), String(endDate).slice(0, 4)]);
        const holidayTypes = new Map();
        years.forEach((year) => {
            fixedPhilippineHolidayDates(year).forEach((date) => {
                if (date >= startDate && date <= endDate) holidayTypes.set(date, 'regular');
            });
        });
        try {
            const [rows] = await conn.query(
                `SELECT DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date, event_type, is_paid_holiday
                 FROM company_calendar_events
                 WHERE event_date BETWEEN ? AND ?
                   AND (
                     is_paid_holiday = 1
                     OR LOWER(event_type) LIKE '%holiday%'
                     OR LOWER(event_type) LIKE '%non-working%'
                   )`,
                [startDate, endDate]
            );
            rows.forEach(row => {
                if (!row.event_date) return;
                const dateKey = String(row.event_date).slice(0, 10);
                const type = String(row.event_type || '').toLowerCase();
                const isRegular = Number(row.is_paid_holiday) === 1 || type.includes('regular');
                holidayTypes.set(dateKey, isRegular ? 'regular' : 'special');
            });
        } catch (_) {
            // Calendar table may not exist in older deployments; fixed holidays still apply.
        }
        return holidayTypes;
    }

    function normalizePayPeriod(value) {
        const period = String(value || '').trim().toUpperCase();
        if (period.includes('SEMI')) return 'SEMI-MONTHLY';
        if (period.includes('WEEK')) return 'WEEKLY';
        return 'MONTHLY';
    }

    function getWorkingDaySet(daysInWeek, workingDaysStr) {
        // Prefer the explicit comma-separated day list (e.g. '2,3,4,5,6' for Tue–Sat).
        if (workingDaysStr && String(workingDaysStr).trim()) {
            const parsed = String(workingDaysStr).split(',')
                .map(s => Number(s.trim()))
                .filter(n => n >= 0 && n <= 6 && Number.isInteger(n));
            if (parsed.length > 0) return new Set(parsed);
        }
        // Fallback: derive from the count using Mon-first order.
        const normalized = Math.max(0, Math.min(7, Math.trunc(Number(daysInWeek) || 5)));
        const weeklyOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Fri, then Sat, then Sun.
        return new Set(weeklyOrder.slice(0, normalized));
    }

    function countScheduledWorkdays(startDate, endDate, workingDays, nonWorkingDates = new Set()) {
        let count = 0;
        const iterD = new Date(startDate + 'T12:00:00Z');
        const iterEnd = new Date(endDate + 'T12:00:00Z');
        while (iterD <= iterEnd) {
            const dateKey = iterD.toISOString().slice(0, 10);
            if (workingDays.has(iterD.getUTCDay()) && !nonWorkingDates.has(dateKey)) {
                count++;
            }
            iterD.setUTCDate(iterD.getUTCDate() + 1);
        }
        return count;
    }

    function normalizePayrollRate(value) {
        const rate = String(value || '').trim().toUpperCase();
        if (rate.includes('DAILY'))   return 'DAILY';
        if (rate.includes('HOURLY'))  return 'HOURLY';
        if (rate.includes('WEEKLY'))  return 'WEEKLY';
        if (rate.includes('PIECE'))   return 'PIECE';
        return 'MONTHLY'; // Monthly Rate or unknown
    }

    // Convert any stored rate to its monthly salary equivalent.
    function computeMonthlySalaryFromRate(mainComputation, payrollRate, settings = {}) {
        const amount     = toMoney(mainComputation);
        if (amount <= 0) return 0;
        const rate       = normalizePayrollRate(payrollRate);
        const daysInYear = toMoney(settings.days_in_year || 313);
        const hoursInDay = toMoney(settings.hours_in_day || 8);
        const weekInYear = toMoney(settings.week_in_year || 52);
        if (rate === 'DAILY')  return roundMoney(amount * daysInYear / 12);
        if (rate === 'HOURLY') return roundMoney(amount * hoursInDay * daysInYear / 12);
        if (rate === 'WEEKLY') return roundMoney(amount * weekInYear / 12);
        const result = roundMoney(amount); // MONTHLY or PIECE RATE
        return result;
    }

    // Compute the period salary from main_computation, respecting payroll_rate.
    function computePeriodSalary(mainComputation, payrollRate, payrollPeriod, settings = {}) {
        const monthly    = computeMonthlySalaryFromRate(mainComputation, payrollRate, settings);
        const period     = normalizePayPeriod(payrollPeriod);
        const weekInYear = toMoney(settings.week_in_year || 52);
        if (period === 'SEMI-MONTHLY') return roundMoney(monthly / 2);
        if (period === 'WEEKLY')       return roundMoney((monthly * 12) / weekInYear);
        return roundMoney(monthly); // MONTHLY
    }

    // Compute the effective daily rate from main_computation, respecting payroll_rate.
    function computeEffectiveDailyRate(mainComputation, payrollRate, settings = {}) {
        const amount     = toMoney(mainComputation);
        if (amount <= 0) return 0;
        const rate       = normalizePayrollRate(payrollRate);
        const daysInYear = toMoney(settings.days_in_year || 313);
        const daysInWeek = toMoney(settings.days_in_week || 5);
        const hoursInDay = toMoney(settings.hours_in_day || 8);
        if (rate === 'DAILY')  return roundMoney(amount);
        if (rate === 'HOURLY') return roundMoney(amount * hoursInDay);
        if (rate === 'WEEKLY') return roundMoney(daysInWeek > 0 ? amount / daysInWeek : 0);
        // Monthly Rate or Piece Rate: annualise then divide by working days/year
        return roundMoney(daysInYear > 0 ? (amount * 12) / daysInYear : 0);
    }

    function computeOvertimeAmount(totalHours, settings = {}, fallbackHourlyRate = 0, mainComputation = 0, payrollRate = 'Monthly Rate') {
        const otHours = toMoney(totalHours);
        if (otHours <= 0 || Number(settings.strict_no_overtime || 0) === 1) return 0;

        const hoursInDay = toMoney(settings.hours_in_day || 8) || 8;
        const rateBasisOt = toMoney(settings.rate_basis_ot);
        const daysInYearOt = toMoney(settings.days_in_year_ot || settings.days_in_year || 313);
        let otHourlyRate = toMoney(fallbackHourlyRate);

        if (rateBasisOt > 0) {
            otHourlyRate = roundMoney(rateBasisOt / hoursInDay);
        } else if (toMoney(mainComputation) > 0 && daysInYearOt > 0) {
            const otDailyRate = computeEffectiveDailyRate(mainComputation, payrollRate, {
                ...settings,
                days_in_year: daysInYearOt
            });
            otHourlyRate = roundMoney(otDailyRate / hoursInDay);
        }

        if (otHourlyRate <= 0) return 0;
        return roundMoney(otHours * otHourlyRate * 1.25);
    }

    async function ensurePayrollAutomationColumns(conn) {
        const [columns] = await conn.query(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'employee_payroll'
               AND COLUMN_NAME IN ('holiday_pay', 'leave_rows_json')`
        );

        const existing = new Set(columns.map(c => c.COLUMN_NAME));
        if (!existing.has('holiday_pay')) {
            await conn.query('ALTER TABLE employee_payroll ADD COLUMN holiday_pay DECIMAL(10,2) DEFAULT 0.00 AFTER overtime');
        }
        if (!existing.has('leave_rows_json')) {
            await conn.query('ALTER TABLE employee_payroll ADD COLUMN leave_rows_json MEDIUMTEXT DEFAULT NULL');
        }
    }

    // GSIS (RA 8291) contributes a flat percentage of the revised basic salary,
    // with no salary cap — unlike SSS's bracket table — so it is stored as a rate, not brackets.
    async function ensureGsisContributionTable(conn) {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS gsis_contribution_table (
                id INT NOT NULL AUTO_INCREMENT,
                ee_rate_percent DECIMAL(5,2) NOT NULL DEFAULT 9.00,
                er_rate_percent DECIMAL(5,2) NOT NULL DEFAULT 12.00,
                date_effective DATE NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        const [rows] = await conn.query('SELECT COUNT(*) AS cnt FROM gsis_contribution_table');
        if (!rows[0].cnt) {
            // Official RA 8291 rates: 9% employee share, 12% employer share of revised basic salary.
            await conn.query(
                `INSERT INTO gsis_contribution_table (ee_rate_percent, er_rate_percent, date_effective, is_active)
                 VALUES (9.00, 12.00, '1997-05-30', 1)`
            );
        }
    }

    async function lookupWithholdingTax(conn, taxableIncome, payPeriod, taxStatus) {
        const normalizedPeriod = normalizePayPeriod(payPeriod);

        // 1. Get code from description
        let status = 'Z'; // default fallback
        if (taxStatus) {
            const [statusRows] = await conn.query(
                `SELECT code
                FROM tax_exemptions_table
                WHERE UPPER(description) = UPPER(?)`,
                [String(taxStatus).trim()]
            );

            if (statusRows.length) {
                status = String(statusRows[0].code).trim().toUpperCase();
            }
        }
        console.log(`Status: ${status}, Period: ${normalizedPeriod}, Taxable Income: ${taxableIncome}`);

        // 2. Query WITH status
        let [rows] = await conn.query(
            `SELECT tax_low, tax_high, percent_over, amount
            FROM withholding_tax_table
            WHERE UPPER(REPLACE(pay_period, ' ', '-')) = ?
            AND UPPER(status) = ?
            AND ? >= tax_low
            AND (? <= tax_high OR tax_high = 0)
            ORDER BY tax_low DESC
            LIMIT 1`,
            [normalizedPeriod, status, taxableIncome, taxableIncome]
        );

        // fallback without status
        if (!rows.length) {
            [rows] = await conn.query(
                `SELECT tax_low, tax_high, percent_over, amount
                FROM withholding_tax_table
                WHERE UPPER(REPLACE(pay_period, ' ', '-')) = ?
                AND ? >= tax_low
                AND (? <= tax_high OR tax_high = 0)
                ORDER BY tax_low DESC
                LIMIT 1`,
                [normalizedPeriod, taxableIncome, taxableIncome]
            );
        }

        const bracket = rows[0];
        if (!bracket) return { amount: 0, bracket: null };

        const tax =
            toMoney(bracket.amount) +
            Math.max(0, taxableIncome - toMoney(bracket.tax_low)) *
            toMoney(bracket.percent_over);

        return { amount: roundMoney(tax), bracket };
    }

    async function computePayrollAutomation(conn, input) {
        const basicSalary = toMoney(input.basic_salary);
        const absenceDeduction = toMoney(input.absence_deduction);
        const lateDeduction = toMoney(input.late_deduction);
        const undertimeDeduction = toMoney(input.undertime_deduction);
        const overtime = toMoney(input.overtime);
        const holidayPay = toMoney(input.holiday_pay);
        const taxableAllowances = toMoney(input.taxable_allowances);
        const nonTaxableAllowances = toMoney(input.non_taxable_allowances);
        const adjComp = toMoney(input.adj_comp);
        const adjNonComp = toMoney(input.adj_non_comp);
        const totalLeavesUsed = toMoney(input.total_leaves_used);
        const additionalDeductions = toMoney(input.total_deductions);
        const loans = toMoney(input.loans);
        const otherDeductions = toMoney(input.other_deductions);
        const premiumAdj = toMoney(input.premium_adj);
        const grossPay = roundMoney(
            basicSalary -
            absenceDeduction -
            lateDeduction -
            undertimeDeduction +
            overtime +
            holidayPay +
            taxableAllowances +
            nonTaxableAllowances +
            adjComp +
            adjNonComp +
            totalLeavesUsed
        );
        const grandTotalDeductions = roundMoney(additionalDeductions + loans + otherDeductions + premiumAdj);
        const netPay = roundMoney(grossPay - grandTotalDeductions);

        return {
            success: true,
            gross_pay: grossPay,
            grand_total_deductions: grandTotalDeductions,
            net_pay: netPay
        };
    }

    // GET HRIS data (approved OT + leave + attendance adjustments) for a given employee and payroll period
    app.get("/api/payroll/hris-data", async (req, res) => {
        const employeeId = Number(req.query.employee_id);
        const monthInput = String(req.query.month_id || '').trim();
        const yearInput = String(req.query.year_id || '').trim();
        const periodInput = String(req.query.period_id || '').trim();
        const runId = req.query.run_id ? Number(req.query.run_id) : null;
        const paramBasicSalary = req.query.basic_salary ? Number(req.query.basic_salary) : 0;
        const groupInput = String(req.query.group_id || '').trim();

        if (!employeeId || !monthInput || !yearInput || !periodInput) {
            return res.status(400).json({ success: false, message: "Missing required parameters: employee_id, month_id, year_id, period_id." });
        }

        let conn;
        try {
            conn = await pool.getConnection();

            let monthId = Number(monthInput) || null;
            let yearId = Number(yearInput) || null;
            let periodId = Number(periodInput) || null;
            let paramGroupId = Number(groupInput) || null;

            let [[monthRow]] = monthId
                ? await conn.query("SELECT month_id, month_name FROM payroll_months WHERE month_id = ? LIMIT 1", [monthId])
                : [[]];
            if (!monthRow) {
                [[monthRow]] = await conn.query(
                    "SELECT month_id, month_name FROM payroll_months WHERE LOWER(month_name) = LOWER(?) LIMIT 1",
                    [monthInput]
                );
                if (monthRow) monthId = Number(monthRow.month_id);
            }

            let [[yearRow]] = yearId
                ? await conn.query("SELECT year_id, year_value FROM payroll_years WHERE year_id = ? LIMIT 1", [yearId])
                : [[]];
            // Fallback: if year_id did not match a DB row, try treating it as a year_value (e.g. 2026)
            if (!yearRow) {
                [[yearRow]] = await conn.query("SELECT year_id, year_value FROM payroll_years WHERE year_value = ? LIMIT 1", [yearInput]);
                if (yearRow) yearId = Number(yearRow.year_id);
            }
            // Last resort: if yearId looks like a valid calendar year, use it directly
            if (!yearRow && yearId >= 2000 && yearId <= 2100) {
                yearRow = { year_value: yearId };
            }

            let [[periodRow]] = periodId
                ? await conn.query("SELECT period_id, period_name FROM payroll_periods WHERE period_id = ? LIMIT 1", [periodId])
                : [[]];
            if (!periodRow) {
                [[periodRow]] = await conn.query(
                    "SELECT period_id, period_name FROM payroll_periods WHERE LOWER(period_name) = LOWER(?) LIMIT 1",
                    [periodInput]
                );
                if (periodRow) periodId = Number(periodRow.period_id);
            }
            if (!periodRow && periodInput.toLowerCase() === 'monthly') {
                periodRow = { period_name: 'Monthly' };
            }

            if (!paramGroupId && groupInput) {
                const [[groupRow]] = await conn.query(
                    "SELECT group_id FROM payroll_groups WHERE LOWER(group_name) = LOWER(?) LIMIT 1",
                    [groupInput]
                );
                if (groupRow) paramGroupId = Number(groupRow.group_id);
            }

            if (!monthRow || !yearRow || !periodRow) {
                return res.status(404).json({ success: false, message: "Invalid month, year, or period ID." });
            }

            const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
            const monthNum = MONTH_NAMES.indexOf(String(monthRow.month_name || "").trim().toLowerCase()) + 1;
            const yearVal = Number(yearRow.year_value);
            const periodName = String(periodRow.period_name || "").toLowerCase();

            if (!monthNum) {
                return res.status(400).json({ success: false, message: `Unrecognized month name: ${monthRow.month_name}` });
            }

            const lastDay = new Date(yearVal, monthNum, 0).getDate();
            const mm = String(monthNum).padStart(2, "0");
            let startDate, endDate;
            if (periodName.includes("week")) {
                // Weekly periods: 1st Week = 1–7, 2nd = 8–14, 3rd = 15–21, 4th = 22–end
                if (periodName.includes("1st")) {
                    startDate = `${yearVal}-${mm}-01`;
                    endDate   = `${yearVal}-${mm}-07`;
                } else if (periodName.includes("2nd")) {
                    startDate = `${yearVal}-${mm}-08`;
                    endDate   = `${yearVal}-${mm}-14`;
                } else if (periodName.includes("3rd")) {
                    startDate = `${yearVal}-${mm}-15`;
                    endDate   = `${yearVal}-${mm}-21`;
                } else {
                    // 4th Week: 22–end
                    startDate = `${yearVal}-${mm}-22`;
                    endDate   = `${yearVal}-${mm}-${lastDay}`;
                }
            } else if (periodName.includes("first") || periodName.includes("1st")) {
                // Semi-monthly first half: 1–15
                startDate = `${yearVal}-${mm}-01`;
                endDate   = `${yearVal}-${mm}-15`;
            } else if (periodName.includes("second") || periodName.includes("2nd")) {
                // Semi-monthly second half: 16–end
                startDate = `${yearVal}-${mm}-16`;
                endDate   = `${yearVal}-${mm}-${lastDay}`;
            } else {
                // Monthly: full month
                startDate = `${yearVal}-${mm}-01`;
                endDate   = `${yearVal}-${mm}-${lastDay}`;
            }

            // Employee salary/work-schedule settings
            const [[settings]] = await conn.query(
                `SELECT main_computation, payroll_period, payroll_rate,
                        days_in_year, days_in_week, hours_in_day, week_in_year,
                        strict_no_overtime, ot_rate, days_in_year_ot, rate_basis_ot,
                        basis_absences, basis_overtime,
                        COALESCE(time_in, '08:00')       AS time_in,
                        COALESCE(working_days, '')        AS working_days
                 FROM employee_payroll_settings
                 WHERE employee_id = ? LIMIT 1`,
                [employeeId]
            );

            // Determine payroll group name (Weekly / Semi-Monthly / Monthly) in priority:
            // 1. group_id param from frontend → look up group_name
            // 2. run's group_id → look up group_name
            // 3. employee_payroll_settings.payroll_period
            let groupName = String(settings?.payroll_period || '').trim();
            if (paramGroupId) {
                const [[grpRow]] = await conn.query(
                    `SELECT group_name FROM payroll_groups WHERE group_id = ? LIMIT 1`,
                    [paramGroupId]
                );
                if (grpRow) groupName = String(grpRow.group_name || '');
            } else if (runId) {
                const [[runRow]] = await conn.query(
                    `SELECT pg.group_name FROM payroll_runs pr
                     JOIN payroll_groups pg ON pg.group_id = pr.group_id
                     WHERE pr.run_id = ? LIMIT 1`,
                    [runId]
                );
                if (runRow) groupName = String(runRow.group_name || '');
            }

            // main_computation is the employee's monthly/base salary.
            // Payroll group controls the displayed payroll-period salary, not the attendance rate basis.

            // Fallback salary: if settings has no main_computation, use (in priority order):
            // 1. basic_salary passed as query param (from frontend payroll record)
            // 2. most recent non-null basic_salary from employee_payroll
            let fallbackBasicSalary = 0;
            if (!(settings && Number(settings.main_computation) > 0)) {
                if (paramBasicSalary > 0) {
                    fallbackBasicSalary = paramBasicSalary;
                } else {
                    const [[payrollRow]] = await conn.query(
                        `SELECT basic_salary FROM employee_payroll
                         WHERE employee_id = ? AND basic_salary IS NOT NULL AND basic_salary > 0
                         ORDER BY run_id DESC LIMIT 1`,
                        [employeeId]
                    );
                    fallbackBasicSalary = Number(payrollRow?.basic_salary || 0);
                }
            }

            // Approved OT requests within period
            const [otRows] = await conn.query(
                `SELECT overtime_request_id, overtime_date, start_time, end_time, total_hours, reason
                 FROM employee_overtime_requests
                 WHERE employee_id = ? AND status = 'Approved'
                   AND overtime_date BETWEEN ? AND ?
                 ORDER BY overtime_date ASC`,
                [employeeId, startDate, endDate]
            );

            // Approved leave requests overlapping with period
            const [leaveRows] = await conn.query(
                `SELECT r.request_id, r.leave_type_id, r.start_date, r.end_date, r.total_days, r.reason, t.leave_name
                 FROM employee_leave_requests r
                 JOIN leave_types t ON t.leave_type_id = r.leave_type_id
                 WHERE r.employee_id = ? AND r.status = 'Approved'
                   AND NOT (r.end_date < ? OR r.start_date > ?)
                 ORDER BY r.start_date ASC`,
                [employeeId, startDate, endDate]
            );

            // Active loans due this period
            const [loanRows] = await conn.query(
                `SELECT loan_id, loan_category, amortization_amount, balance_amount, payment_frequency
                 FROM employee_loans
                 WHERE employee_id = ? AND status = 'Active'
                   AND (
                     LOWER(payment_frequency) = 'both'
                     OR LOWER(payment_frequency) = 'monthly'
                     OR LOWER(payment_frequency) = LOWER(?)
                   )
                 ORDER BY loan_id ASC`,
                [employeeId, periodName]
            );
            const totalLoanAmortization = Math.round(
                loanRows.reduce((s, r) => s + Number(r.amortization_amount || 0), 0) * 100
            ) / 100;

            // Employee allowances (taxable and non-taxable), filtered by period
            const [allowanceRows] = await conn.query(
                `SELECT ea.emp_allowance_id, ea.amount, at.allowance_name, at.is_taxable, ea.period
                 FROM employee_allowances ea
                 JOIN allowance_types at ON at.allowance_type_id = ea.allowance_type_id
                 WHERE ea.employee_id = ?
                   AND (
                     LOWER(ea.period) = 'both'
                     OR LOWER(ea.period) = LOWER(?)
                     OR LOWER(ea.period) = 'monthly'
                   )
                 ORDER BY ea.emp_allowance_id ASC`,
                [employeeId, periodName]
            );
            const taxableAllowances = Math.round(
                allowanceRows.filter(a => Number(a.is_taxable) === 1).reduce((s, a) => s + Number(a.amount || 0), 0) * 100
            ) / 100;
            const nonTaxableAllowances = Math.round(
                allowanceRows.filter(a => Number(a.is_taxable) !== 1).reduce((s, a) => s + Number(a.amount || 0), 0) * 100
            ) / 100;

            let totalOtHours = Math.round(otRows.reduce((s, r) => s + Number(r.total_hours || 0), 0) * 100) / 100;

            const workingDays = getWorkingDaySet(settings?.days_in_week, settings?.working_days);
            const nonWorkingHolidayDates = await getNonWorkingHolidayDates(conn, startDate, endDate);
            const holidayTypeMap = await getClassifiedHolidayDates(conn, startDate, endDate);

            // Fetch employee hire date so HRIS attendance starts no earlier than date_hired.
            const [[empHireRow]] = await conn.query(
                `SELECT date_hired FROM employee_employment WHERE employee_id = ? LIMIT 1`,
                [employeeId]
            );
            const hireDateStr = empHireRow?.date_hired
                ? String(empHireRow.date_hired).slice(0, 10)
                : null;
            const absentCountStartDate = (hireDateStr && hireDateStr > startDate) ? hireDateStr : startDate;
            const periodRangeStartDate = (hireDateStr && hireDateStr > startDate && hireDateStr <= endDate)
                ? hireDateStr
                : startDate;

            // Clip leave days to payroll period/hire-date boundaries and count only scheduled workdays.
            let totalLeaveDays = 0;
            for (const leave of leaveRows) {
                const effectiveStart = [leave.start_date, startDate, absentCountStartDate].sort().pop();
                const effectiveEnd   = leave.end_date   < endDate   ? leave.end_date   : endDate;
                totalLeaveDays += countScheduledWorkdays(effectiveStart, effectiveEnd, workingDays, nonWorkingHolidayDates);
            }
            totalLeaveDays = Math.round(totalLeaveDays * 100) / 100;

            // Compute monetary amounts
            let otAmount = 0;
            let absenceDeduction = 0;
            let dailyRate = 0;
            let hourlyRate = 0;
            let exactAbsenceDailyRate = 0;
            let periodSalaryForAbsence = 0;
            let holidayPremium = 0;
            const HOLIDAY_PREMIUM_RATE = { regular: 1.00, special: 0.30 };
            function addHolidayPremiumForPresentDates(presentDateSet) {
                holidayTypeMap.forEach((type, dateKey) => {
                    if (presentDateSet.has(dateKey)) {
                        holidayPremium += dailyRate * (HOLIDAY_PREMIUM_RATE[type] || 0);
                    }
                });
            }

            const effectiveSalary = (settings && Number(settings.main_computation) > 0)
                ? Number(settings.main_computation)
                : fallbackBasicSalary;

            // Determine the payroll_rate for the fallback path (no settings row).
            const effectivePayrollRate = settings?.payroll_rate || 'Monthly Rate';

            if (effectiveSalary > 0 || paramBasicSalary > 0) {
                const hoursInDay  = Number(settings?.hours_in_day  || 8);
                const daysInYear  = toMoney(settings?.days_in_year  || 313);
                const daysInWeek  = toMoney(settings?.days_in_week  || 5);
                const weekInYear  = toMoney(settings?.week_in_year  || 52);

                if (paramBasicSalary > 0) {
                    // Derive daily rate from the period salary sent by the frontend so
                    // the result is consistent with the displayed Basic Salary regardless
                    // of the employee's payroll_rate setting (e.g. 'Daily Rate' in DB while
                    // the employee is actually monthly-paid).
                    // Use Philippine standard: monthly salary / 26 = daily rate.
                    const grpPeriod = normalizePayPeriod(groupName);
                    let monthlySalary;
                    if (grpPeriod === 'SEMI-MONTHLY')   monthlySalary = paramBasicSalary * 2;
                    else if (grpPeriod === 'WEEKLY')     monthlySalary = Math.round(paramBasicSalary * weekInYear / 12 * 100) / 100;
                    else                                 monthlySalary = paramBasicSalary; // MONTHLY
                    const effectiveDaysInYear = daysInYear >= 26 ? daysInYear : 313;
                    dailyRate = Math.round((monthlySalary * 12) / effectiveDaysInYear * 100) / 100;
                } else {
                    dailyRate = computeEffectiveDailyRate(effectiveSalary, effectivePayrollRate, settings || {});
                }

                exactAbsenceDailyRate = dailyRate;
                hourlyRate            = Math.round((dailyRate / hoursInDay) * 100) / 100;
                otAmount = computeOvertimeAmount(totalOtHours, settings || {}, hourlyRate, effectiveSalary, effectivePayrollRate);
                // absenceDeduction computed after attendance block once totalAbsentDays is known
            }

            {
            // Fetch employee hire date so absent counting starts no earlier than date_hired
            const [[empHireRow]] = await conn.query(
                `SELECT date_hired FROM employee_employment WHERE employee_id = ? LIMIT 1`,
                [employeeId]
            );
            const hireDateStr = empHireRow?.date_hired
                ? String(empHireRow.date_hired).slice(0, 10)
                : null;
            // Effective start for absent counting: whichever is later — period start or hire date
            const absentCountStartDate = (hireDateStr && hireDateStr > startDate) ? hireDateStr : startDate;

            }
            // totalAbsentDays: start with leave-based count; replaced by attendance-based when user account exists
            let totalAbsentDays = totalLeaveDays;

            // Attendance (late / undertime / OT override / absent):
            // Priority 1 – payroll_attendance_adjustments (manual HR override)
            // Priority 2 – hris_attendance (pre-computed by HRIS, saved in real-time)
            // Priority 3 – compute directly from audit_logs (daily timekeeping)
            let lateMinutes = 0, lateDeduction = 0, undertimeMinutes = 0, undertimeDeduction = 0;
            let attendanceSource = 'none';
            {
                let attAdj = null;

                if (runId) {
                    [[attAdj]] = await conn.query(
                        `SELECT late_time, late_amt, undertime_time, undertime_amt
                         FROM payroll_attendance_adjustments
                         WHERE employee_id = ? AND run_id = ? LIMIT 1`,
                        [employeeId, runId]
                    );
                }

                if (!attAdj) {
                    [[attAdj]] = await conn.query(
                        `SELECT paa.late_time, paa.late_amt, paa.undertime_time, paa.undertime_amt
                         FROM payroll_attendance_adjustments paa
                         JOIN payroll_runs pr ON pr.run_id = paa.run_id
                         WHERE paa.employee_id = ? AND pr.period_id = ? AND pr.month_id = ? AND pr.year_id = ?
                         ORDER BY paa.adj_id DESC LIMIT 1`,
                        [employeeId, periodId, monthId, yearId]
                    );
                }

                if (attAdj) {
                    // Priority 1: manual payroll adjustment
                    lateMinutes      = Number(attAdj.late_time  || 0);
                    undertimeMinutes = Number(attAdj.undertime_time || 0);
                    lateDeduction = Number(attAdj.late_amt || 0) ||
                        Math.round((lateMinutes / 60) * hourlyRate * 100) / 100;
                    undertimeDeduction = Number(attAdj.undertime_amt || 0) ||
                        Math.round((undertimeMinutes / 60) * hourlyRate * 100) / 100;
                    attendanceSource = 'payroll_adjustment';
                } else {
                    // Priority 2: hris_attendance table (pre-computed, saved in real-time from HRIS)
                    let hrisAttRows = [];
                    try {
                        [hrisAttRows] = await conn.query(
                            `SELECT attendance_date, time_in, late_minutes, undertime_minutes, overtime_hours, status
                             FROM hris_attendance
                             WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?
                             ORDER BY attendance_date ASC`,
                            [employeeId, absentCountStartDate, endDate]
                        );
                    } catch (_) { hrisAttRows = []; } // table may not exist on older deployments

                    if (hrisAttRows.length > 0) {
                        const toDateKey = (value) => {
                            if (!value) return '';
                            if (value instanceof Date) return value.toISOString().slice(0, 10);
                            return String(value).slice(0, 10);
                        };
                        const presentDates = new Set();
                        const explicitAbsentDates = new Set();
                        hrisAttRows.forEach((row) => {
                            const dateKey = toDateKey(row.attendance_date);
                            if (!dateKey) return;
                            const status = String(row.status || '').toLowerCase();
                            if (status.includes('absent') || !row.time_in) {
                                const rowDate = new Date(dateKey + 'T12:00:00Z');
                                if (dateKey >= absentCountStartDate && workingDays.has(rowDate.getUTCDay()) && !nonWorkingHolidayDates.has(dateKey)) {
                                    explicitAbsentDates.add(dateKey);
                                }
                                return;
                            }
                            presentDates.add(dateKey);
                        });
                        addHolidayPremiumForPresentDates(presentDates);
                        const hrisAbsentDates = new Set(explicitAbsentDates);
                        const iterD = new Date(absentCountStartDate + 'T12:00:00Z');
                        const iterEnd = new Date(endDate + 'T12:00:00Z');
                        while (iterD <= iterEnd) {
                            const dateKey = iterD.toISOString().slice(0, 10);
                            if (workingDays.has(iterD.getUTCDay()) && !nonWorkingHolidayDates.has(dateKey) && !presentDates.has(dateKey)) {
                                hrisAbsentDates.add(dateKey);
                            }
                            iterD.setUTCDate(iterD.getUTCDate() + 1);
                        }
                        const hrisAbsentCount = hrisAbsentDates.size;
                        const totalHrisLateMin      = hrisAttRows.reduce((s, r) => s + Number(r.late_minutes     || 0), 0);
                        const totalHrisUndertimeMin = hrisAttRows.reduce((s, r) => s + Number(r.undertime_minutes || 0), 0);
                        const totalHrisOtHours      = Math.round(hrisAttRows.reduce((s, r) => s + Number(r.overtime_hours || 0), 0) * 100) / 100;

                        if (hrisAbsentCount > 0) totalAbsentDays = hrisAbsentCount;
                        lateMinutes      = totalHrisLateMin;
                        undertimeMinutes = totalHrisUndertimeMin;

                        if (hourlyRate > 0) {
                            lateDeduction      = Math.round((lateMinutes      / 60) * hourlyRate * 100) / 100;
                            undertimeDeduction = Math.round((undertimeMinutes / 60) * hourlyRate * 100) / 100;
                        }
                        if (totalHrisOtHours > 0 && hourlyRate > 0) {
                            totalOtHours = totalHrisOtHours;
                            otAmount = computeOvertimeAmount(totalHrisOtHours, settings || {}, hourlyRate, effectiveSalary, effectivePayrollRate);
                        }
                        attendanceSource = 'hris_attendance';
                    } else {
                    // Priority 3: No hris_attendance records — compute from actual daily time records in audit_logs
                    const [[empUserRow]] = await conn.query(
                        `SELECT u.user_id
                         FROM employees e
                         JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(e.emp_code))
                         WHERE e.employee_id = ?
                         LIMIT 1`,
                        [employeeId]
                    );

                    if (empUserRow) {
                        const [attLogs] = await conn.query(
                            `SELECT
                               MIN(CASE WHEN action = 'Employee Time In'   THEN log_time END) AS time_in,
                               MIN(CASE WHEN action = 'Employee Break Out' THEN log_time END) AS break_out,
                               MIN(CASE WHEN action = 'Employee Break In'  THEN log_time END) AS break_in,
                               MAX(CASE WHEN action = 'Employee Time Out'  THEN log_time END) AS time_out
                             FROM audit_logs
                             WHERE user_id = ?
                               AND action IN ('Employee Time In','Employee Break Out','Employee Break In','Employee Time Out')
                               AND DATE(log_time) BETWEEN ? AND ?
                             GROUP BY DATE(log_time)`,
                            [empUserRow.user_id, absentCountStartDate, endDate]
                        );

                        // Dates the employee was present (has a time_in record)
                        const presentDates = new Set(
                            attLogs
                                .filter(day => day.time_in)
                                .map(day => String(day.time_in).slice(0, 10))
                        );
                        addHolidayPremiumForPresentDates(presentDates);

                        // Count scheduled workdays in the period where employee was absent. (starting from hire date)
                        let absentCount = 0;
                        const iterD = new Date(absentCountStartDate + 'T12:00:00Z');
                        const iterEnd = new Date(endDate + 'T12:00:00Z');
                        while (iterD <= iterEnd) {
                            const dateStr = iterD.toISOString().slice(0, 10);
                            if (workingDays.has(iterD.getUTCDay()) && !nonWorkingHolidayDates.has(dateStr) && !presentDates.has(dateStr)) absentCount++;
                            iterD.setUTCDate(iterD.getUTCDate() + 1);
                        }
                        totalAbsentDays = absentCount;
                        console.log("attLogs:", attLogs);
                        console.log(iterD, iterEnd, absentCountStartDate, endDate, workingDays, nonWorkingHolidayDates, presentDates, totalAbsentDays);
                        attendanceSource = 'computed_from_attendance';

                        // Parse scheduled shift start from settings (e.g. '08:00', '22:00').
                        const [schedHH, schedMM] = String(settings?.time_in || '08:00').split(':').map(Number);
                        const scheduledMinutesPerDay = Math.round(toMoney(settings?.hours_in_day || 8) * 60);

                        let totalLateMin = 0, totalUndertimeMin = 0;
                        for (const day of attLogs) {
                            if (day.time_in) {
                                const timeIn = new Date(String(day.time_in).replace(' ', 'T'));
                                const shiftStart = new Date(timeIn);
                                shiftStart.setHours(schedHH, schedMM, 0, 0);
                                if (timeIn > shiftStart) {
                                    totalLateMin += Math.floor((timeIn - shiftStart) / 60000);
                                }
                            }
                            if (day.time_in && day.time_out) {
                                const timeIn  = new Date(String(day.time_in).replace(' ', 'T'));
                                const timeOut = new Date(String(day.time_out).replace(' ', 'T'));
                                let workedMin = Math.floor((timeOut - timeIn) / 60000);
                                if (day.break_out && day.break_in) {
                                    const brkOut = new Date(String(day.break_out).replace(' ', 'T'));
                                    const brkIn  = new Date(String(day.break_in).replace(' ', 'T'));
                                    if (brkIn > brkOut) workedMin -= Math.floor((brkIn - brkOut) / 60000);
                                }
                                totalUndertimeMin += Math.max(0, scheduledMinutesPerDay - workedMin);
                            }
                        }

                        if (totalLateMin > 0 || totalUndertimeMin > 0) {
                            lateMinutes      = totalLateMin;
                            undertimeMinutes = totalUndertimeMin;
                            if (hourlyRate > 0) {
                                lateDeduction      = Math.round((lateMinutes      / 60) * hourlyRate * 100) / 100;
                                undertimeDeduction = Math.round((undertimeMinutes / 60) * hourlyRate * 100) / 100;
                            }
                        }
                    }
                    } // end priority 3 (audit_logs)
                }
            }

            // Finalize absence deduction using actual absent days. Use the exact daily
            // rate for multiplication so a full-period absence equals the period salary.
            const rawAbsenceDeduction = Math.round(totalAbsentDays * (exactAbsenceDailyRate || dailyRate) * 100) / 100;
            absenceDeduction = periodSalaryForAbsence > 0
                ? Math.min(rawAbsenceDeduction, roundMoney(periodSalaryForAbsence))
                : rawAbsenceDeduction;
            if (Number(settings?.strict_no_overtime || 0) === 1) {
                totalOtHours = 0;
                otAmount = 0;
            }
            const displayedOtHours = totalOtHours > 0
                ? totalOtHours
                : (otAmount > 0 && hourlyRate > 0 ? Math.round((otAmount / hourlyRate / 1.25) * 100) / 100 : 0);
            holidayPremium = Math.round(holidayPremium * 100) / 100;

            return res.json({
                success: true,
                period_range: `${periodRangeStartDate} to ${endDate}`,
                ot: {
                    requests: otRows,
                    total_hours: displayedOtHours,
                    computed_amount: otAmount
                },
                holiday: {
                    dates: Array.from(holidayTypeMap.entries()).map(([date, type]) => ({ date, type })),
                    computed_amount: holidayPremium
                },
                absences: {
                    requests: leaveRows,
                    total_days: totalAbsentDays,
                    total_days_from_leaves: totalLeaveDays,
                    computed_deduction: absenceDeduction
                },
                attendance: {
                    late_minutes: lateMinutes,
                    late_deduction: lateDeduction,
                    undertime_minutes: undertimeMinutes,
                    undertime_deduction: undertimeDeduction,
                    source: attendanceSource
                },
                loans: {
                    records: loanRows,
                    total_amortization: totalLoanAmortization
                },
                allowances: {
                    records: allowanceRows,
                    taxable: taxableAllowances,
                    non_taxable: nonTaxableAllowances
                },
                rates: settings ? { daily_rate: dailyRate, hourly_rate: hourlyRate } : null
            });
        } catch (err) {
            console.error("HRIS data fetch error:", err);
            return res.status(500).json({ success: false, message: err.message || "Server error" });
        } finally {
            if (conn) conn.release();
        }
    });

    app.post("/api/payroll/auto-compute", async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            await ensurePayrollAutomationColumns(conn);
            const computed = await computePayrollAutomation(conn, req.body || {});
            res.json(computed);
        } catch (err) {
            console.error("Payroll auto-compute error:", err);
            res.status(500).json({ success: false, message: err.message || "Unable to auto-compute payroll." });
        } finally {
            if (conn) conn.release();
        }
    });

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
        } catch (err) {
            console.error("Failed to log audit:", err.message);
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

        let conn;
        try {
            const query = `
                SELECT
                    pr.run_id,
                    COUNT(ep.employee_id) AS employee_count
                FROM payroll_runs pr
                LEFT JOIN employee_payroll ep ON ep.run_id = pr.run_id
                WHERE (
                    CAST(pr.group_id AS CHAR) = ?
                    OR LOWER(TRIM(CAST(pr.group_id AS CHAR))) = (
                        SELECT LOWER(TRIM(group_name))
                        FROM payroll_groups
                        WHERE CAST(group_id AS CHAR) = ?
                        LIMIT 1
                    )
                )
                AND (
                    CAST(pr.period_id AS CHAR) = ?
                    OR LOWER(TRIM(CAST(pr.period_id AS CHAR))) = (
                        SELECT LOWER(TRIM(period_name))
                        FROM payroll_periods
                        WHERE CAST(period_id AS CHAR) = ?
                        LIMIT 1
                    )
                )
                AND (
                    CAST(pr.month_id AS CHAR) = ?
                    OR LOWER(TRIM(CAST(pr.month_id AS CHAR))) = (
                        SELECT LOWER(TRIM(month_name))
                        FROM payroll_months
                        WHERE CAST(month_id AS CHAR) = ?
                        LIMIT 1
                    )
                )
                AND (
                    CAST(pr.year_id AS CHAR) = ?
                    OR CAST(pr.year_id AS CHAR) = (
                        SELECT CAST(year_value AS CHAR)
                        FROM payroll_years
                        WHERE CAST(year_id AS CHAR) = ?
                        LIMIT 1
                    )
                )
                GROUP BY pr.run_id
                ORDER BY employee_count DESC, pr.run_id DESC
                LIMIT 1
            `;
            
            const params = [
                payroll_group,
                payroll_group,
                payroll_period,
                payroll_period,
                month,
                month,
                year,
                year
            ];
            conn = await pool.getConnection();
            const [rows] = await conn.query(query, params);

            if (rows.length > 0) {
                res.json({ success: true, run_id: rows[0].run_id }); // Return the first found run_id
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

    // GET filtered employees from the employee_payroll based on payroll_runs
    app.get("/api/employees_for_payroll_run", async (req, res) => {
        const { run_id, status } = req.query;

        if (!run_id) {
            return res.status(400).json({ success: false, message: "run_id is required" });
        }

        try {
            let query = `
                SELECT ep.employee_id, e.first_name, e.last_name, e.emp_code,
                    ee.company, ee.department, ee.position, e.status
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

    // GET /api/payroll_runs_history — every payroll run ever created, with totals, for the admin Payroll History page
    //
    // NOTE: payroll_runs.group_id/period_id/year_id are NOT reliable foreign keys — depending on how the
    // run was created they may hold the lookup table's numeric id OR its raw name/value (e.g. group_id
    // can be "1" or "semi-monthly", year_id can be "37" or "2026"). month_id is consistently numeric.
    // Name resolution and filtering below therefore checks both representations, relying on MySQL's
    // implicit numeric coercion (not CAST(...AS CHAR), which forces the connection's default collation
    // and clashes with these columns' utf8mb4_0900_ai_ci collation).
    app.get("/api/payroll_runs_history", async (req, res) => {
        const { year_id, month_id, group_id, status, search } = req.query;

        const conditions = [];
        const params = [];

        if (year_id) {
            conditions.push(`(
                pr.year_id = ?
                OR pr.year_id = (SELECT year_value FROM payroll_years WHERE year_id = ? LIMIT 1)
            )`);
            params.push(year_id, year_id);
        }
        if (month_id) {
            conditions.push("pr.month_id = ?");
            params.push(month_id);
        }
        if (group_id) {
            conditions.push(`(
                pr.group_id = ?
                OR LOWER(TRIM(pr.group_id)) = (
                    SELECT LOWER(TRIM(group_name)) FROM payroll_groups WHERE group_id = ? LIMIT 1
                )
            )`);
            params.push(group_id, group_id);
        }
        if (status) { conditions.push("pr.status = ?"); params.push(status); }
        if (search) { conditions.push("pr.payroll_range LIKE ?"); params.push(`%${search}%`); }

        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        let conn;
        try {
            conn = await pool.getConnection();
            const [rows] = await conn.query(
                `SELECT
                    pr.run_id,
                    pr.payroll_range,
                    pr.status,
                    pr.date_created,
                    pr.date_completed,
                    COALESCE(
                        (SELECT group_name FROM payroll_groups WHERE group_id = pr.group_id LIMIT 1),
                        (SELECT group_name FROM payroll_groups WHERE LOWER(TRIM(group_name)) = LOWER(TRIM(pr.group_id)) LIMIT 1),
                        pr.group_id
                    ) AS group_name,
                    COALESCE(
                        (SELECT period_name FROM payroll_periods WHERE period_id = pr.period_id LIMIT 1),
                        (SELECT period_name FROM payroll_periods WHERE LOWER(TRIM(period_name)) = LOWER(TRIM(pr.period_id)) LIMIT 1),
                        pr.period_id
                    ) AS period_name,
                    COALESCE(
                        (SELECT month_name FROM payroll_months WHERE month_id = pr.month_id LIMIT 1),
                        pr.month_id
                    ) AS month_name,
                    COALESCE(
                        (SELECT year_value FROM payroll_years WHERE year_value = pr.year_id LIMIT 1),
                        (SELECT year_value FROM payroll_years WHERE year_id = pr.year_id LIMIT 1),
                        pr.year_id
                    ) AS year_value,
                    COUNT(ep.payroll_id) AS employee_count,
                    COALESCE(SUM(ep.gross_pay), 0) AS total_gross,
                    COALESCE(SUM(ep.total_deductions), 0) AS total_deductions,
                    COALESCE(SUM(ep.net_pay), 0) AS total_net
                FROM payroll_runs pr
                LEFT JOIN employee_payroll ep ON ep.run_id = pr.run_id
                ${whereClause}
                GROUP BY pr.run_id
                ORDER BY pr.date_created DESC, pr.run_id DESC`,
                params
            );

            return res.json({ success: true, runs: rows });
        } catch (err) {
            console.error("Error fetching payroll runs history:", err);
            res.status(500).json({ success: false, message: "Server error" });
        } finally {
            if (conn) conn.release();
        }
    });

    // GET /api/payroll_runs/:run_id/payslips — full payslip data for every employee in a saved payroll run
    app.get("/api/payroll_runs/:run_id/payslips", async (req, res) => {
        const { run_id } = req.params;

        let conn;
        try {
            conn = await pool.getConnection();
            const [rows] = await conn.query(`
                SELECT
                    e.employee_id, e.emp_code, e.first_name, e.last_name, e.middle_name, e.status,

                    ee.company, ee.location, ee.branch, ee.division, ee.department, ee.class,
                    ee.position, ee.employee_type, ee.date_hired,

                    ea.salary_type,

                    ep.payroll_id, ep.run_id, ep.payroll_status, ep.date_generated,
                    ep.basic_salary, ep.absence_time, ep.absence_deduction,
                    ep.late_time, ep.late_deduction, ep.undertime, ep.undertime_deduction,
                    ep.overtime, ep.holiday_pay, ep.taxable_allowances, ep.non_taxable_allowances,
                    ep.adj_comp, ep.adj_non_comp, ep.total_leaves_used,
                    ep.gsis_employee, ep.gsis_employer, ep.gsis_ecc,
                    ep.sss_employee, ep.sss_employer, ep.sss_ecc,
                    ep.pagibig_employee, ep.pagibig_employer, ep.pagibig_ecc,
                    ep.philhealth_employee, ep.philhealth_employer, ep.philhealth_ecc,
                    ep.tax_withheld, ep.deductions, ep.loans, ep.other_deductions, ep.premium_adj,
                    ep.gross_pay, ep.total_deductions, ep.net_pay,

                    pr.group_id, pr.period_id, pr.month_id, pr.year_id, pr.payroll_range, pr.status AS run_status
                FROM employee_payroll ep
                JOIN employees e ON e.employee_id = ep.employee_id
                LEFT JOIN employee_employment ee ON ee.employee_id = e.employee_id
                LEFT JOIN employee_accounts ea ON ea.employee_id = e.employee_id
                LEFT JOIN payroll_runs pr ON pr.run_id = ep.run_id
                WHERE ep.run_id = ?
                ORDER BY e.last_name ASC, e.first_name ASC
            `, [run_id]);

            return res.json({ success: true, payslips: rows });
        } catch (err) {
            console.error("Error fetching payslips for payroll run:", err);
            res.status(500).json({ success: false, message: "Server error" });
        } finally {
            if (conn) conn.release();
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

    // PUT /api/payroll_runs/:run_id/generate — mark a payroll run as Generated
    app.put("/api/payroll_runs/:run_id/generate", async (req, res) => {
        const { run_id } = req.params;
        const { user_id, admin_name } = req.body;

        let conn;
        try {
            conn = await pool.getConnection();

            const [runs] = await conn.query(
                `SELECT run_id, status, payroll_range FROM payroll_runs WHERE run_id = ? LIMIT 1`,
                [run_id]
            );

            if (!runs.length) {
                return res.status(404).json({ success: false, message: "Payroll run not found." });
            }

            await conn.query(
                `UPDATE payroll_runs SET status = 'Generated' WHERE run_id = ?`,
                [run_id]
            );

            const payrollRange = runs[0].payroll_range || "Unknown Range";
            await logAudit(pool, user_id, admin_name, `Payroll run ${run_id} (${payrollRange}) marked as Generated`, "Success");

            let emailSummary = null;
            try {
                emailSummary = app.locals.sendPayslipsForRun
                    ? await app.locals.sendPayslipsForRun(run_id)
                    : null;
            } catch (emailError) {
                console.error("Automatic payslip email error:", emailError);
                emailSummary = { sent: 0, failed: 1, message: "Payroll generated, but payslip email delivery failed." };
            }

            res.json({ success: true, message: "Payroll run marked as Generated.", payslip_email: emailSummary });
        } catch (err) {
            console.error("Generate payroll run error:", err);
            res.status(500).json({ success: false, message: "Server error" });
        } finally {
            if (conn) conn.release();
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
            await ensurePayrollAutomationColumns(conn);
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
            await ensurePayrollAutomationColumns(conn);

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
            searchBy,
            period_start,
            period_end
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
                ee.date_hired,
                e.status,
                COALESCE(ep.gross_pay, 0) AS gross_pay,
                COALESCE(ep.net_pay, 0) AS net_pay
            FROM employees e
            LEFT JOIN employee_employment ee ON e.employee_id = ee.employee_id
            LEFT JOIN employee_accounts ea ON e.employee_id = ea.employee_id
            LEFT JOIN employee_payroll_settings eps ON e.employee_id = eps.employee_id
        `;

        const params = [];

        query += `
            LEFT JOIN employee_payroll ep
            ON ep.employee_id = e.employee_id
            ${run_id ? "AND ep.run_id = ?" : ""}
        `;

        if (run_id) {
            params.push(run_id);
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
        if (period_end) { query += " AND (ee.date_hired IS NULL OR ee.date_hired <= ?)"; params.push(period_end); }

        if (option === "active") {
            query += " AND (e.status = 'Active' AND (ep.payroll_status != 'Hold' OR ep.payroll_status IS NULL))";
        } else if (option === "hold") {
            query += " AND ep.payroll_status = 'Hold'";
        } else if (option === "with_data") {
            query += " AND (ep.gross_pay IS NOT NULL AND ep.gross_pay > 0)";
        }

        if (normalizedSearch && searchColumn) {
            query += ` AND ${searchColumn} LIKE ?`;
            params.push(`%${normalizedSearch}%`);
        }

        query += ` ORDER BY ${orderColumn} ASC`;

        try {
            const conn = await pool.getConnection();
            const [rows] = await conn.query(query, params);

            if (run_id && rows.length > 0 && option !== "hold") {
                await conn.query(
                    `INSERT INTO employee_payroll (run_id, employee_id, payroll_status)
                    SELECT ?, src.employee_id, 'Active'
                    FROM (
                        SELECT ? AS run_id, ? AS employee_id
                    ) src
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM employee_payroll existing
                        WHERE existing.run_id = src.run_id
                            AND existing.employee_id = src.employee_id
                    )`,
                    [run_id, run_id, rows[0].employee_id]
                );

                for (const row of rows.slice(1)) {
                    await conn.query(
                        `INSERT INTO employee_payroll (run_id, employee_id, payroll_status)
                        SELECT ?, ?, 'Active'
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM employee_payroll
                            WHERE run_id = ?
                                AND employee_id = ?
                        )`,
                        [run_id, row.employee_id, run_id, row.employee_id]
                    );
                }
            }

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
        const { periodOption, run_id, group_id } = req.query;

        try {
            const conn = await pool.getConnection();
            await ensurePayrollAutomationColumns(conn);

            // Fetch main payroll settings
            const [rows] = await conn.query(
                `SELECT e.employee_id,
                        ep.payroll_id,
                        ep.payroll_status,
                        ep.basic_salary,
                        ep.absence_time,
                        ep.absence_deduction,
                        ep.late_time,
                        ep.late_deduction,
                        ep.undertime,
                        ep.undertime_deduction,
                        ep.overtime,
                        ep.holiday_pay,
                        ep.taxable_allowances,
                        ep.non_taxable_allowances,
                        ep.adj_comp,
                        ep.adj_non_comp,
                        ep.total_leaves_used,
                        ep.leave_rows_json,
                        ep.gsis_employee, ep.gsis_employer, ep.gsis_ecc,
                        ep.sss_employee, ep.sss_employer, ep.sss_ecc,
                        ep.pagibig_employee, ep.pagibig_employer, ep.pagibig_ecc,
                        ep.philhealth_employee, ep.philhealth_employer, ep.philhealth_ecc,
                        ep.tax_withheld,
                        ep.loans,
                        ep.other_deductions,
                        ep.premium_adj,
                        ep.ytd_sss, ep.ytd_wtax, ep.ytd_philhealth,
                        ep.ytd_gsis, ep.ytd_pagibig, ep.ytd_gross,
                        eps.payroll_period,
                        eps.payroll_rate,
                        eps.main_computation,
                        eps.days_in_year_ot,
                        eps.days_in_year,
                        eps.days_in_week,
                        eps.hours_in_day,
                        eps.week_in_year,
                        eps.strict_no_overtime,
                        eps.ot_rate,
                        eps.rate_basis_ot,
                        eps.basis_absences,
                        eps.basis_overtime,
                        ea.sss_no,
                        ea.gsis_no,
                        ea.pagibig_no,
                        ea.philhealth_no,
                        eti.tax_status
                FROM employees e
                LEFT JOIN employee_payroll ep ON e.employee_id = ep.employee_id AND ep.run_id = ?
                LEFT JOIN employee_payroll_settings eps ON e.employee_id = eps.employee_id
                LEFT JOIN employee_accounts ea ON ea.employee_id = e.employee_id
                LEFT JOIN employee_tax_insurance eti ON eti.employee_id = e.employee_id
                WHERE e.employee_id = ?`,
                [run_id, employeeId]
            );

            if (rows.length === 0) {
                conn.release();
                return res.json({ success: false, message: "No payroll data found for this employee." });
            }

            const employee = rows[0];
            
            // Check if there is a payroll record for this employee and run_id
            const [employeePayroll] = await pool.query(`
                SELECT *
                FROM employee_payroll
                WHERE employee_id = ? AND run_id = ?
            `, [employee.employee_id, run_id]);

            // Determine if the employee has an existing payroll record with a non-null basic_salary
            const hasExistingPayroll =
                employeePayroll.length > 0 &&
                employeePayroll[0].basic_salary != null;

            console.log(
                `[Payroll] Employee ${employeeId}: ${
                    hasExistingPayroll
                        ? "Loading EXISTING payroll data"
                        : "Loading INITIAL payroll data"
                }`
            );

            // Use the selected payroll group's period (Monthly/Semi-Monthly/Weekly) rather
            // than the employee's own payroll_period setting, so the computation always
            // matches what the admin selected in the UI.
            // Priority: group_id param (integer → payroll_groups lookup) > run_id lookup > employee setting
            let effectivePayrollPeriod = employee.payroll_period;
            const numericGroupId = group_id ? Number(group_id) : null;
            if (numericGroupId) {
                const [[grpRow]] = await conn.query(
                    `SELECT group_name FROM payroll_groups WHERE group_id = ? LIMIT 1`,
                    [numericGroupId]
                );
                if (grpRow?.group_name) effectivePayrollPeriod = grpRow.group_name;
            } else if (run_id) {
                const [[runRow]] = await conn.query(
                    `SELECT group_id FROM payroll_runs WHERE run_id = ? LIMIT 1`,
                    [run_id]
                );
                if (runRow?.group_id) effectivePayrollPeriod = runRow.group_id;
            }

            if (!hasExistingPayroll) {
                employee.basic_salary = computePeriodSalary(
                    employee.main_computation,
                    employee.payroll_rate,
                    effectivePayrollPeriod,
                    employee
                );
            }

            function prorateAmount(amount, payrollPeriod, employee) {
                const value = Number(amount) || 0;
                const period = String(payrollPeriod || '').toUpperCase();

                if (period.includes('SEMI')) {
                    return Math.round((value / 2) * 100) / 100;
                }

                if (period.includes('WEEK')) {
                    const weekInYear = Number(employee.week_in_year) || 52;
                    return Math.round((value * 12 / weekInYear) * 100) / 100;
                }

                return value;
            }

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
                [employee.employee_id]
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
            const wtaxRecord = getContributionRecord(contributions, 4);

            const computeSSS = shouldCompute(sssRecord);
            const computePagibig = shouldCompute(pagibigRecord);
            const computePhilhealth = shouldCompute(philhealthRecord);
            const computeWtax = shouldCompute(wtaxRecord);

            const isGovernmentEmployee = Boolean(employee.gsis_no) && employee.gsis_no !== "N/A";

            // === GSIS ===
            if (isGovernmentEmployee) {
                const MC = computeMonthlySalaryFromRate(
                    employee.main_computation,
                    employee.payroll_rate,
                    employee
                );

                const normalizedPeriodGSIS = normalizePayPeriod(effectivePayrollPeriod);

                const periodDivisorGSIS =
                    normalizedPeriodGSIS === 'SEMI-MONTHLY' ? 2 :
                    normalizedPeriodGSIS === 'WEEKLY' ? 4 : 1;

                // STEP 1: get latest active GSIS rate
                const [gsisRows] = await conn.query(`
                    SELECT ee_rate_percent, er_rate_percent
                    FROM gsis_contribution_table
                    WHERE is_active = 1
                    ORDER BY date_effective DESC
                    LIMIT 1
                `);

                if (gsisRows.length > 0) {
                    const rate = gsisRows[0];

                    const eeRate = Number(rate.ee_rate_percent) / 100;
                    const erRate = Number(rate.er_rate_percent) / 100;

                    // STEP 2: monthly computation FIRST
                    const monthlyGsisEe = MC * eeRate;
                    const monthlyGsisEr = MC * erRate;

                    // STEP 3: divide per period AFTER
                    const gsisEe = roundMoney(monthlyGsisEe / periodDivisorGSIS);
                    const gsisEr = roundMoney(monthlyGsisEr / periodDivisorGSIS);
                    const gsisEcc = 0;

                    // STEP 4: assign
                    if (employee.gsis_employee == null) {
                        employee.gsis_employee = gsisEe;
                        employee.gsis_employer = gsisEr;
                        employee.gsis_ecc = gsisEcc;
                    }
                }
            }

            // === SSS ===
            if (computeSSS) {
                const monthlySalarySSS = computeMonthlySalaryFromRate(
                    employee.main_computation,
                    employee.payroll_rate,
                    employee
                );

                const normalizedPeriodSSS = normalizePayPeriod(effectivePayrollPeriod);

                const periodDivisorSSS =
                    normalizedPeriodSSS === 'SEMI-MONTHLY' ? 2 :
                    normalizedPeriodSSS === 'WEEKLY' ? 4 : 1;

                const [sssTableMatch] = await conn.query(
                    `SELECT 
                        employee_ss,
                        employer_ss,
                        employer_ec,
                        employee_mpf,
                        employer_mpf
                    FROM sss_contribution_table
                    WHERE ? BETWEEN salary_from AND salary_to
                    AND effective_year = ?
                    LIMIT 1`,
                    [monthlySalarySSS, 2025]
                );

                if (sssTableMatch && sssTableMatch.length > 0) {
                    const match = sssTableMatch[0];

                    // FULL monthly computation (IMPORTANT: sum all components)
                    const monthlyEe =
                        toMoney(match.employee_ss) +
                        toMoney(match.employee_mpf);

                    const monthlyEr =
                        toMoney(match.employer_ss) +
                        toMoney(match.employer_mpf) +
                        toMoney(match.employer_ec);

                        console.log("SSS Monthly Computation:", {
                            monthlySalarySSS,
                            monthlyEe,
                            monthlyEr,
                            match
                        });

                    // convert to payroll period
                    const periodEeShare =
                        Math.round((monthlyEe / periodDivisorSSS) * 100) / 100;

                    const periodErShare =
                        Math.round((monthlyEr / periodDivisorSSS) * 100) / 100;
                        console.log("SSS Period Computation:", {
                            periodDivisorSSS,
                            periodEeShare,
                            periodErShare
                        });

                    const periodEcc =
                        Math.round((toMoney(match.employer_ec) / periodDivisorSSS) * 100) / 100;

                    if (!sssRecord) {
                        contributions.push({
                            contribution_type_id: 1,
                            type_option: "Computed",
                            ee_share: periodEeShare,
                            er_share: periodErShare,
                            ecc: periodEcc
                        });
                    } else {
                        sssRecord.ee_share = periodEeShare;
                        sssRecord.er_share = periodErShare;
                        sssRecord.ecc = periodEcc;
                    }
                }
            }

            // === Pag-IBIG ===
            if (computePagibig) {
                const MC = computeMonthlySalaryFromRate(
                    employee.main_computation,
                    employee.payroll_rate,
                    employee
                );

                const normalizedPeriod = normalizePayPeriod(effectivePayrollPeriod);

                const periodDivisor =
                    normalizedPeriod === 'SEMI-MONTHLY' ? 2 :
                    normalizedPeriod === 'WEEKLY' ? 4 : 1;

                const [rows] = await conn.query(`
                    SELECT
                        employee_rate,
                        employer_rate,
                        employee_max,
                        employer_max
                    FROM pagibig_contribution_table
                    WHERE salary_from <= ?
                    AND (salary_to >= ? OR salary_to IS NULL)
                    AND is_active = 1
                    ORDER BY effective_date DESC
                    LIMIT 1
                `, [MC, MC]);

                if (rows.length > 0) {
                    const rule = rows[0];

                    // 1. compute MONTHLY contributions first
                    let monthlyEe = MC * toMoney(rule.employee_rate);
                    let monthlyEr = MC * toMoney(rule.employer_rate);

                    // 2. apply caps (still MONTHLY basis)
                    monthlyEe = Math.min(monthlyEe, toMoney(rule.employee_max));
                    monthlyEr = Math.min(monthlyEr, toMoney(rule.employer_max));

                    // 3. convert to payroll period (LIKE SSS)
                    const ee = roundMoney(monthlyEe / periodDivisor);
                    const er = roundMoney(monthlyEr / periodDivisor);

                    if (!pagibigRecord) {
                        contributions.push({
                            contribution_type_id: 2,
                            type_option: "Computed",
                            ee_share: ee,
                            er_share: er
                        });
                    } else {
                        pagibigRecord.ee_share = ee;
                        pagibigRecord.er_share = er;
                    }
                }
            }

            // === PhilHealth ===
            if (computePhilhealth) {
                const MC = computeMonthlySalaryFromRate(
                    employee.main_computation,
                    employee.payroll_rate,
                    employee
                );

                const normalizedPeriodPH = normalizePayPeriod(effectivePayrollPeriod);

                const periodDivisorPH =
                    normalizedPeriodPH === 'SEMI-MONTHLY' ? 2 :
                    normalizedPeriodPH === 'WEEKLY' ? 4 :
                    1;

                // 👇 fetch rate config instead of bracket
                const [rows] = await conn.query(
                    `SELECT rate, employee_share, employer_share, min_base, max_base
                    FROM philhealth_contribution_table
                    WHERE is_active = 1
                    ORDER BY effective_date DESC
                    LIMIT 1`
                );

                if (rows.length > 0) {
                    const rule = rows[0];

                    // apply base limits (optional but correct)
                    const minBase = Number(rule.min_base) || 0;
                    const maxBase = Number(rule.max_base) || Infinity;

                    const base = Math.min(
                        Math.max(MC, minBase),
                        maxBase
                    );

                    // The configured rate is the TOTAL premium rate. Split it
                    // between employee and employer using the configured shares.
                    const monthlyPremium = base * toMoney(rule.rate);
                    let monthlyEe = monthlyPremium * (toMoney(rule.employee_share) || 0.5);
                    let monthlyEr = monthlyPremium * (toMoney(rule.employer_share) || 0.5);

                    // STEP 2: split per payroll period
                    let periodEeShare = roundMoney(monthlyEe / periodDivisorPH);
                    let periodErShare = roundMoney(monthlyEr / periodDivisorPH);

                    if (!philhealthRecord) {
                        contributions.push({
                            contribution_type_id: 3,
                            type_option: "Computed",
                            ee_share: periodEeShare,
                            er_share: periodErShare
                        });
                    } else {
                        philhealthRecord.ee_share = periodEeShare;
                        philhealthRecord.er_share = periodErShare;
                    }
                }
            }

            // === BIR Withholding Tax ===
            if (computeWtax) {
                const wtaxFormula = String(wtaxRecord.computation || '').toLowerCase();
                if (wtaxFormula === 'gross taxable' || wtaxFormula === 'gross pay') {
                    const monthlySalaryWtax = computeMonthlySalaryFromRate(
                        employee.main_computation, employee.payroll_rate, employee
                    );
                    const normalizedPeriodWtax = normalizePayPeriod(effectivePayrollPeriod);
                    const periodDivisorWtax = normalizedPeriodWtax === 'SEMI-MONTHLY' ? 2
                        : normalizedPeriodWtax === 'WEEKLY' ? 4
                        : 1;
                    const periodBasisWtax = Math.round(monthlySalaryWtax / periodDivisorWtax * 100) / 100;
                    const taxResult = await lookupWithholdingTax(conn, periodBasisWtax, effectivePayrollPeriod, employee.tax_status);
                    console.log(`taxResult for employee ${employee.employee_id}: ${JSON.stringify(taxResult)} based on period basis ${periodBasisWtax}`);
                    wtaxRecord.ee_share = roundMoney(taxResult.amount);
                    console.log(`Contribution ${employee.employee_id}: WTax formula "${wtaxFormula}" computed as ${wtaxRecord.ee_share} for period basis ${periodBasisWtax}`);
                } else if (wtaxFormula === 'ewt') {
                    // No EWT rate/table is configured yet; keep the admin-entered figure
                    // rather than guessing a percentage.
                    console.warn(`Contribution ${employee.employee_id}: WTax formula "EWT" has no configured rate, using stored ee_share.`);
                }
                // 'fix' (or any unrecognized formula) keeps the stored ee_share as-is.
            }
            
            if (!hasExistingPayroll) {
                // Map computed contribution amounts to the employee payroll fields when no
                // saved values were loaded from the DB (i.e., the field is still NULL).
                if (computeSSS && employee.sss_employee == null && sssRecord) {
                    employee.sss_employee = sssRecord.ee_share || 0;
                    employee.sss_employer = sssRecord.er_share || 0;
                    employee.sss_ecc      = sssRecord.ecc      || 0;
                }
                console.log(`Employee ${employee.employee_id}: SSS computed as ee_share=${employee.sss_employee}, er_share=${employee.sss_employer}, ecc=${employee.sss_ecc}`);
                if (computePagibig && employee.pagibig_employee == null && pagibigRecord) {
                    employee.pagibig_employee = pagibigRecord.ee_share || 0;
                    employee.pagibig_employer = pagibigRecord.er_share || 0;
                }
                if (computePhilhealth && employee.philhealth_employee == null && philhealthRecord) {
                    employee.philhealth_employee = philhealthRecord.ee_share || 0;
                    employee.philhealth_employer = philhealthRecord.er_share || 0;
                }
                if (computeWtax && employee.tax_withheld == null && wtaxRecord) {
                    employee.tax_withheld = wtaxRecord.ee_share || 0;
                }
            }

            let allAllowances = [];
            let allDeductions = [];

            if (hasExistingPayroll) {
                // Payroll record exists → use payroll-specific allowances/deductions
                const payrollId = employeePayroll[0].payroll_id;

                const [payrollAllowances] = await pool.query(`
                    SELECT epa.*, at.allowance_name, at.is_taxable
                    FROM employee_payroll_allowances epa
                    LEFT JOIN allowance_types at
                        ON epa.allowance_type_id = at.allowance_type_id
                    WHERE epa.employee_id = ?
                    AND epa.payroll_id = ?
                `, [employee.employee_id, payrollId]);

                const [payrollDeductions] = await pool.query(`
                    SELECT epd.*, dt.deduction_name
                    FROM employee_payroll_deductions epd
                    LEFT JOIN deduction_types dt
                        ON epd.deduction_type_id = dt.deduction_type_id
                    WHERE epd.employee_id = ?
                    AND epd.payroll_id = ?
                `, [employee.employee_id, payrollId]);

                allAllowances = payrollAllowances.map(a => ({
                    ...a,
                    isPayrollOverride: true
                }));

                allDeductions = payrollDeductions.map(d => ({
                    ...d,
                    isPayrollOverride: true
                }));
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
            // Items with no period set (null/empty) are always included regardless of period.
            if (periodOption && periodOption.toLowerCase() === "first half") {
                employee.allowances = allAllowances.filter(a => {
                    const p = (a.period || "").toLowerCase();
                    return !p || ["first half", "both"].includes(p);
                });
                employee.deductions = allDeductions.filter(d => {
                    const p = (d.period || "").toLowerCase();
                    return !p || ["first half", "both"].includes(p);
                });
            } else if (periodOption && periodOption.toLowerCase() === "second half") {
                employee.allowances = allAllowances.filter(a => {
                    const p = (a.period || "").toLowerCase();
                    return !p || ["second half", "both"].includes(p);
                });
                employee.deductions = allDeductions.filter(d => {
                    const p = (d.period || "").toLowerCase();
                    return !p || ["second half", "both"].includes(p);
                });
            } else {
                // No filtering (return all)
                employee.allowances = allAllowances;
                employee.deductions = allDeductions;
            }

            if (!hasExistingPayroll) {
                employee.allowances = (employee.allowances || []).map(a => ({
                    ...a,
                    amount: prorateAmount(a.amount, effectivePayrollPeriod, employee)
                }));

                employee.deductions = (employee.deductions || []).map(d => ({
                    ...d,
                    amount: prorateAmount(d.amount, effectivePayrollPeriod, employee)
                }));
            }

            conn.release();

            return res.json({ success: true, hasExistingPayroll, data: employee });
        } catch (err) {
            console.error("Error fetching payroll settings:", err);
            return res.status(500).json({ success: false, message: err.message || "Unable to load payroll settings." });
        }
    });
    
    // === UPDATE PAYROLL EMPLOYEE DETAILS FOR A SPECIFIC EMPLOYEE ON A SPECIFIC RUN ===
    app.put("/api/update_employee_payroll/:employeeId", async (req, res) => {
        const { employeeId } = req.params;
        const {
            run_id, basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction,
            overtime, holiday_pay, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
            gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
            pagibig_employee, pagibig_employer, pagibig_ecc, philhealth_employee, philhealth_employer, philhealth_ecc,
            tax_withheld, total_deductions, loans, other_deductions, premium_adj,
            ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
            payroll_status, gross_pay, grand_total_deductions, net_pay, ot_nd, ot_nd_adj, att_adj,
            periodOption, allowances, deductions, loanRows, leave_rows, user_id, admin_name
        } = req.body;

        const leaveRowsJson = Array.isArray(leave_rows) && leave_rows.length > 0
            ? JSON.stringify(leave_rows.filter(r => r.leave_type_id))
            : null;

        const periodToUse = periodOption || null;
        let conn;

        try {
            const numberOrZero = (value) => {
                const number = Number(value || 0);
                return Number.isFinite(number) ? number : 0;
            };
            const safeAbsenceTime = numberOrZero(absence_time);
            const safeLateTime = numberOrZero(late_time);
            const safeUndertime = numberOrZero(undertime);

            conn = await pool.getConnection();
            await ensurePayrollAutomationColumns(conn);
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
                        overtime = ?, holiday_pay = ?, taxable_allowances = ?, non_taxable_allowances = ?, adj_comp = ?, adj_non_comp = ?, total_leaves_used = ?,
                        leave_rows_json = COALESCE(?, leave_rows_json),
                        gsis_employee = ?, gsis_employer = ?, gsis_ecc = ?, sss_employee = ?, sss_employer = ?, sss_ecc = ?,
                        pagibig_employee = ?, pagibig_employer = ?, pagibig_ecc = ?, philhealth_employee = ?, philhealth_employer = ?, philhealth_ecc = ?,
                        tax_withheld = ?, deductions = ?, loans = ?, other_deductions = ?, premium_adj = ?,
                        ytd_sss = ?, ytd_wtax = ?, ytd_philhealth = ?, ytd_gsis = ?, ytd_pagibig = ?, ytd_gross = ?,
                        payroll_status = ?, gross_pay = ?, total_deductions = ?, net_pay = ?
                    WHERE employee_id = ? AND run_id = ?`,
                    [
                        basic_salary, safeAbsenceTime, absence_deduction, safeLateTime, late_deduction, safeUndertime, undertime_deduction,
                        overtime, holiday_pay, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
                        leaveRowsJson,
                        gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
                        pagibig_employee, pagibig_employer, pagibig_ecc, philhealth_employee, philhealth_employer, philhealth_ecc,
                        tax_withheld, total_deductions, loans, other_deductions, premium_adj,
                        ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
                        payroll_status || "null", gross_pay, grand_total_deductions, net_pay,
                        employeeId, run_id
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
                        SET
                            allowance_type_id = ?,
                            amount = ?,
                            period = ?
                        WHERE emp_payroll_allowance_id = ?
                    `;

                    const insertQuery = `
                        INSERT INTO employee_payroll_allowances
                        (
                            source_emp_allowance_id,
                            payroll_id,
                            employee_id,
                            allowance_type_id,
                            amount,
                            period
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    const deleteQuery = `
                        DELETE FROM employee_payroll_allowances
                        WHERE emp_payroll_allowance_id = ?
                    `;

                    for (const a of allowances) {

                        // DELETE
                        if (a.deleted) {

                            if (a.emp_payroll_allowance_id) {
                                await conn.query(deleteQuery, [
                                    a.emp_payroll_allowance_id
                                ]);
                            }

                            continue;
                        }

                        const payrollAllowanceId = a.emp_payroll_allowance_id ?? null;

                        const sourceAllowanceId =
                            a.source_emp_allowance_id ??
                            a.emp_allowance_id ??
                            null;

                        // UPDATE
                        if (payrollAllowanceId) {

                            await conn.query(updateQuery, [
                                a.allowance_type_id,
                                a.amount,
                                a.period || periodToUse,
                                payrollAllowanceId
                            ]);

                        }

                        // INSERT
                        else {

                            await conn.query(insertQuery, [
                                sourceAllowanceId,
                                payrollId,
                                employeeId,
                                a.allowance_type_id,
                                a.amount,
                                a.period || periodToUse
                            ]);

                        }
                    }
                }

                // ==================== DEDUCTIONS ====================
                if (Array.isArray(deductions)) {

                    const updateQuery = `
                        UPDATE employee_payroll_deductions
                        SET
                            deduction_type_id = ?,
                            amount = ?,
                            period = ?
                        WHERE emp_payroll_deduction_id = ?
                    `;

                    const insertQuery = `
                        INSERT INTO employee_payroll_deductions
                        (
                            source_emp_deduction_id,
                            payroll_id,
                            employee_id,
                            deduction_type_id,
                            amount,
                            period
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    const deleteQuery = `
                        DELETE FROM employee_payroll_deductions
                        WHERE emp_payroll_deduction_id = ?
                    `;

                    for (const d of deductions) {

                        if (d.deleted) {

                            if (d.emp_payroll_deduction_id) {
                                await conn.query(deleteQuery, [
                                    d.emp_payroll_deduction_id
                                ]);
                            }

                            continue;
                        }

                        const payrollDeductionId =
                            d.emp_payroll_deduction_id ?? null;

                        const sourceDeductionId =
                            d.source_emp_deduction_id ??
                            d.emp_deduction_id ??
                            null;

                        // UPDATE
                        if (payrollDeductionId) {

                            await conn.query(updateQuery, [
                                d.deduction_type_id,
                                d.amount,
                                d.period || periodToUse,
                                payrollDeductionId
                            ]);

                        }

                        // INSERT
                        else {

                            await conn.query(insertQuery, [
                                sourceDeductionId,
                                payrollId,
                                employeeId,
                                d.deduction_type_id,
                                d.amount,
                                d.period || periodToUse
                            ]);

                        }
                    }
                }

                // ==================== LOANS ====================
                if (Array.isArray(loanRows)) {
                    for (const loan of loanRows) {

                        const paymentAmount = Number(loan.payment || 0);
                        const balanceBefore = Number(loan.balance || 0);
                        const balanceAfter = Math.max(
                            0,
                            balanceBefore - paymentAmount
                        );

                        // already saved for this payroll?
                        const [existingPayment] = await conn.query(
                            `SELECT payment_id
                            FROM employee_loan_payments
                            WHERE loan_id = ?
                            AND payroll_id = ?
                            AND run_id = ?`,
                            [
                                loan.loan_id,
                                payrollId,
                                run_id
                            ]
                        );

                        if (existingPayment.length > 0) {

                            // UPDATE snapshot only
                            await conn.query(
                                `UPDATE employee_loan_payments
                                SET
                                    payment_amount = ?,
                                    balance_before = ?,
                                    balance_after = ?,
                                    paid_period = ?,
                                    skipped = ?
                                WHERE payment_id = ?`,
                                [
                                    paymentAmount,
                                    balanceBefore,
                                    balanceAfter,
                                    periodOption,
                                    loan.skip ? 1 : 0,
                                    existingPayment[0].payment_id
                                ]
                            );

                        } else {

                            // INSERT snapshot
                            await conn.query(
                                `INSERT INTO employee_loan_payments
                                (
                                    loan_id,
                                    employee_id,
                                    payroll_id,
                                    run_id,
                                    payment_amount,
                                    balance_before,
                                    balance_after,
                                    paid_period,
                                    skipped
                                )
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    loan.loan_id,
                                    employeeId,
                                    payrollId,
                                    run_id,
                                    paymentAmount,
                                    balanceBefore,
                                    balanceAfter,
                                    periodOption,
                                    loan.skip ? 1 : 0
                                ]
                            );

                        }

                    }
                }
            } else {
                // i think this won't trigger at all, gawin nalang fallback error
                // INSERT new payroll record
                const [insertedPayroll] = await conn.query(
                    `INSERT INTO employee_payroll
                        (run_id, employee_id, basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction,
                        overtime, holiday_pay, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used, leave_rows_json,
                        gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
                        pagibig_employee, pagibig_employer, pagibig_ecc, philhealth_employee, philhealth_employer, philhealth_ecc,
                        tax_withheld, deductions, loans, other_deductions, premium_adj,
                        ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
                        payroll_status, gross_pay, total_deductions, net_pay)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        run_id, employeeId, basic_salary, safeAbsenceTime, absence_deduction, safeLateTime, late_deduction, safeUndertime, undertime_deduction,
                        overtime, holiday_pay, taxable_allowances, non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used, leaveRowsJson,
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
            res.status(500).json({ success: false, message: err.message || "Unable to save payroll." });
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
            // Bulk save writes holiday_pay and leave_rows_json too. Prepare
            // fresh/production schemas before opening the transaction.
            await ensurePayrollAutomationColumns(conn);
            await conn.beginTransaction();

            for (const p of payrolls) {
                const {
                    employee_id,
                    basic_salary, absence_time, absence_deduction,
                    late_time, late_deduction,
                    undertime, undertime_deduction,
                    overtime, holiday_pay,
                    taxable_allowances, non_taxable_allowances,
                    adj_comp, adj_non_comp, total_leaves_used,
                    gsis_employee, gsis_employer, gsis_ecc,
                    sss_employee, sss_employer, sss_ecc,
                    pagibig_employee, pagibig_employer, pagibig_ecc,
                    philhealth_employee, philhealth_employer, philhealth_ecc,
                    tax_withheld, total_deductions, loans, loanRows = [], other_deductions, premium_adj,
                    ytd_sss, ytd_wtax, ytd_philhealth, ytd_gsis, ytd_pagibig, ytd_gross,
                    payroll_status, allowances = [], deductions = [], leave_rows = [], periodOption,
                    ot_nd_adj, att_adj
                } = p;

                const bulkLeaveRowsJson = Array.isArray(leave_rows) && leave_rows.length > 0
                    ? JSON.stringify(leave_rows.filter(r => r.leave_type_id))
                    : null;

                const adjustedSalary = Number(basic_salary || 0);
                const adjustedTaxableAllowances = Number(taxable_allowances || 0);
                const adjustedNonTaxableAllowances = Number(non_taxable_allowances || 0);
                const adjustedDeductions = Number(total_deductions || 0);
                const adjustedSSS = Number(sss_employee || 0);
                const adjustedPagIbig = Number(pagibig_employee || 0);
                const adjustedPhilhealth = Number(philhealth_employee || 0);
                const adjustedTaxWithheld = Number(tax_withheld || 0);

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
                    Number(p.holiday_pay || 0) +
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
                const currentYtdSss = Number(ytd_sss || 0);
                const currentYtdWtax = Number(ytd_wtax || 0);
                const currentYtdPhilhealth = Number(ytd_philhealth || 0);
                const currentYtdPagibig = Number(ytd_pagibig || 0);
                const currentYtdGsis = Number(ytd_gsis || 0);

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
                        overtime = ?, holiday_pay = ?, taxable_allowances = ?, non_taxable_allowances = ?, adj_comp = ?, adj_non_comp = ?, total_leaves_used = ?,
                        leave_rows_json = COALESCE(?, leave_rows_json),
                        gsis_employee = ?, gsis_employer = ?, gsis_ecc = ?, sss_employee = ?, sss_employer = ?, sss_ecc = ?,
                        pagibig_employee = ?, pagibig_employer = ?, pagibig_ecc = ?, philhealth_employee = ?, philhealth_employer = ?, philhealth_ecc = ?,
                        tax_withheld = ?, deductions = ?, loans = ?, other_deductions = ?, premium_adj = ?,
                        ytd_sss = ?, ytd_wtax = ?, ytd_philhealth = ?, ytd_gsis = ?, ytd_pagibig = ?, ytd_gross = ?,
                        payroll_status = ?, gross_pay = ?, total_deductions = ?, net_pay = ?, date_generated = IFNULL(date_generated, CURRENT_TIMESTAMP)
                    WHERE employee_id = ? AND run_id = ?`,
                    [
                        p.basic_salary, absence_time, absence_deduction, late_time, late_deduction, undertime, undertime_deduction,
                        overtime, holiday_pay, p.taxable_allowances, p.non_taxable_allowances, adj_comp, adj_non_comp, total_leaves_used,
                        bulkLeaveRowsJson,
                        gsis_employee, gsis_employer, gsis_ecc, sss_employee, sss_employer, sss_ecc,
                        pagibig_employee, pagibig_employer, pagibig_ecc,philhealth_employee, philhealth_employer, philhealth_ecc,
                        tax_withheld, p.total_deductions, loans, other_deductions, premium_adj,
                        currentYtdSss, currentYtdWtax, currentYtdPhilhealth, currentYtdGsis, currentYtdPagibig, currentYtdGross,
                        payroll_status || "null", grossPay, grandTotalDeductions, netPay,
                        employee_id, run_id
                    ]
                );

                const validPeriods = ['Weekly', 'Monthly', 'First Half', 'Second Half', 'Both'];
                const periodToUse = validPeriods.includes(periodOption) ? periodOption : 'Both';
                
                const [existing] = await conn.query(
                    `SELECT payroll_id FROM employee_payroll WHERE employee_id = ? AND run_id = ? LIMIT 1`,
                    [employee_id, run_id]
                );

                if (!existing.length) {
                    throw new Error(`Payroll record not found for employee ${employee_id}`);
                }

                const payrollId = existing[0].payroll_id;

                await upsertPayrollAdjustment(
                    conn,
                    "payroll_ot_nd_adjustments",
                    OT_ND_ADJ_COLUMNS,
                    payrollId,
                    run_id,
                    employee_id,
                    ot_nd_adj
                );

                await upsertPayrollAdjustment(
                    conn,
                    "payroll_attendance_adjustments",
                    ATT_ADJ_COLUMNS,
                    payrollId,
                    run_id,
                    employee_id,
                    att_adj
                );

                // ==================== ALLOWANCES ====================
                if (Array.isArray(allowances)) {

                    const updateQuery = `
                        UPDATE employee_payroll_allowances
                        SET
                            allowance_type_id = ?,
                            amount = ?,
                            period = ?
                        WHERE emp_payroll_allowance_id = ?
                    `;

                    const insertQuery = `
                        INSERT INTO employee_payroll_allowances
                        (
                            source_emp_allowance_id,
                            payroll_id,
                            employee_id,
                            allowance_type_id,
                            amount,
                            period
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    for (const a of allowances) {

                        const sourceAllowanceId =
                            a.source_emp_allowance_id ??
                            a.emp_allowance_id ??
                            null;

                        let payrollAllowanceId = null;

                        // -------------------------
                        // NEW RECORD -> INSERT
                        // -------------------------
                        if (!a.emp_payroll_allowance_id) {

                            await conn.query(insertQuery, [
                                sourceAllowanceId,
                                payrollId,
                                employee_id,
                                a.allowance_type_id,
                                a.amount,
                                a.period || periodToUse
                            ]);

                            console.log("Inserted payroll allowance");
                            continue;
                        }

                        // -------------------------
                        // Existing payroll record
                        // -------------------------

                        if (sourceAllowanceId) {

                            // Prefer lookup by source
                            const [rows] = await conn.query(
                                `
                                SELECT emp_payroll_allowance_id
                                FROM employee_payroll_allowances
                                WHERE payroll_id = ?
                                AND employee_id = ?
                                AND source_emp_allowance_id = ?
                                LIMIT 1
                                `,
                                [
                                    payrollId,
                                    employee_id,
                                    sourceAllowanceId
                                ]
                            );

                            if (rows.length) {
                                payrollAllowanceId = rows[0].emp_payroll_allowance_id;
                            }

                        } else {

                            // No source available, use payroll id directly
                            payrollAllowanceId = a.emp_payroll_allowance_id;
                        }

                        await conn.query(updateQuery, [
                            a.allowance_type_id,
                            a.amount,
                            a.period || periodToUse,
                            payrollAllowanceId
                        ]);

                        console.log("Updated payroll allowance:", payrollAllowanceId);
                    }
                }

                // ==================== DEDUCTIONS ====================
                if (Array.isArray(deductions)) {

                    const updateQuery = `
                        UPDATE employee_payroll_deductions
                        SET
                            deduction_type_id = ?,
                            amount = ?,
                            period = ?
                        WHERE emp_payroll_deduction_id = ?
                    `;

                    const insertQuery = `
                        INSERT INTO employee_payroll_deductions
                        (
                            source_emp_deduction_id,
                            payroll_id,
                            employee_id,
                            deduction_type_id,
                            amount,
                            period
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;

                    for (const d of deductions) {

                        const sourceDeductionId =
                            d.source_emp_deduction_id ??
                            d.emp_deduction_id ??
                            null;

                        let payrollDeductionId = null;

                        // -------------------------
                        // NEW RECORD -> INSERT
                        // -------------------------
                        if (!d.emp_payroll_deduction_id) {

                            await conn.query(insertQuery, [
                                sourceDeductionId,
                                payrollId,
                                employee_id,
                                d.deduction_type_id,
                                d.amount,
                                d.period || periodToUse
                            ]);

                            console.log("Inserted payroll deduction");
                            continue;
                        }

                        // -------------------------
                        // Existing payroll record
                        // -------------------------

                        if (sourceDeductionId) {

                            const [rows] = await conn.query(
                                `
                                SELECT emp_payroll_deduction_id
                                FROM employee_payroll_deductions
                                WHERE payroll_id = ?
                                AND employee_id = ?
                                AND source_emp_deduction_id = ?
                                LIMIT 1
                                `,
                                [
                                    payrollId,
                                    employee_id,
                                    sourceDeductionId
                                ]
                            );

                            if (rows.length) {
                                payrollDeductionId = rows[0].emp_payroll_deduction_id;
                            }

                        } else {

                            payrollDeductionId = d.emp_payroll_deduction_id;
                        }

                        await conn.query(updateQuery, [
                            d.deduction_type_id,
                            d.amount,
                            d.period || periodToUse,
                            payrollDeductionId
                        ]);

                        console.log("Updated payroll deduction:", payrollDeductionId);
                    }
                }

                // ==================== LOANS ====================
                if (Array.isArray(loanRows)) {
                    for (const loan of loanRows) {

                        if (loan.skip) continue;

                        // Don't process the same loan twice for the same payroll
                        const [existingPayment] = await conn.query(
                            `SELECT payment_id
                            FROM employee_loan_payments
                            WHERE loan_id = ?
                            AND payroll_id = ?
                            AND run_id = ?`,
                            [loan.loan_id, payrollId, run_id]
                        );

                        if (existingPayment.length > 0) {
                            continue;
                        }

                        const paymentAmount = Number(loan.payment || 0);
                        const balanceBefore = Number(loan.balance || 0);
                        const balanceAfter = Math.max(0, balanceBefore - paymentAmount);

                        await conn.query(
                            `INSERT INTO employee_loan_payments
                            (
                                loan_id,
                                employee_id,
                                payroll_id,
                                run_id,
                                payment_amount,
                                balance_before,
                                balance_after,
                                paid_period
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                loan.loan_id,
                                employee_id,
                                payrollId,
                                run_id,
                                paymentAmount,
                                balanceBefore,
                                balanceAfter,
                                periodOption
                            ]
                        );

                        await conn.query(
                            `UPDATE employee_loans
                            SET
                                balance_amount = ?,
                                terms_paid = terms_paid + 1,
                                status = CASE
                                            WHEN ? <= 0 THEN 'Paid'
                                            ELSE status
                                        END,
                                end_date = CASE
                                            WHEN ? <= 0 THEN CURRENT_DATE
                                            ELSE end_date
                                        END
                            WHERE loan_id = ?`,
                            [
                                balanceAfter,
                                balanceAfter,
                                balanceAfter,
                                loan.loan_id
                            ]
                        );
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

            let emailSummary = null;
            try {
                emailSummary = app.locals.sendPayslipsForRun
                    ? await app.locals.sendPayslipsForRun(run_id)
                    : null;
            } catch (emailError) {
                console.error("Automatic payslip email error:", emailError);
                emailSummary = { sent: 0, failed: 1, message: "Payroll saved, but payslip email delivery failed." };
            }

            res.json({ success: true, payslip_email: emailSummary });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error("Payroll save error:", err);
            res.status(500).json({ success: false, message: err.message });
        } finally {
            if (conn) conn.release();
        }
    });

    //--------------payslip run for employee----------------
    app.get("/api/payslip_latest/:empCode", async (req, res) => {
        const { empCode } = req.params;
        let conn;

        try {
            conn = await pool.getConnection();

            const [rows] = await conn.query(`
                SELECT
                    e.employee_id,
                    e.emp_code,
                    e.first_name,
                    e.last_name,
                    e.middle_name,
                    e.status,

                    ee.company,
                    ee.location,
                    ee.branch,
                    ee.division,
                    ee.department,
                    ee.class,
                    ee.position,
                    ee.employee_type,
                    ee.date_hired,

                    ea.salary_type,

                    eps.payroll_period,
                    eps.main_computation,
                    eps.days_in_year_ot,
                    eps.days_in_year,
                    eps.days_in_week,
                    eps.hours_in_day,
                    eps.week_in_year,

                    ep.payroll_id,
                    ep.run_id,
                    ep.payroll_status,
                    ep.basic_salary,
                    ep.absence_time,
                    ep.absence_deduction,
                    ep.late_time,
                    ep.late_deduction,
                    ep.undertime,
                    ep.undertime_deduction,
                    ep.overtime,
                    ep.holiday_pay,
                    ep.taxable_allowances,
                    ep.non_taxable_allowances,
                    ep.adj_comp,
                    ep.adj_non_comp,
                    ep.total_leaves_used,
                    ep.gsis_employee,
                    ep.gsis_employer,
                    ep.gsis_ecc,
                    ep.sss_employee,
                    ep.sss_employer,
                    ep.sss_ecc,
                    ep.pagibig_employee,
                    ep.pagibig_employer,
                    ep.pagibig_ecc,
                    ep.philhealth_employee,
                    ep.philhealth_employer,
                    ep.philhealth_ecc,
                    ep.tax_withheld,
                    ep.deductions,
                    ep.loans,
                    ep.other_deductions,
                    ep.premium_adj,
                    ep.gross_pay,
                    ep.total_deductions,
                    ep.net_pay,

                    pr.group_id,
                    pr.period_id,
                    pr.month_id,
                    pr.year_id,
                    pr.payroll_range,
                    pr.status AS run_status
                FROM employees e
                LEFT JOIN employee_employment ee
                    ON ee.employee_id = e.employee_id
                LEFT JOIN employee_accounts ea
                    ON ea.employee_id = e.employee_id
                LEFT JOIN employee_payroll_settings eps
                    ON eps.employee_id = e.employee_id
                JOIN employee_payroll ep
                    ON ep.employee_id = e.employee_id
                LEFT JOIN payroll_runs pr
                    ON pr.run_id = ep.run_id
                WHERE e.emp_code = ?
                  AND ep.gross_pay IS NOT NULL
                ORDER BY ep.run_id DESC
                LIMIT 1
            `, [empCode]);

            if (!rows.length) {
                conn.release();
                return res.json({
                    success: false,
                    message: "No payroll record found for this employee."
                });
            }

            const payroll = rows[0];

            const [allowances] = await conn.query(`
                SELECT
                    epa.*,
                    at.allowance_name,
                    at.is_taxable
                FROM employee_payroll_allowances epa
                LEFT JOIN allowance_types at
                    ON at.allowance_type_id = epa.allowance_type_id
                WHERE epa.payroll_id = ?
                ORDER BY epa.emp_payroll_allowance_id ASC
            `, [payroll.payroll_id]);

            const [deductions] = await conn.query(`
                SELECT
                    epd.*,
                    dt.deduction_name
                FROM employee_payroll_deductions epd
                LEFT JOIN deduction_types dt
                    ON dt.deduction_type_id = epd.deduction_type_id
                WHERE epd.payroll_id = ?
                ORDER BY epd.emp_payroll_deduction_id ASC
            `, [payroll.payroll_id]);

            payroll.allowances = allowances || [];
            payroll.deductions = deductions || [];

            conn.release();

            return res.json({
                success: true,
                data: payroll
            });
        } catch (err) {
            if (conn) conn.release();
            console.error("Error fetching latest payslip:", err);
            return res.status(500).json({
                success: false,
                message: "Server error"
            });
        }
    });
};
