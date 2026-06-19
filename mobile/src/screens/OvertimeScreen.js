import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import HeaderActions from '../components/HeaderActions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '-';
  const d = new Date(`2000-01-01T${value}:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getStatusStyle(status) {
  const n = String(status || '').toLowerCase();
  if (n === 'approved') return { color: '#15803d', bg: '#dcfce7', icon: 'checkmark-circle' };
  if (n === 'rejected') return { color: '#b91c1c', bg: '#fee2e2', icon: 'close-circle' };
  if (n === 'cancelled') return { color: '#64748b', bg: '#f1f5f9', icon: 'ban' };
  return { color: '#d97706', bg: '#fef3c7', icon: 'time' };
}

function computeHours(start, end) {
  if (!start || !end) return null;
  const s = new Date(`2000-01-01T${start}:00`);
  const e = new Date(`2000-01-01T${end}:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  return ((e - s) / 3600000).toFixed(2);
}

export default function OvertimeScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('request');
  const [form, setForm] = useState({ overtime_date: '', start_time: '', end_time: '', reason: '' });
  const [successMsg, setSuccessMsg] = useState('');
  const [activePicker, setActivePicker] = useState(null); // 'date' | 'start_time' | 'end_time' | null
  const [cancelling, setCancelling] = useState(null); // request_id being cancelled

  function onPickerChange(event, selectedValue) {
    const field = activePicker;
    setActivePicker(null);
    if (event.type !== 'set' || !selectedValue) return;

    if (field === 'date') {
      const y = selectedValue.getFullYear();
      const m = String(selectedValue.getMonth() + 1).padStart(2, '0');
      const d = String(selectedValue.getDate()).padStart(2, '0');
      setF('overtime_date', `${y}-${m}-${d}`);
    } else if (field === 'start_time' || field === 'end_time') {
      const h = String(selectedValue.getHours()).padStart(2, '0');
      const min = String(selectedValue.getMinutes()).padStart(2, '0');
      setF(field === 'start_time' ? 'start_time' : 'end_time', `${h}:${min}`);
    }
  }

  function getPickerValue(field) {
    if (field === 'date') {
      return form.overtime_date ? new Date(form.overtime_date) : new Date();
    }
    const timeStr = field === 'start_time' ? form.start_time : form.end_time;
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    return new Date();
  }

  async function loadOverview(showRefresh = false) {
    if (!user?.user_id) return;
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employee/overtime-overview', { params: { user_id: user.user_id } });
      if (!data.success) throw new Error(data.message);
      setRequests(data.requests || []); setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load overtime data.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { loadOverview(); }, [user?.user_id]);

  async function submitOvertime() {
    if (!form.overtime_date) { setError('Please enter the overtime date.'); return; }
    if (!form.start_time || !form.end_time) { setError('Please enter start and end times.'); return; }
    if (!form.reason.trim()) { setError('Please provide a reason.'); return; }
    setError(''); setSubmitting(true);
    try {
      const { data } = await api.post('/employee/overtime-request', {
        user_id: user.user_id, overtime_date: form.overtime_date,
        start_time: form.start_time, end_time: form.end_time, reason: form.reason.trim(),
      });
      if (!data.success) throw new Error(data.message);
      setSuccessMsg(data.message || 'Overtime request submitted successfully.');
      setForm({ overtime_date: '', start_time: '', end_time: '', reason: '' });
      await loadOverview(); setTab('history');
    } catch (err) { setError(getApiMessage(err, 'Failed to submit overtime request.')); }
    finally { setSubmitting(false); }
  }

  async function cancelOvertime(requestId) {
    setCancelling(requestId);
    setError('');
    try {
      const { data } = await api.patch(`/employee/overtime-requests/${requestId}/cancel`, { user_id: user.user_id });
      if (!data.success) throw new Error(data.message);
      await loadOverview();
    } catch (err) { setError(getApiMessage(err, 'Failed to cancel overtime request.')); }
    finally { setCancelling(null); }
  }

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const previewHours = computeHours(form.start_time, form.end_time);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <View>
            <Text style={s.headerTitle}>Overtime</Text>
            <Text style={s.headerSub}>File and track overtime requests</Text>
          </View>
          <HeaderActions navigation={navigation} />
        </View>
        <View style={s.statRow}>
          <View style={s.statPill}>
            <Ionicons name="time-outline" size={16} color="#93c5fd" />
            <Text style={s.statText}>{requests.length} total requests</Text>
          </View>
          <View style={s.statPill}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#86efac" />
            <Text style={s.statText}>{requests.filter((r) => String(r.status || '').toLowerCase() === 'approved').length} approved</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadOverview(true)} tintColor="#1e40af" />}
      >
        {/* Tabs */}
        <View style={s.tabWrap}>
          {['request', 'history'].map((t) => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
              <Ionicons name={t === 'request' ? 'add-circle-outline' : 'list-outline'} size={15}
                color={tab === t ? '#fff' : '#64748b'} style={{ marginRight: 5 }} />
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'request' ? 'New Request' : `History (${requests.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Request Form */}
        {tab === 'request' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Submit Overtime Request</Text>

            <Text style={s.label}>Overtime Date</Text>
            <View style={s.inputWrap}>
              <Ionicons name="calendar-outline" size={16} color="#94a3b8" style={s.inputIcon} />
              <TextInput style={s.input} value={form.overtime_date} onChangeText={(v) => setF('overtime_date', v)}
                placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              <TouchableOpacity onPress={() => setActivePicker('date')} style={s.pickerBtn}>
                <Ionicons name="calendar" size={18} color="#1e40af" />
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Time Range</Text>
            <View style={s.timeRow}>
              <View style={[s.inputWrap, { flex: 1 }]}>
                <Ionicons name="play-outline" size={14} color="#94a3b8" style={s.inputIcon} />
                <TextInput style={s.input} value={form.start_time} onChangeText={(v) => setF('start_time', v)}
                  placeholder="HH:MM" placeholderTextColor="#94a3b8" />
                <TouchableOpacity onPress={() => setActivePicker('start_time')} style={s.pickerBtn}>
                  <Ionicons name="time" size={17} color="#1e40af" />
                </TouchableOpacity>
              </View>
              <View style={[s.inputWrap, { flex: 1 }]}>
                <Ionicons name="stop-outline" size={14} color="#94a3b8" style={s.inputIcon} />
                <TextInput style={s.input} value={form.end_time} onChangeText={(v) => setF('end_time', v)}
                  placeholder="HH:MM" placeholderTextColor="#94a3b8" />
                <TouchableOpacity onPress={() => setActivePicker('end_time')} style={s.pickerBtn}>
                  <Ionicons name="time" size={17} color="#1e40af" />
                </TouchableOpacity>
              </View>
            </View>

            {activePicker && (
              <DateTimePicker
                value={getPickerValue(activePicker)}
                mode={activePicker === 'date' ? 'date' : 'time'}
                is24Hour
                display="default"
                onChange={onPickerChange}
              />
            )}

            {previewHours && (
              <View style={s.durationBadge}>
                <Ionicons name="hourglass-outline" size={14} color="#1e40af" />
                <Text style={s.durationText}>{previewHours} hours of overtime</Text>
              </View>
            )}

            <Text style={s.label}>Reason</Text>
            <View style={[s.inputWrap, { alignItems: 'flex-start', paddingTop: 12, minHeight: 100 }]}>
              <Ionicons name="document-text-outline" size={16} color="#94a3b8" style={[s.inputIcon, { marginTop: 2 }]} />
              <TextInput style={[s.input, { height: 80 }]} value={form.reason} onChangeText={(v) => setF('reason', v)}
                placeholder="Describe the reason for overtime…" placeholderTextColor="#94a3b8"
                multiline textAlignVertical="top" />
            </View>

            <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.65 }]} onPress={submitOvertime} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Text style={s.submitText}>Submit Request</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* History */}
        {tab === 'history' && (
          <>
            {loading && <ActivityIndicator color="#1e40af" style={{ marginVertical: 20 }} />}
            {requests.length === 0 && !loading && (
              <View style={s.empty}>
                <Ionicons name="time-outline" size={48} color="#cbd5e1" />
                <Text style={s.emptyText}>No overtime requests yet</Text>
                <Text style={s.emptySub}>Your submitted requests will appear here</Text>
              </View>
            )}
            {requests.map((req, i) => {
              const st = getStatusStyle(req.status);
              const hrs = computeHours(req.start_time, req.end_time);
              const isPending = String(req.status || '').toLowerCase() === 'pending';
              const isCancelling = cancelling === (req.request_id || req.overtime_request_id);
              return (
                <View key={req.request_id || i} style={s.historyCard}>
                  <View style={s.historyTop}>
                    <View style={s.historyLeft}>
                      <Text style={s.historyDate}>{formatDate(req.overtime_date)}</Text>
                      <View style={s.historyTimeRow}>
                        <Ionicons name="time-outline" size={12} color="#64748b" />
                        <Text style={s.historyTime}>
                          {formatTime(req.start_time)} — {formatTime(req.end_time)}
                          {hrs ? `  ·  ${hrs} hrs` : ''}
                        </Text>
                      </View>
                      {req.reason ? <Text style={s.historyReason} numberOfLines={2}>{req.reason}</Text> : null}
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={11} color={st.color} />
                      <Text style={[s.statusText, { color: st.color }]}>{req.status || 'Pending'}</Text>
                    </View>
                  </View>
                  {isPending && (
                    <TouchableOpacity
                      style={s.cancelBtn}
                      onPress={() => cancelOvertime(req.request_id || req.overtime_request_id)}
                      disabled={Boolean(cancelling)}
                    >
                      {isCancelling
                        ? <ActivityIndicator size="small" color="#b91c1c" />
                        : <Text style={s.cancelBtnText}>Cancel Request</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Success Modal */}
      <Modal visible={Boolean(successMsg)} transparent animationType="fade" onRequestClose={() => setSuccessMsg('')}>
        <Pressable style={s.dialogBackdrop} onPress={() => setSuccessMsg('')}>
          <Pressable style={s.dialog} onPress={() => {}}>
            <View style={s.dialogIconWrap}>
              <Ionicons name="checkmark-circle" size={32} color="#15803d" />
            </View>
            <Text style={s.dialogTitle}>Request Submitted</Text>
            <Text style={s.dialogMsg}>{successMsg}</Text>
            <TouchableOpacity style={s.dialogOkBtn} onPress={() => setSuccessMsg('')}>
              <Text style={s.dialogOkText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#1e3a8a', paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#93c5fd', marginTop: 2, marginBottom: 14 },
  statRow: { flexDirection: 'row', gap: 8 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statText: { fontSize: 12, color: '#bfdbfe', fontWeight: '600' },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40, gap: 14 },
  tabWrap: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#1e40af', shadowColor: '#1e40af', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  tabTextActive: { color: '#fff' },
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', padding: 12 },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: -4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, backgroundColor: '#f8fafc', paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 14, color: '#0f172a', paddingVertical: 12, fontWeight: '500' },
  timeRow: { flexDirection: 'row', gap: 8 },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#eff6ff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#bfdbfe' },
  durationText: { color: '#1e40af', fontSize: 13, fontWeight: '700' },
  submitBtn: { backgroundColor: '#1e40af', borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#1e40af', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94a3b8' },
  historyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  historyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  historyLeft: { flex: 1, gap: 4 },
  historyDate: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  historyTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyTime: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  historyReason: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  pickerBtn: { padding: 6 },
  cancelBtn: { marginTop: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', alignItems: 'center' },
  cancelBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '700' },
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  dialog: { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 12 },
  dialogIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  dialogTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  dialogMsg: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  dialogOkBtn: { backgroundColor: '#1e40af', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 40, alignItems: 'center' },
  dialogOkText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
