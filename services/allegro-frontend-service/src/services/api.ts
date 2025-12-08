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
  // In Vite, use import.meta.env for environment variables (must be prefixed with VITE_)
  const apiGatewayPort = import.meta.env.VITE_API_GATEWAY_PORT || 
    import.meta.env.API_GATEWAY_PORT || 
    '3411';
  return `http://localhost:${apiGatewayPort}/api`;
};

const API_URL = getApiUrl();

// Log API configuration (production logging)
console.log('[API Config]', {
  API_URL,
  origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
  env: {
    VITE_API_URL: import.meta.env.VITE_API_URL || 'not set',
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
  },
  timestamp: new Date().toISOString(),
});

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
    // Log request details for debugging (production logging)
    const fullUrl = config.baseURL && config.url 
      ? `${config.baseURL}${config.url.startsWith('/') ? '' : '/'}${config.url}`
      : config.url || 'unknown';
    
    console.log('[API Request]', {
      method: config.method?.toUpperCase() || 'UNKNOWN',
      baseURL: config.baseURL,
      url: config.url,
      fullUrl: fullUrl,
      hasToken: !!localStorage.getItem('accessToken'),
      timestamp: new Date().toISOString(),
    });
    
    // Ensure URL is properly constructed
    if (config.url && !config.url.startsWith('http')) {
      // If baseURL ends with /api and url starts with /, ensure proper combination
      if (config.baseURL && config.baseURL.endsWith('/api') && config.url.startsWith('/')) {
        // Axios will handle this correctly, but ensure no double slashes
        config.url = config.url.replace(/^\/+/, '/');
      }
    }
    
    const token = localStorage.getItem('accessToken');
    if (token) {
      // Validate token format before using it
      if (!isValidJWT(token)) {
        console.warn('[API] Invalid token format detected, clearing storage');
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
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Extended AxiosError interface for connection errors
interface ConnectionAxiosError extends AxiosError {
  serviceErrorMessage?: string;
  isConnectionError?: boolean;
  code?: string;
}

// Track if we're currently refreshing to prevent infinite loops
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    // Log successful responses (production logging)
    console.log('[API Response]', {
      method: response.config.method?.toUpperCase() || 'UNKNOWN',
      url: response.config.url,
      baseURL: response.config.baseURL,
      status: response.status,
      statusText: response.statusText,
      timestamp: new Date().toISOString(),
    });
    return response;
  },
  async (error: AxiosError) => {
    const connectionError = error as ConnectionAxiosError;
    
    // Log error details (production logging)
    console.error('[API Error]', {
      method: error.config?.method?.toUpperCase() || 'UNKNOWN',
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      fullUrl: error.config?.baseURL && error.config?.url 
        ? `${error.config.baseURL}${error.config.url.startsWith('/') ? '' : '/'}${error.config.url}`
        : error.config?.url || 'unknown',
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      code: connectionError.code,
      responseData: error.response?.data,
      timestamp: new Date().toISOString(),
    });
    
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
      
      // Skip refresh if this is already a refresh token request or auth endpoint
      const isAuthRequest = originalRequest.url?.includes('/auth/') || originalRequest.url?.includes('/login');
      if (isAuthRequest) {
        // Don't try to refresh on auth endpoints, just redirect
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(connectionError);
      }
      
      // Try to refresh token if this is not a retry and we have a refreshToken
      if (!originalRequest._retry && !isRefreshing) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          originalRequest._retry = true;
          
          // If we're already refreshing, wait for that promise
          if (isRefreshing && refreshPromise) {
            try {
              const newToken = await refreshPromise;
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              return api(originalRequest);
            } catch {
              // Refresh failed, fall through to redirect
            }
          } else {
            // Start a new refresh
            isRefreshing = true;
            refreshPromise = (async () => {
              try {
                const response = await authService.refreshToken(refreshToken);
                if (response && response.accessToken) {
                  localStorage.setItem('accessToken', response.accessToken);
                  localStorage.setItem('refreshToken', response.refreshToken);
                  if (response.user) {
                    localStorage.setItem('user', JSON.stringify(response.user));
                  }
                  return response.accessToken;
                }
                throw new Error('Invalid refresh response');
              } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                // Clear storage and redirect to login
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');
                // Use setTimeout to prevent redirect loops
                setTimeout(() => {
                  window.location.href = '/login';
                }, 100);
                throw refreshError;
              } finally {
                isRefreshing = false;
                refreshPromise = null;
              }
            })();
            
            try {
              const newToken = await refreshPromise;
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              return api(originalRequest);
            } catch {
              // Refresh failed, return error to prevent retry
              return Promise.reject(connectionError);
            }
          }
        } else {
          // No refresh token, redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          setTimeout(() => {
            window.location.href = '/login';
          }, 100);
          return Promise.reject(connectionError);
        }
      } else if (originalRequest._retry) {
        // Already retried, token refresh must have failed
        // Don't redirect again, just reject
        return Promise.reject(connectionError);
      }
    }
    
    return Promise.reject(connectionError);
  }
);

// Helper functions
function getServiceNameFromUrl(url: string): string {
  // In Vite, use import.meta.env for environment variables (must be prefixed with VITE_)
  const apiGatewayPort = import.meta.env.VITE_API_GATEWAY_PORT || 
    import.meta.env.API_GATEWAY_PORT || 
    '3411';
  const allegroServicePort = import.meta.env.VITE_ALLEGRO_SERVICE_PORT || 
    import.meta.env.ALLEGRO_SERVICE_PORT || 
    '3403';
  const importServicePort = import.meta.env.VITE_IMPORT_SERVICE_PORT || 
    import.meta.env.IMPORT_SERVICE_PORT || 
    '3406';
  const settingsServicePort = import.meta.env.VITE_ALLEGRO_SETTINGS_SERVICE_PORT || 
    import.meta.env.ALLEGRO_SETTINGS_SERVICE_PORT || 
    '3408';
  
  if (url.includes(`:${apiGatewayPort}`)) return 'API Gateway';
  if (url.includes(`:${allegroServicePort}`)) return 'Allegro Service';
  if (url.includes(`:${importServicePort}`)) return 'Import Service';
  if (url.includes(`:${settingsServicePort}`)) return 'Settings Service';
  return 'Unknown Service';
}

function getPortFromUrl(url: string): number {
  const match = url.match(/:(\d+)/);
  const apiGatewayPort = import.meta.env.VITE_API_GATEWAY_PORT || 
    import.meta.env.API_GATEWAY_PORT || 
    '3411';
  return match ? parseInt(match[1], 10) : parseInt(apiGatewayPort, 10);
}

// OAuth methods
export const oauthApi = {
  /**
   * Get OAuth authorization status
   */
  getStatus: async () => {
    return api.get('/allegro/oauth/status');
  },

  /**
   * Get authorization URL
   */
  authorize: async () => {
    return api.get('/allegro/oauth/authorize');
  },

  /**
   * Revoke OAuth authorization
   */
  revoke: async () => {
    return api.post('/allegro/oauth/revoke');
  },
};

export default api;

