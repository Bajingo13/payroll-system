import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,                 setUser]                 = useState(null);
  const [loading,              setLoading]              = useState(true);
  const [justLoggedIn,         setJustLoggedIn]         = useState(false);
  const [justLoggedOut,        setJustLoggedOut]        = useState(false);
  const [needsPasswordChange,  setNeedsPasswordChange]  = useState(false);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const pairs = await AsyncStorage.multiGet(['user_id', 'session_cookie']);
        if (!pairs[0][1] || !pairs[1][1]) throw new Error('No saved session');
        const { data } = await api.get('/session');
        if (!data?.success || !data.user) throw new Error('Session expired');
        if (active) {
          setUser({
            user_id: String(data.user.user_id),
            full_name: data.user.full_name || '',
            role: data.user.role || '',
          });
        }
      } catch (_) {
        await AsyncStorage.multiRemove(['user_id', 'full_name', 'role', 'session_cookie']);
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  // Step 1 — authenticate + persist, but do NOT navigate yet
  async function persistUser(data) {
    const nextUser = {
      user_id: String(data.user_id),
      full_name: data.full_name || '',
      role: data.role || '',
      isTempPassword: Boolean(data.isTempPassword),
    };
    await AsyncStorage.multiSet([
      ['user_id', nextUser.user_id],
      ['full_name', nextUser.full_name],
      ['role', nextUser.role],
    ]);
    return nextUser;
  }

  async function login(username, password) {
    const { data } = await api.post('/login', { username, password });
    if (!data.success) throw new Error(data.message || 'Invalid username or password.');
    if (data.requiresOtp) return data;
    return persistUser(data);
  }

  async function finishLogin(data) {
    if (!data?.success) throw new Error(data?.message || 'Login was not completed.');
    return persistUser(data);
  }

  // Step 2 — set user state (triggers navigation to Main)
  const commitLogin = useCallback((nextUser) => {
    setUser(nextUser);
    setJustLoggedIn(true);
    if (nextUser.isTempPassword) setNeedsPasswordChange(true);
  }, []);

  const clearNeedsPasswordChange = useCallback(() => setNeedsPasswordChange(false), []);

  const logout = useCallback(async () => {
    try { await api.post('/logout'); } catch (_) {}
    await AsyncStorage.multiRemove(['user_id', 'full_name', 'role', 'session_cookie']);
    setJustLoggedOut(true);
    setNeedsPasswordChange(false);
    setUser(null);
  }, []);

  const clearLoginFlag  = useCallback(() => setJustLoggedIn(false),  []);
  const clearLogoutFlag = useCallback(() => setJustLoggedOut(false), []);

  const value = useMemo(
    () => ({ user, loading, login, finishLogin, commitLogin, logout, justLoggedIn, justLoggedOut, needsPasswordChange, clearNeedsPasswordChange, clearLoginFlag, clearLogoutFlag }),
    [user, loading, commitLogin, logout, justLoggedIn, justLoggedOut, needsPasswordChange, clearNeedsPasswordChange, clearLoginFlag, clearLogoutFlag]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
