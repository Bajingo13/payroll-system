import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatAuditTime(value) {
  if (!value) return '-';
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportAuditCsv(rows) {
  const headers = ['Date/Time', 'User', 'Action', 'Status'];
  const body = rows.map((row) => [
    formatAuditTime(row.log_time),
    row.admin_name || '',
    row.action || '',
    row.status || ''
  ]);

  const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AuditingPage() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState(20);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await api.get('/audit_logs', { params: { limit: entries, page } });
      if (!data.success) {
        throw new Error(data.message || 'Unable to load audit logs.');
      }

      setLogs(data.logs || []);
      setTotalLogs(Number(data.totalLogs || 0));
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (err) {
      setLogs([]);
      setMessage(getApiMessage(err, 'Unable to load audit logs.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs().catch(() => {});
  }, [entries, page]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) => `${log.admin_name || ''} ${log.action || ''} ${log.status || ''}`.toLowerCase().includes(term));
  }, [logs, search]);

  const showingStart = totalLogs === 0 ? 0 : (page - 1) * entries + 1;
  const showingEnd = Math.min(page * entries, totalLogs);

  return (
    <>
      <header className="header">
        <h2>Auditing</h2>
        <p>Track system activity logs with search, paging, and CSV export.</p>
      </header>

      <section className="table-section">
        <div className="table-header employee-mgmt-header">
          <h3>System Activity Log</h3>
          <div className="toolbar">
            <button type="button" className="btn secondary" onClick={() => exportAuditCsv(filteredLogs)}>Export Logs</button>
          </div>
        </div>

        <div className="employee-table-controls">
          <label>
            Show
            <select value={entries} onChange={(event) => { setPage(1); setEntries(Number(event.target.value)); }}>
              {PAGE_SIZE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            entries
          </label>
          <label>
            Search:
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search logs..." />
          </label>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="4">Loading logs...</td></tr> : null}
              {!loading && filteredLogs.length === 0 ? <tr><td colSpan="4">No recent system activities found.</td></tr> : null}
              {!loading && filteredLogs.map((log, idx) => (
                <tr key={`${log.log_time}-${idx}`}>
                  <td>{formatAuditTime(log.log_time)}</td>
                  <td>{log.admin_name || '-'}</td>
                  <td>{log.action || '-'}</td>
                  <td><span className="status completed">{log.status || '-'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="employee-table-footer">
          <div className="muted">Showing {showingStart} to {showingEnd} of {totalLogs} entries</div>
          <div className="pagination-react">
            <button type="button" className="btn secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="page-chip">{page}</span>
            <button type="button" className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
          </div>
        </div>

        <p className="message">{message}</p>
      </section>
    </>
  );
}
