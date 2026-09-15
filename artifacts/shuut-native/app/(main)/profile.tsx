import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Modal, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetProfile, useUpdateProfile, Post } from '@workspace/api-client-react';
import { Settings, User, X, MapPin, Link as LinkIcon, Camera } from 'lucide-react-native';
import { Image } from 'expo-image';
import { createEditableProfileUpdate } from '../../lib/profileUpdate';
import { PostCard } from '../../components/PostCard';

export default function MyProfileScreen() {
  const colors = useColors();
  const router = useRouter();

  const { data: profileData, isLoading: isProfileLoading, refetch } = useGetProfile("me", { query: { queryKey: ['profile', 'me'] } });

  const updateProfile = useUpdateProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [previewTranscript, setPreviewTranscript] = useState(false);

  useEffect(() => {
    if (profileData?.founder) {
      setName(profileData.founder.name);
      setHandle(profileData.founder.handle);
      setBio(profileData.founder.bio || '');
      setLocation(profileData.founder.location || '');
      setWebsite(profileData.founder.website || '');
      setPreviewTranscript(profileData.founder.previewTranscript || false);
    }
  }, [profileData, isEditing]);

  const handleSave = () => {
    if (!name || !handle) return;

    updateProfile.mutate(
      { handle: "me", data: createEditableProfileUpdate(name, handle, bio, location, website, previewTranscript) },
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{profileData?.founder?.name}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{profileData?.postCount || 0} SHÜÜTs</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileTop}>
          <View style={styles.avatarContainer}>
            {profileData?.founder?.avatarUrl ? (
              <Image source={{ uri: profileData.founder.avatarUrl }} style={styles.avatarLarge} />
            ) : (
              <View style={[styles.avatarLarge, { backgroundColor: profileData?.founder?.avatarColor || colors.primary }]}>
                <Text style={{color: '#fff', fontSize: 32, fontFamily: 'Inter_700Bold'}}>{profileData?.founder?.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={[styles.editProfileBtn, { borderColor: colors.border }]} onPress={() => setIsEditing(true)}>
            <Text style={[styles.editProfileText, { color: colors.foreground }]}>Edit profile</Text>
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

      <Modal visible={isEditing} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.iconButton}>
              <X color={colors.foreground} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit profile</Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary + '40' }]}
              onPress={handleSave}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={[styles.saveBtnText, { color: colors.primary }]}>Save</Text>}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.editAvatarContainer}>
                {profileData?.founder?.avatarUrl ? (
                  <Image source={{ uri: profileData.founder.avatarUrl }} style={styles.avatarEdit} />
                ) : (
                  <View style={[styles.avatarEdit, { backgroundColor: profileData?.founder?.avatarColor || colors.primary }]}>
                    <Text style={{color: '#fff', fontSize: 32, fontFamily: 'Inter_700Bold'}}>{profileData?.founder?.name?.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.cameraIconOverlay}>
                  <Camera color="#fff" size={20} />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>NAME</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor={colors.mutedForeground}
              />

              <View style={[styles.toggleContainer, { borderColor: colors.border }]}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Preview transcript before publishing</Text>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Review and edit the generated text before your SHÜÜT goes live.</Text>
                </View>
                <Switch
                  value={previewTranscript}
                  onValueChange={setPreviewTranscript}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>HANDLE</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={handle}
                onChangeText={setHandle}
                placeholder="@handle"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>BIO</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, minHeight: 80, textAlignVertical: 'top' }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Bio"
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={240}
              />
              <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{bio.length} / 240</Text>

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>LOCATION</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={location}
                onChangeText={setLocation}
                placeholder="Location"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>WEBSITE</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={website}
                onChangeText={setWebsite}
                placeholder="https://"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="url"
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
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
  editProfileBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
  },
  editProfileText: {
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
  },

  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  iconButton: { padding: 4 },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  modalContent: { padding: 24 },
  editAvatarContainer: {
    alignSelf: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  avatarEdit: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
  },
  cameraIconOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -10 }, { translateY: -10 }],
  },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    marginBottom: 24,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  toggleTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginBottom: 4,
  },
  toggleDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  charCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'right',
    marginTop: -16,
    marginBottom: 24,
  }
});
