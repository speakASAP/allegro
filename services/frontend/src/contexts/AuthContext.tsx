/**
 * Auth Context Provider
 */

import React, { useState, useEffect, ReactNode } from 'react';
import { authService, AuthResponse } from '../services/auth';
import { AuthContext, User } from './authContextDefinition';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user', error);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response: AuthResponse = await authService.login({ email, password });
    if (response && response.accessToken && response.user) {
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser({
        id: String(response.user.id),
        email: response.user.email,
        firstName: response.user.firstName || undefined,
        lastName: response.user.lastName || undefined,
      });
    }
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    // Only include optional fields if they have values to avoid validation errors
    const registerData: { email: string; password: string; firstName?: string; lastName?: string } = { email, password };
    if (firstName && firstName.trim()) {
      registerData.firstName = firstName.trim();
    }
    if (lastName && lastName.trim()) {
      registerData.lastName = lastName.trim();
    }
    
    const response: AuthResponse = await authService.register(registerData);
    if (response && response.accessToken && response.user) {
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser({
        id: String(response.user.id),
        email: response.user.email,
        firstName: response.user.firstName || undefined,
        lastName: response.user.lastName || undefined,
      });
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

