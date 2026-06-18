import { Platform } from 'react-native';
import { api } from '../api/client';

let NotificationsModule = null;
let DeviceModule = null;

// Lazy-load to avoid crashing if module has issues
try {
  NotificationsModule = require('expo-notifications');
} catch (_) {}

try {
  DeviceModule = require('expo-device');
} catch (_) {}

// Configure foreground notification display (only if module loaded)
if (NotificationsModule) {
  try {
    NotificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (_) {}
}

export const Notifications = NotificationsModule;

export async function registerPushToken(userId) {
  if (!NotificationsModule || !DeviceModule) return null;

  try {
    if (!DeviceModule.isDevice) return null;

    const { status: existing } = await NotificationsModule.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await NotificationsModule.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await NotificationsModule.setNotificationChannelAsync('default', {
        name: 'Astreablue',
        importance: NotificationsModule.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1e40af',
        sound: true,
      });
    }

    const token = (await NotificationsModule.getExpoPushTokenAsync()).data;
    await api.post('/employee/push-token', { user_id: userId, push_token: token });
    return token;
  } catch (_) {
    // Silently ignore — push tokens require a valid EAS project ID in production builds
    return null;
  }
}

export function getTabForType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('leave'))                         return 'Leave';
  if (t.includes('overtime') || t.includes('ot'))  return 'Overtime';
  if (t.includes('payroll') || t.includes('pay'))  return 'Payroll';
  if (t.includes('attendance'))                    return 'Attendance';
  return null;
}
