import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Mic, Square } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';

export function GlobalRecordButton() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const [isOpeningRecorder, setIsOpeningRecorder] = useState(false);
  const currentRoute = segments.join('/');
  const isFeed = currentRoute === '(main)/feed';
  const isCompose = currentRoute === 'compose' || currentRoute === '(main)/record';

  useEffect(() => {
    if (isCompose) setIsOpeningRecorder(false);
  }, [isCompose]);

  useEffect(() => {
    if (!isOpeningRecorder) return;
    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => router.push('/compose'));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [isOpeningRecorder, router]);

  if (isFeed || isCompose) return null;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: colors.primary,
            bottom: insets.bottom + 76,
            ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
          },
        ]}
        onPress={() => setIsOpeningRecorder(true)}
        disabled={isOpeningRecorder}
        accessibilityLabel="Record a SHÜÜT"
      >
        <Mic color={colors.primaryForeground} size={24} />
      </TouchableOpacity>
      {isOpeningRecorder && (
        <View
          pointerEvents="auto"
          style={[
            styles.cover,
            {
              backgroundColor: colors.background,
              ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
            },
          ]}
        >
          <View style={styles.recordCard}>
            <View style={styles.recordingState}>
              <Text style={[styles.recordingTitle, { color: colors.destructive }]}>RECORDING</Text>
              <Text style={[styles.timer, { color: colors.foreground }]}>0:00</Text>
              <Text style={[styles.limit, { color: colors.mutedForeground }]}>/ 1:30</Text>
            </View>
            <View style={[styles.stopButton, { backgroundColor: colors.destructive }]}>
              <Square color={colors.primaryForeground} size={32} />
            </View>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 100,
  },
  cover: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  recordCard: {
    alignItems: 'center',
    gap: 32,
  },
  recordingState: {
    alignItems: 'center',
    gap: 8,
  },
  recordingTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: 2,
  },
  timer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 64,
    fontVariant: ['tabular-nums'],
  },
  limit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  stopButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});