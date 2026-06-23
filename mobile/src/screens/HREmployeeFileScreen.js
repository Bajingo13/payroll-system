import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

// ── Theme ─────────────────────────────────────────────────────────────────
const T = {
  bg: '#f8fafc', surface: '#ffffff', surfaceAlt: '#f1f5f9',
  border: '#e2e8f0', accent: '#1e40af', accentLight: '#2563eb',
  accentBg: '#dbeafe', textPrimary: '#0f172a', textSub: '#64748b',
  textMuted: '#94a3b8', headerBg: '#1e3a8a',
};

const STATUS_CFG = {
  Active:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  Inactive:    { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  Resigned:    { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  Terminated:  { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  Probationary:{ color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
};

function statusCfg(s) { return STATUS_CFG[s] || STATUS_CFG.Inactive; }

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────
function InfoRow({ label, value, highlight, editing, onChange, multiline, required }) {
  return (
    <View style={[ds.infoRow, editing && ds.infoRowEdit]}>
      <Text style={ds.infoLabel}>
        {label}{required && editing ? <Text style={ds.requiredStar}> *</Text> : null}
      </Text>
      {editing ? (
        <TextInput
          style={[ds.infoInput, highlight && { color: T.accentLight }, multiline && { height: 64 }, required && !value?.trim() && ds.infoInputError]}
          value={value ?? ''}
          onChangeText={onChange}
          placeholderTextColor={T.textMuted}
          placeholder={`Enter ${label.toLowerCase()}${required ? ' (required)' : ''}`}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
      ) : (
        <Text style={[ds.infoValue, highlight && { color: T.accentLight }]} numberOfLines={3}>
          {value || '—'}
        </Text>
      )}
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
  { key: 'personal',   label: 'Personal',   icon: 'person',        color: '#2563eb', bg: '#dbeafe' },
  { key: 'employment', label: 'Employment', icon: 'briefcase',     color: '#22d3ee', bg: '#0d2e38' },
  { key: 'govids',     label: "Gov't IDs", icon: 'card',          color: '#16a34a', bg: '#f0fdf4' },
  { key: 'payroll',    label: 'Payroll',    icon: 'cash',          color: '#d97706', bg: '#fffbeb' },
  { key: 'account',    label: 'Account',    icon: 'shield',        color: '#dc2626', bg: '#fef2f2' },
  { key: 'evals',      label: 'Evals',      icon: 'trending-up',   color: '#fb923c', bg: '#3d2010' },
];

function initForm(emp) {
  return {
    first_name: emp.first_name || '', last_name: emp.last_name || '',
    middle_name: emp.middle_name || '', nickname: emp.nickname || '',
    gender: emp.gender || '', civil_status: emp.civil_status || '',
    birth_date: String(emp.birth_date || '').slice(0, 10),
    mobile_no: emp.mobile_no || '', tel_no: emp.tel_no || '',
    email: emp.email || '', fax_no: emp.fax_no || '', website: emp.website || '',
    street: emp.street || '', city: emp.city || '',
    country: emp.country || '', zip_code: emp.zip_code || '',
    company: emp.company || '', branch: emp.branch || '',
    division: emp.division || '', department: emp.department || '',
    position: emp.position || '', employee_type: emp.employee_type || '',
    class: emp.class || '', location: emp.location || '',
    machine_id: emp.machine_id || '', projects: emp.projects || '',
    date_hired: String(emp.date_hired || '').slice(0, 10),
    date_regular: String(emp.date_regular || '').slice(0, 10),
    date_resigned: String(emp.date_resigned || '').slice(0, 10),
    date_terminated: String(emp.date_terminated || '').slice(0, 10),
    end_of_contract: String(emp.end_of_contract || '').slice(0, 10),
    sss_no: emp.sss_no || '', gsis_no: emp.gsis_no || '',
    pagibig_no: emp.pagibig_no || '', philhealth_no: emp.philhealth_no || '',
    tin_no: emp.tin_no || '', bank_name: emp.bank_name || '',
    bank_branch: emp.bank_branch || '', atm_no: emp.atm_no || '',
    branch_code: emp.branch_code || '',
    salary_type: emp.salary_type || '',
    payrollComputation: { ...(emp.payrollComputation || {}) },
    taxInsurance: { ...(emp.taxInsurance || {}) },
  };
}

function EmployeeDetail({ empCode }) {
  const { user }   = useAuth();
  const [emp,     setEmp]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState('personal');
  const [editing,      setEditing]      = useState(false);
  const [form,         setForm]         = useState({});
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState('');
  const [discardModal, setDiscardModal] = useState(false);

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

  function startEdit() { setForm(initForm(emp)); setEditing(true); setError(''); }
  function cancelEdit() { setDiscardModal(true); }

  function setF(key, value) { setForm((p) => ({ ...p, [key]: value })); }
  function setPC(key, value) { setForm((p) => ({ ...p, payrollComputation: { ...p.payrollComputation, [key]: value } })); }
  function setTI(key, value) { setForm((p) => ({ ...p, taxInsurance: { ...p.taxInsurance, [key]: value } })); }

  async function saveChanges() {
    if (!form.first_name?.trim()) { setError('First Name is required.'); return; }
    if (!form.last_name?.trim())  { setError('Last Name is required.');  return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        // All basic + editable fields from form
        ...form,
        // Always required — pass unchanged from emp
        emp_code:     emp.emp_code,
        status:       emp.status,
        salary_type:  form.salary_type || emp.salary_type || '',
        contributions: emp.contributions || [],
        allowances:   emp.allowances   || [],
        deductions:   emp.deductions   || [],
        dependents:   emp.dependents   || [],
        systemAccount: emp.systemAccount || {},
        // HR user identity for audit trail
        actor_role: user.role,
        user_id:    user.user_id,
        admin_name: user.full_name,
      };

      const { data } = await api.put(
        `/employee/update/${encodeURIComponent(empCode)}`,
        payload,
        { timeout: 30000 },
      );
      if (!data.success) throw new Error(data.message);
      setEmp((prev) => ({ ...prev, ...form }));
      setEditing(false);
      setToast('Changes saved successfully.');
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setError(getApiMessage(err, 'Failed to save changes.'));
    } finally { setSaving(false); }
  }

  if (loading) return <View style={ds.centered}><ActivityIndicator color={T.accent} size="large" /></View>;
  if (error && !emp) return <View style={ds.centered}><Text style={ds.errorText}>{error}</Text></View>;
  if (!emp)    return null;

  const sc       = statusCfg(emp.status);
  const evals    = emp.evaluations || [];
  const evalSummary = emp.evaluationSummary || {};
  const account  = emp.systemAccount || {};
  const f        = editing ? form : emp;
  const pc       = editing ? (form.payrollComputation || {}) : (emp.payrollComputation || {});
  const ti       = editing ? (form.taxInsurance || {}) : (emp.taxInsurance || {});

  return (
    <View style={ds.root}>
      {/* ── Toast ── */}
      {toast ? (
        <View style={ds.toast}>
          <Ionicons name="checkmark-circle" size={15} color="#34d399" />
          <Text style={ds.toastText}>{toast}</Text>
        </View>
      ) : null}

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
        <View style={ds.headerActions}>
          {!editing ? (
            <TouchableOpacity style={ds.editBtn} onPress={startEdit}>
              <Ionicons name="create-outline" size={16} color={T.accentLight} />
              <Text style={ds.editBtnText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={ds.saveRow}>
              <TouchableOpacity style={ds.cancelBtn} onPress={cancelEdit} disabled={saving}>
                <Text style={ds.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.saveBtn, saving && { opacity: 0.6 }]} onPress={saveChanges} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="checkmark" size={15} color="#fff" />
                    <Text style={ds.saveBtnText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {error ? (
        <View style={ds.errorBar}>
          <Ionicons name="alert-circle" size={13} color="#f87171" />
          <Text style={ds.errorBarText}>{error}</Text>
        </View>
      ) : null}
      {editing && (
        <View style={ds.editBanner}>
          <Ionicons name="create" size={13} color="#fbbf24" />
          <Text style={ds.editBannerText}>Editing — changes save to the database and reflect on the web</Text>
        </View>
      )}

      {/* ── Section grid ── */}
      <View style={ds.sectionGrid}>
        {DETAIL_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[ds.sectionGridCard, active && { borderColor: t.color, borderWidth: 1.5 }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.75}
            >
              <View style={[ds.sectionGridIcon, { backgroundColor: active ? t.bg : T.surfaceAlt }]}>
                <Ionicons
                  name={active ? t.icon : t.icon + '-outline'}
                  size={16}
                  color={active ? t.color : T.textMuted}
                />
              </View>
              <Text style={[ds.sectionGridLabel, active && { color: t.color, fontWeight: '700' }]}>
                {t.label}
              </Text>
              {active && <View style={[ds.sectionGridDot, { backgroundColor: t.color }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Discard changes confirmation ── */}
      <Modal visible={discardModal} transparent animationType="fade" onRequestClose={() => setDiscardModal(false)}>
        <Pressable style={ds.warnBackdrop} onPress={() => setDiscardModal(false)}>
          <Pressable style={ds.warnDialog} onPress={() => {}}>
            <View style={ds.warnIconWrap}>
              <Ionicons name="alert-circle-outline" size={28} color="#d97706" />
            </View>
            <Text style={ds.warnTitle}>Discard Changes</Text>
            <Text style={ds.warnMsg}>Unsaved changes will be lost. Are you sure you want to discard them?</Text>
            <View style={ds.warnActions}>
              <TouchableOpacity style={ds.warnKeepBtn} onPress={() => setDiscardModal(false)}>
                <Text style={ds.warnKeepText}>Keep Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ds.warnDiscardBtn} onPress={() => { setEditing(false); setDiscardModal(false); }}>
                <Text style={ds.warnDiscardText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Tab content ── */}
      <ScrollView contentContainerStyle={ds.tabContent}>

        {/* PERSONAL */}
        {tab === 'personal' && (
          <>
            <SectionCard title="Personal Information" icon="person-outline">
              <InfoRow label="First Name"   value={f.first_name}   editing={editing} onChange={(v) => setF('first_name', v)} required />
              <InfoRow label="Middle Name"  value={f.middle_name}  editing={editing} onChange={(v) => setF('middle_name', v)} />
              <InfoRow label="Last Name"    value={f.last_name}    editing={editing} onChange={(v) => setF('last_name', v)} required />
              <InfoRow label="Nickname"     value={f.nickname}     editing={editing} onChange={(v) => setF('nickname', v)} />
              <InfoRow label="Gender"       value={f.gender}       editing={editing} onChange={(v) => setF('gender', v)} />
              <InfoRow label="Civil Status" value={f.civil_status} editing={editing} onChange={(v) => setF('civil_status', v)} />
              <InfoRow label="Birth Date"   value={editing ? f.birth_date : fmtDate(f.birth_date)} editing={editing} onChange={(v) => setF('birth_date', v)} />
            </SectionCard>
            <SectionCard title="Contact" icon="call-outline">
              <InfoRow label="Mobile"  value={f.mobile_no} highlight editing={editing} onChange={(v) => setF('mobile_no', v)} />
              <InfoRow label="Tel"     value={f.tel_no}             editing={editing} onChange={(v) => setF('tel_no', v)} />
              <InfoRow label="Email"   value={f.email}    highlight editing={editing} onChange={(v) => setF('email', v)} />
              <InfoRow label="Fax"     value={f.fax_no}            editing={editing} onChange={(v) => setF('fax_no', v)} />
              <InfoRow label="Website" value={f.website}            editing={editing} onChange={(v) => setF('website', v)} />
            </SectionCard>
            <SectionCard title="Address" icon="home-outline">
              <InfoRow label="Street"  value={f.street}   editing={editing} onChange={(v) => setF('street', v)} />
              <InfoRow label="City"    value={f.city}     editing={editing} onChange={(v) => setF('city', v)} />
              <InfoRow label="Country" value={f.country}  editing={editing} onChange={(v) => setF('country', v)} />
              <InfoRow label="Zip"     value={f.zip_code} editing={editing} onChange={(v) => setF('zip_code', v)} />
            </SectionCard>
          </>
        )}

        {/* EMPLOYMENT */}
        {tab === 'employment' && (
          <>
            <SectionCard title="Employment Details" icon="briefcase-outline">
              <InfoRow label="Company"       value={f.company}       editing={editing} onChange={(v) => setF('company', v)} />
              <InfoRow label="Branch"        value={f.branch}        editing={editing} onChange={(v) => setF('branch', v)} />
              <InfoRow label="Division"      value={f.division}      editing={editing} onChange={(v) => setF('division', v)} />
              <InfoRow label="Department"    value={f.department}    highlight editing={editing} onChange={(v) => setF('department', v)} />
              <InfoRow label="Position"      value={f.position}      highlight editing={editing} onChange={(v) => setF('position', v)} />
              <InfoRow label="Employee Type" value={f.employee_type} editing={editing} onChange={(v) => setF('employee_type', v)} />
              <InfoRow label="Class"         value={f.class}         editing={editing} onChange={(v) => setF('class', v)} />
              <InfoRow label="Location"      value={f.location}      editing={editing} onChange={(v) => setF('location', v)} />
              <InfoRow label="Machine ID"    value={f.machine_id}    editing={editing} onChange={(v) => setF('machine_id', v)} />
              <InfoRow label="Projects"      value={f.projects}      editing={editing} onChange={(v) => setF('projects', v)} multiline />
            </SectionCard>
            <SectionCard title="Key Dates (YYYY-MM-DD)" icon="calendar-outline">
              <InfoRow label="Date Hired"      value={editing ? f.date_hired      : fmtDate(f.date_hired)}      highlight editing={editing} onChange={(v) => setF('date_hired', v)} />
              <InfoRow label="Date Regular"    value={editing ? f.date_regular    : fmtDate(f.date_regular)}    editing={editing} onChange={(v) => setF('date_regular', v)} />
              <InfoRow label="Date Resigned"   value={editing ? f.date_resigned   : fmtDate(f.date_resigned)}   editing={editing} onChange={(v) => setF('date_resigned', v)} />
              <InfoRow label="Date Terminated" value={editing ? f.date_terminated : fmtDate(f.date_terminated)} editing={editing} onChange={(v) => setF('date_terminated', v)} />
              <InfoRow label="End of Contract" value={editing ? f.end_of_contract : fmtDate(f.end_of_contract)} editing={editing} onChange={(v) => setF('end_of_contract', v)} />
            </SectionCard>
          </>
        )}

        {/* GOV'T IDs */}
        {tab === 'govids' && (
          <>
            <SectionCard title="Government IDs" icon="card-outline">
              <InfoRow label="SSS No."       value={f.sss_no}       highlight editing={editing} onChange={(v) => setF('sss_no', v)} />
              <InfoRow label="GSIS No."      value={f.gsis_no}      highlight editing={editing} onChange={(v) => setF('gsis_no', v)} />
              <InfoRow label="Pag-IBIG No."  value={f.pagibig_no}   highlight editing={editing} onChange={(v) => setF('pagibig_no', v)} />
              <InfoRow label="PhilHealth No."value={f.philhealth_no}highlight editing={editing} onChange={(v) => setF('philhealth_no', v)} />
              <InfoRow label="TIN"           value={f.tin_no}       highlight editing={editing} onChange={(v) => setF('tin_no', v)} />
            </SectionCard>
            <SectionCard title="Banking" icon="wallet-outline">
              <InfoRow label="Bank Name"   value={f.bank_name}   editing={editing} onChange={(v) => setF('bank_name', v)} />
              <InfoRow label="Bank Branch" value={f.bank_branch} editing={editing} onChange={(v) => setF('bank_branch', v)} />
              <InfoRow label="ATM No."     value={f.atm_no}      highlight editing={editing} onChange={(v) => setF('atm_no', v)} />
              <InfoRow label="Branch Code" value={f.branch_code} editing={editing} onChange={(v) => setF('branch_code', v)} />
            </SectionCard>
          </>
        )}

        {/* PAYROLL */}
        {tab === 'payroll' && (
          <>
            <SectionCard title="Payroll Computation" icon="calculator-outline">
              <InfoRow label="Payroll Period"   value={pc.payroll_period}   editing={editing} onChange={(v) => setPC('payroll_period', v)} />
              <InfoRow label="Payroll Rate"     value={pc.payroll_rate}     editing={editing} onChange={(v) => setPC('payroll_rate', v)} />
              <InfoRow label="OT Rate"          value={pc.ot_rate}          editing={editing} onChange={(v) => setPC('ot_rate', v)} />
              <InfoRow label="Hours / Day"      value={pc.hours_in_day}     editing={editing} onChange={(v) => setPC('hours_in_day', v)} />
              <InfoRow label="Days / Week"      value={pc.days_in_week}     editing={editing} onChange={(v) => setPC('days_in_week', v)} />
              <InfoRow label="Days / Year"      value={pc.days_in_year}     editing={editing} onChange={(v) => setPC('days_in_year', v)} />
              <InfoRow label="Weeks / Year"     value={pc.week_in_year}     editing={editing} onChange={(v) => setPC('week_in_year', v)} />
              <InfoRow label="Main Computation" value={pc.main_computation} editing={editing} onChange={(v) => setPC('main_computation', v)} />
              <InfoRow label="Basis Absences"   value={pc.basis_absences}   editing={editing} onChange={(v) => setPC('basis_absences', v)} />
              <InfoRow label="Basis OT"         value={pc.basis_overtime}   editing={editing} onChange={(v) => setPC('basis_overtime', v)} />
            </SectionCard>
            <SectionCard title="Tax & Insurance" icon="shield-outline">
              <InfoRow label="Tax Status"    value={ti.tax_status}    editing={editing} onChange={(v) => setTI('tax_status', v)} />
              <InfoRow label="Tax Exemption" value={ti.tax_exemption} editing={editing} onChange={(v) => setTI('tax_exemption', v)} />
              <InfoRow label="Insurance"     value={ti.insurance}     editing={editing} onChange={(v) => setTI('insurance', v)} />
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

        {/* SYSTEM ACCOUNT — read-only, managed via separate endpoint */}
        {tab === 'account' && (
          <SectionCard title="System Account" icon="shield-checkmark-outline">
            <InfoRow label="Username" value={account.username} highlight />
            <InfoRow label="Role"     value={account.role}     highlight />
            <InfoRow label="Status"   value={account.account_status} />
            <InfoRow label="User ID"  value={account.user_id ? String(account.user_id) : null} />
            {editing && (
              <View style={ds.readOnlyNote}>
                <Ionicons name="lock-closed-outline" size={12} color={T.textMuted} />
                <Text style={ds.readOnlyNoteText}>Account credentials are managed separately on the web portal.</Text>
              </View>
            )}
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
      if (pg === 1) { setEmployees(data.employees || []); }
      else { setEmployees((prev) => [...prev, ...(data.employees || [])]); }
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
          <TouchableOpacity style={s.backBtn} onPress={() => setSelected(null)} accessibilityLabel="Go back">
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
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
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
            <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
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
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 11, color: '#93c5fd' },
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
  detailHeaderTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
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

  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingVertical: 8, gap: 6, backgroundColor: T.bg },
  sectionGridCard: { width: '30%', flexGrow: 1, backgroundColor: T.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: T.border },
  sectionGridIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sectionGridLabel: { fontSize: 10, color: T.textMuted, fontWeight: '500', textAlign: 'center' },
  sectionGridDot: { width: 4, height: 4, borderRadius: 2 },

  tabContent: { padding: 14, gap: 12, paddingBottom: 48 },

  sectionCard: { backgroundColor: T.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  sectionTitle: { fontSize: 12, color: T.accentLight, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  infoRowEdit: { alignItems: 'flex-start', paddingVertical: 6 },
  infoLabel: { fontSize: 12, color: T.textSub, flex: 1, paddingTop: 4 },
  infoValue: { fontSize: 12, fontWeight: '700', color: T.textPrimary, flex: 1.2, textAlign: 'right' },
  infoInput: { flex: 1.2, fontSize: 13, color: T.textPrimary, fontWeight: '600', backgroundColor: T.surfaceAlt, borderRadius: 8, borderWidth: 1, borderColor: T.accent + '55', paddingHorizontal: 10, paddingVertical: 7, minHeight: 38 },
  infoInputError: { borderColor: '#f87171', backgroundColor: '#fef2f2' },
  requiredStar: { color: '#f87171', fontWeight: '900' },

  headerActions: { alignItems: 'flex-end', gap: 6 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: T.accentBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: T.accent + '55' },
  editBtnText: { fontSize: 12, color: T.accentLight, fontWeight: '700' },
  saveRow: { flexDirection: 'row', gap: 6 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border },
  cancelBtnText: { fontSize: 12, color: T.textSub, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#16a34a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  saveBtnText: { fontSize: 12, color: '#fff', fontWeight: '800' },

  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fffbeb', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fde68a' },
  editBannerText: { fontSize: 11, color: '#fbbf24', flex: 1 },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fecaca' },
  errorBarText: { fontSize: 11, color: '#f87171', flex: 1 },

  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },

  readOnlyNote: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, backgroundColor: T.surfaceAlt },
  readOnlyNoteText: { fontSize: 11, color: T.textMuted, flex: 1, lineHeight: 16 },
  warnBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  warnDialog:      { backgroundColor: T.surface, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  warnIconWrap:    { width: 60, height: 60, borderRadius: 20, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  warnTitle:       { fontSize: 18, fontWeight: '900', color: T.textPrimary, marginBottom: 10 },
  warnMsg:         { fontSize: 14, color: T.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  warnActions:     { flexDirection: 'row', gap: 12, width: '100%' },
  warnKeepBtn:     { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: T.surfaceAlt, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  warnKeepText:    { fontSize: 14, fontWeight: '700', color: T.textSub },
  warnDiscardBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#dc2626', alignItems: 'center' },
  warnDiscardText: { fontSize: 14, fontWeight: '800', color: '#fff' },

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
