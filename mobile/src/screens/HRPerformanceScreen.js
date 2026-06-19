import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

const T = { bg:'#0f172a', surface:'#1e293b', surfaceAlt:'#273548', border:'#334155', accent:'#8b5cf6', accentLight:'#a78bfa', textPrimary:'#f1f5f9', textSub:'#94a3b8', textMuted:'#64748b', headerBg:'#1e1b4b' };

function ratingColor(r) {
  const n = String(r || '').toLowerCase();
  if (n.includes('outstanding') || n.includes('excellent')) return '#34d399';
  if (n.includes('good') || n.includes('satisf')) return '#60a5fa';
  if (n.includes('needs') || n.includes('poor')) return '#f87171';
  return '#fbbf24';
}

function scoreBar(score, max = 5) {
  const pct = Math.min(100, Math.max(0, (Number(score || 0) / max) * 100));
  return pct;
}

export default function HRPerformanceScreen({ navigation }) {
  const { user }  = useAuth();
  const insets    = useSafeAreaInsets();
  const [evaluations, setEvaluations] = useState([]);
  const [summary,     setSummary]     = useState({});
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [error,       setError]       = useState('');
  const [expanded,    setExpanded]    = useState(null);

  async function load(isRefresh = false) {
    if (!user?.user_id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/admin/performance-evaluations', { params: { user_id: user.user_id } });
      if (!data.success) throw new Error(data.message);
      setEvaluations(data.evaluations || []);
      setSummary(data.summary || {});
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load evaluations.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, [user?.user_id]);

  const filtered = evaluations.filter((e) => {
    const q = search.toLowerCase();
    return !q || (e.employee_name || '').toLowerCase().includes(q) ||
      (e.emp_code || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q);
  });

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.headerTitle}>Performance</Text>
            <Text style={s.headerSub}>Employee evaluation records</Text>
          </View>
        </View>

        {/* Summary pills */}
        <View style={s.summaryRow}>
          {[
            { label: 'Rated',   value: summary.employeesWithRatings || 0, color: '#8b5cf6' },
            { label: 'Avg Score', value: Number(summary.averageScore || 0).toFixed(1), color: '#22d3ee' },
            { label: 'Latest',  value: summary.latestRating || '—', color: '#34d399' },
          ].map((p) => (
            <View key={p.label} style={s.summaryPill}>
              <Text style={[s.summaryVal, { color: p.color }]}>{p.value}</Text>
              <Text style={s.summaryLabel}>{p.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search employee…" placeholderTextColor={T.textMuted} />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.accentLight} />}>
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {error ? <Text style={s.errorText}>{error}</Text> : null}
        {!loading && filtered.length === 0 && !error && (
          <View style={s.empty}>
            <Ionicons name="trending-up-outline" size={52} color={T.textMuted} />
            <Text style={s.emptyTitle}>No evaluations found</Text>
          </View>
        )}

        {filtered.map((ev, i) => {
          const rc   = ratingColor(ev.rating);
          const isEx = expanded === (ev.evaluation_id || i);
          const scores = [
            { label: 'Productivity', key: 'productivity_score' },
            { label: 'Quality',      key: 'quality_score' },
            { label: 'Teamwork',     key: 'teamwork_score' },
            { label: 'Attendance',   key: 'attendance_score' },
            { label: 'Initiative',   key: 'initiative_score' },
          ];
          return (
            <TouchableOpacity key={ev.evaluation_id || i} style={s.card} onPress={() => setExpanded(isEx ? null : (ev.evaluation_id || i))} activeOpacity={0.85}>
              <View style={s.cardTop}>
                <View style={s.empAvatar}>
                  <Text style={s.empAvatarText}>{(ev.employee_name || 'E')[0]}</Text>
                </View>
                <View style={s.empInfo}>
                  <Text style={s.empName}>{ev.employee_name}</Text>
                  <Text style={s.empMeta}>{ev.department || 'No dept'} · {ev.emp_code}</Text>
                  <Text style={s.reviewPeriod}>{ev.review_period || ''}</Text>
                </View>
                <View>
                  <View style={[s.ratingBadge, { backgroundColor: rc + '20', borderColor: rc + '44' }]}>
                    <Text style={[s.ratingText, { color: rc }]}>{Number(ev.overall_score || 0).toFixed(1)}</Text>
                  </View>
                  <Text style={[s.ratingLabel, { color: rc }]}>{ev.rating || '—'}</Text>
                </View>
              </View>

              {isEx && (
                <View style={s.detailWrap}>
                  {scores.map((sc) => (
                    <View key={sc.label} style={s.scoreRow}>
                      <Text style={s.scoreLabel}>{sc.label}</Text>
                      <View style={s.scoreBarBg}>
                        <View style={[s.scoreBarFill, { width: `${scoreBar(ev[sc.key])}%`, backgroundColor: T.accent }]} />
                      </View>
                      <Text style={s.scoreVal}>{ev[sc.key] ?? '—'}</Text>
                    </View>
                  ))}
                  {ev.goals ? (
                    <View style={s.textBlock}>
                      <Text style={s.textBlockLabel}>Goals</Text>
                      <Text style={s.textBlockVal}>{ev.goals}</Text>
                    </View>
                  ) : null}
                  {ev.action_plan ? (
                    <View style={s.textBlock}>
                      <Text style={s.textBlockLabel}>Action Plan</Text>
                      <Text style={s.textBlockVal}>{ev.action_plan}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </TouchableOpacity>
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
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: T.textPrimary },
  headerSub: { fontSize: 11, color: T.textSub },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryPill: { flex: 1, backgroundColor: T.surface, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  summaryVal: { fontSize: 18, fontWeight: '900' },
  summaryLabel: { fontSize: 9, color: T.textSub, fontWeight: '600', marginTop: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  body: { padding: 14, gap: 10, paddingBottom: 48 },
  card: { backgroundColor: T.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  empAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#2d1f52', alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { color: T.accentLight, fontSize: 15, fontWeight: '900' },
  empInfo: { flex: 1 },
  empName: { fontSize: 13, fontWeight: '800', color: T.textPrimary },
  empMeta: { fontSize: 11, color: T.textSub },
  reviewPeriod: { fontSize: 10, color: T.textMuted, marginTop: 2 },
  ratingBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, alignItems: 'center' },
  ratingText: { fontSize: 16, fontWeight: '900' },
  ratingLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  detailWrap: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.border, gap: 10 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreLabel: { fontSize: 11, color: T.textSub, width: 90 },
  scoreBarBg: { flex: 1, height: 5, backgroundColor: T.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  scoreVal: { fontSize: 11, fontWeight: '800', color: T.textPrimary, width: 28, textAlign: 'right' },
  textBlock: { backgroundColor: T.surfaceAlt, borderRadius: 10, padding: 10 },
  textBlockLabel: { fontSize: 10, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  textBlockVal: { fontSize: 12, color: T.textSub, lineHeight: 17 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: T.textSub },
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },
});
