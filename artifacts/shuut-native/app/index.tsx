import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuthStore';
import { useColors } from '../hooks/useColors';

export default function IndexScreen() {
  const { authState } = useAuth();
  const colors = useColors();

  if (authState === 'loading') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (authState === 'ready') return <Redirect href="/(main)/feed" />;
  if (authState === 'passkeyPending') return <Redirect href="/(auth)/verify?flow=pending" />;
  if (authState === 'onboardingPending') return <Redirect href="/(auth)/onboarding" />;
  
  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});