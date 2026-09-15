import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetProfile, useUpdateProfile } from '@workspace/api-client-react';
import { Settings, User, Edit2, X, Check } from 'lucide-react-native';
import { Image } from 'expo-image';
import { createEditableProfileUpdate } from '../../lib/profileUpdate';

export default function MyProfileScreen() {
  const colors = useColors();
  const router = useRouter();

  const { data: profileData, isLoading: isProfileLoading, refetch } = useGetProfile("me", { query: { queryKey: ['profile', 'me'] } });
  const updateProfile = useUpdateProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (profileData?.founder) {
      setName(profileData.founder.name);
      setHandle(profileData.founder.handle);
      setBio(profileData.founder.bio || '');
    }
  }, [profileData]);

  const handleSave = () => {
    if (!name || !handle) return;
    
    updateProfile.mutate(
      { handle: "me", data: createEditableProfileUpdate(name, handle, bio) },
      {
        onSuccess: () => {
          setIsEditing(false);
          refetch();
        }
      }
    );
  };
  
  if (isProfileLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {isEditing ? (
              <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.iconButton}>
                <X color={colors.foreground} size={24} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.iconButton}>
                <Edit2 color={colors.foreground} size={24} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconButton}>
              <Settings color={colors.foreground} size={24} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {profileData?.founder?.avatarUrl ? (
              <Image source={{ uri: profileData.founder.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: profileData?.founder?.avatarColor || colors.primary }]}>
                <User color="#fff" size={32} />
              </View>
            )}
            
            {isEditing ? (
              <View style={styles.editForm}>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.input }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Name"
                  placeholderTextColor={colors.mutedForeground}
                />
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.input }]}
                  value={handle}
                  onChangeText={setHandle}
                  placeholder="Handle"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                />
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.input, minHeight: 80 }]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Bio"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
                <TouchableOpacity 
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSave}
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Save Changes</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.name, { color: colors.foreground }]}>{profileData?.founder?.name}</Text>
                <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{profileData?.founder?.handle}</Text>
                {profileData?.founder?.bio && <Text style={[styles.bio, { color: colors.foreground }]}>{profileData.founder.bio}</Text>}
              </>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{profileData?.postCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Posts</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{profileData?.followerCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{profileData?.followingCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  iconButton: { padding: 4 },
  content: { padding: 16 },
  card: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 20, marginBottom: 4 },
  handle: { fontFamily: 'Inter_400Regular', fontSize: 16, marginBottom: 12 },
  bio: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' },
  editForm: { width: '100%', gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  saveBtn: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 14 },
});
