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
      // router logic is now handled by _layout.tsx based on authState
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
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {handoffStep ? 'Passkey Required' : 'Enter code'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {handoffStep ? 'Complete the security check in the browser' : `Sent to ${email}`}
          </Text>
        </View>

        {!handoffStep ? (
          <View style={styles.form}>
            <TextInput
              style={[
                styles.input, 
                { 
                  backgroundColor: colors.input,
                  color: colors.foreground,
                  borderColor: colors.border
                }
              ]}
              placeholder="000000"
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
                  Verify
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
                        styles.input, 
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
  input: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    textAlign: 'center',
    letterSpacing: 8,
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
  buttonOutline: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
