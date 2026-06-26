import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

const T = {
  bg: '#f8fafc', surface: '#ffffff', surfaceAlt: '#f1f5f9', border: '#e2e8f0',
  accent: '#1e40af', accentLight: '#2563eb', accentBg: '#dbeafe',
  textPrimary: '#0f172a', textSub: '#64748b', textMuted: '#94a3b8',
  headerBg: '#1e3a8a', danger: '#dc2626', dangerBg: '#fef2f2',
  success: '#16a34a', successBg: '#f0fdf4',
};

const DAYS = [
  { value: '0', label: 'Su' }, { value: '1', label: 'Mo' }, { value: '2', label: 'Tu' },
  { value: '3', label: 'We' }, { value: '4', label: 'Th' }, { value: '5', label: 'Fr' },
  { value: '6', label: 'Sa' },
];
const DAYS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_OPTIONS = ['all', 'active', 'hold', 'resigned', 'terminated', 'end of contract'];
const PAYROLL_PERIODS = ['', 'Weekly', 'Semi-Monthly', 'Monthly'];

const TABS = [
  { key: 'templates', label: 'Shift Templates', icon: 'calendar-outline' },
  { key: 'assign',    label: 'Bulk Assign',     icon: 'people-outline' },
  { key: 'settings',  label: 'Emp. Settings',   icon: 'settings-outline' },
];

function parseDays(str) {
  return new Set(String(str || '1,2,3,4,5').split(',').map(s => s.trim()).filter(Boolean));
}
function serializeDays(set) {
  return DAYS.map(d => d.value).filter(v => set.has(v)).join(',');
}
function toStr(v, fallback = '') {
  if (v === null || v === undefined) return fallback;
  return String(v);
}
function formatDays(workingDaysStr) {
  const set = parseDays(workingDaysStr);
  return DAYS.filter(d => set.has(d.value)).map(d => DAYS_FULL[Number(d.value)]).join(', ') || '—';
}

// ── Inline toast ──────────────────────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null;
  const isErr = type === 'error';
  return (
    <View style={[s.toast, isErr ? s.toastErr : s.toastOk]}>
      <Ionicons name={isErr ? 'close-circle' : 'checkmark-circle'} size={16} color={isErr ? T.danger : T.success} />
      <Text style={[s.toastText, { color: isErr ? T.danger : T.success }]}>{message}</Text>
    </View>
  );
}

