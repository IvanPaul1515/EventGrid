import React, { createContext, useContext, useState, useEffect } from 'react';
import { FailureKind, failureKind } from '../utils/appError';
import { User, Role } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: FailureKind | null;
  retryAuth: () => void;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  hasRole: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [authError, setAuthError] = useState<FailureKind | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retryAuth = () => { setIsLoading(true); setAuthError(null); setAttempt(value => value + 1); };
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const expired = () => { setAuthError('401'); setToken(null); setUser(null); setIsLoading(false); };
    window.addEventListener('eventgrid:session-expired', expired);
    const initAuth = async () => {
      const storedToken = localStorage.getItem('barcamp_token');
      const storedUser = localStorage.getItem('barcamp_user');
      if (storedToken && storedUser) {
        try {
          JSON.parse(storedUser); // Reject malformed local state without trusting it as a session.
          const res = await api.get('/auth/me', { signal: controller.signal });
          if (active && res.data.data) {
            setToken(storedToken); setUser(res.data.data);
            localStorage.setItem('barcamp_user', JSON.stringify(res.data.data));
          }
        } catch (error: any) {
          if (!active) return;
          if (error instanceof SyntaxError) {
            localStorage.removeItem('barcamp_token'); localStorage.removeItem('barcamp_user');
          } else setAuthError(failureKind(error));
        }
      }
      if (active) setIsLoading(false);
    };
    initAuth();
    return () => { active = false; controller.abort(); window.removeEventListener('eventgrid:session-expired', expired); };
  }, [attempt]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('barcamp_token', newToken);
    localStorage.setItem('barcamp_user', JSON.stringify(newUser));
    setAuthError(null);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Continuar con limpieza local incluso si la llamada de red falla
    } finally {
      localStorage.removeItem('barcamp_token');
      localStorage.removeItem('barcamp_user');
      setToken(null);
      setUser(null);
      window.location.href = '/login';
    }
  };

  const hasRole = (roles: Role[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        authError,
        retryAuth,
        login,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
