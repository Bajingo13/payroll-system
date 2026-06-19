import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';
import { API_BASE_URL } from '../config';

const ASSET_BASE = API_BASE_URL.replace('/api', '');

// ── HR dark theme ─────────────────────────────────────────────────────────
const T = {
  bg:         '#0f172a',
  surface:    '#1e293b',
  surfaceAlt: '#273548',
  border:     '#334155',
  accent:     '#8b5cf6',
  accentLight:'#a78bfa',
  accentBg:   '#2d1f52',
  textPrimary:'#f1f5f9',
  textSub:    '#94a3b8',
  textMuted:  '#64748b',
  headerBg:   '#1e1b4b',
};

// ── Helpers ───────────────────────────────────────────────────────────────
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(ds) {
  if (!ds) return '-';
  const d = new Date(`${ds}T00:00:00`);
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return null;
  const str = String(value).replace(' ', 'T');
  const withTz = str.includes('+') || str.includes('Z') ? str : str + '+08:00';
  const d = new Date(withTz);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
}

function getStatus(row) {
  if (!row.time_in)  return { label: 'Absent',     color: '#f87171', bg: '#3d1515', border: '#7f1d1d' };
  if (!row.time_out) return { label: 'Incomplete',  color: '#fbbf24', bg: '#3d2e10', border: '#78350f' };
  if (Number(row.undertime_minutes || 0) > 0)
                     return { label: 'Undertime',   color: '#fb923c', bg: '#3d2210', border: '#7c2d12' };
  return               { label: 'Complete',    color: '#34d399', bg: '#0d2e1e', border: '#065f46' };
}

function fmtHours(h) {
  const n = Number(h || 0);
  return n > 0 ? n.toFixed(2) + 'h' : '0.00h';
}

function getAttendancePhotoUrl(value, assetBase) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parts = raw.split(';').map((p) => p.trim()).filter(Boolean);
  const photoPart =
    parts.find((p) => p.startsWith('photo:')) ||
    parts.find((p) => p.startsWith('front:')) ||
    parts.find((p) => p.startsWith('back:'))  ||
    raw;
  const filename = photoPart.includes(':') ? photoPart.split(':').slice(1).join(':') : photoPart;
  if (!filename) return null;
  return `${assetBase}/uploads/attendance/${encodeURIComponent(filename)}`;
}

