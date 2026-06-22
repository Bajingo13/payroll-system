import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

const T = { bg:'#f8fafc', surface:'#ffffff', surfaceAlt:'#f1f5f9', border:'#e2e8f0', accent:'#1e40af', accentLight:'#2563eb', textPrimary:'#0f172a', textSub:'#64748b', textMuted:'#94a3b8', headerBg:'#1e3a8a' };

function Section({ title, icon, children }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Ionicons name={icon} size={14} color={T.accent} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

export default function HRUtilitiesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [settings,   setSettings]   = useState(null);
  const [taxBrackets,setTaxBrackets]= useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  const [tab,        setTab]        = useState('company');

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [settRes, taxRes] = await Promise.all([
        api.get('/company_settings'),
        api.get('/tax_brackets'),
      ]);
      setSettings(settRes.data?.data || settRes.data || {});
      setTaxBrackets(taxRes.data?.data || []);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load utilities.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const st = settings || {};
  const TABS = [
    { key: 'company', label: 'Company',  icon: 'business' },
    { key: 'policy',  label: 'Policies', icon: 'document-text' },
    { key: 'tax',     label: 'Tax',      icon: 'calculator' },
  ];

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>Utilities</Text>
            <Text style={s.headerSub}>Company settings &amp; configuration</Text>
          </View>
        </View>
        <View style={s.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} style={[s.tabChip, tab === t.key && s.tabChipActive]} onPress={() => setTab(t.key)}>
              <Ionicons name={t.icon + (tab === t.key ? '' : '-outline')} size={14} color={tab === t.key ? '#fff' : T.textSub} />
              <Text style={[s.tabText, tab === t.key && { color: '#fff' }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.accentLight} />}>
        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {error ? <Text style={s.errorText}>{error}</Text> : null}

        {tab === 'company' && settings && (
          <>
            <Section title="Company Information" icon="business">
              <InfoRow label="Company Name" value={st.company_name} />
              <InfoRow label="Address"      value={st.address} />
              <InfoRow label="TIN"          value={st.tin} />
              <InfoRow label="Email"        value={st.email} />
              <InfoRow label="Phone"        value={st.phone} />
              <InfoRow label="Website"      value={st.website} />
              <InfoRow label="Industry"     value={st.industry} />
              <InfoRow label="Reg. No."     value={st.registration_no} />
              <InfoRow label="Founded"      value={st.founded_year} />
            </Section>
          </>
        )}

        {tab === 'policy' && settings && (
          <>
            <Section title="HR Policy" icon="document-text">
              <Text style={s.policyText}>{st.hr_policy || 'No HR policy configured.'}</Text>
            </Section>
            <Section title="Leave Policy" icon="leaf">
              <Text style={s.policyText}>{st.leave_policy || 'No leave policy configured.'}</Text>
            </Section>
            <Section title="Overtime Policy" icon="time">
              <Text style={s.policyText}>{st.overtime_policy || 'No overtime policy configured.'}</Text>
            </Section>
            <Section title="Code of Conduct" icon="shield-checkmark">
              <Text style={s.policyText}>{st.code_of_conduct || 'No code of conduct configured.'}</Text>
            </Section>
            <Section title="Data Privacy Policy" icon="lock-closed">
              <Text style={s.policyText}>{st.data_privacy_policy || 'No data privacy policy configured.'}</Text>
            </Section>
          </>
        )}

        {tab === 'tax' && (
          <Section title="Tax Brackets" icon="calculator">
            {taxBrackets.length === 0 && !loading && <Text style={s.emptyText}>No tax brackets configured.</Text>}
            {taxBrackets.map((br, i) => (
              <View key={br.id || i} style={s.taxRow}>
                <View style={s.taxRange}>
                  <Text style={s.taxRangeText}>
                    ₱{Number(br.income_from || 0).toLocaleString()} – {br.income_to ? `₱${Number(br.income_to).toLocaleString()}` : '∞'}
                  </Text>
                </View>
                <View style={s.taxDetail}>
                  <Text style={s.taxBase}>Base: ₱{Number(br.base_tax || 0).toLocaleString()}</Text>
                  <Text style={[s.taxRate, { color: T.accent }]}>{(Number(br.tax_rate || 0) * 100).toFixed(0)}%</Text>
                </View>
              </View>
            ))}
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 11, color: '#93c5fd' },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  tabChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  tabText: { fontSize: 12, color: T.textSub, fontWeight: '700' },
  body: { padding: 14, gap: 14, paddingBottom: 48 },
  section: { backgroundColor: T.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  sectionTitle: { fontSize: 12, color: T.accentLight, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  infoLabel: { fontSize: 12, color: T.textSub, flex: 1 },
  infoValue: { fontSize: 12, fontWeight: '700', color: T.textPrimary, flex: 1, textAlign: 'right' },
  policyText: { fontSize: 13, color: T.textSub, lineHeight: 20, padding: 14 },
  taxRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border, gap: 12 },
  taxRange: { flex: 1 },
  taxRangeText: { fontSize: 12, color: T.textPrimary, fontWeight: '700' },
  taxDetail: { alignItems: 'flex-end', gap: 2 },
  taxBase: { fontSize: 11, color: T.textSub },
  taxRate: { fontSize: 14, fontWeight: '900' },
  emptyText: { fontSize: 13, color: T.textMuted, padding: 14 },
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },
});
