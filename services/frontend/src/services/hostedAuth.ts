const AUTH_WEB_BASE_URL = import.meta.env.VITE_AUTH_WEB_URL || 'https://auth.alfares.cz';
const AUTH_CLIENT_ID = import.meta.env.VITE_AUTH_CLIENT_ID || 'allegro-service';
const AUTH_CALLBACK_PATH = '/auth/callback';

export const HOSTED_AUTH_STATE_KEY = 'allegroHostedAuthState';
export const HOSTED_AUTH_RETURN_KEY = 'allegroHostedAuthReturnTo';

type HostedAuthMode = 'login' | 'register';

const safeReturnPath = (value: string | null): string => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  if (value.startsWith('/auth/callback') || value.startsWith('/login') || value.startsWith('/register')) {
    return '/dashboard';
  }

  return value;
};

const createState = (): string => {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const startHostedAuth = (mode: HostedAuthMode, returnTo?: string | null): void => {
  const state = createState();
  const targetPath = safeReturnPath(returnTo || '/dashboard');

  localStorage.setItem(HOSTED_AUTH_STATE_KEY, state);
  localStorage.setItem(HOSTED_AUTH_RETURN_KEY, targetPath);

  const authUrl = new URL(`/${mode}`, AUTH_WEB_BASE_URL);
  authUrl.searchParams.set('client_id', AUTH_CLIENT_ID);
  authUrl.searchParams.set('return_url', `${window.location.origin}${AUTH_CALLBACK_PATH}`);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('lang', 'cz');

  window.location.assign(authUrl.toString());
};

export const consumeHostedAuthReturnTo = (): string => {
  const returnTo = safeReturnPath(localStorage.getItem(HOSTED_AUTH_RETURN_KEY));
  localStorage.removeItem(HOSTED_AUTH_RETURN_KEY);
  return returnTo;
};

export const clearHostedAuthState = (): void => {
  localStorage.removeItem(HOSTED_AUTH_STATE_KEY);
  localStorage.removeItem(HOSTED_AUTH_RETURN_KEY);
};
