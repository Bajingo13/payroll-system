import axios from 'axios';

function resolveApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (typeof window !== 'undefined') {
    const browserHost = window.location.hostname;
    const isDesktopLocal = browserHost === 'localhost' || browserHost === '127.0.0.1';
    // 10.0.2.2 is only meaningful inside an Android emulator. A desktop
    // browser must use the same localhost origin instead.
    if (isDesktopLocal && /^https?:\/\/10\.0\.2\.2(?::\d+)?\/api\/?$/i.test(configured)) return '/api';
  }
  return configured || '/api';
}

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const userId = sessionStorage.getItem('user_id');
  if (userId) {
    config.headers = config.headers || {};
    config.headers['x-user-id'] = userId;
  }
  return config;
});

export function getApiMessage(error, fallback = 'Request failed.') {
  return error?.response?.data?.message || error?.message || fallback;
}

export function getAssetUrl(path, cacheBust = false) {
  if (!path) return '';
  const text = String(path);
  if (/^(https?:|data:|blob:)/i.test(text)) return cacheBust ? `${text}${text.includes('?') ? '&' : '?'}t=${Date.now()}` : text;

  const apiBase = String(resolveApiBaseUrl()).replace(/\/api\/?$/, '');
  const url = `${apiBase}${text.startsWith('/') ? text : `/${text}`}`;
  if (!cacheBust) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
}
