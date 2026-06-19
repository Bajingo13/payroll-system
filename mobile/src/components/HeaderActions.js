import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { api, getAssetUrl } from '../api/client';
import { API_BASE_URL } from '../config';

const SOCKET_URL = API_BASE_URL.replace('/api', '');

export default function HeaderActions({ navigation, photoUrl: photoUrlProp, employee: employeeProp }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState(getAssetUrl(photoUrlProp, true));
  const [resolvedEmployee, setResolvedEmployee] = useState(employeeProp || {});
  const socketRef = useRef(null);

  async function fetchProfileSummary() {
    if (!user?.user_id) return;
    try {
      const { data } = await api.get('/employee_dashboard', { params: { user_id: user.user_id } });
      setResolvedPhotoUrl(getAssetUrl(data.profilePhotoUrl, true));
      if (data.employee) setResolvedEmployee(data.employee);
    } catch (_) {}
  }

  useEffect(() => {
    setResolvedPhotoUrl(getAssetUrl(photoUrlProp, true));
    if (employeeProp) setResolvedEmployee(employeeProp);
  }, [photoUrlProp, employeeProp]);

  useEffect(() => { fetchProfileSummary(); }, [user?.user_id]);

  useEffect(() => {
    if (!user?.user_id) return;

    // ── Initial fetch ─────────────────────────────────────
    const fetchCount = () => {
      api.get('/notifications', { params: { user_id: user.user_id } })
        .then(({ data }) => setUnreadCount(Number(data.unread_count || 0)))
        .catch(() => {});
    };
    fetchCount();

    // ── Socket.io real-time updates ───────────────────────
    const socket = io(SOCKET_URL, {
      query: { user_id: user.user_id },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('notification_count', (count) => {
      setUnreadCount(Number(count || 0));
    });

    // ── Refresh on screen focus ───────────────────────────
    const unsub = navigation?.addListener('focus', () => {
      fetchCount();
      fetchProfileSummary();
    });

    return () => {
      socket.disconnect();
      unsub?.();
    };
  }, [user?.user_id]);

  const initials = String(resolvedEmployee?.first_name || user?.full_name || 'U')[0].toUpperCase();

  return (
    <View style={s.row}>
      {/* Notification bell */}
      <TouchableOpacity style={s.btn} onPress={() => {
        setUnreadCount(0); // optimistic reset on open
        navigation.navigate('Notifications');
      }}>
        <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.85)" />
        {unreadCount > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Avatar → Settings */}
      <TouchableOpacity
        style={s.avatar}
        onPress={() => navigation.navigate('Settings', { employee: resolvedEmployee, profilePhotoUrl: resolvedPhotoUrl })}
      >
        {resolvedPhotoUrl
          ? <Image source={{ uri: resolvedPhotoUrl }} style={s.avatarImg} />
          : <Text style={s.avatarText}>{initials}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#ef4444', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarImg: { width: 38, height: 38, borderRadius: 19 },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
