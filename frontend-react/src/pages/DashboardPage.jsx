import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import AppIcon from '../components/AppIcon.jsx';

const C = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];
const RISK_P = {
  High:   ['#fef2f2', '#ef4444', '#fca5a5'],
  Medium: ['#fffbeb', '#f59e0b', '#fde68a'],
  Low:    ['#f0fdf4', '#22c55e', '#86efac'],
  Stable: ['#f8fafc', '#94a3b8', '#cbd5e1'],
};

const INSIGHT_COLORS = {
  danger:  { bg: '#fef2f2', fg: '#dc2626', border: '#fca5a5', icon_bg: '#fee2e2' },
  warning: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a', icon_bg: '#fef3c7' },
  success: { bg: '#f0fdf4', fg: '#16a34a', border: '#86efac', icon_bg: '#dcfce7' },
  info:    { bg: '#eff6ff', fg: '#2563eb', border: '#93c5fd', icon_bg: '#dbeafe' },
};

function generateInsights(as) {
  const tardinessRate = Number(as.tardinessRate || 0);
  const absenceRate = Number(as.absenceRate || 0);
  const highRisks = Number(as.highTurnoverRisks || 0);
  const otForecast = Number(as.nextWeekOtForecast || 0);
  const out = [];
  if (tardinessRate > 15)
    out.push({ type: 'danger', icon: 'time', title: 'High Tardiness Alert', desc: `${tardinessRate.toFixed(1)}% tardiness is well above the 10% threshold.` });
  else if (tardinessRate > 8)
    out.push({ type: 'warning', icon: 'time', title: 'Tardiness Rising', desc: `Tardiness at ${tardinessRate.toFixed(1)}% — monitor and act early.` });
  else
    out.push({ type: 'success', icon: 'time', title: 'Punctuality On Track', desc: `Tardiness at ${tardinessRate.toFixed(1)}% is within normal range.` });
  if (absenceRate > 10)
    out.push({ type: 'danger', icon: 'alert', title: 'Absence Rate Critical', desc: `${absenceRate.toFixed(1)}% absence — immediate HR review needed.` });
  else if (absenceRate > 5)
    out.push({ type: 'warning', icon: 'alert', title: 'Absence Rate Elevated', desc: `Absence at ${absenceRate.toFixed(1)}% — review department patterns.` });
  else
    out.push({ type: 'success', icon: 'check', title: 'Absence Under Control', desc: `Absence at ${absenceRate.toFixed(1)}% is within healthy range.` });
  if (highRisks >= 3)
    out.push({ type: 'danger', icon: 'alert', title: `${highRisks} High-Risk Flags`, desc: 'Multiple employees at risk. Immediate retention action required.' });
  else if (highRisks >= 1)
    out.push({ type: 'warning', icon: 'alert', title: `${highRisks} Turnover Risk${highRisks > 1 ? 's' : ''}`, desc: `${highRisks} employee${highRisks > 1 ? 's' : ''} showing signals — engage proactively.` });
  else
    out.push({ type: 'success', icon: 'target', title: 'Retention Stable', desc: 'No high-risk turnover flags detected this period.' });
  if (otForecast > 80)
    out.push({ type: 'warning', icon: 'time', title: 'Heavy OT Projected', desc: `${otForecast.toFixed(1)} hrs OT next week — consider task redistribution.` });
  else if (otForecast > 40)
    out.push({ type: 'info', icon: 'time', title: 'Moderate OT Expected', desc: `${otForecast.toFixed(1)} hrs OT forecast — monitor workload distribution.` });
  else
    out.push({ type: 'success', icon: 'time', title: 'OT Workload Balanced', desc: `${otForecast.toFixed(1)} hrs OT is within normal operating range.` });
  return out;
}

function generateRecommendations(as) {
  const recs = [];
  const highRisks = Number(as.highTurnoverRisks || 0);
  const tardinessRate = Number(as.tardinessRate || 0);
  const absenceRate = Number(as.absenceRate || 0);
  if (highRisks > 0) recs.push({ priority: 'High', text: `Schedule retention interviews with ${highRisks} at-risk employee${highRisks > 1 ? 's' : ''}.` });
  if (tardinessRate > 8) recs.push({ priority: 'Medium', text: 'Reinforce attendance policy with team leads to address tardiness.' });
  if (absenceRate > 5) recs.push({ priority: 'Medium', text: 'Audit absence hotspots by department for wellness concerns.' });
  if (recs.length < 2) recs.push({ priority: 'Low', text: 'Review upcoming payroll forecast and verify budget alignment.' });
  return recs.slice(0, 3);
}

