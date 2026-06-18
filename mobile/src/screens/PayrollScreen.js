import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HeaderActions from '../components/HeaderActions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';
import PayslipModal from '../components/PayslipModal';

function money(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function StatusPill({ status }) {
  const n = String(status || '').toLowerCase();
  const color = n === 'paid' || n === 'released' ? '#15803d' : n === 'pending' ? '#d97706' : '#1e40af';
  const bg = n === 'paid' || n === 'released' ? '#dcfce7' : n === 'pending' ? '#fef3c7' : '#dbeafe';
  return (
    <View style={{ backgroundColor: bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{status || 'N/A'}</Text>
    </View>
  );
}

export default function PayrollScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payslipId, setPayslipId] = useState(null);
  const [error, setError] = useState('');

  async function load(showRefresh = false) {
    if (!user?.user_id) return;
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employee_dashboard', { params: { user_id: user.user_id } });
      if (!data.success) throw new Error(data.message);
      setSummary(data.payrollSummary || null);
      setHistory(data.payrollHistory || []);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load payroll data.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, [user?.user_id]);

  const totals = useMemo(() =>
    history.reduce((acc, row) => {
      acc.gross += Number(row.gross_pay || 0);
      acc.deductions += Number(row.total_deductions || 0);
      acc.net += Number(row.net_pay || 0);
      return acc;
    }, { gross: 0, deductions: 0, net: 0 }),
    [history]
  );

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  return (
    <>
    <PayslipModal visible={payslipId !== null} payrollId={payslipId} onClose={() => setPayslipId(null)} />
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1e40af" />}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <View>
            <Text style={s.headerTitle}>Payroll</Text>
            <Text style={s.headerSub}>Your earnings summary</Text>
          </View>
          <HeaderActions navigation={navigation} />
        </View>

        {/* Net pay hero */}
        <View style={s.heroWrap}>
          <Text style={s.heroLabel}>Latest Net Pay</Text>
          <Text style={s.heroAmount}>{money(summary?.net_pay)}</Text>
          <Text style={s.heroPeriod}>{summary?.payroll_range || 'No payroll data yet'}</Text>
          <View style={s.heroRow}>
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>Gross</Text>
              <Text style={s.heroStatValue}>{money(summary?.gross_pay)}</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>Deductions</Text>
              <Text style={[s.heroStatValue, { color: '#fca5a5' }]}>{money(summary?.total_deductions)}</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatLabel}>Status</Text>
              <Text style={[s.heroStatValue, { color: '#86efac' }]}>{summary?.payroll_status || '—'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={s.body}>
        {error ? (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Totals */}
        {history.length > 0 && (
          <>
            <Text style={s.sectionTitle}>
              Payroll History
              <Text style={s.sectionCount}>  {history.length} records</Text>
            </Text>
            <View style={s.totalsRow}>
              {[
                { label: 'Total Gross', value: money(totals.gross), color: '#0f172a' },
                { label: 'Total Deducted', value: money(totals.deductions), color: '#b91c1c' },
                { label: 'Total Net', value: money(totals.net), color: '#15803d' },
              ].map((item) => (
                <View key={item.label} style={s.totalCard}>
                  <Text style={s.totalLabel}>{item.label}</Text>
                  <Text style={[s.totalValue, { color: item.color }]}>{item.value}</Text>
                </View>
              ))}
            </View>

            {history.map((row, i) => (
              <View key={row.payroll_id || i} style={s.historyCard}>
                <View style={s.historyHeader}>
                  <View style={s.historyLeft}>
                    <Text style={s.historyRange} numberOfLines={1}>{row.payroll_range || '-'}</Text>
                    <Text style={s.historyDate}>{formatDate(row.date_generated)}</Text>
                  </View>
                  <StatusPill status={row.payroll_status} />
                </View>
                <View style={s.historyDivider} />
                <View style={s.historyGrid}>
                  <View style={s.historyItem}>
                    <Text style={s.historyItemLabel}>Gross Pay</Text>
                    <Text style={s.historyItemValue}>{money(row.gross_pay)}</Text>
                  </View>
                  <View style={s.historyItem}>
                    <Text style={s.historyItemLabel}>Deductions</Text>
                    <Text style={[s.historyItemValue, { color: '#b91c1c' }]}>{money(row.total_deductions)}</Text>
                  </View>
                  <View style={[s.historyItem, { width: '100%', borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 4, paddingTop: 8 }]}>
                    <Text style={s.historyItemLabel}>Net Pay</Text>
                    <Text style={[s.historyItemValue, { color: '#15803d', fontSize: 16, fontWeight: '800' }]}>{money(row.net_pay)}</Text>
                  </View>
                </View>
                {row.payroll_id && Number(row.gross_pay) > 0 && (
                  <TouchableOpacity style={s.payslipBtn} onPress={() => setPayslipId(row.payroll_id)}>
                    <Ionicons name="document-text-outline" size={14} color="#1e40af" />
                    <Text style={s.payslipBtnText}>View Payslip</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        {history.length === 0 && !loading && (
          <View style={s.empty}>
            <Ionicons name="wallet-outline" size={52} color="#cbd5e1" />
            <Text style={s.emptyText}>No payroll history</Text>
            <Text style={s.emptySub}>Your payroll records will appear here</Text>
          </View>
        )}
      </View>
    </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingBottom: 48 },
  header: { backgroundColor: '#1e3a8a', paddingHorizontal: 20, paddingBottom: 24 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#93c5fd', marginTop: 2, marginBottom: 20 },
  heroWrap: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  heroLabel: { fontSize: 11, color: '#93c5fd', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  heroAmount: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  heroPeriod: { fontSize: 12, color: '#93c5fd', marginTop: 2, marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatLabel: { fontSize: 10, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  heroStatValue: { fontSize: 13, fontWeight: '700', color: '#fff' },
  heroStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  body: { padding: 16, gap: 14 },
  errorWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', padding: 12 },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  sectionCount: { fontSize: 14, fontWeight: '500', color: '#94a3b8' },
  totalsRow: { flexDirection: 'row', gap: 8 },
  totalCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, gap: 4 },
  totalLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  totalValue: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  historyCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  historyLeft: { flex: 1, marginRight: 10 },
  historyRange: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  historyDate: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  historyDivider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 12 },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyItem: { flex: 1, minWidth: '45%' },
  historyItemLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700', marginBottom: 3 },
  historyItemValue: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  empty: { alignItems: 'center', paddingVertical: 56, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94a3b8' },
  payslipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe',
  },
  payslipBtnText: { color: '#1e40af', fontSize: 13, fontWeight: '700' },
});
