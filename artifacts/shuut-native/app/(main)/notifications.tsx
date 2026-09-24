import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, MessageCircle, Repeat2, Sparkles } from 'lucide-react-native';
import { useGetNotifications, Notification } from '@workspace/api-client-react';
import { useColors } from '../../hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function eventCopy(item: Notification) {
  if (item.eventType === 'reaction') {
    const names: Record<string, string> = { rocket: '🚀', laughing: '😂', thumbsDown: '👎' };
    return `reacted ${names[item.reactionType ?? ''] ?? 'to'} to your SHÜÜT`;
  }
  if (item.eventType === 'reshuut') return 'tagged you in a reSHÜÜT of your SHÜÜT';
  if (item.eventType === 'mention') return 'tagged you in a SHÜÜT';
  return 'left a voice comment on your SHÜÜT';
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isRefetching } = useGetNotifications({
    query: { queryKey: ['notifications'] },
  });

  useFocusEffect(useCallback(() => {
    void refetch();
  }, [refetch]));

  if (isLoading) {
    return <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }
  if (isError) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Bell color={colors.mutedForeground} size={34} />
        <Text style={[styles.message, { color: colors.foreground }]}>Notifications are unavailable</Text>
        <TouchableOpacity onPress={() => void refetch()} accessibilityRole="button">
          <Text style={[styles.retry, { color: colors.primary }]}>Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 64 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Reactions, reshuüts, and comments</Text>
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, { borderBottomColor: colors.border }]}
            onPress={() => router.push(`/post/${item.post.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.actor.name} ${eventCopy(item)}`}
          >
            <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
              {item.eventType === 'comment' ? <MessageCircle color={colors.primary} size={20} /> : item.eventType === 'reshuut' ? <Repeat2 color={colors.primary} size={20} /> : <Sparkles color={colors.primary} size={20} />}
            </View>
            <View style={styles.body}>
              <Text style={[styles.activity, { color: colors.foreground }]}>
                <Text style={styles.actor}>{item.actor.name}</Text> {eventCopy(item)}
              </Text>
              <Text numberOfLines={2} style={[styles.transcript, { color: colors.mutedForeground }]}>{item.post.transcript || 'Transcript unavailable'}</Text>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>{relativeTime(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={styles.empty}><Bell color={colors.mutedForeground} size={36} /><Text style={[styles.message, { color: colors.foreground }]}>Nothing new yet</Text><Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Activity on your SHÜÜTs will appear here.</Text></View>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, alignItems: 'center' },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: 'center' },
  list: { paddingHorizontal: 16, flexGrow: 1 },
  item: { flexDirection: 'row', paddingVertical: 18, borderBottomWidth: 1, gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  activity: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  actor: { fontFamily: 'Inter_700Bold' },
  transcript: { fontSize: 14, lineHeight: 19, marginTop: 7, fontFamily: 'Inter_400Regular' },
  time: { fontSize: 12, marginTop: 7, fontFamily: 'Inter_500Medium' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 56, gap: 10 },
  message: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  emptyHint: { fontSize: 14, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  retry: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 12 },
});