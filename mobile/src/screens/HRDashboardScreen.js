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
  bg:         '#f8fafc',
  surface:    '#ffffff',
  surfaceAlt: '#f1f5f9',
  border:     '#e2e8f0',
  accent:     '#1e40af',
  accentLight:'#2563eb',
  accentBg:   '#dbeafe',
  textPrimary:'#0f172a',
  textSub:    '#64748b',
  textMuted:  '#94a3b8',
  headerFrom: '#1e40af',
  headerTo:   '#1e3a8a',
};

const CHART_COLORS = ['#2563eb', '#22d3ee', '#f59e0b', '#f87171', '#34d399', '#fb923c'];

const RISK_PALETTE = {
  High:   { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  Medium: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  Low:    { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  Stable: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
};

const INSIGHT_COLORS = {
  danger:  { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca', iconBg: '#fee2e2' },
  warning: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a', iconBg: '#fef3c7' },
  success: { bg: '#f0fdf4', fg: '#16a34a', border: '#bbf7d0', iconBg: '#dcfce7' },
  info:    { bg: '#eff6ff', fg: '#2563eb', border: '#bfdbfe', iconBg: '#dbeafe' },
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
    out.push({ type: 'danger',  icon: 'time-outline', title: 'High Tardiness Alert',   desc: `${tardinessRate.toFixed(1)}% - well above 10% threshold.` });
  else if (tardinessRate > 8)
    out.push({ type: 'warning', icon: 'time-outline', title: 'Tardiness Rising',        desc: `${tardinessRate.toFixed(1)}% - monitor and act early.` });
  else
    out.push({ type: 'success', icon: 'time-outline', title: 'Punctuality On Track',    desc: `${tardinessRate.toFixed(1)}% within normal range.` });
  if (absenceRate > 10)
    out.push({ type: 'danger',  icon: 'alert-circle-outline', title: 'Absence Rate Critical',   desc: `${absenceRate.toFixed(1)}% - immediate review needed.` });
  else if (absenceRate > 5)
    out.push({ type: 'warning', icon: 'alert-circle-outline', title: 'Absence Rate Elevated',   desc: `${absenceRate.toFixed(1)}% - review department patterns.` });
  else
    out.push({ type: 'success', icon: 'checkmark-circle-outline', title: 'Absence Under Control',   desc: `${absenceRate.toFixed(1)}% within healthy range.` });
  if (highRisks >= 3)
    out.push({ type: 'danger',  icon: 'alert-circle-outline', title: `${highRisks} High-Risk Flags`, desc: 'Multiple employees at risk. Retention action required.' });
  else if (highRisks >= 1)
    out.push({ type: 'warning', icon: 'warning-outline', title: `${highRisks} Turnover Risk${highRisks > 1 ? 's' : ''}`, desc: 'Engage proactively with flagged employees.' });
  else
    out.push({ type: 'success', icon: 'radio-button-on-outline', title: 'Retention Stable',        desc: 'No high-risk turnover flags this period.' });
  if (otForecast > 80)
    out.push({ type: 'warning', icon: 'timer-outline', title: 'Heavy OT Projected',      desc: `${otForecast.toFixed(1)} hrs next week - consider redistribution.` });
  else if (otForecast > 40)
    out.push({ type: 'info',    icon: 'timer-outline', title: 'Moderate OT Expected',    desc: `${otForecast.toFixed(1)} hrs - monitor workload.` });
  else
    out.push({ type: 'success', icon: 'timer-outline', title: 'OT Workload Balanced',    desc: `${otForecast.toFixed(1)} hrs within normal range.` });
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
  const { user, justLoggedIn, clearLoginFlag } = useAuth();
  const insets      = useSafeAreaInsets();
  const [summary,     setSummary]     = useState({});
  const [analytics,   setAnalytics]   = useState(null);
  const [aiError,     setAiError]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState('');
  const [lastFetched, setLastFetched] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast,       setToast]       = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => {
    if (justLoggedIn) {
      const firstName = user?.full_name?.split(' ')[0] || 'there';
      showToast(`Welcome back, ${firstName}! You are now logged in.`);
      clearLoginFlag();
    }
  }, [justLoggedIn]);

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
      const aiData = aiRes.data?.success ? aiRes.data : null;
      setAnalytics(aiData);
      setAiError(!aiData);
      setLastFetched(new Date());
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Unable to load HR dashboard.'));
    } finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { loadData(); }, [user?.user_id]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadData();
      if (user?.user_id) {
        api.get('/notifications', { params: { user_id: user.user_id } })
          .then(({ data }) => setUnreadCount(Number(data.unread_count || 0)))
          .catch(() => {});
      }
    });
    return unsub;
  }, [navigation, user?.user_id]);
  useEffect(() => {
    if (!user?.user_id) return;
    api.get('/notifications', { params: { user_id: user.user_id } })
      .then(({ data }) => setUnreadCount(Number(data.unread_count || 0)))
      .catch(() => {});
    const socket = io(BASE_URL, { query: { user_id: user.user_id }, transports: ['websocket'], reconnectionAttempts: 5 });
    socket.on('notification_count', (count) => setUnreadCount(Number(count || 0)));
    socket.on('connect_error', () => {});
    socket.on('error', () => {});
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
    { icon: 'people',    label: 'Total',     value: Number(summary.totalEmployees || 0).toLocaleString(),  sub: 'Employees',          color: '#2563eb' },
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
    <View style={s.root}>
    <ScrollView
      style={{ flex: 1 }}
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
              <Ionicons name="shield-checkmark" size={11} color="#bfdbfe" />
              <Text style={s.rolePillText}>{user?.role || 'HR'} · People Operations</Text>
            </View>
            <Text style={s.headerGreeting}>Welcome back,</Text>
            <Text style={s.headerName}>{firstName}</Text>
            <Text style={s.headerDate}>{today}</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => navigation.navigate('Notifications')} accessibilityLabel="Notifications">
              <Ionicons name="notifications" size={20} color="rgba(255,255,255,0.85)" />
              {unreadCount > 0 && (
                <View style={s.notifBadge}><Text style={s.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.avatarBtn} onPress={() => navigation.navigate('Settings', {})} accessibilityLabel="Account settings">
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

        <Card accent="#2563eb">
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
              <Text style={[s.bigStat, { color: '#2563eb' }]}>{activeP}%</Text>
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

        {/* ── PAYROLL ── */}
        <SectionLabel title="Payroll" icon="cash" />

        <Card accent="#22d3ee">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Payroll Status</Text>
            <Text style={s.cardBadge}>{summary.processedPayrolls || 0} runs</Text>
          </View>
          {payrollItems.length === 0
            ? <Text style={s.emptyText}>No payroll data.</Text>
            : payrollItems.map((item, i) => (
                <CardRow key={item.label} label={item.label} value={item.value} color={CHART_COLORS[i % 6]} sub="payroll status" />
              ))
          }
        </Card>

        <Card accent="#34d399">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Payroll Forecast</Text>
            <Text style={s.cardBadge}>Recent runs</Text>
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

        {/* ── LEAVE & OVERTIME ── */}
        <SectionLabel title="Leave & Overtime" icon="calendar" />

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

        <Card accent="#60a5fa">
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
            <Text style={s.footerText}>Next wk est. <Text style={[s.footerBold, { color: '#60a5fa' }]}>{Number(as.nextWeekOtForecast || 0).toFixed(1)} hrs</Text></Text>
            <Text style={s.footerText}>Trend <Text style={s.footerBold}>{analytics?.forecast?.direction || 'Stable'}</Text></Text>
          </View>
        </Card>

        {/* ── RISK & ANALYTICS ── */}
        <SectionLabel title="Risk & Analytics" icon="alert-circle" />

        <Card accent="#f87171">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Turnover Risk</Text>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={s.cardBadge}>{topRisks.length} flagged</Text>
              {lastFetched ? (
                <Text style={[s.cardBadge, { fontSize: 9 }]}>
                  {'Updated ' + lastFetched.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </Text>
              ) : null}
            </View>
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

        {/* ── AI INSIGHTS ── */}
        <SectionLabel title="AI Insights" icon="sparkles" />

        <Card accent="#2563eb">
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>Workforce Intelligence</Text>
            <View style={s.aiBadge}><Text style={s.aiBadgeText}>AI</Text></View>
          </View>

          {aiError ? (
            <View style={s.aiUnavailableWrap}>
              <Ionicons name="cloud-offline-outline" size={20} color="#94a3b8" />
              <View style={{ flex: 1 }}>
                <Text style={[s.aiUnavailableText, { fontWeight: '700', marginBottom: 4 }]}>
                  AI Analytics Unavailable
                </Text>
                <Text style={s.aiUnavailableText}>
                  The AI service could not be reached. Pull down to refresh and retry.
                </Text>
              </View>
            </View>
          ) : (
            <>
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

              <View style={s.insightList}>
                {aiInsights.map((ins) => {
                  const ic = INSIGHT_COLORS[ins.type];
                  return (
                    <View key={ins.title} style={[s.insightItem, { backgroundColor: ic.bg, borderLeftColor: ic.fg }]}>
                      <View style={[s.insightIconWrap, { backgroundColor: ic.iconBg }]}>
                        <Ionicons name={ins.icon} size={15} color={ic.fg} />
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
            </>
          )}
        </Card>
      </View>
    </ScrollView>
      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
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
    backgroundColor: '#60a5fa', opacity: 0.12,
    top: -60, right: -40,
  },
  headerCircle2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#93c5fd', opacity: 0.08,
    top: 20, right: 80,
  },
  headerInner:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerLeft:   { flex: 1, marginRight: 8 },
  rolePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  rolePillText: { fontSize: 11, color: '#bfdbfe', fontWeight: '700', letterSpacing: 0.3 },
  headerGreeting: { fontSize: 13, color: '#93c5fd', fontWeight: '500' },
  headerName:   { fontSize: 26, fontWeight: '900', color: '#fff', marginTop: 2 },
  headerDate:   { fontSize: 11, color: '#93c5fd', marginTop: 4 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn:{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  notifBadge:   { position: 'absolute', top: 4, right: 4, backgroundColor: '#f87171', borderRadius: 7, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  avatarBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText:   { color: '#fff', fontSize: 16, fontWeight: '900' },

  // ── KPI Strip ──
  kpiStrip:     { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.12)', marginHorizontal: -20, paddingHorizontal: 12, paddingVertical: 14, gap: 4 },
  kpiItem:      { flex: 1, alignItems: 'center', gap: 3 },
  kpiIconWrap:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  kpiValue:     { fontSize: 18, fontWeight: '900' },
  kpiLabel:     { fontSize: 9, color: '#fff', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  kpiSub:       { fontSize: 8, color: '#93c5fd', textAlign: 'center' },

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
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', padding: 12 },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  emptyText: { fontSize: 13, color: T.textMuted, fontStyle: 'italic', paddingVertical: 4 },
  aiUnavailableWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: T.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 10, marginBottom: 12 },
  aiUnavailableText: { flex: 1, fontSize: 11, color: T.textMuted, lineHeight: 16 },
  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },
});
