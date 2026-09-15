import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, SafeAreaView, Platform } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useGetFeed, Post } from '@workspace/api-client-react';
import { useRouter } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { PostCard } from '../../components/PostCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

export default function FeedScreen() {
  const [view, setView] = useState<'everyone' | 'following'>('everyone');
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: posts, isLoading, refetch, isRefetching } = useGetFeed(
    { view },
    { query: { queryKey: ['feed', view] } }
  );

  const renderPost = ({ item }: { item: Post }) => (
    <PostCard post={item} refetchFeed={refetch} />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.headerContainer,
          {
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

        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/brand/shuut-wordmark.png')}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="SHÜÜT"
          />
        </View>

        <View style={styles.recordActionRow}>
          <TouchableOpacity style={[styles.largeMicButton, { backgroundColor: colors.primary }]} onPress={() => router.push('/(main)/record')}>
            <Mic color="#fff" size={28} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={posts || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPost}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    borderBottomWidth: 1,
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
  empty: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  }
});
