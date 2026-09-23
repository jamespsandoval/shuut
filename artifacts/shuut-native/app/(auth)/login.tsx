import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useStartMobileAuth } from '@workspace/api-client-react';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { Mail, ArrowRight, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '../../hooks/useColors';
import { LegalFooter } from '../../components/LegalFooter';

const RECENT_EMAILS_KEY = 'shuut.recent-emails';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [recentEmails, setRecentEmails] = useState<string[]>([]);
  const [showRecentEmails, setShowRecentEmails] = useState(false);
  const emailInputRef = React.useRef<TextInput>(null);
  const router = useRouter();
  const startAuth = useStartMobileAuth();
  const colors = useColors();

  React.useEffect(() => {
    if (Platform.OS === 'web') return;

    void AsyncStorage.getItem(RECENT_EMAILS_KEY).then((storedEmails) => {
      if (!storedEmails) return;
      try {
        const parsedEmails = JSON.parse(storedEmails);
        if (!Array.isArray(parsedEmails)) return;
        const validEmails = parsedEmails
          .filter((value): value is string => typeof value === 'string' && value.includes('@'))
          .slice(0, 2);
        setRecentEmails(validEmails);
        setEmail((current) => current || validEmails[0] || '');
      } catch {
        void AsyncStorage.removeItem(RECENT_EMAILS_KEY);
      }
    });
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const styleId = 'shuut-login-input-focus-reset';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input#shuut-login-email,
      input#shuut-login-email:focus,
      input#shuut-login-email:focus-visible {
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

  const handleContinue = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) return;
    
    startAuth.mutate(
      { data: { email: normalizedEmail } },
      {
        onSuccess: (data) => {
          const nextRecentEmails = [
            normalizedEmail,
            ...recentEmails.filter((savedEmail) => savedEmail !== normalizedEmail),
          ].slice(0, 2);
          setRecentEmails(nextRecentEmails);
          void AsyncStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(nextRecentEmails));
          router.push({
            pathname: '/(auth)/verify',
            params: { email: normalizedEmail, flow: data.flow }
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
            {'Say what’s on your mind.\nListen, too.'}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <Mail color={colors.mutedForeground} size={20} style={styles.inputIcon} />
            <TextInput
              ref={emailInputRef}
              nativeID="shuut-login-email"
              style={[
                styles.input,
                { color: colors.foreground },
                Platform.OS === 'web'
                  ? ({
                      appearance: 'none',
                      outline: 'none',
                      outlineStyle: 'none',
                      outlineWidth: 0,
                      outlineColor: 'transparent',
                      boxShadow: 'none',
                    } as any)
                  : undefined,
              ]}
              placeholder="steve@apple.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              importantForAutofill="yes"
              keyboardType="email-address"
              returnKeyType="go"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setShowRecentEmails(true)}
              onBlur={() => setShowRecentEmails(false)}
              onSubmitEditing={handleContinue}
            />
            {email.length > 0 && (
              <TouchableOpacity
                style={styles.clearEmailButton}
                onPress={() => {
                  setEmail('');
                  setShowRecentEmails(true);
                  emailInputRef.current?.focus();
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear email address"
                hitSlop={10}
              >
                <X color={colors.mutedForeground} size={18} strokeWidth={2.25} />
              </TouchableOpacity>
            )}
            {showRecentEmails && recentEmails.length > 0 && (
              <View
                style={[
                  styles.recentEmailMenu,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                {recentEmails.map((savedEmail, index) => (
                  <TouchableOpacity
                    key={savedEmail}
                    style={[
                      styles.recentEmailChoice,
                      index < recentEmails.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
                    ]}
                    onPressIn={() => {
                      setEmail(savedEmail);
                      setShowRecentEmails(false);
                    }}
                  >
                    <Text style={[styles.recentEmailText, { color: colors.foreground }]} numberOfLines={1}>
                      {savedEmail}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 21, marginTop: 14 }}>
            By registering for SHÜÜT, you accept our{' '}
            <Text style={{ color: colors.primary }} onPress={() => router.push({ pathname: '/public/terms' as never, params: { returnTo: '/(auth)/login' } })}>Terms of Service</Text>,{' '}
            <Text style={{ color: colors.primary }} onPress={() => router.push({ pathname: '/public/privacy' as never, params: { returnTo: '/(auth)/login' } })}>Privacy Policy</Text>, and{' '}
            <Text style={{ color: colors.primary }} onPress={() => router.push({ pathname: '/public/community' as never, params: { returnTo: '/(auth)/login' } })}>Community Guidelines</Text>.
          </Text>
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
    marginBottom: 96,
  },
  logo: {
    width: 200,
    height: 52,
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 18,
    lineHeight: 25,
    maxWidth: 320,
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
    zIndex: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  clearEmailButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 40,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    height: '100%',
    paddingLeft: 6,
    borderWidth: 0,
    backgroundColor: 'transparent',
    outlineWidth: 0,
  },
  recentEmailMenu: {
    position: 'absolute',
    top: 62,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 3,
  },
  recentEmailChoice: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  recentEmailText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
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
