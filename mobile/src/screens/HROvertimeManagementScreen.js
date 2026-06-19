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

const STATUS_CFG = {
  Pending:   { color: '#fbbf24', bg: '#3d2e10', border: '#78350f', icon: 'time' },
  Approved:  { color: '#34d399', bg: '#0d2e1e', border: '#065f46', icon: 'checkmark-circle' },
  Rejected:  { color: '#f87171', bg: '#3d1515', border: '#7f1d1d', icon: 'close-circle' },
  Cancelled: { color: '#64748b', bg: '#1e293b', border: '#334155', icon: 'ban' },
};

function formatDate(v) {
  if (!v) return '-';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatTime(v) {
  if (!v) return '-';
  const d = new Date(`2000-01-01T${v}:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

export default function HROvertimeManagementScreen({ navigation }) {
  const { user } = useAuth();
  const insets   = useSafeAreaInsets();
  const [requests,   setRequests]   = useState([]);
  const [summary,    setSummary]    = useState({ Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 });
  const [filter,     setFilter]     = useState('Pending');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');

  const [actionModal, setActionModal] = useState(null);
  const [rejReason,   setRejReason]   = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [toast,       setToast]       = useState('');

  async function loadRequests(isRefresh = false) {
    if (!user?.user_id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { user_id: user.user_id };
      if (filter !== 'All') params.status = filter;
      const { data } = await api.get('/admin/overtime-requests', { params });
      if (!data.success) throw new Error(data.message);
      setRequests(data.requests || []);
      setSummary(data.summary || {});
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load overtime requests.')); }
    finally { setLoading(false); setRefreshing(false); }
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
    if (type === 'Rejected' && !rejReason.trim()) {
      setError('Please provide a rejection reason.'); return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.patch(
        `/admin/overtime-requests/${req.overtime_request_id}/status`,
        { user_id: user.user_id, status: type, rejection_reason: rejReason.trim() }
      );
      if (!data.success) throw new Error(data.message);
      setActionModal(null);
      setToast(`Request ${type.toLowerCase()} successfully.`);
      setTimeout(() => setToast(''), 2500);
      await loadRequests();
    } catch (err) { setError(getApiMessage(err, 'Action failed.')); }
    finally { setSubmitting(false); }
  }

  const STAT_PILLS = [
    { label: 'Pending',  count: summary.Pending,  color: '#fbbf24' },
    { label: 'Approved', count: summary.Approved, color: '#34d399' },
    { label: 'Rejected', count: summary.Rejected, color: '#f87171' },
  ];

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <View>
            <View style={s.rolePill}>
              <Ionicons name="time" size={11} color={T.accentLight} />
              <Text style={s.rolePillText}>HR Management</Text>
            </View>
            <Text style={s.headerTitle}>Overtime Requests</Text>
            <Text style={s.headerSub}>Review and action employee overtime</Text>
          </View>
          <TouchableOpacity style={s.headerIconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications" size={20} color={T.accentLight} />
          </TouchableOpacity>
        </View>

        <View style={s.statRow}>
          {STAT_PILLS.map((p) => (
            <View key={p.label} style={[s.statPill, { borderColor: p.color + '44' }]}>
              <Text style={[s.statCount, { color: p.color }]}>{p.count}</Text>
              <Text style={s.statLabel}>{p.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Filter tabs ── */}
      <View style={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={s.errorWrap}>
          <Ionicons name="alert-circle" size={14} color="#f87171" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* ── List ── */}
      <ScrollView
        style={s.list}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadRequests(true)} tintColor={T.accentLight} />}
      >
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}

        {!loading && requests.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="time-outline" size={52} color={T.textMuted} />
            <Text style={s.emptyTitle}>No {filter !== 'All' ? filter.toLowerCase() : ''} overtime requests</Text>
            <Text style={s.emptySub}>Pull down to refresh</Text>
          </View>
        )}

        {requests.map((req) => {
          const st = STATUS_CFG[req.status] || STATUS_CFG.Pending;
          const isPending = req.status === 'Pending';
          const hours = req.total_hours
            ? `${Number(req.total_hours).toFixed(2)} hrs`
            : '-';
          return (
            <View key={req.overtime_request_id} style={s.card}>
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

              {/* Details */}
              <View style={s.detailGrid}>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>Date</Text>
                  <Text style={s.detailValue}>{formatDate(req.overtime_date)}</Text>
                </View>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>Hours</Text>
                  <Text style={[s.detailValue, { color: '#fbbf24' }]}>{hours}</Text>
                </View>
                <View style={[s.detailItem, { flex: 2 }]}>
                  <Text style={s.detailLabel}>Time Range</Text>
                  <Text style={s.detailValue}>{formatTime(req.start_time)} — {formatTime(req.end_time)}</Text>
                </View>
              </View>

              {req.reason ? (
                <View style={s.reasonWrap}>
                  <Ionicons name="chatbubble-outline" size={12} color={T.textMuted} />
                  <Text style={s.reasonText} numberOfLines={2}>{req.reason}</Text>
                </View>
              ) : null}

              {req.rejection_reason ? (
                <View style={[s.reasonWrap, { backgroundColor: '#3d1515', borderColor: '#7f1d1d' }]}>
                  <Ionicons name="close-circle-outline" size={12} color="#f87171" />
                  <Text style={[s.reasonText, { color: '#f87171' }]}>{req.rejection_reason}</Text>
                </View>
              ) : null}

              {isPending && (
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => openAction(req, 'Rejected')}>
                    <Ionicons name="close" size={15} color="#f87171" />
                    <Text style={s.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.approveBtn} onPress={() => openAction(req, 'Approved')}>
                    <Ionicons name="checkmark" size={15} color="#fff" />
                    <Text style={s.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Toast ── */}
      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ── Action Modal ── */}
      <Modal visible={Boolean(actionModal)} transparent animationType="slide" onRequestClose={() => setActionModal(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setActionModal(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>
              {actionModal?.type === 'Approved' ? 'Approve Overtime Request' : 'Reject Overtime Request'}
            </Text>
            {actionModal?.req && (
              <Text style={s.modalSub}>
                {actionModal.req.employee_name}
                {'\n'}{formatDate(actionModal.req.overtime_date)} · {Number(actionModal.req.total_hours || 0).toFixed(2)} hrs
              </Text>
            )}
            {actionModal?.type === 'Rejected' && (
              <>
                <Text style={s.modalLabel}>Rejection Reason *</Text>
                <TextInput
                  style={s.modalInput}
                  value={rejReason}
                  onChangeText={setRejReason}
                  placeholder="Explain why this overtime is rejected…"
                  placeholderTextColor={T.textMuted}
                  multiline
                  textAlignVertical="top"
                />
              </>
            )}
            {error ? <Text style={s.modalError}>{error}</Text> : null}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setActionModal(null)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, actionModal?.type === 'Rejected' && s.modalConfirmRed, submitting && { opacity: 0.6 }]}
                onPress={submitAction}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalConfirmText}>{actionModal?.type === 'Approved' ? 'Approve' : 'Reject'}</Text>
                }
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
  header:    { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  rolePill:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: 20, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)' },
  rolePillText: { fontSize: 10, color: T.accentLight, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: T.textPrimary },
  headerSub:   { fontSize: 12, color: T.textSub, marginTop: 2 },
  headerIconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: 12 },
  statRow:  { flexDirection: 'row', gap: 8 },
  statPill: { flex: 1, backgroundColor: T.surface, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1 },
  statCount:{ fontSize: 20, fontWeight: '900' },
  statLabel:{ fontSize: 10, color: T.textSub, fontWeight: '600', marginTop: 1 },
  filterRow:  { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: T.bg },
  filterChip: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 20, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  filterChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  filterText: { fontSize: 12, color: T.textSub, fontWeight: '700' },
  filterTextActive: { color: '#fff' },
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3d1515', borderRadius: 12, borderWidth: 1, borderColor: '#7f1d1d', padding: 12, marginHorizontal: 14, marginBottom: 4 },
  errorText: { color: '#f87171', fontSize: 13, flex: 1 },
  list:        { flex: 1 },
  listContent: { padding: 14, gap: 10, paddingBottom: 40 },
  card:     { backgroundColor: T.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.border },
  cardTop:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  empAvatar:{ width: 38, height: 38, borderRadius: 12, backgroundColor: T.accentBg, alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { fontSize: 15, fontWeight: '900', color: T.accentLight },
  cardMeta: { flex: 1 },
  empName:  { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  empDept:  { fontSize: 11, color: T.textSub, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800' },
  detailGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  detailItem: { flex: 1, backgroundColor: T.surfaceAlt, borderRadius: 10, padding: 9 },
  detailLabel:{ fontSize: 9, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  detailValue:{ fontSize: 12, fontWeight: '700', color: T.textPrimary },
  reasonWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: T.surfaceAlt, borderRadius: 10, padding: 9, borderWidth: 1, borderColor: T.border, marginBottom: 10 },
  reasonText: { flex: 1, fontSize: 12, color: T.textSub, lineHeight: 17 },
  actionRow:  { flexDirection: 'row', gap: 8, marginTop: 4 },
  rejectBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: '#3d1515', borderWidth: 1, borderColor: '#7f1d1d' },
  rejectBtnText: { color: '#f87171', fontWeight: '800', fontSize: 13 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: T.accent },
  approveBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0d2e1e', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#065f46' },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },
  empty:      { alignItems: 'center', paddingVertical: 56, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.textSub },
  emptySub:   { fontSize: 12, color: T.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: T.border },
  modalHandle:   { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:    { fontSize: 18, fontWeight: '900', color: T.textPrimary, marginBottom: 6 },
  modalSub:      { fontSize: 13, color: T.textSub, lineHeight: 20, marginBottom: 16 },
  modalLabel:    { fontSize: 11, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  modalInput:    { backgroundColor: T.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: T.border, color: T.textPrimary, fontSize: 14, padding: 12, minHeight: 90, marginBottom: 14 },
  modalError:    { color: '#f87171', fontSize: 12, marginBottom: 8 },
  modalActions:  { flexDirection: 'row', gap: 10 },
  modalCancel:   { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border },
  modalCancelText: { color: T.textSub, fontWeight: '700', fontSize: 14 },
  modalConfirm:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: T.accent },
  modalConfirmRed: { backgroundColor: '#7f1d1d' },
  modalConfirmText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
