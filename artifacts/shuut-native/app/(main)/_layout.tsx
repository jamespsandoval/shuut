import { Redirect, Tabs } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useAuth } from '../../hooks/useAuthStore';
import { User, Home, Settings, Bell } from 'lucide-react-native';

export default function MainLayout() {
  const colors = useColors();
  const { authState } = useAuth();

  if (authState !== 'ready') {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarShowLabel: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Home color={color} size={28} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarShowLabel: false,
          tabBarIcon: ({ color, size, focused }) => (
            <User color={color} size={28} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarShowLabel: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Bell color={color} size={28} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarShowLabel: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Settings color={color} size={28} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          href: null,
          animation: 'none',
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
