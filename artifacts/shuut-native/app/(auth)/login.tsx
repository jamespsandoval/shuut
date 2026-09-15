import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useStartMobileAuth } from '@workspace/api-client-react';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

const BRAND = {
  white: '#FFFFFF',
  charcoal: '#111827',
  slate: '#6B7280',
  cloud: '#F3F4F6',
  blue: '#3B82F6',
  error: '#EF4444',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const router = useRouter();
  const startAuth = useStartMobileAuth();

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
    <SafeAreaView style={styles.container}>
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
          <Text style={styles.subtitle}>
            Sign in or create an account
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={[
              styles.input, 
              { 
                backgroundColor: BRAND.cloud,
                color: BRAND.charcoal,
              }
            ]}
            placeholder="steve@apple.com"
            placeholderTextColor={BRAND.slate}
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          {startAuth.error && (
            <Text style={styles.error}>
              {startAuth.error.message || 'An error occurred'}
            </Text>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={handleContinue}
            disabled={startAuth.isPending || !email}
          >
            {startAuth.isPending ? (
              <ActivityIndicator color={BRAND.white} />
            ) : (
              <Text style={styles.buttonText}>
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.white,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    width: 264,
    height: 70,
    marginBottom: 22,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: BRAND.slate,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 420,
    gap: 16,
    alignItems: 'stretch',
  },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    textAlign: 'center',
  },
  button: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.blue,
    borderRadius: 16,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: BRAND.white,
    textAlign: 'center',
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: -8,
    color: BRAND.error,
    textAlign: 'center',
  }
});
