import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('dentalflow_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('dentalflow_token') || null);
  const [selectedPractice, setSelectedPractice] = useState(() => {
    try {
      const stored = localStorage.getItem('dentalflow_practice');
      return stored ? JSON.parse(stored) : { id: 1, name: 'DentalFlow – Downtown' };
    } catch {
      return { id: 1, name: 'DentalFlow – Downtown' };
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      setToken(null);
      localStorage.removeItem('dentalflow_token');
      localStorage.removeItem('dentalflow_user');
    };
    window.addEventListener('dentalflow_auth_expired', handleAuthExpired);
    return () => window.removeEventListener('dentalflow_auth_expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    async function verifyAuth() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.getMe();
        setUser(me);
        localStorage.setItem('dentalflow_user', JSON.stringify(me));
      } catch (err) {
        console.warn('Session check failed:', err);
        setUser(null);
        setToken(null);
        localStorage.removeItem('dentalflow_token');
        localStorage.removeItem('dentalflow_user');
      } finally {
        setLoading(false);
      }
    }
    verifyAuth();
  }, [token]);

  const login = async (username, password) => {
    const res = await api.login({ username, password });
    localStorage.setItem('dentalflow_token', res.token);
    localStorage.setItem('dentalflow_user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('dentalflow_token');
    localStorage.removeItem('dentalflow_user');
    setToken(null);
    setUser(null);
  };

  const changePractice = (practice) => {
    setSelectedPractice(practice);
    localStorage.setItem('dentalflow_practice', JSON.stringify(practice));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role,
        isStaff: user?.role === 'staff',
        isPatient: user?.role === 'patient',
        loading,
        login,
        logout,
        selectedPractice,
        setSelectedPractice: changePractice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
