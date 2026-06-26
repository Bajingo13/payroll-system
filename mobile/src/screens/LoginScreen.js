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
const OTP_EXPIRY_MINUTES = 5;

function normalizeRole(raw) {
  const role = String(raw || '').trim().toLowerCase();
  if (role === 'employee') return 'employee';
  if (role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role.includes('admin')) return 'admin';
  return 'unknown';
}

export default function LoginScreen() {
  const { login, finishLogin, commitLogin, logout, justLoggedOut, clearLogoutFlag } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('credentials');
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [otpUserId, setOtpUserId] = useState(null);
  const [otp, setOtp] = useState('');
  const [otpInfo, setOtpInfo] = useState({ maskedEmail: null, maskedPhone: null });
  const [otpAttemptsLeft, setOtpAttemptsLeft] = useState(null);
  const [resending, setResending] = useState(false);
  const [isTempPw, setIsTempPw] = useState(false);
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

  async function completeMobileLogin(user) {
    if (normalizeRole(user.role) === 'admin') {
      await logout();
      setError('Admin accounts are not supported on the mobile app. Please use the web system. Only HR and Employee accounts can log in here.');
      return;
    }

    const tempPw = Boolean(user.isTempPassword);
    setToast(tempPw ? 'Logged in with temporary password. Please change it now.' : 'Logged in successfully!');
    loginTimerRef.current = setTimeout(() => commitLogin(user), 500);
  }

  async function handleLogin() {
    if (!username.trim() || !password) { setError('Please enter your username and password.'); return; }
    setError('');
    setAttemptsLeft(null);
    setLoading(true);
    try {
      const result = await login(username.trim(), password);

      if (result.requiresOtp) {
        setOtpUserId(result.userId);
        setOtpInfo({ maskedEmail: result.maskedEmail, maskedPhone: result.maskedPhone });
        setIsTempPw(Boolean(result.isTempPassword));
        setOtp('');
        setOtpAttemptsLeft(null);
        setStep('otp');
        setToast(result.message || 'Verification code sent.');
        setTimeout(() => setToast(''), 2500);
        setLoading(false);
        return;
      }

      await completeMobileLogin(result);
    } catch (err) {
      const resp = err?.response?.data;
      setError(getApiMessage(err, 'Invalid username or password.'));
      if (resp?.attemptsLeft !== undefined) setAttemptsLeft(resp.attemptsLeft);
    }
    setLoading(false);
  }

  async function handleOtpVerify() {
    if (otp.length < 6) { setError('Please enter the complete 6-digit verification code.'); return; }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/login/verify-otp', { userId: otpUserId, otp });
      const user = await finishLogin(data);
      await completeMobileLogin({ ...user, isTempPassword: isTempPw || Boolean(data.isTempPassword) });
    } catch (err) {
      const resp = err?.response?.data;
      setError(getApiMessage(err, 'Incorrect verification code.'));
      if (resp?.attemptsLeft !== undefined) setOtpAttemptsLeft(resp.attemptsLeft);
      if (resp?.expired) {
        setStep('credentials');
        setOtp('');
        setOtpUserId(null);
        setError('');
        setToast('Verification expired. Please log in again.');
        setTimeout(() => setToast(''), 2500);
      }
    }
    setLoading(false);
  }

  async function handleResendOtp() {
    if (resending || !otpUserId) return;
    setError('');
    setResending(true);
    try {
      const { data } = await api.post('/login/resend-otp', { userId: otpUserId });
      setOtp('');
      setOtpAttemptsLeft(null);
      setToast(data.message || 'New verification code sent.');
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setError(getApiMessage(err, 'Could not resend verification code.'));
    }
    setResending(false);
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
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Light background */}
        <LinearGradient
          colors={['#f4f8ff', '#eef4fd', '#e8f0fc']}
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

            <Text style={s.title}>Welcome back</Text>
            <Text style={s.subtitle}>Sign in to continue to HRIS</Text>

            {step === 'credentials' ? (
              <>
                <View style={s.fieldWrap}>
                  <Text style={s.label}>Username</Text>
                  <View style={[s.field, uFocus && s.fieldOn]}>
                    <View style={[s.iconBox, uFocus && s.iconBoxOn]}>
                      <Ionicons name="person" size={15} color={uFocus ? '#fff' : '#94a3b8'} />
                    </View>
                    <TextInput
                      style={s.input}
                      placeholder="Enter your username"
                      placeholderTextColor="#94a3b8"
                      value={username}
                      onChangeText={v => { setUsername(v); setError(''); setAttemptsLeft(null); }}
                      autoCapitalize="none" autoCorrect={false}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      onFocus={() => setUFocus(true)}
                      onBlur={() => setUFocus(false)}
                    />
                  </View>
                </View>

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
                      placeholderTextColor="#94a3b8"
                      value={password}
                      onChangeText={v => { setPassword(v); setError(''); setAttemptsLeft(null); }}
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

                {attemptsLeft !== null ? (
                  <View style={s.warnBox}>
                    <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                    <Text style={s.warnText}>{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before this account is locked.</Text>
                  </View>
                ) : null}

                {error ? (
                  <View style={s.errBox}>
                    <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
                    <Text style={s.errText}>{error}</Text>
                  </View>
                ) : null}

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

                <TouchableOpacity onPress={openResetModal} style={s.forgotBtn}>
                  <Text style={s.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={s.verifyHeader}>
                  <View style={s.verifyIcon}>
                    <Ionicons name="shield-checkmark-outline" size={24} color="#3b82f6" />
                  </View>
                  <Text style={s.verifyTitle}>Verification Required</Text>
                  <Text style={s.verifyCopy}>
                    Enter the 6-digit code sent to {[otpInfo.maskedEmail, otpInfo.maskedPhone].filter(Boolean).join(' and ')}.
                    {'\n'}Expires in {OTP_EXPIRY_MINUTES} minutes.
                  </Text>
                </View>

                <View style={s.fieldWrap}>
                  <Text style={s.label}>Verification Code</Text>
                  <View style={s.field}>
                    <View style={s.iconBox}>
                      <Ionicons name="keypad-outline" size={15} color="#94a3b8" />
                    </View>
                    <TextInput
                      style={[s.input, s.otpInput]}
                      placeholder="000000"
                      placeholderTextColor="#94a3b8"
                      value={otp}
                      onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={handleOtpVerify}
                    />
                  </View>
                </View>

                {otpAttemptsLeft !== null ? (
                  <View style={s.warnBox}>
                    <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                    <Text style={s.warnText}>{otpAttemptsLeft} verification attempt{otpAttemptsLeft !== 1 ? 's' : ''} remaining.</Text>
                  </View>
                ) : null}

                {error ? (
                  <View style={s.errBox}>
                    <Ionicons name="alert-circle-outline" size={14} color="#b91c1c" />
                    <Text style={s.errText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity onPress={handleOtpVerify} disabled={loading || otp.length < 6} activeOpacity={0.87} style={s.btnWrap}>
                  <LinearGradient
                    colors={(loading || otp.length < 6) ? ['#94a3b8', '#94a3b8'] : ['#1d4ed8', '#3b82f6']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.btn}
                  >
                    {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Verify Code</Text>}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={s.verifyActions}>
                  <TouchableOpacity onPress={() => { setStep('credentials'); setOtp(''); setError(''); setOtpAttemptsLeft(null); }}>
                    <Text style={s.forgotText}>Back to login</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleResendOtp} disabled={resending}>
                    <Text style={[s.forgotText, resending && s.disabledLink]}>{resending ? 'Sending...' : 'Resend code'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

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

  // Decorative circles — soft blue tints on light bg
  circle1: {
    position: 'absolute', width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(17,110,219,0.07)', top: -100, right: -80,
  },
  circle2: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(93,77,184,0.06)', top: 180, left: -70,
  },
  circle3: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(14,165,233,0.07)', top: 90, left: SW * 0.6,
  },

  // Hero
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 32, gap: 10 },
  logo: { width: 240, height: 78 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    backgroundColor: 'rgba(17,110,219,0.1)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(17,110,219,0.18)',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  pillText: { color: '#1460b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // White card
  card: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 28, paddingTop: 10, paddingBottom: 40,
    flex: 1,
    borderWidth: 1, borderColor: 'rgba(17,110,219,0.1)', borderBottomWidth: 0,
    shadowColor: '#1155cc', shadowOpacity: 0.12, shadowRadius: 24, elevation: 12,
  },
  accentLine: { height: 3, width: 60, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 28 },

  // Fields
  fieldWrap: { marginBottom: 18 },
  label: {
    fontSize: 12, fontWeight: '700', color: '#475569',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e2e8f0', height: 56,
  },
  fieldOn: {
    borderColor: '#3b82f6', backgroundColor: '#ffffff',
    shadowColor: '#3b82f6', shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10, margin: 10,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  iconBoxOn: { backgroundColor: '#3b82f6' },
  input: { flex: 1, fontSize: 15, color: '#0f172a', fontWeight: '500' },
  eye: { padding: 14 },

  toast: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#16a34a', fontWeight: '700', fontSize: 13 },

  // Error / warning
  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderRadius: 12,
    borderWidth: 1, borderColor: '#fecaca',
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 18,
  },
  errText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  warnBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fffbeb', borderRadius: 12,
    borderWidth: 1, borderColor: '#fde68a',
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 18,
  },
  warnText: { color: '#92400e', fontSize: 13, flex: 1 },
  verifyHeader: { alignItems: 'center', marginBottom: 22 },
  verifyIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 12,
  },
  verifyTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900', marginBottom: 8 },
  verifyCopy: { color: '#64748b', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  otpInput: { textAlign: 'center', letterSpacing: 8, fontSize: 18, fontWeight: '900' },
  verifyActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: -10, marginBottom: 20,
  },
  disabledLink: { color: '#94a3b8' },

  // Button
  btnWrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 28, marginTop: 4 },
  btn: {
    height: 58, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  btnArrow: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center',
  },

  // Forgot password link
  forgotBtn: { alignSelf: 'center', marginBottom: 20, marginTop: -10 },
  forgotText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },

  // Footer
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  footerText: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },

  // Forgot password modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalKAV: { width: '90%', maxWidth: 380 },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: 'rgba(17,110,219,0.12)',
    shadowColor: '#1155cc', shadowOpacity: 0.15, shadowRadius: 24, elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  modalClose: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },
  modalIntro: { fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 19 },
  successBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  successText: { color: '#15803d' },
  cancelBtn: { alignSelf: 'center', marginTop: 10 },
  cancelText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
});
