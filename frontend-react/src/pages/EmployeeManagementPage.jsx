import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const SORT_OPTIONS = ['ID', 'Name', 'Company', 'Department', 'Position', 'Status'];
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function escapeCsv(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 'present';
  if (value === 'terminated') return 'terminated';
  if (value === 'end of contract' || value === 'resigned') return 'rest';
  return 'rest';
}

export default function EmployeeManagementPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    inactiveEmployees: 0,
    newHires: 0
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [entries, setEntries] = useState(10);
  const [sortBy, setSortBy] = useState('ID');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [selectedEmpCode, setSelectedEmpCode] = useState('');
  const [detailForm, setDetailForm] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);

  async function loadSummary() {
    const { data } = await api.get('/employee_summary');
    setSummary({
      totalEmployees: Number(data.totalEmployees || 0),
      activeEmployees: Number(data.activeEmployees || 0),
      inactiveEmployees: Number(data.inactiveEmployees || 0),
      newHires: Number(data.newHires || 0)
    });
  }

  async function loadEmployeeList() {
    setLoading(true);
    setMessage('');

    try {
      const { data } = await api.get('/employee_list', {
        params: {
          limit: entries,
          page,
          sortBy
        }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to load employee list.');
      }

      setEmployees(Array.isArray(data.employees) ? data.employees : []);
      setTotalEmployees(Number(data.totalEmployees || 0));
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (err) {
      setEmployees([]);
      setMessage(getApiMessage(err, 'Unable to load employee list.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary().catch((err) => setMessage(getApiMessage(err, 'Unable to load employee summary.')));
  }, []);

  useEffect(() => {
    loadEmployeeList().catch((err) => setMessage(getApiMessage(err, 'Unable to load employee list.')));
  }, [entries, page, sortBy]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((employee) => {
      const text = [
        employee.emp_code,
        employee.full_name,
        employee.company,
        employee.department,
        employee.position,
        employee.email,
        employee.mobile_no,
        employee.status
      ].join(' ').toLowerCase();
      return text.includes(term);
    });
  }, [employees, search]);

  const showingStart = totalEmployees === 0 ? 0 : (page - 1) * entries + 1;
  const showingEnd = Math.min(page * entries, totalEmployees);

  async function handleDeleteEmployee(empCode) {
    if (!empCode) return;

    const confirmDelete = window.confirm(`Delete employee ${empCode}? This cannot be undone.`);
    if (!confirmDelete) return;

    setMessage('Deleting employee...');

    try {
      const { data } = await api.delete(`/employee/${encodeURIComponent(empCode)}`, {
        data: {
          user_id: user?.user_id,
          admin_name: user?.full_name
        }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to delete employee.');
      }

      setMessage(data.message || 'Employee deleted successfully.');

      const isLastItemOnPage = employees.length <= 1 && page > 1;
      if (isLastItemOnPage) {
        setPage((current) => current - 1);
      } else {
        await Promise.all([loadSummary(), loadEmployeeList()]);
      }
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to delete employee.'));
    }
  }

  async function loadEmployeeDetails(empCode) {
    if (!empCode) return;

    setDetailLoading(true);
    setMessage('Loading employee details...');

    try {
      const { data } = await api.get(`/employee/${encodeURIComponent(empCode)}`);
      if (!data.success || !data.employee) {
        throw new Error(data.message || 'Unable to load employee details.');
      }

      setSelectedEmpCode(empCode);
      setDetailForm(data.employee);
      setDetailModalOpen(true);
      setMessage('Employee details loaded.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load employee details.'));
    } finally {
      setDetailLoading(false);
    }
  }

  function updateDetailField(field, value) {
    setDetailForm((current) => ({ ...current, [field]: value }));
  }

  async function saveEmployeeDetails() {
    if (!selectedEmpCode || !detailForm) {
      setMessage('Select an employee first.');
      return;
    }

    setDetailSaving(true);
    setMessage('Saving employee details...');

    try {
      const payload = {
        ...detailForm,
        dependents: Array.isArray(detailForm.dependents) ? detailForm.dependents : [],
        taxInsurance: detailForm.taxInsurance || {},
        user_id: user?.user_id,
        admin_name: user?.full_name
      };

      const { data } = await api.put(`/employee/update/${encodeURIComponent(selectedEmpCode)}`, payload);
      if (!data.success) {
        throw new Error(data.message || 'Unable to save employee details.');
      }

      const updatedEmpCode = detailForm.emp_code || selectedEmpCode;
      setSelectedEmpCode(updatedEmpCode);
      setMessage(data.message || 'Employee details saved successfully.');
      await Promise.all([loadSummary(), loadEmployeeList()]);
      setDetailModalOpen(false);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save employee details.'));
    } finally {
      setDetailSaving(false);
    }
  }

  function closeDetailModal() {
    if (detailSaving) return;
    setDetailModalOpen(false);
  }

  function exportEmployeeList() {
    if (!filteredEmployees.length) {
      setMessage('No employee rows available to export.');
      return;
    }

    const headers = ['Employee ID', 'Name', 'Company', 'Department', 'Position', 'Email', 'Phone', 'Status'];
    const body = filteredEmployees.map((employee) => [
      employee.emp_code || '',
      employee.full_name || '',
      employee.company || '',
      employee.department || '',
      employee.position || '',
      employee.email || '',
      employee.mobile_no || '',
      employee.status || ''
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employee-list-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage('Employee list exported successfully.');
  }

  return (
    <>
      <header className="header">
        <h2>Employee Management</h2>
        <p>View and manage employee records and details.</p>
      </header>

      <section className="summary">
        <div className="card"><span>Total Employees</span><strong>{summary.totalEmployees}</strong></div>
        <div className="card"><span>Active Employees</span><strong>{summary.activeEmployees}</strong></div>
        <div className="card"><span>Inactive Employees</span><strong>{summary.inactiveEmployees}</strong></div>
        <div className="card"><span>New Hires</span><strong>{summary.newHires}</strong></div>
      </section>

      <section className="table-section">
        <div className="table-header employee-mgmt-header">
          <div>
            <h3>Employee List</h3>
            <p className="muted">Data is sourced from your existing Employee Management APIs.</p>
          </div>
          <div className="toolbar">
            <button type="button" className="btn secondary" onClick={exportEmployeeList}>Export List</button>
            <button
              type="button"
              className="btn"
              onClick={() => window.alert('Detailed add/edit form migration is next. This page now covers summary, listing, sorting, searching, and delete.')}
            >
              + Add New Employee
            </button>
          </div>
        </div>

        <div className="employee-table-controls">
          <label>
            Show
            <select value={entries} onChange={(event) => { setPage(1); setEntries(Number(event.target.value)); }}>
              {PAGE_SIZE_OPTIONS.map((value) => (
                <option value={value} key={value}>{value}</option>
              ))}
            </select>
            entries
          </label>

          <div className="row-actions">
            <label>
              Quick Search
              <select value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); }}>
                {SORT_OPTIONS.map((option) => (
                  <option value={option} key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label>
              Search:
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Type to search..."
              />
            </label>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Company</th>
                <th>Department</th>
                <th>Position</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9">Loading employee records...</td></tr>
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan="9">No employees found.</td></tr>
              ) : filteredEmployees.map((employee) => (
                <tr key={employee.emp_code}>
                  <td>{employee.emp_code}</td>
                  <td>{employee.full_name}</td>
                  <td>{employee.company}</td>
                  <td>{employee.department}</td>
                  <td>{employee.position}</td>
                  <td>{employee.email}</td>
                  <td>{employee.mobile_no}</td>
                  <td><span className={`status ${statusClass(employee.status)}`}>{employee.status || 'N/A'}</span></td>
                  <td>
                    <div className="row-actions centered-actions">
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => loadEmployeeDetails(employee.emp_code)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => handleDeleteEmployee(employee.emp_code)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="employee-table-footer">
          <div className="muted">
            Showing {showingStart} to {showingEnd} of {totalEmployees} entries
          </div>
          <div className="pagination-react">
            <button type="button" className="btn secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="page-chip">{page}</span>
            <button type="button" className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
          </div>
        </div>

        <p className="message">{message}</p>
      </section>

      {detailModalOpen ? (
        <section className="modal-backdrop" onClick={closeDetailModal}>
          <div className="modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="table-header employee-mgmt-header">
              <div>
                <h3>Employee Details Form</h3>
                <p className="muted">Edit selected employee details and save updates.</p>
              </div>
              <div className="toolbar">
                <button type="button" className="btn secondary" onClick={closeDetailModal} disabled={detailSaving}>Close</button>
                <button
                  type="button"
                  className="btn"
                  disabled={!detailForm || detailLoading || detailSaving}
                  onClick={saveEmployeeDetails}
                >
                  {detailSaving ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </div>

            {!detailForm ? (
              <p className="muted">No employee details loaded.</p>
            ) : (
              <div className="employee-form-grid">
                <label>
                  Employee ID
                  <input value={detailForm.emp_code || ''} onChange={(event) => updateDetailField('emp_code', event.target.value)} />
                </label>
                <label>
                  First Name
                  <input value={detailForm.first_name || ''} onChange={(event) => updateDetailField('first_name', event.target.value)} />
                </label>
                <label>
                  Last Name
                  <input value={detailForm.last_name || ''} onChange={(event) => updateDetailField('last_name', event.target.value)} />
                </label>
                <label>
                  Middle Name
                  <input value={detailForm.middle_name || ''} onChange={(event) => updateDetailField('middle_name', event.target.value)} />
                </label>
                <label>
                  Status
                  <input value={detailForm.status || ''} onChange={(event) => updateDetailField('status', event.target.value)} />
                </label>
                <label>
                  Email
                  <input value={detailForm.email || ''} onChange={(event) => updateDetailField('email', event.target.value)} />
                </label>
                <label>
                  Mobile No
                  <input value={detailForm.mobile_no || ''} onChange={(event) => updateDetailField('mobile_no', event.target.value)} />
                </label>
                <label>
                  Company
                  <input value={detailForm.company || ''} onChange={(event) => updateDetailField('company', event.target.value)} />
                </label>
                <label>
                  Department
                  <input value={detailForm.department || ''} onChange={(event) => updateDetailField('department', event.target.value)} />
                </label>
                <label>
                  Position
                  <input value={detailForm.position || ''} onChange={(event) => updateDetailField('position', event.target.value)} />
                </label>
                <label>
                  Employee Type
                  <input value={detailForm.employee_type || ''} onChange={(event) => updateDetailField('employee_type', event.target.value)} />
                </label>
                <label>
                  Salary Type
                  <input value={detailForm.salary_type || ''} onChange={(event) => updateDetailField('salary_type', event.target.value)} />
                </label>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
