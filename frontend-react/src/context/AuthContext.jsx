import { createContext, useContext, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

function readStoredUser() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) return null;

  return {
    user_id: userId,
    full_name: sessionStorage.getItem('admin_name') || '',
    role: sessionStorage.getItem('role') || ''
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

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

  function logout() {
    sessionStorage.removeItem('user_id');
    sessionStorage.removeItem('admin_name');
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('employee_id');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
