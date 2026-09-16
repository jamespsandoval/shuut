import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, SafeAreaView, Platform, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useGetFeed, Post } from '@workspace/api-client-react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, Square } from 'lucide-react-native';
import { PostCard } from '../../components/PostCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

const FLOATING_MIC_SCROLL_THRESHOLD = 112;

export default function FeedScreen() {
  const [view, setView] = useState<'everyone' | 'following'>('everyone');
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ newPostId?: string }>();
  const [showFloatingMic, setShowFloatingMic] = useState(false);
  const [isOpeningRecorder, setIsOpeningRecorder] = useState(false);

  const { data: posts, isLoading, refetch, isRefetching } = useGetFeed(
    { view },
    { query: { queryKey: ['feed', view] } }
  );

  const renderPost = ({ item }: { item: Post }) => (
    <PostCard post={item} refetchFeed={refetch} />
  );

  useEffect(() => {
    if (params.newPostId) {
      void refetch();
    }
  }, [params.newPostId, refetch]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleWindowScroll = () => {
      const shouldFloat = window.scrollY >= FLOATING_MIC_SCROLL_THRESHOLD;
      setShowFloatingMic((current) => current === shouldFloat ? current : shouldFloat);
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    handleWindowScroll();
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

  useFocusEffect(useCallback(() => {
    setIsOpeningRecorder(false);
  }, []));

  useEffect(() => {
    if (!isOpeningRecorder) return;

    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        router.push('/compose');
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [isOpeningRecorder, router]);

  const openRecorder = () => {
    if (isOpeningRecorder) return;
    setIsOpeningRecorder(true);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const shouldFloat = event.nativeEvent.contentOffset.y >= FLOATING_MIC_SCROLL_THRESHOLD;
    setShowFloatingMic((current) => current === shouldFloat ? current : shouldFloat);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.fixedTabsContainer,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: Platform.OS === 'web' ? 44 : 0,
          },
        ]}
      >
        <View style={styles.headerTabs}>
          <TouchableOpacity onPress={() => setView('everyone')} style={[styles.headerTab, view === 'everyone' && { borderBottomColor: colors.primary }]}>
            <Text style={[styles.headerTabText, view === 'everyone' ? { color: colors.foreground, fontFamily: 'Inter_700Bold' } : { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>For you</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setView('following')} style={[styles.headerTab, view === 'following' && { borderBottomColor: colors.primary }]}>
            <Text style={[styles.headerTabText, view === 'following' ? { color: colors.foreground, fontFamily: 'Inter_700Bold' } : { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Following</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={posts || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPost}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        ListHeaderComponent={
          <View
            style={[
              styles.headerContainer,
              {
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.brandRow}>
              <Image
                source={require('../../assets/brand/shuut-wordmark.png')}
                style={styles.logo}
                contentFit="contain"
                accessibilityLabel="SHÜÜT"
              />
            </View>

            <View style={styles.recordActionRow}>
              <TouchableOpacity
                style={[styles.largeMicButton, { backgroundColor: colors.primary }]}
                onPress={openRecorder}
                disabled={isOpeningRecorder}
                accessibilityLabel="Record a SHÜÜT"
              >
                <Mic color="#fff" size={28} />
              </TouchableOpacity>
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No posts found</Text>
            </View>
          ) : null
        }
      />
      {showFloatingMic && (
        <TouchableOpacity
          style={[
            styles.floatingMicButton,
            {
              backgroundColor: colors.primary,
              bottom: insets.bottom + 72,
              ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
            },
          ]}
          onPress={openRecorder}
          disabled={isOpeningRecorder}
          accessibilityLabel="Record a SHÜÜT"
        >
          <Mic color="#fff" size={24} />
        </TouchableOpacity>
      )}
      {isOpeningRecorder && (
        <View
          pointerEvents="auto"
          style={[styles.recorderTransitionCover, { backgroundColor: colors.background }]}
        >
          <View style={styles.transitionRecordCard}>
            <View style={styles.transitionRecordingState}>
              <Text style={[styles.transitionRecordingTitle, { color: colors.destructive }]}>
                RECORDING
              </Text>
              <Text style={[styles.transitionTimerText, { color: colors.foreground }]}>
                0:00
              </Text>
              <Text style={[styles.transitionTimerLimit, { color: colors.mutedForeground }]}>
                / 1:30
              </Text>
            </View>
            <View style={[styles.transitionRecordButton, { backgroundColor: colors.destructive }]}>
              <Square color={colors.primaryForeground} size={32} />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    borderBottomWidth: 1,
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 16,
  },
  fixedTabsContainer: {
    borderBottomWidth: 1,
    zIndex: 30,
  },
  headerTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingHorizontal: 16,
  },
  headerTab: {
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    paddingHorizontal: 8,
  },
  headerTabText: {
    fontSize: 16,
  },
  brandRow: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  logo: {
    width: 140,
    height: 36,
  },
  recordActionRow: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  largeMicButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  listContent: {
    padding: 16,
  },
  floatingMicButton: {
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
  recorderTransitionCover: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  transitionRecordCard: {
    alignItems: 'center',
    gap: 32,
  },
  transitionRecordingState: {
    alignItems: 'center',
    gap: 8,
  },
  transitionRecordingTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: 2,
  },
  transitionTimerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 64,
    fontVariant: ['tabular-nums'],
  },
  transitionTimerLimit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  transitionRecordButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  }
});
