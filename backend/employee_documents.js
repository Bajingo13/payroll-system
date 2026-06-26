'use strict';

const cloudStorage = require('./cloud_storage');

// ── Philippine 201 File document catalog ─────────────────────────────────
const CATALOG = [
  {
    key: 'pre_employment', label: 'Pre-Employment', color: '#2563eb',
    docs: [
      { key: 'pds',              name: 'Personal Data Sheet (PDS)',  required: true,  has_expiry: false },
      { key: 'nbi_clearance',    name: 'NBI Clearance',              required: true,  has_expiry: true  },
      { key: 'police_clearance', name: 'Police Clearance',           required: true,  has_expiry: true  },
      { key: 'medical_cert',     name: 'Medical Certificate',        required: true,  has_expiry: true  },
      { key: 'drug_test',        name: 'Drug Test Result',           required: true,  has_expiry: true  },
    ],
  },
  {
    key: 'personal_records', label: 'Personal Records', color: '#16a34a',
    docs: [
      { key: 'birth_cert', name: 'PSA Birth Certificate',  required: true, has_expiry: false },
      { key: 'sss',        name: 'SSS ID / E1 Form',       required: true, has_expiry: false },
      { key: 'philhealth', name: 'PhilHealth ID / MDR',    required: true, has_expiry: false },
      { key: 'pagibig',    name: 'Pag-IBIG MID Card',      required: true, has_expiry: false },
      { key: 'tin',        name: 'TIN / BIR Form 1902',    required: true, has_expiry: false },
    ],
  },
  {
    key: 'employment', label: 'Employment', color: '#d97706',
    docs: [
      { key: 'contract',  name: 'Employment Contract',            required: true, has_expiry: false },
      { key: 'job_offer', name: 'Job Offer / Appointment Letter', required: true, has_expiry: false },
    ],
  },
  {
    key: 'during_employment', label: 'During Employment', color: '#7c3aed',
    docs: [
      { key: 'perf_eval', name: 'Performance Evaluation', required: false, has_expiry: false },
      { key: 'training',  name: 'Training Certificate',   required: false, has_expiry: false },
      { key: 'memo',      name: 'Memo / Incident Report', required: false, has_expiry: false },
    ],
  },
  {
    key: 'separation', label: 'Separation', color: '#dc2626',
    docs: [
      { key: 'resignation', name: 'Resignation Letter',        required: false, has_expiry: false },
      { key: 'clearance',   name: 'Employee Clearance',        required: false, has_expiry: false },
      { key: 'coe',         name: 'Certificate of Employment', required: false, has_expiry: false },
    ],
  },
];

const MIME_MAP = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

function cloudRefFromFileUrl(fileUrl) {
  const text = String(fileUrl || '').trim();
  try {
    const parsed = new URL(text, 'http://local.invalid');
    const ref = parsed.searchParams.get('ref');
    if (ref) return ref;
  } catch {}
  const marker = '/api/cloud-file/';
  const markerIndex = text.indexOf(marker);
  if (markerIndex >= 0) {
    return decodeURIComponent(text.slice(markerIndex + marker.length));
  }
  return cloudStorage.isCloudRef(text) ? text : null;
}

