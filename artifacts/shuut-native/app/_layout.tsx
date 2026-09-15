import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import Colors from '../constants/colors';
import { AuthProvider, useAuth } from '../hooks/useAuthStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl, setDefaultCredentials } from '@workspace/api-client-react';

// Initialize base URL
const domain = process.env.EXPO_PUBLIC_DOMAIN || "localhost:80";
setBaseUrl(`https://${domain}`);
setDefaultCredentials('omit');

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
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
    <ThemeProvider value={DefaultTheme}>
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

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(Colors.light.background);
  }, []);

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
