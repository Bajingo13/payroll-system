import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
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
