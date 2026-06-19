import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const BASE_URL = API_BASE_URL.replace('/api', '');

// ── Design tokens (HR dark theme) ─────────────────────────────────────────
const T = {
  bg:         '#0f172a',   // page background — deep navy
  surface:    '#1e293b',   // card surface
  surfaceAlt: '#273548',   // slightly lighter surface
  border:     '#334155',   // subtle card border
  accent:     '#8b5cf6',   // violet primary
  accentLight:'#a78bfa',   // light violet (text on dark)
  accentBg:   '#2d1f52',   // violet tinted background
  textPrimary:'#f1f5f9',
  textSub:    '#94a3b8',
  textMuted:  '#64748b',
  headerFrom: '#3b1f8c',   // gradient start
  headerTo:   '#1e1b4b',   // gradient end
};

const CHART_COLORS = ['#8b5cf6', '#22d3ee', '#f59e0b', '#f87171', '#34d399', '#fb923c'];

const RISK_PALETTE = {
  High:   { bg: '#3d1515', text: '#f87171', border: '#7f1d1d' },
  Medium: { bg: '#3d2e10', text: '#fbbf24', border: '#78350f' },
  Low:    { bg: '#0d2e1e', text: '#34d399', border: '#065f46' },
  Stable: { bg: '#1e293b', text: '#94a3b8', border: '#334155' },
};

