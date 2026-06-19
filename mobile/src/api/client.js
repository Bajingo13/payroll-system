import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

const ASSET_BASE_URL = API_BASE_URL.replace('/api', '');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const pairs = await AsyncStorage.multiGet(['user_id', 'session_cookie']);
  const userId = pairs[0][1];
  const cookie = pairs[1][1];
  if (userId) config.headers['x-user-id'] = userId;
  if (cookie) config.headers['Cookie'] = cookie;
  return config;
});

api.interceptors.response.use(
  async (response) => {
    const raw = response.headers?.['set-cookie'];
    if (raw) {
      const list = Array.isArray(raw) ? raw : [raw];
      const cookieStr = list.map((c) => c.split(';')[0]).join('; ');
      await AsyncStorage.setItem('session_cookie', cookieStr);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

export function getApiMessage(error, fallback = 'Request failed.') {
  return error?.response?.data?.message || error?.message || fallback;
}

export function getAssetUrl(path, cacheBust = false) {
  if (!path) return null;
  const text = String(path);
  const baseUrl = text.startsWith('http') ? text : `${ASSET_BASE_URL}${text.startsWith('/') ? text : `/${text}`}`;
  if (!cacheBust) return baseUrl;
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
}
