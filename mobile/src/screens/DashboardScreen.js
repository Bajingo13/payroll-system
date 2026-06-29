import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { api, getApiMessage, getAssetUrl } from '../api/client';
import { API_BASE_URL } from '../config';
import { io } from 'socket.io-client';
import AttendanceFlow from '../components/AttendanceFlow';

const BASE_URL = API_BASE_URL.replace('/api', '');

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

export default function DashboardScreen({ navigation }) {
  const { user, logout, justLoggedIn, clearLoginFlag } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowAction, setFlowAction] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => {
    if (justLoggedIn) {
      const firstName = user?.full_name?.split(' ')[0] || 'there';
      showToast(`Welcome back, ${firstName}! You are now logged in.`);
      clearLoginFlag();
    }
  }, [justLoggedIn]);

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

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadDashboard();
      if (user?.user_id) {
        api.get('/notifications', { params: { user_id: user.user_id } })
          .then(({ data }) => setUnreadCount(Number(data.unread_count || 0)))
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, [navigation, user?.user_id]);

  // Real-time notification count via Socket.io
  useEffect(() => {
    if (!user?.user_id) return;
    // Initial fetch
    api.get('/notifications', { params: { user_id: user.user_id } })
      .then(({ data }) => setUnreadCount(Number(data.unread_count || 0)))
      .catch(() => {});
    // Socket.io live updates
    const socket = io(BASE_URL, {
      query: { user_id: user.user_id },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socket.on('notification_count', (count) => setUnreadCount(Number(count || 0)));
    socket.on('connect_error', () => {});
    socket.on('error', () => {});
    return () => socket.disconnect();
  }, [user?.user_id]);

  const todayState = data?.todayTime || {};
  const employee = data?.employee || {};
  const payrollSummary = data?.payrollSummary || null;
  const profilePhotoUrl = getAssetUrl(data?.profilePhotoUrl);
  const shiftHours = Number(data?.payrollSettings?.hours_in_day) || 8;

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
  const progressPercent = Math.min(100, Math.round((workedSeconds / (shiftHours * 3600)) * 100));

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

  async function submitTimeEntry(type, location, photoCapture) {
    if (!user?.user_id || busy) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('user_id', String(user.user_id));
      formData.append('type', type);
      if (location?.latitude != null)  formData.append('latitude',   String(location.latitude));
      if (location?.longitude != null) formData.append('longitude',  String(location.longitude));
      if (location?.distance_m != null) formData.append('distance_m', String(location.distance_m));
      const frontPhoto = photoCapture?.front || null;
      const backPhoto = photoCapture?.back || null;
      const selectedPhoto = frontPhoto || backPhoto;
      if (photoCapture?.mode) formData.append('camera_mode', photoCapture.mode);
      if (selectedPhoto?.uri) {
        formData.append('photo', {
          uri: selectedPhoto.uri,
          type: 'image/jpeg',
          name: `attendance_${user.user_id}_${Date.now()}_${photoCapture?.mode || 'photo'}.jpg`,
        });
      }
      const { data: payload } = await api.post('/employee/time-entry', formData, {
        headers: { 'Content-Type': undefined },
      });
      if (!payload.success) throw new Error(payload.message);
      if (payload.todayTime) {
        setData((prev) => ({ ...(prev || {}), todayTime: payload.todayTime }));
      }
      await loadDashboard();
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to record time entry.'));
    } finally {
      setBusy(false);
    }
  }

  function openFlow(action = null) {
    setFlowAction(action);
    setFlowOpen(true);
  }

  function closeFlow() {
    setFlowOpen(false);
    setFlowAction(null);
  }

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const BTN_ICONS = { time_in: 'log-in-outline', break_out: 'cafe-outline', break_in: 'return-down-back-outline', time_out: 'log-out-outline' };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
    <AttendanceFlow
      visible={flowOpen}
      onClose={closeFlow}
      employee={employee}
      todayState={todayState}
      onSubmit={submitTimeEntry}
      busy={busy}
      initialAction={flowAction}
    />
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} tintColor="#fff" />}
    >
      {/* ── Blue Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <Text style={s.greeting}>Good day, {employee.first_name || user?.full_name || 'there'}</Text>
            <Text style={s.date}>{today}</Text>
          </View>
          <View style={s.headerIcons}>
            <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Notifications')} accessibilityLabel="Notifications">
              <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.85)" />
              {unreadCount > 0 && (
                <View style={s.badge}><Text style={s.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.avatarBtn}
              onPress={() => navigation.navigate('Settings', { employee, profilePhotoUrl: data?.profilePhotoUrl })}
              accessibilityLabel="Account settings">
              {profilePhotoUrl
                ? <Image source={{ uri: profilePhotoUrl }} style={s.avatarBtnImg} />
                : <Text style={s.avatarBtnText}>{String(employee.first_name || user?.full_name || 'U')[0].toUpperCase()}</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Employee info pills */}
        <View style={s.infoPills}>
          {[
            { icon: 'card-outline', label: employee.emp_code || '-' },
            { icon: 'business-outline', label: employee.department || '-' },
            { icon: 'briefcase-outline', label: employee.position || '-' },
          ].map((item) => (
            <View key={item.icon} style={s.infoPill}>
              <Ionicons name={item.icon} size={11} color="#93c5fd" />
              <Text style={s.infoPillText} numberOfLines={1}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Status + duration in header */}
        <View style={s.statusWrap}>
          <View style={[s.statusDot, { backgroundColor: statusColor === '#64748b' ? '#94a3b8' : statusColor }]} />
          <Text style={s.statusLabel}>{clockStatus}</Text>
          <Text style={s.workedText}> · {formatDuration(workedSeconds)} worked</Text>
        </View>

        {/* Progress bar */}
        <View style={s.progressBg}>
          <View style={[s.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <Text style={s.progressLabel}>{progressPercent}% of {shiftHours}-hour shift</Text>
      </View>

      {/* ── Body ── */}
      <View style={s.body}>
        {/* Time entry buttons */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Record Attendance</Text>
          <View style={s.btnGrid}>
            {timeButtons.map((btn) => (
              <TouchableOpacity
                key={btn.key}
                style={[s.timeBtn, btn.disabled && s.timeBtnOff]}
                onPress={() => openFlow(btn.key)}
                disabled={btn.disabled || busy}
              >
                <Ionicons name={BTN_ICONS[btn.key]} size={20} color={btn.disabled ? '#cbd5e1' : '#fff'} />
                <Text style={[s.timeBtnText, btn.disabled && s.timeBtnTextOff]}>{btn.label}</Text>
                {btn.disabled && <Ionicons name="checkmark-circle" size={14} color="#22c55e" style={s.timeBtnCheck} />}
              </TouchableOpacity>
            ))}
          </View>
          {busy && <ActivityIndicator color="#1e40af" size="small" style={{ marginTop: 8 }} />}
        </View>

        {/* Today's time entries */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Today's Log</Text>
          <View style={s.timeRow}>
            {[
              { label: 'Time In', value: formatTime(todayState.timeIn), color: '#22c55e', icon: 'log-in' },
              { label: 'Break Out', value: formatTime(todayState.breakOut), color: '#f59e0b', icon: 'cafe' },
              { label: 'Break In', value: formatTime(todayState.breakIn), color: '#f59e0b', icon: 'return-down-back' },
              { label: 'Time Out', value: formatTime(todayState.timeOut), color: '#ef4444', icon: 'log-out' },
            ].map((item) => (
              <View key={item.label} style={s.timeEntry}>
                <View style={[s.timeEntryIcon, { backgroundColor: item.value === '-' ? '#f1f5f9' : item.color + '20' }]}>
                  <Ionicons name={item.icon + '-outline'} size={16} color={item.value === '-' ? '#cbd5e1' : item.color} />
                </View>
                <Text style={[s.timeEntryVal, item.value === '-' && { color: '#cbd5e1' }]}>{item.value}</Text>
                <Text style={s.timeEntryLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <View style={s.otRow}>
            <Ionicons name="time-outline" size={14} color="#94a3b8" />
            <Text style={s.otLabel}>Overtime Today</Text>
            <Text style={[s.otValue, { color: workedSeconds > shiftHours * 3600 ? '#15803d' : '#94a3b8' }]}>
              {formatDuration(Math.max(0, workedSeconds - shiftHours * 3600))}
            </Text>
          </View>
        </View>

        {/* Latest Payroll */}
        <View style={s.payrollCard}>
          <View style={s.payrollHeader}>
            <View>
              <Text style={s.payrollLabel}>Latest Payroll</Text>
              <Text style={s.payrollPeriod}>{payrollSummary?.payroll_range || 'No payroll data yet'}</Text>
            </View>
            <View style={s.payrollStatus}>
              <Text style={s.payrollStatusText}>{payrollSummary?.payroll_status || 'N/A'}</Text>
            </View>
          </View>
          <View style={s.payrollDivider} />
          <View style={s.payrollRow}>
            <Text style={s.payrollRowLabel}>Gross Pay</Text>
            <Text style={s.payrollRowValue}>{money(payrollSummary?.gross_pay)}</Text>
          </View>
          <View style={s.payrollRow}>
            <Text style={s.payrollRowLabel}>Deductions</Text>
            <Text style={[s.payrollRowValue, { color: '#fca5a5' }]}>{money(payrollSummary?.total_deductions)}</Text>
          </View>
          <View style={s.payrollDivider} />
          <View style={s.payrollRow}>
            <Text style={[s.payrollRowLabel, { fontWeight: '700', color: '#fff' }]}>Net Pay</Text>
            <Text style={s.payrollNet}>{money(payrollSummary?.net_pay)}</Text>
          </View>
        </View>

        {message ? (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
            <Text style={s.errorText}>{message}</Text>
          </View>
        ) : null}
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingBottom: 48 },
  // ── Header ──
  header: { backgroundColor: '#1e3a8a', paddingHorizontal: 20, paddingBottom: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerLeft: { flex: 1, marginRight: 8 },
  greeting: { fontSize: 20, fontWeight: '800', color: '#fff' },
  date: { fontSize: 11, color: '#93c5fd', marginTop: 3 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  avatarBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarBtnImg: { width: 38, height: 38, borderRadius: 19 },
  avatarBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  badge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  infoPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  infoPillText: { fontSize: 11, color: '#bfdbfe', fontWeight: '600', maxWidth: 100 },
  statusWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusLabel: { fontSize: 14, fontWeight: '700', color: '#fff' },
  workedText: { fontSize: 13, color: '#93c5fd' },
  progressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#22c55e' },
  progressLabel: { fontSize: 11, color: '#93c5fd' },

  // ── Body ──
  body: { padding: 16, gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 14 },

  // Time entry buttons
  btnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: { width: '47%', backgroundColor: '#1e40af', borderRadius: 14, paddingVertical: 12, alignItems: 'center', gap: 4, shadowColor: '#1e40af', shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  timeBtnOff: { backgroundColor: '#f1f5f9', shadowOpacity: 0 },
  timeBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  timeBtnTextOff: { color: '#94a3b8' },
  timeBtnCheck: { position: 'absolute', top: 6, right: 6 },

  // Today's log
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  timeEntry: { alignItems: 'center', gap: 4, flex: 1 },
  timeEntryIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timeEntryVal: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  timeEntryLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  otRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  otLabel: { fontSize: 12, color: '#64748b', flex: 1 },
  otValue: { fontSize: 13, fontWeight: '700' },

  // Payroll card
  payrollCard: { backgroundColor: '#1e3a8a', borderRadius: 20, padding: 18, gap: 8, elevation: 6, shadowColor: '#1e3a8a', shadowOpacity: 0.3, shadowRadius: 10 },
  payrollHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  payrollLabel: { fontSize: 11, color: '#93c5fd', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  payrollPeriod: { fontSize: 13, color: '#bfdbfe', marginTop: 2 },
  payrollStatus: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  payrollStatusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  payrollDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  payrollRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payrollRowLabel: { fontSize: 13, color: '#93c5fd' },
  payrollRowValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  payrollNet: { fontSize: 22, fontWeight: '900', color: '#86efac' },

  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', padding: 12 },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },

  // Legacy stubs (kept to avoid missing style warnings)
  logoutBtn: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  logoutText: { color: '#b91c1c', fontWeight: '600', fontSize: 13 },
  recordBtnBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recordBtnBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
