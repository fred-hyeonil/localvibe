import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { googleLogout } from '@react-oauth/google';

const AuthContext = createContext(null);

function readUser() {
  try {
    const raw = localStorage.getItem('lv_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(readUser);

  useEffect(() => {
    const sync = () => setCurrentUser(readUser());
    window.addEventListener('lv-auth-changed', sync);
    return () => window.removeEventListener('lv-auth-changed', sync);
  }, []);

  const logout = useCallback(() => {
    googleLogout();
    localStorage.removeItem('lv_access_token');
    localStorage.removeItem('lv_user');
    window.dispatchEvent(new Event('lv-auth-changed'));
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
