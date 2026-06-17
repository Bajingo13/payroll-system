import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  if (n === 'approved') return { color: '#15803d', bg: '#dcfce7' };
  if (n === 'rejected') return { color: '#b91c1c', bg: '#fee2e2' };
  if (n === 'cancelled') return { color: '#64748b', bg: '#f1f5f9' };
  return { color: '#d97706', bg: '#fef3c7' };
}

export default function LeaveScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('request');
  const [form, setForm] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: '',
  });

  async function loadOverview() {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const { data } = await api.get('/employee/leave-overview', {
        params: { user_id: user.user_id },
      });
      if (!data.success) throw new Error(data.message);
      setLeaveTypes(data.leaveTypes || []);
      setLeaveBalances(data.leaveBalances || []);
      setLeaveRequests(data.leaveRequests || []);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load leave data.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOverview(); }, [user?.user_id]);

  async function submitLeave() {
    if (!form.leave_type_id) { setError('Please select a leave type.'); return; }
    if (!form.start_date || !form.end_date) { setError('Please enter start and end dates (YYYY-MM-DD).'); return; }
    if (!form.reason.trim()) { setError('Please provide a reason.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/employee/leave-request', {
        user_id: user.user_id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim(),
      });
      if (!data.success) throw new Error(data.message);
      Alert.alert('Success', data.message || 'Leave request submitted successfully.');
      setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
      await loadOverview();
      setTab('history');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to submit leave request.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>Leave Requests</Text>

        {/* Leave balance cards */}
        {leaveBalances.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.balanceScroll}
            contentContainerStyle={{ gap: 10 }}
          >
            {leaveBalances.map((bal) => (
              <View key={bal.leave_type_id} style={s.balanceCard}>
                <Text style={s.balanceName}>{bal.leave_name || bal.leave_type_name}</Text>
                <Text style={s.balanceCount}>{Number(bal.remaining_days ?? bal.balance ?? 0).toFixed(1)}</Text>
                <Text style={s.balanceSub}>days left</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'request' && s.tabBtnActive]}
            onPress={() => setTab('request')}
          >
            <Text style={[s.tabText, tab === 'request' && s.tabTextActive]}>New Request</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'history' && s.tabBtnActive]}
            onPress={() => setTab('history')}
          >
            <Text style={[s.tabText, tab === 'history' && s.tabTextActive]}>
              History ({leaveRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* New Request Form */}
        {tab === 'request' && (
          <View style={s.formCard}>
            <Text style={s.formTitle}>Submit Leave Request</Text>

            <Text style={s.label}>Leave Type</Text>
            {leaveTypes.length === 0 ? (
              <Text style={s.noData}>No leave types available.</Text>
            ) : (
              <View style={s.typeGrid}>
                {leaveTypes.map((lt) => {
                  const isActive = form.leave_type_id === String(lt.leave_type_id);
                  return (
                    <TouchableOpacity
                      key={lt.leave_type_id}
                      style={[s.typeChip, isActive && s.typeChipActive]}
                      onPress={() =>
                        setForm((f) => ({ ...f, leave_type_id: String(lt.leave_type_id) }))
                      }
                    >
                      <Text style={[s.typeChipText, isActive && s.typeChipTextActive]}>
                        {lt.leave_name || lt.leave_type_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={s.label}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={s.input}
              value={form.start_date}
              onChangeText={(v) => setForm((f) => ({ ...f, start_date: v }))}
              placeholder="e.g. 2024-07-01"
              placeholderTextColor="#94a3b8"
            />

            <Text style={s.label}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              style={s.input}
              value={form.end_date}
              onChangeText={(v) => setForm((f) => ({ ...f, end_date: v }))}
              placeholder="e.g. 2024-07-05"
              placeholderTextColor="#94a3b8"
            />

            <Text style={s.label}>Reason</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={form.reason}
              onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
              placeholder="Describe the reason for your leave..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              onPress={submitLeave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.submitText}>Submit Request</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* History */}
        {tab === 'history' && (
          <View>
            {loading ? (
              <ActivityIndicator color="#1e40af" style={{ marginVertical: 20 }} />
            ) : null}
            {leaveRequests.length === 0 && !loading ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🏖️</Text>
                <Text style={s.emptyText}>No leave requests yet.</Text>
              </View>
            ) : null}
            {leaveRequests.map((req, i) => {
              const st = getStatusStyle(req.status);
              return (
                <View key={req.leave_id || i} style={s.historyCard}>
                  <View style={s.historyHeader}>
                    <Text style={s.historyType}>{req.leave_type_name || 'Leave'}</Text>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusText, { color: st.color }]}>
                        {req.status || 'Pending'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.historyDate}>
                    {formatDate(req.start_date)} – {formatDate(req.end_date)}
                  </Text>
                  {req.reason ? <Text style={s.historyReason}>{req.reason}</Text> : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  balanceScroll: { marginBottom: 16 },
  balanceCard: {
    backgroundColor: '#1e40af',
    borderRadius: 14,
    padding: 14,
    minWidth: 110,
    alignItems: 'center',
  },
  balanceName: { fontSize: 11, color: '#bfdbfe', textAlign: 'center' },
  balanceCount: { fontSize: 30, fontWeight: '800', color: '#fff', marginTop: 4 },
  balanceSub: { fontSize: 10, color: '#93c5fd', marginTop: 2 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#fff', elevation: 2 },
  tabText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#1e40af' },
  error: { color: '#b91c1c', marginBottom: 12, fontSize: 13 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 2 },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noData: { fontSize: 13, color: '#94a3b8', marginBottom: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
  typeChipActive: { borderColor: '#1e40af', backgroundColor: '#eff6ff' },
  typeChipText: { fontSize: 13, color: '#64748b' },
  typeChipTextActive: { color: '#1e40af', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    marginBottom: 14,
    backgroundColor: '#f8fafc',
  },
  textarea: { height: 100, paddingTop: 12 },
  submitBtn: { backgroundColor: '#1e40af', borderRadius: 10, padding: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#475569', fontWeight: '600' },
  historyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2 },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyType: { fontSize: 14, fontWeight: '700', color: '#1e293b', flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  historyDate: { fontSize: 12, color: '#64748b' },
  historyReason: { fontSize: 12, color: '#475569', marginTop: 4, fontStyle: 'italic' },
});
