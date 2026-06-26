import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import AppIcon from './AppIcon.jsx';

const TYPE_META = {
  holiday:          { icon: 'calendar', label: 'Holiday',          route: '/leave-calendar' },
  leave_request:    { icon: 'clipboard', label: 'Leave Request',   route: '/leave-management' },
  overtime_request: { icon: 'time', label: 'Overtime Request',     route: '/overtime-management' },
  leave_status:     { icon: 'check', label: 'Leave Update',        route: '/employee-leave-request' },
  overtime_status:  { icon: 'check', label: 'Overtime Update',     route: '/employee-overtime-request' },
  evaluation:       { icon: 'chartUp', label: 'Evaluation',        route: '/personal-management' },
  account_unlock:   { icon: 'lock', label: 'Unlock Request',       route: '/user-settings' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const { data } = await api.get('/notifications', { params: { user_id: user.user_id } });
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch {
      // silent
    }
  }, [user?.user_id]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 2000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function resolveRoute(notif) {
    if (TYPE_META[notif.type]?.route) return TYPE_META[notif.type].route;
    // Fallback for existing 'system' notifications by title
    if (notif.title?.toLowerCase().includes('unlock')) return '/user-settings';
    return null;
  }

  async function handleNotifClick(notif) {
    if (!notif.is_read) {
      try {
        await api.patch(`/notifications/${notif.notification_id}/read`, { user_id: user.user_id });
        setNotifications((prev) =>
          prev.map((n) => (n.notification_id === notif.notification_id ? { ...n, is_read: 1 } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // silent
      }
    }
    setOpen(false);
    const route = resolveRoute(notif);
    if (route) navigate(route);
  }

  async function markAllRead() {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      await api.patch('/notifications/read-all', { user_id: user.user_id });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button type="button" className="notif-bell-btn" onClick={() => setOpen((prev) => !prev)} aria-label="Notifications">
        <AppIcon name="bell" size={20} />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notif-mark-all-btn" onClick={markAllRead} disabled={loading}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-panel-body">
            {notifications.length === 0 ? (
              <p className="notif-empty">No notifications yet.</p>
            ) : (
              notifications.map((n) => {
                const meta = TYPE_META[n.type] || { icon: 'bell', label: n.type, route: null };
                const clickable = !!resolveRoute(n);
                return (
                  <div
                    key={n.notification_id}
                    className={`notif-item${n.is_read ? '' : ' notif-item-unread'}${clickable ? ' notif-item-clickable' : ''}`}
                    onClick={() => handleNotifClick(n)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleNotifClick(n); }}
                  >
                    <span className="notif-item-icon"><AppIcon name={meta.icon} size={16} /></span>
                    <div className="notif-item-body">
                      <strong className="notif-item-title">{n.title}</strong>
                      <p className="notif-item-msg">{n.message}</p>
                      <span className="notif-item-time">{timeAgo(n.created_at)}</span>
                    </div>
                    {!n.is_read && <span className="notif-unread-dot" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
