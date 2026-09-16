import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../hooks/useColors';

export default function WaitlistScreen() {
  const colors = useColors();
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.brand, { color: colors.primary }]}>SHÜÜT</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Thanks for your interest</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          You’re on the waitlist for general availability. We’ll be in touch when SHÜÜT opens to founders everywhere.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 28, alignItems: 'center' },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: 2, marginBottom: 40 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, textAlign: 'center', marginBottom: 16 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 17, lineHeight: 27, textAlign: 'center' },
});