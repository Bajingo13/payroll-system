import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

const T = { bg:'#0f172a', surface:'#1e293b', surfaceAlt:'#273548', border:'#334155', accent:'#8b5cf6', accentLight:'#a78bfa', textPrimary:'#f1f5f9', textSub:'#94a3b8', textMuted:'#64748b', headerBg:'#1e1b4b' };

export default function HRScheduleScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [error,      setError]      = useState('');
  const [detail,     setDetail]     = useState(null);  // { employee, schedule }
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function loadList(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/admin_schedule_management_list');
      setEmployees(data.employees || []);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load employees.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  async function openDetail(emp) {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/admin_schedule_management/${emp.employee_id}`);
      setDetail({ employee: data.employee || emp, schedule: data.schedule || {} });
    } catch (_) { setDetail({ employee: emp, schedule: {} }); }
    finally { setLoadingDetail(false); }
  }

  useEffect(() => { loadList(); }, []);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return !q || (e.full_name || '').toLowerCase().includes(q) ||
      (e.emp_code || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q);
  });

  const sch = detail?.schedule || {};
  const SCHED_FIELDS = [
    { label: 'Payroll Period',   value: sch.payroll_period },
    { label: 'Payroll Rate',     value: sch.payroll_rate },
    { label: 'Hours / Day',      value: sch.hours_in_day },
    { label: 'Days / Week',      value: sch.days_in_week },
    { label: 'Days / Year',      value: sch.days_in_year },
    { label: 'Weeks / Year',     value: sch.week_in_year },
    { label: 'OT Rate',          value: sch.ot_rate },
    { label: 'Main Computation', value: sch.main_computation },
    { label: 'Basis Absences',   value: sch.basis_absences },
    { label: 'Basis OT',         value: sch.basis_overtime },
    { label: 'Strict No OT',     value: sch.strict_no_overtime ? 'Yes' : 'No' },
  ];

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>Schedule Management</Text>
            <Text style={s.headerSub}>Employee payroll schedule settings</Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search name, ID, department…" placeholderTextColor={T.textMuted} />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadList(true)} tintColor={T.accentLight} />}>
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {error ? <Text style={s.errorText}>{error}</Text> : null}
        {filtered.map((emp, i) => (
          <TouchableOpacity key={emp.employee_id || i} style={s.empCard} onPress={() => openDetail(emp)}>
            <View style={s.empAvatar}>
              <Text style={s.empAvatarText}>{(emp.full_name || 'E')[0]}</Text>
            </View>
            <View style={s.empInfo}>
              <Text style={s.empName}>{emp.full_name}</Text>
              <Text style={s.empMeta}>{emp.emp_code} · {emp.department || 'No dept'}</Text>
            </View>
            <View style={[s.statusPill, emp.status?.toLowerCase() === 'active' ? s.pillGreen : s.pillGray]}>
              <Text style={[s.statusText, emp.status?.toLowerCase() === 'active' ? { color: '#34d399' } : { color: T.textMuted }]}>
                {emp.status || 'Active'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={Boolean(detail)} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={s.modalBg} onPress={() => setDetail(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            {loadingDetail ? <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} /> : (
              <>
                <View style={s.modalEmpRow}>
                  <View style={s.modalAvatar}>
                    <Text style={s.modalAvatarText}>{(detail?.employee?.full_name || 'E')[0]}</Text>
                  </View>
                  <View>
                    <Text style={s.modalEmpName}>{detail?.employee?.full_name}</Text>
                    <Text style={s.modalEmpMeta}>{detail?.employee?.emp_code} · {detail?.employee?.department}</Text>
                  </View>
                </View>
                <Text style={s.modalSectionLabel}>Schedule Settings</Text>
                {SCHED_FIELDS.map((f) => (
                  <View key={f.label} style={s.modalRow}>
                    <Text style={s.modalRowLabel}>{f.label}</Text>
                    <Text style={s.modalRowValue}>{f.value ?? '—'}</Text>
                  </View>
                ))}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: T.textPrimary },
  headerSub: { fontSize: 11, color: T.textSub },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  body: { padding: 14, gap: 10, paddingBottom: 48 },
  empCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: T.border },
  empAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#2d1f52', alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { color: T.accentLight, fontSize: 15, fontWeight: '900' },
  empInfo: { flex: 1 },
  empName: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  empMeta: { fontSize: 11, color: T.textSub },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillGreen: { backgroundColor: '#0d2e1e' }, pillGray: { backgroundColor: T.surfaceAlt },
  statusText: { fontSize: 10, fontWeight: '800' },
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%', borderWidth: 1, borderColor: T.border },
  modalHandle: { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalEmpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  modalAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  modalAvatarText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  modalEmpName: { fontSize: 16, fontWeight: '800', color: T.textPrimary },
  modalEmpMeta: { fontSize: 12, color: T.textSub },
  modalSectionLabel: { fontSize: 10, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border },
  modalRowLabel: { fontSize: 13, color: T.textSub },
  modalRowValue: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
});
