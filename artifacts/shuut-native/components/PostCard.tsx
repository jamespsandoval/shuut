import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Share, Platform, ActivityIndicator, AppState, Linking, Alert, useWindowDimensions } from 'react-native';
import { useColors } from '../hooks/useColors';
import { Post, useDeletePost, useSetReaction, useCreatePostShareLink, useReshuutPost, useCreatePostComment, useRequestUploadUrl, useGetPostComments, useUpdatePost, useGetProfile } from '@workspace/api-client-react';
import { useRouter, usePathname } from 'expo-router';
import { Trash2, Mic, Share as ShareIcon, Repeat2, Send, Square, Pencil, ImagePlus, X } from 'lucide-react-native';
import { SafetyActionSheet } from './SafetyActionSheet';
import { AuthenticatedAudioPlayer } from './AuthenticatedAudioPlayer';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { prepareNativePostPhoto, photoUploadError } from '../lib/postPhoto';
import { useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { authenticatedImageSource, resolveApiUrl } from '../lib/apiUrl';
import { useAuth } from '../hooks/useAuthStore';
import { SPEECH_RECORDING_OPTIONS } from '../lib/audioRecording';
import { formatApproximateTimeAgo } from '../lib/relativeTime';
import { useVoiceConsentCheck } from '../hooks/useVoiceConsentCheck';
import { VoiceAiConsentModal } from './VoiceAiConsentModal';

export function PostCard({
  post,
  refetchFeed,
  isDetail = false,
  disableAuthorNavigation = false,
  onReply,
  onRevealReshuut,
}: {
  post: Post;
  refetchFeed: () => void;
  isDetail?: boolean;
  disableAuthorNavigation?: boolean;
  onReply?: () => void;
  onRevealReshuut?: (distance: number) => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const pendingReshuutRevealRef = useRef(false);
  const reshuutPanelRef = useRef<View>(null);
  const { token } = useAuth();
  const { data: viewerProfile } = useGetProfile('me', { query: { queryKey: ['profile', 'me'] } });

  const deletePost = useDeletePost();
  const setReaction = useSetReaction();
  const createShareLink = useCreatePostShareLink();
  const reshuutPost = useReshuutPost();
  const updatePost = useUpdatePost();

  const [showCommentComposer, setShowCommentComposer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.transcript);

  // Comment composer state
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const interruptedRef = useRef(false);
  const interruptAlertedRef = useRef(false);
  const pendingStartRef = useRef(false);
  const stoppingRef = useRef(false);
  const recordingStartedRef = useRef(false);
  const previousRecordingStateRef = useRef(false);
  const isRecordingRef = useRef(false);
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS, (status) => {
    if (status.mediaServicesDidReset && isRecordingRef.current) {
      interruptedRef.current = true;
      generationRef.current += 1;
    }
  });
  const recorderState = useAudioRecorderState(recorder);
  isRecordingRef.current = recorderState.isRecording || recordingStartedRef.current;
  const pathname = usePathname();
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showReshuutComposer, setShowReshuutComposer] = useState(false);
  const [showReshuutMenu, setShowReshuutMenu] = useState(false);
  const [reshuutPhoto, setReshuutPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [postPhotoRatio, setPostPhotoRatio] = useState(4 / 3);
  const [reshuutPhotoRatio, setReshuutPhotoRatio] = useState(4 / 3);
  const [reshuutImagePath, setReshuutImagePath] = useState<string | null>(null);

  const requestUploadUrl = useRequestUploadUrl();
  const createComment = useCreatePostComment();

  const restoreAudioMode = () => setAudioModeAsync({
    allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false,
    allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
  }).catch(() => undefined);

  const discardRecording = async (notify = false) => {
    const wasRecording = isRecordingRef.current;
    const wasPending = pendingStartRef.current;
    pendingStartRef.current = false;
    generationRef.current += 1;
    if (wasRecording) {
      stoppingRef.current = true;
      await recorder.stop().catch(() => undefined);
      stoppingRef.current = false;
      recordingStartedRef.current = false;
      isRecordingRef.current = false;
      previousRecordingStateRef.current = false;
      setRecordedUri(null);
    }
    if (wasRecording || wasPending) await restoreAudioMode();
    if (notify && wasRecording && !interruptAlertedRef.current) {
      interruptAlertedRef.current = true;
    }
  };

  const {
    checkConsent,
    showModal,
    onAccept,
    onDecline,
    isLoading: isConsentLoading,
    isError: isConsentError
  } = useVoiceConsentCheck();

  const { data: comments, refetch: refetchComments } = useGetPostComments(post.id, {
    query: { enabled: showCommentComposer, queryKey: ['comments', post.id] }
  });

  const handleDelete = () => {
    deletePost.mutate({ postId: post.id }, { onSuccess: refetchFeed });
  };

  const handleReaction = (emojiType: 'rocket' | 'laughing' | 'thumbsDown') => {
    setReaction.mutate({ postId: post.id, data: { emojiType } }, { onSuccess: refetchFeed });
  };

  const handleReshuut = () => {
    if (reshuutPost.isPending) return;
    pendingReshuutRevealRef.current = !showReshuutMenu;
    setShowReshuutMenu(!showReshuutMenu);
  };

  const toggleReshuutNow = async () => {
    setShowReshuutMenu(false);
    try {
      await reshuutPost.mutateAsync({ postId: post.id });
      refetchFeed();
    } catch (error) {
      Alert.alert('Could not reSHÜÜT', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const revealReshuutPanel = () => {
    if (!pendingReshuutRevealRef.current) return;
    requestAnimationFrame(() => {
      reshuutPanelRef.current?.measureInWindow((_x, y, _width, height) => {
        if (!pendingReshuutRevealRef.current) return;
        pendingReshuutRevealRef.current = false;
        const bottom = windowHeight - (isDetail ? 48 : 104);
        const distance = Math.min(180, Math.max(0, y + Math.min(height, 180) - bottom + 12));
        if (distance > 0) onRevealReshuut?.(distance);
      });
    });
  };

  const handleReply = () => {
    if (onReply) {
      onReply();
      return;
    }
    if (showCommentComposer) return;
    setShowCommentComposer(true);
    void startRecording();
  };

  const cancelReply = async () => {
    await discardRecording(false);
    setRecordedUri(null);
    setShowCommentComposer(false);
  };

  const chooseReshuutPhoto = () => {
    Alert.alert('Attach a photo', 'Choose where to get your reSHÜÜT photo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take photo', onPress: () => void captureReshuutPhoto(true) },
      { text: 'Photo library', onPress: () => void captureReshuutPhoto(false) },
    ]);
  };

  const captureReshuutPhoto = async (useCamera: boolean) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(useCamera ? 'Camera access needed' : 'Photo access needed', permission.canAskAgain ? `Allow ${useCamera ? 'camera' : 'photo'} access to attach a photo.` : `Enable ${useCamera ? 'camera' : 'photo'} access in Settings.`, permission.canAskAgain ? [{ text: 'Not now', style: 'cancel' }] : [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() }]);
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.82 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible, quality: 0.82, selectionLimit: 1 });
      if (!result.canceled && result.assets[0]) {
        const prepared = await prepareNativePostPhoto(result.assets[0], 'reshuut-photo');
        setReshuutPhoto({
          ...result.assets[0],
          uri: prepared.file.uri,
          mimeType: prepared.contentType,
          fileName: prepared.name,
        });
        setReshuutImagePath(null);
      }
    } catch (error) {
      console.error('Could not choose reSHÜÜT photo', error);
      Alert.alert('Photo unavailable', error instanceof Error ? error.message : 'We could not open your camera or photo library. Please try again.');
    }
  };

  const uploadReshuutPhoto = async (): Promise<string | undefined> => {
    if (!reshuutPhoto) return undefined;
    if (reshuutImagePath) return reshuutImagePath;
    const { file, name, contentType } = await prepareNativePostPhoto(reshuutPhoto, 'reshuut-photo');
    const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({ data: { name, size: file.size, contentType } });
    const fullUrl = resolveApiUrl(uploadURL);
    if (!fullUrl) throw new Error('Photo upload URL was empty.');
    const uploaded = await file.upload(fullUrl, { httpMethod: 'PUT', headers: { 'Content-Type': contentType } });
    if (uploaded.status < 200 || uploaded.status >= 300) throw photoUploadError(uploaded.status, uploaded.body);
    setReshuutImagePath(objectPath);
    return objectPath;
  };

  const publishReshuut = async () => {
    if (!recordedUri) return;
    try {
      setIsUploading(true);
      const imageObjectPath = await uploadReshuutPhoto();
      let audioObjectPath: string | undefined;
      if (recordedUri) {
        const file = new File(recordedUri);
        if (!file.exists) throw new Error('Recorded commentary is no longer available.');
        const upload = await requestUploadUrl.mutateAsync({ data: { name: 'reshuut-commentary.m4a', size: file.size, contentType: 'audio/mp4' } });
        const fullUrl = resolveApiUrl(upload.uploadURL);
        if (!fullUrl) throw new Error('Audio upload URL was empty.');
        const uploaded = await file.upload(fullUrl, { httpMethod: 'PUT', headers: { 'Content-Type': 'audio/mp4' } });
        if (uploaded.status < 200 || uploaded.status >= 300) throw new Error(`Audio upload failed: ${uploaded.status}`);
        audioObjectPath = upload.objectPath;
      }
      await reshuutPost.mutateAsync({
        postId: post.id,
        data: {
          ...(audioObjectPath ? { audioObjectPath, durationSeconds: duration } : {}),
          ...(imageObjectPath ? { imageObjectPath } : {}),
        },
      });
      setShowReshuutComposer(false);
      setReshuutPhoto(null);
      setReshuutImagePath(null);
      setRecordedUri(null);
      refetchFeed();
    } catch (error) {
      console.error('Failed to publish reSHÜÜT', error);
      Alert.alert('Could not reSHÜÜT', error instanceof Error && /photo|image|JPEG|PNG|WebP/i.test(error.message)
        ? error.message : 'Your reSHÜÜT could not be processed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = async () => {
    const transcript = editText.trim();
    if (!transcript || updatePost.isPending) return;

    await updatePost.mutateAsync({
      postId: post.id,
      data: { transcript },
    });
    setIsEditing(false);
    refetchFeed();
  };

  const handleShare = async () => {
    try {
      const { url } = await createShareLink.mutateAsync({ postId: post.id });
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ url });
        } else {
          await navigator.clipboard.writeText(url);
        }
      } else {
        await Share.share({ url, message: `Listen to this on SHÜÜT: ${url}` });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const canShowReshuut = Boolean(
    post.reshuut
      && post.reshuut.moderationStatus !== 'quarantined'
      && post.reshuut.moderationStatus !== 'removed'
      && (
        post.reshuut.moderationStatus === 'approved'
        || post.reshuut.mode === 'text'
        || post.reshuut.transcriptionStatus === 'ready'
      )
  );

  const startRecording = async () => {
    const generation = ++generationRef.current;
    pendingStartRef.current = true;
    const { error } = await checkConsent(async () => {
      try {
        const perm = await getRecordingPermissionsAsync();
        if (perm.status !== 'granted') {
          const newPerm = await requestRecordingPermissionsAsync();
          if (newPerm.status !== 'granted') {
            Alert.alert('Microphone access needed', 'Enable microphone access in Settings, then try again.', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() },
            ]);
            return;
          }
        }
        if (!mountedRef.current || generation !== generationRef.current || AppState.currentState !== 'active') return;
        if (generation !== generationRef.current) return;
        setRecordedUri(null);
        await setAudioModeAsync({
          allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false,
          allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
        });
        if (!mountedRef.current || generation !== generationRef.current || AppState.currentState !== 'active') {
          pendingStartRef.current = false;
          await restoreAudioMode(); return;
        }
        await recorder.prepareToRecordAsync();
        if (!mountedRef.current || generation !== generationRef.current || AppState.currentState !== 'active') {
          pendingStartRef.current = false;
          await restoreAudioMode(); return;
        }
        recorder.record();
        pendingStartRef.current = false;
        recordingStartedRef.current = true;
        isRecordingRef.current = true;
      } catch (err) {
        pendingStartRef.current = false;
        await restoreAudioMode();
        console.error('Failed to start recording', err);
      }
    });

    if (error) {
      Alert.alert('Error', 'Could not verify voice consent. Please try again.');
    }
    pendingStartRef.current = false;
  };

  const stopRecording = async () => {
    generationRef.current += 1;
    pendingStartRef.current = false;
    stoppingRef.current = true;
    try {
      await recorder.stop();
      recordingStartedRef.current = false;
      isRecordingRef.current = false;
      previousRecordingStateRef.current = false;
      const uri = recorder.uri;
      if (uri) {
        setRecordedUri(uri);
        const finalDuration = Math.round((recorderState?.durationMillis ? recorderState.durationMillis / 1000 : 0) || 1);
        setDuration(finalDuration);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    } finally {
      stoppingRef.current = false;
      await restoreAudioMode();
    }
  };

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 90_000) {
      void stopRecording();
    }
  }, [recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => {
    if (previousRecordingStateRef.current && !recorderState.isRecording && !stoppingRef.current) {
      interruptedRef.current = true;
      recordingStartedRef.current = false;
      interruptAlertedRef.current = true;
      setRecordedUri(null);
      void discardRecording(false);
    }
    previousRecordingStateRef.current = recorderState.isRecording;
    if (interruptedRef.current && !recorderState.isRecording) {
      interruptedRef.current = false;
      setRecordedUri(null);
      interruptAlertedRef.current = true;
      void discardRecording(false);
    }
  }, [recorderState.isRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (isRecordingRef.current || pendingStartRef.current) void discardRecording(true);
      }
      else if (interruptAlertedRef.current) {
        interruptAlertedRef.current = false;
        Alert.alert('Recording interrupted', 'Your voice comment was discarded. Please record it again.');
      }
    });
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      void discardRecording(false);
      subscription.remove();
    };
  }, [recorder]);

  useEffect(() => () => {
    if (isRecordingRef.current || pendingStartRef.current) void discardRecording(true);
  }, [pathname]);

  const publishComment = async () => {
    if (!recordedUri) return;
    try {
      setIsUploading(true);
      const fileObj = new File(recordedUri);

      if (!fileObj.exists) {
        throw new Error('Recorded comment file does not exist');
      }

      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: { name: 'comment.m4a', size: fileObj.size, contentType: 'audio/mp4' }
      });

      const fullUrl = resolveApiUrl(uploadURL);
      if (!fullUrl) throw new Error('Upload URL was empty.');

      const uploadResult = await fileObj.upload(fullUrl, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'audio/mp4' },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Failed to upload voice comment: ${uploadResult.status}`);
      }

      if (!mountedRef.current || AppState.currentState !== 'active') return;
      await createComment.mutateAsync({
        postId: post.id,
        data: { audioObjectPath: objectPath, durationSeconds: duration }
      });

      setRecordedUri(null);
      refetchComments();
      refetchFeed();
    } catch (err) {
      console.error('Failed to publish comment', err);
    } finally {
      setIsUploading(false);
    }
  };

  const InnerCard = (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {post.isReshuuted && post.reshuutedBy && (
        <View style={styles.reshuutHeader}>
          <Repeat2 color={colors.mutedForeground} size={14} />
          <Text style={[styles.reshuutText, { color: colors.mutedForeground }]}>{post.reshuutedBy} RESHÜÜTED</Text>
          {!post.reshuut && (
            <TouchableOpacity onPress={() => router.push(post.canDelete ? '/(main)/profile' : `/profile/${post.author.handle}`)} accessibilityRole="link" accessibilityLabel={`Tagged publisher @${post.author.handle}`}>
              <Text style={[styles.reshuutPublisherHandle, { color: colors.primary }]}>Tagged: @{post.author.handle}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.postHeader}>
        <TouchableOpacity
          style={styles.authorInfo}
          onPress={disableAuthorNavigation ? undefined : () => router.push(
            post.canDelete ? '/(main)/profile' : `/profile/${post.author.handle}`,
          )}
          disabled={disableAuthorNavigation}
        >
          {post.author.avatarUrl ? (
            <Image source={authenticatedImageSource(post.author.avatarUrl, token)} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: post.author.avatarColor || colors.primary }]}>
              <Text style={{color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 18}}>{post.author.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={[styles.authorName, { color: colors.foreground }]}>{post.author.name}</Text>
            <Text style={[styles.authorHandle, { color: colors.mutedForeground }]}>@{post.author.handle}</Text>
          </View>
        </TouchableOpacity>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {formatApproximateTimeAgo(post.createdAt)}
        </Text>
        <SafetyActionSheet targetType="post" targetId={post.id} authorHandle={post.author.handle} self={post.canDelete || post.author.handle === viewerProfile?.founder?.handle} onBlocked={() => router.back()} />
      </View>

      {isEditing ? (
        <View style={styles.editComposer}>
          <TextInput
            style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]}
            value={editText}
            onChangeText={setEditText}
            multiline
            maxLength={5000}
            autoFocus
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              onPress={() => {
                setEditText(post.transcript);
                setIsEditing(false);
              }}
              disabled={updatePost.isPending}
            >
              <Text style={[styles.editActionText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editSaveButton, { backgroundColor: colors.primary }]}
              onPress={handleEdit}
              disabled={!editText.trim() || updatePost.isPending}
            >
              {updatePost.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.editSaveText, { color: colors.primaryForeground }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <Text selectable style={[styles.transcript, { color: colors.foreground }]} numberOfLines={isDetail ? undefined : 3}>
            {post.transcript}
          </Text>
          {!isDetail && (
            <TouchableOpacity
              onPress={() => router.push(`/post/${post.id}`)}
              accessibilityRole="link"
              accessibilityLabel="View full SHÜÜT"
              style={{ alignSelf: 'flex-start', marginTop: 4, marginBottom: 12 }}
            >
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>View full SHÜÜT</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {post.imageUrl && (
        <Image
          source={authenticatedImageSource(post.imageUrl, token)}
          style={[styles.postImage, { aspectRatio: postPhotoRatio }]}
          contentFit="contain"
          onLoad={(event) => {
            if (event.source.width > 0 && event.source.height > 0) {
              setPostPhotoRatio(Math.max(0.65, Math.min(2, event.source.width / event.source.height)));
            }
          }}
          accessibilityLabel="Photo attached to this SHÜÜT"
        />
      )}
      <AuthenticatedAudioPlayer url={post.audioUrl} durationSeconds={post.durationSeconds} />

      {canShowReshuut && post.reshuut && (
        <View style={[styles.reshuutContent, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.reshuutContentLabel, { color: colors.mutedForeground }]}>reSHÜÜT by @{post.reshuut.author.handle}</Text>
          <View style={styles.reshuutPublisherRow}>
            <Text style={[styles.reshuutPublisherCaption, { color: colors.mutedForeground }]}>Publisher tagged</Text>
            <TouchableOpacity
              onPress={() => router.push(post.canDelete ? '/(main)/profile' : `/profile/${post.author.handle}`)}
              accessibilityRole="link"
              accessibilityLabel={`Tagged publisher @${post.author.handle}`}
            >
              <Text style={[styles.reshuutPublisherHandle, { color: colors.primary }]}>@{post.author.handle}</Text>
            </TouchableOpacity>
          </View>
          {post.reshuut.mode === 'text' && post.reshuut.text && (
            <Text selectable style={[styles.reshuutContentText, { color: colors.foreground }]}>{post.reshuut.text}</Text>
          )}
          {post.reshuut.mode === 'audio' && (
            <AuthenticatedAudioPlayer url={post.reshuut.audioUrl} durationSeconds={post.reshuut.durationSeconds ?? 1} />
          )}
          {post.reshuut.transcriptionStatus === 'processing' && (
            <Text style={[styles.reshuutStatus, { color: colors.mutedForeground }]}>Transcribing reSHÜÜT commentary…</Text>
          )}
          {post.reshuut.imageUrl && (
            <Image
              source={authenticatedImageSource(post.reshuut.imageUrl, token)}
              style={[styles.reshuutImage, { aspectRatio: reshuutPhotoRatio }]}
              contentFit="contain"
              onLoad={(event) => {
                if (event.source.width > 0 && event.source.height > 0) {
                  setReshuutPhotoRatio(Math.max(0.65, Math.min(2, event.source.width / event.source.height)));
                }
              }}
              accessibilityLabel="Photo attached to this reSHÜÜT"
            />
          )}
        </View>
      )}

      {showReshuutMenu && (
        <View ref={reshuutPanelRef} onLayout={revealReshuutPanel} style={[styles.reshuutMenu, { borderColor: colors.border, backgroundColor: colors.background }]}>
          {post.isReshuuted ? (
            <TouchableOpacity style={styles.reshuutMenuOption} onPress={() => void toggleReshuutNow()} accessibilityRole="button" accessibilityLabel="Remove reSHÜÜT">
              <X color={colors.mutedForeground} size={19} />
              <Text style={[styles.reshuutMenuText, { color: colors.foreground }]}>Remove reSHÜÜT</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.reshuutMenuOption} onPress={() => void toggleReshuutNow()} accessibilityRole="button" accessibilityLabel="reSHÜÜT Now">
                <Repeat2 color={colors.primary} size={19} />
                <Text style={[styles.reshuutMenuText, { color: colors.foreground }]}>reSHÜÜT Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reshuutMenuOption} onPress={() => { setShowReshuutMenu(false); pendingReshuutRevealRef.current = true; setShowReshuutComposer(true); }} accessibilityRole="button" accessibilityLabel="Add Voice Note to reSHÜÜT">
                <Mic color={colors.primary} size={19} />
                <Text style={[styles.reshuutMenuText, { color: colors.foreground }]}>Add Voice Note</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {showReshuutComposer && !post.isReshuuted && (
        <View ref={reshuutPanelRef} onLayout={revealReshuutPanel} style={[styles.reshuutComposer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.reshuutComposerTitle, { color: colors.foreground }]}>Add to your reSHÜÜT</Text>
          <View style={styles.reshuutPublisherRow}>
            <Text style={[styles.reshuutPublisherCaption, { color: colors.mutedForeground }]}>Tagging publisher</Text>
            <View style={[styles.reshuutPublisherPill, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.reshuutPublisherHandle, { color: colors.primary }]}>@{post.author.handle}</Text>
            </View>
            <Text style={[styles.reshuutPublisherCaption, { color: colors.mutedForeground }]}>{post.canDelete ? 'Your SHÜÜT' : 'Notified on publish'}</Text>
          </View>
          <View style={styles.reshuutVoiceRow}>
            {recordedUri ? (
              <>
                <AuthenticatedAudioPlayer url={recordedUri} durationSeconds={duration} />
                <TouchableOpacity onPress={() => setRecordedUri(null)} accessibilityLabel="Discard recorded reSHÜÜT voice note">
                  <X color={colors.mutedForeground} size={20} />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.reshuutVoiceButton} onPress={recorderState.isRecording ? stopRecording : startRecording} accessibilityLabel={recorderState.isRecording ? 'Stop reSHÜÜT voice note recording' : 'Record reSHÜÜT voice note'}>
                {recorderState.isRecording ? <Square color={colors.destructive} size={18} /> : <Mic color={colors.primary} size={18} />}
                <Text style={[styles.reshuutModeText, { color: colors.foreground }]}>{recorderState.isRecording ? 'Stop recording' : 'Record voice note'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {reshuutPhoto ? (
            <View style={styles.reshuutPhotoPreviewWrap}>
              <Image source={{ uri: reshuutPhoto.uri }} style={styles.reshuutPhotoPreview} contentFit="contain" />
              <TouchableOpacity style={styles.reshuutPhotoRemove} onPress={() => { setReshuutPhoto(null); setReshuutImagePath(null); }} accessibilityLabel="Remove reSHÜÜT photo">
                <X color="#fff" size={16} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPhotoButton} onPress={() => void chooseReshuutPhoto()} accessibilityLabel="Add a reSHÜÜT photo">
              <ImagePlus color={colors.primary} size={18} />
              <Text style={[styles.reshuutModeText, { color: colors.primary }]}>Add photo</Text>
            </TouchableOpacity>
          )}
          <View style={styles.reshuutComposerActions}>
            <TouchableOpacity onPress={() => setShowReshuutComposer(false)} accessibilityLabel="Cancel reSHÜÜT">
              <Text style={[styles.editActionText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.publishCommentBtn, { backgroundColor: colors.primary, opacity: recordedUri && !isUploading ? 1 : 0.5 }]} onPress={() => void publishReshuut()} disabled={isUploading || !recordedUri}>
              {isUploading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Send color={colors.primaryForeground} size={14} />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.reactionsRow}>
        <TouchableOpacity style={[styles.reactionBtn, post.viewerReaction === 'rocket' && { backgroundColor: `${colors.primary}1A` }]} onPress={() => handleReaction('rocket')}>
          <Text style={styles.emojiText}>🚀</Text>
          {post.reactions.rocket > 0 && <Text style={[styles.reactionCount, { color: post.viewerReaction === 'rocket' ? colors.primary : colors.mutedForeground }]}>{post.reactions.rocket}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.reactionBtn, post.viewerReaction === 'laughing' && { backgroundColor: `${colors.primary}1A` }]} onPress={() => handleReaction('laughing')}>
          <Text style={styles.emojiText}>😂</Text>
          {post.reactions.laughing > 0 && <Text style={[styles.reactionCount, { color: post.viewerReaction === 'laughing' ? colors.primary : colors.mutedForeground }]}>{post.reactions.laughing}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.reactionBtn, post.viewerReaction === 'thumbsDown' && { backgroundColor: `${colors.primary}1A` }]} onPress={() => handleReaction('thumbsDown')}>
          <Text style={styles.emojiText}>👎</Text>
          {post.reactions.thumbsDown > 0 && <Text style={[styles.reactionCount, { color: post.viewerReaction === 'thumbsDown' ? colors.primary : colors.mutedForeground }]}>{post.reactions.thumbsDown}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleReply} accessibilityRole="button" accessibilityLabel="Reply with a voice note">
          <Mic color={colors.mutedForeground} size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleReshuut} accessibilityRole="button" accessibilityLabel="reSHÜÜT options" disabled={reshuutPost.isPending}>
          <Repeat2 color={post.isReshuuted ? '#22C55E' : colors.mutedForeground} size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <ShareIcon color={colors.mutedForeground} size={18} />
        </TouchableOpacity>
        {post.canEdit && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => setIsEditing(true)}>
            <Pencil color={colors.mutedForeground} size={18} />
          </TouchableOpacity>
        )}
        {post.canDelete && (
          <TouchableOpacity style={styles.actionBtn} onPress={handleDelete} disabled={deletePost.isPending}>
            <Trash2 color={colors.mutedForeground} size={18} />
          </TouchableOpacity>
        )}
      </View>

      {!isDetail && showCommentComposer && (
        <View style={styles.commentSection}>
          <View style={[styles.composerContainer, { borderColor: colors.border }]}>
            <View style={styles.replyComposerHeader}>
              <Text style={[styles.replyComposerTitle, { color: colors.foreground }]}>Voice reply</Text>
              <TouchableOpacity onPress={() => void cancelReply()} disabled={isUploading} accessibilityRole="button" accessibilityLabel="Cancel voice reply" hitSlop={8}>
                <Text style={[styles.replyCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {recordedUri ? (
              <View style={styles.composerActions}>
                <View style={{ flex: 1, marginRight: 8 }}>
                   <AuthenticatedAudioPlayer url={recordedUri} durationSeconds={duration} />
                </View>
                <View style={styles.composerButtonsRow}>
                  <TouchableOpacity onPress={() => setRecordedUri(null)} disabled={isUploading}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13, marginRight: 8 }}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.publishCommentBtn, { backgroundColor: colors.primary }]}
                    onPress={publishComment}
                    disabled={isUploading}
                  >
                    {isUploading ? <ActivityIndicator size="small" color="#fff" /> : <Send color="#fff" size={14} />}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.composerActions}>
                <TouchableOpacity
                  style={[styles.recordBtnPlaceholder, { opacity: (isConsentLoading || isConsentError) ? 0.5 : 1 }]}
                  onPress={recorderState.isRecording ? stopRecording : startRecording}
                  disabled={isConsentLoading || isConsentError}
                >
                  <Mic color={colors.mutedForeground} size={16} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginLeft: 8 }}>
                    {recorderState.isRecording ? 'Recording...' : 'Add a voice comment...'}
                  </Text>
                </TouchableOpacity>
                {recorderState.isRecording && (
                   <TouchableOpacity
                    style={[styles.publishCommentBtn, { backgroundColor: colors.destructive }]}
                    onPress={stopRecording}
                   >
                     <Square color="#fff" size={14} />
                   </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {comments?.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No comments yet. Be the first to reply!</Text>
          ) : (
            comments?.map(comment => (
              <View key={comment.id} style={[styles.commentCard, { borderTopColor: colors.border }]}>
                <View style={styles.commentHeader}>
                  <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.author.name}</Text>
                  <SafetyActionSheet targetType="comment" targetId={comment.id} authorHandle={comment.author.handle} self={comment.author.handle === viewerProfile?.founder?.handle} compact />
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {formatApproximateTimeAgo(comment.createdAt)}
                  </Text>
                </View>
                <AuthenticatedAudioPlayer url={comment.audioUrl} durationSeconds={comment.durationSeconds} />
              </View>
            ))
          )}
        </View>
      )}
      <VoiceAiConsentModal visible={showModal} onAccept={onAccept} onDecline={onDecline} />
    </View>
  );

  return InnerCard;
}

const styles = StyleSheet.create({
  postCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  reshuutHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  reshuutText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  authorHandle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  time: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 4,
  },
  transcript: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 440,
    borderRadius: 14,
    marginBottom: 12,
  },
  reshuutContent: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  reshuutContentLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  reshuutContentText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  reshuutStatus: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  reshuutImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 360,
    borderRadius: 10,
  },
  reshuutComposer: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    gap: 6,
  },
  reshuutMenu: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    marginBottom: 8,
  },
  reshuutMenuOption: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  reshuutMenuText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  reshuutComposerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  reshuutPublisherRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  reshuutPublisherCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  reshuutPublisherPill: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reshuutPublisherHandle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  reshuutModeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  reshuutVoiceRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reshuutVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  reshuutPhotoPreviewWrap: {
    height: 104,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  reshuutPhotoPreview: {
    width: '100%',
    height: '100%',
  },
  reshuutPhotoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
  },
  reshuutComposerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
  },
  editComposer: {
    marginBottom: 12,
  },
  editInput: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  editActions: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  editActionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  editSaveButton: {
    minWidth: 72,
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emojiText: {
    fontSize: 16,
  },
  reactionCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  commentSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  replyComposerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  replyComposerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  replyCancelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  composerContainer: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 16,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordBtnPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  composerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  publishCommentBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  commentCard: {
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAuthor: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  }
});
