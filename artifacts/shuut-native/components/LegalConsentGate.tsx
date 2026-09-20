import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ExternalLink, LogOut, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCurrentUserQueryKey,
  useAcceptLegalPolicyConsent,
} from '@workspace/api-client-react';
import { useColors } from '../hooks/useColors';
import { useAuth } from '../hooks/useAuthStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function LegalConsentGate({ returnTo = '/(main)/feed' }: { returnTo?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refreshSession, signOut } = useAuth();
  const acceptConsent = useAcceptLegalPolicyConsent();
  const [error, setError] = useState<string | null>(null);

  const openPolicy = (slug: 'terms' | 'community') => {
    router.push({
      pathname: '/public/[slug]',
      params: { slug, returnTo },
    });
  };

  const accept = () => {
    const termsVersion = user?.legalPolicyConsent.terms.currentVersion;
    const communityGuidelinesVersion = user?.legalPolicyConsent.communityGuidelines.currentVersion;
    if (!termsVersion || !communityGuidelinesVersion) {
      setError('We could not load the current policy versions. Please try again.');
      return;
    }

    setError(null);
    acceptConsent.mutate(
      {
        data: {
          source: 'native',
          termsVersion,
          communityGuidelinesVersion,
        },
      },
      {
        onSuccess: async () => {
          try {
            await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            await refreshSession();
          } catch {
            setError('Your policies were accepted, but we could not refresh your session. Please try again.');
          }
        },
        onError: async (requestError) => {
          const errorValue = requestError as {
            status?: number;
            response?: { status?: number; data?: { code?: string } };
            code?: string;
          };
          const status = errorValue.status ?? errorValue.response?.status;
          const code = errorValue.code ?? errorValue.response?.data?.code;
          if (status === 409 || code === 'LEGAL_POLICY_VERSION_MISMATCH') {
            try {
              await refreshSession();
            } finally {
              setError('These policies changed while you were reviewing them. Please review the updated versions and try again.');
            }
            return;
          }
          setError('We could not save your acceptance. Check your connection and try again.');
        },
      },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
          <ShieldCheck color={colors.primary} size={34} strokeWidth={2} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>A quick agreement</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Before you join the conversation, please review and accept SHÜÜT’s current Terms of
          Service and Community Guidelines. They help keep voice sharing respectful and safe.
        </Text>

        <View style={[styles.policyList, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Read Terms of Service"
            testID="button-consent-terms"
            onPress={() => openPolicy('terms')}
            style={styles.policyRow}
          >
            <Text style={[styles.policyText, { color: colors.foreground }]}>Terms of Service</Text>
            <ExternalLink color={colors.primary} size={18} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Read Community Guidelines"
            testID="button-consent-community"
            onPress={() => openPolicy('community')}
            style={styles.policyRow}
          >
            <Text style={[styles.policyText, { color: colors.foreground }]}>Community Guidelines</Text>
            <ExternalLink color={colors.primary} size={18} />
          </Pressable>
        </View>

        <Text style={[styles.detail, { color: colors.mutedForeground }]}>
          By continuing, you agree to follow these policies whenever you post, comment, react, or
          share a voice message. You can review them again from Settings.
        </Text>

        {error ? (
          <Text
            accessibilityRole="alert"
            testID="text-consent-error"
            style={[styles.error, { color: colors.destructive }]}
          >
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          testID="button-accept-policies"
          onPress={accept}
          disabled={acceptConsent.isPending}
          style={[
            styles.acceptButton,
            { backgroundColor: colors.primary, opacity: acceptConsent.isPending ? 0.65 : 1 },
          ]}
        >
          {acceptConsent.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.acceptText, { color: colors.primaryForeground }]}>I agree and continue</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          testID="button-consent-sign-out"
          onPress={() => void signOut()}
          style={styles.signOutButton}
        >
          <LogOut color={colors.mutedForeground} size={18} />
          <Text style={[styles.signOutText, { color: colors.mutedForeground }]}>Sign out</Text>
        </Pressable>
        <Text style={[styles.accountText, { color: colors.mutedForeground }]}>{user?.email}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  iconWrap: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, textAlign: 'center' },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
  },
  policyList: { width: '100%', borderWidth: 1, borderRadius: 16, marginTop: 28 },
  policyRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  policyText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  divider: { height: 1, marginHorizontal: 16 },
  detail: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 18 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 18 },
  acceptButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  acceptText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  signOutButton: {
    alignSelf: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  signOutText: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  accountText: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 4 },
});