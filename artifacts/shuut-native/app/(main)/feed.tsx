import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Platform, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ActivityIndicator } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { getFeedPage, getGetFeedPageQueryKey, type FeedItem } from '@workspace/api-client-react';
import { InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, Square } from 'lucide-react-native';
import { FeedItemCard } from '../../components/FeedItemCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useIsFocused } from '@react-navigation/native';

const DEFAULT_FLOATING_MIC_SCROLL_THRESHOLD = 180;

export default function FeedScreen() {
  const [view, setView] = useState<'everyone' | 'following'>('everyone');
  const colors = useColors();
  const router = useRouter();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ newPostId?: string }>();
  const [showFloatingMic, setShowFloatingMic] = useState(false);
  const [isOpeningRecorder, setIsOpeningRecorder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const floatingMicScrollThreshold = useRef(DEFAULT_FLOATING_MIC_SCROLL_THRESHOLD);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const scrollOffsetRef = useRef(0);

  const feedQueryKey = useMemo(() => getGetFeedPageQueryKey({ view }), [view]);
  const {
    data: feedData,
    isLoading,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: feedQueryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => getFeedPage({
      view,
      cursor: pageParam ?? undefined,
      limit: 20,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const posts = useMemo(() => feedData?.pages.reduce<FeedItem[]>((all, page) => {
    const seen = new Set(all.map((item) => item.feedItemKey));
    return all.concat(page.posts.filter((item) => !seen.has(item.feedItemKey)));
  }, []) ?? [], [feedData]);

  // Refresh only the first page. This is used by post cards and publish polling,
  // so a newly published item never causes the entire history to be downloaded.
  const refetchFeed = useCallback(async () => {
    const firstPage = await queryClient.fetchQuery({
      queryKey: [...feedQueryKey, 'first-page'],
      queryFn: () => getFeedPage({ view, limit: 20 }),
      staleTime: 0,
    });
    await queryClient.cancelQueries({ queryKey: feedQueryKey, exact: true });
    queryClient.setQueryData<InfiniteData<typeof firstPage, string | null>>(feedQueryKey, (current) => {
      if (!current) return { pages: [firstPage], pageParams: [null] };
      // Old later pages are based on a different first-page cursor. Keeping
      // them after new posts arrive can leave a gap between the two pages.
      return { pages: [firstPage], pageParams: [null] };
    });
    return firstPage;
  }, [feedQueryKey, queryClient, view]);

  const refreshFirstPage = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchFeed();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchFeed]);

  const renderPost = ({ item }: { item: FeedItem }) => (
    <FeedItemCard
      item={item}
      refetchFeed={() => { void refetchFeed(); }}
      onRevealReshuut={(distance) => listRef.current?.scrollToOffset({ offset: scrollOffsetRef.current + distance, animated: true })}
    />
  );

  useEffect(() => {
    if (!params.newPostId) return;

    const newPostId = Number(params.newPostId);
    if (posts?.some((item) => item.type === 'post' && item.post?.id === newPostId)) {
      router.setParams({ newPostId: undefined });
      return;
    }

    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const pollForPublishedPost = async () => {
      try {
        const result = await refetchFeed();
        if (isCancelled) return;
        if (result.posts.some((item) => item.type === 'post' && item.post?.id === newPostId)) {
          router.setParams({ newPostId: undefined });
          return;
        }
      } catch {
        if (isCancelled) return;
      }
      pollTimer = setTimeout(() => void pollForPublishedPost(), 2_000);
    };

    pollTimer = setTimeout(() => void pollForPublishedPost(), 1_000);
    return () => {
      isCancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [params.newPostId, posts, refetchFeed, router]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleWindowScroll = () => {
      const shouldFloat = window.scrollY >= floatingMicScrollThreshold.current;
      setShowFloatingMic((current) => current === shouldFloat ? current : shouldFloat);
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    handleWindowScroll();
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

  useFocusEffect(useCallback(() => {
    setIsOpeningRecorder(false);
  }, []));

  useFocusEffect(useCallback(() => {
    void refetchFeed();
  }, [refetchFeed]));

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
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    const shouldFloat = event.nativeEvent.contentOffset.y >= floatingMicScrollThreshold.current;
    setShowFloatingMic((current) => current === shouldFloat ? current : shouldFloat);
  };

  const handleRecorderHeaderLayout = (event: LayoutChangeEvent) => {
    floatingMicScrollThreshold.current = event.nativeEvent.layout.height;
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
        ref={listRef}
        data={posts || []}
        keyExtractor={(item) => item.feedItemKey}
        renderItem={renderPost}
        onEndReached={() => {
          if (hasNextPage && !isFetching && !isRefreshing) void fetchNextPage();
        }}
        onEndReachedThreshold={0.65}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refreshFirstPage()}
            tintColor={colors.primary}
          />
        }
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        ListHeaderComponent={
          <View
            onLayout={handleRecorderHeaderLayout}
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
                style={[
                  styles.largeMicButton,
                  { backgroundColor: isOpeningRecorder ? colors.destructive : colors.primary },
                ]}
                onPress={openRecorder}
                disabled={isOpeningRecorder}
                accessibilityLabel="Record a SHÜÜT"
              >
                {isOpeningRecorder ? (
                  <Square color={colors.primaryForeground} size={28} />
                ) : (
                  <Mic color={colors.primaryForeground} size={28} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}><ActivityIndicator color={colors.primary} /></View>
          ) : isError ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Could not load posts.</Text>
              <TouchableOpacity onPress={() => void refreshFirstPage()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No posts found</Text>
            </View>
          )
        }
        ListFooterComponent={isFetchingNextPage
          ? <View style={styles.footer}><ActivityIndicator color={colors.primary} /></View>
          : isFetchNextPageError
            ? <TouchableOpacity style={styles.footer} onPress={() => void fetchNextPage()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Could not load more. Tap to retry.</Text>
              </TouchableOpacity>
            : null}
      />
      {isFocused && showFloatingMic && (
        <TouchableOpacity
          style={[
            styles.floatingMicButton,
            {
              backgroundColor: isOpeningRecorder ? colors.destructive : colors.primary,
              bottom: insets.bottom + 72,
              ...(Platform.OS === 'web' ? { position: 'fixed' as const } : null),
            },
          ]}
          onPress={openRecorder}
          disabled={isOpeningRecorder}
          accessibilityLabel="Record a SHÜÜT"
        >
          {isOpeningRecorder ? (
            <Square color={colors.primaryForeground} size={24} />
          ) : (
            <Mic color={colors.primaryForeground} size={24} />
          )}
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
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginTop: 12,
  },
  footer: {
    paddingVertical: 20,
  },
});
