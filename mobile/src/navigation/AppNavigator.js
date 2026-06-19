import { useEffect, useRef } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { navigationRef } from './navigationRef';
import { Notifications, registerPushToken, getTabForType } from '../services/pushNotifications';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import HRDashboardScreen from '../screens/HRDashboardScreen';
import HRAttendanceScreen from '../screens/HRAttendanceScreen';
import HRLeaveManagementScreen from '../screens/HRLeaveManagementScreen';
import HROvertimeManagementScreen from '../screens/HROvertimeManagementScreen';
import HRModulesScreen from '../screens/HRModulesScreen';
import HREmployeeFileScreen from '../screens/HREmployeeFileScreen';
import HR201FilesScreen from '../screens/HR201FilesScreen';
import HROrgSetupScreen from '../screens/HROrgSetupScreen';
import HRScheduleScreen from '../screens/HRScheduleScreen';
import HRPerformanceScreen from '../screens/HRPerformanceScreen';
import HRAuditingScreen from '../screens/HRAuditingScreen';
import HRCalendarScreen from '../screens/HRCalendarScreen';
import HRUtilitiesScreen from '../screens/HRUtilitiesScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import LeaveScreen from '../screens/LeaveScreen';
import OvertimeScreen from '../screens/OvertimeScreen';
import PayrollScreen from '../screens/PayrollScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PersonalInfoScreen from '../screens/PersonalInfoScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function normalizeRole(role) {
  const r = String(role || '').toLowerCase().trim();
  if (r === 'hr' || r === 'human resource' || r === 'human resources') return 'hr';
  if (r === 'admin' || r === 'administrator') return 'admin';
  return 'employee';
}

const EMPLOYEE_TAB_ICONS = {
  Dashboard: 'home',
  Attendance: 'calendar',
  Leave: 'leaf',
  Overtime: 'time',
  Payroll: 'wallet',
};

const HR_TAB_ICONS = {
  'HR Dashboard': 'grid',
  Attendance: 'calendar',
  Leave: 'leaf',
  Overtime: 'time',
  Modules: 'apps',
};

function tabScreenOptions(route, iconMap) {
  return {
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
    tabBarItemStyle: { flex: 1 },
    tabBarIcon: ({ color, focused }) => {
      const iconName = iconMap[route.name];
      return <Ionicons name={focused ? iconName : iconName + '-outline'} size={22} color={color} />;
    },
  };
}

function EmployeeTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => tabScreenOptions(route, EMPLOYEE_TAB_ICONS)}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Leave" component={LeaveScreen} />
      <Tab.Screen name="Overtime" component={OvertimeScreen} />
      <Tab.Screen name="Payroll" component={PayrollScreen} />
    </Tab.Navigator>
  );
}

const HR_TABS = [
  { name: 'HR Dashboard', icon: 'grid',     label: 'Home',    component: HRDashboardScreen },
  { name: 'Attendance',   icon: 'calendar', label: 'Attend',  component: HRAttendanceScreen },
  { name: 'Leave',        icon: 'leaf',     label: 'Leave',   component: HRLeaveManagementScreen },
  { name: 'Overtime',     icon: 'time',     label: 'OT',      component: HROvertimeManagementScreen },
  { name: 'Modules',      icon: 'apps',     label: 'More',    component: HRModulesScreen },
];

function HRCustomTabBar({ state, navigation }) {
  const screenW = Dimensions.get('window').width;
  const pb      = Platform.OS === 'ios' ? 20 : 8;

  return (
    <View style={{
      flexDirection: 'row',
      width: screenW,
      backgroundColor: '#0f172a',
      borderTopWidth: 1,
      borderTopColor: '#1e293b',
      paddingBottom: pb,
      paddingTop: 8,
      elevation: 20,
      shadowColor: '#000',
      shadowOpacity: 0.5,
      shadowRadius: 10,
    }}>
      {HR_TABS.map((tab, index) => {
        const focused = state.index === index;
        return (
          <TouchableOpacity
            key={tab.name}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}
            onPress={() => navigation.navigate(tab.name)}
            activeOpacity={0.75}
          >
            <View style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14,
              paddingVertical: 5,
              borderRadius: 12,
              backgroundColor: focused ? 'rgba(139,92,246,0.15)' : 'transparent',
            }}>
              <Ionicons
                name={focused ? tab.icon : tab.icon + '-outline'}
                size={21}
                color={focused ? '#a78bfa' : '#4b5563'}
              />
              <Text style={{
                fontSize: 10,
                fontWeight: focused ? '700' : '500',
                color: focused ? '#a78bfa' : '#4b5563',
                marginTop: 3,
              }}>
                {tab.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function HRTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <HRCustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {HR_TABS.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component} />
      ))}
    </Tab.Navigator>
  );
}

// Legacy alias kept so existing code that references MainTabs still works
function MainTabs({ role }) {
  const normalized = normalizeRole(role);
  return (normalized === 'hr' || normalized === 'admin') ? <HRTabs /> : <EmployeeTabs />;
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

  const role = normalizeRole(user?.role);
  const RootTabs = (role === 'hr' || role === 'admin') ? HRTabs : EmployeeTabs;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={RootTabs} />
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
          <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HREmployeeFile" component={HREmployeeFileScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HR201Files"    component={HR201FilesScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HROrgSetup"    component={HROrgSetupScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HRSchedule"    component={HRScheduleScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HRPerformance" component={HRPerformanceScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HRAuditing"    component={HRAuditingScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HRCalendar"    component={HRCalendarScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HRUtilities"   component={HRUtilitiesScreen}   options={{ animation: 'slide_from_right' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
