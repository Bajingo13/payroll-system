import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

const T = {
  bg: '#f8fafc', surface: '#ffffff', border: '#e2e8f0',
  accent: '#1e40af', accentLight: '#2563eb', accentBg: '#dbeafe',
  textPrimary: '#0f172a', textSub: '#64748b', textMuted: '#94a3b8',
  headerBg: '#1e3a8a', green: '#16a34a', greenBg: '#f0fdf4',
  red: '#dc2626', redBg: '#fef2f2',
};

const COLORS = ['#2563eb','#22d3ee','#34d399','#fbbf24','#f87171','#fb923c','#60a5fa','#a78bfa','#f472b6','#10b981'];

const STATUS_CFG = {
  Active:     { color: T.green, bg: T.greenBg },
  Inactive:   { color: T.textMuted, bg: '#1e293b' },
  Resigned:   { color: T.red, bg: T.redBg },
  Terminated: { color: T.red, bg: T.redBg },
};

const TABS = [
  { key: 'department', label: 'Department', icon: 'business-outline' },
  { key: 'division',   label: 'Division',   icon: 'git-branch-outline' },
  { key: 'company',    label: 'Company',    icon: 'briefcase-outline' },
];

function groupBy(employees, field) {
  return employees.reduce((acc, emp) => {
    const key = emp[field] || 'Unassigned';
    if (!acc[key]) acc[key] = [];
    acc[key].push(emp);
    return acc;
  }, {});
}

