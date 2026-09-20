import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../hooks/useColors';

const PUBLIC_PAGES = {
  about: 'About',
  community: 'Community Guidelines',
  contact: 'Contact',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
} as const;

type PublicPageSlug = keyof typeof PUBLIC_PAGES;
const PUBLIC_SITE_URL = __DEV__ && process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/shuut-app`
  : 'https://shuut.me';
const PUBLIC_SITE_HOME = new URL(PUBLIC_SITE_URL);

export default function PublicContentScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug?: string; returnTo?: string }>();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const slug = params.slug && params.slug in PUBLIC_PAGES ? params.slug as PublicPageSlug : 'about';
  const url = `${PUBLIC_SITE_URL}/${slug}?native=1`;
  const returnTo = typeof params.returnTo === 'string' && params.returnTo.startsWith('/')
    ? params.returnTo
    : '/(main)/settings';
  const returnToPreviousScreen = () => {
    // Never rely on the root stack here. It can still contain the login route
    // from before authentication, which makes a public-page return appear to
    // sign the user out even though the secure session remains valid.
    router.replace(returnTo as never);
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
      } else {
        returnToPreviousScreen();
      }
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, returnTo, router]);

  const handleNavigationStateChange = (state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Platform.OS === 'web'
        ? React.createElement('iframe', {
            src: url,
            title: PUBLIC_PAGES[slug],
            style: {
              width: '100%',
              flex: 1,
              border: 0,
              backgroundColor: colors.background,
            },
          })
        : (
          <WebView
            ref={webViewRef}
            source={{ uri: url }}
            style={[
              styles.webView,
              {
                backgroundColor: colors.background,
                marginTop: insets.top,
                marginBottom: insets.bottom,
              },
            ]}
            contentInsetAdjustmentBehavior="never"
            startInLoadingState
            onNavigationStateChange={handleNavigationStateChange}
            renderLoading={() => (
              <View style={[styles.loading, { backgroundColor: colors.background }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            onShouldStartLoadWithRequest={(request) => {
              try {
                const requestedUrl = new URL(request.url);
                const requestedPath = requestedUrl.pathname.replace(/\/+$/, '');
                const homePath = PUBLIC_SITE_HOME.pathname.replace(/\/+$/, '');
                if (requestedUrl.origin === PUBLIC_SITE_HOME.origin && requestedPath === homePath) {
                  returnToPreviousScreen();
                  return false;
                }
              } catch {
                return true;
              }
              return true;
            }}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});