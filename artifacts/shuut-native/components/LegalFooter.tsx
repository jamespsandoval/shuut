import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useColors } from '../hooks/useColors';

export function LegalFooter() {
  const colors = useColors();
  const router = useRouter();

  const openPublicPage = (slug: string) => {
    router.push({
      pathname: `/public/${slug}` as never,
      params: { returnTo: '/(auth)/login' },
    });
  };

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <View style={styles.linksRow}>
        <TouchableOpacity onPress={() => openPublicPage('about')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>About</Text></TouchableOpacity>
        <Text style={[styles.separator, { color: colors.border }]}>|</Text>
        <TouchableOpacity onPress={() => openPublicPage('contact')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>Contact</Text></TouchableOpacity>
        <Text style={[styles.separator, { color: colors.border }]}>|</Text>
        <TouchableOpacity onPress={() => openPublicPage('cookies')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>Cookie Policy</Text></TouchableOpacity>
      </View>
      <View style={styles.copyright}>
        <Text style={[styles.copyrightText, { color: colors.mutedForeground }]}>
          © {new Date().getFullYear()} SHÜÜT — A{' '}
        </Text>
        <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync('https://www.doubleportrait.com')} hitSlop={8}>
          <Text style={[styles.copyrightText, styles.companyLink, { color: colors.mutedForeground }]}>DoublePortrait Labs</Text>
        </TouchableOpacity>
        <Text style={[styles.copyrightText, { color: colors.mutedForeground }]}>
          {' '}Production. All rights reserved.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 24,
    paddingBottom: 24,
    borderTopWidth: 1,
    alignItems: 'center',
    width: '100%',
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  link: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  separator: {
    marginHorizontal: 12,
    fontSize: 12,
  },
  copyright: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 24,
  },
  copyrightText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  companyLink: {
    textDecorationLine: 'underline',
  }
});
