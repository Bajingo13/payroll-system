module.exports = function (app, pool) {
  async function ensureLoanTables(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_loans (
        loan_id INT NOT NULL AUTO_INCREMENT,
        employee_id INT NOT NULL,
        loan_category ENUM('Company Loan','SSS Loan','Pag-IBIG Loan') NOT NULL DEFAULT 'Company Loan',
        loan_reference VARCHAR(100) NULL,
        principal_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        amortization_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        terms_total INT NOT NULL DEFAULT 1,
        terms_paid INT NOT NULL DEFAULT 0,
        payment_frequency ENUM('Weekly','Monthly','First Half','Second Half','Both') NOT NULL DEFAULT 'Monthly',
        status ENUM('Active','Paid','Closed','Cancelled') NOT NULL DEFAULT 'Active',
        start_date DATE NOT NULL,
        end_date DATE NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (loan_id),
        KEY idx_employee_loans_employee (employee_id),
        KEY idx_employee_loans_status (status),
        KEY idx_employee_loans_category (loan_category),
        CONSTRAINT fk_employee_loans_employee
          FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await conn.execute(
      `ALTER TABLE employee_loans MODIFY COLUMN loan_category VARCHAR(100) NOT NULL DEFAULT 'Company Loan'`
    ).catch(() => {});

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_loan_payments (
        payment_id INT NOT NULL AUTO_INCREMENT,
        loan_id INT NOT NULL,
        employee_id INT NOT NULL,
        payroll_id INT NULL,
        run_id INT NULL,
        payment_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_before DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_after DECIMAL(12,2) NOT NULL DEFAULT 0,
        paid_period VARCHAR(30) NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (payment_id),
        UNIQUE KEY uq_loan_payroll (loan_id, payroll_id),
        KEY idx_loan_payments_employee (employee_id),
        KEY idx_loan_payments_loan (loan_id),
        CONSTRAINT fk_loan_payments_loan
          FOREIGN KEY (loan_id) REFERENCES employee_loans (loan_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_loan_payments_employee
          FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const LOAN_CATEGORIES = new Set([
    // Company / Internal
    'Cash Advance',
    'Salary Loan',
    'Emergency Loan',
    'Educational Loan',
    'Medical Loan',
    'Housing Assistance Loan',
    'Equipment / Computer Loan',
    'Company Loan',
    // SSS
    'SSS Salary Loan',
    'SSS Calamity Loan',
    'SSS Loan',
    // Pag-IBIG / HDMF
    'Pag-IBIG Multi-Purpose Loan',
    'Pag-IBIG Calamity Loan',
    'Pag-IBIG Housing Loan',
    'Pag-IBIG Loan'
  ]);

  function normalizeCategory(value) {
    const normalized = String(value || 'Company Loan').trim();
    return LOAN_CATEGORIES.has(normalized) ? normalized : 'Company Loan';
  }

  function normalizeFrequency(value) {
    const normalized = String(value || 'Monthly').trim();
    const allowed = new Set(['Weekly', 'Monthly', 'First Half', 'Second Half', 'Both']);
    return allowed.has(normalized) ? normalized : 'Monthly';
  }

  function computeAmortization(principal, termsTotal, amortizationAmount) {
    const explicit = toNumber(amortizationAmount);
    if (explicit > 0) return explicit;
    const termCount = Math.max(1, parseInt(termsTotal, 10) || 1);
    return Number((toNumber(principal) / termCount).toFixed(2));
  }

  async function getLoanRowWithTotals(conn, loanId) {
    const [rows] = await conn.execute(
      `SELECT
         l.*,
         COALESCE(SUM(p.payment_amount), 0) AS total_paid
       FROM employee_loans l
       LEFT JOIN employee_loan_payments p ON p.loan_id = l.loan_id
       WHERE l.loan_id = ?
       GROUP BY l.loan_id
       LIMIT 1`,
      [loanId]
    );

    if (!rows.length) return null;

    const row = rows[0];
    const principal = toNumber(row.principal_amount);
    const balance = toNumber(row.balance_amount);
    const totalPaid = toNumber(row.total_paid);
    const remainingTerms = Math.max((parseInt(row.terms_total, 10) || 0) - (parseInt(row.terms_paid, 10) || 0), 0);

    return {
      ...row,
      principal_amount: principal,
      balance_amount: balance,
      total_paid: totalPaid,
      remaining_terms: remainingTerms,
      current_amortization: toNumber(row.amortization_amount)
    };
  }

  app.get('/api/loan_deductions/summary', async (req, res) => {
    const employeeId = Number(req.query.employee_id || 0);
    const category = String(req.query.category || '').trim();
    const status = String(req.query.status || '').trim();

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLoanTables(conn);

      const where = [];
      const params = [];

      if (employeeId) {
        where.push('employee_id = ?');
        params.push(employeeId);
      }

      if (category) {
        where.push('loan_category = ?');
        params.push(category);
      }

      if (status) {
        where.push('status = ?');
        params.push(status);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [summaryRows] = await conn.execute(
        `SELECT
           COUNT(*) AS total_loans,
           SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_loans,
           SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_loans,
           SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) AS closed_loans,
           SUM(balance_amount) AS total_balance,
           SUM(amortization_amount) AS total_amortization
         FROM employee_loans
         ${whereClause}`,
        params
      );

      const [categoryRows] = await conn.execute(
        `SELECT loan_category, COUNT(*) AS total, SUM(balance_amount) AS balance
         FROM employee_loans
         ${whereClause}
         GROUP BY loan_category`,
        params
      );

      res.json({
        success: true,
        summary: {
          totalLoans: Number(summaryRows[0].total_loans || 0),
          activeLoans: Number(summaryRows[0].active_loans || 0),
          paidLoans: Number(summaryRows[0].paid_loans || 0),
          closedLoans: Number(summaryRows[0].closed_loans || 0),
          totalBalance: Number(summaryRows[0].total_balance || 0),
          totalAmortization: Number(summaryRows[0].total_amortization || 0)
        },
        categories: categoryRows.map((row) => ({
          loan_category: row.loan_category,
          total: Number(row.total || 0),
          balance: Number(row.balance || 0)
        }))
      });
    } catch (err) {
      console.error('Loan summary error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/loan_deductions', async (req, res) => {
    const employeeId = Number(req.query.employee_id || 0);
    const status = String(req.query.status || '').trim();
    const category = String(req.query.category || '').trim();

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLoanTables(conn);

      const where = [];
      const params = [];

      if (employeeId) {
        where.push('l.employee_id = ?');
        params.push(employeeId);
      }

      if (status) {
        where.push('l.status = ?');
        params.push(status);
      }

      if (category) {
        where.push('l.loan_category = ?');
        params.push(category);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await conn.execute(
        `SELECT
           l.loan_id,
           l.employee_id,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
           e.emp_code,
           l.loan_category,
           l.loan_reference,
           l.principal_amount,
           l.balance_amount,
           l.amortization_amount,
           l.terms_total,
           l.terms_paid,
           l.payment_frequency,
           l.status,
           l.start_date,
           l.end_date,
           l.notes,
           l.created_at,
           l.updated_at,
           COALESCE(SUM(p.payment_amount), 0) AS total_paid
         FROM employee_loans l
         JOIN employees e ON e.employee_id = l.employee_id
         LEFT JOIN employee_loan_payments p ON p.loan_id = l.loan_id
         ${whereClause}
         GROUP BY l.loan_id
         ORDER BY l.status = 'Active' DESC, l.created_at DESC`,
        params
      );

      res.json({
        success: true,
        loans: rows.map((row) => ({
          ...row,
          principal_amount: Number(row.principal_amount || 0),
          balance_amount: Number(row.balance_amount || 0),
          amortization_amount: Number(row.amortization_amount || 0),
          terms_total: Number(row.terms_total || 0),
          terms_paid: Number(row.terms_paid || 0),
          remaining_terms: Math.max(Number(row.terms_total || 0) - Number(row.terms_paid || 0), 0),
          total_paid: Number(row.total_paid || 0)
        }))
      });
    } catch (err) {
      console.error('Loan list error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/loan_deductions', async (req, res) => {
    const employeeId = Number(req.body.employee_id || 0);
    const loanCategory = normalizeCategory(req.body.loan_category);
    const loanReference = String(req.body.loan_reference || '').trim();
    const principalAmount = toNumber(req.body.principal_amount);
    const termsTotal = Math.max(1, parseInt(req.body.terms_total, 10) || 1);
    const amortizationAmount = computeAmortization(principalAmount, termsTotal, req.body.amortization_amount);
    const paymentFrequency = normalizeFrequency(req.body.payment_frequency);
    const startDate = String(req.body.start_date || '').trim();
    const endDate = String(req.body.end_date || '').trim() || null;
    const notes = String(req.body.notes || '').trim() || null;

    if (!employeeId || !principalAmount || !startDate) {
      return res.status(400).json({ success: false, message: 'employee_id, principal_amount, and start_date are required.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLoanTables(conn);

      const [employees] = await conn.execute('SELECT employee_id FROM employees WHERE employee_id = ? LIMIT 1', [employeeId]);
      if (!employees.length) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
      }

      const balanceAmount = principalAmount;
      const [existingRows] = await conn.execute(
        `SELECT loan_id
         FROM employee_loans
         WHERE employee_id = ?
           AND loan_category = ?
           AND IFNULL(loan_reference, '') = IFNULL(?, '')
         ORDER BY status = 'Active' DESC, updated_at DESC, loan_id DESC
         LIMIT 1`,
        [employeeId, loanCategory, loanReference || null]
      );

      if (existingRows.length) {
        const existingLoanId = existingRows[0].loan_id;

        await conn.execute(
          `UPDATE employee_loans SET
             principal_amount = ?,
             balance_amount = ?,
             amortization_amount = ?,
             terms_total = ?,
             payment_frequency = ?,
             status = 'Active',
             start_date = ?,
             end_date = ?,
             notes = ?
           WHERE loan_id = ?`,
          [principalAmount, balanceAmount, amortizationAmount, termsTotal, paymentFrequency, startDate, endDate, notes, existingLoanId]
        );

        const updatedLoan = await getLoanRowWithTotals(conn, existingLoanId);
        return res.json({ success: true, message: 'Existing loan record updated.', loan: updatedLoan, updated: true });
      }

      const [result] = await conn.execute(
        `INSERT INTO employee_loans
         (employee_id, loan_category, loan_reference, principal_amount, balance_amount, amortization_amount, terms_total, terms_paid, payment_frequency, status, start_date, end_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'Active', ?, ?, ?)`,
        [employeeId, loanCategory, loanReference || null, principalAmount, balanceAmount, amortizationAmount, termsTotal, paymentFrequency, startDate, endDate, notes]
      );

      const loan = await getLoanRowWithTotals(conn, result.insertId);
      res.json({ success: true, message: 'Loan record created.', loan, updated: false });
    } catch (err) {
      console.error('Loan create error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.patch('/api/loan_deductions/:loanId', async (req, res) => {
    const loanId = Number(req.params.loanId);

    if (!loanId) {
      return res.status(400).json({ success: false, message: 'Invalid loan id.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLoanTables(conn);

      const loan = await getLoanRowWithTotals(conn, loanId);
      if (!loan) {
        return res.status(404).json({ success: false, message: 'Loan not found.' });
      }

      const principalAmount = req.body.principal_amount !== undefined ? toNumber(req.body.principal_amount) : loan.principal_amount;
      const amortizationAmount = computeAmortization(
        principalAmount,
        req.body.terms_total !== undefined ? req.body.terms_total : loan.terms_total,
        req.body.amortization_amount !== undefined ? req.body.amortization_amount : loan.amortization_amount
      );

      const balanceAmount = req.body.balance_amount !== undefined ? toNumber(req.body.balance_amount) : loan.balance_amount;

      await conn.execute(
        `UPDATE employee_loans SET
           loan_category = ?,
           loan_reference = ?,
           principal_amount = ?,
           balance_amount = ?,
           amortization_amount = ?,
           terms_total = ?,
           terms_paid = ?,
           payment_frequency = ?,
           status = ?,
           start_date = ?,
           end_date = ?,
           notes = ?
         WHERE loan_id = ?`,
        [
          normalizeCategory(req.body.loan_category || loan.loan_category),
          req.body.loan_reference !== undefined ? (String(req.body.loan_reference || '').trim() || null) : loan.loan_reference,
          principalAmount,
          balanceAmount,
          amortizationAmount,
          req.body.terms_total !== undefined ? Math.max(1, parseInt(req.body.terms_total, 10) || 1) : loan.terms_total,
          req.body.terms_paid !== undefined ? Math.max(0, parseInt(req.body.terms_paid, 10) || 0) : loan.terms_paid,
          normalizeFrequency(req.body.payment_frequency || loan.payment_frequency),
          req.body.status !== undefined ? String(req.body.status || loan.status).trim() : loan.status,
          req.body.start_date !== undefined ? String(req.body.start_date || loan.start_date).trim() : loan.start_date,
          req.body.end_date !== undefined ? (String(req.body.end_date || '').trim() || null) : loan.end_date,
          req.body.notes !== undefined ? (String(req.body.notes || '').trim() || null) : loan.notes,
          loanId
        ]
      );

      const updated = await getLoanRowWithTotals(conn, loanId);
      res.json({ success: true, message: 'Loan record updated.', loan: updated });
    } catch (err) {
      console.error('Loan update error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/loan_deductions/:loanId/payments', async (req, res) => {
    const loanId = Number(req.params.loanId);
    const payrollId = req.body.payroll_id !== undefined && req.body.payroll_id !== null && req.body.payroll_id !== '' ? Number(req.body.payroll_id) : null;
    const runId = req.body.run_id !== undefined && req.body.run_id !== null && req.body.run_id !== '' ? Number(req.body.run_id) : null;
    const paidPeriod = String(req.body.paid_period || '').trim() || null;
    const notes = String(req.body.notes || '').trim() || null;

    if (!loanId) {
      return res.status(400).json({ success: false, message: 'Invalid loan id.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLoanTables(conn);
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        `SELECT loan_id, employee_id, balance_amount, amortization_amount, status, terms_total, terms_paid
         FROM employee_loans
         WHERE loan_id = ?
         LIMIT 1
         FOR UPDATE`,
        [loanId]
      );

      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Loan not found.' });
      }

      const loan = rows[0];
      const paymentAmount = Math.min(
        toNumber(req.body.payment_amount || loan.amortization_amount),
        toNumber(loan.balance_amount)
      );

      if (paymentAmount <= 0) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Nothing to apply to this loan.' });
      }

      if (payrollId) {
        const [existingPayments] = await conn.execute(
          'SELECT payment_id, payment_amount, balance_before, balance_after FROM employee_loan_payments WHERE loan_id = ? AND payroll_id = ? LIMIT 1',
          [loanId, payrollId]
        );

        if (existingPayments.length) {
          await conn.commit();
          const updatedLoan = await getLoanRowWithTotals(conn, loanId);
          return res.json({ success: true, message: 'Loan payment already recorded for this payroll.', loan: updatedLoan, payment: existingPayments[0] });
        }
      }

      const balanceBefore = toNumber(loan.balance_amount);
      const balanceAfter = Number(Math.max(balanceBefore - paymentAmount, 0).toFixed(2));

      await conn.execute(
        `INSERT INTO employee_loan_payments
         (loan_id, employee_id, payroll_id, run_id, payment_amount, balance_before, balance_after, paid_period, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [loanId, loan.employee_id, payrollId, runId, paymentAmount, balanceBefore, balanceAfter, paidPeriod, notes]
      );

      await conn.execute(
        `UPDATE employee_loans SET
           balance_amount = ?,
           terms_paid = LEAST(terms_total, terms_paid + 1),
           status = CASE WHEN ? <= 0 THEN 'Paid' ELSE status END
         WHERE loan_id = ?`,
        [balanceAfter, balanceAfter, loanId]
      );

      await conn.commit();

      const updatedLoan = await getLoanRowWithTotals(conn, loanId);
      const [paymentRows] = await conn.execute(
        `SELECT * FROM employee_loan_payments WHERE loan_id = ? ORDER BY created_at DESC, payment_id DESC LIMIT 1`,
        [loanId]
      );

      res.json({
        success: true,
        message: 'Loan payment applied successfully.',
        loan: updatedLoan,
        payment: paymentRows[0] || null
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch { /* ignore */ }
      }
      console.error('Loan payment error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/loan_deductions/:loanId/force-close', async (req, res) => {
    const loanId = Number(req.params.loanId);
    const reason = String(req.body.notes || '').trim();

    if (!loanId) {
      return res.status(400).json({ success: false, message: 'Invalid loan id.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLoanTables(conn);

      const loan = await getLoanRowWithTotals(conn, loanId);
      if (!loan) {
        return res.status(404).json({ success: false, message: 'Loan not found.' });
      }
      if (loan.status !== 'Active') {
        return res.status(400).json({ success: false, message: `Loan is already ${loan.status}.` });
      }

      const today = new Date().toISOString().slice(0, 10);
      const forceCloseNote = `[Force Closed ${today}]${reason ? ': ' + reason : ''}`;
      const finalNotes = loan.notes ? `${loan.notes}\n${forceCloseNote}` : forceCloseNote;

      await conn.execute(
        `UPDATE employee_loans SET status = 'Closed', balance_amount = 0, end_date = ?, notes = ? WHERE loan_id = ?`,
        [today, finalNotes, loanId]
      );

      const updated = await getLoanRowWithTotals(conn, loanId);
      res.json({ success: true, message: 'Loan force-closed successfully.', loan: updated });
    } catch (err) {
      console.error('Loan force-close error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/loan_deductions/:loanId/payments', async (req, res) => {
    const loanId = Number(req.params.loanId);

    if (!loanId) {
      return res.status(400).json({ success: false, message: 'Invalid loan id.' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureLoanTables(conn);

      const [rows] = await conn.execute(
        `SELECT *
         FROM employee_loan_payments
         WHERE loan_id = ?
         ORDER BY created_at DESC, payment_id DESC`,
        [loanId]
      );

      res.json({ success: true, payments: rows });
    } catch (err) {
      console.error('Loan payments error:', err);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });
};