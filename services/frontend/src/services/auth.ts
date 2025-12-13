/**
 * Authentication Service
 */

import api from './api';

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string | number;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  async register(data: RegisterData): Promise<AuthResponse> {
    console.log('[Auth Service] register called', { email: data.email });
    const response = await api.post('/auth/register', data);
    console.log('[Auth Service] register success', { status: response.status });
    return response.data;
  },

  async login(data: LoginData): Promise<AuthResponse> {
    console.log('[Auth Service] login called', { email: data.email, passwordPresent: !!data.password });
    console.log('[Auth Service] login payload', JSON.stringify(data));
    const baseURL = api.defaults.baseURL || '';
    console.log('[Auth Service] login - API instance:', {
      baseURL: baseURL,
      url: '/auth/login',
      expectedFullUrl: `${baseURL}/auth/login`,
    });
    const response = await api.post('/auth/login', data);
    console.log('[Auth Service] login success', { status: response.status });
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    console.log('[Auth Service] refreshToken called');
    const response = await api.post('/auth/refresh', { refreshToken });
    console.log('[Auth Service] refreshToken success', { status: response.status });
    return response.data;
  },

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('accessToken');
  },

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  },
};