function SavedPopup({ visible, message, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.savedBackdrop} onPress={onClose}>
        <Pressable style={s.savedDialog} onPress={() => {}}>
          <View style={s.savedIconWrap}>
            <Ionicons name="checkmark-circle" size={46} color={T.success} />
          </View>
          <Text style={s.savedTitle}>Saved</Text>
          <Text style={s.savedMessage}>{message || 'Schedule saved successfully.'}</Text>
          <TouchableOpacity style={s.savedButton} onPress={onClose}>
            <Text style={s.savedButtonText}>OK</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Day picker row ─────────────────────────────────────────────────────────────
function DayPicker({ value, onChange }) {
  return (
    <View style={s.dayRow}>
      {DAYS.map(d => {
        const active = value.has(d.value);
        return (
          <TouchableOpacity
            key={d.value}
            style={[s.dayBtn, active && s.dayBtnActive]}
            onPress={() => {
              const next = new Set(value);
              if (next.has(d.value)) next.delete(d.value); else next.add(d.value);
              onChange(next);
            }}
          >
            <Text style={[s.dayBtnText, active && s.dayBtnTextActive]}>{d.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Options picker modal ──────────────────────────────────────────────────────
function PickerModal({ visible, title, options, value, onSelect, onClose, labelFn }) {
  const lbl = labelFn || (o => String(o));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalBg} onPress={onClose}>
        <Pressable style={s.modalSheet} onPress={() => {}}>
          <View style={s.modalHandle} />
          <Text style={s.pickerTitle}>{title}</Text>
          <ScrollView>
            {options.map((opt, i) => {
              const isSelected = String(opt) === String(value);
              return (
                <TouchableOpacity key={i} style={[s.pickerOpt, isSelected && s.pickerOptActive]} onPress={() => { onSelect(opt); onClose(); }}>
                  <Text style={[s.pickerOptText, isSelected && s.pickerOptTextActive]}>{lbl(opt)}</Text>
                  {isSelected && <Ionicons name="checkmark" size={16} color={T.accentLight} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Field row helpers ─────────────────────────────────────────────────────────
function FieldLabel({ label }) {
  return <Text style={s.fieldLabel}>{label}</Text>;
}
function FieldInput({ label, value, onChange, keyboardType, placeholder, editable = true }) {
  return (
    <View style={s.fieldWrap}>
      <FieldLabel label={label} />
      <TextInput
        style={[s.fieldInput, !editable && { color: T.textMuted }]}
        value={String(value ?? '')}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
        placeholder={placeholder || ''}
        placeholderTextColor={T.textMuted}
        editable={editable}
      />
    </View>
  );
}
function FieldPicker({ label, value, options, onChange, labelFn }) {
  const [open, setOpen] = useState(false);
  const lbl = labelFn || (o => String(o));
  return (
    <View style={s.fieldWrap}>
      <FieldLabel label={label} />
      <TouchableOpacity style={s.fieldPickerBtn} onPress={() => setOpen(true)}>
        <Text style={[s.fieldPickerText, !value && { color: T.textMuted }]}>{value ? lbl(value) : 'Select…'}</Text>
        <Ionicons name="chevron-down" size={14} color={T.textMuted} />
      </TouchableOpacity>
      <PickerModal visible={open} title={label} options={options} value={value} onSelect={onChange} onClose={() => setOpen(false)} labelFn={labelFn} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function HRScheduleScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('templates');

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>Schedule Management</Text>
            <Text style={s.headerSub}>Shift templates, bulk assign & employee settings</Text>
          </View>
        </View>
        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabs}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive]} onPress={() => setTab(t.key)}>
              <Ionicons name={t.icon} size={13} color={tab === t.key ? '#fff' : '#93c5fd'} />
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {tab === 'templates' && <ShiftTemplatesTab />}
      {tab === 'assign'    && <BulkAssignTab />}
      {tab === 'settings'  && <EmployeeSettingsTab />}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHIFT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════
function emptyTemplate() {
  return {
    name: '', description: '',
    time_in: '08:00', time_out: '17:00', break_minutes: '60',
    hours_in_day: '8', days_in_week: '5',
    working_days: new Set(['1', '2', '3', '4', '5']),
    night_diff: false, night_diff_start: '22:00', night_diff_end: '06:00', night_diff_rate: '10',
  };
}

function ShiftTemplatesTab() {
  const [templates,  setTemplates]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [editId,     setEditId]     = useState(null);
  const [form,       setForm]       = useState(emptyTemplate());
  const [formOpen,   setFormOpen]   = useState(false);
  const [toast,      setToast]      = useState({ msg: '', type: 'ok' });
  const [savedPopup, setSavedPopup] = useState('');

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3000);
  }

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/schedule_templates');
      setTemplates(data.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function openAdd() {
    setForm(emptyTemplate());
    setEditId(null);
    setFormOpen(true);
  }

  function openEdit(tpl) {
    setForm({
      name:            tpl.name,
      description:     tpl.description || '',
      time_in:         tpl.time_in || '08:00',
      time_out:        tpl.time_out || '17:00',
      break_minutes:   toStr(tpl.break_minutes, '60'),
      hours_in_day:    toStr(tpl.hours_in_day, '8'),
      days_in_week:    toStr(tpl.days_in_week, '5'),
      working_days:    parseDays(tpl.working_days),
      night_diff:      Boolean(Number(tpl.night_diff)),
      night_diff_start: tpl.night_diff_start || '22:00',
      night_diff_end:   tpl.night_diff_end   || '06:00',
      night_diff_rate:  toStr((Number(tpl.night_diff_rate || 0) * 100).toFixed(0), '10'),
    });
    setEditId(tpl.id);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast('Template name is required.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        working_days:    serializeDays(form.working_days),
        night_diff_rate: (Number(form.night_diff_rate) || 10) / 100,
      };
      if (editId) await api.put(`/schedule_templates/${editId}`, payload);
      else        await api.post('/schedule_templates', payload);
      setSavedPopup(editId ? 'Template updated successfully.' : 'Template created successfully.');
      setFormOpen(false);
      setEditId(null);
      await load();
    } catch { showToast('Failed to save template.', 'error'); }
    finally { setSaving(false); }
  }

  function confirmDelete(tpl) {
    Alert.alert('Delete Template', `Delete "${tpl.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/schedule_templates/${tpl.id}`);
          showToast('Template deleted.');
          await load();
        } catch { showToast('Failed to delete template.', 'error'); }
      }},
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Toast message={toast.msg} type={toast.type} />
      <SavedPopup visible={Boolean(savedPopup)} message={savedPopup} onClose={() => setSavedPopup('')} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.accentLight} />}
      >
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Shift Templates</Text>
          <TouchableOpacity style={s.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnText}>New</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.sectionSub}>Reusable work schedules that can be assigned to employees.</Text>

        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 24 }} />}
        {!loading && templates.length === 0 && (
          <Text style={s.emptyText}>No templates yet. Tap "+ New" to start.</Text>
        )}
        {templates.map(tpl => (
          <View key={tpl.id} style={s.card}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{tpl.name}</Text>
                {tpl.description ? <Text style={s.cardSub}>{tpl.description}</Text> : null}
              </View>
              <View style={s.rowActions}>
                <TouchableOpacity style={s.editBtn} onPress={() => openEdit(tpl)}>
                  <Text style={s.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.delBtn} onPress={() => confirmDelete(tpl)}>
                  <Text style={s.delBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.cardMeta}>
              <MetaBadge icon="time-outline" text={`${tpl.time_in} – ${tpl.time_out}`} />
              <MetaBadge icon="cafe-outline"  text={`${tpl.break_minutes} min break`} />
              <MetaBadge icon="sunny-outline" text={`${tpl.hours_in_day}h/day`} />
            </View>
            <Text style={s.cardDays}>{formatDays(tpl.working_days)}</Text>
            {Number(tpl.night_diff) ? (
              <View style={s.nightBadge}>
                <Text style={s.nightBadgeText}>
                  Night Diff {(Number(tpl.night_diff_rate) * 100).toFixed(0)}% · {tpl.night_diff_start}–{tpl.night_diff_end}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* Template Form Modal */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setFormOpen(false)}>
          <Pressable style={[s.modalSheet, { maxHeight: '95%' }]} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{editId ? 'Edit Template' : 'New Template'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <FieldInput label="Template Name *" value={form.name} onChange={v => set('name', v)} placeholder="e.g. Regular Day Shift" />
              <FieldInput label="Description" value={form.description} onChange={v => set('description', v)} placeholder="Optional notes" />
              <FieldInput label="Time In (HH:MM)" value={form.time_in} onChange={v => set('time_in', v)} placeholder="08:00" />
              <FieldInput label="Time Out (HH:MM)" value={form.time_out} onChange={v => set('time_out', v)} placeholder="17:00" />
              <FieldInput label="Break (minutes)" value={form.break_minutes} onChange={v => set('break_minutes', v)} keyboardType="numeric" />
              <FieldInput label="Work Hours / Day" value={form.hours_in_day} onChange={v => set('hours_in_day', v)} keyboardType="numeric" />

              <View style={s.fieldWrap}>
                <FieldLabel label="Working Days" />
                <DayPicker value={form.working_days} onChange={days => { set('working_days', days); set('days_in_week', String(days.size)); }} />
              </View>

              <View style={s.fieldWrap}>
                <FieldLabel label="Night Differential" />
                <View style={s.switchRow}>
                  <Switch value={form.night_diff} onValueChange={v => set('night_diff', v)} trackColor={{ true: T.accentLight }} thumbColor="#fff" />
                  <Text style={s.switchLabel}>{form.night_diff ? 'Enabled' : 'Disabled'}</Text>
                </View>
              </View>

              {form.night_diff && (
                <>
                  <FieldInput label="Night Diff Start (HH:MM)" value={form.night_diff_start} onChange={v => set('night_diff_start', v)} placeholder="22:00" />
                  <FieldInput label="Night Diff End (HH:MM)" value={form.night_diff_end} onChange={v => set('night_diff_end', v)} placeholder="06:00" />
                  <FieldInput label="Night Diff Rate (%)" value={form.night_diff_rate} onChange={v => set('night_diff_rate', v)} keyboardType="numeric" placeholder="10" />
                </>
              )}

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setFormOpen(false); setEditId(null); }}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                  <Text style={s.saveBtnText}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK ASSIGN
// ═══════════════════════════════════════════════════════════════════════════════
function BulkAssignTab() {
  const [templates,  setTemplates]  = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning,  setAssigning]  = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(new Set());
  const [tplOpen,    setTplOpen]    = useState(false);
  const [deptOpen,   setDeptOpen]   = useState(false);
  const [toast,      setToast]      = useState({ msg: '', type: 'ok' });
  const [savedPopup, setSavedPopup] = useState('');

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3000);
  }

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [tplRes, empRes] = await Promise.all([
        api.get('/schedule_templates'),
        api.get('/employees'),
      ]);
      setTemplates(tplRes.data.data || []);
      setEmployees(empRes.data.employees || []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const departments = useMemo(() =>
    [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e => {
      const matchDept = !deptFilter || e.department === deptFilter;
      const matchQ = !q || `${e.first_name} ${e.last_name} ${e.emp_code || ''}`.toLowerCase().includes(q);
      return matchDept && matchQ;
    });
  }, [employees, deptFilter, search]);

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(e => e.employee_id)));
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function handleAssign() {
    if (!templateId) { showToast('Select a template first.', 'error'); return; }
    if (selected.size === 0) { showToast('Select at least one employee.', 'error'); return; }
    setAssigning(true);
    try {
      const { data } = await api.post(`/schedule_templates/${templateId}/assign`, {
        employee_ids: [...selected],
      });
      setSavedPopup(data.message || `Assigned to ${data.updated} employee(s).`);
      setSelected(new Set());
    } catch (err) { showToast(getApiMessage(err, 'Failed to assign template.'), 'error'); }
    finally { setAssigning(false); }
  }

  const chosenTemplate = templates.find(t => String(t.id) === String(templateId));

  return (
    <View style={{ flex: 1 }}>
      <Toast message={toast.msg} type={toast.type} />
      <SavedPopup visible={Boolean(savedPopup)} message={savedPopup} onClose={() => setSavedPopup('')} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.accentLight} />}
      >
        <Text style={s.sectionTitle}>Bulk Assign Schedule</Text>
        <Text style={s.sectionSub}>Pick a shift template and assign it to multiple employees at once.</Text>

        {/* Template picker */}
        <View style={s.fieldWrap}>
          <FieldLabel label="Shift Template *" />
          <TouchableOpacity style={s.fieldPickerBtn} onPress={() => setTplOpen(true)}>
            <Text style={[s.fieldPickerText, !templateId && { color: T.textMuted }]}>
              {chosenTemplate ? `${chosenTemplate.name} (${chosenTemplate.hours_in_day}h, ${chosenTemplate.time_in}–${chosenTemplate.time_out})` : 'Select a template…'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={T.textMuted} />
          </TouchableOpacity>
        </View>
        <PickerModal
          visible={tplOpen}
          title="Select Template"
          options={templates}
          value={templateId}
          onSelect={t => setTemplateId(String(t.id))}
          onClose={() => setTplOpen(false)}
          labelFn={t => `${t.name} (${t.hours_in_day}h, ${t.time_in}–${t.time_out})`}
        />

        {chosenTemplate && (
          <View style={s.tplPreview}>
            <Text style={s.tplPreviewTitle}>{chosenTemplate.name}</Text>
            <Text style={s.tplPreviewText}>
              {chosenTemplate.time_in}–{chosenTemplate.time_out} · Break {chosenTemplate.break_minutes} min{'\n'}
              {formatDays(chosenTemplate.working_days)}
              {Number(chosenTemplate.night_diff) ? ` · Night diff ${(Number(chosenTemplate.night_diff_rate) * 100).toFixed(0)}%` : ''}
            </Text>
          </View>
        )}

        {/* Filters */}
        <View style={s.filterRow}>
          <View style={{ flex: 1 }}>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={14} color={T.textMuted} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={t => { setSearch(t); setSelected(new Set()); }}
                placeholder="Search name or ID…"
                placeholderTextColor={T.textMuted}
              />
            </View>
          </View>
          <TouchableOpacity style={s.filterBtn} onPress={() => setDeptOpen(true)}>
            <Text style={s.filterBtnText} numberOfLines={1}>{deptFilter || 'All Depts'}</Text>
            <Ionicons name="chevron-down" size={12} color={T.textSub} />
          </TouchableOpacity>
        </View>
        <PickerModal
          visible={deptOpen}
          title="Department"
          options={['', ...departments]}
          value={deptFilter}
          onSelect={v => { setDeptFilter(v); setSelected(new Set()); }}
          onClose={() => setDeptOpen(false)}
          labelFn={v => v || 'All Departments'}
        />

        {/* Select All / Assign */}
        <View style={s.bulkToolbar}>
          <TouchableOpacity style={s.outlineBtn} onPress={toggleAll}>
            <Text style={s.outlineBtnText}>
              {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, (assigning || selected.size === 0 || !templateId) && s.saveBtnDisabled]}
            onPress={handleAssign}
            disabled={assigning || selected.size === 0 || !templateId}
          >
            <Text style={s.saveBtnText}>
              {assigning ? 'Assigning…' : `Assign to ${selected.size}`}
            </Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 24 }} />}
        {filtered.map((e, i) => {
          const sel = selected.has(e.employee_id);
          return (
            <TouchableOpacity key={e.employee_id || i} style={[s.empCard, sel && s.empCardSelected]} onPress={() => toggle(e.employee_id)}>
              <View style={[s.checkbox, sel && s.checkboxActive]}>
                {sel && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <View style={s.empAvatar}>
                <Text style={s.empAvatarText}>{(e.first_name || 'E')[0]}</Text>
              </View>
              <View style={s.empInfo}>
                <Text style={s.empName}>{e.first_name} {e.last_name}</Text>
                <Text style={s.empMeta}>{e.emp_code || '—'} · {e.department || 'No dept'}</Text>
              </View>
              <View style={[s.statusPill, (e.status || '').toLowerCase() === 'active' ? s.pillGreen : s.pillGray]}>
                <Text style={[s.statusText, (e.status || '').toLowerCase() === 'active' ? { color: '#34d399' } : { color: T.textMuted }]}>
                  {e.status || 'Active'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {!loading && filtered.length === 0 && <Text style={s.emptyText}>No employees found.</Text>}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function emptyForm() {
  return {
    payroll_period: '', payroll_rate: '', main_computation: '',
    days_in_year: '', days_in_week: '', hours_in_day: '', week_in_year: '',
    strict_no_overtime: false,
    ot_rate: '', days_in_year_ot: '', rate_basis_ot: '',
    basis_absences: '', basis_overtime: '',
    time_in: '08:00', time_out: '17:00', break_minutes: '60',
    working_days: new Set(['1', '2', '3', '4', '5']),
    schedule_template_id: '',
  };
}

function EmployeeSettingsTab() {
  const [employees,      setEmployees]      = useState([]);
  const [templates,      setTemplates]      = useState([]);
  const [search,         setSearch]         = useState('');
  const [status,         setStatus]         = useState('all');
  const [statusOpen,     setStatusOpen]     = useState(false);
  const [loadingList,    setLoadingList]    = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);
  const [detailOpen,     setDetailOpen]     = useState(false);
  const [selectedEmp,    setSelectedEmp]    = useState(null);
  const [form,           setForm]           = useState(emptyForm());
  const [loadingDetail,  setLoadingDetail]  = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [toast,          setToast]          = useState({ msg: '', type: 'ok' });
  const [tplOpen,        setTplOpen]        = useState(false);
  const [savedPopup,     setSavedPopup]     = useState('');

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3000);
  }

  async function loadEmployees(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoadingList(true);
    try {
      const { data } = await api.get('/admin_schedule_management_list', { params: { search: search.trim(), status } });
      if (!data.success) throw new Error(data.message);
      const rows = data.employees || [];
      if (rows.length === 0 && !search.trim() && status === 'all') {
        const fb = await api.get('/employees');
        setEmployees(fb.data?.employees || []);
      } else {
        setEmployees(rows);
      }
    } catch { setEmployees([]); }
    finally { setLoadingList(false); setRefreshing(false); }
  }

  async function openDetail(emp) {
    setSelectedEmp(emp);
    setDetailOpen(true);
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/admin_schedule_management/${emp.employee_id}`);
      if (!data.success) throw new Error(data.message);
      setSelectedEmp(data.employee || emp);
      const sc = data.schedule || {};
      setForm({
        payroll_period:       toStr(sc.payroll_period),
        payroll_rate:         toStr(sc.payroll_rate),
        main_computation:     toStr(sc.main_computation),
        days_in_year:         toStr(sc.days_in_year),
        days_in_week:         toStr(sc.days_in_week),
        hours_in_day:         toStr(sc.hours_in_day),
        week_in_year:         toStr(sc.week_in_year),
        strict_no_overtime:   Boolean(sc.strict_no_overtime),
        ot_rate:              toStr(sc.ot_rate),
        days_in_year_ot:      toStr(sc.days_in_year_ot),
        rate_basis_ot:        toStr(sc.rate_basis_ot),
        basis_absences:       toStr(sc.basis_absences),
        basis_overtime:       toStr(sc.basis_overtime),
        time_in:              toStr(sc.time_in, '08:00'),
        time_out:             toStr(sc.time_out, '17:00'),
        break_minutes:        toStr(sc.break_minutes, '60'),
        working_days:         parseDays(sc.working_days),
        schedule_template_id: toStr(sc.schedule_template_id),
      });
    } catch {
      setForm(emptyForm());
    } finally { setLoadingDetail(false); }
  }

  useEffect(() => {
    loadEmployees();
    api.get('/schedule_templates').then(({ data }) => setTemplates(data.data || [])).catch(() => {});
  }, []);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function applyTemplate(tplId) {
    set('schedule_template_id', tplId);
    if (!tplId) return;
    const tpl = templates.find(t => String(t.id) === String(tplId));
    if (!tpl) return;
    setForm(f => ({
      ...f,
      schedule_template_id: tplId,
      time_in:       tpl.time_in || '08:00',
      time_out:      tpl.time_out || '17:00',
      break_minutes: String(tpl.break_minutes ?? 60),
      hours_in_day:  String(tpl.hours_in_day ?? 8),
      days_in_week:  String(tpl.days_in_week ?? 5),
      working_days:  parseDays(tpl.working_days),
    }));
  }

  async function save() {
    if (!selectedEmp?.employee_id) { showToast('No employee selected.', 'error'); return; }
    setSaving(true);
    try {
      const payload = { ...form, working_days: serializeDays(form.working_days) };
      const { data } = await api.put(`/admin_schedule_management/${selectedEmp.employee_id}`, payload);
      if (!data.success) throw new Error(data.message);
      setSavedPopup('Schedule settings saved successfully.');
    } catch (err) { showToast(getApiMessage(err, 'Unable to save schedule.'), 'error'); }
    finally { setSaving(false); }
  }

  const chosenTpl = templates.find(t => String(t.id) === String(form.schedule_template_id));

  return (
    <View style={{ flex: 1 }}>
      <Toast message={toast.msg} type={toast.type} />
      <SavedPopup visible={Boolean(savedPopup)} message={savedPopup} onClose={() => setSavedPopup('')} />

      {/* Employee list */}
      <View style={s.filterRow}>
        <View style={{ flex: 1 }}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={14} color={T.textMuted} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Name, ID, department…"
              placeholderTextColor={T.textMuted}
            />
          </View>
        </View>
        <TouchableOpacity style={s.filterBtn} onPress={() => setStatusOpen(true)}>
          <Text style={s.filterBtnText}>{status === 'all' ? 'All' : status}</Text>
          <Ionicons name="chevron-down" size={12} color={T.textSub} />
        </TouchableOpacity>
        <TouchableOpacity style={s.searchGoBtn} onPress={() => loadEmployees()}>
          <Ionicons name="search" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      <PickerModal
        visible={statusOpen}
        title="Status"
        options={STATUS_OPTIONS}
        value={status}
        onSelect={v => setStatus(v)}
        onClose={() => setStatusOpen(false)}
        labelFn={v => v === 'all' ? 'All Statuses' : v}
      />

      <ScrollView
        contentContainerStyle={[s.body, { paddingTop: 8 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEmployees(true)} tintColor={T.accentLight} />}
      >
        {loadingList && <ActivityIndicator color={T.accent} style={{ marginVertical: 24 }} />}
        {employees.map((emp, i) => (
          <TouchableOpacity key={emp.employee_id || i} style={s.empCard} onPress={() => openDetail(emp)}>
            <View style={s.empAvatar}>
              <Text style={s.empAvatarText}>{(emp.full_name || 'E')[0]}</Text>
            </View>
            <View style={s.empInfo}>
              <Text style={s.empName}>{emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim()}</Text>
              <Text style={s.empMeta}>{emp.emp_code} · {emp.department || 'No dept'}</Text>
            </View>
            <View style={[s.statusPill, (emp.status || '').toLowerCase() === 'active' ? s.pillGreen : s.pillGray]}>
              <Text style={[s.statusText, (emp.status || '').toLowerCase() === 'active' ? { color: '#34d399' } : { color: T.textMuted }]}>
                {emp.status || 'Active'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
          </TouchableOpacity>
        ))}
        {!loadingList && employees.length === 0 && <Text style={s.emptyText}>No employees found.</Text>}
      </ScrollView>

      {/* Settings Detail Modal */}
      <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setDetailOpen(false)}>
          <Pressable style={[s.modalSheet, { maxHeight: '95%' }]} onPress={() => {}}>
            <View style={s.modalHandle} />
            {loadingDetail ? (
              <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />
            ) : (
              <>
                <View style={s.modalEmpRow}>
                  <View style={s.modalAvatar}>
                    <Text style={s.modalAvatarText}>{(selectedEmp?.full_name || 'E')[0]}</Text>
                  </View>
                  <View>
                    <Text style={s.modalEmpName}>{selectedEmp?.full_name}</Text>
                    <Text style={s.modalEmpMeta}>{selectedEmp?.emp_code} · {selectedEmp?.department}</Text>
                  </View>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={s.formSection}>Apply Shift Template</Text>
                  <TouchableOpacity style={s.fieldPickerBtn} onPress={() => setTplOpen(true)}>
                    <Text style={[s.fieldPickerText, !form.schedule_template_id && { color: T.textMuted }]}>
                      {chosenTpl ? chosenTpl.name : 'None / Manual'}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={T.textMuted} />
                  </TouchableOpacity>
                  <PickerModal
                    visible={tplOpen}
                    title="Apply Template"
                    options={[{ id: '', name: 'None / Manual' }, ...templates]}
                    value={form.schedule_template_id}
                    onSelect={t => applyTemplate(String(t.id))}
                    onClose={() => setTplOpen(false)}
                    labelFn={t => t.name}
                  />

                  <Text style={s.formSection}>Shift Times</Text>
                  <FieldInput label="Time In (HH:MM)" value={form.time_in} onChange={v => set('time_in', v)} placeholder="08:00" />
                  <FieldInput label="Time Out (HH:MM)" value={form.time_out} onChange={v => set('time_out', v)} placeholder="17:00" />
                  <FieldInput label="Break (minutes)" value={form.break_minutes} onChange={v => set('break_minutes', v)} keyboardType="numeric" />
                  <FieldInput label="Work Hours / Day" value={form.hours_in_day} onChange={v => set('hours_in_day', v)} keyboardType="numeric" />

                  <View style={s.fieldWrap}>
                    <FieldLabel label="Working Days" />
                    <DayPicker value={form.working_days} onChange={days => { set('working_days', days); set('days_in_week', String(days.size)); }} />
                  </View>

                  <Text style={s.formSection}>Payroll Settings</Text>
                  <FieldPicker
                    label="Payroll Period"
                    value={form.payroll_period}
                    options={PAYROLL_PERIODS}
                    onChange={v => set('payroll_period', v)}
                    labelFn={v => v || 'Select period'}
                  />
                  <FieldInput label="Payroll Rate Type" value={form.payroll_rate} onChange={v => set('payroll_rate', v)} placeholder="e.g. Monthly Rate" />
                  <FieldInput label="Main Computation Divisor" value={form.main_computation} onChange={v => set('main_computation', v)} keyboardType="numeric" />
                  <FieldInput label="Days in Year" value={form.days_in_year} onChange={v => set('days_in_year', v)} keyboardType="numeric" />
                  <FieldInput label="Days in Week" value={form.days_in_week} onChange={v => set('days_in_week', v)} keyboardType="numeric" editable={false} />
                  <FieldInput label="Weeks in Year" value={form.week_in_year} onChange={v => set('week_in_year', v)} keyboardType="numeric" />

                  <Text style={s.formSection}>Overtime Settings</Text>
                  <FieldInput label="OT Rate" value={form.ot_rate} onChange={v => set('ot_rate', v)} placeholder="e.g. STANDARD OT RATE" />
                  <FieldInput label="Days in Year (OT)" value={form.days_in_year_ot} onChange={v => set('days_in_year_ot', v)} keyboardType="numeric" />
                  <FieldInput label="Rate Basis (OT)" value={form.rate_basis_ot} onChange={v => set('rate_basis_ot', v)} keyboardType="numeric" />
                  <FieldInput label="Basis Absences" value={form.basis_absences} onChange={v => set('basis_absences', v)} />
                  <FieldInput label="Basis Overtime" value={form.basis_overtime} onChange={v => set('basis_overtime', v)} />
                  <View style={s.fieldWrap}>
                    <FieldLabel label="Strict No Overtime" />
                    <View style={s.switchRow}>
                      <Switch value={form.strict_no_overtime} onValueChange={v => set('strict_no_overtime', v)} trackColor={{ true: T.accentLight }} thumbColor="#fff" />
                      <Text style={s.switchLabel}>{form.strict_no_overtime ? 'Yes' : 'No'}</Text>
                    </View>
                  </View>

                  <View style={s.modalActions}>
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setDetailOpen(false)}>
                      <Text style={s.cancelBtnText}>Close</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={save} disabled={saving}>
                      <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Shared small component ────────────────────────────────────────────────────
function MetaBadge({ icon, text }) {
  return (
    <View style={s.metaBadge}>
      <Ionicons name={icon} size={11} color={T.textSub} />
      <Text style={s.metaBadgeText}>{text}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: T.bg },
  header:        { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 8 },
  headerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, marginBottom: 14 },
  backBtn:       { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 20, fontWeight: '900', color: '#fff' },
  headerSub:     { fontSize: 10, color: '#93c5fd' },
  tabsScroll:    { marginBottom: 12 },
  tabs:          { flexDirection: 'row', gap: 8, paddingRight: 4 },
  tabBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  tabBtnActive:  { backgroundColor: T.accentLight, borderColor: T.accentLight },
  tabText:       { fontSize: 12, fontWeight: '700', color: '#93c5fd' },
  tabTextActive: { color: '#fff' },

  body:         { padding: 14, gap: 10, paddingBottom: 48 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: T.textPrimary },
  sectionSub:   { fontSize: 12, color: T.textSub, marginBottom: 12 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.accentLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyText:    { textAlign: 'center', color: T.textMuted, fontSize: 13, paddingVertical: 24 },

  card:         { backgroundColor: T.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: T.border },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle:    { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  cardSub:      { fontSize: 11, color: T.textSub, marginTop: 2 },
  cardMeta:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  cardDays:     { fontSize: 11, color: T.textSub, marginBottom: 4 },
  metaBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.surfaceAlt, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  metaBadgeText:{ fontSize: 11, color: T.textSub },
  nightBadge:   { alignSelf: 'flex-start', backgroundColor: '#ede9fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  nightBadgeText:{ fontSize: 11, color: '#7c3aed', fontWeight: '700' },
  rowActions:   { flexDirection: 'row', gap: 6 },
  editBtn:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: T.accentLight },
  editBtnText:  { fontSize: 11, color: T.accentLight, fontWeight: '700' },
  delBtn:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: T.danger },
  delBtnText:   { fontSize: 11, color: T.danger, fontWeight: '700' },

  tplPreview:     { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 12, marginBottom: 4 },
  tplPreviewTitle:{ fontSize: 13, fontWeight: '800', color: T.accent, marginBottom: 3 },
  tplPreviewText: { fontSize: 12, color: T.textSub, lineHeight: 18 },

  filterRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },
  filterBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.surface, borderRadius: 10, borderWidth: 1, borderColor: T.border, paddingHorizontal: 10, paddingVertical: 8 },
  filterBtnText:{ fontSize: 12, color: T.textSub, maxWidth: 80 },
  searchGoBtn:  { backgroundColor: T.accentLight, borderRadius: 10, padding: 9, alignItems: 'center', justifyContent: 'center' },

  bulkToolbar:  { flexDirection: 'row', gap: 8, marginBottom: 4 },
  outlineBtn:   { flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  outlineBtnText:{ fontSize: 13, color: T.textSub, fontWeight: '600' },

  empCard:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: T.border },
  empCardSelected: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  checkbox:        { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive:  { backgroundColor: T.accentLight, borderColor: T.accentLight },
  empAvatar:       { width: 38, height: 38, borderRadius: 11, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  empAvatarText:   { color: T.accentLight, fontSize: 14, fontWeight: '900' },
  empInfo:         { flex: 1 },
  empName:         { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  empMeta:         { fontSize: 11, color: T.textSub },
  statusPill:      { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillGreen:       { backgroundColor: '#f0fdf4' },
  pillGray:        { backgroundColor: T.surfaceAlt },
  statusText:      { fontSize: 10, fontWeight: '800' },

  dayRow:       { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  dayBtn:       { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  dayBtnActive: { backgroundColor: T.accentLight, borderColor: T.accentLight },
  dayBtnText:   { fontSize: 11, fontWeight: '700', color: T.textSub },
  dayBtnTextActive: { color: '#fff' },

  switchRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  switchLabel:  { fontSize: 13, color: T.textSub },

  fieldWrap:       { marginBottom: 12 },
  fieldLabel:      { fontSize: 11, fontWeight: '700', color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  fieldInput:      { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: T.textPrimary },
  fieldPickerBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  fieldPickerText: { fontSize: 13, color: T.textPrimary, flex: 1 },

  formSection:  { fontSize: 10, fontWeight: '700', color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },

  modalBg:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: T.border },
  modalHandle:   { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:    { fontSize: 16, fontWeight: '800', color: T.textPrimary, marginBottom: 16 },
  modalActions:  { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 8 },
  modalEmpRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  modalAvatar:   { width: 44, height: 44, borderRadius: 14, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  modalAvatarText:{ color: '#fff', fontSize: 17, fontWeight: '900' },
  modalEmpName:  { fontSize: 16, fontWeight: '800', color: T.textPrimary },
  modalEmpMeta:  { fontSize: 12, color: T.textSub },

  pickerTitle:      { fontSize: 14, fontWeight: '800', color: T.textPrimary, marginBottom: 12 },
  pickerOpt:        { paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: T.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerOptActive:  { backgroundColor: '#eff6ff' },
  pickerOptText:    { fontSize: 14, color: T.textPrimary },
  pickerOptTextActive: { color: T.accentLight, fontWeight: '700' },

  cancelBtn:      { flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText:  { fontSize: 14, color: T.textSub, fontWeight: '600' },
  saveBtn:        { flex: 1, backgroundColor: T.accentLight, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnDisabled:{ opacity: 0.45 },
  saveBtnText:    { fontSize: 14, color: '#fff', fontWeight: '700' },

  toast:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  toastOk:    { backgroundColor: T.successBg, borderColor: '#bbf7d0' },
  toastErr:   { backgroundColor: T.dangerBg,  borderColor: '#fecaca' },
  toastText:  { fontSize: 13, fontWeight: '600', flex: 1 },

  savedBackdrop:   { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  savedDialog:     { width: '100%', maxWidth: 320, backgroundColor: T.surface, borderRadius: 18, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  savedIconWrap:   { width: 68, height: 68, borderRadius: 34, backgroundColor: T.successBg, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  savedTitle:      { fontSize: 18, fontWeight: '900', color: T.textPrimary, marginBottom: 6 },
  savedMessage:    { fontSize: 13, color: T.textSub, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  savedButton:     { alignSelf: 'stretch', backgroundColor: T.success, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  savedButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
