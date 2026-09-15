import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useCompleteOnboarding } from '@workspace/api-client-react';
import { useAuth } from '../../hooks/useAuthStore';

export default function OnboardingScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [handle, setHandle] = useState('');
  
  const colors = useColors();
  const completeOnboardingApi = useCompleteOnboarding();
  const { completeOnboarding } = useAuth();

  const handleComplete = () => {
    if (!firstName || !lastName || !handle) return;
    
    completeOnboardingApi.mutate(
      { data: { firstName, lastName, handle } },
      {
        onSuccess: () => {
          completeOnboarding();
        },
      }
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Complete Profile</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Tell us a bit about yourself
            </Text>
          </View>

          <View style={styles.form}>
            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>First Name</Text>
              <TextInput
                style={[
                  styles.input, 
                  { 
                    backgroundColor: colors.input,
                    color: colors.foreground,
                    borderColor: colors.border
                  }
                ]}
                placeholder="First Name"
                placeholderTextColor={colors.mutedForeground}
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>

            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>Last Name</Text>
              <TextInput
                style={[
                  styles.input, 
                  { 
                    backgroundColor: colors.input,
                    color: colors.foreground,
                    borderColor: colors.border
                  }
                ]}
                placeholder="Last Name"
                placeholderTextColor={colors.mutedForeground}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>

            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>Handle</Text>
              <TextInput
                style={[
                  styles.input, 
                  { 
                    backgroundColor: colors.input,
                    color: colors.foreground,
                    borderColor: colors.border
                  }
                ]}
                placeholder="username"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                value={handle}
                onChangeText={setHandle}
              />
            </View>

            {completeOnboardingApi.error && (
              <Text style={[styles.error, { color: colors.destructive }]}>
                {completeOnboardingApi.error.message || 'An error occurred'}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={handleComplete}
              disabled={completeOnboardingApi.isPending || !firstName || !lastName || !handle}
            >
              {completeOnboardingApi.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                  Start using SHÜÜT
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  form: {
    gap: 16,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  button: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  }
});