function computeHealthScore(as) {
  let score = 100;
  score -= Math.min(30, Number(as.tardinessRate || 0) * 2);
  score -= Math.min(25, Number(as.absenceRate || 0) * 2.5);
  score -= Math.min(30, Number(as.highTurnoverRisks || 0) * 10);
  score -= Math.min(10, Math.max(0, (Number(as.nextWeekOtForecast || 0) - 40) / 5));
  return Math.max(0, Math.round(score));
}

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
  const navigate = useNavigate();
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
  const overtimeItems = normalizeRows(summary.overtimeStatuses).slice(0, 4);
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
  const pendingOvertimes = overtimeItems.find((i) => i.label.toLowerCase() === 'pending')?.value || 0;
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const healthScore = computeHealthScore(as);
  const healthColor = healthScore >= 75 ? '#16a34a' : healthScore >= 50 ? '#d97706' : '#dc2626';
  const healthLabel = healthScore >= 75 ? 'Good' : healthScore >= 50 ? 'Moderate' : 'Needs Attention';
  const aiInsights = generateInsights(as);
  const aiRecs = generateRecommendations(as);

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
          { icon: 'users', label: 'Total Employees', value: Number(summary.totalEmployees || 0).toLocaleString(), sub: `${activeP}% active`,    bg: '#e0f2fe', route: '/employee-management' },
          { icon: 'check', label: 'Active',           value: Number(activeEmp || 0).toLocaleString(),             sub: 'Currently employed',     bg: '#dcfce7', route: '/employee-management' },
          { icon: 'wallet', label: 'Payroll Runs',     value: Number(summary.processedPayrolls || 0).toLocaleString(), sub: 'Processed',          bg: '#ede9fe', route: '/payroll-computation' },
          { icon: 'clipboard', label: 'Pending Leaves',    value: pendingLeaves,                                       sub: 'Awaiting approval',      bg: '#fef9c3', route: '/leave-management' },
          { icon: 'time', label: 'Pending Overtime',  value: pendingOvertimes,                                    sub: 'Awaiting approval',      bg: '#ecfeff', route: '/overtime-management' },
          { icon: 'alert', label: 'Turnover Risk',    value: as.highTurnoverRisks || 0,                          sub: 'High-risk flags',         bg: '#fee2e2', route: '/analytics-dashboard' },
        ].map((s, i) => (
          <div
            className="dboard-kpi dboard-kpi-link"
            key={s.label}
            style={{ animationDelay: `${i * 55}ms` }}
            onClick={() => navigate(s.route)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate(s.route); }}
          >
            <div className="dboard-kpi-icon" style={{ background: s.bg }}><AppIcon name={s.icon} /></div>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
            <small>{s.sub}</small>
          </div>
        ))}
      </div>

      <section className="dboard-grid">

        {/* ── Row 1: Core snapshot — 3 equal cards ── */}
        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#e0f2fe' }}><AppIcon name="users" /></div>
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

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#dcfce7' }}><AppIcon name="wallet" /></div>
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

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#ede9fe' }}><AppIcon name="chart" /></div>
            <div><h3>Performance</h3><p>Attendance &amp; OT signals</p></div>
            <span className="dboard-badge-period">7 Days</span>
          </div>
          <div className="dboard-metrics">
            {[
              { label: 'Tardiness',   value: Number(as.tardinessRate || 0),       detail: `${as.lateDays || 0} late signals`,   unit: '%',   color: '#ef4444' },
              { label: 'Absence',     value: Number(as.absenceRate || 0),          detail: `${as.absentDays || 0} absent signals`, unit: '%',   color: '#f59e0b' },
              { label: 'OT Forecast', value: Number(as.nextWeekOtForecast || 0),  detail: `${analytics?.forecast?.direction || 'Stable'} trend`, unit: ' hrs', color: '#0ea5e9' },
            ].map((row) => (
              <div className="dboard-metric-row" key={row.label}>
                <div><strong>{row.label}</strong><small>{row.detail}</small></div>
                <span style={{ color: row.color }}>{row.value.toFixed(1)}{row.unit}</span>
                <div className="dboard-prog"><div className="dboard-prog-fill" style={{ width: `${Math.min(100, Math.max(2, row.value))}%`, background: row.color }} /></div>
              </div>
            ))}
          </div>
        </article>

        {/* ── Workforce Overview — full-width bar ── */}
        <div className="dboard-section-head dboard-span-3"><span>Workforce Overview</span></div>

        <article className="dboard-card dboard-span-3">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fff7ed' }}><AppIcon name="chartUp" /></div>
            <div><h3>Employment Status</h3><p>{Number(summary.totalEmployees || 0).toLocaleString()} total employees</p></div>
          </div>
          <SegBar rows={summary.employeeStatuses} />
        </article>

        {/* ── Risk & Requests — 3 equal cards ── */}
        <div className="dboard-section-head dboard-span-3"><span>Risk &amp; Requests</span></div>

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fef9c3' }}><AppIcon name="clipboard" /></div>
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

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#ecfeff' }}><AppIcon name="time" /></div>
            <div><h3>Overtime Requests</h3><p>Approval overview</p></div>
          </div>
          <div className="dboard-rows">
            {overtimeItems.length === 0 ? <p className="muted">No overtime data.</p> : null}
            {overtimeItems.map((item, i) => (
              <div className="dboard-row" key={item.label}>
                <span className="dboard-dot" style={{ background: C[i % 6] }} />
                <div><strong>{item.label}</strong><small>OT requests</small></div>
                <span className="dbadge dbadge--neutral">{item.value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fee2e2' }}><AppIcon name="alert" /></div>
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

        {/* ── Intelligence — full-width AI card ── */}
        <div className="dboard-section-head dboard-span-3"><span>Intelligence</span></div>

        <article className="dboard-card dboard-span-3">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#ede9fe)' }}><AppIcon name="robot" /></div>
            <div><h3>AI Insights</h3><p>Workforce intelligence summary</p></div>
            <span className="dboard-ai-badge">AI</span>
          </div>
          <div className="dboard-ai-body" style={{ gridTemplateColumns: '90px 1fr 1fr' }}>
            <div className="dboard-ai-score">
              <svg width="76" height="76" viewBox="0 0 76 76">
                <circle cx="38" cy="38" r="28" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle cx="38" cy="38" r="28" fill="none" stroke={healthColor} strokeWidth="8"
                  strokeDasharray={`${((healthScore / 100) * 2 * Math.PI * 28).toFixed(1)} ${(2 * Math.PI * 28).toFixed(1)}`}
                  strokeDashoffset={(2 * Math.PI * 28 / 4).toFixed(1)}
                  strokeLinecap="round" />
                <text x="38" y="44" textAnchor="middle" fontSize="16" fontWeight="900" fill={healthColor}>{healthScore}</text>
              </svg>
              <strong style={{ color: healthColor }}>{healthLabel}</strong>
              <small>Workforce Health</small>
            </div>
            <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {aiInsights.map((ins) => {
                const ic = INSIGHT_COLORS[ins.type];
                return (
                  <div key={ins.title} className="dboard-ai-insight" style={{ background: ic.bg, borderLeft: `3px solid ${ic.border}` }}>
                    <span className="dboard-ai-insight-icon" style={{ background: ic.icon_bg }}><AppIcon name={ins.icon} size={15} /></span>
                    <div>
                      <strong style={{ color: ic.fg }}>{ins.title}</strong>
                      <small>{ins.desc}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="dboard-ai-recs">
            <p className="dboard-sub-label">Recommended Actions</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 16px' }}>
              {aiRecs.map((rec, i) => {
                const pc = rec.priority === 'High' ? '#dc2626' : rec.priority === 'Medium' ? '#d97706' : '#64748b';
                return (
                  <div key={i} className="dboard-ai-rec">
                    <span className="dboard-ai-rec-badge" style={{ color: pc, borderColor: `${pc}40`, background: `${pc}10` }}>{rec.priority}</span>
                    <span>{rec.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        {/* ── Analytics — 3 equal cards ── */}
        <div className="dboard-section-head dboard-span-3"><span>Analytics</span></div>

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#fefce8' }}><AppIcon name="calendar" /></div>
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

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#ecfeff' }}><AppIcon name="time" /></div>
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

        <article className="dboard-card dboard-span-1">
          <div className="dboard-ch">
            <div className="dboard-ch-icon" style={{ background: '#dcfce7' }}><AppIcon name="chartDown" /></div>
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
