import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getApiMessage } from '../api/client';

function normalizeRole(raw) {
  const role = String(raw || '').trim().toLowerCase();
  if (role === 'employee') return 'employee';
  if (role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role.includes('admin')) return 'admin';
  return 'unknown';
}

export default function LoginScreen() {
  const { login, logout } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError('Please enter username and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      const role = normalizeRole(user.role);
      if (role === 'admin') {
        await logout();
        setError('Admin accounts are not allowed on the mobile app. Please use the web system instead.');
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(getApiMessage(err, 'Invalid username or password.'));
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.logoCircle}>
            <Text style={s.logoText}>A</Text>
          </View>
          <Text style={s.brand}>Astreablue</Text>
          <Text style={s.tagline}>Intelligence Inc.</Text>
          <Text style={s.sub}>HRIS & Payroll Mobile</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Sign In</Text>
          <Text style={s.cardSub}>Enter your credentials to continue</Text>

          <TextInput
            style={s.input}
            placeholder="Username"
            placeholderTextColor="#94a3b8"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={s.passwordRow}>
            <TextInput
              style={[s.input, s.passwordInput]}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={s.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text style={s.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>
          Astreablue Intelligence Inc. © {new Date().getFullYear()}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1e40af' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: { fontSize: 36, fontWeight: '800', color: '#fff' },
  brand: { fontSize: 30, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 14, color: '#bfdbfe', marginTop: 2 },
  sub: { fontSize: 12, color: '#93c5fd', marginTop: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#64748b', marginBottom: 22 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#1e293b',
    marginBottom: 12,
    backgroundColor: '#f8fafc',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  passwordInput: { flex: 1, marginBottom: 0, marginRight: 8 },
  eyeBtn: { padding: 10 },
  eyeIcon: { fontSize: 20 },
  error: { color: '#b91c1c', fontSize: 13, marginBottom: 12 },
  btn: {
    backgroundColor: '#1e40af',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#93c5fd', fontSize: 11, marginTop: 24 },
});
