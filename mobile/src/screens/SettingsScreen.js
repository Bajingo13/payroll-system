import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage, getAssetUrl } from '../api/client';
import { API_BASE_URL } from '../config';

const BASE_URL = API_BASE_URL.replace('/api', '');

function Row({ label, value }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value || '—'}</Text>
    </View>
  );
}

export default function SettingsScreen({ navigation, route }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const employee = route.params?.employee || {};
  const [photoUrl, setPhotoUrl] = useState(getAssetUrl(route.params?.profilePhotoUrl));
  const [uploading, setUploading] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [logoutSheet, setLogoutSheet] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });

  function confirmLogout() {
    setLogoutSheet(true);
  }

  function openPasswordModal() {
    setPwForm({ current: '', next: '', confirm: '' });
    setPwError('');
    setPwShow({ current: false, next: false, confirm: false });
    setPwModal(true);
  }

  async function savePassword() {
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      setPwError('All fields are required.'); return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError('New password and confirmation do not match.'); return;
    }
    if (pwForm.next.length < 8) {
      setPwError('New password must be at least 8 characters.'); return;
    }
    setPwSaving(true); setPwError('');
    try {
      const { data } = await api.put('/user/password', {
        user_id: user.user_id,
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
        confirmPassword: pwForm.confirm,
      });
      if (!data.success) throw new Error(data.message);
      setPwModal(false);
      Alert.alert('Password Changed', 'Your password has been updated successfully.');
    } catch (err) {
      setPwError(getApiMessage(err, 'Failed to change password.'));
    } finally {
      setPwSaving(false);
    }
  }

  async function pickAndUpload() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('user_id', String(user.user_id));
      formData.append('photo', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: `profile_${user.user_id}.jpg`,
      });
      const { data } = await api.post('/employee/profile-photo', formData, {
        headers: { 'Content-Type': undefined },
      });
      if (data.success) {
        setPhotoUrl(getAssetUrl(data.url, true));
      }
    } catch (err) {
      Alert.alert('Upload failed', getApiMessage(err, 'Could not upload photo.'));
    } finally {
      setUploading(false);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('user_id', String(user.user_id));
      formData.append('photo', {
        uri: asset.uri,
        type: 'image/jpeg',
        name: `profile_${user.user_id}.jpg`,
      });
      const { data } = await api.post('/employee/profile-photo', formData, {
        headers: { 'Content-Type': undefined },
      });
      if (data.success) {
        setPhotoUrl(getAssetUrl(data.url, true));
      }
    } catch (err) {
      Alert.alert('Upload failed', getApiMessage(err, 'Could not upload photo.'));
    } finally {
      setUploading(false);
    }
  }

  function showPhotoOptions() {
    setPhotoSheet(true);
  }

  const initials = String(employee.first_name || user?.full_name || 'U')[0].toUpperCase();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>Settings</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Avatar with upload */}
        <View style={s.avatarSection}>
          <TouchableOpacity style={s.avatarWrap} onPress={showPhotoOptions} disabled={uploading}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={s.avatarImg} />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={s.cameraOverlay}>
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="camera" size={16} color="#fff" />}
            </View>
          </TouchableOpacity>
          <Text style={s.avatarName}>{employee.full_name || user?.full_name || '—'}</Text>
          <Text style={s.avatarRole}>{employee.position || user?.role || '—'}</Text>
          <Text style={s.avatarHint}>Tap photo to change</Text>
        </View>

        {/* Account info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Account</Text>
          <Row label="Employee ID" value={employee.emp_code} />
          <Row label="Username" value={user?.username || employee.username} />
          <Row label="Department" value={employee.department} />
          <Row label="Position" value={employee.position} />
        </View>

        {/* App info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>App</Text>
          <Row label="Version" value="1.0.0" />
          <Row label="Role" value={user?.role} />
        </View>

        {/* Navigation links */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Profile</Text>
          <TouchableOpacity style={s.navRow} onPress={() => navigation.navigate('PersonalInfo')}>
            <View style={s.navRowLeft}>
              <Ionicons name="person-outline" size={20} color="#1e40af" />
              <Text style={s.navRowText}>Personal Information</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity style={s.navRow} onPress={openPasswordModal}>
            <View style={s.navRowLeft}>
              <Ionicons name="lock-closed-outline" size={20} color="#1e40af" />
              <Text style={s.navRowText}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={confirmLogout}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Logout confirmation modal */}
      <Modal
        visible={logoutSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutSheet(false)}
      >
        <Pressable style={s.dialogBackdrop} onPress={() => setLogoutSheet(false)}>
          <Pressable style={s.dialog} onPress={() => {}}>
            <View style={[s.dialogIconWrap, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="log-out-outline" size={28} color="#b91c1c" />
            </View>
            <Text style={s.dialogTitle}>Logout</Text>
            <Text style={s.dialogMsg}>Are you sure you want to logout from your account?</Text>
            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogCancel} onPress={() => setLogoutSheet(false)}>
                <Text style={s.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogConfirm} onPress={() => { setLogoutSheet(false); logout(); }}>
                <Text style={s.dialogConfirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Photo picker bottom sheet */}
      <Modal
        visible={photoSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoSheet(false)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setPhotoSheet(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Profile Photo</Text>
            <Text style={s.sheetSub}>Choose how to update your photo</Text>

            <TouchableOpacity
              style={s.sheetOption}
              onPress={() => { setPhotoSheet(false); setTimeout(takePhoto, 300); }}
            >
              <View style={[s.sheetIcon, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="camera" size={22} color="#1e40af" />
              </View>
              <View style={s.sheetOptionBody}>
                <Text style={s.sheetOptionTitle}>Take Photo</Text>
                <Text style={s.sheetOptionSub}>Use your camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.sheetOption}
              onPress={() => { setPhotoSheet(false); setTimeout(pickAndUpload, 300); }}
            >
              <View style={[s.sheetIcon, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="images" size={22} color="#16a34a" />
              </View>
              <View style={s.sheetOptionBody}>
                <Text style={s.sheetOptionTitle}>Choose from Library</Text>
                <Text style={s.sheetOptionSub}>Pick from your gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sheetOption, s.sheetCancel]}
              onPress={() => setPhotoSheet(false)}
            >
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change Password modal */}
      <Modal visible={pwModal} transparent animationType="fade" onRequestClose={() => setPwModal(false)}>
        <KeyboardAvoidingView style={s.dialogBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, width: '100%' }} onPress={() => setPwModal(false)}>
            <Pressable style={s.dialog} onPress={() => {}}>
              <View style={[s.dialogIconWrap, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="lock-closed-outline" size={28} color="#1e40af" />
              </View>
              <Text style={s.dialogTitle}>Change Password</Text>

              {['current', 'next', 'confirm'].map((field) => {
                const labels = { current: 'Current Password', next: 'New Password', confirm: 'Confirm New Password' };
                return (
                  <View key={field} style={s.pwInputWrap}>
                    <TextInput
                      style={s.pwInput}
                      placeholder={labels[field]}
                      placeholderTextColor="#94a3b8"
                      secureTextEntry={!pwShow[field]}
                      value={pwForm[field]}
                      onChangeText={(v) => setPwForm((f) => ({ ...f, [field]: v }))}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setPwShow((p) => ({ ...p, [field]: !p[field] }))}>
                      <Ionicons name={pwShow[field] ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {pwError ? <Text style={s.pwError}>{pwError}</Text> : null}

              <View style={s.dialogActions}>
                <TouchableOpacity style={s.dialogCancel} onPress={() => setPwModal(false)}>
                  <Text style={s.dialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dialogConfirm, { backgroundColor: '#1e40af' }]} onPress={savePassword} disabled={pwSaving}>
                  {pwSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.dialogConfirmText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatarWrap: { width: 90, height: 90, marginBottom: 12 },
  avatarImg: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#e2e8f0' },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#1e40af', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#f8fafc',
  },
  avatarName: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  avatarRole: { fontSize: 13, color: '#64748b', marginTop: 4 },
  avatarHint: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardTitle: {
    fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  rowLabel: { fontSize: 14, color: '#475569', fontWeight: '500', flex: 1 },
  rowValue: { fontSize: 14, color: '#0f172a', fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  navRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navRowText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  logoutBtn: {
    backgroundColor: '#fee2e2', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#fecaca',
  },
  logoutText: { color: '#b91c1c', fontWeight: '800', fontSize: 15 },

  // Logout dialog
  dialogBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  dialog: {
    backgroundColor: '#fff', borderRadius: 24,
    padding: 28, width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  dialogIconWrap: {
    width: 60, height: 60, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  dialogTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  dialogMsg: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  dialogActions: { flexDirection: 'row', gap: 12, width: '100%' },
  dialogCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#f1f5f9', alignItems: 'center',
  },
  dialogCancelText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  dialogConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#b91c1c', alignItems: 'center',
  },
  dialogConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Password modal
  pwInputWrap: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
    paddingHorizontal: 12, marginBottom: 10, backgroundColor: '#f8fafc',
  },
  pwInput: { flex: 1, fontSize: 14, color: '#0f172a', paddingVertical: 12, fontWeight: '500' },
  pwError: { color: '#b91c1c', fontSize: 12, textAlign: 'center', marginBottom: 8, width: '100%' },

  // Bottom sheet
  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  sheetSub: { fontSize: 13, color: '#94a3b8', marginBottom: 20 },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderRadius: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sheetIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetOptionBody: { flex: 1 },
  sheetOptionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sheetOptionSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  sheetCancel: {
    marginTop: 8, borderBottomWidth: 0,
    justifyContent: 'center', backgroundColor: '#f8fafc',
    borderRadius: 14,
  },
  sheetCancelText: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#64748b' },
});
