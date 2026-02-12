module.exports = (app, pool) => {
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

  /* =====================
      LIST MANAGER
  ====================== */
  // ========== STANDARD LIST SECTION ==========
  app.get("/api/system_lists", async (req, res) => {
    const { category } = req.query;
    if (!category) return res.status(400).json({ error: "Category required" });

    try {
      const [rows] = await pool.execute(
        "SELECT id, value FROM system_lists WHERE category = ? AND is_active = TRUE ORDER BY value ASC",
        [category]
      );
      res.json(rows);
    } catch (err) {
      console.error("Error fetching list:", err);
      res.status(500).json({ error: "Failed to fetch list items" });
    }
  });

  // ADD new list item
  app.post("/api/system_lists", async (req, res) => {
    const { category, value } = req.body;
    if (!category || !value)
      return res.status(400).json({ success: false, message: "Category and value required" });

    try {
      await pool.execute(
        "INSERT INTO system_lists (category, value, is_active) VALUES (?, ?, TRUE)",
        [category, value]
      );
      
      // Log audit
      const userId = req.body.user_id || null;
      const adminName = req.body.admin_name || "Unknown";
      await logAudit(pool, userId, adminName, `Added from ${category} = ${value}`, "Success");
      
      res.json({ success: true });
    } catch (err) {
      console.error("Error adding list item:", err);
      res.status(500).json({ success: false });
    }
  });

  // DELETE list item
  app.delete("/api/system_lists/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await pool.execute("DELETE FROM system_lists WHERE id = ?", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting list item:", err);
      res.status(500).json({ success: false });
    }
  });
  
  // ========== ALLOWANCES ==========
  app.get("/api/allowances", async (req, res) => {
    try {
      const [rows] = await pool.execute(
        "SELECT allowance_type_id AS id, allowance_name AS name, is_taxable AS taxable, default_amount AS amount FROM allowance_types ORDER BY allowance_name ASC"
      );
      res.json(rows);
    } catch (err) {
      console.error("Error fetching allowances:", err);
      res.status(500).json({ error: "Failed to fetch allowances" });
    }
  });

  // ADD allowances
  app.post("/api/allowances", async (req, res) => {
      const { name, taxable, amount } = req.body;

      if (!name || amount === undefined || typeof amount !== "number") {
        return res.status(400).json({ success: false, message: "Name and numeric amount required" });
      }

      try {
        await pool.execute(
          "INSERT INTO allowance_types (allowance_name, is_taxable, default_amount) VALUES (?, ?, ?)",
          [name, taxable, amount] // taxable is boolean, amount is number
        );
        res.json({ success: true });
      } catch (err) {
        console.error("Error adding allowance:", err);
        res.status(500).json({ success: false });
      }
  });

  // UPDATE allowance
  app.put("/api/allowances/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const id = req.params.id;
      const { name, taxable, amount } = req.body;

      // Validate required fields
      if (!name || amount === undefined) {
        return res.status(400).json({ success: false, message: "Missing required fields." });
      }

      const query = `
        UPDATE allowance_types
        SET allowance_name = ?, 
          is_taxable = ?, 
          default_amount = ?
        WHERE allowance_type_id = ?
      `;

      await conn.query(query, [
        name,
        taxable ? 1 : 0,
        amount,
        id
      ]);

      conn.release();

      res.json({ success: true, message: "Allowance updated successfully." });

    } catch (err) {
      console.error("Error updating allowance:", err);
      res.status(500).json({ success: false, message: "Server error." });
    }
  });

  // DELETE allowances
  app.delete("/api/allowances/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await pool.execute("DELETE FROM allowance_types WHERE allowance_type_id = ?", [id]);
      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted Allowance Type ${id}`, 'Success');
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting allowance:", err);
      res.status(500).json({ success: false });
    }
  });

  // ========== DEDUCTIONS ==========
  app.get("/api/deductions", async (req, res) => {
    try {
      const [rows] = await pool.execute(
        "SELECT deduction_type_id AS id, deduction_name AS name, default_amount AS amount FROM deduction_types ORDER BY deduction_name ASC"
      );
      res.json(rows);
    } catch (err) {
      console.error("Error fetching deductions:", err);
      res.status(500).json({ error: "Failed to fetch deductions" });
    }
  });

  // ADD deductions
  app.post("/api/deductions", async (req, res) => {
    const { name, amount } = req.body;
    if (!name || amount === undefined)
      return res.status(400).json({ success: false, message: "Name and amount required" });

    try {
      await pool.execute(
        "INSERT INTO deduction_types (deduction_name, default_amount) VALUES (?, ?)",
        [name, amount]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Error adding deduction:", err);
      res.status(500).json({ success: false });
    }
  });

  // UPDATE deductions
  app.put("/api/deductions/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const id = req.params.id;
      const { name, amount } = req.body;

      // Validate required fields
      if (!name || amount === undefined) {
        return res.status(400).json({ success: false, message: "Missing required fields." });
      }

      const query = `
        UPDATE deduction_types
        SET deduction_name = ?,
          default_amount = ?
        WHERE deduction_type_id = ?
      `;

      await conn.query(query, [
        name,
        amount,
        id
      ]);

      conn.release();

      res.json({ success: true, message: "Deduction updated successfully." });
    } catch (err) {
      console.error("Error updating deduction:", err);
      res.status(500).json({ success: false, message: "Server error." });
    }
  });

  // DELETE deductions
  app.delete("/api/deductions/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await pool.execute("DELETE FROM deduction_types WHERE deduction_type_id = ?", [id]);
      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted Deduction Type ${id}`, 'Success');
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting deduction:", err);
      res.status(500).json({ success: false });
    }
  });

  /* =====================
      EMPLOYEE BENEFITS
  ====================== */
  // ========== SSS ==========
  // ADD SSS contribution
  app.post("/api/add_sss_contributions", async (req, res) => {
    const { low, high, ee, er, ecc, date } = req.body;

    try {
      await pool.execute(
        "INSERT INTO sss_contribution_table (salary_low, salary_high, ee_share, er_share, ecc, date_effective) VALUES (?, ?, ?, ?, ?, ?)",
        [low, high, ee, er, ecc, date]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding sss data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // SSS Contributions List
  app.get("/api/sss_contributions_lists", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [rows] = await conn.query(`
        SELECT *
        FROM sss_contribution_table
        ORDER BY salary_low ASC
      `);

      conn.release();

      res.json({ success: true, sss: rows });
    } catch (err) {
      console.error("Error fetching sss data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // UPDATE SSS contribution
  app.put("/api/sss_contributions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const sssId = req.params.id;
      const { salary_low, salary_high, ee_share, er_share, ecc, date_effective } = req.body;

      const query = `
        UPDATE sss_contribution_table
        SET salary_low=?, salary_high=?, ee_share=?, er_share=?, ecc=?, date_effective=?
        WHERE sss_id=?
      `;

      await conn.query(query, [
        salary_low,
        salary_high,
        ee_share,
        er_share,
        ecc,
        date_effective,
        sssId
      ]);

      conn.release();

      res.json({ success: true, message: "SSS contribution updated" });
    } catch (err) {
      console.error("Error updating SSS contribution:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // DELETE SSS contribution
  app.delete("/api/sss_contributions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const sssId = req.params.id;

      const [rows] = await conn.query(`SELECT sss_id FROM sss_contribution_table WHERE sss_id = ?`, [sssId]);

      if (rows.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: 'SSS contribution not found' });
      }

      await conn.beginTransaction();
    
      await conn.query(`DELETE FROM sss_contribution_table WHERE sss_id = ?`, [sssId]);

      await conn.commit();

      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted SSS contribution ${sssId}`, 'Success');
      res.json({ success: true, message: 'SSS contribution deleted successfully' });
    } catch (err) {
      console.error("Error deleting SSS contribution:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // ========== Pag-IBIG ==========
  // ADD Pag-IBIG contribution
  app.post("/api/add_pagibig_contributions", async (req, res) => {
    const { low, high, ee, er, date } = req.body;

    try {
      await pool.execute(
        "INSERT INTO pagibig_contribution_table (salary_low, salary_high, ee_share, er_share, date_effective) VALUES (?, ?, ?, ?, ?)",
        [low, high, ee, er, date]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding pagibig data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // Pag-IBIG Contributions List
  app.get("/api/pagibig_contributions_lists", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [rows] = await conn.query(`
        SELECT *
        FROM pagibig_contribution_table
        ORDER BY salary_low ASC
      `);

      conn.release();

      res.json({ success: true, pagibig: rows });
    } catch (err) {
      console.error("Error fetching pagibig data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // UPDATE Pag-IBIG contribution
  app.put("/api/pagibig_contributions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const pagibigId = req.params.id;
      const { salary_low, salary_high, ee_share, er_share, date_effective } = req.body;

      const query = `
        UPDATE pagibig_contribution_table
        SET salary_low=?, salary_high=?, ee_share=?, er_share=?, date_effective=?
        WHERE pagibig_id=?
      `;

      await conn.query(query, [
        salary_low,
        salary_high,
        ee_share,
        er_share,
        date_effective,
        pagibigId
      ]);

      conn.release();

      res.json({ success: true, message: "Pag-IBIG contribution updated" });
    } catch (err) {
      console.error("Error updating Pag-IBIG contribution:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // DELETE Pag-IBIG contribution
  app.delete("/api/pagibig_contributions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const pagibigId = req.params.id;

      const [rows] = await conn.query(`SELECT pagibig_id FROM pagibig_contribution_table WHERE pagibig_id = ?`, [pagibigId]);

      if (rows.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: 'Pag-IBIG contribution not found' });
      }

      await conn.beginTransaction();
    
      await conn.query(`DELETE FROM pagibig_contribution_table WHERE pagibig_id = ?`, [pagibigId]);

      await conn.commit();

      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted Pag-IBIG contribution ${pagibigId}`, 'Success');
      res.json({ success: true, message: 'Pag-IBIG contribution deleted successfully' });
    } catch (err) {
      console.error("Error deleting Pag-IBIG contribution:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // ========== PhilHealth ==========
  // ADD PhilHealth contribution
  app.post("/api/add_philhealth_contributions", async (req, res) => {
    const { low, high, ee, er, date } = req.body;

    try {
      await pool.execute(
        "INSERT INTO philhealth_contribution_table (salary_low, salary_high, ee_share, er_share, date_effective) VALUES (?, ?, ?, ?, ?)",
        [low, high, ee, er, date]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding philhealth data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // PhilHealth Contributions List
  app.get("/api/philhealth_contributions_lists", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [rows] = await conn.query(`
        SELECT *
        FROM philhealth_contribution_table
        ORDER BY salary_low ASC
      `);

      conn.release();

      res.json({ success: true, philhealth: rows });
    } catch (err) {
      console.error("Error fetching philhealth data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
    
  // UPDATE PhilHealth contribution
  app.put("/api/philhealth_contributions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const philhealthId = req.params.id;
      const { salary_low, salary_high, ee_share, er_share, date_effective } = req.body;

      const query = `
        UPDATE philhealth_contribution_table
        SET salary_low=?, salary_high=?, ee_share=?, er_share=?, date_effective=?
        WHERE philhealth_id=?
      `;

      await conn.query(query, [
        salary_low,
        salary_high,
        ee_share,
        er_share,
        date_effective,
        philhealthId
      ]);

      conn.release();

      res.json({ success: true, message: "PhilHealth contribution updated" });
    } catch (err) {
      console.error("Error updating PhilHealth contribution:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // DELETE PhilHealth contribution
  app.delete("/api/philhealth_contributions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const philhealthId = req.params.id;

      const [rows] = await conn.query(`SELECT philhealth_id FROM philhealth_contribution_table WHERE philhealth_id = ?`, [philhealthId]);

      if (rows.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: 'PhilHealth contribution not found' });
      }

      await conn.beginTransaction();
    
      await conn.query(`DELETE FROM philhealth_contribution_table WHERE philhealth_id = ?`, [philhealthId]);

      await conn.commit();

      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted PhilHealth contribution ${philhealthId}`, 'Success');
      res.json({ success: true, message: 'PhilHealth contribution deleted successfully' });
    } catch (err) {
      console.error("Error deleting PhilHealth contribution:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // ========== Tax Exemptions ==========
  // ADD Tax Exemptions
  app.post("/api/add_tax_exemptions", async (req, res) => {
    const { code, description, amount } = req.body;

    try {
      await pool.execute(
        "INSERT INTO tax_exemptions_table (code, description, amount) VALUES (?, ?, ?)",
        [code, description, amount]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding tax exemption data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // Tax Exemptions List
  app.get("/api/tax_exemptions_lists", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [rows] = await conn.query(`
        SELECT *
        FROM tax_exemptions_table
        ORDER BY code ASC
      `);

      conn.release();

      res.json({ success: true, tax_exemptions: rows });
    } catch (err) {
      console.error("Error fetching tax exemptions data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
      
  // UPDATE Tax Exemptions
  app.put("/api/tax_exemptions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const taxexemptionId = req.params.id;
      const { code, description, amount } = req.body;

      const query = `
        UPDATE tax_exemptions_table
        SET code=?, description=?, amount=?
        WHERE tax_exemption_id=?
      `;

      await conn.query(query, [
        code,
        description,
        amount,
        taxexemptionId
      ]);

      conn.release();

      res.json({ success: true, message: "Tax exemption updated" });
    } catch (err) {
      console.error("Error updating tax exemption:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // DELETE Tax Exemptions
  app.delete("/api/tax_exemptions_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const taxexemptionId = req.params.id;

      const [rows] = await conn.query(`SELECT tax_exemption_id FROM tax_exemptions_table WHERE tax_exemption_id = ?`, [taxexemptionId]);

      if (rows.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: 'Tax Exemption not found' });
      }

      await conn.beginTransaction();
    
      await conn.query(`DELETE FROM tax_exemptions_table WHERE tax_exemption_id = ?`, [taxexemptionId]);

      await conn.commit();

      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted Tax Exemption ${taxexemptionId}`, 'Success');
      res.json({ success: true, message: 'Tax Exemption deleted successfully' });
    } catch (err) {
      console.error("Error deleting Tax Exemption:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // ========== Withholding Tax ==========
  // ADD Withholding Tax
  app.post("/api/add_withholding_tax", async (req, res) => {
    const { pay_period, status, tax_low, tax_high, percent_over, amount } = req.body;

    try {
      await pool.execute(
        "INSERT INTO withholding_tax_table (pay_period, status, tax_low, tax_high, percent_over, amount) VALUES (?, ?, ?, ?, ?, ?)",
        [pay_period, status, tax_low, tax_high, percent_over, amount]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding wihholding tax data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // Withholding Tax List
  app.get("/api/withholding_tax_lists", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [rows] = await conn.query(`
        SELECT *
        FROM withholding_tax_table
        ORDER BY 
          -- 1. Order by pay_period
          CASE pay_period
            WHEN 'DAILY' THEN 1
            WHEN 'WEEKLY' THEN 2
            WHEN 'SEMI-MONTHLY' THEN 3
            WHEN 'MONTHLY' THEN 4
            ELSE 5
          END,
          
          -- 2. Custom status priority (letters only or base letters)
          CASE
            WHEN status LIKE 'Z%' THEN 1
            WHEN status LIKE 'S%' THEN 2
            WHEN status LIKE 'ME%' THEN 3
            ELSE 4
          END,
          
          -- 3. Numbered suffix: NULLs (letters only) first, numbers ascending
          CAST(REGEXP_REPLACE(status, '^[A-Z]+', '') AS UNSIGNED),
          
          -- 4. Finally, tax_low ascending
          tax_low ASC;
      `);

      conn.release();

      res.json({ success: true, withholding_tax: rows });
    } catch (err) {
      console.error("Error fetching wihholding tax data:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
      
  // UPDATE Withholding Tax
  app.put("/api/withholding_tax_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const withholdingtaxId = req.params.id;
      const { pay_period, status, tax_low, tax_high, percent_over, amount } = req.body;

      const query = `
        UPDATE withholding_tax_table
        SET pay_period=?, status=?, tax_low=?, tax_high=?, percent_over=?, amount=?
        WHERE withholding_tax_id=?
      `;

      await conn.query(query, [
        pay_period,
        status,
        tax_low,
        tax_high,
        percent_over,
        amount,
        withholdingtaxId
      ]);

      conn.release();

      res.json({ success: true, message: "Withholding tax updated" });
    } catch (err) {
      console.error("Error updating withholding tax:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // DELETE Withholding Tax
  app.delete("/api/withholding_tax_lists/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const withholdingtaxId = req.params.id;

      const [rows] = await conn.query(`SELECT withholding_tax_id FROM withholding_tax_table WHERE withholding_tax_id = ?`, [withholdingtaxId]);

      if (rows.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: 'Withholding Tax not found' });
      }

      await conn.beginTransaction();
    
      await conn.query(`DELETE FROM withholding_tax_table WHERE withholding_tax_id = ?`, [withholdingtaxId]);

      await conn.commit();

      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted Withholding Tax ${withholdingtaxId}`, 'Success');
      res.json({ success: true, message: 'Withholding Tax deleted successfully' });
    } catch (err) {
      console.error("Error deleting Withholding Tax:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // ========== REGIONAL MINIMUM WAGE RATES ==========
  // ADD regional minimum wage rate
  app.post("/api/add_regional_minimum_wage_rate", async (req, res) => {
    const { region_code, region_name, wage_rate } = req.body;

    try {
      await pool.execute(
        `INSERT INTO regional_minimum_wage_rates (region_code, region_name, wage_rate)
        VALUES (?, ?, ?)`,
        [region_code, region_name, wage_rate]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding regional minimum wage rate:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // Regional Minimum Wage Rates List
  app.get("/api/regional_minimum_wage_rates", async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [rows] = await conn.query(`
        SELECT *
        FROM regional_minimum_wage_rates
        ORDER BY region_code ASC
      `);

      conn.release();

      res.json({ success: true, regional_wage_rates: rows });
    } catch (err) {
      console.error("Error fetching regional minimum wage rates:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // UPDATE regional minimum wage rate
  app.put("/api/regional_minimum_wage_rates/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const rateId = req.params.id;
      const { region_code, region_name, wage_rate } = req.body;

      const query = `
        UPDATE regional_minimum_wage_rates
        SET region_code=?, region_name=?, wage_rate=?
        WHERE regional_minimum_wage_rate_id=?
      `;

      await conn.query(query, [region_code, region_name, wage_rate, rateId]);

      conn.release();

      res.json({ success: true, message: "Regional minimum wage rate updated" });
    } catch (err) {
      console.error("Error updating regional minimum wage rate:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // DELETE regional minimum wage rate
  app.delete("/api/regional_minimum_wage_rates/:id", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const rateId = req.params.id;

      const [rows] = await conn.query(
        `SELECT regional_minimum_wage_rate_id FROM regional_minimum_wage_rates WHERE regional_minimum_wage_rate_id = ?`,
        [rateId]
      );

      if (rows.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: "Regional minimum wage rate not found" });
      }

      await conn.beginTransaction();

      await conn.query(`DELETE FROM regional_minimum_wage_rates WHERE regional_minimum_wage_rate_id = ?`, [rateId]);

      await conn.commit();

      // Log audit
      await logAudit(pool, req.body.user_id, req.body.admin_name, `Deleted regional wage rate ${rateId}`, 'Success');

      res.json({ success: true, message: "Regional minimum wage rate deleted successfully" });
    } catch (err) {
      console.error("Error deleting regional minimum wage rate:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
};