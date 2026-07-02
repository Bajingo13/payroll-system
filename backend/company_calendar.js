const { createNotificationsForAllUsers, ensureNotificationsTable } = require('./notificationHelper');

const GOVERNMENT_HOLIDAY_DESCRIPTION = "Auto-added Philippine government holiday.";
const seededHolidayYears = new Set();

function isHolidayEventType(eventType) {
    const type = String(eventType || '').trim().toLowerCase();
    return type.includes('holiday') || type.includes('special non-working');
}

    function makeHoliday(year, month, day, title, eventType = "Regular Holiday") {
        return {
            event_date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            title,
            event_type: eventType,
            description: GOVERNMENT_HOLIDAY_DESCRIPTION,
            is_paid_holiday: eventType === "Regular Holiday" ? 1 : 0
        };
    }

    function getLastMondayOfAugust(year) {
        const date = new Date(Date.UTC(year, 7, 31));
        while (date.getUTCDay() !== 1) {
            date.setUTCDate(date.getUTCDate() - 1);
        }
        return date.getUTCDate();
    }

    function getPhilippineGovernmentHolidays(year) {
        const holidays = [
            makeHoliday(year, 1, 1, "New Year's Day"),
            makeHoliday(year, 4, 9, "Araw ng Kagitingan"),
            makeHoliday(year, 5, 1, "Labor Day"),
            makeHoliday(year, 6, 12, "Independence Day"),
            makeHoliday(year, 8, getLastMondayOfAugust(year), "National Heroes Day"),
            makeHoliday(year, 11, 30, "Bonifacio Day"),
            makeHoliday(year, 12, 25, "Christmas Day"),
            makeHoliday(year, 12, 30, "Rizal Day"),
            makeHoliday(year, 8, 21, "Ninoy Aquino Day", "Special Non-Working Day"),
            makeHoliday(year, 11, 1, "All Saints' Day", "Special Non-Working Day"),
            makeHoliday(year, 12, 8, "Feast of the Immaculate Conception of Mary", "Special Non-Working Day"),
            makeHoliday(year, 12, 31, "Last Day of the Year", "Special Non-Working Day")
        ];

        if (year === 2026) {
            holidays.push(
                makeHoliday(2026, 3, 20, "Eid'l Fitr", "Regular Holiday"),
                makeHoliday(2026, 5, 27, "Eid'l Adha", "Regular Holiday"),
                makeHoliday(2026, 4, 2, "Maundy Thursday", "Regular Holiday"),
                makeHoliday(2026, 4, 3, "Good Friday", "Regular Holiday"),
                makeHoliday(2026, 2, 17, "Chinese New Year", "Special Non-Working Day"),
                makeHoliday(2026, 4, 4, "Black Saturday", "Special Non-Working Day"),
                makeHoliday(2026, 11, 2, "All Souls' Day", "Special Non-Working Day"),
                makeHoliday(2026, 12, 24, "Christmas Eve", "Special Non-Working Day")
            );
        }

        return holidays;
    }

    async function ensureCompanyCalendarTable(conn) {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS company_calendar_events (
                event_id INT NOT NULL AUTO_INCREMENT,
                event_date DATE NOT NULL,
                title VARCHAR(160) NOT NULL,
                event_type VARCHAR(50) NOT NULL DEFAULT 'Other',
                description TEXT NULL,
                is_paid_holiday TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (event_id),
                INDEX idx_company_calendar_event_date (event_date),
                INDEX idx_company_calendar_event_type (event_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);
    }

    async function seedGovernmentHolidays(conn, year) {
        const holidays = getPhilippineGovernmentHolidays(year);

        for (const holiday of holidays) {
            await conn.query(
                `INSERT INTO company_calendar_events
                    (event_date, title, event_type, description, is_paid_holiday)
                SELECT ?, ?, ?, ?, ?
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM company_calendar_events
                    WHERE event_date = ?
                        AND title = ?
                        AND event_type = ?
                )`,
                [
                    holiday.event_date,
                    holiday.title,
                    holiday.event_type,
                    holiday.description,
                    holiday.is_paid_holiday,
                    holiday.event_date,
                    holiday.title,
                    holiday.event_type
                ]
            );
        }
    }

async function ensureGovernmentHolidaysSeeded(conn, year) {
    if (seededHolidayYears.has(year)) return;
    await seedGovernmentHolidays(conn, year);
    seededHolidayYears.add(year);
}

async function syncUpcomingHolidayNotificationsForUser(pool, userId, daysAhead = 7) {
    let conn;
    try {
        conn = await pool.getConnection();
        await ensureCompanyCalendarTable(conn);
        await ensureNotificationsTable(conn);

        const currentYear = new Date().getFullYear();
        await ensureGovernmentHolidaysSeeded(conn, currentYear);
        await ensureGovernmentHolidaysSeeded(conn, currentYear + 1);

        const [users] = await conn.execute(
            `SELECT role FROM users
             WHERE user_id = ?
               AND (account_status IS NULL OR LOWER(account_status) NOT IN ('deactivated', 'deleted'))
             LIMIT 1`,
            [userId]
        );
        if (!users.length || !String(users[0].role || '').toLowerCase().includes('employee')) return 0;

        const [holidays] = await conn.execute(
            `SELECT DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
                    title, event_type, is_paid_holiday,
                    DATEDIFF(event_date, CURDATE()) AS days_until
             FROM company_calendar_events
             WHERE event_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
               AND (is_paid_holiday = 1
                    OR LOWER(event_type) LIKE '%holiday%'
                    OR LOWER(event_type) LIKE '%special non-working%')
             ORDER BY event_date, event_id`,
            [Math.max(0, Number(daysAhead) || 0)]
        );

        let created = 0;
        for (const holiday of holidays) {
            const title = `Holiday: ${holiday.title}`;
            const timing = Number(holiday.days_until) === 0
                ? `Today (${holiday.event_date}) is`
                : `${holiday.event_date} is`;
            const payType = Number(holiday.is_paid_holiday) === 1 ? 'paid' : 'non-paid';
            const message = `${timing} ${holiday.title}, a ${payType} ${holiday.event_type}.`;
            const [result] = await conn.execute(
                `INSERT INTO notifications (user_id, type, title, message)
                 SELECT ?, 'holiday', ?, ?
                 WHERE NOT EXISTS (
                   SELECT 1 FROM notifications
                   WHERE user_id = ? AND type = 'holiday' AND title = ? AND message LIKE ?
                 )`,
                [userId, title, message, userId, title, `%${holiday.event_date}%`]
            );
            created += Number(result.affectedRows || 0);
        }
        return created;
    } finally {
        if (conn) conn.release();
    }
}

function registerCompanyCalendar(app, pool) {
    app.get("/api/company-calendar/events", async (req, res) => {
        const { month } = req.query;
        let conn;

        try {
            conn = await pool.getConnection();
            await ensureCompanyCalendarTable(conn);

            const params = [];
            let where = "";
            let seedYear = new Date().getFullYear();

            if (month && /^\d{4}-\d{2}$/.test(String(month))) {
                where = "WHERE event_date >= ? AND event_date < DATE_ADD(?, INTERVAL 1 MONTH)";
                params.push(`${month}-01`, `${month}-01`);
                seedYear = Number(String(month).slice(0, 4));
            }

            await seedGovernmentHolidays(conn, seedYear);

            const [rows] = await conn.query(
                `SELECT
                    event_id,
                    DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
                    title,
                    event_type,
                    description,
                    is_paid_holiday
                FROM company_calendar_events
                ${where}
                ORDER BY event_date ASC, event_id ASC`,
                params
            );

            res.json({ success: true, events: rows });
        } catch (err) {
            console.error("Company calendar load error:", err);
            res.status(500).json({ success: false, message: "Unable to load company calendar." });
        } finally {
            if (conn) conn.release();
        }
    });

    app.post("/api/company-calendar/events", async (req, res) => {
        const { event_date, title, event_type, description, is_paid_holiday } = req.body || {};

        if (!event_date || !title) {
            return res.status(400).json({ success: false, message: "Date and title are required." });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await ensureCompanyCalendarTable(conn);

            const [result] = await conn.query(
                `INSERT INTO company_calendar_events
                    (event_date, title, event_type, description, is_paid_holiday)
                VALUES (?, ?, ?, ?, ?)`,
                [
                    event_date,
                    String(title).trim(),
                    String(event_type || "Other").trim(),
                    description ? String(description).trim() : null,
                    is_paid_holiday ? 1 : 0
                ]
            );

            const normalizedType = String(event_type || 'Other').trim().toLowerCase();
            if (isHolidayEventType(normalizedType)) {
              const isPaid = is_paid_holiday ? 'paid' : 'non-paid';
              await createNotificationsForAllUsers(
                pool,
                'holiday',
                `Holiday: ${String(title).trim()}`,
                `A ${isPaid} holiday has been announced on ${event_date}.`
              );
            }

            res.json({ success: true, event_id: result.insertId, message: "Calendar event added." });
        } catch (err) {
            console.error("Company calendar add error:", err);
            res.status(500).json({ success: false, message: "Unable to add calendar event." });
        } finally {
            if (conn) conn.release();
        }
    });

    app.put("/api/company-calendar/events/:eventId", async (req, res) => {
        const { eventId } = req.params;
        const { event_date, title, event_type, description, is_paid_holiday } = req.body || {};

        if (!event_date || !title) {
            return res.status(400).json({ success: false, message: "Date and title are required." });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await ensureCompanyCalendarTable(conn);

            await conn.query(
                `UPDATE company_calendar_events
                 SET event_date = ?, title = ?, event_type = ?, description = ?, is_paid_holiday = ?
                 WHERE event_id = ?`,
                [
                    event_date,
                    String(title).trim(),
                    String(event_type || "Other").trim(),
                    description ? String(description).trim() : null,
                    is_paid_holiday ? 1 : 0,
                    eventId
                ]
            );

            res.json({ success: true, message: "Calendar event updated." });
        } catch (err) {
            console.error("Company calendar update error:", err);
            res.status(500).json({ success: false, message: "Unable to update calendar event." });
        } finally {
            if (conn) conn.release();
        }
    });

    app.delete("/api/company-calendar/events/:eventId", async (req, res) => {
        const { eventId } = req.params;
        let conn;

        try {
            conn = await pool.getConnection();
            await ensureCompanyCalendarTable(conn);

            await conn.query("DELETE FROM company_calendar_events WHERE event_id = ?", [eventId]);
            res.json({ success: true, message: "Calendar event deleted." });
        } catch (err) {
            console.error("Company calendar delete error:", err);
            res.status(500).json({ success: false, message: "Unable to delete calendar event." });
        } finally {
            if (conn) conn.release();
        }
    });
}

registerCompanyCalendar.syncUpcomingHolidayNotificationsForUser = syncUpcomingHolidayNotificationsForUser;
module.exports = registerCompanyCalendar;
