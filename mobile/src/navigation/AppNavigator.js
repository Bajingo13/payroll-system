import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { navigationRef } from './navigationRef';
import { Notifications, registerPushToken, getTabForType } from '../services/pushNotifications';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import LeaveScreen from '../screens/LeaveScreen';
import OvertimeScreen from '../screens/OvertimeScreen';
import PayrollScreen from '../screens/PayrollScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PersonalInfoScreen from '../screens/PersonalInfoScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Dashboard: 'home',
  Attendance: 'calendar',
  Leave: 'leaf',
  Overtime: 'time',
  Payroll: 'wallet',
};
// Note: icons append '-outline' when not focused, use filled when focused

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1e40af',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e2e8f0',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
        tabBarIcon: ({ color, size, focused }) => (
          <View style={focused ? {
            backgroundColor: '#eff6ff', borderRadius: 10,
            paddingHorizontal: 12, paddingVertical: 4,
          } : {}}>
            <Ionicons name={focused ? TAB_ICONS[route.name] : TAB_ICONS[route.name] + '-outline'} size={22} color={color} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Leave" component={LeaveScreen} />
      <Tab.Screen name="Overtime" component={OvertimeScreen} />
      <Tab.Screen name="Payroll" component={PayrollScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const notifListenerRef = useRef(null);
  const responseListenerRef = useRef(null);

  // Register push token when user logs in
  useEffect(() => {
    if (user?.user_id) {
      registerPushToken(user.user_id);
    }
  }, [user?.user_id]);

  // Listen for push notifications (only if module loaded successfully)
  useEffect(() => {
    if (!Notifications) return;
    try {
      notifListenerRef.current = Notifications.addNotificationReceivedListener(() => {});

      responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response.notification.request.content.data || {};
          const tab = getTabForType(data.type);
          if (navigationRef.isReady()) {
            navigationRef.navigate(tab ? 'Main' : 'Notifications', tab ? { screen: tab } : undefined);
          }
        } catch (_) {}
      });
    } catch (_) {}

    return () => {
      try { notifListenerRef.current?.remove(); } catch (_) {}
      try { responseListenerRef.current?.remove(); } catch (_) {}
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e40af' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="PersonalInfo"
            component={PersonalInfoScreen}
            options={{ animation: 'slide_from_right' }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
