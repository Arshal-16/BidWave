import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Role } from '../types';
import { authApi } from '../api/auth';
import { setAuthTokenHandlers } from '../api/client';

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role?: Role) => Promise<void>;
  logout: () => Promise<void>;
  loginAsDemo: (role: Role) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getAccessToken = useCallback(() => accessToken, [accessToken]);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await authApi.refresh();
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      return res.data.accessToken;
    } catch {
      setAccessToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    setAuthTokenHandlers(getAccessToken, refreshAccessToken);
  }, [getAccessToken, refreshAccessToken]);

  // Initial session restoration on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const res = await authApi.refresh();
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
      } catch {
        // Not logged in or expired session
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  };

  const register = async (email: string, password: string, role: Role = 'BIDDER') => {
    const res = await authApi.register(email, password, role);
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  const loginAsDemo = async (role: Role) => {
    if (role === 'SELLER') {
      await login('seller@bidwave.com', 'Password123!');
    } else if (role === 'ADMIN') {
      await login('admin@bidwave.com', 'Password123!');
    } else {
      await login('bidder1@bidwave.com', 'Password123!');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        register,
        logout,
        loginAsDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
