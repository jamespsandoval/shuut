import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import {
  useVerifyMobileEmail,
  useVerifyMobileLogin,
} from '@workspace/api-client-react';
import { useAuth } from '../../hooks/useAuthStore';
import { ArrowLeft } from 'lucide-react-native';
import { Image } from 'expo-image';

function normalizeConfirmationCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export default function VerifyScreen() {
  const { email, flow } = useLocalSearchParams<{ email: string, flow: string }>();
  const [code, setCode] = useState('');
  const colors = useColors();
  const router = useRouter();
  const { signIn } = useAuth();

  const verifyEmail = useVerifyMobileEmail();
  const verifyLogin = useVerifyMobileLogin();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const styleId = 'shuut-verification-input-focus-reset';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input#shuut-verification-code,
      input#shuut-verification-code:focus,
      input#shuut-verification-code:focus-visible {
        appearance: none !important;
        -webkit-appearance: none !important;
        outline: none !important;
        border: 0 !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => style.remove();
  }, []);

  const isPending = verifyEmail.isPending || verifyLogin.isPending;
  const error = verifyEmail.error || verifyLogin.error;

  const handleVerify = async (codeToVerify = code) => {
    const confirmationCode = normalizeConfirmationCode(codeToVerify);
    if (confirmationCode.length !== 6 || isPending) return;

    try {
      let session;
      if (flow === 'register') {
        session = await verifyEmail.mutateAsync({ data: { email, code: confirmationCode } });
      } else {
        session = await verifyLogin.mutateAsync({ data: { email, code: confirmationCode } });
      }

      await signIn(session);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.topSection}>
          <View style={styles.headerBranding}>
            <Image
              source={require('../../assets/brand/shuut-wordmark.png')}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel="SHÜÜT"
            />
            <Text style={[styles.subtitleBranding, { color: colors.mutedForeground }]}>
              {'Say what’s on your mind.\nListen, too.'}
            </Text>
          </View>

          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft color={colors.mutedForeground} size={18} />
            <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Check your email
            </Text>
          </View>
        </View>

        <View style={styles.formSection}>
          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>VERIFICATION CODE</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                nativeID="shuut-verification-code"
                style={[styles.input, { color: colors.foreground }]}
                placeholder="0 0 0 0 0 0"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                returnKeyType="done"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                selectTextOnFocus
                value={code}
                onChangeText={(value) => {
                  const nextCode = normalizeConfirmationCode(value);
                  setCode(nextCode);
                  if (nextCode.length === 6) void handleVerify(nextCode);
                }}
                onSubmitEditing={() => {
                  void handleVerify();
                }}
              />
            </View>

            {error && (
              <Text style={[styles.error, { color: colors.destructive }]}>
                {error.message || 'Invalid code'}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={() => void handleVerify()}
              disabled={isPending || code.length < 6}
            >
              {isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                  Verify & sign in
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flex: 1 }} />
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
  },
  topSection: {
    marginTop: '25%',
  },
  headerBranding: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 200,
    height: 52,
    marginBottom: 16,
  },
  subtitleBranding: {
    fontFamily: 'Inter_500Medium',
    fontSize: 18,
    lineHeight: 25,
    maxWidth: 320,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    marginLeft: 8,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    marginBottom: 8,
  },
  formSection: {
    width: '100%',
  },
  form: {
    gap: 16,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: -8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    height: 56,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 24,
    letterSpacing: 8,
    height: '100%',
    textAlign: 'center',
  },
  button: {
    height: 56,
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
    marginTop: -8,
  }
});
