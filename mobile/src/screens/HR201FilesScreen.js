import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

const T = { bg:'#f8fafc', surface:'#ffffff', surfaceAlt:'#f1f5f9', border:'#e2e8f0', accent:'#1e40af', accentLight:'#2563eb', textPrimary:'#0f172a', textSub:'#64748b', textMuted:'#94a3b8', headerBg:'#1e3a8a' };

const DOC_STATUS = {
  Active:   { color: '#16a34a', bg: '#f0fdf4' },
  Expired:  { color: '#dc2626', bg: '#fef2f2' },
  Expiring: { color: '#d97706', bg: '#fffbeb' },
};

function formatDate(v) {
  if (!v) return '-';
  const d = new Date(`${String(v).slice(0,10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month:'short', day:'2-digit', year:'numeric' });
}

export default function HR201FilesScreen({ navigation }) {
  const { user } = useAuth();
  const insets   = useSafeAreaInsets();
  const [employees, setEmployees] = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [refreshing, setRefreshing]  = useState(false);
  const [search,    setSearch]    = useState('');
  const [error,     setError]     = useState('');

  async function loadEmployees(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.employees || []);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load employees.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  async function loadDocuments(emp) {
    setSelected(emp);
    setLoadingDocs(true);
    setDocuments([]);
    try {
      const { data } = await api.get('/employee_documents', { params: { employee_id: emp.employee_id } });
      setDocuments(data.documents || []);
    } catch (_) { setDocuments([]); }
    finally { setLoadingDocs(false); }
  }

  useEffect(() => { loadEmployees(); }, []);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return !q || (e.emp_code || '').toLowerCase().includes(q) ||
      (`${e.first_name} ${e.last_name}`).toLowerCase().includes(q) ||
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
            <Text style={s.headerTitle}>201 Files</Text>
            <Text style={s.headerSub}>Employee document records</Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search employee, ID, department…" placeholderTextColor={T.textMuted} />
        </View>
      </View>

      {selected ? (
        <View style={s.flex}>
          <TouchableOpacity style={s.backBar} onPress={() => { setSelected(null); setDocuments([]); }}>
            <Ionicons name="chevron-back" size={16} color={T.accentLight} />
            <Text style={s.backBarText}>Back to employees</Text>
          </TouchableOpacity>
          <View style={s.selectedBanner}>
            <View style={s.selectedAvatar}>
              <Text style={s.selectedAvatarText}>{(selected.first_name || 'E')[0]}</Text>
            </View>
            <View>
              <Text style={s.selectedName}>{selected.first_name} {selected.last_name}</Text>
              <Text style={s.selectedMeta}>{selected.emp_code} · {selected.department || 'No dept'}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={s.docList} refreshControl={<RefreshControl refreshing={false} onRefresh={() => loadDocuments(selected)} tintColor={T.accentLight} />}>
            {loadingDocs && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
            {!loadingDocs && documents.length === 0 && (
              <View style={s.empty}>
                <Ionicons name="folder-open-outline" size={52} color={T.textMuted} />
                <Text style={s.emptyTitle}>No documents on file</Text>
              </View>
            )}
            {documents.map((doc, i) => {
              const st = DOC_STATUS[doc.status] || DOC_STATUS.Active;
              return (
                <View key={doc.id || i} style={s.docCard}>
                  <View style={s.docIcon}>
                    <Ionicons name="document-text" size={22} color={T.accentLight} />
                  </View>
                  <View style={s.docBody}>
                    <Text style={s.docName}>{doc.document_name}</Text>
                    <Text style={s.docType}>{doc.document_type}</Text>
                    {doc.expiry_date && <Text style={s.docExpiry}>Expires: {formatDate(doc.expiry_date)}</Text>}
                  </View>
                  <View style={[s.docStatus, { backgroundColor: st.bg }]}>
                    <Text style={[s.docStatusText, { color: st.color }]}>{doc.status || 'Active'}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={s.flex} contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEmployees(true)} tintColor={T.accentLight} />}>
          {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
          {error ? <Text style={s.errorText}>{error}</Text> : null}
          {filtered.map((emp, i) => (
            <TouchableOpacity key={emp.employee_id || i} style={s.empCard} onPress={() => loadDocuments(emp)}>
              <View style={s.empAvatar}>
                <Text style={s.empAvatarText}>{(emp.first_name || 'E')[0]}</Text>
              </View>
              <View style={s.empBody}>
                <Text style={s.empName}>{emp.first_name} {emp.last_name}</Text>
                <Text style={s.empMeta}>{emp.emp_code} · {emp.department || 'No dept'} · {emp.position || 'No position'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg }, flex: { flex: 1 },
  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 11, color: '#93c5fd' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  backBar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  backBarText: { fontSize: 13, color: T.accentLight, fontWeight: '700' },
  selectedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  selectedAvatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  selectedAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  selectedName: { fontSize: 15, fontWeight: '800', color: T.textPrimary },
  selectedMeta: { fontSize: 11, color: T.textSub },
  docList: { padding: 14, gap: 10, paddingBottom: 40 },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: T.border },
  docIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  docBody: { flex: 1 },
  docName: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  docType: { fontSize: 11, color: T.textSub },
  docExpiry: { fontSize: 10, color: T.textMuted, marginTop: 2 },
  docStatus: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  docStatusText: { fontSize: 10, fontWeight: '800' },
  listContent: { padding: 14, gap: 10, paddingBottom: 40 },
  empCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: T.border },
  empAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { color: T.accentLight, fontSize: 15, fontWeight: '900' },
  empBody: { flex: 1 },
  empName: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  empMeta: { fontSize: 11, color: T.textSub },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: T.textSub },
  errorText: { color: '#f87171', fontSize: 13, textAlign: 'center', padding: 16 },
});
