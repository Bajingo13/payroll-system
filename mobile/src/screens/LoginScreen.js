import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

const { width: SW } = Dimensions.get('window');

function normalizeRole(raw) {
  const role = String(raw || '').trim().toLowerCase();
  if (role === 'employee') return 'employee';
  if (role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role.includes('admin')) return 'admin';
  return 'unknown';
}

export default function LoginScreen() {
  const { login, commitLogin, logout, justLoggedOut, clearLogoutFlag } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uFocus, setUFocus] = useState(false);
  const [pFocus, setPFocus] = useState(false);

  const passwordRef    = useRef(null);
  const loginTimerRef  = useRef(null);
  const [toast, setToast] = useState('');

  useEffect(() => () => { if (loginTimerRef.current) clearTimeout(loginTimerRef.current); }, []);

  useEffect(() => {
    if (justLoggedOut) {
      setToast('You have been logged out successfully.');
      setTimeout(() => setToast(''), 2500);
      clearLogoutFlag();
    }
  }, [justLoggedOut]);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password) { setError('Please enter your username and password.'); return; }
    setError(''); setLoading(true);
    try {
      const user = await login(username.trim(), password);
      if (normalizeRole(user.role) === 'admin') {
        await logout();
        setError('Admin accounts are not supported on the mobile app. Please use the web system. Only HR and Employee accounts can log in here.');
        setLoading(false);
        return;
      }
      // Show toast then navigate
      setToast('Logged in successfully!');
      setLoading(false);
      loginTimerRef.current = setTimeout(() => commitLogin(user), 1200);
    } catch (err) {
      setError(getApiMessage(err, 'Invalid username or password.'));
      setLoading(false);
    }
  }

  async function handlePasswordResetRequest() {
    if (!resetUsername.trim()) {
      setResetMessage('Please enter your username.');
      setResetSuccess(false);
      return;
    }
    setResetMessage('');
    setResetLoading(true);
    try {
      const { data } = await api.post('/password-reset/request', { username: resetUsername.trim() });
      setResetMessage(data.message || 'Password reset instructions will be sent to the email linked to that username.');
      setResetSuccess(true);
      setResetUsername('');
    } catch (err) {
      setResetMessage(getApiMessage(err, 'Unable to request password reset.'));
      setResetSuccess(false);
    } finally {
      setResetLoading(false);
    }
  }

  function openResetModal() {
    setResetOpen(true);
    setResetMessage('');
    setResetUsername('');
    setResetSuccess(false);
  }

  function closeResetModal() {
    setResetOpen(false);
    setResetMessage('');
    setResetUsername('');
    setResetSuccess(false);
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Mid-tone blue gradient */}
        <LinearGradient
          colors={['#0f2044', '#163370', '#1a4090']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Soft decorative circles */}
        <View style={s.circle1} />
        <View style={s.circle2} />
        <View style={s.circle3} />

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Hero / Logo ── */}
          <View style={s.hero}>
            <Image
              source={require('../../assets/astreablue-logo.png')}
              style={s.logo}
              resizeMode="contain"
            />
            <View style={s.pill}>
              <View style={s.pillDot} />
              <Text style={s.pillText}>HRIS Mobile</Text>
            </View>
          </View>

          {/* ── White Card ── */}
          <View style={s.card}>
            {/* Top accent line */}
            <LinearGradient
              colors={['transparent', '#3b82f6', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.accentLine}
            />

            <Text style={s.title}>Welcome back 👋</Text>
            <Text style={s.subtitle}>Sign in to continue to HRIS</Text>

            {/* Username */}
            <View style={s.fieldWrap}>
              <Text style={s.label}>Username</Text>
              <View style={[s.field, uFocus && s.fieldOn]}>
                <View style={[s.iconBox, uFocus && s.iconBoxOn]}>
                  <Ionicons name="person" size={15} color={uFocus ? '#fff' : '#94a3b8'} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Enter your username"
                  placeholderTextColor="#cbd5e1"
                  value={username}
                  onChangeText={v => { setUsername(v); setError(''); }}
                  autoCapitalize="none" autoCorrect={false}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  onFocus={() => setUFocus(true)}
                  onBlur={() => setUFocus(false)}
                />
              </View>
            </View>

            {/* Password */}
            <View style={s.fieldWrap}>
              <Text style={s.label}>Password</Text>
              <View style={[s.field, pFocus && s.fieldOn]}>
                <View style={[s.iconBox, pFocus && s.iconBoxOn]}>
                  <Ionicons name="lock-closed" size={15} color={pFocus ? '#fff' : '#94a3b8'} />
                </View>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, { flex: 1 }]}
                  placeholder="Enter your password"
                  placeholderTextColor="#cbd5e1"
                  value={password}
                  onChangeText={v => { setPassword(v); setError(''); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onFocus={() => setPFocus(true)}
                  onBlur={() => setPFocus(false)}
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={s.eye}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Error */}
            {error ? (
              <View style={s.errBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
                <Text style={s.errText}>{error}</Text>
              </View>
            ) : null}

            {/* Sign In button */}
            <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.87} style={s.btnWrap}>
              <LinearGradient
                colors={loading ? ['#94a3b8', '#94a3b8'] : ['#1d4ed8', '#3b82f6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.btn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={s.btnText}>Sign In</Text>
                      <View style={s.btnArrow}>
                        <Ionicons name="arrow-forward" size={16} color="#1d4ed8" />
                      </View>
                    </>}
              </LinearGradient>
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity onPress={openResetModal} style={s.forgotBtn}>
              <Text style={s.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Footer */}
            <View style={s.footerRow}>
              <View style={s.footerLine} />
              <Text style={s.footerText}>Astreablue Intelligence Inc. © {new Date().getFullYear()}</Text>
              <View style={s.footerLine} />
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Forgot Password Modal */}
      <Modal
        visible={resetOpen}
        transparent
        animationType="fade"
        onRequestClose={closeResetModal}
      >
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalKAV}>
            <View style={s.modalCard}>
              <LinearGradient
                colors={['transparent', '#3b82f6', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.accentLine}
              />

              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Reset Password</Text>
                <TouchableOpacity onPress={closeResetModal} style={s.modalClose} accessibilityLabel="Close">
                  <Ionicons name="close" size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <Text style={s.modalIntro}>
                Enter your username and we will send reset instructions to the email linked to your account.
              </Text>

              <Text style={s.label}>Username</Text>
              <View style={s.field}>
                <View style={s.iconBox}>
                  <Ionicons name="person" size={15} color="#94a3b8" />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Enter your username"
                  placeholderTextColor="#cbd5e1"
                  value={resetUsername}
                  onChangeText={v => { setResetUsername(v); setResetMessage(''); setResetSuccess(false); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handlePasswordResetRequest}
                />
              </View>

              {resetMessage ? (
                <View style={[s.errBox, resetSuccess && s.successBox]}>
                  <Ionicons
                    name={resetSuccess ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                    size={14}
                    color={resetSuccess ? '#16a34a' : '#b91c1c'}
                  />
                  <Text style={[s.errText, resetSuccess && s.successText]}>{resetMessage}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={handlePasswordResetRequest}
                disabled={resetLoading}
                activeOpacity={0.87}
                style={s.btnWrap}
              >
                <LinearGradient
                  colors={resetLoading ? ['#94a3b8', '#94a3b8'] : ['#1d4ed8', '#3b82f6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.btn}
                >
                  {resetLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.btnText}>Send Reset Link</Text>}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={closeResetModal} style={s.cancelBtn}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 0 },

  // Decorative circles on blue bg
  circle1: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -80,
  },
  circle2: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)', top: 160, left: -60,
  },
  circle3: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)', top: 80, left: SW * 0.6,
  },

  // Hero
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 32, gap: 10 },
  logo: { width: 240, height: 78 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Mid-dark card
  card: {
    backgroundColor: '#122040',
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 28, paddingTop: 10, paddingBottom: 40,
    flex: 1,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderBottomWidth: 0,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, elevation: 18,
  },
  accentLine: { height: 3, width: 60, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '900', color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 28 },

  // Fields
  fieldWrap: { marginBottom: 18 },
  label: {
    fontSize: 12, fontWeight: '700', color: '#7ea8d4',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0d1a30', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1e3a5f', height: 56,
  },
  fieldOn: {
    borderColor: '#3b82f6', backgroundColor: '#0f2248',
    shadowColor: '#3b82f6', shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10, margin: 10,
    backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center',
  },
  iconBoxOn: { backgroundColor: '#3b82f6' },
  input: { flex: 1, fontSize: 15, color: '#e2e8f0', fontWeight: '500' },
  eye: { padding: 14 },

  toast: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },

  // Error
  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 18,
  },
  errText: { color: '#f87171', fontSize: 13, flex: 1 },

  // Button
  btnWrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 28, marginTop: 4 },
  btn: {
    height: 58, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  btnArrow: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },

  // Forgot password link
  forgotBtn: { alignSelf: 'center', marginBottom: 20, marginTop: -10 },
  forgotText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },

  // Footer
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerLine: { flex: 1, height: 1, backgroundColor: '#1e3a5f', opacity: 0.6 },
  footerText: { fontSize: 10, color: '#64748b', fontWeight: '500' },

  // Forgot password modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalKAV: { width: '90%', maxWidth: 380 },
  modalCard: {
    backgroundColor: '#122040',
    borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#f1f5f9' },
  modalClose: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center',
  },
  modalIntro: { fontSize: 13, color: '#94a3b8', marginBottom: 20, lineHeight: 19 },
  successBox: {
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderColor: 'rgba(22,163,74,0.25)',
  },
  successText: { color: '#4ade80' },
  cancelBtn: { alignSelf: 'center', marginTop: 10 },
  cancelText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
});
