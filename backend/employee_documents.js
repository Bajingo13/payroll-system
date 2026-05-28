const fs = require('fs');
const path = require('path');

const uploadRoot = path.join(__dirname, '..', 'uploads', 'employee_documents');
const manifestPath = path.join(uploadRoot, 'manifest.json');

function ensureStorage() {
  fs.mkdirSync(uploadRoot, { recursive: true });
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, '[]', 'utf8');
  }
}

function readManifest() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
}

function writeManifest(rows) {
  ensureStorage();
  fs.writeFileSync(manifestPath, JSON.stringify(rows, null, 2), 'utf8');
}

function safeName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

module.exports = function registerEmployeeDocumentRoutes(app) {
  ensureStorage();

  app.get('/api/employee_documents', (req, res) => {
    const employeeId = String(req.query.employee_id || '').trim().toLowerCase();
    const rows = readManifest();
    const filtered = employeeId
      ? rows.filter((row) => String(row.employee_id || '').toLowerCase() === employeeId)
      : rows;

    res.json({ success: true, documents: filtered });
  });

  app.post('/api/employee_documents', (req, res) => {
    try {
      const {
        employee_id,
        document_name,
        document_type,
        status,
        expiry_date,
        file_name,
        file_data
      } = req.body || {};

      if (!employee_id || !document_name || !file_name || !file_data) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID, document name, and file are required.'
        });
      }

      const employeeFolder = safeName(employee_id);
      const targetDir = path.join(uploadRoot, employeeFolder);
      fs.mkdirSync(targetDir, { recursive: true });

      const base64 = String(file_data).includes(',')
        ? String(file_data).split(',').pop()
        : String(file_data);
      const storedName = `${Date.now()}-${safeName(file_name)}`;
      const storedPath = path.join(targetDir, storedName);
      fs.writeFileSync(storedPath, Buffer.from(base64, 'base64'));

      const rows = readManifest();
      const record = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        employee_id: String(employee_id).trim(),
        document_name: String(document_name).trim(),
        document_type: String(document_type || '201 File').trim(),
        status: String(status || 'Pending').trim(),
        expiry_date: expiry_date || '',
        file_name: String(file_name).trim(),
        stored_name: storedName,
        file_url: `/api/employee_documents/${encodeURIComponent(employeeFolder)}/${encodeURIComponent(storedName)}`,
        uploaded_at: new Date().toISOString()
      };
      rows.unshift(record);
      writeManifest(rows);

      res.json({ success: true, document: record });
    } catch (err) {
      console.error('EMPLOYEE DOCUMENT UPLOAD ERROR:', err);
      res.status(500).json({ success: false, message: err.message || 'Unable to upload document.' });
    }
  });

  app.get('/api/employee_documents/:employeeFolder/:storedName', (req, res) => {
    const employeeFolder = safeName(req.params.employeeFolder);
    const storedName = safeName(req.params.storedName);
    const filePath = path.join(uploadRoot, employeeFolder, storedName);

    if (!filePath.startsWith(uploadRoot) || !fs.existsSync(filePath)) {
      return res.status(404).send('File not found.');
    }

    res.sendFile(filePath);
  });
};
