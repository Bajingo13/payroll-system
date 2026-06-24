module.exports = function (app, pool) {

    const initReady = (async () => {
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.query(`
                CREATE TABLE IF NOT EXISTS designations (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    title       VARCHAR(255) NOT NULL,
                    description TEXT,
                    salary_grade VARCHAR(100),
                    department  VARCHAR(255),
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            console.log('OK > organization_setup tables ready');
        } catch (err) {
            console.error('WARN > organization_setup init failed:', err.message);
        } finally {
            if (conn) conn.release();
        }
    })();

    // GET all designations
    app.get('/api/designations', async (req, res) => {
        await initReady;
        let conn;
        try {
            conn = await pool.getConnection();
            const [rows] = await conn.query('SELECT * FROM designations ORDER BY title ASC');
            res.json({ success: true, data: rows });
        } catch (err) {
            console.error('GET designations error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });

    // POST create a designation
    app.post('/api/designations', async (req, res) => {
        await initReady;
        const { title, description, salary_grade, department } = req.body || {};
        if (!title || !String(title).trim()) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }
        let conn;
        try {
            conn = await pool.getConnection();
            const [result] = await conn.query(
                'INSERT INTO designations (title, description, salary_grade, department) VALUES (?, ?, ?, ?)',
                [String(title).trim(), description || '', salary_grade || '', department || '']
            );
            const [rows] = await conn.query('SELECT * FROM designations WHERE id = ?', [result.insertId]);
            res.json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('POST designations error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });

    // PUT update a designation
    app.put('/api/designations/:id', async (req, res) => {
        await initReady;
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });
        const { title, description, salary_grade, department } = req.body || {};
        if (!title || !String(title).trim()) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.query(
                'UPDATE designations SET title=?, description=?, salary_grade=?, department=? WHERE id=?',
                [String(title).trim(), description || '', salary_grade || '', department || '', id]
            );
            const [rows] = await conn.query('SELECT * FROM designations WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
            res.json({ success: true, data: rows[0] });
        } catch (err) {
            console.error('PUT designations error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });

    // DELETE a designation
    app.delete('/api/designations/:id', async (req, res) => {
        await initReady;
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.query('DELETE FROM designations WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (err) {
            console.error('DELETE designations error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        } finally {
            if (conn) conn.release();
        }
    });
};
