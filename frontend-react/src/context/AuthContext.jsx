import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearStoredUser = useCallback(() => {
    sessionStorage.removeItem('user_id');
    sessionStorage.removeItem('admin_name');
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('employee_id');
  }, []);

  useEffect(() => {
    let active = true;
    api.get('/session')
      .then(({ data }) => {
        if (active && data?.success && data.user) setAuthUser(data.user);
      })
      .catch(() => {
        if (active) {
          clearStoredUser();
          setUser(null);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clearStoredUser]);

  async function login(username, password) {
    const { data } = await api.post('/login', { username, password });
    if (!data.success) {
      throw new Error(data.message || 'Invalid username or password.');
    }

    const nextUser = {
      user_id: String(data.user_id),
      full_name: data.full_name || '',
      role: data.role || ''
    };

    sessionStorage.setItem('user_id', nextUser.user_id);
    sessionStorage.setItem('admin_name', nextUser.full_name);
    sessionStorage.setItem('role', nextUser.role);
    setUser(nextUser);
    return nextUser;
  }

  function setAuthUser(userData) {
    const nextUser = {
      user_id: String(userData.user_id),
      full_name: userData.full_name || '',
      role: userData.role || ''
    };
    sessionStorage.setItem('user_id', nextUser.user_id);
    sessionStorage.setItem('admin_name', nextUser.full_name);
    sessionStorage.setItem('role', nextUser.role);
    setUser(nextUser);
    return nextUser;
  }

  const logout = useCallback(async () => {
    clearStoredUser();
    setUser(null);
    try {
      await api.post('/logout');
    } catch (err) {
      console.warn('Logout request failed:', err);
    }
  }, [clearStoredUser]);

  const value = useMemo(() => ({ user, loading, login, logout, setAuthUser }), [loading, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
