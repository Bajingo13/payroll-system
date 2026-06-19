import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

// ── Theme ─────────────────────────────────────────────────────────────────
const T = {
  bg: '#0f172a', surface: '#1e293b', surfaceAlt: '#273548',
  border: '#334155', accent: '#8b5cf6', accentLight: '#a78bfa',
  accentBg: '#2d1f52', textPrimary: '#f1f5f9', textSub: '#94a3b8',
  textMuted: '#64748b', headerBg: '#1e1b4b',
};

const STATUS_CFG = {
  Active:      { color: '#34d399', bg: '#0d2e1e', border: '#065f46' },
  Inactive:    { color: '#94a3b8', bg: '#1e293b', border: '#334155' },
  Resigned:    { color: '#f87171', bg: '#3d1515', border: '#7f1d1d' },
  Terminated:  { color: '#f87171', bg: '#3d1515', border: '#7f1d1d' },
  Probationary:{ color: '#fbbf24', bg: '#3d2e10', border: '#78350f' },
};

function statusCfg(s) { return STATUS_CFG[s] || STATUS_CFG.Inactive; }

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────
function InfoRow({ label, value, highlight }) {
  return (
    <View style={ds.infoRow}>
      <Text style={ds.infoLabel}>{label}</Text>
      <Text style={[ds.infoValue, highlight && { color: T.accentLight }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <View style={ds.sectionCard}>
      <View style={ds.sectionHeader}>
        <Ionicons name={icon} size={14} color={T.accent} />
        <Text style={ds.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────
const DETAIL_TABS = [
  { key: 'personal',   label: 'Personal',   icon: 'person' },
  { key: 'employment', label: 'Employment', icon: 'briefcase' },
  { key: 'govids',     label: "Gov't IDs",  icon: 'card' },
  { key: 'payroll',    label: 'Payroll',    icon: 'cash' },
  { key: 'account',   label: 'Account',    icon: 'shield' },
  { key: 'evals',      label: 'Evals',      icon: 'trending-up' },
];

function EmployeeDetail({ empCode, onBack }) {
  const [emp,     setEmp]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState('personal');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await api.get(`/employee/${encodeURIComponent(empCode)}`);
        if (!data.success) throw new Error(data.message);
        setEmp(data.employee);
        setError('');
      } catch (err) { setError(getApiMessage(err, 'Failed to load employee.')); }
      finally { setLoading(false); }
    }
    load();
  }, [empCode]);

  if (loading) return <View style={ds.centered}><ActivityIndicator color={T.accent} size="large" /></View>;
  if (error)   return <View style={ds.centered}><Text style={ds.errorText}>{error}</Text></View>;
  if (!emp)    return null;

  const sc  = statusCfg(emp.status);
  const evals = emp.evaluations || [];
  const evalSummary = emp.evaluationSummary || {};
  const account     = emp.systemAccount || {};

  return (
    <View style={ds.root}>
      {/* ── Profile header ── */}
      <View style={ds.profileHeader}>
        <View style={ds.profileAvatar}>
          <Text style={ds.profileAvatarText}>{(emp.first_name || 'E')[0]}</Text>
        </View>
        <View style={ds.profileInfo}>
          <Text style={ds.profileName}>{emp.first_name} {emp.middle_name ? emp.middle_name + ' ' : ''}{emp.last_name}</Text>
          <Text style={ds.profilePosition}>{emp.position || 'No position'}</Text>
          <View style={ds.profilePills}>
            <View style={ds.profilePill}><Text style={ds.profilePillText}>{emp.emp_code}</Text></View>
            <View style={ds.profilePill}><Text style={ds.profilePillText}>{emp.department || 'No dept'}</Text></View>
          </View>
        </View>
        <View style={[ds.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
          <Text style={[ds.statusText, { color: sc.color }]}>{emp.status || 'Active'}</Text>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ds.tabScroll} contentContainerStyle={ds.tabBar}>
        {DETAIL_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[ds.tabChip, tab === t.key && ds.tabChipActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon + (tab === t.key ? '' : '-outline')} size={13} color={tab === t.key ? '#fff' : T.textSub} />
            <Text style={[ds.tabText, tab === t.key && { color: '#fff' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Tab content ── */}
      <ScrollView contentContainerStyle={ds.tabContent}>

        {/* PERSONAL */}
        {tab === 'personal' && (
          <>
            <SectionCard title="Personal Information" icon="person-outline">
              <InfoRow label="First Name"    value={emp.first_name} />
              <InfoRow label="Middle Name"   value={emp.middle_name} />
              <InfoRow label="Last Name"     value={emp.last_name} />
              <InfoRow label="Nickname"      value={emp.nickname} />
              <InfoRow label="Gender"        value={emp.gender} />
              <InfoRow label="Civil Status"  value={emp.civil_status} />
              <InfoRow label="Birth Date"    value={fmtDate(emp.birth_date)} />
            </SectionCard>
            <SectionCard title="Contact" icon="call-outline">
              <InfoRow label="Mobile"  value={emp.mobile_no} highlight />
              <InfoRow label="Tel"     value={emp.tel_no} />
              <InfoRow label="Email"   value={emp.email} highlight />
              <InfoRow label="Fax"     value={emp.fax_no} />
              <InfoRow label="Website" value={emp.website} />
            </SectionCard>
            <SectionCard title="Address" icon="home-outline">
              <InfoRow label="Street"  value={emp.street} />
              <InfoRow label="City"    value={emp.city} />
              <InfoRow label="Country" value={emp.country} />
              <InfoRow label="Zip"     value={emp.zip_code} />
            </SectionCard>
          </>
        )}

        {/* EMPLOYMENT */}
        {tab === 'employment' && (
          <>
            <SectionCard title="Employment Details" icon="briefcase-outline">
              <InfoRow label="Company"       value={emp.company} />
              <InfoRow label="Branch"        value={emp.branch} />
              <InfoRow label="Division"      value={emp.division} />
              <InfoRow label="Department"    value={emp.department} highlight />
              <InfoRow label="Position"      value={emp.position} highlight />
              <InfoRow label="Employee Type" value={emp.employee_type} />
              <InfoRow label="Class"         value={emp.class} />
              <InfoRow label="Location"      value={emp.location} />
              <InfoRow label="Machine ID"    value={emp.machine_id} />
              <InfoRow label="Projects"      value={emp.projects} />
            </SectionCard>
            <SectionCard title="Key Dates" icon="calendar-outline">
              <InfoRow label="Date Hired"     value={fmtDate(emp.date_hired)} highlight />
              <InfoRow label="Date Regular"   value={fmtDate(emp.date_regular)} />
              <InfoRow label="Training Date"  value={fmtDate(emp.training_date)} />
              <InfoRow label="Date Resigned"  value={fmtDate(emp.date_resigned)} />
              <InfoRow label="Date Terminated"value={fmtDate(emp.date_terminated)} />
              <InfoRow label="End of Contract"value={fmtDate(emp.end_of_contract)} />
              <InfoRow label="Rehired Date"   value={fmtDate(emp.rehired_date)} />
              <InfoRow label="Rehired"        value={emp.rehired ? 'Yes' : 'No'} />
            </SectionCard>
          </>
        )}

        {/* GOV'T IDs */}
        {tab === 'govids' && (
          <>
            <SectionCard title="Government IDs" icon="card-outline">
              <InfoRow label="SSS No."          value={emp.sss_no} highlight />
              <InfoRow label="GSIS No."          value={emp.gsis_no} highlight />
              <InfoRow label="Pag-IBIG No."      value={emp.pagibig_no} highlight />
              <InfoRow label="PhilHealth No."    value={emp.philhealth_no} highlight />
              <InfoRow label="TIN"               value={emp.tin_no} highlight />
            </SectionCard>
            <SectionCard title="Banking" icon="wallet-outline">
              <InfoRow label="Bank Name"   value={emp.bank_name} />
              <InfoRow label="Bank Branch" value={emp.bank_branch} />
              <InfoRow label="ATM No."     value={emp.atm_no} highlight />
              <InfoRow label="Branch Code" value={emp.branch_code} />
            </SectionCard>
          </>
        )}

        {/* PAYROLL */}
        {tab === 'payroll' && (
          <>
            <SectionCard title="Payroll Computation" icon="calculator-outline">
              <InfoRow label="Payroll Period"    value={emp.payrollComputation?.payroll_period} />
              <InfoRow label="Payroll Rate"      value={emp.payrollComputation?.payroll_rate} />
              <InfoRow label="OT Rate"           value={emp.payrollComputation?.ot_rate} />
              <InfoRow label="Hours / Day"       value={emp.payrollComputation?.hours_in_day} />
              <InfoRow label="Days / Week"       value={emp.payrollComputation?.days_in_week} />
              <InfoRow label="Days / Year"       value={emp.payrollComputation?.days_in_year} />
              <InfoRow label="Weeks / Year"      value={emp.payrollComputation?.week_in_year} />
              <InfoRow label="Main Computation"  value={emp.payrollComputation?.main_computation} />
              <InfoRow label="Basis Absences"    value={emp.payrollComputation?.basis_absences} />
              <InfoRow label="Basis OT"          value={emp.payrollComputation?.basis_overtime} />
              <InfoRow label="Strict No OT"      value={emp.payrollComputation?.strict_no_overtime ? 'Yes' : 'No'} />
            </SectionCard>
            <SectionCard title="Tax &amp; Insurance" icon="shield-outline">
              <InfoRow label="Tax Status"     value={emp.taxInsurance?.tax_status} />
              <InfoRow label="Tax Exemption"  value={emp.taxInsurance?.tax_exemption} />
              <InfoRow label="Insurance"      value={emp.taxInsurance?.insurance} />
            </SectionCard>
            <SectionCard title="Allowances" icon="add-circle-outline">
              {(emp.allowances || []).length === 0
                ? <Text style={ds.emptyText}>No allowances configured.</Text>
                : (emp.allowances || []).map((a, i) => (
                    <InfoRow key={i} label={a.name || `Allowance ${i + 1}`} value={a.amount ? `₱${Number(a.amount).toLocaleString()}` : '—'} />
                  ))
              }
            </SectionCard>
            <SectionCard title="Deductions" icon="remove-circle-outline">
              {(emp.deductions || []).length === 0
                ? <Text style={ds.emptyText}>No deductions configured.</Text>
                : (emp.deductions || []).map((d, i) => (
                    <InfoRow key={i} label={d.name || `Deduction ${i + 1}`} value={d.amount ? `₱${Number(d.amount).toLocaleString()}` : '—'} />
                  ))
              }
            </SectionCard>
          </>
        )}

        {/* SYSTEM ACCOUNT */}
        {tab === 'account' && (
          <SectionCard title="System Account" icon="shield-checkmark-outline">
            <InfoRow label="Username"  value={account.username} highlight />
            <InfoRow label="Role"      value={account.role} highlight />
            <InfoRow label="Status"    value={account.account_status} />
            <InfoRow label="User ID"   value={account.user_id ? String(account.user_id) : null} />
          </SectionCard>
        )}

        {/* EVALUATIONS */}
        {tab === 'evals' && (
          <>
            {evalSummary.count > 0 && (
              <View style={ds.evalSummaryRow}>
                {[
                  { label: 'Evaluations',  value: evalSummary.count },
                  { label: 'Avg Score',    value: Number(evalSummary.averageScore || 0).toFixed(1) },
                  { label: 'Latest',       value: evalSummary.latestRating || '—' },
                ].map((p) => (
                  <View key={p.label} style={ds.evalSummaryPill}>
                    <Text style={ds.evalSummaryVal}>{p.value}</Text>
                    <Text style={ds.evalSummaryLabel}>{p.label}</Text>
                  </View>
                ))}
              </View>
            )}
            {evals.length === 0
              ? <Text style={[ds.emptyText, { padding: 20 }]}>No evaluations on record.</Text>
              : evals.map((ev, i) => (
                  <View key={i} style={ds.evalCard}>
                    <View style={ds.evalCardTop}>
                      <View>
                        <Text style={ds.evalPeriod}>{ev.review_period || 'Evaluation'}</Text>
                        <Text style={ds.evalMeta}>{fmtDate(ev.review_date)} · by {ev.evaluator_name || '—'}</Text>
                      </View>
                      <View style={ds.evalScoreBadge}>
                        <Text style={ds.evalScore}>{Number(ev.overall_score || 0).toFixed(1)}</Text>
                        <Text style={ds.evalRating}>{ev.rating || '—'}</Text>
                      </View>
                    </View>
                    {[
                      { label: 'Productivity', key: 'productivity_score' },
                      { label: 'Quality',      key: 'quality_score' },
                      { label: 'Teamwork',     key: 'teamwork_score' },
                      { label: 'Attendance',   key: 'attendance_score' },
                      { label: 'Initiative',   key: 'initiative_score' },
                    ].map((sc) => (
                      <View key={sc.label} style={ds.scoreRow}>
                        <Text style={ds.scoreLabel}>{sc.label}</Text>
                        <View style={ds.scoreBarBg}>
                          <View style={[ds.scoreBarFill, { width: `${Math.min(100, Number(ev[sc.key] || 0))}%` }]} />
                        </View>
                        <Text style={ds.scoreVal}>{ev[sc.key] ?? '—'}</Text>
                      </View>
                    ))}
                  </View>
                ))
            }
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── List view ─────────────────────────────────────────────────────────────
export default function HREmployeeFileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [search,     setSearch]     = useState('');
  const [sortBy,     setSortBy]     = useState('Name');
  const [error,      setError]      = useState('');
  const [selected,   setSelected]   = useState(null); // emp_code of open detail

  const SORT_OPTIONS = ['ID', 'Name', 'Department', 'Position', 'Status'];

  const load = useCallback(async (pg = 1, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employee_list', {
        params: { page: pg, limit: 20, sortBy },
      });
      if (!data.success) throw new Error(data.message);
      setEmployees(pg === 1 ? (data.employees || []) : (prev) => [...prev, ...(data.employees || [])]);
      setTotalPages(data.totalPages || 1);
      setTotal(data.totalEmployees || 0);
      setPage(pg);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load employees.')); }
    finally { setLoading(false); setRefreshing(false); }
  }, [sortBy]);

  useEffect(() => { setPage(1); load(1); }, [sortBy]);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return !q ||
      (`${e.first_name || ''} ${e.last_name || ''}`).toLowerCase().includes(q) ||
      (e.emp_code || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.position || '').toLowerCase().includes(q);
  });

  // ── Render detail overlay ──
  if (selected) {
    return (
      <View style={s.root}>
        <View style={[s.detailHeader, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => setSelected(null)}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <Text style={s.detailHeaderTitle}>Employee File</Text>
        </View>
        <EmployeeDetail empCode={selected} onBack={() => setSelected(null)} />
      </View>
    );
  }

  // ── Render list ──
  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.headerTitle}>Employee File</Text>
            <Text style={s.headerSub}>{total} employees on record</Text>
          </View>
        </View>

        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={T.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, ID, department…"
            placeholderTextColor={T.textMuted}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color={T.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Sort options */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortRow}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[s.sortChip, sortBy === opt && s.sortChipActive]}
              onPress={() => setSortBy(opt)}
            >
              <Text style={[s.sortText, sortBy === opt && { color: '#fff' }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, true)} tintColor={T.accentLight} />}
      >
        {loading && page === 1 && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {error ? <Text style={s.errorText}>{error}</Text> : null}
        {!loading && filtered.length === 0 && !error && (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={52} color={T.textMuted} />
            <Text style={s.emptyTitle}>No employees found</Text>
          </View>
        )}

        {filtered.map((emp, i) => {
          const sc = statusCfg(emp.status);
          return (
            <TouchableOpacity
              key={emp.emp_code || i}
              style={s.empCard}
              onPress={() => setSelected(emp.emp_code)}
              activeOpacity={0.75}
            >
              <View style={[s.empAvatar, { backgroundColor: sc.color + '20' }]}>
                <Text style={[s.empAvatarText, { color: sc.color }]}>
                  {(emp.first_name || emp.full_name || 'E')[0].toUpperCase()}
                </Text>
              </View>

              <View style={s.empBody}>
                <Text style={s.empName}>{emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim()}</Text>
                <View style={s.empMeta}>
                  <View style={s.empMetaPill}>
                    <Ionicons name="card-outline" size={10} color={T.textMuted} />
                    <Text style={s.empMetaText}>{emp.emp_code || '—'}</Text>
                  </View>
                  {emp.department ? (
                    <View style={s.empMetaPill}>
                      <Ionicons name="business-outline" size={10} color={T.textMuted} />
                      <Text style={s.empMetaText}>{emp.department}</Text>
                    </View>
                  ) : null}
                  {emp.position ? (
                    <View style={s.empMetaPill}>
                      <Ionicons name="briefcase-outline" size={10} color={T.textMuted} />
                      <Text style={s.empMetaText}>{emp.position}</Text>
                    </View>
                  ) : null}
                </View>
                {emp.email ? <Text style={s.empEmail}>{emp.email}</Text> : null}
              </View>

              <View style={s.empRight}>
                <View style={[s.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                  <Text style={[s.statusText, { color: sc.color }]}>{emp.status || 'Active'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={T.textMuted} style={{ marginTop: 6 }} />
              </View>
            </TouchableOpacity>
          );
        })}

        {page < totalPages && !loading && (
          <TouchableOpacity style={s.loadMore} onPress={() => load(page + 1)}>
            <Text style={s.loadMoreText}>Load more employees</Text>
          </TouchableOpacity>
        )}
        {loading && page > 1 && <ActivityIndicator color={T.accent} style={{ marginVertical: 12 }} />}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: T.textPrimary },
  headerSub: { fontSize: 11, color: T.textSub },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  sortRow: { flexDirection: 'row', gap: 6 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  sortChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  sortText: { fontSize: 12, color: T.textSub, fontWeight: '700' },
  listContent: { padding: 14, gap: 10, paddingBottom: 48 },
  empCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: T.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.border },
  empAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  empAvatarText: { fontSize: 17, fontWeight: '900' },
  empBody: { flex: 1, gap: 4 },
  empName: { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  empMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  empMetaPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: T.surfaceAlt, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  empMetaText: { fontSize: 10, color: T.textSub, fontWeight: '600' },
  empEmail: { fontSize: 11, color: T.textMuted },
  empRight: { alignItems: 'flex-end' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800' },
  loadMore: { alignItems: 'center', paddingVertical: 14, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  loadMoreText: { color: T.accentLight, fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 56, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.textSub },
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 14 },
  detailHeaderTitle: { fontSize: 18, fontWeight: '800', color: T.textPrimary },
});

// Detail styles
const ds = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#f87171', fontSize: 13 },
  emptyText: { fontSize: 12, color: T.textMuted, fontStyle: 'italic' },

  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: T.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: T.border },
  profileAvatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  profileAvatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 15, fontWeight: '900', color: T.textPrimary },
  profilePosition: { fontSize: 11, color: T.textSub, marginTop: 2 },
  profilePills: { flexDirection: 'row', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  profilePill: { backgroundColor: T.accentBg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  profilePillText: { fontSize: 10, color: T.accentLight, fontWeight: '700' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800' },

  tabScroll: { backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tabChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border },
  tabChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  tabText: { fontSize: 12, color: T.textSub, fontWeight: '700' },

  tabContent: { padding: 14, gap: 12, paddingBottom: 48 },

  sectionCard: { backgroundColor: T.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  sectionTitle: { fontSize: 12, color: T.accentLight, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  infoLabel: { fontSize: 12, color: T.textSub, flex: 1 },
  infoValue: { fontSize: 12, fontWeight: '700', color: T.textPrimary, flex: 1.2, textAlign: 'right' },

  evalSummaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  evalSummaryPill: { flex: 1, backgroundColor: T.surface, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  evalSummaryVal: { fontSize: 18, fontWeight: '900', color: T.accentLight },
  evalSummaryLabel: { fontSize: 9, color: T.textSub, fontWeight: '600', marginTop: 1 },

  evalCard: { backgroundColor: T.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.border, gap: 10 },
  evalCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  evalPeriod: { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  evalMeta: { fontSize: 11, color: T.textSub, marginTop: 2 },
  evalScoreBadge: { backgroundColor: T.accentBg, borderRadius: 12, padding: 10, alignItems: 'center' },
  evalScore: { fontSize: 18, fontWeight: '900', color: T.accentLight },
  evalRating: { fontSize: 9, color: T.textSub, fontWeight: '700' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreLabel: { fontSize: 11, color: T.textSub, width: 90 },
  scoreBarBg: { flex: 1, height: 5, backgroundColor: T.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3, backgroundColor: T.accent },
  scoreVal: { fontSize: 11, fontWeight: '800', color: T.textPrimary, width: 30, textAlign: 'right' },
});
