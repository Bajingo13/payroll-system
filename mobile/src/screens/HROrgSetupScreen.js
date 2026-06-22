import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

const T = { bg:'#f8fafc', surface:'#ffffff', surfaceAlt:'#f1f5f9', border:'#e2e8f0', accent:'#1e40af', accentLight:'#2563eb', textPrimary:'#0f172a', textSub:'#64748b', textMuted:'#94a3b8', headerBg:'#1e3a8a' };
const COLORS = ['#2563eb','#22d3ee','#34d399','#fbbf24','#f87171','#fb923c','#60a5fa','#1e40af'];

const STATUS_CFG = {
  Active:      { color: '#16a34a', bg: '#f0fdf4' },
  Inactive:    { color: '#94a3b8', bg: '#1e293b' },
  Resigned:    { color: '#dc2626', bg: '#fef2f2' },
  Terminated:  { color: '#dc2626', bg: '#fef2f2' },
};

export default function HROrgSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [employees,   setEmployees]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [error,       setError]       = useState('');
  const [expanded,    setExpanded]    = useState({});

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.employees || []);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load org data.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  // Group by department
  const grouped = employees.reduce((acc, emp) => {
    const dept = emp.department || 'Unassigned';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {});

  const depts = Object.keys(grouped).sort();
  const q = search.toLowerCase();

  function toggle(dept) { setExpanded((p) => ({ ...p, [dept]: !p[dept] })); }

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.headerTitle}>Org Setup</Text>
            <Text style={s.headerSub}>{employees.length} employees across {depts.length} departments</Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search name, department, position…" placeholderTextColor={T.textMuted} />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.accentLight} />}>
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {error ? <Text style={s.errorText}>{error}</Text> : null}

        {depts.map((dept, di) => {
          const members = grouped[dept].filter((e) =>
            !q || (`${e.first_name} ${e.last_name}`).toLowerCase().includes(q) ||
            (e.emp_code || '').toLowerCase().includes(q) ||
            (e.position || '').toLowerCase().includes(q) ||
            dept.toLowerCase().includes(q)
          );
          if (members.length === 0) return null;
          const isOpen = expanded[dept] !== false; // default open
          const color  = COLORS[di % COLORS.length];

          return (
            <View key={dept} style={s.deptBlock}>
              <TouchableOpacity style={[s.deptHeader, { borderLeftColor: color }]} onPress={() => toggle(dept)}>
                <View style={[s.deptDot, { backgroundColor: color }]} />
                <Text style={s.deptName}>{dept}</Text>
                <View style={[s.deptCount, { backgroundColor: color + '22' }]}>
                  <Text style={[s.deptCountText, { color }]}>{members.length}</Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={T.textMuted} />
              </TouchableOpacity>

              {isOpen && members.map((emp, i) => {
                const st = STATUS_CFG[emp.status] || STATUS_CFG.Inactive;
                return (
                  <View key={emp.employee_id || i} style={s.empRow}>
                    <View style={[s.empAvatar, { backgroundColor: color + '20' }]}>
                      <Text style={[s.empAvatarText, { color }]}>{(emp.first_name || 'E')[0]}</Text>
                    </View>
                    <View style={s.empInfo}>
                      <Text style={s.empName}>{emp.first_name} {emp.last_name}</Text>
                      <Text style={s.empMeta}>{emp.position || 'No position'} · {emp.emp_code}</Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusText, { color: st.color }]}>{emp.status || 'Active'}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 11, color: '#93c5fd' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  body: { padding: 14, gap: 10, paddingBottom: 48 },
  deptBlock: { backgroundColor: T.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
  deptHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderLeftWidth: 3 },
  deptDot: { width: 8, height: 8, borderRadius: 4 },
  deptName: { flex: 1, fontSize: 14, fontWeight: '800', color: T.textPrimary },
  deptCount: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  deptCountText: { fontSize: 12, fontWeight: '800' },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border },
  empAvatar: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { fontSize: 13, fontWeight: '900' },
  empInfo: { flex: 1 },
  empName: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  empMeta: { fontSize: 10, color: T.textSub },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },
});
