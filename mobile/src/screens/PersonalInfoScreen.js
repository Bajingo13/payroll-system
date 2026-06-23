import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ReadOnlyRow({ label, value }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value || '—'}</Text>
    </View>
  );
}

function EditRow({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }) {
  return (
    <View style={s.editRow}>
      <Text style={s.editLabel}>{label}</Text>
      <TextInput
        style={s.editInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'words'}
      />
    </View>
  );
}

export default function PersonalInfoScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [toast, setToast] = useState('');
  const [discardModal, setDiscardModal] = useState(false);
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  useEffect(() => { load(); }, []);

  async function load() {
    if (!user?.user_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/employee_profile_edit_legacy', {
        params: { user_id: user.user_id },
      });
      setProfile(data.profile);
      setForm({
        personal: { ...data.profile.personal },
        government_ids: { ...data.profile.government_ids },
        employment: { ...data.profile.employment },
      });
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load profile.'));
    } finally {
      setLoading(false);
    }
  }

  function set(section, field, value) {
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  }

  async function save() {
    if (!profile || !form) return;
    if (!form.personal?.first_name?.trim()) { setError('First name is required.'); return; }
    if (!form.personal?.last_name?.trim())  { setError('Last name is required.');  return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/employee_profile_edit_legacy', {
        user_id: user.user_id,
        employee_id: profile.employee_id,
        personal: form.personal,
        government_ids: form.government_ids,
        employment: form.employment,
      });
      if (!data.success) throw new Error(data.message || 'Save failed.');
      setProfile((prev) => ({
        ...prev,
        personal: { ...prev.personal, ...form.personal },
        government_ids: { ...prev.government_ids, ...form.government_ids },
        employment: { ...prev.employment, ...form.employment },
      }));
      setEditing(false);
      showToast('Your information has been updated successfully.');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to save.'));
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() { setDiscardModal(true); }

  function performDiscard() {
    setForm({
      personal: { ...profile.personal },
      government_ids: { ...profile.government_ids },
      employment: { ...profile.employment },
    });
    setEditing(false);
    setError('');
    setDiscardModal(false);
  }

  const p = editing ? form.personal : (profile?.personal || {});
  const gov = editing ? form.government_ids : (profile?.government_ids || {});
  const emp = editing ? form.employment : (profile?.employment || {});

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>Personal Information</Text>
        {!editing ? (
          <TouchableOpacity style={s.editBtn} onPress={() => setEditing(true)}>
            <Text style={s.editBtnText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.editBtn} onPress={cancelEdit}>
            <Text style={[s.editBtnText, { color: '#64748b' }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {editing && (
        <View style={s.editingBanner}>
          <Ionicons name="create" size={13} color="#d97706" />
          <Text style={s.editingBannerText}>Editing mode — unsaved changes will be lost if you leave</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#1e40af" style={{ marginTop: 48 }} />
      ) : error && !profile ? (
        <View style={s.errorWrap}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {error ? <Text style={s.inlineError}>{error}</Text> : null}

          {/* Personal Details */}
          <Section title="Personal Details">
            {editing ? (
              <>
                <EditRow label="First Name" value={p.first_name} onChangeText={(v) => set('personal', 'first_name', v)} />
                <EditRow label="Last Name" value={p.last_name} onChangeText={(v) => set('personal', 'last_name', v)} />
                <EditRow label="Middle Name" value={p.middle_name} onChangeText={(v) => set('personal', 'middle_name', v)} />
                <EditRow label="Nickname" value={p.nickname} onChangeText={(v) => set('personal', 'nickname', v)} />
                <EditRow label="Gender" value={p.gender} onChangeText={(v) => set('personal', 'gender', v)} />
                <EditRow label="Civil Status" value={p.civil_status} onChangeText={(v) => set('personal', 'civil_status', v)} />
                <EditRow label="Birthdate" value={p.birth_date} onChangeText={(v) => set('personal', 'birth_date', v)} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </>
            ) : (
              <>
                <ReadOnlyRow label="First Name" value={p.first_name} />
                <ReadOnlyRow label="Last Name" value={p.last_name} />
                <ReadOnlyRow label="Middle Name" value={p.middle_name} />
                <ReadOnlyRow label="Nickname" value={p.nickname} />
                <ReadOnlyRow label="Gender" value={p.gender} />
                <ReadOnlyRow label="Civil Status" value={p.civil_status} />
                <ReadOnlyRow label="Birthdate" value={p.birth_date} />
              </>
            )}
          </Section>

          {/* Contact Information */}
          <Section title="Contact Information">
            {editing ? (
              <>
                <EditRow label="Mobile No." value={p.mobile_no} onChangeText={(v) => set('personal', 'mobile_no', v)} keyboardType="phone-pad" autoCapitalize="none" />
                <EditRow label="Email" value={p.email} onChangeText={(v) => set('personal', 'email', v)} keyboardType="email-address" autoCapitalize="none" />
              </>
            ) : (
              <>
                <ReadOnlyRow label="Mobile No." value={p.mobile_no} />
                <ReadOnlyRow label="Email" value={p.email} />
              </>
            )}
          </Section>

          {/* Address */}
          <Section title="Address">
            {editing ? (
              <>
                <EditRow label="Street" value={p.street} onChangeText={(v) => set('personal', 'street', v)} />
                <EditRow label="City" value={p.city} onChangeText={(v) => set('personal', 'city', v)} />
                <EditRow label="Country" value={p.country} onChangeText={(v) => set('personal', 'country', v)} />
                <EditRow label="ZIP Code" value={p.zip_code} onChangeText={(v) => set('personal', 'zip_code', v)} keyboardType="numeric" autoCapitalize="none" />
              </>
            ) : (
              <>
                <ReadOnlyRow label="Street" value={p.street} />
                <ReadOnlyRow label="City" value={p.city} />
                <ReadOnlyRow label="Country" value={p.country} />
                <ReadOnlyRow label="ZIP Code" value={p.zip_code} />
              </>
            )}
          </Section>

          {/* Employment */}
          <Section title="Employment">
            {editing ? (
              <>
                <EditRow label="Department" value={emp.department} onChangeText={(v) => set('employment', 'department', v)} />
                <EditRow label="Designation" value={emp.designation} onChangeText={(v) => set('employment', 'designation', v)} />
                <EditRow label="Date Hired" value={emp.date_hired} onChangeText={(v) => set('employment', 'date_hired', v)} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                <EditRow label="Status" value={emp.status} onChangeText={(v) => set('employment', 'status', v)} />
              </>
            ) : (
              <>
                <ReadOnlyRow label="Department" value={emp.department} />
                <ReadOnlyRow label="Designation" value={emp.designation} />
                <ReadOnlyRow label="Date Hired" value={emp.date_hired} />
                <ReadOnlyRow label="Status" value={emp.status} />
              </>
            )}
          </Section>

          {/* Government IDs */}
          <Section title="Government IDs">
            {editing ? (
              <>
                <EditRow label="SSS No." value={gov.sss_no} onChangeText={(v) => set('government_ids', 'sss_no', v)} keyboardType="numeric" autoCapitalize="none" />
                <EditRow label="PhilHealth No." value={gov.philhealth_no} onChangeText={(v) => set('government_ids', 'philhealth_no', v)} keyboardType="numeric" autoCapitalize="none" />
                <EditRow label="Pag-IBIG No." value={gov.pagibig_no} onChangeText={(v) => set('government_ids', 'pagibig_no', v)} keyboardType="numeric" autoCapitalize="none" />
                <EditRow label="TIN No." value={gov.tin_no} onChangeText={(v) => set('government_ids', 'tin_no', v)} keyboardType="numeric" autoCapitalize="none" />
              </>
            ) : (
              <>
                <ReadOnlyRow label="SSS No." value={gov.sss_no} />
                <ReadOnlyRow label="PhilHealth No." value={gov.philhealth_no} />
                <ReadOnlyRow label="Pag-IBIG No." value={gov.pagibig_no} />
                <ReadOnlyRow label="TIN No." value={gov.tin_no} />
              </>
            )}
          </Section>

          {editing && (
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={discardModal} transparent animationType="fade" onRequestClose={() => setDiscardModal(false)}>
        <Pressable style={s.warnBackdrop} onPress={() => setDiscardModal(false)}>
          <Pressable style={s.warnDialog} onPress={() => {}}>
            <View style={s.warnIconWrap}>
              <Ionicons name="alert-circle-outline" size={28} color="#d97706" />
            </View>
            <Text style={s.warnTitle}>Discard Changes</Text>
            <Text style={s.warnMsg}>Your unsaved changes will be lost. Are you sure you want to discard them?</Text>
            <View style={s.warnActions}>
              <TouchableOpacity style={s.warnKeepBtn} onPress={() => setDiscardModal(false)}>
                <Text style={s.warnKeepText}>Keep Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.warnDiscardBtn} onPress={performDiscard}>
                <Text style={s.warnDiscardText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { width: 38, alignItems: 'center' },
  backText: { fontSize: 26, color: '#475569', fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  editBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editBtnText: { fontSize: 14, fontWeight: '700', color: '#1e40af' },
  content: { padding: 16, gap: 16 },
  section: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  rowLabel: { fontSize: 13, color: '#475569', fontWeight: '500', flex: 1 },
  rowValue: { fontSize: 13, color: '#0f172a', fontWeight: '600', flex: 1.2, textAlign: 'right' },
  editRow: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  editLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  editInput: {
    fontSize: 14, color: '#0f172a', fontWeight: '500',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    paddingVertical: 6, paddingHorizontal: 2,
  },
  saveBtn: {
    backgroundColor: '#1e40af', borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { color: '#b91c1c', textAlign: 'center', fontSize: 14, marginBottom: 16 },
  retryBtn: { backgroundColor: '#1e40af', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  inlineError: { color: '#b91c1c', fontSize: 13, textAlign: 'center', marginBottom: 4 },

  // Editing banner
  editingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: '#fde68a',
  },
  editingBannerText: { fontSize: 12, color: '#d97706', fontWeight: '600', flex: 1 },

  toast: { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },
  warnBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  warnDialog:      { backgroundColor: '#fff', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  warnIconWrap:    { width: 60, height: 60, borderRadius: 20, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  warnTitle:       { fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 10 },
  warnMsg:         { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  warnActions:     { flexDirection: 'row', gap: 12, width: '100%' },
  warnKeepBtn:     { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  warnKeepText:    { fontSize: 14, fontWeight: '700', color: '#64748b' },
  warnDiscardBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#dc2626', alignItems: 'center' },
  warnDiscardText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
