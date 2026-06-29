import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

const T = {
  bg:          '#f8fafc',
  surface:     '#ffffff',
  border:      '#e2e8f0',
  accent:      '#1e40af',
  accentLight: '#2563eb',
  textPrimary: '#0f172a',
  textSub:     '#64748b',
  textMuted:   '#94a3b8',
  headerBg:    '#1e3a8a',
};

const STATUS_CFG = {
  Pending:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'time' },
  Approved:  { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: 'checkmark-circle' },
  Rejected:  { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: 'close-circle' },
  Cancelled: { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: 'ban' },
};

const FILTERS = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'All'];

function formatDate(v) {
  if (!v) return '—';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatTime(v) {
  if (!v) return '—';
  const t = String(v).slice(0, 5);
  const d = new Date(`2000-01-01T${t}:00`);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-PH', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function TimeRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={s.timeItem}>
      <Text style={s.timeLabel}>{label}</Text>
      <Text style={s.timeValue}>{formatTime(value)}</Text>
    </View>
  );
}

export default function HRAttendanceCorrectionScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [requests, setRequests]     = useState([]);
  const [summary, setSummary]       = useState({ Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 });
  const [filter, setFilter]         = useState('Pending');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');

  const [actionModal, setActionModal] = useState(null); // { req, type: 'Approved'|'Rejected' }
  const [rejReason, setRejReason]     = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [toast, setToast]             = useState('');

  async function loadRequests(isRefresh = false) {
    if (!user?.user_id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const params = { user_id: user.user_id };
      if (filter !== 'All') params.status = filter;
      const { data } = await api.get('/admin/attendance-correction-requests', { params });
      setRequests(data.requests || []);
      setSummary(data.summary || { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 });
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load requests.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadRequests(); }, [user?.user_id, filter]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadRequests());
    return unsub;
  }, [navigation, user?.user_id, filter]);

  function openAction(req, type) {
    setRejReason('');
    setError('');
    setActionModal({ req, type });
  }

  async function submitAction() {
    if (!actionModal) return;
    const { req, type } = actionModal;
    if (type === 'Rejected' && rejReason.trim().length < 3) {
      setError('Please provide a rejection reason.'); return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.patch(
        `/admin/attendance-correction-requests/${req.correction_id}/status`,
        { user_id: user.user_id, status: type, rejection_reason: rejReason.trim() }
      );
      if (!data.success) throw new Error(data.message);
      setActionModal(null);
      setToast(`Request ${type === 'Approved' ? 'approved' : 'rejected'} successfully.`);
      setTimeout(() => setToast(''), 2500);
      loadRequests();
    } catch (err) {
      setError(getApiMessage(err, 'Action failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  const STAT_PILLS = [
    { label: 'Pending',   count: summary.Pending,   color: '#fbbf24' },
    { label: 'Approved',  count: summary.Approved,  color: '#34d399' },
    { label: 'Rejected',  count: summary.Rejected,  color: '#f87171' },
    { label: 'Cancelled', count: summary.Cancelled, color: '#94a3b8' },
  ];

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={s.rolePill}>
              <Ionicons name="create" size={11} color={T.accentLight} />
              <Text style={s.rolePillText}>HR Management</Text>
            </View>
            <Text style={s.headerTitle}>Attendance Corrections</Text>
            <Text style={s.headerSub}>Review and action correction requests</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => navigation.navigate('Notifications')} accessibilityLabel="Notifications">
              <Ionicons name="notifications" size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity style={s.avatarBtn} onPress={() => navigation.navigate('Settings', {})} accessibilityLabel="Account settings">
              <Text style={s.avatarText}>{String((user?.full_name?.split(' ')[0] || 'H')[0]).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={s.statRow}>
            {STAT_PILLS.map((p) => (
              <View key={p.label} style={[s.statPill, { borderColor: p.color + '44' }]}>
                <Text style={[s.statCount, { color: p.color }]}>{p.count ?? 0}</Text>
                <Text style={s.statLabel}>{p.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {error ? (
        <View style={s.errorWrap}>
          <Ionicons name="alert-circle" size={14} color="#f87171" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* List */}
      <ScrollView
        style={s.list}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadRequests(true)} tintColor={T.accentLight} />}
      >
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}

        {!loading && requests.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="create-outline" size={52} color={T.textMuted} />
            <Text style={s.emptyTitle}>No {filter !== 'All' ? filter.toLowerCase() : ''} requests</Text>
            <Text style={s.emptySub}>Pull down to refresh</Text>
          </View>
        )}

        {requests.map((req) => {
          const st = STATUS_CFG[req.status] || STATUS_CFG.Pending;
          const isPending = req.status === 'Pending';
          return (
            <View key={req.correction_id} style={s.card}>
              {/* Card header */}
              <View style={s.cardTop}>
                <View style={s.empAvatar}>
                  <Text style={s.empAvatarText}>{(req.employee_name || 'E')[0]}</Text>
                </View>
                <View style={s.cardMeta}>
                  <Text style={s.empName}>{req.employee_name}</Text>
                  <Text style={s.empDept}>{req.department || 'No department'} · {req.emp_code}</Text>
                </View>
                <View style={[s.statusPill, { backgroundColor: st.bg, borderColor: st.border }]}>
                  <Ionicons name={st.icon} size={11} color={st.color} />
                  <Text style={[s.statusText, { color: st.color }]}>{req.status}</Text>
                </View>
              </View>

              {/* Date */}
              <View style={s.dateRow}>
                <Ionicons name="calendar-outline" size={13} color={T.textMuted} />
                <Text style={s.dateText}>Attendance Date: <Text style={{ fontWeight: '700', color: T.textPrimary }}>{formatDate(req.attendance_date)}</Text></Text>
              </View>

              {/* Times grid */}
              <View style={s.timeGrid}>
                <TimeRow label="Time In"    value={req.requested_time_in} />
                <TimeRow label="Break Out"  value={req.requested_break_out} />
                <TimeRow label="Break In"   value={req.requested_break_in} />
                <TimeRow label="Time Out"   value={req.requested_time_out} />
              </View>

              {/* Reason */}
              {req.reason ? (
                <View style={s.reasonWrap}>
                  <Ionicons name="chatbubble-outline" size={12} color={T.textMuted} />
                  <Text style={s.reasonText} numberOfLines={3}>{req.reason}</Text>
                </View>
              ) : null}

              {/* Rejection reason */}
              {req.rejection_reason ? (
                <View style={[s.reasonWrap, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                  <Ionicons name="close-circle-outline" size={12} color="#f87171" />
                  <Text style={[s.reasonText, { color: '#f87171' }]}>{req.rejection_reason}</Text>
                </View>
              ) : null}

              {/* Reviewed by */}
              {req.reviewed_by_name && req.status !== 'Pending' && (
                <Text style={s.reviewedBy}>By {req.reviewed_by_name} · {formatDateTime(req.reviewed_at)}</Text>
              )}

              {/* Submitted */}
              <Text style={s.submittedAt}>Submitted {formatDateTime(req.created_at)}</Text>

              {/* Actions */}
              {isPending && (
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => openAction(req, 'Rejected')} accessibilityLabel={`Reject correction request from ${req.employee_name}`}>
                    <Ionicons name="close" size={15} color="#f87171" />
                    <Text style={s.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.approveBtn} onPress={() => openAction(req, 'Approved')} accessibilityLabel={`Approve correction request from ${req.employee_name}`}>
                    <Ionicons name="checkmark" size={15} color="#fff" />
                    <Text style={s.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Toast */}
      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Action Modal */}
      <Modal
        visible={Boolean(actionModal)}
        transparent
        animationType="slide"
        onRequestClose={() => { setActionModal(null); setError(''); }}
      >
        <Pressable style={s.modalBackdrop} onPress={() => { setActionModal(null); setError(''); }}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />

            <Text style={s.modalTitle}>
              {actionModal?.type === 'Approved' ? 'Approve Request' : 'Reject Request'}
            </Text>

            {actionModal?.req && (
              <>
                <Text style={s.modalSub}>
                  {actionModal.req.employee_name}
                  {'\n'}Attendance Date: {formatDate(actionModal.req.attendance_date)}
                </Text>

                {/* Times summary in modal */}
                <View style={[s.timeGrid, { marginBottom: 4 }]}>
                  <TimeRow label="Time In"   value={actionModal.req.requested_time_in} />
                  <TimeRow label="Break Out" value={actionModal.req.requested_break_out} />
                  <TimeRow label="Break In"  value={actionModal.req.requested_break_in} />
                  <TimeRow label="Time Out"  value={actionModal.req.requested_time_out} />
                </View>
              </>
            )}

            {actionModal?.type === 'Rejected' && (
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Rejection Reason *</Text>
                <TextInput
                  style={s.textArea}
                  placeholder="Explain why this request is being rejected…"
                  placeholderTextColor={T.textMuted}
                  value={rejReason}
                  onChangeText={setRejReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            )}

            {actionModal?.type === 'Approved' && (
              <View style={[s.confirmNote, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                <Ionicons name="information-circle-outline" size={14} color="#16a34a" />
                <Text style={[s.confirmNoteText, { color: '#16a34a' }]}>This will update the employee's attendance record.</Text>
              </View>
            )}

            {error ? (
              <View style={s.errorWrap}>
                <Ionicons name="alert-circle" size={14} color="#f87171" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => { setActionModal(null); setError(''); }} disabled={submitting}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, { backgroundColor: actionModal?.type === 'Approved' ? '#16a34a' : '#dc2626' }]}
                onPress={submitAction}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalConfirmText}>{actionModal?.type === 'Approved' ? 'Confirm Approve' : 'Confirm Reject'}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerIconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  rolePillText: { fontSize: 10, color: '#bfdbfe', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 3 },

  statRow: { flexDirection: 'row', gap: 8 },
  statPill: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, minWidth: 72 },
  statCount: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#93c5fd', fontWeight: '600', marginTop: 1 },

  filterScroll: { backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border, flexGrow: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, alignSelf: 'center' },
  filterChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  filterText: { fontSize: 12, fontWeight: '600', color: T.textSub },
  filterTextActive: { color: '#fff' },

  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, margin: 12, backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fecaca' },
  errorText: { fontSize: 12, color: '#dc2626', flex: 1 },

  list: { flex: 1 },
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.textSub },
  emptySub: { fontSize: 13, color: T.textMuted },

  card: { backgroundColor: T.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.border, gap: 10 },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  empAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { fontSize: 16, fontWeight: '800', color: T.accent },
  cardMeta: { flex: 1 },
  empName: { fontSize: 14, fontWeight: '700', color: T.textPrimary },
  empDept: { fontSize: 11, color: T.textSub, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { fontSize: 12, color: T.textSub },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeItem: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: '44%', flex: 1 },
  timeLabel: { fontSize: 9, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  timeValue: { fontSize: 13, fontWeight: '700', color: T.textPrimary, marginTop: 2 },

  reasonWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: T.border },
  reasonText: { fontSize: 12, color: T.textSub, flex: 1, lineHeight: 17 },

  reviewedBy: { fontSize: 11, color: T.textMuted, fontStyle: 'italic' },
  submittedAt: { fontSize: 10, color: T.textMuted },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: '#f87171' },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, backgroundColor: '#16a34a' },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0f172a', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  toastText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 14 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: T.textPrimary },
  modalSub: { fontSize: 13, color: T.textSub, lineHeight: 20 },

  confirmNote: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, padding: 10 },
  confirmNoteText: { fontSize: 12, fontWeight: '600', flex: 1 },

  inputWrap: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  textArea: { borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 12, fontSize: 13, color: T.textPrimary, backgroundColor: T.bg, minHeight: 80 },

  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: T.textSub, textAlign: 'center', letterSpacing: 0 },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff', textAlign: 'center', letterSpacing: 0 },
});
