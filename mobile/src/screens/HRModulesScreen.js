import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const T = {
  bg:         '#f8fafc',
  surface:    '#ffffff',
  border:     '#e2e8f0',
  accent:     '#1e40af',
  accentLight:'#2563eb',
  textPrimary:'#0f172a',
  textSub:    '#64748b',
  textMuted:  '#94a3b8',
  headerBg:   '#1e3a8a',
};

const HRIS_MODULES = [
  { icon: 'people',          label: 'Employee File',       color: '#2563eb', screen: 'HREmployeeFile' },
  { icon: 'folder-open',     label: '201 Files',           color: '#22d3ee', screen: 'HR201Files' },
  { icon: 'git-branch',      label: 'Org Setup',           color: '#34d399', screen: 'HROrgSetup' },
  { icon: 'calendar',        label: 'Attendance',          color: '#60a5fa', screen: 'Attendance' },
  { icon: 'leaf',            label: 'Leave',               color: '#34d399', screen: 'Leave' },
  { icon: 'time',            label: 'Overtime',            color: '#fbbf24', screen: 'Overtime' },
  { icon: 'calendar-number', label: 'Schedule',            color: '#c084fc', screen: 'HRSchedule' },
  { icon: 'trending-up',     label: 'Performance',         color: '#f87171', screen: 'HRPerformance' },
];

const HR_TOOL_MODULES = [
  { icon: 'shield-checkmark', label: 'Auditing',          color: '#94a3b8', screen: 'HRAuditing' },
  { icon: 'calendar-clear',   label: 'Company Calendar',  color: '#22d3ee', screen: 'HRCalendar' },
  { icon: 'construct',        label: 'Utilities',         color: '#fbbf24', screen: 'HRUtilities' },
];

function SectionHeader({ icon, title }) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={14} color={T.accent} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function ModuleCard({ item, onPress }) {
  const isLinked = Boolean(item.screen);
  return (
    <TouchableOpacity
      style={[s.card, !isLinked && s.cardDimmed]}
      onPress={isLinked ? onPress : null}
      activeOpacity={isLinked ? 0.65 : 1}
    >
      <View style={[s.cardIcon, { backgroundColor: item.color + '20' }]}>
        <Ionicons name={item.icon} size={26} color={item.color} />
      </View>
      <Text style={s.cardLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{item.label}</Text>
      {isLinked && <View style={[s.linkDot, { backgroundColor: item.color }]} />}
    </TouchableOpacity>
  );
}

export default function HRModulesScreen({ navigation }) {
  const { user } = useAuth();
  const insets   = useSafeAreaInsets();

  function goTo(screen) {
    if (screen) navigation.navigate(screen);
  }

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={s.rolePill}>
              <Ionicons name="apps" size={11} color={T.accentLight} />
              <Text style={s.rolePillText}>HR Management</Text>
            </View>
            <Text style={s.headerTitle}>Modules</Text>
            <Text style={s.headerSub}>Quick access to all HR functions</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications" size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity style={s.avatarBtn} onPress={() => navigation.navigate('Settings', {})}>
              <Text style={s.avatarText}>{String((user?.full_name?.split(' ')[0] || 'H')[0]).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {/* HRIS */}
        <SectionHeader icon="briefcase" title="HRIS" />
        <View style={s.grid}>
          {HRIS_MODULES.map((m) => (
            <ModuleCard key={m.label} item={m} onPress={() => goTo(m.screen)} />
          ))}
        </View>

        {/* HR Tools */}
        <SectionHeader icon="construct" title="HR Tools" />
        <View style={s.grid}>
          {HR_TOOL_MODULES.map((m) => (
            <ModuleCard key={m.label} item={m} onPress={() => goTo(m.screen)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },

  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerIconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText:{ color: '#fff', fontSize: 16, fontWeight: '900' },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  rolePillText: { fontSize: 10, color: '#bfdbfe', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#93c5fd', marginTop: 3 },

  body: { padding: 16, paddingBottom: 48, gap: 12 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
  sectionTitle:  { fontSize: 11, color: T.accentLight, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  card: {
    width: '22%', flexGrow: 1,
    backgroundColor: T.surface,
    borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 8,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: T.border,
  },
  cardDimmed: { opacity: 0.5 },
  cardIcon:   { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardLabel:  { fontSize: 10, fontWeight: '700', color: T.textSub, textAlign: 'center', lineHeight: 14 },
  linkDot:    { width: 6, height: 6, borderRadius: 3 },
});