export default function HROrgSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [error,      setError]      = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [activeTab,  setActiveTab]  = useState('department');

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.employees || []);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load org data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Summary stats
  const totalEmployees  = employees.length;
  const activeEmployees = employees.filter((e) => (e.status || '').toLowerCase() === 'active').length;
  const totalDepts      = useMemo(() => new Set(employees.map((e) => e.department).filter(Boolean)).size, [employees]);
  const totalPositions  = useMemo(() => new Set(employees.map((e) => e.position).filter(Boolean)).size, [employees]);

  // Group by current tab field
  const grouped = useMemo(() => groupBy(employees, activeTab), [employees, activeTab]);
  const groupKeys = useMemo(() => Object.keys(grouped).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  }), [grouped]);

  const q = search.toLowerCase().trim();

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // When tab changes, reset expanded so all groups default open
  function switchTab(key) {
    setActiveTab(key);
    setExpanded({});
  }

  // Unique positions per group for the positions summary line
  function groupPositions(members) {
    const pos = [...new Set(members.map((e) => e.position).filter(Boolean))];
    return pos.slice(0, 3).join(', ') + (pos.length > 3 ? ` +${pos.length - 3} more` : '');
  }

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color="#93c5fd" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Organization Setup</Text>
            <Text style={s.headerSub}>{totalEmployees} employees · {totalDepts} departments</Text>
          </View>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, position, code…"
            placeholderTextColor={T.textMuted}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={T.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tab, active && s.tabActive]}
                onPress={() => switchTab(tab.key)}
              >
                <Ionicons name={tab.icon} size={13} color={active ? '#fff' : '#93c5fd'} />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.accentLight} />}
      >
        {/* ── Summary Cards ── */}
        <View style={s.summaryRow}>
          <SummaryCard label="Total" value={totalEmployees}  icon="people-outline"       color="#2563eb" />
          <SummaryCard label="Active" value={activeEmployees} icon="checkmark-circle-outline" color={T.green} />
          <SummaryCard label="Depts"  value={totalDepts}      icon="business-outline"     color="#7c3aed" />
          <SummaryCard label="Roles"  value={totalPositions}  icon="ribbon-outline"        color="#d97706" />
        </View>

        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {error ? <Text style={s.errorText}>{error}</Text> : null}

        {/* ── Grouped list ── */}
        {groupKeys.map((groupKey, di) => {
          const allMembers = grouped[groupKey];
          const members = q
            ? allMembers.filter((e) =>
                `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
                (e.emp_code || '').toLowerCase().includes(q) ||
                (e.position || '').toLowerCase().includes(q) ||
                (e.department || '').toLowerCase().includes(q) ||
                (e.division || '').toLowerCase().includes(q) ||
                (e.company || '').toLowerCase().includes(q)
              )
            : allMembers;

          if (members.length === 0) return null;

          const isOpen   = expanded[groupKey] !== false;
          const color    = COLORS[di % COLORS.length];
          const active   = members.filter((e) => (e.status || '').toLowerCase() === 'active').length;
          const posLabel = groupPositions(members);

          return (
            <View key={groupKey} style={s.groupBlock}>
              {/* Group header */}
              <TouchableOpacity style={[s.groupHeader, { borderLeftColor: color }]} onPress={() => toggle(groupKey)}>
                <View style={[s.groupDot, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.groupName}>{groupKey}</Text>
                  {posLabel ? <Text style={s.groupPositions} numberOfLines={1}>{posLabel}</Text> : null}
                </View>
                <View style={s.groupBadges}>
                  <View style={[s.badge, { backgroundColor: color + '22' }]}>
                    <Text style={[s.badgeText, { color }]}>{members.length}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: T.greenBg }]}>
                    <Text style={[s.badgeText, { color: T.green }]}>{active} active</Text>
                  </View>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color={T.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>

              {/* Members */}
              {isOpen && members.map((emp, i) => {
                const st = STATUS_CFG[emp.status] || STATUS_CFG.Inactive;
                const initial = (emp.first_name || 'E')[0].toUpperCase();
                return (
                  <View key={emp.employee_id || i} style={[s.memberRow, i === members.length - 1 && s.memberRowLast]}>
                    <View style={[s.avatar, { backgroundColor: color + '20' }]}>
                      <Text style={[s.avatarText, { color }]}>{initial}</Text>
                    </View>
                    <View style={s.memberInfo}>
                      <Text style={s.memberName}>{emp.first_name} {emp.last_name}</Text>
                      <Text style={s.memberMeta}>{emp.position || 'No position'} · {emp.emp_code}</Text>
                      {/* Show extra context depending on active tab */}
                      {activeTab !== 'department' && emp.department
                        ? <Text style={s.memberExtra}>{emp.department}</Text>
                        : null}
                      {activeTab === 'company' && emp.division
                        ? <Text style={s.memberExtra}>{emp.division}</Text>
                        : null}
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

        {!loading && groupKeys.length === 0 && !error && (
          <Text style={s.emptyText}>No employees found.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryCard({ label, value, icon, color }) {
  return (
    <View style={[sc.card, { borderTopColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card:  { flex: 1, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, borderTopWidth: 3, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, gap: 3 },
  value: { fontSize: 22, fontWeight: '900' },
  label: { fontSize: 10, fontWeight: '700', color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  // Header
  header:    { backgroundColor: T.headerBg, paddingHorizontal: 18, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 11, color: '#93c5fd', marginTop: 1 },

  // Search
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },

  // Tabs
  tabs:       { flexDirection: 'row', gap: 8 },
  tab:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabActive:  { backgroundColor: T.accentLight },
  tabLabel:   { fontSize: 12, fontWeight: '700', color: '#93c5fd' },
  tabLabelActive: { color: '#fff' },

  // Body
  body: { padding: 14, gap: 10, paddingBottom: 48 },

  // Summary row
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },

  // Group block
  groupBlock:  { backgroundColor: T.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderLeftWidth: 3 },
  groupDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  groupName:   { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  groupPositions: { fontSize: 10, color: T.textMuted, marginTop: 1 },
  groupBadges: { flexDirection: 'row', gap: 5 },
  badge:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:   { fontSize: 11, fontWeight: '800' },

  // Member rows
  memberRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border },
  memberRowLast: { borderBottomWidth: 0 },
  avatar:        { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 13, fontWeight: '900' },
  memberInfo:    { flex: 1 },
  memberName:    { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  memberMeta:    { fontSize: 10, color: T.textSub, marginTop: 1 },
  memberExtra:   { fontSize: 10, color: T.textMuted, marginTop: 1 },

  // Status
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  statusText: { fontSize: 10, fontWeight: '800' },

  // Misc
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },
  emptyText: { color: T.textMuted, textAlign: 'center', padding: 32, fontSize: 13 },
});