const INSIGHT_COLORS = {
  danger:  { bg: '#3d1515', fg: '#f87171', border: '#7f1d1d',  iconBg: '#4d1919' },
  warning: { bg: '#3d2e10', fg: '#fbbf24', border: '#78350f',  iconBg: '#4a3210' },
  success: { bg: '#0d2e1e', fg: '#34d399', border: '#065f46',  iconBg: '#0d3520' },
  info:    { bg: '#1a2640', fg: '#60a5fa', border: '#1e3a5f',  iconBg: '#1e2d4d' },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function normalizeRows(rows, labelKey = 'status') {
  return (rows || [])
    .map((r) => ({ label: String(r[labelKey] || r.label || 'Unspecified'), value: Number(r.total || r.value || 0) }))
    .filter((r) => r.value > 0);
}
function pct(value, total) { return total ? Math.round((Number(value || 0) / total) * 100) : 0; }
function money(value) { return `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`; }

function generateInsights(as) {
  const tardinessRate = Number(as.tardinessRate || 0);
  const absenceRate   = Number(as.absenceRate || 0);
  const highRisks     = Number(as.highTurnoverRisks || 0);
  const otForecast    = Number(as.nextWeekOtForecast || 0);
  const out = [];
  if (tardinessRate > 15)
    out.push({ type: 'danger',  icon: '⏰', title: 'High Tardiness Alert',   desc: `${tardinessRate.toFixed(1)}% — well above 10% threshold.` });
  else if (tardinessRate > 8)
    out.push({ type: 'warning', icon: '⏰', title: 'Tardiness Rising',        desc: `${tardinessRate.toFixed(1)}% — monitor and act early.` });
  else
    out.push({ type: 'success', icon: '⏰', title: 'Punctuality On Track',    desc: `${tardinessRate.toFixed(1)}% within normal range.` });
  if (absenceRate > 10)
    out.push({ type: 'danger',  icon: '🏥', title: 'Absence Rate Critical',   desc: `${absenceRate.toFixed(1)}% — immediate review needed.` });
  else if (absenceRate > 5)
    out.push({ type: 'warning', icon: '🏥', title: 'Absence Rate Elevated',   desc: `${absenceRate.toFixed(1)}% — review department patterns.` });
  else
    out.push({ type: 'success', icon: '🏥', title: 'Absence Under Control',   desc: `${absenceRate.toFixed(1)}% within healthy range.` });
  if (highRisks >= 3)
    out.push({ type: 'danger',  icon: '🚨', title: `${highRisks} High-Risk Flags`, desc: 'Multiple employees at risk. Retention action required.' });
  else if (highRisks >= 1)
    out.push({ type: 'warning', icon: '⚠️', title: `${highRisks} Turnover Risk${highRisks > 1 ? 's' : ''}`, desc: 'Engage proactively with flagged employees.' });
  else
    out.push({ type: 'success', icon: '🎯', title: 'Retention Stable',        desc: 'No high-risk turnover flags this period.' });
  if (otForecast > 80)
    out.push({ type: 'warning', icon: '⏱️', title: 'Heavy OT Projected',      desc: `${otForecast.toFixed(1)} hrs next week — consider redistribution.` });
  else if (otForecast > 40)
    out.push({ type: 'info',    icon: '⏱️', title: 'Moderate OT Expected',    desc: `${otForecast.toFixed(1)} hrs — monitor workload.` });
  else
    out.push({ type: 'success', icon: '⏱️', title: 'OT Workload Balanced',    desc: `${otForecast.toFixed(1)} hrs within normal range.` });
  return out;
}

function generateRecommendations(as) {
  const recs = [];
  const highRisks     = Number(as.highTurnoverRisks || 0);
  const tardinessRate = Number(as.tardinessRate || 0);
  const absenceRate   = Number(as.absenceRate || 0);
  if (highRisks > 0)      recs.push({ priority: 'High',   text: `Schedule retention interviews with ${highRisks} at-risk employee${highRisks > 1 ? 's' : ''}.` });
  if (tardinessRate > 8)  recs.push({ priority: 'Medium', text: 'Reinforce attendance policy with team leads.' });
  if (absenceRate > 5)    recs.push({ priority: 'Medium', text: 'Audit absence hotspots by department.' });
  if (recs.length < 2)    recs.push({ priority: 'Low',    text: 'Review upcoming payroll forecast and verify budget alignment.' });
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

// ── Sub-components ─────────────────────────────────────────────────────────
function SectionLabel({ title, icon }) {
  return (
    <View style={s.sectionLabel}>
      <Ionicons name={icon} size={13} color={T.accent} />
      <Text style={s.sectionLabelText}>{title}</Text>
    </View>
  );
}

function Card({ children, accent, style }) {
  return (
    <View style={[s.card, accent && { borderLeftColor: accent, borderLeftWidth: 3 }, style]}>
      {children}
    </View>
  );
}

function CardRow({ icon, label, value, color, sub }) {
  return (
    <View style={s.cardRow}>
      <View style={[s.cardRowDot, { backgroundColor: color || T.accent }]} />
      <Text style={s.cardRowLabel}>{label}</Text>
      {sub ? <Text style={s.cardRowSub}>{sub}</Text> : null}
      <View style={[s.cardRowBadge, { backgroundColor: (color || T.accent) + '22' }]}>
        <Text style={[s.cardRowBadgeText, { color: color || T.accent }]}>{value}</Text>
      </View>
    </View>
  );
}

function Bar({ value, max, color }) {
  const w = max > 0 ? Math.min(100, Math.max(3, Math.round((value / max) * 100))) : 3;
  return (
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${w}%`, backgroundColor: color || T.accent }]} />
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function HRDashboardScreen({ navigation }) {
  const { user }    = useAuth();
  const insets      = useSafeAreaInsets();
  const [summary,   setSummary]   = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadData(isRefresh = false) {
    if (!user?.user_id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [dashRes, aiRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/ai-analytics', { params: { user_id: user.user_id } }).catch(() => ({ data: null })),
      ]);
      // /api/dashboard returns the data object directly (no `success` wrapper).
      // On server error it returns { success: false, message }. Detect that.
      const dashData = dashRes.data || {};
      if (dashData.success === false) throw new Error(dashData.message || 'Dashboard error');
      setSummary(dashData);
      setAnalytics(aiRes.data?.success ? aiRes.data : null);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Unable to load HR dashboard.'));
    } finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { loadData(); }, [user?.user_id]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadData());
    return unsub;
  }, [navigation, user?.user_id]);
  useEffect(() => {
    if (!user?.user_id) return;
    api.get('/notifications', { params: { user_id: user.user_id } })
      .then(({ data }) => setUnreadCount(Number(data.unread_count || 0)))
      .catch(() => {});
    const socket = io(BASE_URL, { query: { user_id: user.user_id }, transports: ['websocket'], reconnectionAttempts: 5 });
    socket.on('notification_count', (count) => setUnreadCount(Number(count || 0)));
    return () => socket.disconnect();
  }, [user?.user_id]);

  // ── Derived ──
  const as           = analytics?.summary || {};
  const empStatuses  = normalizeRows(summary.employeeStatuses);
  const activeEmp    = useMemo(() => Number(empStatuses.find((r) => r.label.toLowerCase() === 'active')?.value || 0), [empStatuses]);
  const payrollItems = normalizeRows(summary.payrollStatuses).slice(0, 5);
  const leaveItems   = normalizeRows(summary.leaveStatuses).slice(0, 4);
  const topRisks     = useMemo(() => (analytics?.turnoverRisks || []).slice(0, 5), [analytics]);
  const tardiness    = useMemo(() => (analytics?.tardinessPatterns || []).slice(0, 7), [analytics]);
  const absences     = useMemo(() => (analytics?.absencePatterns || []).slice(0, 4), [analytics]);
  const otWeeks      = useMemo(() => {
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
    const avg  = nets.reduce((s, v) => s + v, 0) / nets.length;
    const latest = nets[0] || 0, prior = nets[1] || latest;
    return { avg, runs, projected: Math.max(0, avg + (latest - prior) * 0.35), direction: latest > prior ? 'Increasing' : latest < prior ? 'Decreasing' : 'Stable' };
  }, [summary.payrollRunHistory]);

  const activeP      = pct(activeEmp, summary.totalEmployees || 0);
  const pendingLeaves= leaveItems.find((i) => i.label.toLowerCase() === 'pending')?.value || 0;
  const healthScore  = computeHealthScore(as);
  const healthColor  = healthScore >= 75 ? '#34d399' : healthScore >= 50 ? '#fbbf24' : '#f87171';
  const healthLabel  = healthScore >= 75 ? 'Good' : healthScore >= 50 ? 'Moderate' : 'Needs Attention';
  const aiInsights   = generateInsights(as);
  const aiRecs       = generateRecommendations(as);
  const today        = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const firstName    = user?.full_name?.split(' ')[0] || 'HR Manager';

  const kpis = [
    { icon: 'people',    label: 'Total',     value: Number(summary.totalEmployees || 0).toLocaleString(),  sub: 'Employees',          color: '#8b5cf6' },
    { icon: 'checkmark-circle', label: 'Active', value: Number(activeEmp || 0).toLocaleString(),          sub: 'Currently employed', color: '#34d399' },
    { icon: 'cash',      label: 'Payroll',    value: Number(summary.processedPayrolls || 0).toLocaleString(), sub: 'Processed runs',  color: '#22d3ee' },
    { icon: 'document-text', label: 'Leaves', value: String(pendingLeaves),                               sub: 'Pending approval',   color: '#fbbf24' },
    { icon: 'warning',   label: 'At Risk',    value: String(as.highTurnoverRisks || 0),                   sub: 'Turnover flags',     color: '#f87171' },
  ];

  if (loading) {
    return (
      <View style={[s.root, s.centered]}>
        <ActivityIndicator size="large" color={T.accent} />
        <Text style={s.loadingText}>Loading HR Dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={T.accentLight} />}
    >

      {/* ══ HEADER ══ */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        {/* Decorative circles */}
        <View style={s.headerCircle1} />
        <View style={s.headerCircle2} />

        <View style={s.headerInner}>
          <View style={s.headerLeft}>
            <View style={s.rolePill}>
              <Ionicons name="shield-checkmark" size={11} color={T.accentLight} />
              <Text style={s.rolePillText}>{user?.role || 'HR'} · People Operations</Text>
            </View>
            <Text style={s.headerGreeting}>Welcome back,</Text>
            <Text style={s.headerName}>{firstName}</Text>
            <Text style={s.headerDate}>{today}</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications" size={20} color={T.accentLight} />
              {unreadCount > 0 && (
                <View style={s.notifBadge}><Text style={s.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.avatarBtn} onPress={() => navigation.navigate('Settings', {})}>
              <Text style={s.avatarText}>{String(firstName[0]).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── KPI strip ── */}
        <View style={s.kpiStrip}>
          {kpis.map((k) => (
            <View key={k.label} style={s.kpiItem}>
              <View style={[s.kpiIconWrap, { backgroundColor: k.color + '22' }]}>
                <Ionicons name={k.icon} size={16} color={k.color} />
              </View>
              <Text style={[s.kpiValue, { color: k.color }]}>{k.value}</Text>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiSub}>{k.sub}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ══ BODY ══ */}
      <View style={s.body}>
        {error ? (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle" size={14} color="#f87171" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── WORKFORCE ── */}
        <SectionLabel title="Workforce" icon="people" />

        <Card accent="#8b5cf6">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Employee Status</Text>
            <Text style={s.cardBadge}>{Number(summary.totalEmployees || 0)} total</Text>
          </View>
          <View style={s.twoCol}>
            <View style={s.bigStatBox}>
              <Text style={[s.bigStat, { color: '#34d399' }]}>{Number(activeEmp || 0).toLocaleString()}</Text>
              <Text style={s.bigStatLabel}>Active</Text>
            </View>
            <View style={s.bigStatBox}>
              <Text style={[s.bigStat, { color: '#8b5cf6' }]}>{activeP}%</Text>
              <Text style={s.bigStatLabel}>Workforce active</Text>
            </View>
          </View>
          <Bar value={activeEmp} max={summary.totalEmployees || 0} color="#34d399" />
          <View style={s.divider} />
          {empStatuses.length === 0
            ? <Text style={s.emptyText}>No employee data.</Text>
            : empStatuses.slice(0, 4).map((item, i) => (
                <CardRow key={item.label} label={item.label} value={item.value} color={CHART_COLORS[i % 6]} />
              ))
          }
        </Card>

        {/* ── OPERATIONS ── */}
        <SectionLabel title="Operations" icon="layers" />

        {/* Payroll */}
        <Card accent="#22d3ee">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Payroll</Text>
            <Text style={s.cardBadge}>{summary.processedPayrolls || 0} runs</Text>
          </View>
          {payrollItems.length === 0
            ? <Text style={s.emptyText}>No payroll data.</Text>
            : payrollItems.map((item, i) => (
                <CardRow key={item.label} label={item.label} value={item.value} color={CHART_COLORS[i % 6]} sub="payroll status" />
              ))
          }
        </Card>

        {/* Leave Requests */}
        <Card accent="#fbbf24">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Leave Requests</Text>
            {pendingLeaves > 0 && (
              <View style={s.alertPill}>
                <Text style={s.alertPillText}>{pendingLeaves} pending</Text>
              </View>
            )}
          </View>
          {leaveItems.length === 0
            ? <Text style={s.emptyText}>No leave data.</Text>
            : leaveItems.map((item, i) => (
                <CardRow key={item.label} label={item.label} value={item.value} color={CHART_COLORS[i % 6]} />
              ))
          }
        </Card>

        {/* Overtime Trends */}
        <Card accent="#c084fc">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Overtime Trends</Text>
            <Text style={s.cardBadge}>4 Weeks</Text>
          </View>
          {otWeeks.length === 0
            ? <Text style={s.emptyText}>No overtime data.</Text>
            : (() => {
                const maxH = Math.max(...otWeeks.map((w) => w.total_hours), 1);
                return otWeeks.map((week, i) => {
                  const lbl = week.week_start
                    ? new Date(`${week.week_start}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                    : `Wk ${i + 1}`;
                  return (
                    <View key={week.week_key} style={s.barRow}>
                      <Text style={s.barRowLabel}>{lbl}</Text>
                      <View style={s.barRowTrack}>
                        <Bar value={week.total_hours} max={maxH} color={CHART_COLORS[i % 6]} />
                      </View>
                      <Text style={[s.barRowValue, { color: CHART_COLORS[i % 6] }]}>{week.total_hours.toFixed(1)}h</Text>
                    </View>
                  );
                });
              })()
          }
          <View style={s.cardFooter}>
            <Text style={s.footerText}>Next wk est. <Text style={[s.footerBold, { color: '#c084fc' }]}>{Number(as.nextWeekOtForecast || 0).toFixed(1)} hrs</Text></Text>
            <Text style={s.footerText}>Trend <Text style={s.footerBold}>{analytics?.forecast?.direction || 'Stable'}</Text></Text>
          </View>
        </Card>

        {/* ── RISK & ANALYTICS ── */}
        <SectionLabel title="Risk & Analytics" icon="alert-circle" />

        {/* Turnover Risk */}
        <Card accent="#f87171">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Turnover Risk</Text>
            <Text style={s.cardBadge}>{topRisks.length} flagged</Text>
          </View>
          {topRisks.length === 0
            ? <Text style={s.emptyText}>No risk signals available.</Text>
            : topRisks.map((row, i) => {
                const pal = RISK_PALETTE[row.risk_band] || RISK_PALETTE.Stable;
                return (
                  <View key={`${row.emp_code}-${i}`} style={s.riskRow}>
                    <View style={s.riskAvatar}>
                      <Text style={s.riskAvatarText}>{(row.employee_name || 'E')[0]}</Text>
                    </View>
                    <View style={s.riskBody}>
                      <Text style={s.riskName}>{row.employee_name || 'Employee'}</Text>
                      <Text style={s.riskDept}>{row.department || 'N/A'}</Text>
                    </View>
                    <View style={[s.riskBand, { backgroundColor: pal.bg, borderColor: pal.border }]}>
                      <Text style={[s.riskBandText, { color: pal.text }]}>{row.risk_band || 'Stable'}</Text>
                    </View>
                    <Text style={[s.riskScore, { color: pal.text }]}>{Number(row.risk_score || 0).toFixed(1)}</Text>
                  </View>
                );
              })
          }
        </Card>

        {/* Performance Metrics */}
        <Card accent="#22d3ee">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Performance Signals</Text>
            <Text style={s.cardBadge}>7 days</Text>
          </View>
          {[
            { label: 'Tardiness Rate',  value: Number(as.tardinessRate || 0),     detail: `${as.lateDays || 0} late signals`,   unit: '%',   color: '#f87171' },
            { label: 'Absence Rate',    value: Number(as.absenceRate || 0),        detail: `${as.absentDays || 0} absent signals`,unit: '%',  color: '#fbbf24' },
            { label: 'OT Forecast',     value: Number(as.nextWeekOtForecast || 0), detail: `${analytics?.forecast?.direction || 'Stable'} trend`, unit: ' hrs', color: '#22d3ee' },
          ].map((row) => (
            <View key={row.label} style={s.metricRow}>
              <View style={s.metricTop}>
                <View>
                  <Text style={s.metricLabel}>{row.label}</Text>
                  <Text style={s.metricDetail}>{row.detail}</Text>
                </View>
                <Text style={[s.metricValue, { color: row.color }]}>{row.value.toFixed(1)}{row.unit}</Text>
              </View>
              <Bar value={Math.min(100, row.value)} max={100} color={row.color} />
            </View>
          ))}
        </Card>

        {/* Attendance Analytics */}
        <Card accent="#fbbf24">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Attendance Analytics</Text>
            <Text style={s.cardBadge}>30 days</Text>
          </View>
          <Text style={s.subLabel}>Tardiness by Day</Text>
          {tardiness.length === 0
            ? <Text style={s.emptyText}>No tardiness signals.</Text>
            : tardiness.map((row, i) => (
                <CardRow key={row.day_name} label={row.day_name} value={row.late_count} color={CHART_COLORS[i % 6]} />
              ))
          }
          <View style={s.divider} />
          <Text style={s.subLabel}>Absence by Department</Text>
          {absences.length === 0
            ? <Text style={s.emptyText}>No absence signals.</Text>
            : absences.map((row, i) => (
                <CardRow key={row.department} label={row.department} value={row.absence_days} color={CHART_COLORS[(i + 3) % 6]} />
              ))
          }
        </Card>

        {/* ── INTELLIGENCE ── */}
        <SectionLabel title="AI Intelligence" icon="sparkles" />

        {/* Health Score + AI Insights */}
        <Card accent="#8b5cf6">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>AI Insights</Text>
            <View style={s.aiBadge}><Text style={s.aiBadgeText}>✦ AI</Text></View>
          </View>

          {/* Health gauge */}
          <View style={s.healthRow}>
            <View style={[s.healthGauge, { borderColor: healthColor }]}>
              <Text style={[s.healthScore, { color: healthColor }]}>{healthScore}</Text>
              <Text style={[s.healthLabel, { color: healthColor }]}>{healthLabel}</Text>
            </View>
            <View style={s.healthMeta}>
              <Text style={s.healthTitle}>Workforce Health</Text>
              <Text style={s.healthDesc}>Based on tardiness, absence, turnover risk, and OT patterns.</Text>
              <View style={[s.healthPill, { backgroundColor: healthColor + '22', borderColor: healthColor + '55' }]}>
                <View style={[s.healthDot, { backgroundColor: healthColor }]} />
                <Text style={[s.healthPillText, { color: healthColor }]}>{healthLabel}</Text>
              </View>
            </View>
          </View>

          <View style={s.divider} />

          {/* Insights */}
          <View style={s.insightList}>
            {aiInsights.map((ins) => {
              const ic = INSIGHT_COLORS[ins.type];
              return (
                <View key={ins.title} style={[s.insightItem, { backgroundColor: ic.bg, borderLeftColor: ic.fg }]}>
                  <View style={[s.insightIconWrap, { backgroundColor: ic.iconBg }]}>
                    <Text style={s.insightEmoji}>{ins.icon}</Text>
                  </View>
                  <View style={s.insightBody}>
                    <Text style={[s.insightTitle, { color: ic.fg }]}>{ins.title}</Text>
                    <Text style={s.insightDesc}>{ins.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={s.divider} />

          {/* Recommended Actions */}
          <Text style={s.subLabel}>Recommended Actions</Text>
          {aiRecs.map((rec, i) => {
            const pc = rec.priority === 'High' ? '#f87171' : rec.priority === 'Medium' ? '#fbbf24' : '#94a3b8';
            return (
              <View key={i} style={s.recRow}>
                <View style={[s.recPill, { backgroundColor: pc + '20', borderColor: pc + '50' }]}>
                  <Text style={[s.recPillText, { color: pc }]}>{rec.priority}</Text>
                </View>
                <Text style={s.recText}>{rec.text}</Text>
              </View>
            );
          })}
        </Card>

        {/* Payroll Forecast */}
        <Card accent="#34d399">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Payroll Forecast</Text>
          </View>
          {forecast === null
            ? <Text style={s.emptyText}>No completed payroll runs available.</Text>
            : <>
                {forecast.runs.map((run, i) => (
                  <View key={run.run_id} style={s.forecastRow}>
                    <View style={[s.forecastNum, { backgroundColor: i === 0 ? '#34d399' + '22' : T.surfaceAlt }]}>
                      <Text style={[s.forecastNumText, { color: i === 0 ? '#34d399' : T.textSub }]}>{i + 1}</Text>
                    </View>
                    <View style={s.forecastBody}>
                      <Text style={s.forecastRange}>{run.payroll_range || `Run #${run.run_id}`}</Text>
                      <Text style={s.forecastCount}>{run.headcount} employees</Text>
                    </View>
                    <Text style={[s.forecastAmt, { color: i === 0 ? '#34d399' : T.textSub }]}>{money(run.total_net_pay)}</Text>
                  </View>
                ))}
                <View style={s.cardFooter}>
                  <Text style={s.footerText}>Avg/Run <Text style={s.footerBold}>{money(forecast.avg)}</Text></Text>
                  <Text style={s.footerText}>Projected <Text style={[s.footerBold, { color: '#34d399' }]}>{money(forecast.projected)}</Text></Text>
                </View>
              </>
          }
        </Card>
      </View>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: T.bg },
  content:     { paddingBottom: 60 },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: T.textSub, fontSize: 14 },

  // ── Header ──
  header: {
    backgroundColor: T.headerTo,
    paddingHorizontal: 20,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  headerCircle1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#8b5cf6', opacity: 0.08,
    top: -60, right: -40,
  },
  headerCircle2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#a78bfa', opacity: 0.06,
    top: 20, right: 80,
  },
  headerInner:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerLeft:   { flex: 1, marginRight: 8 },
  rolePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(139,92,246,0.25)', borderRadius: 20, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)' },
  rolePillText: { fontSize: 11, color: T.accentLight, fontWeight: '700', letterSpacing: 0.3 },
  headerGreeting: { fontSize: 13, color: T.textSub, fontWeight: '500' },
  headerName:   { fontSize: 26, fontWeight: '900', color: T.textPrimary, marginTop: 2 },
  headerDate:   { fontSize: 11, color: T.textMuted, marginTop: 4 },
  headerRight:  { alignItems: 'center', gap: 10 },
  headerIconBtn:{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: 12 },
  notifBadge:   { position: 'absolute', top: 4, right: 4, backgroundColor: '#f87171', borderRadius: 7, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  avatarBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { color: '#fff', fontSize: 16, fontWeight: '900' },

  // ── KPI Strip ──
  kpiStrip:     { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.25)', marginHorizontal: -20, paddingHorizontal: 12, paddingVertical: 14, gap: 4 },
  kpiItem:      { flex: 1, alignItems: 'center', gap: 3 },
  kpiIconWrap:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  kpiValue:     { fontSize: 18, fontWeight: '900' },
  kpiLabel:     { fontSize: 9, color: T.textPrimary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  kpiSub:       { fontSize: 8, color: T.textMuted, textAlign: 'center' },

  // ── Body ──
  body: { padding: 14, gap: 12 },

  // ── Section Label ──
  sectionLabel:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  sectionLabelText: { fontSize: 11, color: T.accentLight, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },

  // ── Card ──
  card:       { backgroundColor: T.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: T.border },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle:  { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  cardBadge:  { fontSize: 10, color: T.textMuted, backgroundColor: T.surfaceAlt, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, fontWeight: '700' },

  // ── Two-col stat ──
  twoCol:     { flexDirection: 'row', gap: 12, marginBottom: 12 },
  bigStatBox: { flex: 1, backgroundColor: T.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center' },
  bigStat:    { fontSize: 28, fontWeight: '900' },
  bigStatLabel: { fontSize: 11, color: T.textSub, marginTop: 2 },

  // ── Card Row ──
  cardRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: T.border },
  cardRowDot:     { width: 6, height: 6, borderRadius: 3 },
  cardRowLabel:   { flex: 1, fontSize: 13, color: T.textPrimary, fontWeight: '500' },
  cardRowSub:     { fontSize: 10, color: T.textMuted },
  cardRowBadge:   { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  cardRowBadgeText: { fontSize: 12, fontWeight: '800' },

  // ── Bar ──
  barTrack: { height: 5, backgroundColor: T.surfaceAlt, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  barFill:  { height: '100%', borderRadius: 3 },
  barRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barRowLabel: { fontSize: 10, color: T.textSub, width: 48 },
  barRowTrack: { flex: 1 },
  barRowValue: { fontSize: 11, fontWeight: '800', width: 34, textAlign: 'right' },

  // ── Card Footer ──
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.border },
  footerText: { fontSize: 11, color: T.textSub },
  footerBold: { fontWeight: '800', color: T.textPrimary },

  // ── Divider ──
  divider: { height: 1, backgroundColor: T.border, marginVertical: 12 },

  // ── Modules Grid ──
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moduleCard: { width: '22%', flexGrow: 1, backgroundColor: T.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: T.border },
  moduleIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  moduleLabel: { fontSize: 10, fontWeight: '700', color: T.textSub, textAlign: 'center', lineHeight: 13 },
  moduleLinkDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.accent },

  // ── Alert Pill ──
  alertPill: { backgroundColor: '#fbbf24' + '22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#fbbf24' + '55' },
  alertPillText: { fontSize: 10, color: '#fbbf24', fontWeight: '800' },

  // ── Risk ──
  riskRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: T.border },
  riskAvatar:    { width: 34, height: 34, borderRadius: 10, backgroundColor: T.accentBg, alignItems: 'center', justifyContent: 'center' },
  riskAvatarText:{ fontSize: 14, fontWeight: '900', color: T.accentLight },
  riskBody:      { flex: 1 },
  riskName:      { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  riskDept:      { fontSize: 11, color: T.textMuted },
  riskBand:      { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  riskBandText:  { fontSize: 10, fontWeight: '800' },
  riskScore:     { fontSize: 13, fontWeight: '900', width: 32, textAlign: 'right' },

  // ── Performance Metrics ──
  metricRow: { gap: 4, marginBottom: 10 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 },
  metricLabel:  { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  metricDetail: { fontSize: 10, color: T.textMuted },
  metricValue:  { fontSize: 16, fontWeight: '900' },

  // ── Sub label ──
  subLabel: { fontSize: 10, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  // ── AI Badge ──
  aiBadge:     { backgroundColor: T.accentBg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: T.accent + '55' },
  aiBadgeText: { fontSize: 11, color: T.accentLight, fontWeight: '800' },

  // ── Health ──
  healthRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  healthGauge: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceAlt },
  healthScore: { fontSize: 22, fontWeight: '900' },
  healthLabel: { fontSize: 9, fontWeight: '800' },
  healthMeta:  { flex: 1 },
  healthTitle: { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  healthDesc:  { fontSize: 11, color: T.textSub, marginTop: 3, lineHeight: 15 },
  healthPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  healthDot:   { width: 6, height: 6, borderRadius: 3 },
  healthPillText: { fontSize: 11, fontWeight: '700' },

  // ── Insight List ──
  insightList:  { gap: 8 },
  insightItem:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 3, borderRadius: 10, padding: 10 },
  insightIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  insightEmoji: { fontSize: 13 },
  insightBody:  { flex: 1 },
  insightTitle: { fontSize: 12, fontWeight: '800' },
  insightDesc:  { fontSize: 11, color: T.textSub, marginTop: 2, lineHeight: 15 },

  // ── Recs ──
  recRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  recPill:    { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  recPillText:{ fontSize: 10, fontWeight: '800' },
  recText:    { flex: 1, fontSize: 12, color: T.textSub, lineHeight: 17 },

  // ── Forecast ──
  forecastRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  forecastNum:    { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  forecastNumText:{ fontSize: 13, fontWeight: '900' },
  forecastBody:   { flex: 1 },
  forecastRange:  { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  forecastCount:  { fontSize: 11, color: T.textMuted },
  forecastAmt:    { fontSize: 13, fontWeight: '800' },

  // ── Error / Empty ──
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3d1515', borderRadius: 12, borderWidth: 1, borderColor: '#7f1d1d', padding: 12 },
  errorText: { color: '#f87171', fontSize: 13, flex: 1 },
  emptyText: { fontSize: 13, color: T.textMuted, fontStyle: 'italic', paddingVertical: 4 },
});
