import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { getCheckUsernameAvailabilityQueryKey, useCheckUsernameAvailability, useCompleteOnboarding } from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useAuth } from '../../hooks/useAuthStore';

function usernameFromName(first: string, last: string) {
  return `${first}_${last}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
}

export default function OnboardingScreen() {
  const { step: routeStep } = useLocalSearchParams<{ step?: string }>();
  const step = routeStep === 'username' ? 2 : routeStep === 'source' ? 3 : 1;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [handle, setHandle] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const colors = useColors();
  const mutation = useCompleteOnboarding();
  const { completeOnboarding, refreshSession, user } = useAuth();
  const validHandle = /^[a-z0-9_]{2,30}$/.test(handle);
  const availability = useCheckUsernameAvailability(handle, { query: { queryKey: getCheckUsernameAvailabilityQueryKey(handle), enabled: step === 2 && validHandle, retry: false } });
  const handleReady = validHandle && availability.data?.available === true;

  const nextFromName = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setHandle(usernameFromName(firstName.trim(), lastName.trim()));
    router.setParams({ step: 'username' });
  };
  const finish = () => {
    if (!referralSource.trim() || [...referralSource.trim()].length > 300) return;
    setError(null);
    mutation.mutate({ data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      handle,
      referralSource: referralSource.trim(),
      acceptedLegalPolicies: true,
      termsVersion: user?.legalPolicyConsent.terms.currentVersion ?? '',
      communityGuidelinesVersion: user?.legalPolicyConsent.communityGuidelines.currentVersion ?? '',
    } }, {
      onSuccess: (session) => completeOnboarding(session.user),
      onError: async (requestError) => {
        setError(requestError.message);
        const errorValue = requestError as {
          data?: { code?: string };
        };
        if (errorValue.data?.code === 'LEGAL_POLICY_VERSION_MISMATCH') {
          setError('The policies changed. Please review the linked policies on the registration screen and try again.');
          await refreshSession();
        }
      },
    });
  };

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.step, { color: colors.primary }]}>STEP {step} OF 3</Text>
        {step === 1 ? <>
          <Text style={[styles.title, { color: colors.foreground }]}>What should we call you?</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Add the name you want people to see on SHÜÜT.</Text>
          <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="First name" placeholderTextColor={colors.mutedForeground} value={firstName} onChangeText={setFirstName} />
          <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} placeholder="Last name" placeholderTextColor={colors.mutedForeground} value={lastName} onChangeText={setLastName} />
          <Action label="Continue" disabled={!firstName.trim() || !lastName.trim()} onPress={nextFromName} colors={colors} />
        </> : step === 2 ? <>
          <Text style={[styles.title, { color: colors.foreground }]}>Choose your username</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>We made a suggestion from your name. Edit it if you like.</Text>
          <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} autoCapitalize="none" autoCorrect={false} value={handle} onChangeText={(value) => setHandle(value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30))} />
          <Text style={[styles.status, { color: handleReady ? '#059669' : colors.mutedForeground }]}>
            {availability.isFetching ? 'Checking username…' : handleReady ? 'Username available' : validHandle && availability.data?.available === false ? 'Username already taken' : 'Use 2–30 lowercase letters, numbers or underscores.'}
          </Text>
           <Action label="Continue" disabled={!handleReady} onPress={() => router.setParams({ step: 'source' })} colors={colors} />
        </> : <>
           <Text style={[styles.title, { color: colors.foreground }]}>Where did you learn about this app?</Text>
           <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Names, event links, and URLs are welcome.</Text>
           <TextInput style={[styles.input, styles.longInput, { color: colors.foreground, borderColor: colors.border }]} placeholder="A friend, a Luma event URL, or anywhere else…" placeholderTextColor={colors.mutedForeground} multiline textAlignVertical="top" maxLength={600} value={referralSource} onChangeText={(text) => setReferralSource([...text].slice(0, 300).join(''))} accessibilityLabel="Where did you learn about this app?" />
           <Text style={[styles.status, { color: colors.mutedForeground }]}>{[...referralSource].length}/300 characters</Text>
           {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
           <Action label={mutation.isPending ? 'Saving…' : 'Finish registration'} disabled={mutation.isPending || !referralSource.trim()} onPress={finish} colors={colors} />
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ label, disabled, onPress, colors }: { label: string; disabled: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  step: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2, marginBottom: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 38, marginBottom: 10 },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  input: { height: 56, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 12 },
  longInput: { height: 148, paddingTop: 14 },
  status: { minHeight: 24, fontFamily: 'Inter_500Medium', marginBottom: 12 },
  button: { height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  error: { marginBottom: 14, fontFamily: 'Inter_500Medium' },
});