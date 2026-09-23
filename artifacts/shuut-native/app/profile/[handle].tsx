import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetProfile, useToggleFollow, Post } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, MapPin, Link as LinkIcon } from 'lucide-react-native';
import { Image } from 'expo-image';
import { authenticatedImageSource } from '../../lib/apiUrl';
import { useAuth } from '../../hooks/useAuthStore';
import { PostCard } from '../../components/PostCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafetyActionSheet } from '../../components/SafetyActionSheet';

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const { data: profileData, isLoading, isError, refetch } = useGetProfile(handle, { query: { queryKey: ['profile', handle] } });
  const { data: viewerProfile } = useGetProfile('me', { query: { queryKey: ['profile', 'me'] } });
  const toggleFollow = useToggleFollow();

  const handleFollow = () => {
    toggleFollow.mutate({ handle }, {
      onSuccess: () => {
        void refetch();
        void queryClient.invalidateQueries({ queryKey: ['feed'] });
      }
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (isError || !profileData?.founder) {
    return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: colors.mutedForeground }}>This profile is unavailable.</Text><TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back"><Text style={{ color: colors.primary, marginTop: 12 }}>Go back</Text></TouchableOpacity></SafeAreaView>;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={colors.foreground} size={24} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{profileData?.founder?.name}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {profileData?.postCount ?? 0} {(profileData?.postCount ?? 0) === 1 ? 'SHÜÜT' : 'SHÜÜTs'}
          </Text>
        </View>
        <SafetyActionSheet targetType="profile" targetId={profileData.founder.id} authorHandle={profileData.founder.handle} self={profileData.founder.handle === viewerProfile?.founder?.handle} onBlocked={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileTop}>
          <View style={styles.avatarContainer}>
            {profileData?.founder?.avatarUrl ? (
              <Image source={authenticatedImageSource(profileData.founder.avatarUrl, token)} style={styles.avatarLarge} />
            ) : (
              <View style={[styles.avatarLarge, { backgroundColor: profileData?.founder?.avatarColor || colors.primary }]}>
                <Text style={{color: '#fff', fontSize: 32, fontFamily: 'Inter_700Bold'}}>{profileData?.founder?.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.followButton,
              {
                backgroundColor: profileData?.founder?.isFollowing ? colors.background : colors.primary,
                borderColor: profileData?.founder?.isFollowing ? colors.border : colors.primary,
                borderWidth: 1
              }
            ]}
            onPress={handleFollow}
            disabled={toggleFollow.isPending}
          >
            <Text style={[
              styles.followButtonText,
              { color: profileData?.founder?.isFollowing ? colors.foreground : colors.primaryForeground }
            ]}>
              {profileData?.founder?.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.profileInfo}>
          <Text style={[styles.name, { color: colors.foreground }]}>{profileData?.founder?.name}</Text>
          <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{profileData?.founder?.handle}</Text>

          {profileData?.founder?.bio && <Text style={[styles.bio, { color: colors.foreground }]}>{profileData.founder.bio}</Text>}

          <View style={styles.metaRow}>
            {profileData?.founder?.location && (
              <View style={styles.metaItem}>
                <MapPin color={colors.mutedForeground} size={14} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{profileData.founder.location}</Text>
              </View>
            )}
            {profileData?.founder?.website && (
              <View style={styles.metaItem}>
                <LinkIcon color={colors.primary} size={14} />
                <Text style={[styles.metaText, { color: colors.primary }]}>{profileData.founder.website}</Text>
              </View>
            )}
          </View>

          <View style={styles.statsRow}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{profileData?.followingCount || 0} <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text></Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{profileData?.followerCount || 0} <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text></Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>SHÜÜTs</Text>

        <View style={styles.feed}>
          {profileData?.posts?.map((post: Post) => (
            <PostCard key={post.id} post={post} refetchFeed={refetch} />
          ))}
          {(!profileData?.posts || profileData.posts.length === 0) && (
            <Text style={{textAlign: 'center', color: colors.mutedForeground, marginTop: 32}}>No SHÜÜTs yet.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  content: { padding: 16 },
  profileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  avatarContainer: {
    padding: 2,
    backgroundColor: '#fff',
    borderRadius: 44,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  followButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  profileInfo: {
    marginBottom: 24,
  },
  name: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  handle: { fontFamily: 'Inter_400Regular', fontSize: 15, marginBottom: 12 },
  bio: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  statLabel: { fontFamily: 'Inter_400Regular' },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginBottom: 16,
  },
  feed: {
    gap: 12,
  }
});
