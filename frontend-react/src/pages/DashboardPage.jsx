import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function formatLogDate(value) {
  if (!value) return 'N/A';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

const chartColors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0f766e'];

function normalizeRows(rows, labelKey = 'status') {
  return (rows || [])
    .map((row) => ({
      label: String(row[labelKey] || row.label || 'Unspecified'),
      value: Number(row.total || row.value || 0)
    }))
    .filter((row) => row.value > 0);
}

function DonutChart({ rows }) {
  const items = normalizeRows(rows);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const background = total > 0
    ? `conic-gradient(${items.map((item, index) => {
        const start = cursor;
        const end = cursor + (item.value / total) * 100;
        cursor = end;
        return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
      }).join(', ')})`
    : '#eef2f7';

  return (
    <div className="donut-dashboard">
      <div className="donut-chart" style={{ background }}><span>{total}</span></div>
      <div className="chart-legend">
        {items.length === 0 ? <p className="muted">No data available.</p> : items.map((item, index) => (
          <div className="legend-row" key={item.label}>
            <i style={{ background: chartColors[index % chartColors.length] }} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ rows }) {
  const items = normalizeRows(rows);
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="bar-chart">
      {items.length === 0 ? <p className="muted">No data available.</p> : items.map((item, index) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div className="bar-track">
            <i style={{ width: `${Math.max((item.value / max) * 100, 4)}%`, background: chartColors[index % chartColors.length] }} />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({ totalEmployees: 0, processedPayrolls: 0, systemLogs: 0 });
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    async function load() {
      const [dashboardRes, logsRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/audit_logs', { params: { limit: 20, page: 1 } })
      ]);

      setSummary(dashboardRes.data || {});
      setLogs(logsRes.data?.logs || []);
    }

    load().catch((err) => console.error('Dashboard load failed:', err));
  }, []);

  return (
    <>
      <header className="header">
        <h2>Welcome, {user?.full_name || 'User'}</h2>
        <p>Here is your overview of employees, payrolls, and system updates.</p>
      </header>

      <section className="summary">
        <div className="card"><span>Total Employees</span><strong>{summary.totalEmployees || 0}</strong></div>
        <div className="card"><span>Processed Payrolls</span><strong>{summary.processedPayrolls || 0}</strong></div>
        <div className="card"><span>System Logs Today</span><strong>{summary.systemLogs || 0}</strong></div>
      </section>

      <section className="dashboard-grid">
        <article className="modern-panel">
          <div className="panel-title">
            <div>
              <h3>Employee Status</h3>
              <p>Current workforce distribution</p>
            </div>
          </div>
          <DonutChart rows={summary.employeeStatuses} />
        </article>

        <article className="modern-panel">
          <div className="panel-title">
            <div>
              <h3>Payroll Runs</h3>
              <p>Payroll records by status</p>
            </div>
          </div>
          <BarChart rows={summary.payrollStatuses} />
        </article>

        <article className="modern-panel wide-panel">
          <div className="panel-title">
            <div>
              <h3>Leave Requests</h3>
              <p>Requests grouped by approval status</p>
            </div>
          </div>
          <BarChart rows={summary.leaveStatuses} />
        </article>
      </section>

      <section className="table-section">
        <h3>Recent System Activities</h3>
        <table>
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Activity</th>
              <th>Performed By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan="4">No recent system activities found.</td></tr>
            ) : logs.map((log) => (
              <tr key={log.log_id || `${log.log_time}-${log.action}`}>
                <td>{formatLogDate(log.log_time)}</td>
                <td>{log.action}</td>
                <td>{log.admin_name}</td>
                <td><span className="status completed">{log.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
