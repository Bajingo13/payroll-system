module.exports = function (app, pool) {

    const DEFAULT_BIR_BRACKETS = [
        { bracket_order: 1, income_from: 0,         income_to: 20833,   base_tax: 0,          tax_rate: 0,    excess_over: 0 },
        { bracket_order: 2, income_from: 20833.01,  income_to: 33332,   base_tax: 0,          tax_rate: 0.15, excess_over: 20833 },
        { bracket_order: 3, income_from: 33333,     income_to: 66666,   base_tax: 1875,       tax_rate: 0.20, excess_over: 33333 },
        { bracket_order: 4, income_from: 66667,     income_to: 166666,  base_tax: 8541.80,    tax_rate: 0.25, excess_over: 66667 },
        { bracket_order: 5, income_from: 166667,    income_to: 666666,  base_tax: 33541.80,   tax_rate: 0.30, excess_over: 166667 },
        { bracket_order: 6, income_from: 666667,    income_to: null,    base_tax: 183541.80,  tax_rate: 0.35, excess_over: 666667 }
    ];

    // SSS 2023 contribution table (monthly salary credit brackets)
    const DEFAULT_SSS = [
        { bracket_order: 1,  salary_from: 0,       salary_to: 3249.99,  employee_value: 135.00,   employer_value: 285.00,   label: 'MSC 3,000' },
        { bracket_order: 2,  salary_from: 3250,    salary_to: 3749.99,  employee_value: 157.50,   employer_value: 332.50,   label: 'MSC 3,500' },
        { bracket_order: 3,  salary_from: 3750,    salary_to: 4249.99,  employee_value: 180.00,   employer_value: 380.00,   label: 'MSC 4,000' },
        { bracket_order: 4,  salary_from: 4250,    salary_to: 4749.99,  employee_value: 202.50,   employer_value: 427.50,   label: 'MSC 4,500' },
        { bracket_order: 5,  salary_from: 4750,    salary_to: 5249.99,  employee_value: 225.00,   employer_value: 475.00,   label: 'MSC 5,000' },
        { bracket_order: 6,  salary_from: 5250,    salary_to: 5749.99,  employee_value: 247.50,   employer_value: 522.50,   label: 'MSC 5,500' },
        { bracket_order: 7,  salary_from: 5750,    salary_to: 6249.99,  employee_value: 270.00,   employer_value: 570.00,   label: 'MSC 6,000' },
        { bracket_order: 8,  salary_from: 6250,    salary_to: 6749.99,  employee_value: 292.50,   employer_value: 617.50,   label: 'MSC 6,500' },
        { bracket_order: 9,  salary_from: 6750,    salary_to: 7249.99,  employee_value: 315.00,   employer_value: 665.00,   label: 'MSC 7,000' },
        { bracket_order: 10, salary_from: 7250,    salary_to: 7749.99,  employee_value: 337.50,   employer_value: 712.50,   label: 'MSC 7,500' },
        { bracket_order: 11, salary_from: 7750,    salary_to: 8249.99,  employee_value: 360.00,   employer_value: 760.00,   label: 'MSC 8,000' },
        { bracket_order: 12, salary_from: 8250,    salary_to: 8749.99,  employee_value: 382.50,   employer_value: 807.50,   label: 'MSC 8,500' },
        { bracket_order: 13, salary_from: 8750,    salary_to: 9249.99,  employee_value: 405.00,   employer_value: 855.00,   label: 'MSC 9,000' },
        { bracket_order: 14, salary_from: 9250,    salary_to: 9749.99,  employee_value: 427.50,   employer_value: 902.50,   label: 'MSC 9,500' },
        { bracket_order: 15, salary_from: 9750,    salary_to: 10249.99, employee_value: 450.00,   employer_value: 950.00,   label: 'MSC 10,000' },
        { bracket_order: 16, salary_from: 10250,   salary_to: 10749.99, employee_value: 472.50,   employer_value: 997.50,   label: 'MSC 10,500' },
        { bracket_order: 17, salary_from: 10750,   salary_to: 11249.99, employee_value: 495.00,   employer_value: 1045.00,  label: 'MSC 11,000' },
        { bracket_order: 18, salary_from: 11250,   salary_to: 11749.99, employee_value: 517.50,   employer_value: 1092.50,  label: 'MSC 11,500' },
        { bracket_order: 19, salary_from: 11750,   salary_to: 12249.99, employee_value: 540.00,   employer_value: 1140.00,  label: 'MSC 12,000' },
        { bracket_order: 20, salary_from: 12250,   salary_to: 12749.99, employee_value: 562.50,   employer_value: 1187.50,  label: 'MSC 12,500' },
        { bracket_order: 21, salary_from: 12750,   salary_to: 13249.99, employee_value: 585.00,   employer_value: 1235.00,  label: 'MSC 13,000' },
        { bracket_order: 22, salary_from: 13250,   salary_to: 13749.99, employee_value: 607.50,   employer_value: 1282.50,  label: 'MSC 13,500' },
        { bracket_order: 23, salary_from: 13750,   salary_to: 14249.99, employee_value: 630.00,   employer_value: 1330.00,  label: 'MSC 14,000' },
        { bracket_order: 24, salary_from: 14250,   salary_to: 14749.99, employee_value: 652.50,   employer_value: 1377.50,  label: 'MSC 14,500' },
        { bracket_order: 25, salary_from: 14750,   salary_to: 15249.99, employee_value: 675.00,   employer_value: 1425.00,  label: 'MSC 15,000' },
        { bracket_order: 26, salary_from: 15250,   salary_to: 15749.99, employee_value: 697.50,   employer_value: 1472.50,  label: 'MSC 15,500' },
        { bracket_order: 27, salary_from: 15750,   salary_to: 16249.99, employee_value: 720.00,   employer_value: 1520.00,  label: 'MSC 16,000' },
        { bracket_order: 28, salary_from: 16250,   salary_to: 16749.99, employee_value: 742.50,   employer_value: 1567.50,  label: 'MSC 16,500' },
        { bracket_order: 29, salary_from: 16750,   salary_to: 17249.99, employee_value: 765.00,   employer_value: 1615.00,  label: 'MSC 17,000' },
        { bracket_order: 30, salary_from: 17250,   salary_to: 17749.99, employee_value: 787.50,   employer_value: 1662.50,  label: 'MSC 17,500' },
        { bracket_order: 31, salary_from: 17750,   salary_to: 18249.99, employee_value: 810.00,   employer_value: 1710.00,  label: 'MSC 18,000' },
        { bracket_order: 32, salary_from: 18250,   salary_to: 18749.99, employee_value: 832.50,   employer_value: 1757.50,  label: 'MSC 18,500' },
        { bracket_order: 33, salary_from: 18750,   salary_to: 19249.99, employee_value: 855.00,   employer_value: 1805.00,  label: 'MSC 19,000' },
        { bracket_order: 34, salary_from: 19250,   salary_to: 19749.99, employee_value: 877.50,   employer_value: 1852.50,  label: 'MSC 19,500' },
        { bracket_order: 35, salary_from: 19750,   salary_to: 20249.99, employee_value: 900.00,   employer_value: 1900.00,  label: 'MSC 20,000' },
        { bracket_order: 36, salary_from: 20250,   salary_to: 20749.99, employee_value: 922.50,   employer_value: 1947.50,  label: 'MSC 20,500' },
        { bracket_order: 37, salary_from: 20750,   salary_to: 21249.99, employee_value: 945.00,   employer_value: 1995.00,  label: 'MSC 21,000' },
        { bracket_order: 38, salary_from: 21250,   salary_to: 21749.99, employee_value: 967.50,   employer_value: 2042.50,  label: 'MSC 21,500' },
        { bracket_order: 39, salary_from: 21750,   salary_to: 22249.99, employee_value: 990.00,   employer_value: 2090.00,  label: 'MSC 22,000' },
        { bracket_order: 40, salary_from: 22250,   salary_to: 22749.99, employee_value: 1012.50,  employer_value: 2137.50,  label: 'MSC 22,500' },
        { bracket_order: 41, salary_from: 22750,   salary_to: 23249.99, employee_value: 1035.00,  employer_value: 2185.00,  label: 'MSC 23,000' },
        { bracket_order: 42, salary_from: 23250,   salary_to: 23749.99, employee_value: 1057.50,  employer_value: 2232.50,  label: 'MSC 23,500' },
        { bracket_order: 43, salary_from: 23750,   salary_to: 24249.99, employee_value: 1080.00,  employer_value: 2280.00,  label: 'MSC 24,000' },
        { bracket_order: 44, salary_from: 24250,   salary_to: 24749.99, employee_value: 1102.50,  employer_value: 2327.50,  label: 'MSC 24,500' },
        { bracket_order: 45, salary_from: 24750,   salary_to: 25249.99, employee_value: 1125.00,  employer_value: 2375.00,  label: 'MSC 25,000' },
        { bracket_order: 46, salary_from: 25250,   salary_to: 25749.99, employee_value: 1147.50,  employer_value: 2422.50,  label: 'MSC 25,500' },
        { bracket_order: 47, salary_from: 25750,   salary_to: 26249.99, employee_value: 1170.00,  employer_value: 2470.00,  label: 'MSC 26,000' },
        { bracket_order: 48, salary_from: 26250,   salary_to: 26749.99, employee_value: 1192.50,  employer_value: 2517.50,  label: 'MSC 26,500' },
        { bracket_order: 49, salary_from: 26750,   salary_to: 27249.99, employee_value: 1215.00,  employer_value: 2565.00,  label: 'MSC 27,000' },
        { bracket_order: 50, salary_from: 27250,   salary_to: 27749.99, employee_value: 1237.50,  employer_value: 2612.50,  label: 'MSC 27,500' },
        { bracket_order: 51, salary_from: 27750,   salary_to: 28249.99, employee_value: 1260.00,  employer_value: 2660.00,  label: 'MSC 28,000' },
        { bracket_order: 52, salary_from: 28250,   salary_to: 28749.99, employee_value: 1282.50,  employer_value: 2707.50,  label: 'MSC 28,500' },
        { bracket_order: 53, salary_from: 28750,   salary_to: 29249.99, employee_value: 1305.00,  employer_value: 2755.00,  label: 'MSC 29,000' },
        { bracket_order: 54, salary_from: 29250,   salary_to: 29749.99, employee_value: 1327.50,  employer_value: 2802.50,  label: 'MSC 29,500' },
        { bracket_order: 55, salary_from: 29750,   salary_to: null,     employee_value: 1350.00,  employer_value: 2850.00,  label: 'MSC 30,000 (Max)' }
    ];

    // PhilHealth 2024: 5% total (2.5% EE + 2.5% ER), min PHP 500, max PHP 5,000/month
    const DEFAULT_PHILHEALTH = [
        { bracket_order: 1, salary_from: 0,       salary_to: 10000,  employee_value: 0.025, employer_value: 0.025, label: 'Min contribution PHP 500' },
        { bracket_order: 2, salary_from: 10000.01, salary_to: 99999.99, employee_value: 0.025, employer_value: 0.025, label: '2.5% EE / 2.5% ER' },
        { bracket_order: 3, salary_from: 100000,  salary_to: null,   employee_value: 0.025, employer_value: 0.025, label: 'Max contribution PHP 5,000' }
    ];

    // Pag-IBIG: 2% EE + 2% ER, max PHP 100/month each
    const DEFAULT_PAGIBIG = [
        { bracket_order: 1, salary_from: 0,      salary_to: 1500,   employee_value: 0.01, employer_value: 0.02, label: '1% EE / 2% ER' },
        { bracket_order: 2, salary_from: 1500.01, salary_to: null,  employee_value: 0.02, employer_value: 0.02, label: '2% EE / 2% ER (max PHP 100 each)' }
    ];

    async function safeAddColumn(conn, table, column, def) {
        try {
            await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
        } catch (e) {
            if (e.errno !== 1060) throw e;
        }
    }

    async function ensureTables(conn) {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS company_settings (
                id INT NOT NULL DEFAULT 1,
                company_name VARCHAR(255) NOT NULL DEFAULT 'Company Name',
                address TEXT,
                tin VARCHAR(100),
                email VARCHAR(255),
                phone VARCHAR(100),
                logo_url TEXT,
                hr_policy TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            )
        `);

        await conn.query(`ALTER TABLE company_settings MODIFY COLUMN logo_url MEDIUMTEXT`).catch(() => {});
        await safeAddColumn(conn, 'company_settings', 'industry', "VARCHAR(255) DEFAULT ''");
        await safeAddColumn(conn, 'company_settings', 'website', "VARCHAR(255) DEFAULT ''");
        await safeAddColumn(conn, 'company_settings', 'registration_no', "VARCHAR(100) DEFAULT ''");
        await safeAddColumn(conn, 'company_settings', 'founded_year', "VARCHAR(10) DEFAULT ''");
        await safeAddColumn(conn, 'company_settings', 'logo_main', 'MEDIUMTEXT');
        await safeAddColumn(conn, 'company_settings', 'logo_secondary', 'MEDIUMTEXT');
        await safeAddColumn(conn, 'company_settings', 'logo_email_signature', 'MEDIUMTEXT');
        await safeAddColumn(conn, 'company_settings', 'leave_policy', "TEXT");
        await safeAddColumn(conn, 'company_settings', 'overtime_policy', "TEXT");
        await safeAddColumn(conn, 'company_settings', 'code_of_conduct', "TEXT");
        await safeAddColumn(conn, 'company_settings', 'data_privacy_policy', "TEXT");

        await conn.query(`
            CREATE TABLE IF NOT EXISTS bir_tax_brackets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bracket_order INT NOT NULL,
                income_from DECIMAL(15,2) NOT NULL,
                income_to DECIMAL(15,2),
                base_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
                tax_rate DECIMAL(8,6) NOT NULL DEFAULT 0,
                excess_over DECIMAL(15,2) NOT NULL DEFAULT 0
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS contribution_tables (
                id INT AUTO_INCREMENT PRIMARY KEY,
                contrib_type VARCHAR(20) NOT NULL,
                bracket_order INT NOT NULL DEFAULT 0,
                salary_from DECIMAL(15,2) NOT NULL DEFAULT 0,
                salary_to DECIMAL(15,2),
                employee_value DECIMAL(15,6) NOT NULL DEFAULT 0,
                employer_value DECIMAL(15,6) NOT NULL DEFAULT 0,
                label VARCHAR(255)
            )
        `);
    }

    async function seedDefaults(conn) {
        // Company settings: insert default row only if table is empty
        const [[csCount]] = await conn.query('SELECT COUNT(*) AS cnt FROM company_settings');
        if (csCount.cnt === 0) {
            await conn.query(
                `INSERT INTO company_settings (id, company_name, address, tin, email, phone, logo_url, hr_policy)
                 VALUES (1, 'Astreablue Intelligence Inc.', '', '', '', '', '', '')`
            );
        }

        // BIR brackets: seed only if empty
        const [[birCount]] = await conn.query('SELECT COUNT(*) AS cnt FROM bir_tax_brackets');
        if (birCount.cnt === 0) {
            for (const b of DEFAULT_BIR_BRACKETS) {
                await conn.query(
                    `INSERT INTO bir_tax_brackets (bracket_order, income_from, income_to, base_tax, tax_rate, excess_over)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [b.bracket_order, b.income_from, b.income_to, b.base_tax, b.tax_rate, b.excess_over]
                );
            }
        }

        // Contribution tables: seed each type only if that type is missing
        for (const [type, rows] of [['sss', DEFAULT_SSS], ['philhealth', DEFAULT_PHILHEALTH], ['pagibig', DEFAULT_PAGIBIG]]) {
            const [[ctCount]] = await conn.query(
                'SELECT COUNT(*) AS cnt FROM contribution_tables WHERE contrib_type = ?', [type]
            );
            if (ctCount.cnt === 0) {
                for (const r of rows) {
                    await conn.query(
                        `INSERT INTO contribution_tables (contrib_type, bracket_order, salary_from, salary_to, employee_value, employer_value, label)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [type, r.bracket_order, r.salary_from, r.salary_to, r.employee_value, r.employer_value, r.label || null]
                    );
                }
            }
        }
    }

    // One-time init on startup — stored so route handlers can await it
    const initReady = (async () => {
        let conn;
        try {
            conn = await pool.getConnection();
            await ensureTables(conn);
            await seedDefaults(conn);
            console.log('OK > system_config tables ready');
        } catch (err) {
            console.error('WARN > system_config init failed:', err.message);
        } finally {
            if (conn) conn.release();
        }
    })();


    // ── Company Settings ──────────────────────────────────────────────

    app.get('/api/company_settings', async (req, res) => {
        await initReady;
        let conn;
        try {
            conn = await pool.getConnection();
            const [rows] = await conn.query('SELECT * FROM company_settings WHERE id = 1');
            res.json({ success: true, data: rows[0] || null });
        } catch (err) {
            console.error('GET company_settings error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });

    app.put('/api/company_settings', async (req, res) => {
        await initReady;
        const {
            company_name, address, tin, email, phone, logo_url, hr_policy,
            industry, website, registration_no, founded_year,
            logo_main, logo_secondary, logo_email_signature,
            leave_policy, overtime_policy, code_of_conduct, data_privacy_policy
        } = req.body || {};
        if (!company_name || !String(company_name).trim()) {
            return res.status(400).json({ success: false, message: 'Company name is required' });
        }
        const effectiveLogoUrl = logo_main || logo_url || '';
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.query(
                `INSERT INTO company_settings
                   (id, company_name, address, tin, email, phone, logo_url, hr_policy,
                    industry, website, registration_no, founded_year,
                    logo_main, logo_secondary, logo_email_signature,
                    leave_policy, overtime_policy, code_of_conduct, data_privacy_policy)
                 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   company_name         = VALUES(company_name),
                   address              = VALUES(address),
                   tin                  = VALUES(tin),
                   email                = VALUES(email),
                   phone                = VALUES(phone),
                   logo_url             = VALUES(logo_url),
                   hr_policy            = VALUES(hr_policy),
                   industry             = VALUES(industry),
                   website              = VALUES(website),
                   registration_no      = VALUES(registration_no),
                   founded_year         = VALUES(founded_year),
                   logo_main            = VALUES(logo_main),
                   logo_secondary       = VALUES(logo_secondary),
                   logo_email_signature = VALUES(logo_email_signature),
                   leave_policy         = VALUES(leave_policy),
                   overtime_policy      = VALUES(overtime_policy),
                   code_of_conduct      = VALUES(code_of_conduct),
                   data_privacy_policy  = VALUES(data_privacy_policy)`,
                [
                    String(company_name).trim(),
                    address || '', tin || '', email || '', phone || '',
                    effectiveLogoUrl, hr_policy || '',
                    industry || '', website || '', registration_no || '', founded_year || '',
                    logo_main || '', logo_secondary || '', logo_email_signature || '',
                    leave_policy || '', overtime_policy || '', code_of_conduct || '', data_privacy_policy || ''
                ]
            );
            const [rows] = await conn.query('SELECT * FROM company_settings WHERE id = 1');
            res.json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('PUT company_settings error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });


    // ── BIR Tax Brackets ──────────────────────────────────────────────

    app.get('/api/tax_brackets', async (req, res) => {
        await initReady;
        let conn;
        try {
            conn = await pool.getConnection();
            const [rows] = await conn.query(
                'SELECT * FROM bir_tax_brackets ORDER BY bracket_order ASC'
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            console.error('GET tax_brackets error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });

    app.put('/api/tax_brackets', async (req, res) => {
        await initReady;
        const { brackets } = req.body || {};
        if (!Array.isArray(brackets) || brackets.length === 0) {
            return res.status(400).json({ success: false, message: 'brackets array is required' });
        }
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();
            await conn.query('DELETE FROM bir_tax_brackets');
            for (let i = 0; i < brackets.length; i++) {
                const b = brackets[i];
                await conn.query(
                    `INSERT INTO bir_tax_brackets (bracket_order, income_from, income_to, base_tax, tax_rate, excess_over)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [i + 1, Number(b.income_from) || 0, b.income_to != null ? Number(b.income_to) : null,
                     Number(b.base_tax) || 0, Number(b.tax_rate) || 0, Number(b.excess_over) || 0]
                );
            }
            await conn.commit();
            const [rows] = await conn.query('SELECT * FROM bir_tax_brackets ORDER BY bracket_order ASC');
            res.json({ success: true, data: rows });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error('PUT tax_brackets error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });


    // ── Contribution Tables ───────────────────────────────────────────

    app.get('/api/contribution_tables/:type', async (req, res) => {
        await initReady;
        const type = String(req.params.type || '').toLowerCase();
        if (!['sss', 'philhealth', 'pagibig'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid type. Use sss, philhealth, or pagibig.' });
        }
        let conn;
        try {
            conn = await pool.getConnection();
            const [rows] = await conn.query(
                'SELECT * FROM contribution_tables WHERE contrib_type = ? ORDER BY bracket_order ASC',
                [type]
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            console.error('GET contribution_tables error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });

    app.put('/api/contribution_tables/:type', async (req, res) => {
        await initReady;
        const type = String(req.params.type || '').toLowerCase();
        if (!['sss', 'philhealth', 'pagibig'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid type. Use sss, philhealth, or pagibig.' });
        }
        const { rows: inputRows } = req.body || {};
        if (!Array.isArray(inputRows) || inputRows.length === 0) {
            return res.status(400).json({ success: false, message: 'rows array is required' });
        }
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();
            await conn.query('DELETE FROM contribution_tables WHERE contrib_type = ?', [type]);
            for (let i = 0; i < inputRows.length; i++) {
                const r = inputRows[i];
                await conn.query(
                    `INSERT INTO contribution_tables (contrib_type, bracket_order, salary_from, salary_to, employee_value, employer_value, label)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [type, i + 1, Number(r.salary_from) || 0, r.salary_to != null ? Number(r.salary_to) : null,
                     Number(r.employee_value) || 0, Number(r.employer_value) || 0, r.label || null]
                );
            }
            await conn.commit();
            const [rows] = await conn.query(
                'SELECT * FROM contribution_tables WHERE contrib_type = ? ORDER BY bracket_order ASC', [type]
            );
            res.json({ success: true, data: rows });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error('PUT contribution_tables error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });
};
