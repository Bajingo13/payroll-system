const crypto = require('crypto');

module.exports = function (app, pool) {
  const ID_CIPHER_PREFIX = 'enc:v1';

  function getEncryptionKey() {
    const source = process.env.EMPLOYEE_ID_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'payroll_secret_key';
    return crypto.createHash('sha256').update(source).digest();
  }

  function encryptSensitiveValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return null;

    const iv = crypto.randomBytes(12);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${ID_CIPHER_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  function decryptSensitiveValue(storedValue) {
    const value = String(storedValue || '').trim();
    if (!value) return '';

    if (!value.startsWith(`${ID_CIPHER_PREFIX}:`)) {
      return value;
    }

    try {
      const [, ivB64, tagB64, encryptedB64] = value.split(':');
      const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedB64, 'base64')),
        decipher.final()
      ]);
      return decrypted.toString('utf8');
    } catch {
      return '';
    }
  }

  function toNullable(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return typeof value === 'string' ? value.trim() : value;
  }

  async function ensureEmployeeDocumentsTable(conn) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        employee_id INT NOT NULL,
        files_201 TEXT NULL,
        contracts TEXT NULL,
        certifications TEXT NULL,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (employee_id),
        CONSTRAINT fk_employee_documents_employee
          FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async function ensureEncryptedGovernmentIdColumns(conn) {
    const [rows] = await conn.execute(
      `SELECT
         COLUMN_NAME AS column_name,
         DATA_TYPE AS data_type,
         CHARACTER_MAXIMUM_LENGTH AS character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'employee_accounts'
         AND column_name IN ('sss_no', 'philhealth_no', 'pagibig_no', 'tin_no')`
    );

    const byName = new Map(rows.map((row) => [row.column_name, row]));
    const targetColumns = ['sss_no', 'philhealth_no', 'pagibig_no', 'tin_no'];

    for (const column of targetColumns) {
      const meta = byName.get(column);
      if (!meta) continue;

      const dataType = String(meta.data_type || '').toLowerCase();
      const maxLength = Number(meta.character_maximum_length || 0);
      const alreadyWideText = dataType === 'text' || dataType === 'mediumtext' || dataType === 'longtext';
      const hasEnoughVarchar = dataType === 'varchar' && maxLength >= 255;

      if (!alreadyWideText && !hasEnoughVarchar) {
        await conn.execute(`ALTER TABLE employee_accounts MODIFY COLUMN ${column} TEXT NULL`);
      }
    }
  }

  async function findEmployeeByUser(conn, user) {
    const username = String((user && user.username) || '').trim();
    if (username) {
      const [codeRows] = await conn.execute(
        `SELECT e.employee_id, e.emp_code, e.status
         FROM employees e
         WHERE LOWER(TRIM(e.emp_code)) = LOWER(TRIM(?))
         ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
         LIMIT 1`,
        [username]
      );
      if (codeRows[0]) return codeRows[0];
    }

    const fullName = String((user && user.full_name) || '').trim();
    if (!fullName) return null;

    const [exactRows] = await conn.execute(
      `SELECT e.employee_id, e.emp_code, e.status
       FROM employees e
       WHERE LOWER(TRIM(CONCAT(e.first_name, ' ', e.last_name))) = LOWER(TRIM(?))
       ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
       LIMIT 1`,
      [fullName]
    );

    if (exactRows[0]) return exactRows[0];

    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const [rows] = await conn.execute(
        `SELECT e.employee_id, e.emp_code, e.status
         FROM employees e
         WHERE LOWER(TRIM(e.first_name)) = LOWER(TRIM(?))
           AND LOWER(TRIM(e.last_name)) = LOWER(TRIM(?))
         ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
         LIMIT 1`,
        [firstName, lastName]
      );
      if (rows[0]) return rows[0];
    }

    const [likeRows] = await conn.execute(
      `SELECT e.employee_id, e.emp_code, e.status
       FROM employees e
       WHERE LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER(?)
       ORDER BY (e.status = 'Active') DESC, e.employee_id DESC
       LIMIT 1`,
      [`%${fullName}%`]
    );

    return likeRows[0] || null;
  }

  async function createEmployeeSkeletonForUser(conn, user) {
    const fullName = String((user && user.full_name) || '').trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Employee';
    const lastName = parts.length > 1 ? parts[parts.length - 1] : 'User';

    const baseRaw = String((user && user.username) || `USR${user.user_id || '0'}`)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const baseCode = baseRaw || `USR${user.user_id || '0'}`;

    let candidateCode = baseCode;
    let suffix = 1;
    while (true) {
      const [exists] = await conn.execute('SELECT employee_id FROM employees WHERE emp_code = ? LIMIT 1', [candidateCode]);
      if (!exists.length) break;
      candidateCode = `${baseCode}${suffix}`;
      suffix += 1;
    }

    const [insertResult] = await conn.execute(
      `INSERT INTO employees (emp_code, first_name, last_name, status)
       VALUES (?, ?, ?, 'Active')`,
      [candidateCode, firstName, lastName]
    );

    const employeeId = insertResult.insertId;

    await conn.execute(
      `INSERT INTO employee_contacts (employee_id, mobile_no, email)
       VALUES (?, NULL, NULL)`,
      [employeeId]
    );

    await conn.execute(
      `INSERT INTO employee_employment (employee_id, company, department, position, date_hired)
       VALUES (?, 'N/A', NULL, NULL, CURDATE())`,
      [employeeId]
    );

    await conn.execute(
      `INSERT INTO employee_accounts (employee_id)
       VALUES (?)`,
      [employeeId]
    );

    const [rows] = await conn.execute(
      'SELECT employee_id, emp_code, status FROM employees WHERE employee_id = ? LIMIT 1',
      [employeeId]
    );

    return rows[0] || null;
  }

  app.get('/api/employee_profile_mgmt', async (req, res) => {
    const userId = Number(req.query.user_id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureEmployeeDocumentsTable(conn);
      await ensureEncryptedGovernmentIdColumns(conn);

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      let employee = await findEmployeeByUser(conn, users[0]);
      if (!employee && String(users[0].role || '').toLowerCase() === 'employee') {
        employee = await createEmployeeSkeletonForUser(conn, users[0]);
      }

      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found for this account' });
      }

      const [rows] = await conn.execute(
        `SELECT
            e.first_name, e.last_name, e.middle_name, e.nickname, e.gender, e.civil_status, e.birth_date,
            e.street, e.city, e.country, e.zip_code, e.status,
            ec.mobile_no, ec.email,
            ee.date_hired, ee.department, ee.position,
            ea.sss_no, ea.pagibig_no, ea.philhealth_no, ea.tin_no,
            ed.files_201, ed.contracts, ed.certifications
         FROM employees e
         LEFT JOIN employee_contacts ec
           ON ec.contact_id = (
             SELECT c.contact_id
             FROM employee_contacts c
             WHERE c.employee_id = e.employee_id
             ORDER BY c.contact_id DESC
             LIMIT 1
           )
         LEFT JOIN employee_employment ee
           ON ee.employment_id = (
             SELECT em.employment_id
             FROM employee_employment em
             WHERE em.employee_id = e.employee_id
             ORDER BY em.employment_id DESC
             LIMIT 1
           )
         LEFT JOIN employee_accounts ea
           ON ea.account_id = (
             SELECT a.account_id
             FROM employee_accounts a
             WHERE a.employee_id = e.employee_id
             ORDER BY a.account_id DESC
             LIMIT 1
           )
         LEFT JOIN employee_documents ed ON ed.employee_id = e.employee_id
         WHERE e.employee_id = ?
         LIMIT 1`,
        [employee.employee_id]
      );

      const base = rows[0] || {};

      return res.json({
        success: true,
        profile: {
          employee_id: employee.employee_id,
          personal: {
            first_name: base.first_name || '',
            last_name: base.last_name || '',
            middle_name: base.middle_name || '',
            nickname: base.nickname || '',
            gender: base.gender || '',
            civil_status: base.civil_status || '',
            birth_date: base.birth_date || null,
            mobile_no: base.mobile_no || '',
            email: base.email || '',
            street: base.street || '',
            city: base.city || '',
            country: base.country || '',
            zip_code: base.zip_code || ''
          },
          government_ids: {
            sss_no: decryptSensitiveValue(base.sss_no),
            philhealth_no: decryptSensitiveValue(base.philhealth_no),
            pagibig_no: decryptSensitiveValue(base.pagibig_no),
            tin_no: decryptSensitiveValue(base.tin_no)
          },
          employment: {
            date_hired: base.date_hired || null,
            status: base.status || '',
            department: base.department || '',
            designation: base.position || ''
          },
          documents: {
            files_201: base.files_201 || '',
            contracts: base.contracts || '',
            certifications: base.certifications || ''
          }
        }
      });
    } catch (err) {
      console.error('Employee profile edit load error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/employee_profile_mgmt', async (req, res) => {
    const body = req.body || {};
    const userId = Number(body.user_id);
    const employeeIdFromBody = Number(body.employee_id);

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }

    const personal = body.personal || {};
    const government = body.government_ids || {};
    const employment = body.employment || {};
    const documents = body.documents || {};

    let conn;
    try {
      conn = await pool.getConnection();
      await ensureEmployeeDocumentsTable(conn);
      await ensureEncryptedGovernmentIdColumns(conn);

      const [users] = await conn.execute(
        'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? LIMIT 1',
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      let employee = null;
      if (employeeIdFromBody) {
        const [rows] = await conn.execute(
          'SELECT employee_id, emp_code, status FROM employees WHERE employee_id = ? LIMIT 1',
          [employeeIdFromBody]
        );
        employee = rows[0] || null;
      }

      if (!employee) {
        employee = await findEmployeeByUser(conn, users[0]);
      }

      if (!employee && String(users[0].role || '').toLowerCase() === 'employee') {
        employee = await createEmployeeSkeletonForUser(conn, users[0]);
      }

      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found for this account' });
      }

      const [currentRows] = await conn.execute(
        'SELECT first_name, last_name, status FROM employees WHERE employee_id = ? LIMIT 1',
        [employee.employee_id]
      );
      const current = currentRows[0] || {};

      const nextFirstName = toNullable(personal.first_name) || current.first_name || '';
      const nextLastName = toNullable(personal.last_name) || current.last_name || '';
      const nextStatus = toNullable(employment.status) || current.status || 'Active';
      const updatedFullName = `${String(nextFirstName).trim()} ${String(nextLastName).trim()}`.trim();

      await conn.beginTransaction();

      await conn.execute(
        `UPDATE employees
         SET first_name=?, last_name=?, middle_name=?, nickname=?, gender=?, civil_status=?, birth_date=?,
             street=?, city=?, country=?, zip_code=?, status=?
         WHERE employee_id=?`,
        [
          nextFirstName,
          nextLastName,
          toNullable(personal.middle_name),
          toNullable(personal.nickname),
          toNullable(personal.gender),
          toNullable(personal.civil_status),
          toNullable(personal.birth_date),
          toNullable(personal.street),
          toNullable(personal.city),
          toNullable(personal.country),
          toNullable(personal.zip_code),
          nextStatus,
          employee.employee_id
        ]
      );

      if (updatedFullName) {
        await conn.execute('UPDATE users SET full_name = ? WHERE user_id = ?', [updatedFullName, userId]);
      }

      const [contactRows] = await conn.execute(
        'SELECT contact_id FROM employee_contacts WHERE employee_id = ? ORDER BY contact_id DESC LIMIT 1',
        [employee.employee_id]
      );
      if (contactRows.length) {
        await conn.execute(
          'UPDATE employee_contacts SET mobile_no = ?, email = ? WHERE contact_id = ?',
          [toNullable(personal.mobile_no), toNullable(personal.email), contactRows[0].contact_id]
        );
      } else {
        await conn.execute(
          'INSERT INTO employee_contacts (employee_id, mobile_no, email) VALUES (?, ?, ?)',
          [employee.employee_id, toNullable(personal.mobile_no), toNullable(personal.email)]
        );
      }

      const [employmentRows] = await conn.execute(
        'SELECT employment_id FROM employee_employment WHERE employee_id = ? ORDER BY employment_id DESC LIMIT 1',
        [employee.employee_id]
      );
      if (employmentRows.length) {
        await conn.execute(
          'UPDATE employee_employment SET date_hired = ?, department = ?, position = ? WHERE employment_id = ?',
          [
            toNullable(employment.date_hired),
            toNullable(employment.department),
            toNullable(employment.designation),
            employmentRows[0].employment_id
          ]
        );
      } else {
        await conn.execute(
          'INSERT INTO employee_employment (employee_id, date_hired, department, position) VALUES (?, ?, ?, ?)',
          [
            employee.employee_id,
            toNullable(employment.date_hired),
            toNullable(employment.department),
            toNullable(employment.designation)
          ]
        );
      }

      const encryptedSss = encryptSensitiveValue(government.sss_no);
      const encryptedPagibig = encryptSensitiveValue(government.pagibig_no);
      const encryptedPhilhealth = encryptSensitiveValue(government.philhealth_no);
      const encryptedTin = encryptSensitiveValue(government.tin_no);

      const [accountRows] = await conn.execute(
        'SELECT account_id FROM employee_accounts WHERE employee_id = ? ORDER BY account_id DESC LIMIT 1',
        [employee.employee_id]
      );
      if (accountRows.length) {
        await conn.execute(
          'UPDATE employee_accounts SET sss_no = ?, pagibig_no = ?, philhealth_no = ?, tin_no = ? WHERE account_id = ?',
          [encryptedSss, encryptedPagibig, encryptedPhilhealth, encryptedTin, accountRows[0].account_id]
        );
      } else {
        await conn.execute(
          'INSERT INTO employee_accounts (employee_id, sss_no, pagibig_no, philhealth_no, tin_no) VALUES (?, ?, ?, ?, ?)',
          [employee.employee_id, encryptedSss, encryptedPagibig, encryptedPhilhealth, encryptedTin]
        );
      }

      await conn.execute(
        `INSERT INTO employee_documents (employee_id, files_201, contracts, certifications)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           files_201=VALUES(files_201),
           contracts=VALUES(contracts),
           certifications=VALUES(certifications)`,
        [
          employee.employee_id,
          toNullable(documents.files_201),
          toNullable(documents.contracts),
          toNullable(documents.certifications)
        ]
      );

      await conn.commit();

      return res.json({
        success: true,
        message: 'Profile updated successfully. Employee Dashboard and Employee File reflect latest information.'
      });
    } catch (err) {
      if (conn) {
        await conn.rollback().catch(() => {});
      }
      console.error('Employee profile edit save error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error while saving profile' });
    } finally {
      if (conn) conn.release();
    }
  });
};
