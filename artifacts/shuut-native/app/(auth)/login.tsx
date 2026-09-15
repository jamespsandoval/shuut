import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useStartMobileAuth } from '@workspace/api-client-react';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { Mail, ArrowRight } from 'lucide-react-native';
import { useColors } from '../../hooks/useColors';
import { LegalFooter } from '../../components/LegalFooter';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const router = useRouter();
  const startAuth = useStartMobileAuth();
  const colors = useColors();

  const handleContinue = () => {
    if (!email || !email.includes('@')) return;
    
    startAuth.mutate(
      { data: { email } },
      {
        onSuccess: (data) => {
          router.push({
            pathname: '/(auth)/verify',
            params: { email, flow: data.flow }
          });
        },
        onError: (err) => {
          console.error(err);
        }
      }
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.header}>
          <Image
            source={require('../../assets/brand/shuut-wordmark.png')}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="SHÜÜT"
          />
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Say what's on your mind
          </Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <Mail color={colors.mutedForeground} size={20} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="steve@apple.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {startAuth.error && (
            <Text style={[styles.error, { color: colors.destructive }]}>
              {startAuth.error.message || 'An error occurred'}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={handleContinue}
            disabled={startAuth.isPending || !email}
          >
            {startAuth.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                  Continue
                </Text>
                <ArrowRight color={colors.primaryForeground} size={18} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }} />
        <LegalFooter />
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
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    width: '100%',
    alignItems: 'center',
    marginTop: '25%',
    marginBottom: 48,
  },
  logo: {
    width: 200,
    height: 52,
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 18,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 420,
    gap: 16,
    alignItems: 'stretch',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    height: '100%',
    paddingLeft: 6,
    outlineWidth: 0,
  },
  button: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: -8,
    textAlign: 'center',
  }
});
