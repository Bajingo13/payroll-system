import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';

function timeAgo(value) {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_COLORS = {
  leave:    { bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6' },
  overtime: { bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  payroll:  { bg: '#fefce8', border: '#fde68a', dot: '#f59e0b' },
  system:   { bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8' },
};

function typeStyle(type) {
  return TYPE_COLORS[String(type || '').toLowerCase()] || TYPE_COLORS.system;
}

function getTabForType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('leave'))                        return 'Leave';
  if (t.includes('overtime') || t.includes('ot')) return 'Overtime';
  if (t.includes('payroll') || t.includes('pay') || t.includes('salary')) return 'Payroll';
  if (t.includes('attendance'))                   return 'Attendance';
  return null;
}

export default function NotificationsScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [markingRead, setMarkingRead] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (!user?.user_id) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/notifications', { params: { user_id: user.user_id } });
      setNotifications(data.notifications || []);
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load notifications.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.user_id]);

  useEffect(() => { load(); }, [load]);

  async function markAllRead() {
    if (!user?.user_id || markingRead) return;
    setMarkingRead(true);
    try {
      await api.patch('/notifications/read-all', { user_id: user.user_id });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (_) {}
    setMarkingRead(false);
  }

  function handleTap(item) {
    // Mark as read instantly in UI, fire API in background
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => n.notification_id === item.notification_id ? { ...n, is_read: 1 } : n)
      );
      api.patch(`/notifications/${item.notification_id}/read`, { user_id: user.user_id }).catch(() => {});
    }
    // Navigate to the related feature tab
    const tab = getTabForType(item.type);
    if (tab) {
      // Go back to Main first, then switch to the right tab
      navigation.navigate('Main', { screen: tab });
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function renderItem({ item }) {
    const ts = typeStyle(item.type);
    const navigable = Boolean(getTabForType(item.type));
    return (
      <TouchableOpacity
        style={[s.item, { backgroundColor: ts.bg, borderColor: ts.border }, !item.is_read && s.itemUnread]}
        onPress={() => handleTap(item)}
        activeOpacity={0.65}
      >
        <View style={[s.dot, { backgroundColor: ts.dot }]} />
        <View style={s.itemBody}>
          <View style={s.itemHeader}>
            <Text style={[s.itemTitle, !item.is_read && s.itemTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={s.itemTime}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={s.itemMsg}>{item.message}</Text>
          {navigable && (
            <Text style={s.itemNav}>Tap to view →</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity style={s.markBtn} onPress={markAllRead} disabled={markingRead}>
            <Text style={s.markBtnText}>{markingRead ? '…' : 'Mark all read'}</Text>
          </TouchableOpacity>
        ) : <View style={s.backBtn} />}
      </View>

      {loading ? (
        <ActivityIndicator color="#1e40af" style={{ marginTop: 48 }} />
      ) : error ? (
        <Text style={s.error}>{error}</Text>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.notification_id)}
          renderItem={renderItem}
          contentContainerStyle={notifications.length === 0 ? s.emptyContainer : s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1e40af" />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🔔</Text>
              <Text style={s.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: { width: 38, alignItems: 'center' },
  backText: { fontSize: 26, color: '#475569', fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  markBtn: { paddingHorizontal: 6 },
  markBtnText: { fontSize: 12, fontWeight: '700', color: '#1e40af' },
  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flexGrow: 1 },
  item: {
    flexDirection: 'row', gap: 10, padding: 12,
    borderRadius: 12, borderWidth: 1,
  },
  itemUnread: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  itemBody: { flex: 1, gap: 4 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  itemTitleUnread: { color: '#0f172a', fontWeight: '800' },
  itemMsg: { fontSize: 12, color: '#64748b', lineHeight: 18 },
  itemTime: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  itemNav: { fontSize: 11, color: '#1e40af', fontWeight: '700', marginTop: 4 },
  error: { color: '#b91c1c', textAlign: 'center', marginTop: 32, fontSize: 13 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#94a3b8', fontWeight: '600' },
});
