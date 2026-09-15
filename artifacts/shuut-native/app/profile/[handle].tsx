import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetProfile, useToggleFollow } from '@workspace/api-client-react';
import { ChevronLeft, User, Settings } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuthStore';

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const colors = useColors();
  const router = useRouter();

  const { data: profile, isLoading, refetch } = useGetProfile(handle, { query: { queryKey: ['profile', handle] } });
  const toggleFollow = useToggleFollow();

  const handleFollow = () => {
    toggleFollow.mutate({ handle }, {
      onSuccess: () => refetch()
    });
  };

  if (isLoading || !profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={colors.foreground} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>{profile.founder.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatarLarge, { backgroundColor: profile.founder.avatarColor || colors.primary }]}>
            <User color="#fff" size={40} />
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{profile.postCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Posts</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{profile.followerCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{profile.followingCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={[styles.name, { color: colors.foreground }]}>{profile.founder.name}</Text>
          <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{profile.founder.handle}</Text>
          {profile.founder.bio && (
            <Text style={[styles.bio, { color: colors.foreground }]}>{profile.founder.bio}</Text>
          )}
          {profile.founder.website && (
            <Text style={[styles.website, { color: colors.primary }]}>{profile.founder.website}</Text>
          )}
        </View>

        <TouchableOpacity 
          style={[
            styles.followButton, 
            { 
              backgroundColor: profile.founder.isFollowing ? colors.background : colors.primary,
              borderColor: profile.founder.isFollowing ? colors.border : colors.primary,
              borderWidth: 1
            }
          ]}
          onPress={handleFollow}
          disabled={toggleFollow.isPending}
        >
          <Text style={[
            styles.followButtonText, 
            { color: profile.founder.isFollowing ? colors.foreground : colors.primaryForeground }
          ]}>
            {profile.founder.isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>

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
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  content: { padding: 16 },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginLeft: 24,
  },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  infoSection: { marginBottom: 16 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  handle: { fontFamily: 'Inter_400Regular', fontSize: 16, marginBottom: 8 },
  bio: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 22, marginBottom: 4 },
  website: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  followButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  followButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
});
