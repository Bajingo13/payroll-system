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
  if (n === 'approved') return { color: '#15803d', bg: '#dcfce7' };
  if (n === 'rejected') return { color: '#b91c1c', bg: '#fee2e2' };
  if (n === 'cancelled') return { color: '#64748b', bg: '#f1f5f9' };
  return { color: '#d97706', bg: '#fef3c7' };
}

function computeHours(start, end) {
  if (!start || !end) return null;
  const s = new Date(`2000-01-01T${start}:00`);
  const e = new Date(`2000-01-01T${end}:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  return ((e - s) / 3600000).toFixed(2);
}

export default function OvertimeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('request');
  const [form, setForm] = useState({
    overtime_date: '',
    start_time: '',
    end_time: '',
    reason: '',
  });

  async function loadOverview() {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const { data } = await api.get('/employee/overtime-overview', {
        params: { user_id: user.user_id },
      });
      if (!data.success) throw new Error(data.message);
      setRequests(data.requests || []);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load overtime data.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOverview(); }, [user?.user_id]);

  async function submitOvertime() {
    if (!form.overtime_date) { setError('Please enter the overtime date.'); return; }
    if (!form.start_time || !form.end_time) { setError('Please enter start and end times (HH:MM).'); return; }
    if (!form.reason.trim()) { setError('Please provide a reason.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/employee/overtime-request', {
        user_id: user.user_id,
        overtime_date: form.overtime_date,
        start_time: form.start_time,
        end_time: form.end_time,
        reason: form.reason.trim(),
      });
      if (!data.success) throw new Error(data.message);
      Alert.alert('Success', data.message || 'Overtime request submitted successfully.');
      setForm({ overtime_date: '', start_time: '', end_time: '', reason: '' });
      await loadOverview();
      setTab('history');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to submit overtime request.'));
    } finally {
      setSubmitting(false);
    }
  }

  const previewHours = computeHours(form.start_time, form.end_time);

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
        <Text style={s.title}>Overtime Requests</Text>

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
              History ({requests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* New Request Form */}
        {tab === 'request' && (
          <View style={s.formCard}>
            <Text style={s.formTitle}>Submit Overtime Request</Text>

            <Text style={s.label}>Overtime Date (YYYY-MM-DD)</Text>
            <TextInput
              style={s.input}
              value={form.overtime_date}
              onChangeText={(v) => setForm((f) => ({ ...f, overtime_date: v }))}
              placeholder="e.g. 2024-07-01"
              placeholderTextColor="#94a3b8"
            />

            <View style={s.timeRow}>
              <View style={s.timeField}>
                <Text style={s.label}>Start Time (HH:MM)</Text>
                <TextInput
                  style={s.input}
                  value={form.start_time}
                  onChangeText={(v) => setForm((f) => ({ ...f, start_time: v }))}
                  placeholder="17:00"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={s.timeField}>
                <Text style={s.label}>End Time (HH:MM)</Text>
                <TextInput
                  style={s.input}
                  value={form.end_time}
                  onChangeText={(v) => setForm((f) => ({ ...f, end_time: v }))}
                  placeholder="20:00"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {previewHours && (
              <View style={s.durationPill}>
                <Text style={s.durationText}>⏱ Duration: {previewHours} hours</Text>
              </View>
            )}

            <Text style={s.label}>Reason</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={form.reason}
              onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
              placeholder="Describe the reason for overtime..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              onPress={submitOvertime}
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
            {requests.length === 0 && !loading ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🕐</Text>
                <Text style={s.emptyText}>No overtime requests yet.</Text>
              </View>
            ) : null}
            {requests.map((req, i) => {
              const st = getStatusStyle(req.status);
              const hrs = computeHours(req.start_time, req.end_time);
              return (
                <View key={req.request_id || i} style={s.historyCard}>
                  <View style={s.historyHeader}>
                    <Text style={s.historyDate}>{formatDate(req.overtime_date)}</Text>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusText, { color: st.color }]}>
                        {req.status || 'Pending'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.historyTime}>
                    {formatTime(req.start_time)} – {formatTime(req.end_time)}
                    {hrs ? `  •  ${hrs} hrs` : ''}
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
  timeRow: { flexDirection: 'row', gap: 10 },
  timeField: { flex: 1 },
  textarea: { height: 100, paddingTop: 12 },
  durationPill: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 14,
    marginTop: -6,
  },
  durationText: { color: '#1e40af', fontSize: 13, fontWeight: '600' },
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
  historyDate: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  historyTime: { fontSize: 13, color: '#475569' },
  historyReason: { fontSize: 12, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' },
});