function fmtDist(m) {
  const n = Number(m || 0);
  if (!m && m !== 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n)} m`;
}

// ── Status filter options ─────────────────────────────────────────────────
const FILTER_OPTIONS = ['All', 'Incomplete', 'Absent', 'Complete', 'Undertime'];

export default function HRAttendanceScreen({ navigation }) {
  const { user }   = useAuth();
  const insets     = useSafeAreaInsets();
  const todayStr   = toLocalDateStr(new Date());

  const [dateStr,      setDateStr]      = useState(todayStr);
  const [showPicker,   setShowPicker]   = useState(false);
  const [records,      setRecords]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search,       setSearch]       = useState('');
  const [photoModal,   setPhotoModal]   = useState(null); // full URL string

  async function loadAttendance(isRefresh = false) {
    if (!user?.user_id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // Do NOT pass user_id — the SQL CTE filters role='employee', so
      // passing the HR user's id returns zero rows. Omit for all employees.
      const { data } = await api.get('/attendance_overview', {
        params: { from: dateStr, to: dateStr },
      });
      if (!data.success) throw new Error(data.message);
      setRecords(data.records || []);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load attendance.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadAttendance(); }, [user?.user_id, dateStr]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadAttendance());
    return unsub;
  }, [navigation, user?.user_id, dateStr]);

  function onPickerChange(event, selected) {
    setShowPicker(false);
    if (event.type === 'set' && selected) setDateStr(toLocalDateStr(selected));
  }
  function shiftDate(days) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDateStr(toLocalDateStr(d));
  }

  // ── Dedup (one record per employee per day — take first occurrence) ──
  const uniqueRecords = useMemo(() => {
    const seen = new Set();
    return records.filter((r) => {
      const key = `${r.user_id}_${r.attendance_date}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [records]);

  // ── Summary counts ──
  const counts = useMemo(() => {
    const c = { total: 0, present: 0, incomplete: 0, absent: 0, late: 0 };
    uniqueRecords.forEach((r) => {
      c.total++;
      if (!r.time_in)        c.absent++;
      else if (!r.time_out)  c.incomplete++;
      else                   c.present++;
      if (Number(r.late_minutes || 0) > 0 && r.time_in) c.late++;
    });
    return c;
  }, [uniqueRecords]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = uniqueRecords;
    if (statusFilter !== 'All') {
      list = list.filter((r) => getStatus(r).label === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        (r.employee_name || r.full_name || '').toLowerCase().includes(q) ||
        (r.emp_code || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [uniqueRecords, statusFilter, search]);

  const isToday = dateStr === todayStr;

  const SUMMARY_PILLS = [
    { label: 'Total',      value: counts.total,      color: '#a78bfa' },
    { label: 'Present',    value: counts.present,    color: '#34d399' },
    { label: 'Absent',     value: counts.absent,     color: '#f87171' },
    { label: 'Incomplete', value: counts.incomplete, color: '#fbbf24' },
    { label: 'Late',       value: counts.late,       color: '#fb923c' },
  ];

  return (
    <View style={s.root}>

      {/* ══ HEADER ══ */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <View style={s.rolePill}>
              <Ionicons name="calendar" size={11} color={T.accentLight} />
              <Text style={s.rolePillText}>HR Management</Text>
            </View>
            <Text style={s.headerTitle}>Employee Attendance</Text>
            <Text style={s.headerSub}>Timekeeping and attendance monitoring</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications" size={20} color={T.accentLight} />
          </TouchableOpacity>
        </View>

        {/* Date navigator */}
        <View style={s.dateNav}>
          <TouchableOpacity style={s.dateArrow} onPress={() => shiftDate(-1)}>
            <Ionicons name="chevron-back" size={18} color={T.accentLight} />
          </TouchableOpacity>
          <TouchableOpacity style={s.datePill} onPress={() => setShowPicker(true)}>
            <Ionicons name="calendar-outline" size={13} color={T.accentLight} />
            <Text style={s.datePillText}>{formatDisplayDate(dateStr)}</Text>
            {isToday && <View style={s.todayDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={[s.dateArrow, isToday && { opacity: 0.3 }]} onPress={() => shiftDate(1)} disabled={isToday}>
            <Ionicons name="chevron-forward" size={18} color={T.accentLight} />
          </TouchableOpacity>
        </View>

        {showPicker && (
          <DateTimePicker
            value={new Date(`${dateStr}T00:00:00`)}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={onPickerChange}
          />
        )}

        {/* Summary strip */}
        <View style={s.summaryStrip}>
          {SUMMARY_PILLS.map((p) => (
            <View key={p.label} style={s.summaryPill}>
              <Text style={[s.summaryValue, { color: p.color }]}>{p.value}</Text>
              <Text style={s.summaryLabel}>{p.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ══ SEARCH + FILTERS ══ */}
      <View style={s.controls}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search employee, ID, department…"
            placeholderTextColor={T.textMuted}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color={T.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTER_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, statusFilter === f && s.filterChipActive]}
              onPress={() => setStatusFilter(f)}
            >
              <Text style={[s.filterText, statusFilter === f && s.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {error ? (
        <View style={s.errorWrap}>
          <Ionicons name="alert-circle" size={14} color="#f87171" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* ══ RECORDS LIST ══ */}
      <ScrollView
        style={s.list}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAttendance(true)} tintColor={T.accentLight} />}
      >
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}

        {!loading && filtered.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={52} color={T.textMuted} />
            <Text style={s.emptyTitle}>No records found</Text>
            <Text style={s.emptySub}>{search ? 'Try a different search term' : `No ${statusFilter !== 'All' ? statusFilter.toLowerCase() + ' ' : ''}attendance for ${dateStr}`}</Text>
          </View>
        )}

        {filtered.map((row, i) => {
          const status   = getStatus(row);
          const name     = row.employee_name || row.full_name || 'Employee';
          const timeIn   = formatTime(row.time_in);
          const breakOut = formatTime(row.break_out);
          const breakIn  = formatTime(row.break_in);
          const timeOut  = formatTime(row.time_out);
          const lateMin  = Number(row.late_minutes  || 0);
          const otHours  = Number(row.ot_hours      || 0);
          const utMin    = Number(row.undertime_minutes || 0);
          const dist     = fmtDist(row.time_in_dist);
          const hasLoc   = row.time_in_lat != null && row.time_in_lng != null;

          return (
            <View key={`${row.user_id}_${row.attendance_date}_${i}`} style={[s.card, { borderLeftColor: status.color, borderLeftWidth: 3 }]}>

              {/* ── Employee header ── */}
              <View style={s.cardTop}>
                <View style={[s.avatar, { backgroundColor: status.color + '22' }]}>
                  <Text style={[s.avatarText, { color: status.color }]}>{name[0]}</Text>
                </View>
                <View style={s.cardMeta}>
                  <Text style={s.empName}>{name}</Text>
                  <View style={s.empPills}>
                    {row.emp_code && row.emp_code !== 'N/A' && (
                      <View style={s.empPill}>
                        <Text style={s.empPillText}>{row.emp_code}</Text>
                      </View>
                    )}
                    <View style={s.empPill}>
                      <Text style={s.empPillText}>{row.department || 'No dept'}</Text>
                    </View>
                  </View>
                </View>
                <View style={[s.statusBadge, { backgroundColor: status.bg, borderColor: status.border }]}>
                  <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>

              {/* ── Selfie photo ── */}
              {row.time_in_photo ? (() => {
                const photoUrl = getAttendancePhotoUrl(row.time_in_photo, ASSET_BASE);
                return (
                  <TouchableOpacity style={s.photoWrap} onPress={() => setPhotoModal(photoUrl)} activeOpacity={0.8}>
                    <Image source={{ uri: photoUrl }} style={s.photoThumb} resizeMode="cover" />
                    <View style={s.photoOverlay}>
                      <Ionicons name="expand-outline" size={14} color="#fff" />
                      <Text style={s.photoOverlayText}>Selfie</Text>
                    </View>
                  </TouchableOpacity>
                );
              })() : null}

              {/* ── Time log grid ── */}
              <View style={s.timeGrid}>
                {[
                  { label: 'Time In',   value: timeIn,   icon: 'log-in',           color: '#34d399' },
                  { label: 'Break Out', value: breakOut, icon: 'cafe',              color: '#fbbf24' },
                  { label: 'Break In',  value: breakIn,  icon: 'return-down-back',  color: '#fbbf24' },
                  { label: 'Time Out',  value: timeOut,  icon: 'log-out',           color: '#f87171' },
                ].map((t) => (
                  <View key={t.label} style={s.timeCell}>
                    <View style={[s.timeCellIcon, { backgroundColor: t.value ? t.color + '22' : T.surfaceAlt }]}>
                      <Ionicons name={t.icon + '-outline'} size={13} color={t.value ? t.color : T.textMuted} />
                    </View>
                    <Text style={[s.timeCellVal, !t.value && { color: T.textMuted }]}>{t.value || '—'}</Text>
                    <Text style={s.timeCellLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>

              {/* ── Stats row ── */}
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Ionicons name="time-outline" size={12} color={lateMin > 0 ? '#fb923c' : T.textMuted} />
                  <Text style={[s.statVal, lateMin > 0 && { color: '#fb923c' }]}>
                    {lateMin > 0 ? `${lateMin} min` : '—'}
                  </Text>
                  <Text style={s.statLabel}>Late</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.stat}>
                  <Ionicons name="hourglass-outline" size={12} color={otHours > 0 ? '#34d399' : T.textMuted} />
                  <Text style={[s.statVal, otHours > 0 && { color: '#34d399' }]}>
                    {fmtHours(otHours)}
                  </Text>
                  <Text style={s.statLabel}>OT Hours</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.stat}>
                  <Ionicons name="trending-down-outline" size={12} color={utMin > 0 ? '#f87171' : T.textMuted} />
                  <Text style={[s.statVal, utMin > 0 && { color: '#f87171' }]}>
                    {utMin > 0 ? `${utMin} min` : '—'}
                  </Text>
                  <Text style={s.statLabel}>Undertime</Text>
                </View>
                {hasLoc && (
                  <>
                    <View style={s.statDivider} />
                    <View style={s.stat}>
                      <Ionicons name="location-outline" size={12} color="#60a5fa" />
                      <Text style={[s.statVal, { color: '#60a5fa' }]}>{dist || '—'}</Text>
                      <Text style={s.statLabel}>From Office</Text>
                    </View>
                  </>
                )}
              </View>

              {/* ── Coordinates (if available) ── */}
              {hasLoc && (
                <View style={s.locRow}>
                  <Ionicons name="navigate-outline" size={11} color="#60a5fa" />
                  <Text style={s.locText}>
                    {Number(row.time_in_lat).toFixed(4)}, {Number(row.time_in_lng).toFixed(4)}
                    {dist ? ` · ${dist} from office` : ''}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {/* ══ FULLSCREEN PHOTO MODAL ══ */}
      <Modal visible={Boolean(photoModal)} transparent animationType="fade" onRequestClose={() => setPhotoModal(null)}>
        <Pressable style={s.photoModalBg} onPress={() => setPhotoModal(null)}>
          <Image source={{ uri: photoModal }} style={s.photoModalImg} resizeMode="contain" />
          <TouchableOpacity style={s.photoModalClose} onPress={() => setPhotoModal(null)}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  // Header
  header:    { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 0 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerLeft:{ flex: 1, marginRight: 8 },
  rolePill:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: 20, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)' },
  rolePillText: { fontSize: 10, color: T.accentLight, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: T.textPrimary },
  headerSub:   { fontSize: 11, color: T.textSub, marginTop: 2 },
  iconBtn:   { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: 12 },

  // Date nav
  dateNav:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dateArrow:  { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  datePill:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(139,92,246,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)' },
  datePillText: { flex: 1, fontSize: 12, color: T.textPrimary, fontWeight: '700' },
  todayDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399' },

  // Summary
  summaryStrip:{ flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', marginHorizontal: -20, paddingHorizontal: 12, paddingVertical: 12, gap: 4 },
  summaryPill: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue:{ fontSize: 18, fontWeight: '900' },
  summaryLabel:{ fontSize: 9, color: T.textSub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Controls
  controls:  { backgroundColor: T.bg, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  searchWrap:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  searchInput:{ flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  filterRow:  { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  filterChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  filterText: { fontSize: 12, color: T.textSub, fontWeight: '700' },
  filterTextActive: { color: '#fff' },

  // Error
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3d1515', borderRadius: 12, borderWidth: 1, borderColor: '#7f1d1d', padding: 12, marginHorizontal: 14, marginBottom: 4 },
  errorText: { color: '#f87171', fontSize: 13, flex: 1 },

  // List
  list:        { flex: 1 },
  listContent: { padding: 14, gap: 10, paddingBottom: 48 },

  // Card
  card:     { backgroundColor: T.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.border },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  avatar:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900' },
  cardMeta: { flex: 1 },
  empName:  { fontSize: 14, fontWeight: '800', color: T.textPrimary, marginBottom: 4 },
  empPills: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  empPill:  { backgroundColor: T.surfaceAlt, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: T.border },
  empPillText: { fontSize: 10, color: T.textSub, fontWeight: '600' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  statusText:  { fontSize: 10, fontWeight: '800' },

  // Selfie photo
  photoWrap:        { marginBottom: 12, borderRadius: 12, overflow: 'hidden', height: 140, position: 'relative' },
  photoThumb:       { width: '100%', height: '100%', backgroundColor: T.surfaceAlt },
  photoOverlay:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 6 },
  photoOverlayText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  photoModalBg:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  photoModalImg:    { width: '100%', height: '80%' },
  photoModalClose:  { position: 'absolute', top: 52, right: 20 },

  // Time grid
  timeGrid:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  timeCell:    { flex: 1, alignItems: 'center', gap: 3 },
  timeCellIcon:{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  timeCellVal: { fontSize: 10, fontWeight: '800', color: T.textPrimary, textAlign: 'center' },
  timeCellLabel: { fontSize: 8, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Stats row
  statsRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: T.surfaceAlt, borderRadius: 12, padding: 10 },
  stat:        { flex: 1, alignItems: 'center', gap: 2 },
  statVal:     { fontSize: 11, fontWeight: '800', color: T.textSub },
  statLabel:   { fontSize: 8, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 28, backgroundColor: T.border },

  // Location
  locRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: '#1a2640', borderRadius: 8, padding: 7, borderWidth: 1, borderColor: '#1e3a5f' },
  locText: { fontSize: 11, color: '#60a5fa', flex: 1 },

  // Empty
  empty:      { alignItems: 'center', paddingVertical: 56, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.textSub },
  emptySub:   { fontSize: 12, color: T.textMuted, textAlign: 'center' },
});
