import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [justLoggedIn,  setJustLoggedIn]  = useState(false);
  const [justLoggedOut, setJustLoggedOut] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['user_id', 'full_name', 'role'])
      .then((pairs) => {
        const userId = pairs[0][1];
        if (userId) {
          setUser({
            user_id: userId,
            full_name: pairs[1][1] || '',
            role: pairs[2][1] || '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Step 1 — authenticate + persist, but do NOT navigate yet
  async function login(username, password) {
    const { data } = await api.post('/login', { username, password });
    if (!data.success) throw new Error(data.message || 'Invalid username or password.');
    const nextUser = {
      user_id: String(data.user_id),
      full_name: data.full_name || '',
      role: data.role || '',
    };
    await AsyncStorage.multiSet([
      ['user_id', nextUser.user_id],
      ['full_name', nextUser.full_name],
      ['role', nextUser.role],
    ]);
    return nextUser;
  }

  // Step 2 — set user state (triggers navigation to Main)
  const commitLogin = useCallback((nextUser) => {
    setUser(nextUser);
    setJustLoggedIn(true);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/logout'); } catch (_) {}
    await AsyncStorage.multiRemove(['user_id', 'full_name', 'role', 'session_cookie']);
    setJustLoggedOut(true);
    setUser(null);
  }, []);

  const clearLoginFlag  = useCallback(() => setJustLoggedIn(false),  []);
  const clearLogoutFlag = useCallback(() => setJustLoggedOut(false), []);

  const value = useMemo(
    () => ({ user, loading, login, commitLogin, logout, justLoggedIn, justLoggedOut, clearLoginFlag, clearLogoutFlag }),
    [user, loading, commitLogin, logout, justLoggedIn, justLoggedOut, clearLoginFlag, clearLogoutFlag]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
