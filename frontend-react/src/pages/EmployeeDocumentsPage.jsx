import { useEffect, useState } from 'react';
import { api, getApiMessage, getAssetUrl } from '../api/client.js';
import AppIcon from '../components/AppIcon.jsx';

const STATUS_CFG = {
  Active:   { label: 'Active',        cls: 'approved' },
  Missing:  { label: 'Missing',       cls: 'rest'     },
  Expiring: { label: 'Expiring Soon', cls: 'pending'  },
  Expired:  { label: 'Expired',       cls: 'rejected' },
};

function formatDate(str) {
  if (!str) return '';
  const d = new Date(`${str}T00:00:00`);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatUploadedAt(str) {
  if (!str) return '';
  const d = new Date(String(str).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function completenessColor(pct) {
  if (pct >= 80) return '#16a34a';
  if (pct >= 40) return '#d97706';
  return '#dc2626';
}

function empStatusCls(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'approved';
  if (s === 'terminated') return 'rejected';
  return 'rest';
}

function stripeColor(cls) {
  if (cls === 'approved') return '#16a34a';
  if (cls === 'pending')  return '#d97706';
  if (cls === 'rejected') return '#dc2626';
  return '#94a3b8';
}

export default function EmployeeDocumentsPage() {
  const [view, setView] = useState('list');

  // List
  const [employees, setEmployees]   = useState([]);
  const [searchQ,   setSearchQ]     = useState('');
  const [loadingList, setLoadingList] = useState(false);

  // Detail
  const [selectedEmp,  setSelectedEmp]  = useState(null);
  const [categories,   setCategories]   = useState([]);
  const [overall,      setOverall]      = useState({ required_count: 0, submitted_count: 0, completeness: 0 });
  const [activeCat,    setActiveCat]    = useState('');
  const [loadingDocs,  setLoadingDocs]  = useState(false);

  // Upload modal: null | { doc, catKey, catColor, catLabel, inputKey }
  const [uploadModal,  setUploadModal]  = useState(null);
  const [uploadFile,   setUploadFile]   = useState(null); // { name, base64 }
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState('');

  // Delete modal: null | { id, name }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  const [message, setMessage] = useState('');

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    setLoadingList(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.employees || []);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load employees.'));
    } finally {
      setLoadingList(false);
    }
  }

  async function openEmployee(emp) {
    setSelectedEmp(emp);
    setMessage('');
    setView('detail');
    setActiveCat('');
    setLoadingDocs(true);
    try {
      const { data } = await api.get('/employee_documents', { params: { employee_id: emp.employee_id } });
      const cats = data.categories || [];
      setCategories(cats);
      setOverall(data.overall || { required_count: 0, submitted_count: 0, completeness: 0 });
      if (cats.length) setActiveCat(cats[0].key);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load documents.'));
    } finally {
      setLoadingDocs(false);
    }
  }

  function goBack() {
    setView('list');
    setSelectedEmp(null);
    setCategories([]);
    setOverall({ required_count: 0, submitted_count: 0, completeness: 0 });
    setMessage('');
  }

  async function reloadDocs() {
    if (!selectedEmp) return;
    setLoadingDocs(true);
    try {
      const { data } = await api.get('/employee_documents', { params: { employee_id: selectedEmp.employee_id } });
      setCategories(data.categories || []);
      setOverall(data.overall || { required_count: 0, submitted_count: 0, completeness: 0 });
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to refresh documents.'));
    } finally {
      setLoadingDocs(false);
    }
  }

  function openUpload(doc, catKey, catColor, catLabel) {
    setUploadModal({ doc, catKey, catColor, catLabel, inputKey: Date.now() });
    setUploadFile(null);
    setUploadExpiry('');
    setUploadError('');
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setUploadFile({ name: file.name, base64: ev.target.result });
    reader.readAsDataURL(file);
  }

  async function doUpload() {
    if (!uploadFile || !uploadModal || !selectedEmp) return;
    if (uploadModal.doc.has_expiry && !uploadExpiry) {
      setUploadError('Please enter the expiry date for this document.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      await api.post('/employee_documents', {
        employee_id:   selectedEmp.employee_id,
        category:      uploadModal.catKey,
        doc_key:       uploadModal.doc.key,
        document_name: uploadModal.doc.name,
        expiry_date:   uploadExpiry || null,
        file_name:     uploadFile.name,
        file_data:     uploadFile.base64,
      });
      const docName = uploadModal.doc.name;
      setUploadModal(null);
      setMessage(`"${docName}" uploaded successfully.`);
      await reloadDocs();
    } catch (err) {
      setUploadError(getApiMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !selectedEmp) return;
    setDeleting(true);
    const name = deleteTarget.name;
    const id   = deleteTarget.id;
    try {
      await api.delete(`/employee_documents/${id}`);
      setDeleteTarget(null);
      setMessage(`"${name}" deleted.`);
      await reloadDocs();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to delete document.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQ.toLowerCase();
    if (!q) return true;
    return (
      `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(q) ||
      String(emp.emp_code    || '').toLowerCase().includes(q) ||
      String(emp.department  || '').toLowerCase().includes(q) ||
      String(emp.position    || '').toLowerCase().includes(q)
    );
  });

  const activeCategory = categories.find((c) => c.key === activeCat);
  const pct   = overall.completeness || 0;
  const color = completenessColor(pct);

  // ── DETAIL VIEW ───────────────────────────────────────────────────────────
  if (view === 'detail' && selectedEmp) {
    return (
      <>
        <header className="header" style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 4, background: '#64748b', flexShrink: 0 }}
            onClick={goBack}
          >
            ← Back
          </button>
          <div>
            <h2 style={{ margin: 0 }}>
              {selectedEmp.first_name} {selectedEmp.last_name}
              {selectedEmp.emp_code && (
                <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b', marginLeft: 10 }}>
                  #{selectedEmp.emp_code}
                </span>
              )}
            </h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
              {[selectedEmp.position, selectedEmp.department].filter(Boolean).join(' · ') || '201 File Documents'}
            </p>
          </div>
        </header>

        {/* Completeness bar */}
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Document Completeness</span>
            <span style={{ fontWeight: 800, fontSize: 18, color }}>
              {pct}%
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
                ({overall.submitted_count || 0} / {overall.required_count || 0} required)
              </span>
            </span>
          </div>
          <div style={{ height: 10, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: color,
              borderRadius: 99,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {categories.map((cat) => {
            const isActive = cat.key === activeCat;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCat(cat.key)}
                style={{
                  flexShrink: 0,
                  padding: '7px 14px',
                  borderRadius: 99,
                  border: `2px solid ${isActive ? cat.color : '#e2e8f0'}`,
                  background: isActive ? cat.color : '#fff',
                  color: isActive ? '#fff' : '#334155',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                {cat.label}
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                  color: isActive ? '#fff' : '#64748b',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 7px',
                }}>
                  {cat.submitted_count}/{cat.required_count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Document cards */}
        <section className="table-section">
          {loadingDocs ? (
            <p className="message">Loading documents...</p>
          ) : activeCategory ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {activeCategory.documents.map((doc) => {
                const cfg      = STATUS_CFG[doc.status] || STATUS_CFG.Missing;
                const uploaded = doc.uploaded;
                return (
                  <div
                    key={doc.key}
                    style={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                      boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
                    }}
                  >
                    {/* Status stripe */}
                    <div style={{
                      width: 4,
                      borderRadius: 99,
                      alignSelf: 'stretch',
                      background: stripeColor(cfg.cls),
                      flexShrink: 0,
                      minHeight: 40,
                    }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{doc.name}</span>
                        {doc.required && (
                          <span style={{ fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', borderRadius: 99, padding: '1px 8px' }}>
                            Required
                          </span>
                        )}
                        {doc.has_expiry && (
                          <span style={{ fontSize: 11, fontWeight: 700, background: '#f5f3ff', color: '#7c3aed', borderRadius: 99, padding: '1px 8px' }}>
                            Has Expiry
                          </span>
                        )}
                        <span className={`status ${cfg.cls}`} style={{ marginLeft: 'auto' }}>
                          {cfg.label}
                        </span>
                      </div>

                      {uploaded ? (
                        <>
                          <div style={{ fontSize: 13, color: '#475569' }}>
                            <AppIcon name="document" size={13} /> {uploaded.file_name}
                            <span style={{ color: '#94a3b8', marginLeft: 8 }}>
                              · Uploaded {formatUploadedAt(uploaded.uploaded_at)}
                            </span>
                          </div>
                          {uploaded.expiry_date && (
                            <div style={{
                              fontSize: 12,
                              marginTop: 2,
                              color: doc.status === 'Expired'  ? '#dc2626'
                                   : doc.status === 'Expiring' ? '#d97706'
                                   : '#64748b',
                            }}>
                              Expires: {formatDate(uploaded.expiry_date)}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            <a
                              href={getAssetUrl(uploaded.file_url)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn"
                              style={{ fontSize: 12, padding: '5px 12px', textDecoration: 'none' }}
                            >
                              View
                            </a>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: '5px 12px', background: '#64748b' }}
                              onClick={() => openUpload(doc, activeCategory.key, activeCategory.color, activeCategory.label)}
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              className="btn danger"
                              style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={() => setDeleteTarget({ id: uploaded.id, name: doc.name })}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            padding: '5px 14px',
                            background: activeCategory.color,
                            opacity: 0.92,
                          }}
                          onClick={() => openUpload(doc, activeCategory.key, activeCategory.color, activeCategory.label)}
                        >
                          + Upload Document
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="message">Select a category tab to view documents.</p>
          )}

          {message && <p className="message" style={{ marginTop: 12 }}>{message}</p>}
        </section>

        {/* ── Upload Modal ── */}
        {uploadModal && (
          <div className="reject-modal-overlay" onClick={() => setUploadModal(null)}>
            <div
              className="reject-modal"
              style={{ maxWidth: 460 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="reject-modal-title">Upload Document</h3>
              <p className="reject-modal-desc">
                <strong>{uploadModal.doc.name}</strong>
                <br />
                Category: {uploadModal.catLabel}
                {uploadModal.doc.required && ' · Required'}
              </p>

              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  Select File&nbsp;<span style={{ color: '#dc2626' }}>*</span>
                  <input
                    key={uploadModal.inputKey}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    style={{ padding: '6px 8px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1' }}
                    onChange={onFileChange}
                  />
                </label>

                {uploadFile && (
                  <p style={{ margin: 0, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                    {uploadFile.name}
                  </p>
                )}

                {uploadModal.doc.has_expiry && (
                  <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                    Expiry Date&nbsp;<span style={{ color: '#dc2626' }}>*</span>
                    <input
                      type="date"
                      value={uploadExpiry}
                      onChange={(e) => setUploadExpiry(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: 13 }}
                    />
                  </label>
                )}

                {uploadError && (
                  <p style={{ margin: 0, color: '#dc2626', fontSize: 13 }}>{uploadError}</p>
                )}
              </div>

              <div className="reject-modal-actions">
                <button
                  type="button"
                  className="btn"
                  style={{ background: '#64748b' }}
                  onClick={() => setUploadModal(null)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={doUpload}
                  disabled={!uploadFile || uploading}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Modal ── */}
        {deleteTarget && (
          <div className="reject-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
            <div
              className="reject-modal"
              style={{ maxWidth: 420 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="reject-modal-title">Delete Document</h3>
              <p className="reject-modal-desc">
                Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>?
                This cannot be undone.
              </p>
              <div className="reject-modal-actions">
                <button
                  type="button"
                  className="btn"
                  style={{ background: '#64748b' }}
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <>
      <header className="header">
        <h2>201 Files</h2>
        <p>
          Manage Philippine government-required employee document records — Pre-Employment
          clearances, Government IDs, Employment contracts, and more.
        </p>
      </header>

      <section className="summary">
        <div className="card">
          <span>Total Employees</span>
          <strong>{employees.length}</strong>
        </div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <h3>Select Employee</h3>
            <p>Click an employee to view and manage their 201 file documents.</p>
          </div>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search by name, ID, department…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              style={{ minWidth: 240 }}
              aria-label="Search employees"
            />
          </div>
        </div>

        {loadingList ? (
          <p className="message">Loading employees…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Position</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.employee_id}>
                  <td style={{ color: '#64748b', fontSize: 13 }}>
                    {emp.emp_code || `#${emp.employee_id}`}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {emp.first_name} {emp.last_name}
                  </td>
                  <td>{emp.department || '—'}</td>
                  <td>{emp.position   || '—'}</td>
                  <td>
                    <span className={`status ${empStatusCls(emp.status)}`}>
                      {emp.status || 'Active'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: 12, padding: '5px 14px' }}
                      onClick={() => openEmployee(emp)}
                    >
                      View 201 File →
                    </button>
                  </td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ textAlign: 'center', color: '#94a3b8', padding: '28px 0' }}
                  >
                    {searchQ ? 'No employees match your search.' : 'No employees found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {message && <p className="message">{message}</p>}
      </section>
    </>
  );
}
