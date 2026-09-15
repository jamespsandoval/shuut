import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useGetFeed, useDeletePost, Post } from '@workspace/api-client-react';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { Play, Pause, Rocket, Smile, ThumbsDown, User, Trash2 } from 'lucide-react-native';
import { AuthenticatedAudioPlayer } from '../../components/AuthenticatedAudioPlayer';
import { Image } from 'expo-image';

export default function FeedScreen() {
  const [view, setView] = useState<'everyone' | 'following'>('everyone');
  const colors = useColors();
  const router = useRouter();

  const { data: posts, isLoading, isError, refetch, isRefetching } = useGetFeed(
    { view },
    { query: { queryKey: ['feed', view] } }
  );

  const deletePost = useDeletePost();

  const handleDelete = (postId: number) => {
    deletePost.mutate(
      { postId },
      {
        onSuccess: () => refetch()
      }
    );
  };

  const renderPost = ({ item }: { item: Post }) => {
    return (
      <TouchableOpacity 
        style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={() => router.push(`/post/${item.id}`)}
      >
        <View style={styles.postHeader}>
          <TouchableOpacity 
            style={styles.authorInfo}
            onPress={() => router.push(`/profile/${item.author.handle}`)}
          >
            {item.author.avatarUrl ? (
              <Image source={{ uri: item.author.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: item.author.avatarColor || colors.primary }]}>
                <User color="#fff" size={20} />
              </View>
            )}
            <View>
              <Text style={[styles.authorName, { color: colors.foreground }]}>{item.author.name}</Text>
              <Text style={[styles.authorHandle, { color: colors.mutedForeground }]}>@{item.author.handle}</Text>
            </View>
          </TouchableOpacity>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <Text style={[styles.time, { color: colors.mutedForeground }]}>
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </Text>
            {item.canDelete && (
              <TouchableOpacity onPress={() => handleDelete(item.id)} disabled={deletePost.isPending}>
                <Trash2 color={colors.destructive} size={16} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={[styles.transcript, { color: colors.foreground }]} numberOfLines={3}>
          {item.transcript}
        </Text>

        <AuthenticatedAudioPlayer url={item.audioUrl} durationSeconds={item.durationSeconds} />

        <View style={styles.reactions}>
          <View style={styles.reactionBtn}>
            <Rocket color={item.viewerReaction === 'rocket' ? colors.primary : colors.mutedForeground} size={16} />
            <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{item.reactions.rocket}</Text>
          </View>
          <View style={styles.reactionBtn}>
            <Smile color={item.viewerReaction === 'laughing' ? colors.primary : colors.mutedForeground} size={16} />
            <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{item.reactions.laughing}</Text>
          </View>
          <View style={styles.reactionBtn}>
            <ThumbsDown color={item.viewerReaction === 'thumbsDown' ? colors.primary : colors.mutedForeground} size={16} />
            <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{item.reactions.thumbsDown}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>SHÜÜT</Text>
        <View style={[styles.tabBar, { backgroundColor: colors.input }]}>
          <TouchableOpacity 
            style={[styles.tab, view === 'everyone' && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }]}
            onPress={() => setView('everyone')}
          >
            <Text style={[styles.tabText, { color: view === 'everyone' ? colors.foreground : colors.mutedForeground }]}>
              Everyone
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, view === 'following' && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }]}
            onPress={() => setView('following')}
          >
            <Text style={[styles.tabText, { color: view === 'following' ? colors.foreground : colors.mutedForeground }]}>
              Following
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={posts || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPost}
        contentContainerStyle={styles.listContent}
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
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    marginBottom: 16,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  postCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  authorHandle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  time: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  transcript: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  audioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    marginBottom: 16,
  },
  duration: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  reactions: {
    flexDirection: 'row',
    gap: 16,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reactionCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
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