// ── Status computation ────────────────────────────────────────────────────
function computeStatus(record) {
  if (!record) return 'Missing';
  if (!record.expiry_date) return 'Active';
  const expiry = new Date(`${String(record.expiry_date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return 'Active';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((expiry - today) / 86400000);
  if (daysLeft < 0)  return 'Expired';
  if (daysLeft <= 30) return 'Expiring';
  return 'Active';
}

// ── Build grouped response from DB rows ───────────────────────────────────
function buildResponse(rows, employeeId) {
  // Latest upload per category+doc_key slot
  const uploaded = {};
  for (const r of rows) {
    if (r.category && r.doc_key) {
      const slot = `${r.category}:${r.doc_key}`;
      if (!uploaded[slot] || String(r.uploaded_at) > String(uploaded[slot].uploaded_at)) {
        uploaded[slot] = r;
      }
    }
  }

  let totalRequired  = 0;
  let totalSubmitted = 0;

  const categories = CATALOG.map((cat) => {
    let catRequired  = 0;
    let catSubmitted = 0;

    const documents = cat.docs.map((doc) => {
      const slot   = `${cat.key}:${doc.key}`;
      const record = uploaded[slot] || null;
      const status = computeStatus(record);

      if (doc.required) {
        catRequired++;
        totalRequired++;
        if (record && status !== 'Expired') { catSubmitted++; totalSubmitted++; }
      }

      return {
        key:        doc.key,
        name:       doc.name,
        required:   doc.required,
        has_expiry: doc.has_expiry,
        status,
        uploaded: record ? {
          id:          record.id,
          file_name:   record.file_name,
          file_url:    record.file_url,
          expiry_date: record.expiry_date ? String(record.expiry_date).slice(0, 10) : null,
          uploaded_at: record.uploaded_at,
        } : null,
      };
    });

    return {
      key:             cat.key,
      label:           cat.label,
      color:           cat.color,
      documents,
      required_count:  catRequired,
      submitted_count: catSubmitted,
    };
  });

  return {
    categories,
    overall: {
      required_count:  totalRequired,
      submitted_count: totalSubmitted,
      completeness:    totalRequired > 0 ? Math.round((totalSubmitted / totalRequired) * 100) : 0,
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────
module.exports = function registerEmployeeDocumentRoutes(app, pool) {

  // Auto-create table on startup
  pool.getConnection()
    .then((conn) => conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_201_files (
        id           VARCHAR(64)  NOT NULL,
        employee_id  INT          NOT NULL,
        category     VARCHAR(50)  NOT NULL DEFAULT '',
        doc_key      VARCHAR(50)  NOT NULL DEFAULT '',
        document_name VARCHAR(255) NOT NULL DEFAULT '',
        expiry_date  DATE         NULL,
        file_name    VARCHAR(255) NOT NULL DEFAULT '',
        file_url     VARCHAR(500) NOT NULL DEFAULT '',
        uploaded_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        file_data    LONGTEXT     NOT NULL,
        PRIMARY KEY (id),
        KEY idx_201_employee (employee_id),
        CONSTRAINT fk_201files_employee
          FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => conn.release()).catch((err) => { conn.release(); throw err; }))
    .catch((err) => console.error('employee_201_files table error:', err.message));

  // ── GET /api/employee_documents/catalog ──────────────────────────────
  app.get('/api/employee_documents/catalog', (_req, res) => {
    res.json({ success: true, catalog: CATALOG });
  });

  // ── GET /api/employee_documents/file/:id  (serve file from DB) ───────
  app.get('/api/employee_documents/file/:id', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute(
        'SELECT file_name, file_url, file_data FROM employee_201_files WHERE id = ? LIMIT 1',
        [String(req.params.id || '').trim()]
      );
      if (!rows.length) return res.status(404).send('File not found.');

      const { file_name, file_url, file_data } = rows[0];
      const cloudRef = cloudRefFromFileUrl(file_url);
      if (cloudRef) {
        return await cloudStorage.sendObjectToResponse(cloudRef, res, file_name);
      }

      const ext    = String(file_name || '').split('.').pop().toLowerCase();
      const mime   = MIME_MAP[ext] || 'application/octet-stream';
      const buffer = Buffer.from(String(file_data), 'base64');

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${file_name}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      console.error('FILE SERVE ERROR:', err);
      res.status(500).send('Error serving file.');
    } finally {
      if (conn) conn.release();
    }
  });

  // ── GET /api/employee_documents?employee_id=X ────────────────────────
  app.get('/api/employee_documents', async (req, res) => {
    const employeeId = String(req.query.employee_id || '').trim();
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'employee_id is required.' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute(
        `SELECT id, employee_id, category, doc_key, document_name,
                expiry_date, file_name, file_url, uploaded_at
         FROM employee_201_files
         WHERE employee_id = ?
         ORDER BY uploaded_at DESC`,
        [employeeId]
      );
      const { categories, overall } = buildResponse(rows, employeeId);
      res.json({ success: true, categories, overall });
    } catch (err) {
      console.error('DOCUMENT LIST ERROR:', err);
      res.status(500).json({ success: false, message: err.message || 'Unable to load documents.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── POST /api/employee_documents  (upload) ───────────────────────────
  app.post('/api/employee_documents', async (req, res) => {
    const {
      employee_id, category, doc_key, document_name,
      expiry_date, file_name, file_data,
    } = req.body || {};

    if (!employee_id || !file_name || !file_data) {
      return res.status(400).json({
        success: false,
        message: 'employee_id, file_name, and file_data are required.',
      });
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const id     = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const base64 = String(file_data).includes(',')
        ? String(file_data).split(',').pop()
        : String(file_data);
      const buffer = Buffer.from(base64, 'base64');
      let fileUrl = `/api/employee_documents/file/${id}`;
      let storedData = base64;

      if (cloudStorage.isConfigured()) {
        const key = cloudStorage.buildObjectKey(
          `employee-documents/${String(employee_id).trim()}`,
          `${id}-${cloudStorage.safeName(file_name)}`
        );
        const ext = String(file_name || '').split('.').pop().toLowerCase();
        const contentType = MIME_MAP[ext] || 'application/octet-stream';
        const cloudRef = await cloudStorage.uploadBuffer({ key, buffer, contentType });
        fileUrl = `/api/cloud-file?ref=${encodeURIComponent(cloudRef)}`;
        storedData = '';
      }

      await conn.execute(
        `INSERT INTO employee_201_files
           (id, employee_id, category, doc_key, document_name,
            expiry_date, file_name, file_url, uploaded_at, file_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          id,
          String(employee_id).trim(),
          String(category    || '').trim(),
          String(doc_key     || '').trim(),
          String(document_name || file_name).trim(),
          expiry_date || null,
          String(file_name).trim(),
          fileUrl,
          storedData,
        ]
      );

      res.json({
        success: true,
        document: {
          id,
          employee_id:   String(employee_id).trim(),
          category:      String(category    || '').trim(),
          doc_key:       String(doc_key     || '').trim(),
          document_name: String(document_name || file_name).trim(),
          expiry_date:   expiry_date || null,
          file_name:     String(file_name).trim(),
          file_url:      fileUrl,
          uploaded_at:   new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('DOCUMENT UPLOAD ERROR:', err);
      res.status(500).json({ success: false, message: err.message || 'Unable to upload document.' });
    } finally {
      if (conn) conn.release();
    }
  });

  // ── DELETE /api/employee_documents/:id ───────────────────────────────
  app.delete('/api/employee_documents/:id', async (req, res) => {
    const id = String(req.params.id || '').trim();
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute(
        'SELECT file_url FROM employee_201_files WHERE id = ? LIMIT 1',
        [id]
      );
      const cloudRef = rows[0] ? cloudRefFromFileUrl(rows[0].file_url) : null;

      const [result] = await conn.execute(
        'DELETE FROM employee_201_files WHERE id = ?',
        [id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Document not found.' });
      }
      if (cloudRef) await cloudStorage.deleteObject(cloudRef);
      res.json({ success: true, message: 'Document deleted.' });
    } catch (err) {
      console.error('DOCUMENT DELETE ERROR:', err);
      res.status(500).json({ success: false, message: err.message || 'Unable to delete document.' });
    } finally {
      if (conn) conn.release();
    }
  });
};
