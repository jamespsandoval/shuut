import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetProfile, useUpdateProfile, useRequestUploadUrl, Post } from '@workspace/api-client-react';
import { X, MapPin, Link as LinkIcon, Camera } from 'lucide-react-native';
import { Image } from 'expo-image';
import { createEditableProfileUpdate } from '../../lib/profileUpdate';
import { PostCard } from '../../components/PostCard';
import * as ImagePicker from 'expo-image-picker';
import { authenticatedImageSource, resolveApiUrl } from '../../lib/apiUrl';
import { useAuth } from '../../hooks/useAuthStore';

export default function MyProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  const { data: profileData, isLoading: isProfileLoading, refetch } = useGetProfile("me", { query: { queryKey: ['profile', 'me'] } });

  const updateProfile = useUpdateProfile();
  const requestUploadUrl = useRequestUploadUrl();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedSignature = useRef('');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (profileData?.founder && !isEditing) {
      setName(profileData.founder.name);
      setHandle(profileData.founder.handle);
      setBio(profileData.founder.bio || '');
      setLocation(profileData.founder.location || '');
      setWebsite(profileData.founder.website || '');
      lastSavedSignature.current = JSON.stringify({
        name: profileData.founder.name,
        handle: profileData.founder.handle,
        bio: profileData.founder.bio || '',
        location: profileData.founder.location || '',
        website: profileData.founder.website || '',
      });
    }
  }, [profileData, isEditing]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const styleId = 'shuut-profile-input-focus-reset';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input[id^="shuut-profile-"],
      textarea[id^="shuut-profile-"],
      input[id^="shuut-profile-"]:focus,
      textarea[id^="shuut-profile-"]:focus,
      input[id^="shuut-profile-"]:focus-visible,
      textarea[id^="shuut-profile-"]:focus-visible {
        appearance: none !important;
        -webkit-appearance: none !important;
        outline: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => style.remove();
  }, []);

  const pickAvatar = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to choose a profile picture.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const contentType = asset.mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      Alert.alert('Unsupported image', 'Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 3_000_000) {
      Alert.alert('Image too large', 'Choose an image smaller than 3MB.');
      return;
    }
    setSelectedAvatar(asset);
  };

  const uploadAvatar = async (asset: ImagePicker.ImagePickerAsset): Promise<string> => {
    const contentType = (asset.mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';
    const imageResponse = await fetch(asset.uri);
    const imageBlob = await imageResponse.blob();
    if (imageBlob.size > 3_000_000) {
      throw new Error('Choose an image smaller than 3MB.');
    }

    const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
      data: {
        name: asset.fileName || `profile-${Date.now()}.jpg`,
        size: imageBlob.size,
        contentType,
      },
    });
    const uploadResponse = await fetch(resolveApiUrl(uploadURL)!, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: imageBlob,
      credentials: 'omit',
    });
    if (!uploadResponse.ok) {
      throw new Error('The profile photo upload failed. Please try again.');
    }
    return objectPath;
  };

  const currentProfileSignature = () => JSON.stringify({
    name: name.trim(),
    handle: handle.trim(),
    bio,
    location,
    website,
  });

  const persistProfile = async (): Promise<boolean> => {
    if (!name.trim() || !handle.trim()) {
      setSaveStatus('error');
      return false;
    }
    if (isSaving) return false;

    const signature = currentProfileSignature();
    if (signature === lastSavedSignature.current && !selectedAvatar) {
      return true;
    }

    try {
      setIsSaving(true);
      setSaveStatus('saving');
      const avatarObjectPath = selectedAvatar ? await uploadAvatar(selectedAvatar) : undefined;
      await updateProfile.mutateAsync({
        handle: 'me',
        data: {
          ...createEditableProfileUpdate(
            name.trim(),
            handle.trim(),
            bio,
            location,
            website,
            profileData?.founder?.previewTranscript || false,
          ),
          ...(avatarObjectPath ? { avatarObjectPath } : {}),
        },
      });
      lastSavedSignature.current = signature;
      setSelectedAvatar(null);
      setSaveStatus('saved');
      void refetch();
      return true;
    } catch (error) {
      setSaveStatus('error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isEditing || !profileData?.founder) return;

    const hasChanges = currentProfileSignature() !== lastSavedSignature.current || Boolean(selectedAvatar);
    if (!hasChanges || !name.trim() || !handle.trim()) return;

    setSaveStatus('idle');
    autoSaveTimer.current = setTimeout(() => {
      void persistProfile();
    }, selectedAvatar ? 150 : 700);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [name, handle, bio, location, website, selectedAvatar, isEditing, isSaving]);

  const closeEditor = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const saved = await persistProfile();
    if (!saved) return;
    setIsEditing(false);
    setSaveStatus('idle');
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
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Platform.OS === 'web' ? 52 : 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{profileData?.founder?.name}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{profileData?.postCount || 0} SHÜÜTs</Text>
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
            style={[styles.editProfileBtn, { borderColor: colors.border }]}
            onPress={() => {
              setSaveStatus('idle');
              setIsEditing(true);
            }}
          >
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
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: Platform.OS === 'web' ? 52 : 16 }]}>
            <TouchableOpacity
              onPress={closeEditor}
              disabled={isSaving}
              style={styles.iconButton}
            >
              <X color={colors.foreground} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit profile</Text>
            <View style={styles.saveStatus}>
              {saveStatus === 'saving' && <ActivityIndicator color={colors.primary} size="small" />}
              <Text
                style={[
                  styles.saveStatusText,
                  { color: saveStatus === 'error' ? colors.destructive : colors.mutedForeground },
                ]}
              >
                {saveStatus === 'saving'
                  ? 'Saving…'
                  : saveStatus === 'saved'
                    ? 'Saved'
                    : saveStatus === 'error'
                      ? 'Not saved'
                      : ''}
              </Text>
            </View>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <TouchableOpacity style={styles.editAvatarContainer} onPress={pickAvatar} activeOpacity={0.8}>
                {selectedAvatar?.uri || profileData?.founder?.avatarUrl ? (
                  <Image
                    source={
                      selectedAvatar?.uri
                        ? { uri: selectedAvatar.uri }
                        : authenticatedImageSource(profileData!.founder.avatarUrl!, token)
                    }
                    style={styles.avatarEdit}
                  />
                ) : (
                  <View style={[styles.avatarEdit, { backgroundColor: profileData?.founder?.avatarColor || colors.primary }]}>
                    <Text style={{color: '#fff', fontSize: 32, fontFamily: 'Inter_700Bold'}}>{profileData?.founder?.name?.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.cameraIconOverlay}>
                  <Camera color="#fff" size={20} />
                </View>
                <Text style={[styles.changePhotoText, { color: colors.primary }]}>Change profile photo</Text>
              </TouchableOpacity>

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>NAME</Text>
              <TextInput
                nativeID="shuut-profile-name"
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>HANDLE</Text>
              <TextInput
                nativeID="shuut-profile-handle"
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={handle}
                onChangeText={setHandle}
                placeholder="@handle"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>BIO</Text>
              <TextInput
                nativeID="shuut-profile-bio"
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
                nativeID="shuut-profile-location"
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                value={location}
                onChangeText={setLocation}
                placeholder="Location"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>WEBSITE</Text>
              <TextInput
                nativeID="shuut-profile-website"
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
  saveStatus: {
    minWidth: 72,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  saveStatusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
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
  changePhotoText: {
    marginTop: 10,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textAlign: 'center',
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
  charCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'right',
    marginTop: -16,
    marginBottom: 24,
  }
});
