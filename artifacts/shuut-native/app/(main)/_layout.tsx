import { Tabs } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { Mic, User, Home } from 'lucide-react-native';

export default function MainLayout() {
  const colors = useColors();

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
        name="record"
        options={{
          title: 'Record',
          tabBarShowLabel: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Mic color={color} size={28} strokeWidth={focused ? 2.5 : 2} />
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
    </Tabs>
  );
}
