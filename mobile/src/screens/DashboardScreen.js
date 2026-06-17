import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';
import AttendanceFlow from '../components/AttendanceFlow';

function parseDateTime(value) {
  if (!value) return null;
  const str = String(value).replace(' ', 'T');
  const withTz = str.includes('+') || str.includes('Z') ? str : str + '+08:00';
  const d = new Date(withTz);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds || 0));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((p) => String(p).padStart(2, '0'))
    .join(':');
}

function formatTime(value) {
  if (!value) return '-';
  const str = String(value).replace(' ', 'T');
  const withTz = str.includes('+') || str.includes('Z') ? str : str + '+08:00';
  const d = new Date(withTz);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
}

function money(value) {
  return `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [flowOpen, setFlowOpen] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);


  async function loadDashboard(showRefresh = false) {
    if (!user?.user_id) return;
    if (showRefresh) setRefreshing(true);
    try {
      const { data: payload } = await api.get('/employee_dashboard', {
        params: { user_id: user.user_id },
      });
      if (!payload.success) throw new Error(payload.message);
      setData(payload);
      setMessage('');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load dashboard.'));
    } finally {
      if (showRefresh) setRefreshing(false);
    }
  }

  useEffect(() => { loadDashboard(); }, [user?.user_id]);

  const todayState = data?.todayTime || {};
  const employee = data?.employee || {};
  const payrollSummary = data?.payrollSummary || null;

  const workedSeconds = useMemo(() => {
    const timeIn = parseDateTime(todayState.timeIn);
    if (!timeIn) return 0;
    const timeOut = parseDateTime(todayState.timeOut);
    const breakOut = parseDateTime(todayState.breakOut);
    const breakIn = parseDateTime(todayState.breakIn);
    const end = timeOut || now;
    let breakSec = 0;
    if (breakOut) {
      const breakEnd = breakIn || (!timeOut ? now : null);
      if (breakEnd && breakEnd > breakOut) {
        breakSec = Math.floor((breakEnd - breakOut) / 1000);
      }
    }
    return Math.max(0, Math.floor((end - timeIn) / 1000) - breakSec);
  }, [todayState, now]);

  const isOnBreak = Boolean(todayState.hasBreakOut && !todayState.hasBreakIn && !todayState.hasTimeOut);
  const isClockedIn = Boolean(todayState.hasTimeIn && !todayState.hasTimeOut && !isOnBreak);
  const clockStatus = todayState.hasTimeOut
    ? 'Clocked Out'
    : isOnBreak
    ? 'On Break'
    : isClockedIn
    ? 'Clocked In'
    : 'Not Started';

  const statusColor = isClockedIn ? '#15803d' : isOnBreak ? '#d97706' : '#64748b';
  const progressPercent = Math.min(100, Math.round((workedSeconds / (8 * 3600)) * 100));

  const timeButtons = useMemo(() => {
    const { hasTimeIn, hasBreakOut, hasBreakIn, hasTimeOut } = todayState;
    return [
      { key: 'time_in', label: 'Time In', disabled: Boolean(hasTimeIn) },
      {
        key: 'break_out',
        label: 'Break Out',
        disabled: !hasTimeIn || Boolean(hasBreakOut) || Boolean(hasTimeOut),
      },
      {
        key: 'break_in',
        label: 'Break In',
        disabled: !hasBreakOut || Boolean(hasBreakIn) || Boolean(hasTimeOut),
      },
      {
        key: 'time_out',
        label: 'Time Out',
        disabled: !hasTimeIn || (Boolean(hasBreakOut) && !hasBreakIn) || Boolean(hasTimeOut),
      },
    ];
  }, [todayState]);

  async function submitTimeEntry(type) {
    if (!user?.user_id || busy) return;
    setBusy(true);
    try {
      const { data: payload } = await api.post('/employee/time-entry', {
        user_id: user.user_id,
        type,
      });
      if (!payload.success) throw new Error(payload.message);
      if (payload.todayTime) {
        setData((prev) => ({ ...(prev || {}), todayTime: payload.todayTime }));
      }
      await loadDashboard();
    } catch (err) {
      Alert.alert('Error', getApiMessage(err, 'Unable to record time entry.'));
    } finally {
      setBusy(false);
    }
  }

  function confirmLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  }

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
    <AttendanceFlow
      visible={flowOpen}
      onClose={() => setFlowOpen(false)}
      employee={employee}
      todayState={todayState}
      onSubmit={submitTimeEntry}
      busy={busy}
    />
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadDashboard(true)}
          tintColor="#1e40af"
        />
      }
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>
            Hello, {employee.first_name || user?.full_name || 'there'} 👋
          </Text>
          <Text style={s.date}>{today}</Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={confirmLogout}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Info chips */}
      <View style={s.infoRow}>
        <View style={s.infoChip}>
          <Text style={s.infoLabel}>ID</Text>
          <Text style={s.infoValue}>{employee.emp_code || '-'}</Text>
        </View>
        <View style={[s.infoChip, { flex: 2 }]}>
          <Text style={s.infoLabel}>Department</Text>
          <Text style={s.infoValue} numberOfLines={1}>{employee.department || '-'}</Text>
        </View>
        <View style={[s.infoChip, { flex: 2 }]}>
          <Text style={s.infoLabel}>Position</Text>
          <Text style={s.infoValue} numberOfLines={1}>{employee.position || '-'}</Text>
        </View>
      </View>

      {/* Timekeeping card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Timekeeping</Text>

        {/* Status */}
        <View style={s.statusRow}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{clockStatus}</Text>
          <Text style={s.workedText}>  •  {formatDuration(workedSeconds)} worked</Text>
        </View>

        {/* Progress bar */}
        <View style={s.progressBg}>
          <View
            style={[
              s.progressFill,
              { width: `${progressPercent}%`, backgroundColor: statusColor },
            ]}
          />
        </View>
        <Text style={s.progressLabel}>{progressPercent}% of 8-hour shift</Text>

        {/* Record Attendance button */}
        <TouchableOpacity style={s.recordBtn} onPress={() => setFlowOpen(true)}>
          <Text style={s.recordBtnText}>📍  Record Attendance</Text>
          <View style={s.recordBtnBadge}><Text style={s.recordBtnBadgeText}>Mobile Flow</Text></View>
        </TouchableOpacity>

        {/* Time entry buttons */}
        <View style={s.btnRow}>
          {timeButtons.map((btn) => (
            <TouchableOpacity
              key={btn.key}
              style={[s.timeBtn, btn.disabled && s.timeBtnOff]}
              onPress={() => submitTimeEntry(btn.key)}
              disabled={btn.disabled || busy}
            >
              <Text style={[s.timeBtnText, btn.disabled && s.timeBtnTextOff]}>
                {btn.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {busy && <ActivityIndicator color="#1e40af" style={{ marginBottom: 8 }} />}

        {/* Time details grid */}
        <View style={s.timeGrid}>
          {[
            { label: 'Time In', value: formatTime(todayState.timeIn) },
            { label: 'Break Out', value: formatTime(todayState.breakOut) },
            { label: 'Break In', value: formatTime(todayState.breakIn) },
            { label: 'Time Out', value: formatTime(todayState.timeOut) },
          ].map((item) => (
            <View key={item.label} style={s.timeItem}>
              <Text style={s.timeItemLabel}>{item.label}</Text>
              <Text style={s.timeItemValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Overtime */}
        <View style={s.otRow}>
          <Text style={s.otLabel}>Overtime Today</Text>
          <Text style={[s.otValue, { color: workedSeconds > 28800 ? '#15803d' : '#94a3b8' }]}>
            {formatDuration(Math.max(0, workedSeconds - 28800))}
          </Text>
        </View>
      </View>

      {/* Latest Payroll card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Latest Payroll</Text>
        <Text style={s.periodText}>{payrollSummary?.payroll_range || 'No payroll data yet'}</Text>
        <View style={s.payRow}>
          <Text style={s.payLabel}>Gross Pay</Text>
          <Text style={s.payValue}>{money(payrollSummary?.gross_pay)}</Text>
        </View>
        <View style={s.payRow}>
          <Text style={s.payLabel}>Deductions</Text>
          <Text style={[s.payValue, { color: '#b91c1c' }]}>{money(payrollSummary?.total_deductions)}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.payRow}>
          <Text style={[s.payLabel, { fontWeight: '700' }]}>Net Pay</Text>
          <Text style={[s.payValue, { color: '#15803d', fontSize: 20, fontWeight: '800' }]}>
            {money(payrollSummary?.net_pay)}
          </Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: '#dbeafe' }]}>
          <Text style={[s.statusPillText, { color: '#1e40af' }]}>
            Status: {payrollSummary?.payroll_status || '-'}
          </Text>
        </View>
      </View>

      {message ? <Text style={s.errorText}>{message}</Text> : null}
    </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  greeting: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  date: { fontSize: 11, color: '#64748b', marginTop: 2 },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: { color: '#b91c1c', fontWeight: '600', fontSize: 13 },
  infoRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  infoChip: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  infoLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 12, fontWeight: '600', color: '#1e293b', marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  statusLabel: { fontSize: 15, fontWeight: '600' },
  workedText: { fontSize: 13, color: '#475569' },
  progressBg: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  timeBtn: {
    flex: 1,
    backgroundColor: '#1e40af',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  timeBtnOff: { backgroundColor: '#e2e8f0' },
  timeBtnText: { color: '#fff', fontWeight: '600', fontSize: 11 },
  timeBtnTextOff: { color: '#94a3b8' },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  timeItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
  },
  timeItemLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' },
  timeItemValue: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginTop: 2 },
  otRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    marginTop: 4,
  },
  otLabel: { fontSize: 13, color: '#64748b' },
  otValue: { fontSize: 14, fontWeight: '700' },
  periodText: { fontSize: 12, color: '#64748b', marginTop: -6, marginBottom: 12 },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  payLabel: { fontSize: 14, color: '#475569' },
  payValue: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },
  statusPill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  statusPillText: { fontSize: 12, fontWeight: '600' },
  errorText: { color: '#b91c1c', textAlign: 'center', marginTop: 8 },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e40af',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#1e40af',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  recordBtnText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
  recordBtnBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recordBtnBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
