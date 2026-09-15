import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { X } from 'lucide-react-native';
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
const PUBLIC_SITE_URL = 'https://shuut.me';

export default function PublicContentScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = params.slug && params.slug in PUBLIC_PAGES ? params.slug as PublicPageSlug : 'about';
  const url = `${PUBLIC_SITE_URL}/${slug}`;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let mounted = true;
    void WebBrowser.openBrowserAsync(url).finally(() => {
      if (mounted) router.back();
    });
    return () => {
      mounted = false;
    };
  }, [router, url]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top + 10,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} accessibilityLabel="Close">
          <X color={colors.foreground} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {PUBLIC_PAGES[slug]}
        </Text>
        <View style={styles.closeButton} />
      </View>

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
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});