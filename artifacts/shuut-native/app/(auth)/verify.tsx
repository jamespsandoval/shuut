import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '../../hooks/useColors';
import {
  useVerifyMobileEmail,
  useVerifyMobileLogin,
  useStartMobilePasskeyHandoff,
  useExchangeMobilePasskeyHandoff,
  useGetPasskeyRecoveryStatus,
  useRequestPasskeyRecovery,
  useSendPasskeyRecoveryCode,
  useConfirmPasskeyRecovery,
  MobileRecoverySession
} from '@workspace/api-client-react';
import { useAuth } from '../../hooks/useAuthStore';
import { ArrowLeft, KeyRound } from 'lucide-react-native';
import { Image } from 'expo-image';
import { LegalFooter } from '../../components/LegalFooter';

function normalizeConfirmationCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export default function VerifyScreen() {
  const { email, flow } = useLocalSearchParams<{ email: string, flow: string }>();
  const [code, setCode] = useState('');
  const colors = useColors();
  const router = useRouter();
  const { signIn, completePasskeyHandoff, signOut } = useAuth();

  const verifyEmail = useVerifyMobileEmail();
  const verifyLogin = useVerifyMobileLogin();
  const startHandoff = useStartMobilePasskeyHandoff();
  const exchangeHandoff = useExchangeMobilePasskeyHandoff();

  const [handoffStep, setHandoffStep] = useState(flow === 'pending');
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

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

  useEffect(() => {
    if (flow === 'pending') {
      setHandoffStep(true);
    }
  }, [flow]);

  const recoveryStatus = useGetPasskeyRecoveryStatus({ query: { enabled: handoffStep, queryKey: ['recoveryStatus'] } });
  const requestRecovery = useRequestPasskeyRecovery();
  const sendRecoveryCode = useSendPasskeyRecoveryCode();
  const confirmRecovery = useConfirmPasskeyRecovery();

  const isPending = verifyEmail.isPending || verifyLogin.isPending || startHandoff.isPending || exchangeHandoff.isPending || requestRecovery.isPending || sendRecoveryCode.isPending || confirmRecovery.isPending;
  const error = verifyEmail.error || verifyLogin.error || startHandoff.error || exchangeHandoff.error || requestRecovery.error || sendRecoveryCode.error || confirmRecovery.error;

  const handleVerify = async () => {
    const confirmationCode = normalizeConfirmationCode(code);
    if (confirmationCode.length !== 6 || isPending) return;

    try {
      let session;
      if (flow === 'register') {
        session = await verifyEmail.mutateAsync({ data: { email, code: confirmationCode } });
      } else {
        session = await verifyLogin.mutateAsync({ data: { email, code: confirmationCode } });
      }

      await signIn(session);

      if (session.passkeyRequired) {
        setHandoffStep(true);
        await performPasskeyHandoff();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const performPasskeyHandoff = async () => {
    try {
      const { handoffUrl } = await startHandoff.mutateAsync();
      const grantMatch = handoffUrl.match(/grant=([^&]+)/);
      const grant = grantMatch ? grantMatch[1] : null;

      if (!grant) {
        throw new Error("No grant found in handoff URL");
      }

      await WebBrowser.openBrowserAsync(handoffUrl);

      const { verified } = await exchangeHandoff.mutateAsync({ data: { grant } });

      if (verified) {
        await completePasskeyHandoff();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestRecovery = async () => {
    try {
      await requestRecovery.mutateAsync();
      recoveryStatus.refetch();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendRecoveryCode = async () => {
    try {
      await sendRecoveryCode.mutateAsync();
      recoveryStatus.refetch();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmRecovery = async () => {
    const confirmationCode = normalizeConfirmationCode(recoveryCode);
    if (confirmationCode.length !== 6 || isPending) return;
    try {
      const res = await confirmRecovery.mutateAsync({ data: { code: confirmationCode } });
      if (res && 'accessToken' in res) {
        await signIn(res as MobileRecoverySession);
      } else if (res.recovered) {
        await completePasskeyHandoff();
      }
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
              Say what's on your mind
            </Text>
          </View>

          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft color={colors.mutedForeground} size={18} />
            <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {handoffStep ? 'Passkey Required' : 'Check your email'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {handoffStep ? 'Complete the security check in the browser' : 'We sent a 6-digit sign-in code to'}
            </Text>
            {!handoffStep && (
              <Text style={[styles.emailText, { color: colors.foreground }]}>{email}</Text>
            )}
          </View>
        </View>

        <View style={styles.formSection}>
          {!handoffStep ? (
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>VERIFICATION CODE</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <KeyRound color={colors.mutedForeground} size={20} style={styles.inputIcon} />
                <TextInput
                  nativeID="shuut-verification-code"
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="0 0 0 0 0 0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  selectTextOnFocus
                  maxLength={6}
                  value={code}
                  onChangeText={(value) => setCode(normalizeConfirmationCode(value))}
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
                onPress={handleVerify}
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
          ) : (
            <View style={styles.form}>
              {error && (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {error.message || 'Verification failed. Try again.'}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={performPasskeyHandoff}
                disabled={isPending}
              >
                {isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                    Retry Passkey
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.buttonOutline, { borderColor: colors.border, borderRadius: colors.radius }]}
                onPress={async () => {
                  await signOut();
                }}
                disabled={isPending}
              >
                <Text style={[styles.buttonOutlineText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              {!showRecovery && (
                <TouchableOpacity
                  style={{ marginTop: 24, alignItems: 'center' }}
                  onPress={() => setShowRecovery(true)}
                >
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cannot use passkey?</Text>
                </TouchableOpacity>
              )}

              {showRecovery && (
                <View style={[styles.recoveryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.recoveryTitle, { color: colors.foreground }]}>Account Recovery</Text>

                  {!recoveryStatus.data?.pending && (
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                      onPress={handleRequestRecovery}
                      disabled={isPending}
                    >
                      <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Start Recovery Delay</Text>
                    </TouchableOpacity>
                  )}

                  {recoveryStatus.data?.pending && !recoveryStatus.data?.availableAt && (
                    <Text style={[styles.recoveryText, { color: colors.mutedForeground }]}>Recovery requested. A mandatory security delay is active.</Text>
                  )}

                  {recoveryStatus.data?.availableAt && !recoveryStatus.data?.codeExpiresAt && (
                    <View>
                      <Text style={[styles.recoveryText, { color: colors.mutedForeground }]}>Delay completed. Send recovery code to your email.</Text>
                      <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 8 }]}
                        onPress={handleSendRecoveryCode}
                        disabled={isPending}
                      >
                        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Send Code</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {recoveryStatus.data?.codeExpiresAt && (
                    <View>
                      <TextInput
                        style={[
                          styles.inputLegacy,
                          { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, fontSize: 24, padding: 12 }
                        ]}
                        placeholder="000000"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        textContentType="oneTimeCode"
                        autoComplete="one-time-code"
                        selectTextOnFocus
                        maxLength={6}
                        value={recoveryCode}
                        onChangeText={(value) => setRecoveryCode(normalizeConfirmationCode(value))}
                        onSubmitEditing={() => {
                          void handleConfirmRecovery();
                        }}
                      />
                      <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 8 }]}
                        onPress={handleConfirmRecovery}
                        disabled={isPending || recoveryCode.length < 6}
                      >
                        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Confirm Recovery</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
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
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  emailText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    marginTop: 4,
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
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 24,
    letterSpacing: 8,
    height: '100%',
  },
  inputLegacy: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    textAlign: 'center',
    letterSpacing: 8,
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
  buttonOutline: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 8,
  },
  buttonOutlineText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  recoveryBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  recoveryTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    marginBottom: 8,
  },
  recoveryText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: -8,
  }
});
