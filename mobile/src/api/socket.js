import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export async function createAuthenticatedSocket(userId, options = {}) {
  const cookie = await AsyncStorage.getItem('session_cookie');
  if (!cookie) throw new Error('No authenticated session is available.');

  return io(SOCKET_URL, {
    query: { user_id: userId },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    extraHeaders: { Cookie: cookie },
    ...options,
  });
}
