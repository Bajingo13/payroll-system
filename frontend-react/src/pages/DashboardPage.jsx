import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const C = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];
const RISK_P = {
  High:   ['#fef2f2', '#ef4444', '#fca5a5'],
  Medium: ['#fffbeb', '#f59e0b', '#fde68a'],
  Low:    ['#f0fdf4', '#22c55e', '#86efac'],
  Stable: ['#f8fafc', '#94a3b8', '#cbd5e1'],
};

function normalizeRows(rows, labelKey = 'status') {
  return (rows || [])
    .map((r) => ({ label: String(r[labelKey] || r.label || 'Unspecified'), value: Number(r.total || r.value || 0) }))
    .filter((r) => r.value > 0);
}

function pct(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / total) * 100);
}

function SegBar({ rows }) {
  const items = normalizeRows(rows);
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="segmented-status">
      <div className="segmented-track">
        {items.length === 0 ? <i style={{ width: '100%', background: '#e2e8f0' }} /> : null}
        {items.map((item, i) => (
          <i key={item.label} style={{ width: `${Math.max(pct(item.value, total), 6)}%`, background: C[i % 6] }} title={`${item.label}: ${item.value}`} />
        ))}
      </div>
      <div className="segmented-legend">
        {items.length === 0 ? <span>No data</span> : null}
        {items.map((item, i) => <span key={item.label}><b style={{ background: C[i % 6] }} />{item.label} ({item.value})</span>)}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({ totalEmployees: 0, processedPayrolls: 0 });
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (!user?.user_id) return;
    async function load() {
      const [dashRes, aRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/ai-analytics', { params: { user_id: user.user_id } }).catch(() => ({ data: null })),
      ]);
      setSummary(dashRes.data || {});
      setAnalytics(aRes.data?.success ? aRes.data : null);
    }
    load().catch(console.error);
  }, [user?.user_id]);

  const as = analytics?.summary || {};
  const empStatuses = normalizeRows(summary.employeeStatuses);
  const activeEmp = useMemo(() => Number(empStatuses.find((r) => r.label.toLowerCase() === 'active')?.value || 0), [empStatuses]);
  const payrollItems = normalizeRows(summary.payrollStatuses).slice(0, 5);
  const leaveItems = normalizeRows(summary.leaveStatuses).slice(0, 4);
  const topRisks = useMemo(() => (analytics?.turnoverRisks || []).slice(0, 4), [analytics]);
  const tardiness = useMemo(() => analytics?.tardinessPatterns || [], [analytics]);
  const absences = useMemo(() => (analytics?.absencePatterns || []).slice(0, 4), [analytics]);
  const otWeeks = useMemo(() => {
    const map = {};
    (analytics?.overtimePatterns || []).forEach((r) => {
      const k = String(r.week_key);
      if (!map[k]) map[k] = { week_key: k, week_start: r.week_start, total_hours: 0 };
      map[k].total_hours = Number((map[k].total_hours + Number(r.total_hours || 0)).toFixed(2));
    });
    return Object.values(map).slice(-4);
  }, [analytics]);
  const forecast = useMemo(() => {
    const runs = (summary.payrollRunHistory || []).slice(0, 4);
    if (!runs.length) return null;
    const nets = runs.map((r) => Number(r.total_net_pay || 0));
    const avg = nets.reduce((s, v) => s + v, 0) / nets.length;
    const latest = nets[0] || 0;
    const prior = nets[1] || latest;
    return { avg, runs, projected: Math.max(0, avg + (latest - prior) * 0.35), direction: latest > prior ? 'Increasing' : latest < prior ? 'Decreasing' : 'Stable' };
  }, [summary.payrollRunHistory]);

  const activeP = pct(activeEmp, summary.totalEmployees || 0);
  const pendingLeaves = leaveItems.find((i) => i.label.toLowerCase() === 'pending')?.value || 0;
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <header className="dboard-hero">
        <div>
          <p className="dboard-hero-kicker">Admin Control Center</p>
          <h2>Welcome back, {user?.full_name?.split(' ')[0] || 'Admin'}</h2>
          <p className="dboard-hero-sub">Here's your workforce snapshot for today.</p>
        </div>
        <time className="dboard-hero-date">{today}</time>
      </header>

      <div className="dboard-kpi-row">
        {[
          { icon: '👥', label: 'Total Employees', value: Number(summary.totalEmployees || 0).toLocaleString(), sub: `${activeP}% active`, bg: '#e0f2fe' },
          { icon: '✅', label: 'Active', value: Number(activeEmp || 0).toLocaleString(), sub: 'Currently employed', bg: '#dcfce7' },
          { icon: '💰', label: 'Payroll Runs', value: Number(summary.processedPayrolls || 0).toLocaleString(), sub: 'Processed', bg: '#ede9fe' },
          { icon: '📋', label: 'Pending Leaves', value: pendingLeaves, sub: 'Awaiting approval', bg: '#fef9c3' },
          { icon: '⚠️', label: 'Turnover Risk', value: as.highTurnoverRisks || 0, sub: 'High-risk flags', bg: '#fee2e2' },
        ].map((s, i) => (
          <div className="dboard-kpi" key={s.label} style={{ animationDelay: `${i * 55}ms` }}>
            <div className="dboard-kpi-icon" style={{ background: s.bg }}>{s.icon}</div>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
            <small>{s.sub}</small>
          </div>
        ))}
      </div>

      <section className="dboard-grid">

        {/* Attendance */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#e0f2fe' }}>👥</div>
            <div><h3>Attendance</h3><p>Workforce presence</p></div>
          </div>
          <div className="dboard-big-num">
            <strong>{Number(activeEmp || 0).toLocaleString()}</strong>
            <em>Active employees</em>
          </div>
          <div className="dboard-prog-wrap">
            <div className="dboard-prog-lbl"><span>{activeP}% active</span><span>{Number(summary.totalEmployees || 0).toLocaleString()} total</span></div>
            <div className="dboard-prog"><div className="dboard-prog-fill" style={{ width: `${activeP}%`, background: 'linear-gradient(90deg,#0a66d9,#22c55e)' }} /></div>
          </div>
          <div className="dboard-chip-row">
            {empStatuses.slice(0, 4).map((item, i) => (
              <span key={item.label} className="dboard-chip" style={{ background: `${C[i % 6]}14`, borderColor: `${C[i % 6]}30`, color: C[i % 6] }}>
                <i style={{ background: C[i % 6] }} />{item.label}<b>{item.value}</b>
              </span>
            ))}
          </div>
        </article>

        {/* Payroll */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#dcfce7' }}>💰</div>
            <div><h3>Payroll</h3><p>{summary.processedPayrolls || 0} processed runs</p></div>
          </div>
          <div className="dboard-rows">
            {payrollItems.length === 0 ? <p className="muted">No payroll data.</p> : null}
            {payrollItems.map((item, i) => (
              <div className="dboard-row" key={item.label}>
                <span className="dboard-row-avatar" style={{ background: `${C[i % 6]}15`, color: C[i % 6] }}>{item.label[0].toUpperCase()}</span>
                <div><strong>{item.label}</strong><small>Payroll status</small></div>
                <span className={`dbadge ${i === 0 ? 'dbadge--blue' : 'dbadge--green'}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </article>

        {/* Performance */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#ede9fe' }}>📊</div>
            <div><h3>Performance</h3><p>Attendance &amp; OT signals</p></div>
            <span className="dboard-badge-period">7 Days</span>
          </div>
          <div className="dboard-metrics">
            {[
              { label: 'Tardiness', value: Number(as.tardinessRate || 0), detail: `${as.lateDays || 0} late signals`, unit: '%', color: '#ef4444' },
              { label: 'Absence', value: Number(as.absenceRate || 0), detail: `${as.absentDays || 0} absent signals`, unit: '%', color: '#f59e0b' },
              { label: 'OT Forecast', value: Number(as.nextWeekOtForecast || 0), detail: `${analytics?.forecast?.direction || 'Stable'} trend`, unit: ' hrs', color: '#0ea5e9' },
            ].map((row) => (
              <div className="dboard-metric-row" key={row.label}>
                <div><strong>{row.label}</strong><small>{row.detail}</small></div>
                <span style={{ color: row.color }}>{row.value.toFixed(1)}{row.unit}</span>
                <div className="dboard-prog"><div className="dboard-prog-fill" style={{ width: `${Math.min(100, Math.max(2, row.value))}%`, background: row.color }} /></div>
              </div>
            ))}
          </div>
        </article>

        {/* Employment Status */}
        <article className="dboard-card dboard-span-2">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fff7ed' }}>📈</div>
            <div><h3>Employment Status</h3><p>{Number(summary.totalEmployees || 0).toLocaleString()} total employees</p></div>
          </div>
          <SegBar rows={summary.employeeStatuses} />
        </article>

        {/* Leave Requests */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fef9c3' }}>📋</div>
            <div><h3>Leave Requests</h3><p>Approval overview</p></div>
          </div>
          <div className="dboard-rows">
            {leaveItems.length === 0 ? <p className="muted">No leave data.</p> : null}
            {leaveItems.map((item, i) => (
              <div className="dboard-row" key={item.label}>
                <span className="dboard-dot" style={{ background: C[i % 6] }} />
                <div><strong>{item.label}</strong><small>Leave requests</small></div>
                <span className="dbadge dbadge--neutral">{item.value}</span>
              </div>
            ))}
          </div>
        </article>

        {/* Turnover Risk */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fee2e2' }}>⚠️</div>
            <div><h3>Turnover Risk</h3><p>Needs attention</p></div>
          </div>
          <div className="dboard-rows">
            {topRisks.length === 0 ? <p className="muted">No risk signals available.</p> : null}
            {topRisks.map((row, i) => {
              const [bg, fg, border] = RISK_P[row.risk_band] || RISK_P.Stable;
              return (
                <div className="dboard-row dboard-row--pad" key={`${row.emp_code}-${i}`}>
                  <span className="dboard-row-avatar" style={{ background: '#eef2ff', color: '#35508a' }}>{(row.employee_name || 'E')[0]}</span>
                  <div><strong>{row.employee_name || 'Employee'}</strong><small>{row.department || 'N/A'}</small></div>
                  <span style={{ background: bg, color: fg, border: `1px solid ${border}`, borderRadius: '999px', padding: '3px 9px', fontSize: '11px', fontWeight: 800 }}>{row.risk_band || 'Stable'}</span>
                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>{Number(row.risk_score || 0).toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </article>

        {/* AI Analytics */}
        <article className="dboard-card dboard-span-2">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#ede9fe)' }}>🤖</div>
            <div><h3>AI Analytics</h3><p>Live workforce intelligence</p></div>
          </div>
          <div className="dboard-signals">
            {[
              { label: 'Tardiness Rate', value: `${Number(as.tardinessRate || 0).toFixed(2)}%`, sub: `${as.lateDays || 0} late signals`, color: '#ef4444' },
              { label: 'Absence Rate', value: `${Number(as.absenceRate || 0).toFixed(2)}%`, sub: `${as.absentDays || 0} absent signals`, color: '#f59e0b' },
              { label: 'Turnover Risks', value: as.highTurnoverRisks || 0, sub: 'Needs follow-up', color: '#8b5cf6' },
              { label: 'OT Forecast', value: `${Number(as.nextWeekOtForecast || 0).toFixed(1)} hrs`, sub: analytics?.forecast?.direction || 'Stable', color: '#0ea5e9' },
            ].map((sig) => (
              <div className="dboard-signal" key={sig.label} style={{ borderLeftColor: sig.color }}>
                <span>{sig.label}</span>
                <strong>{sig.value}</strong>
                <small>{sig.sub}</small>
              </div>
            ))}
          </div>
        </article>

        {/* Overtime Trends */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#ecfeff' }}>⏱️</div>
            <div><h3>Overtime Trends</h3><p>Weekly OT pattern</p></div>
            <span className="dboard-badge-period">8 Wks</span>
          </div>
          <div className="dboard-bars">
            {otWeeks.length === 0 ? <p className="muted">No overtime data.</p> : null}
            {otWeeks.map((week, i) => {
              const maxH = Math.max(...otWeeks.map((w) => w.total_hours), 1);
              const p = Math.min(100, Math.max(2, (week.total_hours / maxH) * 100));
              const lbl = week.week_start
                ? new Date(`${week.week_start}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                : `Wk ${i + 1}`;
              return (
                <div className="dboard-bar-row" key={week.week_key}>
                  <span>Wk {lbl}</span>
                  <div className="dboard-prog"><div className="dboard-prog-fill" style={{ width: `${p}%`, background: C[i % 6] }} /></div>
                  <b>{week.total_hours.toFixed(1)}h</b>
                </div>
              );
            })}
          </div>
          <div className="dboard-foot">
            <span>Next Wk Est. <b>{Number(as.nextWeekOtForecast || 0).toFixed(1)} hrs</b></span>
            <span>Trend <b>{analytics?.forecast?.direction || 'Stable'}</b></span>
          </div>
        </article>

        {/* Attendance Analytics */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fefce8' }}>🗓️</div>
            <div><h3>Attendance Analytics</h3><p>Tardiness &amp; absence</p></div>
            <span className="dboard-badge-period">30 Days</span>
          </div>
          <p className="dboard-sub-label">Tardiness by Day</p>
          <div className="dboard-rows compact">
            {tardiness.length === 0 ? <p className="muted">No tardiness signals.</p> : null}
            {tardiness.map((row, i) => (
              <div className="dboard-row" key={row.day_name}>
                <span className="dboard-dot" style={{ background: C[i % 6] }} />
                <div><strong>{row.day_name}</strong><small>Late arrivals</small></div>
                <span className="dbadge dbadge--neutral">{row.late_count}</span>
              </div>
            ))}
          </div>
          <p className="dboard-sub-label" style={{ marginTop: '10px' }}>Absence by Department</p>
          <div className="dboard-rows compact">
            {absences.length === 0 ? <p className="muted">No absence signals.</p> : null}
            {absences.map((row, i) => (
              <div className="dboard-row" key={row.department}>
                <span className="dboard-dot" style={{ background: C[(i + 2) % 6] }} />
                <div><strong>{row.department}</strong><small>Absence signals</small></div>
                <span className="dbadge dbadge--neutral">{row.absence_days}</span>
              </div>
            ))}
          </div>
        </article>

        {/* Payroll Forecast */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#dcfce7' }}>📉</div>
            <div><h3>Payroll Forecast</h3><p>Budget projections</p></div>
          </div>
          {forecast === null ? (
            <p className="muted">No completed payroll runs available.</p>
          ) : (
            <>
              <div className="dboard-rows compact">
                {forecast.runs.map((run, i) => (
                  <div className="dboard-row" key={run.run_id}>
                    <span className="dboard-row-avatar" style={{ background: i === 0 ? '#dcfce7' : '#f1f5f9', color: i === 0 ? '#15803d' : '#475569' }}>{i + 1}</span>
                    <div><strong>{run.payroll_range || `Run #${run.run_id}`}</strong><small>{run.headcount} employees</small></div>
                    <span className={`dbadge ${i === 0 ? 'dbadge--green' : 'dbadge--neutral'}`}>
                      ₱{Number(run.total_net_pay || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="dboard-foot">
                <span>Avg/Run <b>₱{forecast.avg.toLocaleString('en-PH', { maximumFractionDigits: 0 })}</b></span>
                <span>Projected <b>₱{forecast.projected.toLocaleString('en-PH', { maximumFractionDigits: 0 })}</b></span>
              </div>
            </>
          )}
        </article>

      </section>
    </>
  );
}
