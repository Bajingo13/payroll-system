import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

const T = { bg:'#0f172a', surface:'#1e293b', surfaceAlt:'#273548', border:'#334155', accent:'#8b5cf6', accentLight:'#a78bfa', textPrimary:'#f1f5f9', textSub:'#94a3b8', textMuted:'#64748b', headerBg:'#1e1b4b' };

function actionColor(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('time in'))    return '#34d399';
  if (a.includes('time out'))   return '#f87171';
  if (a.includes('break'))      return '#fbbf24';
  if (a.includes('leave'))      return '#60a5fa';
  if (a.includes('overtime'))   return '#c084fc';
  if (a.includes('login'))      return '#22d3ee';
  if (a.includes('delete') || a.includes('reject')) return '#f87171';
  if (a.includes('edit') || a.includes('update'))   return '#fbbf24';
  return '#94a3b8';
}

export default function HRAuditingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadingMore,setLoadingMore]= useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search,     setSearch]     = useState('');
  const [error,      setError]      = useState('');

  async function load(pg = 1, isRefresh = false) {
    if (isRefresh) { setRefreshing(true); } else if (pg === 1) { setLoading(true); } else { setLoadingMore(true); }
    try {
      const { data } = await api.get('/audit_logs', { params: { page: pg, limit: 30 } });
      if (!data.success) throw new Error(data.message);
      setLogs(pg === 1 ? (data.logs || []) : (prev) => [...prev, ...(data.logs || [])]);
      setTotalPages(data.totalPages || 1);
      setPage(pg);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load audit logs.')); }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }

  useEffect(() => { load(1); }, []);

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    return !q || (l.admin_name || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q);
  });

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>Auditing</Text>
            <Text style={s.headerSub}>System activity logs</Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search user or action…" placeholderTextColor={T.textMuted} />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, true)} tintColor={T.accentLight} />}>
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {error ? <Text style={s.errorText}>{error}</Text> : null}

        {filtered.map((log, i) => {
          const color = actionColor(log.action);
          return (
            <View key={i} style={[s.logRow, { borderLeftColor: color }]}>
              <View style={[s.logDot, { backgroundColor: color }]} />
              <View style={s.logBody}>
                <Text style={s.logAction}>{log.action}</Text>
                <Text style={s.logUser}>{log.admin_name || 'System'}</Text>
              </View>
              <View style={s.logRight}>
                <View style={[s.statusPill, { backgroundColor: color + '18' }]}>
                  <Text style={[s.statusText, { color }]}>{log.status || 'OK'}</Text>
                </View>
                <Text style={s.logTime}>{log.log_time_display || String(log.log_time || '').slice(0, 16)}</Text>
              </View>
            </View>
          );
        })}

        {page < totalPages && !loadingMore && (
          <TouchableOpacity style={s.loadMore} onPress={() => load(page + 1)}>
            <Text style={s.loadMoreText}>Load more</Text>
          </TouchableOpacity>
        )}
        {loadingMore && <ActivityIndicator color={T.accent} style={{ marginVertical: 12 }} />}
      </ScrollView>
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
  body: { padding: 14, gap: 8, paddingBottom: 48 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.surface, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderWidth: 1, borderColor: T.border },
  logDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logBody: { flex: 1 },
  logAction: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  logUser: { fontSize: 11, color: T.textSub, marginTop: 2 },
  logRight: { alignItems: 'flex-end', gap: 4 },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '800' },
  logTime: { fontSize: 10, color: T.textMuted },
  loadMore: { alignItems: 'center', paddingVertical: 14, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  loadMoreText: { color: T.accentLight, fontWeight: '700', fontSize: 13 },
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },
});
