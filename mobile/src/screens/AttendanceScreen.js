import { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, getApiMessage } from '../api/client';

function todayStr() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateLabel(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function computeHours(record) {
  if (!record.time_in || !record.time_out) return '-';
  const t1 = new Date(String(record.time_in).replace(' ', 'T')).getTime();
  const t2 = new Date(String(record.time_out).replace(' ', 'T')).getTime();
  if (t2 <= t1) return '0.00';
  let breakMs = 0;
  if (record.break_out && record.break_in) {
    const b1 = new Date(String(record.break_out).replace(' ', 'T')).getTime();
    const b2 = new Date(String(record.break_in).replace(' ', 'T')).getTime();
    if (b2 > b1) breakMs = b2 - b1;
  }
  return ((t2 - t1 - breakMs) / 3600000).toFixed(2);
}

function getStatus(record) {
  if (!record.time_in) return { label: 'Absent', color: '#b91c1c', bg: '#fee2e2' };
  if (!record.time_out || (record.break_out && !record.break_in))
    return { label: 'Incomplete', color: '#d97706', bg: '#fef3c7' };
  return { label: 'Present', color: '#15803d', bg: '#dcfce7' };
}

export default function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState([]);
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(f, t) {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/attendance_overview', {
        params: { from: f, to: t || f },
      });
      setRecords(data.records || []);
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load attendance.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(from, to); }, []);

  const present = records.filter((r) => getStatus(r).label === 'Present').length;
  const absent = records.filter((r) => getStatus(r).label === 'Absent').length;
  const incomplete = records.filter((r) => getStatus(r).label === 'Incomplete').length;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => load(from, to)} tintColor="#1e40af" />
      }
    >
      <Text style={s.title}>Attendance</Text>
      <Text style={s.sub}>View your timekeeping records by date range</Text>

      {/* Filter */}
      <View style={s.filterCard}>
        <View style={s.filterRow}>
          <View style={s.filterField}>
            <Text style={s.filterLabel}>From</Text>
            <TextInput
              style={s.filterInput}
              value={from}
              onChangeText={setFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={s.filterField}>
            <Text style={s.filterLabel}>To</Text>
            <TextInput
              style={s.filterInput}
              value={to}
              onChangeText={setTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>
        <TouchableOpacity style={s.applyBtn} onPress={() => load(from, to)}>
          <Text style={s.applyText}>Apply Filter</Text>
        </TouchableOpacity>
      </View>

      {/* Summary counts */}
      <View style={s.summaryRow}>
        {[
          { label: 'Total', count: records.length, color: '#1e293b', bg: '#fff' },
          { label: 'Present', count: present, color: '#15803d', bg: '#dcfce7' },
          { label: 'Incomplete', count: incomplete, color: '#d97706', bg: '#fef3c7' },
          { label: 'Absent', count: absent, color: '#b91c1c', bg: '#fee2e2' },
        ].map((item) => (
          <View key={item.label} style={[s.summaryChip, { backgroundColor: item.bg }]}>
            <Text style={[s.summaryCount, { color: item.color }]}>{item.count}</Text>
            <Text style={s.summaryLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {records.length === 0 && !loading ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📅</Text>
          <Text style={s.emptyText}>No attendance records found.</Text>
          <Text style={s.emptyHint}>Try adjusting the date range.</Text>
        </View>
      ) : null}

      {records.map((record, i) => {
        const status = getStatus(record);
        const hours = computeHours(record);
        const lateMin = record.late_minutes != null ? Number(record.late_minutes) : 0;
        const utMin = record.undertime_minutes != null ? Number(record.undertime_minutes) : 0;

        return (
          <View key={`${record.attendance_date}-${i}`} style={s.recordCard}>
            <View style={s.recordHeader}>
              <Text style={s.recordDate}>{formatDateLabel(record.attendance_date)}</Text>
              <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>

            <View style={s.recordGrid}>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>Time In</Text>
                <Text style={s.recordValue}>{formatTime(record.time_in)}</Text>
              </View>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>Break Out</Text>
                <Text style={s.recordValue}>{formatTime(record.break_out)}</Text>
              </View>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>Break In</Text>
                <Text style={s.recordValue}>{formatTime(record.break_in)}</Text>
              </View>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>Time Out</Text>
                <Text style={s.recordValue}>{formatTime(record.time_out)}</Text>
              </View>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>Total Hours</Text>
                <Text style={s.recordValue}>{hours}</Text>
              </View>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>OT Hours</Text>
                <Text style={[s.recordValue, { color: hours !== '-' && Number(hours) > 8 ? '#15803d' : '#94a3b8' }]}>
                  {hours !== '-' ? Math.max(0, Number(hours) - 8).toFixed(2) : '-'}
                </Text>
              </View>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>Late (min)</Text>
                <Text style={[s.recordValue, lateMin > 0 && { color: '#b91c1c' }]}>
                  {lateMin > 0 ? lateMin : '-'}
                </Text>
              </View>
              <View style={s.recordItem}>
                <Text style={s.recordLabel}>Undertime (min)</Text>
                <Text style={[s.recordValue, utMin > 0 && { color: '#b91c1c' }]}>
                  {utMin > 0 ? utMin : '-'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  filterCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 16, elevation: 2 },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  filterField: { flex: 1 },
  filterLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  filterInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
  },
  applyBtn: { backgroundColor: '#1e40af', borderRadius: 8, padding: 11, alignItems: 'center' },
  applyText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryChip: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    elevation: 1,
  },
  summaryCount: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 9, color: '#64748b', marginTop: 2, textTransform: 'uppercase' },
  error: { color: '#b91c1c', marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#475569', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  recordCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2 },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recordDate: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recordItem: { minWidth: '45%', flex: 1 },
  recordLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  recordValue: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginTop: 2 },
});
