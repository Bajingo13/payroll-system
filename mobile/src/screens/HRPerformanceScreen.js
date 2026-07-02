import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

const T = { bg:'#f8fafc', surface:'#ffffff', surfaceAlt:'#f1f5f9', border:'#e2e8f0', accent:'#1e40af', accentLight:'#2563eb', accentBg:'#dbeafe', textPrimary:'#0f172a', textSub:'#64748b', textMuted:'#94a3b8', headerBg:'#1e3a8a' };

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

// Mirrors backend/employee_management.js getEvaluationRating() for a live preview.
function evaluationRatingClient(score) {
  if (score >= 90) return 'Outstanding';
  if (score >= 80) return 'Exceeds Expectations';
  if (score >= 70) return 'Meets Expectations';
  if (score >= 60) return 'Developing';
  return 'Needs Support';
}

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const SCORE_FIELDS = [
  { key: 'productivity_score', label: 'Productivity' },
  { key: 'quality_score',      label: 'Quality' },
  { key: 'teamwork_score',     label: 'Teamwork' },
  { key: 'attendance_score',   label: 'Attendance' },
  { key: 'initiative_score',   label: 'Initiative' },
];

const EMPTY_EVAL_FORM = {
  review_period: '',
  review_date: '',
  evaluator_name: '',
  productivity_score: '80',
  quality_score: '80',
  teamwork_score: '80',
  attendance_score: '80',
  initiative_score: '80',
  strengths: '',
  improvement_areas: '',
  goals: '',
  action_plan: '',
};

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

  // New evaluation modal
  const [showNewEval,     setShowNewEval]     = useState(false);
  const [employees,       setEmployees]       = useState([]);
  const [employeesLoading,setEmployeesLoading] = useState(false);
  const [pickerSearch,    setPickerSearch]    = useState('');
  const [selectedEmployee,setSelectedEmployee] = useState(null);
  const [evalForm,        setEvalForm]        = useState(EMPTY_EVAL_FORM);
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState('');

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

  async function loadEmployees() {
    setEmployeesLoading(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.employees || []);
    } catch (err) {
      console.error('[HRPerformance] load employees failed:', getApiMessage(err));
    } finally {
      setEmployeesLoading(false);
    }
  }

  function openNewEval() {
    setSelectedEmployee(null);
    setPickerSearch('');
    setEvalForm({ ...EMPTY_EVAL_FORM, review_date: toLocalDateStr(new Date()), evaluator_name: user?.full_name || '' });
    setSubmitError('');
    setShowNewEval(true);
    if (!employees.length) loadEmployees();
  }

  function closeNewEval() {
    setShowNewEval(false);
    setSelectedEmployee(null);
    setSubmitError('');
  }

  function updateScore(key, text) {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 3);
    const clamped = cleaned === '' ? '' : String(Math.min(100, Number(cleaned)));
    setEvalForm((f) => ({ ...f, [key]: clamped }));
  }

  function onDateChange(event, selected) {
    setShowDatePicker(false);
    if (event.type === 'set' && selected) {
      setEvalForm((f) => ({ ...f, review_date: toLocalDateStr(selected) }));
    }
  }

  const overallPreview = Number(
    (SCORE_FIELDS.reduce((sum, f) => sum + Number(evalForm[f.key] || 0), 0) / SCORE_FIELDS.length).toFixed(1)
  );
  const ratingPreview = evaluationRatingClient(overallPreview);

  async function handleSubmitEval() {
    if (!selectedEmployee) return;
    setSubmitError('');
    if (!evalForm.review_period.trim()) { setSubmitError('Please enter a review period (e.g. "Q2 2026").'); return; }
    if (!evalForm.review_date) { setSubmitError('Please select a review date.'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/employee/${selectedEmployee.emp_code}/evaluations`, {
        ...evalForm,
        productivity_score: Number(evalForm.productivity_score || 0),
        quality_score: Number(evalForm.quality_score || 0),
        teamwork_score: Number(evalForm.teamwork_score || 0),
        attendance_score: Number(evalForm.attendance_score || 0),
        initiative_score: Number(evalForm.initiative_score || 0),
        user_id: user.user_id,
        admin_name: user.full_name,
      });
      if (!data.success) throw new Error(data.message || 'Failed to save evaluation.');
      closeNewEval();
      load();
    } catch (err) {
      setSubmitError(getApiMessage(err, 'Failed to save evaluation.'));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredEmployees = employees.filter((e) => {
    const q = pickerSearch.toLowerCase();
    if (!q) return true;
    const name = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
    return name.includes(q) || (e.emp_code || '').toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q);
  });

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
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.headerTitle}>Performance</Text>
            <Text style={s.headerSub}>Employee evaluation records</Text>
          </View>
          <TouchableOpacity style={s.newEvalBtn} onPress={openNewEval} accessibilityLabel="New evaluation">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.newEvalBtnText}>Evaluate</Text>
          </TouchableOpacity>
        </View>

        {/* Summary pills */}
        <View style={s.summaryRow}>
          {[
            { label: 'Rated',   value: summary.employeesWithRatings || 0, color: '#2563eb' },
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
                <View style={s.ratingWrap}>
                  <View style={[s.ratingBadge, { backgroundColor: rc + '20', borderColor: rc + '44' }]}>
                    <Text numberOfLines={1} style={[s.ratingText, { color: rc }]}>{Number(ev.overall_score || 0).toFixed(1)}</Text>
                  </View>
                  <Text numberOfLines={1} style={[s.ratingLabel, { color: rc }]}>{ev.rating || '—'}</Text>
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

      {/* ══ NEW EVALUATION MODAL ══ */}
      <Modal visible={showNewEval} animationType="slide" onRequestClose={closeNewEval}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.evalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={selectedEmployee ? () => setSelectedEmployee(null) : closeNewEval}
              accessibilityLabel={selectedEmployee ? 'Back to employee list' : 'Close'}
            >
              <Ionicons name={selectedEmployee ? 'chevron-back' : 'close'} size={20} color={T.accentLight} />
            </TouchableOpacity>
            <View style={s.headerText}>
              <Text style={s.headerTitle}>{selectedEmployee ? 'New Evaluation' : 'Select Employee'}</Text>
              {selectedEmployee ? (
                <Text style={s.headerSub}>{selectedEmployee.first_name} {selectedEmployee.last_name} · {selectedEmployee.emp_code}</Text>
              ) : (
                <Text style={s.headerSub}>Choose who you're evaluating</Text>
              )}
            </View>
          </View>

          {!selectedEmployee ? (
            <>
              <View style={s.searchWrap2}>
                <Ionicons name="search-outline" size={15} color={T.textMuted} />
                <TextInput style={s.searchInput} value={pickerSearch} onChangeText={setPickerSearch}
                  placeholder="Search employee, ID, department…" placeholderTextColor={T.textMuted} />
              </View>
              <ScrollView contentContainerStyle={s.body}>
                {employeesLoading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
                {!employeesLoading && filteredEmployees.length === 0 && (
                  <View style={s.empty}>
                    <Ionicons name="people-outline" size={44} color={T.textMuted} />
                    <Text style={s.emptyTitle}>No employees found</Text>
                  </View>
                )}
                {filteredEmployees.map((emp) => (
                  <TouchableOpacity key={emp.employee_id} style={s.pickRow} onPress={() => setSelectedEmployee(emp)}>
                    <View style={s.empAvatar}>
                      <Text style={s.empAvatarText}>{(emp.first_name || 'E')[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.empName}>{emp.first_name} {emp.last_name}</Text>
                      <Text style={s.empMeta}>{emp.department || 'No dept'} · {emp.emp_code}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={T.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>Review Period *</Text>
              <TextInput style={s.formInput} value={evalForm.review_period}
                onChangeText={(v) => setEvalForm((f) => ({ ...f, review_period: v }))}
                placeholder='e.g. "Q2 2026"' placeholderTextColor={T.textMuted} />

              <Text style={s.formLabel}>Review Date *</Text>
              <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={T.accent} />
                <Text style={s.dateBtnText}>{evalForm.review_date || 'Select date…'}</Text>
              </TouchableOpacity>

              <Text style={s.formLabel}>Evaluator</Text>
              <TextInput style={s.formInput} value={evalForm.evaluator_name}
                onChangeText={(v) => setEvalForm((f) => ({ ...f, evaluator_name: v }))}
                placeholder="Your name" placeholderTextColor={T.textMuted} />

              <View style={s.previewCard}>
                <Text style={s.previewLabel}>Overall Score (preview)</Text>
                <View style={s.previewRow}>
                  <Text style={[s.previewScore, { color: ratingColor(ratingPreview) }]}>{overallPreview}</Text>
                  <View style={[s.ratingBadge, { backgroundColor: ratingColor(ratingPreview) + '20', borderColor: ratingColor(ratingPreview) + '44' }]}>
                    <Text style={[s.ratingLabel, { color: ratingColor(ratingPreview) }]}>{ratingPreview}</Text>
                  </View>
                </View>
              </View>

              <Text style={[s.formLabel, { marginTop: 4 }]}>Scores (0–100)</Text>
              {SCORE_FIELDS.map((sf) => (
                <View key={sf.key} style={s.scoreInputRow}>
                  <Text style={s.scoreInputLabel}>{sf.label}</Text>
                  <TextInput
                    style={s.scoreInput}
                    value={evalForm[sf.key]}
                    onChangeText={(v) => updateScore(sf.key, v)}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="0"
                    placeholderTextColor={T.textMuted}
                  />
                </View>
              ))}

              <Text style={s.formLabel}>Strengths</Text>
              <TextInput style={s.formTextarea} value={evalForm.strengths}
                onChangeText={(v) => setEvalForm((f) => ({ ...f, strengths: v }))}
                placeholder="What is this employee doing well?" placeholderTextColor={T.textMuted}
                multiline numberOfLines={3} textAlignVertical="top" />

              <Text style={s.formLabel}>Areas for Improvement</Text>
              <TextInput style={s.formTextarea} value={evalForm.improvement_areas}
                onChangeText={(v) => setEvalForm((f) => ({ ...f, improvement_areas: v }))}
                placeholder="Where can they grow?" placeholderTextColor={T.textMuted}
                multiline numberOfLines={3} textAlignVertical="top" />

              <Text style={s.formLabel}>Goals</Text>
              <TextInput style={s.formTextarea} value={evalForm.goals}
                onChangeText={(v) => setEvalForm((f) => ({ ...f, goals: v }))}
                placeholder="Goals for the next review period" placeholderTextColor={T.textMuted}
                multiline numberOfLines={3} textAlignVertical="top" />

              <Text style={s.formLabel}>Action Plan</Text>
              <TextInput style={s.formTextarea} value={evalForm.action_plan}
                onChangeText={(v) => setEvalForm((f) => ({ ...f, action_plan: v }))}
                placeholder="Concrete next steps" placeholderTextColor={T.textMuted}
                multiline numberOfLines={3} textAlignVertical="top" />

              {submitError ? (
                <View style={s.submitErrorBox}>
                  <Ionicons name="alert-circle" size={13} color="#dc2626" />
                  <Text style={s.submitErrorText}>{submitError}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmitEval} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Save Evaluation</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}

          {showDatePicker && (
            <DateTimePicker
              value={new Date(`${evalForm.review_date || toLocalDateStr(new Date())}T00:00:00`)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={onDateChange}
            />
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 11, color: '#93c5fd' },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryPill: { flex: 1, backgroundColor: T.surface, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  summaryVal: { fontSize: 18, fontWeight: '900' },
  summaryLabel: { fontSize: 9, color: T.textSub, fontWeight: '600', marginTop: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  body: { padding: 14, gap: 10, paddingBottom: 48 },
  card: { backgroundColor: T.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  empAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { color: T.accentLight, fontSize: 15, fontWeight: '900' },
  empInfo: { flex: 1 },
  empName: { fontSize: 13, fontWeight: '800', color: T.textPrimary },
  empMeta: { fontSize: 11, color: T.textSub },
  reviewPeriod: { fontSize: 10, color: T.textMuted, marginTop: 2 },
  ratingWrap: { alignItems: 'center', width: 72, flexShrink: 0 },
  ratingBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, alignItems: 'center', alignSelf: 'stretch' },
  ratingText: { fontSize: 16, fontWeight: '900', textAlign: 'center', letterSpacing: 0 },
  ratingLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  detailWrap: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.border, gap: 10 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreLabel: { fontSize: 11, color: T.textSub, width: 90 },
  scoreBarBg: { flex: 1, height: 5, backgroundColor: T.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  scoreVal: { fontSize: 11, fontWeight: '800', color: T.textPrimary, width: 42, textAlign: 'right' },
  textBlock: { backgroundColor: T.surfaceAlt, borderRadius: 10, padding: 10 },
  textBlockLabel: { fontSize: 10, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  textBlockVal: { fontSize: 12, color: T.textSub, lineHeight: 17 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: T.textSub },
  errorText: { color: '#f87171', textAlign: 'center', padding: 16, fontSize: 13 },

  newEvalBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.accentLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  newEvalBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // New evaluation modal
  evalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 16 },
  searchWrap2: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9, margin: 14, marginBottom: 0 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: T.border },

  formLabel: { fontSize: 12, fontWeight: '800', color: T.textSub, marginTop: 14, marginBottom: 6 },
  formInput: { backgroundColor: T.surface, borderRadius: 10, borderWidth: 1.5, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: T.textPrimary },
  formTextarea: { backgroundColor: T.surface, borderRadius: 10, borderWidth: 1.5, borderColor: T.border, padding: 12, fontSize: 13, color: T.textPrimary, minHeight: 72 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 10, borderWidth: 1.5, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 11 },
  dateBtnText: { fontSize: 14, fontWeight: '700', color: T.textPrimary },

  previewCard: { backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginTop: 16 },
  previewLabel: { fontSize: 10, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewScore: { fontSize: 28, fontWeight: '900' },

  scoreInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  scoreInputLabel: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  scoreInput: { width: 56, textAlign: 'center', fontSize: 14, fontWeight: '800', color: T.accent, backgroundColor: T.accentBg, borderRadius: 8, paddingVertical: 6 },

  submitErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fef2f2', borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', padding: 11, marginTop: 16 },
  submitErrorText: { flex: 1, fontSize: 12, color: '#dc2626' },

  submitBtn: { height: 52, backgroundColor: T.accent, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
