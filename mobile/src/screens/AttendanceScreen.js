import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';
import HeaderActions from '../components/HeaderActions';

function todayStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function formatDateLabel(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function computeHours(record) {
  if (!record.time_in || !record.time_out) return null;
  const t1 = new Date(String(record.time_in).replace(' ', 'T')).getTime();
  const t2 = new Date(String(record.time_out).replace(' ', 'T')).getTime();
  if (t2 <= t1) return null;
  let breakMs = 0;
  if (record.break_out && record.break_in) {
    const b1 = new Date(String(record.break_out).replace(' ', 'T')).getTime();
    const b2 = new Date(String(record.break_in).replace(' ', 'T')).getTime();
    if (b2 > b1) breakMs = b2 - b1;
  }
  return ((t2 - t1 - breakMs) / 3600000).toFixed(2);
}

function getStatus(record) {
  if (!record.time_in) return { label: 'Absent', color: '#b91c1c', bg: '#fee2e2', icon: 'close-circle' };
  if (!record.time_out || (record.break_out && !record.break_in))
    return { label: 'Incomplete', color: '#d97706', bg: '#fef3c7', icon: 'time' };
  return { label: 'Present', color: '#15803d', bg: '#dcfce7', icon: 'checkmark-circle' };
}

export default function AttendanceScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [records,    setRecords]    = useState([]);
  const [dateHired,  setDateHired]  = useState(null); // 'YYYY-MM-DD'
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activePicker, setActivePicker] = useState(null); // 'from' | 'to' | null

  // Fetch hire date once on mount
  useEffect(() => {
    if (!user?.user_id) return;
    api.get('/employee_dashboard', { params: { user_id: user.user_id } })
      .then(({ data }) => {
        const hired = data?.employee?.date_hired;
        if (hired) setDateHired(String(hired).slice(0, 10));
      })
      .catch(() => {});
  }, [user?.user_id]);

  function onDateChange(event, selectedDate) {
    const field = activePicker;
    setActivePicker(null);
    if (event.type === 'set' && selectedDate) {
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      const str = `${y}-${m}-${d}`;
      if (field === 'from') setFrom(str);
      else setTo(str);
    }
  }

  function getPickerDate(field) {
    const val = field === 'from' ? from : to;
    if (val) {
      const d = new Date(`${val}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  async function load(f, t) {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/attendance_overview', {
        params: { from: f, to: t || f, user_id: user?.user_id },
      });
      setRecords(data.records || []);
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load attendance.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(from, to); }, []);

  // Strip any records the API returns that fall before the hire date
  const validRecords = dateHired
    ? records.filter((r) => !r.attendance_date || String(r.attendance_date).slice(0, 10) >= dateHired)
    : records;

  const present    = validRecords.filter((r) => getStatus(r).label === 'Present').length;
  const absent     = validRecords.filter((r) => getStatus(r).label === 'Absent').length;
  const incomplete = validRecords.filter((r) => getStatus(r).label === 'Incomplete').length;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(from, to)} tintColor="#fff" />}
    >
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={s.headerTitle}>Attendance</Text>
            <Text style={s.headerSub}>View your timekeeping records</Text>
            {dateHired && (
              <Text style={s.hiredNote}>Records start from {formatDateLabel(dateHired)}</Text>
            )}
          </View>
          <HeaderActions navigation={navigation} />
        </View>

        {/* Summary pills */}
        <View style={s.summaryRow}>
          {[
            { label: 'Present', count: present, color: '#86efac', bg: 'rgba(34,197,94,0.15)', icon: 'checkmark-circle' },
            { label: 'Absent', count: absent, color: '#fca5a5', bg: 'rgba(239,68,68,0.15)', icon: 'close-circle' },
            { label: 'Incomplete', count: incomplete, color: '#fcd34d', bg: 'rgba(245,158,11,0.15)', icon: 'time' },
            { label: 'Total', count: records.length, color: '#bfdbfe', bg: 'rgba(255,255,255,0.1)', icon: 'calendar' },
          ].map((item) => (
            <View key={item.label} style={[s.summaryPill, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon + '-outline'} size={16} color={item.color} />
              <Text style={[s.summaryCount, { color: item.color }]}>{item.count}</Text>
              <Text style={s.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Date filter */}
        <View style={s.filterRow}>
          <TouchableOpacity style={s.filterInput} onPress={() => setActivePicker('from')}>
            <Ionicons name="calendar-outline" size={14} color="#93c5fd" />
            <Text style={s.filterText}>{from || 'From'}</Text>
          </TouchableOpacity>
          <Text style={s.filterSep}>→</Text>
          <TouchableOpacity style={s.filterInput} onPress={() => setActivePicker('to')}>
            <Ionicons name="calendar-outline" size={14} color="#93c5fd" />
            <Text style={s.filterText}>{to || 'To'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.applyBtn}
            accessibilityLabel="Search attendance records"
            onPress={() => {
              if (from && to && new Date(`${from}T00:00:00`) > new Date(`${to}T00:00:00`)) {
                setError('"From" date cannot be after "To" date.');
                return;
              }
              if (dateHired && from < dateHired) {
                setError(`Attendance records start from your hire date (${formatDateLabel(dateHired)}).`);
                return;
              }
              load(from, to);
            }}
          >
            <Ionicons name="search-outline" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        {activePicker && (
          <DateTimePicker
            value={getPickerDate(activePicker)}
            mode="date"
            display="default"
            minimumDate={dateHired ? new Date(`${dateHired}T00:00:00`) : undefined}
            maximumDate={new Date()}
            onChange={onDateChange}
          />
        )}
      </View>

      {/* ── Records ── */}
      <View style={s.body}>
        {error ? (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {validRecords.length === 0 && !loading ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={52} color="#cbd5e1" />
            <Text style={s.emptyText}>No attendance records</Text>
            <Text style={s.emptySub}>Try adjusting the date range</Text>
          </View>
        ) : null}

        {validRecords.map((record, i) => {
          const status = getStatus(record);
          const hours = computeHours(record);
          const lateMin = record.late_minutes != null ? Number(record.late_minutes) : 0;
          const utMin = record.undertime_minutes != null ? Number(record.undertime_minutes) : 0;
          const tIn = formatTime(record.time_in);
          const tOut = formatTime(record.time_out);
          const bOut = formatTime(record.break_out);
          const bIn = formatTime(record.break_in);

          return (
            <View key={`${record.attendance_date}-${i}`} style={s.card}>
              {/* Card header */}
              <View style={s.cardHeader}>
                <View style={s.cardDate}>
                  <Text style={s.cardDateText}>{formatDateLabel(record.attendance_date)}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
                  <Ionicons name={status.icon + '-outline'} size={11} color={status.color} />
                  <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>

              {/* Time entries row */}
              <View style={s.entryRow}>
                {[
                  { label: 'In', value: tIn, color: '#22c55e', icon: 'log-in' },
                  { label: 'Break Out', value: bOut, color: '#f59e0b', icon: 'cafe' },
                  { label: 'Break In', value: bIn, color: '#f59e0b', icon: 'return-down-back' },
                  { label: 'Out', value: tOut, color: '#ef4444', icon: 'log-out' },
                ].map((entry) => (
                  <View key={entry.label} style={s.entryItem}>
                    <View style={[s.entryIcon, { backgroundColor: entry.value ? entry.color + '18' : '#f1f5f9' }]}>
                      <Ionicons name={entry.icon + '-outline'} size={13} color={entry.value ? entry.color : '#cbd5e1'} />
                    </View>
                    <Text style={[s.entryTime, !entry.value && { color: '#cbd5e1' }]}>{entry.value || '—'}</Text>
                    <Text style={s.entryLabel}>{entry.label}</Text>
                  </View>
                ))}
              </View>

              {/* Stats */}
              {(hours || lateMin > 0 || utMin > 0) ? (
                <View style={s.statsRow}>
                  {hours ? (
                    <View style={s.statChip}>
                      <Ionicons name="time-outline" size={11} color="#1e40af" />
                      <Text style={s.statChipText}>{hours} hrs</Text>
                    </View>
                  ) : null}
                  {lateMin > 0 ? (
                    <View style={[s.statChip, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                      <Ionicons name="alert-circle-outline" size={11} color="#b91c1c" />
                      <Text style={[s.statChipText, { color: '#b91c1c' }]}>Late {lateMin}m</Text>
                    </View>
                  ) : null}
                  {utMin > 0 ? (
                    <View style={[s.statChip, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                      <Ionicons name="trending-down-outline" size={11} color="#b91c1c" />
                      <Text style={[s.statChipText, { color: '#b91c1c' }]}>UT {utMin}m</Text>
                    </View>
                  ) : null}
                  {hours && Number(hours) > 8 ? (
                    <View style={[s.statChip, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                      <Ionicons name="trending-up-outline" size={11} color="#15803d" />
                      <Text style={[s.statChipText, { color: '#15803d' }]}>OT {(Number(hours) - 8).toFixed(2)}h</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingBottom: 48 },
  header: { backgroundColor: '#1e3a8a', paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#93c5fd', marginTop: 2 },
  hiredNote: { fontSize: 11, color: '#60a5fa', marginTop: 2, marginBottom: 14, fontStyle: 'italic' },
  summaryRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  summaryPill: { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 10, gap: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryCount: { fontSize: 18, fontWeight: '900' },
  summaryLabel: { fontSize: 9, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  filterText: { flex: 1, fontSize: 13, color: '#fff', fontWeight: '600', marginLeft: 6 },
  filterSep: { color: '#93c5fd', fontSize: 16, fontWeight: '700' },
  applyBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  body: { padding: 16, gap: 12 },
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', padding: 12 },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 52, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94a3b8' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: {},
  cardDateText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  entryItem: { alignItems: 'center', gap: 3, flex: 1 },
  entryIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  entryTime: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
  entryLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eff6ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#bfdbfe' },
  statChipText: { fontSize: 11, fontWeight: '700', color: '#1e40af' },
});
