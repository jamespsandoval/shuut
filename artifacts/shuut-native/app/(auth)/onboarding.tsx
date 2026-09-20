import React, { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCheckUsernameAvailabilityQueryKey, useCheckUsernameAvailability, useCompleteOnboarding } from '@workspace/api-client-react';
import { Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useAuth } from '../../hooks/useAuthStore';

function usernameFromName(first: string, last: string) {
  return `${first}_${last}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
}

export default function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [handle, setHandle] = useState('');
  const [decision, setDecision] = useState<boolean | null>(null);
  const [acceptedLegalPolicies, setAcceptedLegalPolicies] = useState(false);
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
    setStep(2);
  };
  const decide = (eligible: boolean) => {
    if (!acceptedLegalPolicies) return;
    setDecision(eligible);
    mutation.mutate({ data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      handle,
      eligible,
      acceptedLegalPolicies: true,
      termsVersion: user?.legalPolicyConsent.terms.currentVersion ?? '',
      communityGuidelinesVersion: user?.legalPolicyConsent.communityGuidelines.currentVersion ?? '',
    } }, {
      onSuccess: (session) => completeOnboarding(session.user),
      onError: async (requestError) => {
        setDecision(null);
        const errorValue = requestError as {
          data?: { code?: string };
        };
        if (errorValue.data?.code === 'LEGAL_POLICY_VERSION_MISMATCH') {
          setAcceptedLegalPolicies(false);
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
          <Action label="Continue" disabled={!handleReady} onPress={() => setStep(3)} colors={colors} />
        </> : <>
          <Text style={[styles.title, { color: colors.foreground }]}>Are you the founder of a technology startup based in Europe (including the UK)?</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>SHÜÜT is currently available to founders of European and UK technology startups. Your answer is final.</Text>
           <Pressable
             accessibilityRole="checkbox"
             accessibilityState={{ checked: acceptedLegalPolicies }}
             testID="checkbox-legal-policies"
             onPress={() => setAcceptedLegalPolicies((accepted) => !accepted)}
             style={styles.consentRow}
           >
             <View style={[styles.checkbox, { borderColor: acceptedLegalPolicies ? colors.primary : colors.border, backgroundColor: acceptedLegalPolicies ? colors.primary : colors.background }]}>
               {acceptedLegalPolicies ? <Check size={16} color={colors.primaryForeground} strokeWidth={3} /> : null}
             </View>
             <Text style={[styles.consentText, { color: colors.foreground }]}>
               I agree to the{' '}
               <Text style={{ color: colors.primary }} onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/public/[slug]', params: { slug: 'terms', returnTo: '/(auth)/onboarding' } }); }}>Terms of Service</Text>
               {' '}and linked{' '}
               <Text style={{ color: colors.primary }} onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/public/[slug]', params: { slug: 'community', returnTo: '/(auth)/onboarding' } }); }}>Community Guidelines</Text>.
             </Text>
           </Pressable>
          {mutation.error && <Text style={[styles.error, { color: colors.destructive }]}>{mutation.error.message}</Text>}
          {[{ label: 'Yes, I am', value: true }, { label: 'No, I’m not', value: false }].map((option) => (
             <TouchableOpacity key={option.label} accessibilityRole="radio" accessibilityState={{ checked: decision === option.value, disabled: mutation.isPending || !acceptedLegalPolicies }} disabled={mutation.isPending || !acceptedLegalPolicies} onPress={() => decide(option.value)} style={[styles.choice, { borderColor: colors.border, opacity: acceptedLegalPolicies ? 1 : 0.5 }]}>
              <Text style={[styles.choiceText, { color: colors.foreground }]}>{option.label}</Text>
              {decision === option.value && mutation.isPending ? <ActivityIndicator color={colors.primary} /> : <View style={[styles.radio, { borderColor: colors.mutedForeground }]} />}
            </TouchableOpacity>
          ))}
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
  status: { minHeight: 24, fontFamily: 'Inter_500Medium', marginBottom: 12 },
  button: { height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  choice: { height: 64, borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  choiceText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  radio: { width: 20, height: 20, borderWidth: 2, borderRadius: 10 },
  error: { marginBottom: 14, fontFamily: 'Inter_500Medium' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21 },
});