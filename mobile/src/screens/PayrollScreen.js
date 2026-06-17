import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

function money(value) {
  return `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

export default function PayrollScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load(showRefresh = false) {
    if (!user?.user_id) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await api.get('/employee_dashboard', {
        params: { user_id: user.user_id },
      });
      if (!data.success) throw new Error(data.message);
      setSummary(data.payrollSummary || null);
      setHistory(data.payrollHistory || []);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load payroll data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [user?.user_id]);

  const totals = useMemo(
    () =>
      history.reduce(
        (acc, row) => {
          acc.gross += Number(row.gross_pay || 0);
          acc.deductions += Number(row.total_deductions || 0);
          acc.net += Number(row.net_pay || 0);
          return acc;
        },
        { gross: 0, deductions: 0, net: 0 }
      ),
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
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor="#1e40af"
        />
      }
    >
      <Text style={s.title}>Payroll</Text>
      <Text style={s.sub}>Your payroll summary and history</Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {/* Latest Payroll Hero Card */}
      <View style={s.heroCard}>
        <View style={s.heroCardHeader}>
          <Text style={s.heroCardLabel}>Latest Payroll</Text>
          <View style={s.statusPill}>
            <Text style={s.statusPillText}>{summary?.payroll_status || 'N/A'}</Text>
          </View>
        </View>
        <Text style={s.heroPeriod}>{summary?.payroll_range || 'No payroll data available'}</Text>
        <Text style={s.heroGenerated}>Generated: {formatDate(summary?.date_generated)}</Text>

        <View style={s.heroDivider} />

        <View style={s.heroRow}>
          <Text style={s.heroLabel}>Gross Pay</Text>
          <Text style={s.heroValue}>{money(summary?.gross_pay)}</Text>
        </View>
        <View style={s.heroRow}>
          <Text style={s.heroLabel}>Total Deductions</Text>
          <Text style={[s.heroValue, { color: '#fca5a5' }]}>{money(summary?.total_deductions)}</Text>
        </View>

        <View style={s.heroDivider} />

        <View style={s.heroRow}>
          <Text style={[s.heroLabel, { fontWeight: '700', fontSize: 16 }]}>Net Pay</Text>
          <Text style={[s.heroValue, { fontSize: 26, fontWeight: '800', color: '#86efac' }]}>
            {money(summary?.net_pay)}
          </Text>
        </View>
      </View>

      {/* Totals summary */}
      {history.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Payroll History ({history.length} records)</Text>

          <View style={s.totalsRow}>
            <View style={s.totalCard}>
              <Text style={s.totalLabel}>Total Gross</Text>
              <Text style={s.totalValue}>{money(totals.gross)}</Text>
            </View>
            <View style={s.totalCard}>
              <Text style={s.totalLabel}>Total Net</Text>
              <Text style={[s.totalValue, { color: '#15803d' }]}>{money(totals.net)}</Text>
            </View>
          </View>

          {history.map((row, i) => (
            <View key={row.payroll_id || i} style={s.historyCard}>
              <View style={s.historyHeader}>
                <Text style={s.historyRange} numberOfLines={1}>{row.payroll_range || '-'}</Text>
                <Text style={s.historyDate}>{formatDate(row.date_generated)}</Text>
              </View>
              <View style={s.historyGrid}>
                <View style={s.historyItem}>
                  <Text style={s.historyLabel}>Gross Pay</Text>
                  <Text style={s.historyValue}>{money(row.gross_pay)}</Text>
                </View>
                <View style={s.historyItem}>
                  <Text style={s.historyLabel}>Deductions</Text>
                  <Text style={[s.historyValue, { color: '#b91c1c' }]}>{money(row.total_deductions)}</Text>
                </View>
                <View style={[s.historyItem, { marginTop: 6 }]}>
                  <Text style={s.historyLabel}>Net Pay</Text>
                  <Text style={[s.historyValue, { color: '#15803d', fontSize: 15 }]}>{money(row.net_pay)}</Text>
                </View>
                {row.payroll_status && (
                  <View style={[s.historyItem, { marginTop: 6 }]}>
                    <Text style={s.historyLabel}>Status</Text>
                    <Text style={[s.historyValue, { color: '#1e40af' }]}>{row.payroll_status}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </>
      )}

      {history.length === 0 && !loading && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>💰</Text>
          <Text style={s.emptyText}>No payroll history found.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  error: { color: '#b91c1c', marginBottom: 12 },
  heroCard: {
    backgroundColor: '#1e40af',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    elevation: 6,
    shadowColor: '#1e40af',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  heroCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroCardLabel: { fontSize: 13, color: '#bfdbfe', fontWeight: '600' },
  statusPill: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusPillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  heroPeriod: { fontSize: 13, color: '#93c5fd', marginBottom: 2 },
  heroGenerated: { fontSize: 11, color: '#60a5fa', marginBottom: 14 },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 12 },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heroLabel: { fontSize: 14, color: '#bfdbfe' },
  heroValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  totalsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  totalCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    elevation: 2,
  },
  totalLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  totalValue: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginTop: 4 },
  historyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2 },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyRange: { fontSize: 13, fontWeight: '700', color: '#1e293b', flex: 1, marginRight: 8 },
  historyDate: { fontSize: 11, color: '#94a3b8' },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyItem: { flex: 1, minWidth: '45%' },
  historyLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  historyValue: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#475569', fontWeight: '600' },
});
