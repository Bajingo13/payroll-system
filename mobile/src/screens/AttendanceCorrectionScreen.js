import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeaderActions from '../components/HeaderActions';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(`2000-01-01T${String(v).slice(0, 5)}:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDateLocal(date) {
  // Returns YYYY-MM-DD from a Date object using local timezone
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtTimeLocal(date) {
  // Returns HH:MM from a Date object
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function statusStyle(s) {
  const n = String(s || '').toLowerCase();
  if (n === 'approved') return { color: '#15803d', bg: '#dcfce7' };
  if (n === 'rejected') return { color: '#b91c1c', bg: '#fee2e2' };
  if (n === 'cancelled') return { color: '#64748b', bg: '#f1f5f9' };
  return { color: '#d97706', bg: '#fef3c7' };
}

const EMPTY_FORM = {
  attendance_date: '',
  requested_time_in: '',
  requested_break_out: '',
  requested_break_in: '',
  requested_time_out: '',
  reason: '',
};

const TIME_FIELDS = [
  { key: 'requested_time_in',   label: 'Time In',   icon: 'log-in-outline' },
  { key: 'requested_break_out', label: 'Break Out', icon: 'exit-outline' },
  { key: 'requested_break_in',  label: 'Break In',  icon: 'enter-outline' },
  { key: 'requested_time_out',  label: 'Time Out',  icon: 'log-out-outline' },
];

export default function AttendanceCorrectionScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState('request'); // 'request' | 'history'
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  // Date / time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTimePicker, setActiveTimePicker] = useState(null); // key string or null
  const [tempPickerDate, setTempPickerDate] = useState(new Date());

  async function loadRequests() {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const { data } = await api.get('/employee/attendance-correction-requests', { params: { user_id: user.user_id } });
      setRequests(data.requests || []);
    } catch (err) {
      console.error('[AttendanceCorrection]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadRequests(); }, [user?.user_id]);

  async function handleSubmit() {
    setError('');
    setSuccess('');
    if (!form.attendance_date) { setError('Please select an attendance date.'); return; }
    if (!form.reason.trim()) { setError('Please provide a reason for the correction.'); return; }
    const hasTime = TIME_FIELDS.some((f) => form[f.key]);
    if (!hasTime) { setError('Please fill in at least one time field to correct.'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post('/employee/attendance-correction-request', { user_id: user.user_id, ...form });
      if (data.success) {
        setSuccess('Correction request submitted successfully.');
        setForm(EMPTY_FORM);
        loadRequests();
        setTimeout(() => { setTab('history'); setSuccess(''); }, 1400);
      } else {
        setError(data.message || 'Submission failed.');
      }
    } catch (err) {
      setError(getApiMessage(err, 'Submission failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(correctionId) {
    setCancellingId(correctionId);
    try {
      await api.patch(`/employee/attendance-correction-requests/${correctionId}/cancel`, { user_id: user.user_id });
      loadRequests();
    } catch (err) {
      setError(getApiMessage(err, 'Could not cancel request.'));
    } finally {
      setCancellingId(null);
    }
  }

  // ── Picker handlers ─────────────────────────────────────────────────────────
  function openDatePicker() {
    const d = form.attendance_date ? new Date(`${form.attendance_date}T00:00:00`) : new Date();
    setTempPickerDate(d);
    setShowDatePicker(true);
  }

  function openTimePicker(fieldKey) {
    const existing = form[fieldKey];
    const base = existing ? new Date(`2000-01-01T${existing}:00`) : new Date();
    setTempPickerDate(base);
    setActiveTimePicker(fieldKey);
  }

  function onDateChange(_, selected) {
    setShowDatePicker(false);
    if (!selected) return;
    setForm((f) => ({ ...f, attendance_date: fmtDateLocal(selected) }));
  }

  function onTimeChange(_, selected) {
    const key = activeTimePicker;
    setActiveTimePicker(null);
    if (!selected || !key) return;
    setForm((f) => ({ ...f, [key]: fmtTimeLocal(selected) }));
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const pending  = requests.filter((r) => r.status === 'Pending').length;
  const approved = requests.filter((r) => r.status === 'Approved').length;
  const rejected = requests.filter((r) => r.status === 'Rejected').length;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.headerTitle}>Attendance Correction</Text>
          <Text style={s.headerSub}>Request time-in / time-out changes</Text>
        </View>
        <HeaderActions navigation={navigation} />
      </View>

      {/* Stats strip */}
      <View style={s.statsRow}>
        {[{ label: 'Pending', val: pending }, { label: 'Approved', val: approved }, { label: 'Rejected', val: rejected }].map((s2) => (
          <View key={s2.label} style={s.statCard}>
            <Text style={s.statVal}>{s2.val}</Text>
            <Text style={s.statLabel}>{s2.label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {['request', 'history'].map((t) => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'request' ? 'New Request' : `History (${requests.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRequests(); }} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === 'request' ? (
            <View style={s.formCard}>
              <Text style={s.formTitle}>Attendance Date</Text>
              <Text style={s.formHint}>Select the date you want to correct.</Text>

              <TouchableOpacity style={s.dateBtn} onPress={openDatePicker}>
                <Ionicons name="calendar-outline" size={18} color="#475569" />
                <Text style={[s.dateBtnText, !form.attendance_date && s.placeholder]}>
                  {form.attendance_date ? fmtDate(form.attendance_date) : 'Select date…'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#94a3b8" />
              </TouchableOpacity>

              <Text style={[s.formTitle, { marginTop: 20 }]}>Time Fields</Text>
              <Text style={s.formHint}>Leave blank for fields that don't need changing.</Text>

              {TIME_FIELDS.map((tf) => (
                <View key={tf.key} style={s.timeRow}>
                  <View style={s.timeLabelRow}>
                    <Ionicons name={tf.icon} size={15} color="#64748b" />
                    <Text style={s.timeLabel}>{tf.label}</Text>
                  </View>
                  <TouchableOpacity style={s.timePicker} onPress={() => openTimePicker(tf.key)}>
                    <Text style={[s.timePickerText, !form[tf.key] && s.placeholder]}>
                      {form[tf.key] ? fmtTime(form[tf.key]) : 'Tap to set…'}
                    </Text>
                    {form[tf.key] ? (
                      <TouchableOpacity onPress={() => setForm((f) => ({ ...f, [tf.key]: '' }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={17} color="#94a3b8" />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name="time-outline" size={17} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={[s.formTitle, { marginTop: 20 }]}>Reason *</Text>
              <TextInput
                style={s.textarea}
                placeholder="Explain why a correction is needed (e.g., forgot to time in, device error)…"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={form.reason}
                onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
              />

              {error ? (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}

              {success ? (
                <View style={s.successBox}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#15803d" />
                  <Text style={s.successText}>{success}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={[s.submitBtn, submitting && s.btnDisabled]} onPress={handleSubmit} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.submitBtnText}>Submit Request</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={s.clearBtn} onPress={() => { setForm(EMPTY_FORM); setError(''); setSuccess(''); }}>
                <Text style={s.clearBtnText}>Clear Form</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {loading && !refreshing ? (
                <ActivityIndicator color="#1d4ed8" style={{ marginTop: 40 }} />
              ) : requests.length === 0 ? (
                <View style={s.emptyState}>
                  <Ionicons name="calendar-outline" size={44} color="#cbd5e1" />
                  <Text style={s.emptyTitle}>No Requests Yet</Text>
                  <Text style={s.emptyText}>Tap "New Request" to submit an attendance correction.</Text>
                </View>
              ) : (
                requests.map((r) => {
                  const ss = statusStyle(r.status);
                  return (
                    <View key={r.correction_id} style={s.card}>
                      <View style={s.cardHeader}>
                        <View style={s.cardDate}>
                          <Ionicons name="calendar" size={14} color="#1d4ed8" />
                          <Text style={s.cardDateText}>{fmtDate(r.attendance_date)}</Text>
                        </View>
                        <View style={[s.badge, { backgroundColor: ss.bg }]}>
                          <Text style={[s.badgeText, { color: ss.color }]}>{r.status}</Text>
                        </View>
                      </View>

                      <View style={s.timesGrid}>
                        {TIME_FIELDS.map((tf) => r[tf.key] ? (
                          <View key={tf.key} style={s.timeChip}>
                            <Text style={s.timeChipLabel}>{tf.label}</Text>
                            <Text style={s.timeChipVal}>{fmtTime(r[tf.key])}</Text>
                          </View>
                        ) : null)}
                      </View>

                      <View style={s.reasonRow}>
                        <Ionicons name="chatbubble-ellipses-outline" size={13} color="#64748b" />
                        <Text style={s.reasonText}>{r.reason}</Text>
                      </View>

                      {r.rejection_reason ? (
                        <View style={s.rejectRow}>
                          <Ionicons name="information-circle-outline" size={13} color="#b91c1c" />
                          <Text style={s.rejectText}>{r.rejection_reason}</Text>
                        </View>
                      ) : null}

                      {r.status === 'Pending' && (
                        <TouchableOpacity
                          style={s.cancelBtn}
                          disabled={cancellingId === r.correction_id}
                          onPress={() => handleCancel(r.correction_id)}
                        >
                          {cancellingId === r.correction_id
                            ? <ActivityIndicator size="small" color="#dc2626" />
                            : <Text style={s.cancelBtnText}>Cancel Request</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
      {showDatePicker && (
        <DateTimePicker
          value={tempPickerDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}

      {/* Time picker */}
      {activeTimePicker !== null && (
        <DateTimePicker
          value={tempPickerDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          is24Hour={false}
          onChange={onTimeChange}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e7edf5', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 1 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e7edf5' },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  statVal: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // Tabs
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#1d4ed8' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  tabTextActive: { color: '#1d4ed8' },

  scroll: { padding: 16, paddingBottom: 40 },

  // Form card
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#e7edf5', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  formTitle: { fontSize: 13, fontWeight: '800', color: '#334155', marginBottom: 4 },
  formHint: { fontSize: 12, color: '#94a3b8', marginBottom: 10 },

  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 13 },
  dateBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0f172a' },
  placeholder: { color: '#94a3b8', fontWeight: '400' },

  timeRow: { marginBottom: 10 },
  timeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  timeLabel: { fontSize: 12, fontWeight: '700', color: '#475569' },
  timePicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 11, gap: 8 },
  timePickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0f172a' },

  textarea: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', padding: 12, fontSize: 14, color: '#0f172a', minHeight: 88, marginTop: 6 },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', padding: 12, marginTop: 14 },
  errorText: { flex: 1, fontSize: 13, color: '#b91c1c' },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f0fdf4', borderRadius: 10, borderWidth: 1, borderColor: '#86efac', padding: 12, marginTop: 14 },
  successText: { flex: 1, fontSize: 13, color: '#15803d' },

  submitBtn: { height: 52, backgroundColor: '#1d4ed8', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  clearBtn: { alignItems: 'center', marginTop: 10, paddingVertical: 8 },
  clearBtnText: { color: '#64748b', fontSize: 13, fontWeight: '600' },

  // History cards
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e7edf5', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardDate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardDateText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  timeChip: { backgroundColor: '#f0f6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#bfdbfe' },
  timeChipLabel: { fontSize: 10, fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.4 },
  timeChipVal: { fontSize: 13, fontWeight: '800', color: '#1e40af', marginTop: 1 },

  reasonRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  reasonText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },
  rejectRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 6, backgroundColor: '#fef2f2', padding: 8, borderRadius: 8 },
  rejectText: { flex: 1, fontSize: 12, color: '#b91c1c', lineHeight: 17 },

  cancelBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 52 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#334155', marginTop: 14 },
  emptyText: { fontSize: 13, color: '#94a3b8', marginTop: 6, textAlign: 'center', lineHeight: 19, paddingHorizontal: 24 },
});
