import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
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

  const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/api\/?$/, '');
  const url = `${apiBase}${text.startsWith('/') ? text : `/${text}`}`;
  if (!cacheBust) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
}
