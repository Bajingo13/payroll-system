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
import { Ionicons } from '@expo/vector-icons';
import HeaderActions from '../components/HeaderActions';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function getStatusStyle(status) {
  const n = String(status || '').toLowerCase();
  if (n === 'approved') return { color: '#15803d', bg: '#dcfce7', icon: 'checkmark-circle' };
  if (n === 'rejected') return { color: '#b91c1c', bg: '#fee2e2', icon: 'close-circle' };
  if (n === 'cancelled') return { color: '#64748b', bg: '#f1f5f9', icon: 'ban' };
  return { color: '#d97706', bg: '#fef3c7', icon: 'time' };
}

export default function LeaveScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('request');
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
  const [toast,         setToast]         = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(null); // leave_id pending cancel
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  const [datePicker, setDatePicker] = useState(null); // 'start_date' | 'end_date' | null
  const [cancelling, setCancelling] = useState(null); // request_id being cancelled

  function openPicker(field) {
    setDatePicker(field);
  }

  function onDateChange(event, selectedDate) {
    setDatePicker(null);
    if (event.type === 'set' && selectedDate) {
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      setF(datePicker, `${y}-${m}-${d}`);
    }
  }

  async function loadOverview(showRefresh = false) {
    if (!user?.user_id) return;
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employee/leave-overview', { params: { user_id: user.user_id } });
      if (!data.success) throw new Error(data.message);
      setLeaveTypes(data.leaveTypes || []);
      setLeaveBalances(data.leaveBalances || []);
      setLeaveRequests(data.leaveRequests || []);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load leave data.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { loadOverview(); }, [user?.user_id]);

  async function submitLeave() {
    if (!form.leave_type_id) { setError('Please select a leave type.'); return; }
    if (!form.start_date || !form.end_date) { setError('Please enter start and end dates.'); return; }
    const startD = new Date(`${form.start_date}T00:00:00`);
    const endD   = new Date(`${form.end_date}T00:00:00`);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
      setError('Invalid date format. Use YYYY-MM-DD.'); return;
    }
    if (endD < startD) { setError('End date cannot be before start date.'); return; }
    if (!form.reason.trim()) { setError('Please provide a reason.'); return; }
    setError(''); setSubmitting(true);
    try {
      const { data } = await api.post('/employee/leave-request', {
        user_id: user.user_id, leave_type_id: form.leave_type_id,
        start_date: form.start_date, end_date: form.end_date, reason: form.reason.trim(),
      });
      if (!data.success) throw new Error(data.message);
      showToast(data.message || 'Leave request submitted successfully.');
      setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
      await loadOverview(); setTab('history');
    } catch (err) { setError(getApiMessage(err, 'Failed to submit leave request.')); }
    finally { setSubmitting(false); }
  }

  async function cancelLeave(leaveId) {
    setCancelling(leaveId);
    setError('');
    try {
      const { data } = await api.patch(`/employee/leave-requests/${leaveId}/cancel`, { user_id: user.user_id });
      if (!data.success) throw new Error(data.message);
      await loadOverview();
    } catch (err) { setError(getApiMessage(err, 'Failed to cancel leave request.')); }
    finally { setCancelling(null); setCancelConfirm(null); }
  }

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <View>
            <Text style={s.headerTitle}>Leave</Text>
            <Text style={s.headerSub}>Manage your leave requests</Text>
          </View>
          <HeaderActions navigation={navigation} />
        </View>

        {/* Balance pills */}
        {leaveBalances.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.balanceScroll} contentContainerStyle={s.balanceContent}>
            {leaveBalances.map((bal) => (
              <View key={bal.leave_type_id} style={s.balancePill}>
                <Text style={s.balancePillCount}>{Number(bal.remaining_days ?? bal.balance ?? 0).toFixed(0)}</Text>
                <Text style={s.balancePillName} numberOfLines={1}>{bal.leave_name || bal.leave_type_name}</Text>
              </View>
            ))}
          </ScrollView>
        )}
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
              <Ionicons
                name={t === 'request' ? 'add-circle-outline' : 'list-outline'}
                size={15}
                color={tab === t ? '#fff' : '#64748b'}
                style={{ marginRight: 5 }}
              />
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'request' ? 'New Request' : `History (${leaveRequests.length})`}
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
            <Text style={s.cardTitle}>Submit Leave Request</Text>

            <Text style={s.label}>Leave Type</Text>
            {leaveTypes.length === 0
              ? <Text style={s.noData}>No leave types available.</Text>
              : <View style={s.typeGrid}>
                  {leaveTypes.map((lt) => {
                    const active = form.leave_type_id === String(lt.leave_type_id);
                    return (
                      <TouchableOpacity key={lt.leave_type_id} style={[s.typeChip, active && s.typeChipActive]}
                        onPress={() => setF('leave_type_id', String(lt.leave_type_id))}>
                        <Text style={[s.typeChipText, active && s.typeChipTextActive]}>
                          {lt.leave_name || lt.leave_type_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>}

            <Text style={s.label}>Start Date</Text>
            <View style={s.inputWrap}>
              <Ionicons name="calendar-outline" size={16} color="#94a3b8" style={s.inputIcon} />
              <TextInput style={s.input} value={form.start_date} onChangeText={(v) => setF('start_date', v)}
                placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              <TouchableOpacity onPress={() => openPicker('start_date')} style={s.pickerBtn} accessibilityLabel="Open start date picker">
                <Ionicons name="calendar" size={18} color="#1e40af" />
              </TouchableOpacity>
            </View>

            <Text style={s.label}>End Date</Text>
            <View style={s.inputWrap}>
              <Ionicons name="calendar-outline" size={16} color="#94a3b8" style={s.inputIcon} />
              <TextInput style={s.input} value={form.end_date} onChangeText={(v) => setF('end_date', v)}
                placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              <TouchableOpacity onPress={() => openPicker('end_date')} style={s.pickerBtn} accessibilityLabel="Open end date picker">
                <Ionicons name="calendar" size={18} color="#1e40af" />
              </TouchableOpacity>
            </View>

            {datePicker && (
              <DateTimePicker
                value={(() => {
                  const str = form[datePicker];
                  if (!str) return new Date();
                  const d = new Date(`${str}T00:00:00`);
                  return Number.isNaN(d.getTime()) ? new Date() : d;
                })()}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}

            <Text style={s.label}>Reason</Text>
            <View style={[s.inputWrap, { alignItems: 'flex-start', paddingTop: 12, minHeight: 100 }]}>
              <Ionicons name="document-text-outline" size={16} color="#94a3b8" style={[s.inputIcon, { marginTop: 2 }]} />
              <TextInput style={[s.input, { height: 80 }]} value={form.reason}
                onChangeText={(v) => setF('reason', v)} placeholder="Describe your reason…"
                placeholderTextColor="#94a3b8" multiline textAlignVertical="top" />
            </View>

            <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.65 }]} onPress={submitLeave} disabled={submitting}>
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
            {leaveRequests.length === 0 && !loading && (
              <View style={s.empty}>
                <Ionicons name="leaf-outline" size={48} color="#cbd5e1" />
                <Text style={s.emptyText}>No leave requests yet</Text>
                <Text style={s.emptySub}>Your submitted requests will appear here</Text>
              </View>
            )}
            {leaveRequests.map((req, i) => {
              const st = getStatusStyle(req.status);
              const isPending = String(req.status || '').toLowerCase() === 'pending';
              const isCancelling = cancelling === (req.leave_id || req.request_id);
              return (
                <View key={req.leave_id || i} style={s.historyCard}>
                  <View style={s.historyTop}>
                    <View style={s.historyLeft}>
                      <Text style={s.historyType}>{req.leave_type_name || 'Leave'}</Text>
                      <Text style={s.historyDates}>{formatDate(req.start_date)} — {formatDate(req.end_date)}</Text>
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
                      onPress={() => setCancelConfirm(req.leave_id || req.request_id)}
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

      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={Boolean(cancelConfirm)} transparent animationType="fade" onRequestClose={() => !cancelling && setCancelConfirm(null)}>
        <Pressable style={s.warnBackdrop} onPress={() => !cancelling && setCancelConfirm(null)}>
          <Pressable style={s.warnDialog} onPress={() => {}}>
            <View style={s.warnIconWrap}>
              <Ionicons name="close-circle-outline" size={28} color="#dc2626" />
            </View>
            <Text style={s.warnTitle}>Cancel Leave Request</Text>
            <Text style={s.warnMsg}>Are you sure you want to cancel this leave request? This action cannot be undone.</Text>
            <View style={s.warnActions}>
              <TouchableOpacity style={s.warnKeepBtn} onPress={() => setCancelConfirm(null)} disabled={Boolean(cancelling)}>
                <Text style={s.warnKeepText}>Keep Request</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.warnDiscardBtn, Boolean(cancelling) && { opacity: 0.6 }]}
                onPress={() => cancelLeave(cancelConfirm)}
                disabled={Boolean(cancelling)}
              >
                {cancelling
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.warnDiscardText}>Cancel Request</Text>}
              </TouchableOpacity>
            </View>
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
  balanceScroll: { marginTop: 4 },
  balanceContent: { gap: 8, paddingRight: 4 },
  balancePill: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 80,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  balancePillCount: { fontSize: 22, fontWeight: '900', color: '#fff' },
  balancePillName: { fontSize: 10, color: '#bfdbfe', marginTop: 2, textAlign: 'center' },
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
  noData: { fontSize: 13, color: '#94a3b8' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#f8fafc' },
  typeChipActive: { borderColor: '#1e40af', backgroundColor: '#eff6ff' },
  typeChipText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  typeChipTextActive: { color: '#1e40af' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, backgroundColor: '#f8fafc', paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 14, color: '#0f172a', paddingVertical: 12, fontWeight: '500' },
  submitBtn: { backgroundColor: '#1e40af', borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#1e40af', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94a3b8' },
  historyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  historyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  historyLeft: { flex: 1, gap: 3 },
  historyType: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  historyDates: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  historyReason: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  pickerBtn: { padding: 6 },
  cancelBtn: { marginTop: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', alignItems: 'center' },
  cancelBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '700' },
  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },
  warnBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  warnDialog:      { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  warnIconWrap:    { width: 60, height: 60, borderRadius: 20, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  warnTitle:       { fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 10 },
  warnMsg:         { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  warnActions:     { flexDirection: 'row', gap: 12, width: '100%' },
  warnKeepBtn:     { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  warnKeepText:    { fontSize: 14, fontWeight: '700', color: '#64748b' },
  warnDiscardBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#dc2626', alignItems: 'center' },
  warnDiscardText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
