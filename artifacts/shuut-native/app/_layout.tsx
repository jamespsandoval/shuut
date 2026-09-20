import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { setAudioModeAsync } from 'expo-audio';
import { useEffect } from 'react';
import Colors from '../constants/colors';
import { AuthProvider, useAuth } from '../hooks/useAuthStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl, setDefaultCredentials } from '@workspace/api-client-react';
import { GlobalRecordButton } from '../components/GlobalRecordButton';
import { LegalConsentGate } from '../components/LegalConsentGate';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { API_BASE_URL } from '../lib/apiUrl';
import { runStartupCrashProbe } from '../lib/startupCrashProbe';

setBaseUrl(API_BASE_URL);
setDefaultCredentials('omit');

// This can only fire in a purpose-built diagnostics build. Production builds
// do not set either variable. Keep the stable message for symbolication checks.
runStartupCrashProbe({
  channel: process.env.EXPO_PUBLIC_RELEASE_CHANNEL,
  enabled: process.env.EXPO_PUBLIC_CRASH_PROBE,
});

// Startup helpers are nonessential. Native-module rejection must not terminate
// the process before React can paint a recoverable screen.
void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn('Could not keep the splash screen visible during startup', error);
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { authState, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authState === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inPublicContent = segments[0] === 'public';
    const currentRoute = segments.join('/');

    if (authState === 'unauthenticated') {
      if (!inAuthGroup && !inPublicContent) {
        router.replace('/(auth)/login');
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

  const inPublicContent = segments[0] === 'public';
  const needsLegalConsent =
    authState === 'ready' &&
    !inPublicContent &&
    user?.legalPolicyConsent.required === true;

  return (
    <ThemeProvider value={DefaultTheme}>
      {needsLegalConsent ? (
        <LegalConsentGate returnTo={`/${segments.join('/') || '(main)/feed'}`} />
      ) : (
        <>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(main)" options={{ headerShown: false }} />
            <Stack.Screen
              name="compose"
              options={{
                headerShown: false,
                animation: 'none',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="public/[slug]" options={{ headerShown: false }} />
          </Stack>
          {authState === 'ready' && <GlobalRecordButton />}
        </>
      )}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded || fontError) {
      void SplashScreen.hideAsync().catch((error) => {
        console.warn('Could not hide the splash screen', error);
      });
    }
    if (fontError) {
      console.warn('Could not load bundled fonts; continuing with system fonts', fontError);
    }
  }, [loaded, fontError]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(Colors.light.background).catch((error) => {
      console.warn('Could not set the startup background color', error);
    });
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).catch((error) => {
      console.warn('Could not initialize the startup audio mode', error);
    });
  }, []);

  if (!loaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
