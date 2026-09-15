import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import Colors from '../constants/colors';
import { AuthProvider, useAuth } from '../hooks/useAuthStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';

// Initialize base URL
const domain = process.env.EXPO_PUBLIC_DOMAIN || "localhost:80";
setBaseUrl(`https://${domain}`);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { authState } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authState === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const currentRoute = segments.join('/');

    if (authState === 'unauthenticated') {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (authState === 'passkeyPending') {
      if (currentRoute !== '(auth)/verify') {
        router.replace({ pathname: '/(auth)/verify', params: { flow: 'pending' } });
      }
    } else if (authState === 'onboardingPending') {
      if (currentRoute !== '(auth)/onboarding') {
        router.replace('/(auth)/onboarding');
      }
    } else if (authState === 'ready') {
      if (inAuthGroup) {
        router.replace('/(main)/feed');
      }
    }
  }, [authState, segments, router]);

  if (authState === 'loading') {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  const colorScheme = useColorScheme();
  useEffect(() => {
    const bgColor = colorScheme === 'dark' ? Colors.dark.background : Colors.light.background;
    SystemUI.setBackgroundColorAsync(bgColor);
  }, [colorScheme]);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </QueryClientProvider>
  );
}
