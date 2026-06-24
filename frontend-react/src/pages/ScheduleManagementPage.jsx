import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';

const DAYS = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
];

const STATUS_OPTIONS = ['all', 'active', 'hold', 'resigned', 'terminated', 'end of contract'];

const MAIN_TABS = [
  { key: 'templates', label: 'Shift Templates' },
  { key: 'assign',    label: 'Bulk Assign'     },
  { key: 'settings',  label: 'Employee Settings' },
];

function toStr(v, fallback = '') {
  if (v === null || v === undefined) return fallback;
  return String(v);
}
function toNum(v, fallback = '') {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function parseDays(str) {
  return new Set(String(str || '1,2,3,4,5').split(',').map(s => s.trim()).filter(Boolean));
}
function serializeDays(set) {
  return DAYS.map(d => d.value).filter(v => set.has(v)).join(',');
}

function emptyTemplate() {
  return {
    name: '', description: '',
    time_in: '08:00', time_out: '17:00', break_minutes: '60',
    hours_in_day: '8', days_in_week: '5',
    working_days: new Set(['1','2','3','4','5']),
    night_diff: false, night_diff_start: '22:00', night_diff_end: '06:00', night_diff_rate: '10',
  };
}

function emptyForm() {
  return {
    payroll_period: '', payroll_rate: '', main_computation: '',
    days_in_year: '', days_in_week: '', hours_in_day: '', week_in_year: '',
    strict_no_overtime: false,
    ot_rate: '', days_in_year_ot: '', rate_basis_ot: '',
    basis_absences: '', basis_overtime: '',
    time_in: '08:00', time_out: '17:00', break_minutes: '60',
    working_days: new Set(['1','2','3','4','5']),
    schedule_template_id: '',
  };
}

// ── Working-days checkbox strip ───────────────────────────────────────────────
function DayPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {DAYS.map(d => (
        <label
          key={d.value}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '0.15rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
            color: value.has(d.value) ? 'var(--primary,#2563eb)' : 'var(--muted,#6b7280)',
          }}
        >
          <input
            type="checkbox"
            checked={value.has(d.value)}
            onChange={e => {
              const next = new Set(value);
              if (e.target.checked) next.add(d.value); else next.delete(d.value);
              onChange(next);
            }}
            style={{ accentColor: 'var(--primary,#2563eb)' }}
          />
          {d.label}
        </label>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function ScheduleManagementPage() {
  const [tab, setTab] = useState('templates');

  return (
    <>
      <header className="header">
        <h2>Schedule Management</h2>
        <p>Manage shift templates, bulk-assign schedules, and configure per-employee payroll settings.</p>
      </header>

      <div className="report-filter-grid" style={{ marginBottom: '1.25rem' }}>
        {MAIN_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`btn${tab === t.key ? '' : ' btn-outline'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'templates' && <ShiftTemplates />}
      {tab === 'assign'    && <BulkAssign />}
      {tab === 'settings'  && <EmployeeSettings />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHIFT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════
function ShiftTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [form,      setForm]      = useState(emptyTemplate());
  const [showForm,  setShowForm]  = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/schedule_templates');
      setTemplates(data.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function openAdd() {
    setForm(emptyTemplate());
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(tpl) {
    setForm({
      name: tpl.name, description: tpl.description || '',
      time_in: tpl.time_in || '08:00', time_out: tpl.time_out || '17:00',
      break_minutes: toNum(tpl.break_minutes, '60'),
      hours_in_day:  toNum(tpl.hours_in_day,  '8'),
      days_in_week:  toNum(tpl.days_in_week,  '5'),
      working_days: parseDays(tpl.working_days),
      night_diff: Boolean(Number(tpl.night_diff)),
      night_diff_start: tpl.night_diff_start || '22:00',
      night_diff_end:   tpl.night_diff_end   || '06:00',
      night_diff_rate:  toNum(Number(tpl.night_diff_rate || 0) * 100, '10'),
    });
    setEditId(tpl.id);
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        working_days: serializeDays(form.working_days),
        night_diff_rate: (Number(form.night_diff_rate) || 10) / 100,
      };

      if (editId) await api.put(`/schedule_templates/${editId}`, payload);
      else        await api.post('/schedule_templates', payload);

      toast.success(editId ? 'Template updated.' : 'Template created.');
      setShowForm(false);
      setEditId(null);
      await load();
    } catch {
      toast.error('Failed to save template.');
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/schedule_templates/${id}`);
      toast.success('Template deleted.');
      await load();
    } catch {
      toast.error('Failed to delete template.');
    }
  }

  const nightLabel = (tpl) =>
    Number(tpl.night_diff) ? `Night diff: ${(Number(tpl.night_diff_rate || 0) * 100).toFixed(0)}%` : 'No night diff';

  return (
    <section className="table-section">
      <div className="table-header">
        <div>
          <h3>Shift Templates</h3>
          <p>Define reusable work schedules that can be assigned to employees.</p>
        </div>
        <button type="button" className="btn" onClick={openAdd}>+ New Template</button>
      </div>

      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border,#e2e8f0)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: '0 0 1rem' }}>{editId ? 'Edit Template' : 'New Template'}</h4>
          <form onSubmit={handleSave}>
            <div className="report-filter-grid">

              <label style={{ gridColumn: 'span 2' }}>
                Template Name *
                <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Regular Day Shift" />
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                Description
                <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional notes" />
              </label>

              <label>
                Time In
                <input type="time" value={form.time_in} onChange={e => set('time_in', e.target.value)} />
              </label>
              <label>
                Time Out
                <input type="time" value={form.time_out} onChange={e => set('time_out', e.target.value)} />
              </label>

              <label>
                Break (minutes)
                <input type="number" min="0" value={form.break_minutes} onChange={e => set('break_minutes', e.target.value)} />
              </label>
              <label>
                Work Hours / Day
                <input type="number" step="0.5" min="0" max="24" value={form.hours_in_day} onChange={e => set('hours_in_day', e.target.value)} />
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                Working Days
                <div style={{ marginTop: '0.4rem' }}>
                  <DayPicker
                    value={form.working_days}
                    onChange={days => {
                      set('working_days', days);
                      set('days_in_week', String(days.size));
                    }}
                  />
                </div>
              </label>

              <label>
                Night Differential
                <select value={form.night_diff ? 'yes' : 'no'} onChange={e => set('night_diff', e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>

              {form.night_diff && (
                <>
                  <label>
                    Night Diff Start
                    <input type="time" value={form.night_diff_start} onChange={e => set('night_diff_start', e.target.value)} />
                  </label>
                  <label>
                    Night Diff End
                    <input type="time" value={form.night_diff_end} onChange={e => set('night_diff_end', e.target.value)} />
                  </label>
                  <label>
                    Night Diff Rate (%)
                    <input type="number" step="0.1" min="0" max="100" value={form.night_diff_rate} onChange={e => set('night_diff_rate', e.target.value)} />
                  </label>
                </>
              )}

              <div className="toolbar" style={{ gridColumn: 'span 2' }}>
                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
                <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create Template'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {loading ? <p className="empty-state">Loading templates…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Hours</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Break</th>
                <th>Working Days</th>
                <th>Night Diff</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted,#6b7280)' }}>No templates yet. Click "+ New Template" to start.</td></tr>
              ) : templates.map(tpl => {
                const days = parseDays(tpl.working_days);
                return (
                  <tr key={tpl.id}>
                    <td><strong>{tpl.name}</strong>{tpl.description && <div style={{ fontSize: '0.78rem', color: 'var(--muted,#6b7280)' }}>{tpl.description}</div>}</td>
                    <td>{tpl.hours_in_day}h</td>
                    <td>{tpl.time_in}</td>
                    <td>{tpl.time_out}</td>
                    <td>{tpl.break_minutes} min</td>
                    <td style={{ fontSize: '0.8rem' }}>{DAYS.filter(d => days.has(d.value)).map(d => d.label).join(', ')}</td>
                    <td>
                      {Number(tpl.night_diff)
                        ? <span className="status pending">{(Number(tpl.night_diff_rate) * 100).toFixed(0)}% ({tpl.night_diff_start}–{tpl.night_diff_end})</span>
                        : <span style={{ color: 'var(--muted,#9ca3af)' }}>—</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }} onClick={() => openEdit(tpl)}>Edit</button>
                        <button type="button" className="btn danger"      style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }} onClick={() => handleDelete(tpl.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK ASSIGN
// ═══════════════════════════════════════════════════════════════════════════════
function BulkAssign() {
  const [templates,  setTemplates]  = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [assigning,  setAssigning]  = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(new Set());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/schedule_templates').then(({ data }) => setTemplates(data.data || [])),
      api.get('/employees').then(({ data }) => setEmployees(data.employees || [])),
    ]).finally(() => setLoading(false));
  }, []);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e => {
      const matchDept = !deptFilter || e.department === deptFilter;
      const matchQ = !q || `${e.first_name} ${e.last_name} ${e.emp_code || ''}`.toLowerCase().includes(q);
      return matchDept && matchQ;
    });
  }, [employees, deptFilter, search]);

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(e => e.employee_id)));
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function handleAssign() {
    if (!templateId) { toast.warning('Select a template first.'); return; }
    if (selected.size === 0) { toast.warning('Select at least one employee.'); return; }
    setAssigning(true);
    try {
      const { data } = await api.post(`/schedule_templates/${templateId}/assign`, {
        employee_ids: [...selected],
      });
      toast.success(data.message || `Template assigned to ${data.updated} employee(s).`);
      setSelected(new Set());
    } catch (err) {
      toast.error(getApiMessage(err, 'Failed to assign template.'));
    } finally { setAssigning(false); }
  }

  const chosenTemplate = templates.find(t => String(t.id) === String(templateId));

  return (
    <section className="table-section">
      <div className="table-header">
        <div>
          <h3>Bulk Assign Schedule</h3>
          <p>Pick a shift template and assign it to one or more employees at once.</p>
        </div>
      </div>

      {/* Template picker */}
      <div className="report-filter-grid" style={{ marginBottom: '1rem' }}>
        <label style={{ gridColumn: 'span 2' }}>
          Shift Template *
          <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">— Select a template —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.hours_in_day}h/day, {t.time_in}–{t.time_out})</option>
            ))}
          </select>
        </label>

        {chosenTemplate && (
          <div style={{ gridColumn: 'span 2', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.65rem 0.9rem', fontSize: '0.85rem' }}>
            <strong>{chosenTemplate.name}</strong>
            {' — '}
            {chosenTemplate.time_in}–{chosenTemplate.time_out}
            {' · '}Break {chosenTemplate.break_minutes} min
            {' · '}
            {DAYS.filter(d => parseDays(chosenTemplate.working_days).has(d.value)).map(d => d.label).join(', ')}
            {Number(chosenTemplate.night_diff) ? ` · Night diff ${(Number(chosenTemplate.night_diff_rate) * 100).toFixed(0)}%` : ''}
          </div>
        )}
      </div>

      {/* Employee filters */}
      <div className="employee-table-controls" style={{ marginBottom: '0.75rem' }}>
        <label>
          Department
          <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setSelected(new Set()); }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>
          Search
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or ID…" />
        </label>
        <div className="toolbar">
          <button type="button" className="btn btn-outline" onClick={toggleAll}>
            {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          <button type="button" className="btn" disabled={assigning || selected.size === 0 || !templateId} onClick={handleAssign}>
            {assigning ? 'Assigning…' : `Assign to ${selected.size} Employee${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {loading ? <p className="empty-state">Loading…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                  />
                </th>
                <th>ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted,#6b7280)' }}>No employees found.</td></tr>
              ) : filtered.map(e => (
                <tr
                  key={e.employee_id}
                  onClick={() => toggle(e.employee_id)}
                  style={{ cursor: 'pointer', background: selected.has(e.employee_id) ? '#eff6ff' : undefined }}
                >
                  <td onClick={ev => ev.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(e.employee_id)} onChange={() => toggle(e.employee_id)} />
                  </td>
                  <td>{e.emp_code || '-'}</td>
                  <td>{e.first_name} {e.last_name}</td>
                  <td>{e.department || '-'}</td>
                  <td><span className={`status ${(e.status || 'active').toLowerCase()}`}>{e.status || 'Active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE SETTINGS (existing per-employee payroll settings, enhanced)
// ═══════════════════════════════════════════════════════════════════════════════
function EmployeeSettings() {
  const [employees,        setEmployees]        = useState([]);
  const [templates,        setTemplates]        = useState([]);
  const [search,           setSearch]           = useState('');
  const [status,           setStatus]           = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [form,             setForm]             = useState(emptyForm());
  const [loadingList,      setLoadingList]      = useState(false);
  const [loadingDetails,   setLoadingDetails]   = useState(false);
  const [saving,           setSaving]           = useState(false);

  async function loadEmployees() {
    setLoadingList(true);
    try {
      const { data } = await api.get('/admin_schedule_management_list', { params: { search: search.trim(), status } });
      if (!data.success) throw new Error(data.message);
      const rows = data.employees || [];
      if (rows.length === 0 && !search.trim() && status === 'all') {
        const fb = await api.get('/employees');
        setEmployees(fb.data?.employees || []);
      } else {
        setEmployees(rows);
      }
    } catch (err) {
      setEmployees([]);
      toast.error(getApiMessage(err, 'Unable to load employees.'));
    } finally { setLoadingList(false); }
  }

  async function loadDetails(employeeId) {
    setLoadingDetails(true);
    try {
      const { data } = await api.get(`/admin_schedule_management/${encodeURIComponent(employeeId)}`);
      if (!data.success) throw new Error(data.message);
      setSelectedEmployee(data.employee || null);
      const s = data.schedule || {};
      setForm({
        payroll_period:       toStr(s.payroll_period),
        payroll_rate:         toStr(s.payroll_rate),
        main_computation:     toStr(s.main_computation),
        days_in_year:         toStr(s.days_in_year),
        days_in_week:         toStr(s.days_in_week),
        hours_in_day:         toStr(s.hours_in_day),
        week_in_year:         toStr(s.week_in_year),
        strict_no_overtime:   Boolean(s.strict_no_overtime),
        ot_rate:              toStr(s.ot_rate),
        days_in_year_ot:      toStr(s.days_in_year_ot),
        rate_basis_ot:        toStr(s.rate_basis_ot),
        basis_absences:       toStr(s.basis_absences),
        basis_overtime:       toStr(s.basis_overtime),
        time_in:              toStr(s.time_in, '08:00'),
        time_out:             toStr(s.time_out, '17:00'),
        break_minutes:        toStr(s.break_minutes, '60'),
        working_days:         parseDays(s.working_days),
        schedule_template_id: toStr(s.schedule_template_id),
      });
    } catch (err) {
      setSelectedEmployee(null);
      setForm(emptyForm());
      toast.error(getApiMessage(err, 'Unable to load schedule settings.'));
    } finally { setLoadingDetails(false); }
  }

  useEffect(() => {
    loadEmployees();
    api.get('/schedule_templates').then(({ data }) => setTemplates(data.data || [])).catch(() => {});
  }, []);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function save() {
    if (!selectedEmployee?.employee_id) { toast.warning('Select an employee first.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        working_days: serializeDays(form.working_days),
      };
      const { data } = await api.put(`/admin_schedule_management/${selectedEmployee.employee_id}`, payload);
      if (!data.success) throw new Error(data.message);
      toast.success('Schedule settings saved.');
      await loadDetails(selectedEmployee.employee_id);
    } catch (err) {
      toast.error(getApiMessage(err, 'Unable to save schedule.'));
    } finally { setSaving(false); }
  }

  // When a template is selected, pre-fill shift-related fields
  function applyTemplate(templateId) {
    set('schedule_template_id', templateId);
    if (!templateId) return;
    const tpl = templates.find(t => String(t.id) === String(templateId));
    if (!tpl) return;
    setForm(f => ({
      ...f,
      schedule_template_id: templateId,
      time_in:      tpl.time_in || '08:00',
      time_out:     tpl.time_out || '17:00',
      break_minutes: String(tpl.break_minutes ?? 60),
      hours_in_day: String(tpl.hours_in_day ?? 8),
      days_in_week: String(tpl.days_in_week ?? 5),
      working_days: parseDays(tpl.working_days),
    }));
  }

  return (
    <section className="schedule-admin-layout">
      {/* ── Left: employee list ── */}
      <section className="table-section">
        <div className="employee-table-controls" style={{ marginBottom: '0.75rem' }}>
          <label>
            Search
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, ID, dept" />
          </label>
          <label>
            Status
            <select value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All' : o}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-outline" onClick={loadEmployees} disabled={loadingList}>
            {loadingList ? 'Loading…' : 'Search'}
          </button>
        </div>

        <div className="table-header" style={{ marginBottom: '0.5rem' }}>
          <div>
            <h3>Employee List</h3>
            <p>{employees.length} employee(s)</p>
          </div>
        </div>

        <div className="table-scroll compact">
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th>Dept</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loadingList
                ? <tr><td colSpan={4}>Loading…</td></tr>
                : employees.length === 0
                  ? <tr><td colSpan={4}>No employees found.</td></tr>
                  : employees.map(e => (
                    <tr
                      key={e.employee_id}
                      className={selectedEmployee?.employee_id === e.employee_id ? 'selected-row' : ''}
                      onClick={() => loadDetails(e.employee_id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{e.emp_code || '-'}</td>
                      <td>{e.full_name || '-'}</td>
                      <td>{e.department || '-'}</td>
                      <td>{e.status || '-'}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Right: settings form ── */}
      <section className="table-section">
        <div className="table-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h3>Schedule Settings</h3>
            <p>{selectedEmployee ? `${selectedEmployee.emp_code} – ${selectedEmployee.full_name}` : 'Select an employee.'}</p>
          </div>
        </div>

        {loadingDetails ? <p className="muted">Loading…</p> : (
          <div className="employee-form-grid">

            {/* Quick-apply template */}
            <label style={{ gridColumn: 'span 2' }}>
              Apply Shift Template
              <select value={form.schedule_template_id} onChange={e => applyTemplate(e.target.value)}>
                <option value="">— None / Manual —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>

            {/* Shift times */}
            <label>
              Time In
              <input type="time" value={form.time_in} onChange={e => set('time_in', e.target.value)} />
            </label>
            <label>
              Time Out
              <input type="time" value={form.time_out} onChange={e => set('time_out', e.target.value)} />
            </label>
            <label>
              Break (minutes)
              <input type="number" min="0" value={form.break_minutes} onChange={e => set('break_minutes', e.target.value)} />
            </label>
            <label>
              Work Hours / Day
              <input type="number" step="0.5" min="0" max="24" value={form.hours_in_day} onChange={e => set('hours_in_day', e.target.value)} />
            </label>

            <label style={{ gridColumn: 'span 2' }}>
              Working Days
              <div style={{ marginTop: '0.4rem' }}>
                <DayPicker
                  value={form.working_days}
                  onChange={days => {
                    set('working_days', days);
                    set('days_in_week', String(days.size));
                  }}
                />
              </div>
            </label>

            {/* Payroll settings */}
            <label>
              Payroll Period
              <select value={form.payroll_period} onChange={e => set('payroll_period', e.target.value)}>
                <option value="">Select period</option>
                <option value="Weekly">Weekly</option>
                <option value="Semi-Monthly">Semi-Monthly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </label>
            <label>
              Payroll Rate Type
              <input value={form.payroll_rate} onChange={e => set('payroll_rate', e.target.value)} placeholder="e.g. Monthly Rate" />
            </label>
            <label>
              Main Computation Divisor
              <input type="number" step="0.01" value={form.main_computation} onChange={e => set('main_computation', e.target.value)} />
            </label>
            <label>
              Days in Year
              <input type="number" value={form.days_in_year} onChange={e => set('days_in_year', e.target.value)} />
            </label>
            <label>
              Days in Week
              <input type="number" min="0" max="7" value={form.days_in_week} onChange={e => set('days_in_week', e.target.value)} readOnly />
            </label>
            <label>
              Weeks in Year
              <input type="number" value={form.week_in_year} onChange={e => set('week_in_year', e.target.value)} />
            </label>

            {/* OT settings */}
            <label>
              OT Rate
              <input value={form.ot_rate} onChange={e => set('ot_rate', e.target.value)} placeholder="e.g. STANDARD OT RATE" />
            </label>
            <label>
              Days in Year (OT)
              <input type="number" value={form.days_in_year_ot} onChange={e => set('days_in_year_ot', e.target.value)} />
            </label>
            <label>
              Rate Basis (OT)
              <input type="number" step="0.01" value={form.rate_basis_ot} onChange={e => set('rate_basis_ot', e.target.value)} />
            </label>
            <label>
              Basis Absences
              <input value={form.basis_absences} onChange={e => set('basis_absences', e.target.value)} />
            </label>
            <label>
              Basis Overtime
              <input value={form.basis_overtime} onChange={e => set('basis_overtime', e.target.value)} />
            </label>
            <label>
              Strict No Overtime
              <select value={form.strict_no_overtime ? 'yes' : 'no'} onChange={e => set('strict_no_overtime', e.target.value === 'yes')}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>
        )}

        <div className="toolbar" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn"
            onClick={save}
            disabled={!selectedEmployee || saving || loadingDetails}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>

      </section>
    </section>
  );
}
