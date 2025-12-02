/**
 * API Client
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { isConnectionError, getConnectionErrorMessage } from '../utils/serviceErrorHandler';
import { authService } from './auth';

// Determine API URL:
// 1. Use VITE_API_URL if set during build (production)
// 2. Auto-detect from current origin (if on production domain)
// 3. Fallback to localhost for development
const getApiUrl = (): string => {
  // If VITE_API_URL is set during build, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Auto-detect production URL from current origin
  const origin = window.location.origin;
  if (origin.includes('allegro.statex.cz') || origin.includes('statex.cz')) {
    return `${origin}/api`;
  }
  
  // Development fallback
  return 'http://localhost:3411/api';
};

const API_URL = getApiUrl();

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to validate JWT token format
function isValidJWT(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    // Basic validation - JWT should have 3 parts separated by dots
    return parts.every(part => part.length > 0);
  } catch {
    return false;
  }
}

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      // Validate token format before using it
      if (!isValidJWT(token)) {
        console.warn('Invalid token format detected, clearing storage');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        // Don't redirect here, let the 401 handler do it
      } else if (config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Extended AxiosError interface for connection errors
interface ConnectionAxiosError extends AxiosError {
  serviceErrorMessage?: string;
  isConnectionError?: boolean;
  code?: string;
}

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const connectionError = error as ConnectionAxiosError;
    
    // Handle connection errors with helpful messages
    if (isConnectionError(error)) {
      const url = error.config?.url || error.config?.baseURL || API_URL;
      const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
      const helpfulMessage = getConnectionErrorMessage(error, fullUrl);
      
      // Log to console with service information
      console.error('🔴 Service Connection Error:', {
        service: getServiceNameFromUrl(fullUrl),
        port: getPortFromUrl(fullUrl),
        url: fullUrl,
        error: error.message,
        code: connectionError.code,
      });
      
      // Attach helpful message to error for components to display
      connectionError.serviceErrorMessage = helpfulMessage;
      connectionError.isConnectionError = true;
    }
    
    if (error.response?.status === 401) {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
      
      // Try to refresh token if this is not a retry and we have a refreshToken
      if (!originalRequest._retry) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          originalRequest._retry = true;
          try {
            const response = await authService.refreshToken(refreshToken);
            if (response && response.accessToken) {
              localStorage.setItem('accessToken', response.accessToken);
              localStorage.setItem('refreshToken', response.refreshToken);
              if (response.user) {
                localStorage.setItem('user', JSON.stringify(response.user));
              }
              
              // Retry the original request with new token
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${response.accessToken}`;
              }
              return api(originalRequest);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            // Fall through to clear storage and redirect
          }
        }
      }
      
      // Token expired or invalid, clear storage and redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    return Promise.reject(connectionError);
  }
);

// Helper functions
function getServiceNameFromUrl(url: string): string {
  if (url.includes(':3411')) return 'API Gateway';
  if (url.includes(':3402')) return 'Product Service';
  if (url.includes(':3403')) return 'Allegro Service';
  if (url.includes(':3404')) return 'Sync Service';
  if (url.includes(':3405')) return 'Webhook Service';
  if (url.includes(':3406')) return 'Import Service';
  if (url.includes(':3407')) return 'Scheduler Service';
  if (url.includes(':3408')) return 'Settings Service';
  return 'Unknown Service';
}

function getPortFromUrl(url: string): number {
  const match = url.match(/:(\d+)/);
  return match ? parseInt(match[1], 10) : 3411;
}

export default api;

