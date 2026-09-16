import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCheckUsernameAvailabilityQueryKey, useCheckUsernameAvailability, useCompleteOnboarding } from '@workspace/api-client-react';
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
  const colors = useColors();
  const mutation = useCompleteOnboarding();
  const { completeOnboarding } = useAuth();
  const validHandle = /^[a-z0-9_]{2,30}$/.test(handle);
  const availability = useCheckUsernameAvailability(handle, { query: { queryKey: getCheckUsernameAvailabilityQueryKey(handle), enabled: step === 2 && validHandle, retry: false } });
  const handleReady = validHandle && availability.data?.available === true;

  const nextFromName = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setHandle(usernameFromName(firstName.trim(), lastName.trim()));
    setStep(2);
  };
  const decide = (eligible: boolean) => {
    setDecision(eligible);
    mutation.mutate({ data: { firstName: firstName.trim(), lastName: lastName.trim(), handle, eligible } }, {
      onSuccess: (session) => completeOnboarding(session.user.eligibilityStatus === 'waitlisted' ? 'waitlisted' : 'ready'),
      onError: () => setDecision(null),
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
          {mutation.error && <Text style={[styles.error, { color: colors.destructive }]}>{mutation.error.message}</Text>}
          {[{ label: 'Yes, I am', value: true }, { label: 'No, I’m not', value: false }].map((option) => (
            <TouchableOpacity key={option.label} accessibilityRole="radio" accessibilityState={{ checked: decision === option.value, disabled: mutation.isPending }} disabled={mutation.isPending} onPress={() => decide(option.value)} style={[styles.choice, { borderColor: colors.border }]}>
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
});