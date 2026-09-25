import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { ImagePlus, Mic, Repeat2, Send, Share as ShareIcon, Square, X } from 'lucide-react-native';
import {
  Post,
  Reshuut,
  useCreateReshuutShareLink,
  useGetReshuut,
  useReshuutReshuut,
  useSetReshuutReaction,
  useRequestUploadUrl,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useColors } from '../hooks/useColors';
import { useAuth } from '../hooks/useAuthStore';
import { AuthenticatedAudioPlayer } from './AuthenticatedAudioPlayer';
import { PostCard } from './PostCard';
import { VoiceAiConsentModal } from './VoiceAiConsentModal';
import { useVoiceConsentCheck } from '../hooks/useVoiceConsentCheck';
import { prepareNativePostPhoto, photoUploadError } from '../lib/postPhoto';
import { authenticatedImageSource, resolveApiUrl } from '../lib/apiUrl';
import { SPEECH_RECORDING_OPTIONS } from '../lib/audioRecording';
import { useAudioRecorder, useAudioRecorderState, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

export function ReshuutCard({
  reshuut: initialReshuut,
  refetchFeed,
  onRevealReshuut,
  isDetail = false,
}: {
  reshuut: Reshuut;
  refetchFeed: () => void | Promise<unknown>;
  onRevealReshuut?: (distance: number) => void;
  isDetail?: boolean;
}) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { data: freshReshuutItem } = useGetReshuut(initialReshuut.id, {
    query: { queryKey: ['reshuut', initialReshuut.id], staleTime: 0, enabled: isDetail },
  });
  const reshuut = freshReshuutItem?.reshuut ?? initialReshuut;
  const setReaction = useSetReshuutReaction();
  const reshuutReshuut = useReshuutReshuut();
  const createShareLink = useCreateReshuutShareLink();
  const requestUploadUrl = useRequestUploadUrl();
  const [composerVisible, setComposerVisible] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const interruptedRef = useRef(false);
  const stoppingRef = useRef(false);
  const wasRecordingRef = useRef(false);
  const previousRecorderStateRef = useRef(false);
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS, (status) => {
    if (status.mediaServicesDidReset && recorderStateRef.current) interruptedRef.current = true;
  });
  const recorderState = useAudioRecorderState(recorder);
  const recorderStateRef = useRef(false);
  recorderStateRef.current = recorderState.isRecording;
  const {
    checkConsent, showModal, onAccept, onDecline, isLoading: consentLoading, isError: consentError,
  } = useVoiceConsentCheck();

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 90_000) void stopRecording();
    if (previousRecorderStateRef.current && !recorderState.isRecording && !stoppingRef.current) {
      wasRecordingRef.current = false;
      interruptedRef.current = true;
      setRecordedUri(null);
      void setAudioModeAsync({
        allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false,
        allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
      }).catch(() => undefined);
    }
    previousRecorderStateRef.current = recorderState.isRecording;
    if (interruptedRef.current && AppState.currentState === 'active') {
      interruptedRef.current = false;
      Alert.alert('Recording interrupted', 'Your reSHÜÜT voice note was discarded. Please record it again.');
    }
  }, [recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && (recorderStateRef.current || wasRecordingRef.current)) {
        interruptedRef.current = true;
        void discardRecording();
      } else if (state === 'active' && interruptedRef.current) {
        interruptedRef.current = false;
        Alert.alert('Recording interrupted', 'Your reSHÜÜT voice note was discarded. Please record it again.');
      }
    });
    return () => {
      subscription.remove();
      void discardRecording();
    };
  }, [recorder]);

  const invalidateRelated = async () => {
    await queryClient.invalidateQueries();
    await Promise.resolve(refetchFeed());
  };

  const discardRecording = async () => {
    if (!recorderStateRef.current && !wasRecordingRef.current) return;
    stoppingRef.current = true;
    await recorder.stop().catch(() => undefined);
    stoppingRef.current = false;
    recorderStateRef.current = false;
    wasRecordingRef.current = false;
    setRecordedUri(null);
    await setAudioModeAsync({
      allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false,
      allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
    }).catch(() => undefined);
  };

  const startRecording = async () => {
    const { error } = await checkConsent(async () => {
      try {
        let permission = await getRecordingPermissionsAsync();
        if (permission.status !== 'granted') permission = await requestRecordingPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Microphone access needed', 'Enable microphone access in Settings, then try again.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]);
          return;
        }
        if (AppState.currentState !== 'active') return;
        await setAudioModeAsync({
          allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false,
          allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
        });
        await recorder.prepareToRecordAsync();
        if (AppState.currentState !== 'active') return;
        recorder.record();
        wasRecordingRef.current = true;
      } catch (error) {
        Alert.alert('Could not start recording', error instanceof Error ? error.message : 'Please try again.');
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      }
    });
    if (error) Alert.alert('Error', 'Could not verify voice consent. Please try again.');
  };

  const stopRecording = async () => {
    stoppingRef.current = true;
    try {
      await recorder.stop();
      wasRecordingRef.current = false;
      const uri = recorder.uri;
      if (uri) {
        setRecordedUri(uri);
        setDuration(Math.round((recorderState.durationMillis / 1000) || 1));
      }
    } catch (error) {
      console.error('Failed to stop reSHÜÜT recording', error);
    } finally {
      stoppingRef.current = false;
      await setAudioModeAsync({
        allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false,
        allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
      }).catch(() => undefined);
    }
  };

  const choosePhoto = async () => {
    if (photoBusy || publishing) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(permission.canAskAgain ? 'Allow photo library access to attach a photo.' : 'Enable photo library access in Settings to attach a photo.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.82, selectionLimit: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const prepared = await prepareNativePostPhoto(result.assets[0], 'reshuut-photo', { optimize: true });
      setPhoto({ ...result.assets[0], uri: prepared.file.uri, mimeType: prepared.contentType, fileName: prepared.name });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Could not prepare the photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const uploadPhoto = async () => {
    if (!photo) return undefined;
    const prepared = await prepareNativePostPhoto(photo, 'reshuut-photo');
    const upload = await requestUploadUrl.mutateAsync({ data: { name: prepared.name, size: prepared.file.size, contentType: prepared.contentType } });
    const uploadUrl = resolveApiUrl(upload.uploadURL);
    if (!uploadUrl) throw new Error('Photo upload URL was empty.');
    const result = await prepared.file.upload(uploadUrl, { httpMethod: 'PUT', headers: { 'Content-Type': prepared.contentType } });
    if (result.status < 200 || result.status >= 300) throw photoUploadError(result.status, result.body);
    return upload.objectPath;
  };

  const publishVoiceNote = async () => {
    if (!recordedUri || publishing) return;
    try {
      setPublishing(true);
      const imageObjectPath = await uploadPhoto();
      const audioFile = new File(recordedUri);
      if (!audioFile.exists) throw new Error('Recorded voice note is no longer available.');
      const upload = await requestUploadUrl.mutateAsync({ data: { name: 'reshuut-commentary.m4a', size: audioFile.size, contentType: 'audio/mp4' } });
      const uploadUrl = resolveApiUrl(upload.uploadURL);
      if (!uploadUrl) throw new Error('Audio upload URL was empty.');
      const result = await audioFile.upload(uploadUrl, { httpMethod: 'PUT', headers: { 'Content-Type': 'audio/mp4' } });
      if (result.status < 200 || result.status >= 300) throw new Error(`Audio upload failed: ${result.status}`);
      await reshuutReshuut.mutateAsync({
        reshuutId: reshuut.id,
        data: { audioObjectPath: upload.objectPath, durationSeconds: duration, ...(imageObjectPath ? { imageObjectPath } : {}) },
      });
      setComposerVisible(false);
      setRecordedUri(null);
      setPhoto(null);
      setDuration(0);
      await invalidateRelated();
    } catch (error) {
      Alert.alert('Could not reSHÜÜT', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const react = async (emojiType: 'rocket' | 'laughing' | 'thumbsDown') => {
    try {
      await setReaction.mutateAsync({ reshuutId: reshuut.id, data: { emojiType } });
      await invalidateRelated();
    } catch (error) {
      Alert.alert('Could not react', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const reshuutNow = async () => {
    try {
      await reshuutReshuut.mutateAsync({ reshuutId: reshuut.id });
      await invalidateRelated();
    } catch (error) {
      Alert.alert('Could not reSHÜÜT', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const share = async () => {
    try {
      const { url, deepLink } = await createShareLink.mutateAsync({ reshuutId: reshuut.id });
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) await navigator.share({ url });
      else await Share.share({ url, message: `Listen to this on SHÜÜT: ${url}\nOpen in app: ${deepLink}` });
    } catch (error) {
      console.error('Could not share reSHÜÜT', error);
    }
  };

  const openDetail = () => {
    if (!isDetail) router.push(`/reshuut/${reshuut.id}`);
  };

  const original = reshuut.originalPost;
  const originalPost: Post | null = original ? { ...original, reshuut: null } : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.attributionRow}>
        <TouchableOpacity style={styles.attribution} onPress={() => router.push(`/profile/${reshuut.author.handle}`)} accessibilityRole="link">
          <Repeat2 color={colors.mutedForeground} size={15} />
          <Text style={[styles.attributionText, { color: colors.mutedForeground }]} numberOfLines={1}>
            @{reshuut.author.handle} reSHÜÜTed
          </Text>
        </TouchableOpacity>
        {!isDetail && <TouchableOpacity onPress={openDetail} accessibilityRole="link" accessibilityLabel="Open reSHÜÜT">
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Open</Text>
        </TouchableOpacity>}
      </View>
      {reshuut.parentReshuut && (
        <TouchableOpacity style={[styles.ancestry, { borderColor: colors.border, backgroundColor: colors.background }]}
          onPress={() => router.push(`/reshuut/${reshuut.parentReshuut!.id}`)} accessibilityRole="link"
          accessibilityLabel={`View parent reSHÜÜT by @${reshuut.parentReshuut.author.handle}`}>
          <Text style={[styles.ancestryTitle, { color: colors.mutedForeground }]}>
            In response to @{reshuut.parentReshuut.author.handle}’s reSHÜÜT
          </Text>
          {reshuut.parentReshuut.text ? (
            <Text numberOfLines={2} style={[styles.reshuutText, { color: colors.foreground }]}>{reshuut.parentReshuut.text}</Text>
          ) : reshuut.parentReshuut.audioUrl ? (
            <AuthenticatedAudioPlayer url={reshuut.parentReshuut.audioUrl} durationSeconds={1} />
          ) : null}
        </TouchableOpacity>
      )}
      <View>
        {reshuut.mode === 'text' && reshuut.text ? <Text selectable style={[styles.reshuutText, { color: colors.foreground }]}>{reshuut.text}</Text> : null}
        {reshuut.mode === 'audio' && reshuut.audioUrl ? <AuthenticatedAudioPlayer url={reshuut.audioUrl} durationSeconds={reshuut.durationSeconds ?? 1} /> : null}
        {reshuut.mode === 'audio' && reshuut.transcriptionStatus === 'ready' && reshuut.text ? <Text selectable style={[styles.reshuutText, { color: colors.foreground }]}>{reshuut.text}</Text> : null}
        {reshuut.mode === 'audio' && reshuut.transcriptionStatus === 'processing' ? <Text style={[styles.ancestryTitle, { color: colors.mutedForeground }]}>Transcribing voice note…</Text> : null}
        {reshuut.imageUrl ? <Image source={authenticatedImageSource(reshuut.imageUrl, token)} style={styles.image} contentFit="contain" accessibilityLabel="Photo attached to this reSHÜÜT" /> : null}
      </View>
      {originalPost ? (
        <View style={[styles.original, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.originalLabel, { color: colors.mutedForeground }]}>ORIGINAL SHÜÜT</Text>
            <TouchableOpacity onPress={() => router.push(`/post/${originalPost.id}`)} accessibilityRole="link" accessibilityLabel="View original SHÜÜT">
              <Text style={[styles.originalLabel, { color: colors.primary }]}>View original</Text>
            </TouchableOpacity>
          </View>
          <PostCard post={originalPost} refetchFeed={() => { void invalidateRelated(); }} embeddedOriginal />
        </View>
      ) : null}
      <View style={styles.reactions}>
        {(['rocket', 'laughing', 'thumbsDown'] as const).map((reaction) => {
          const emoji = reaction === 'rocket' ? '🚀' : reaction === 'laughing' ? '😂' : '👎';
          const count = reshuut.reactions[reaction];
          return (
            <TouchableOpacity key={reaction} style={[styles.reaction, reshuut.viewerReaction === reaction && { backgroundColor: `${colors.primary}1A` }]}
              onPress={() => void react(reaction)} accessibilityRole="button" accessibilityLabel={`${emoji} ${count} reactions`}>
              <Text>{emoji}</Text>{count > 0 ? <Text style={[styles.count, { color: reshuut.viewerReaction === reaction ? colors.primary : colors.mutedForeground }]}>{count}</Text> : null}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.action} onPress={() => void reshuutNow()} disabled={reshuutReshuut.isPending} accessibilityRole="button" accessibilityLabel={reshuut.isReshuuted ? 'Remove reSHÜÜT' : 'reSHÜÜT Now'}>
          {reshuutReshuut.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Repeat2 color={reshuut.isReshuuted ? colors.primary : colors.mutedForeground} size={18} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={() => setComposerVisible((visible) => !visible)} accessibilityRole="button" accessibilityLabel="Add Voice Note to reSHÜÜT">
          <Mic color={colors.mutedForeground} size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={share} accessibilityRole="button" accessibilityLabel="Share reSHÜÜT">
          <ShareIcon color={colors.mutedForeground} size={18} />
        </TouchableOpacity>
        {!isDetail && <TouchableOpacity style={styles.action} onPress={openDetail} accessibilityRole="button" accessibilityLabel="Open reSHÜÜT comments"><Send color={colors.mutedForeground} size={17} /></TouchableOpacity>}
      </View>
      {composerVisible && (
        <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.originalLabel, { color: colors.foreground }]}>VOICE NOTE · NO WRITTEN COMMENTARY</Text>
          {photo ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="contain" accessibilityLabel="Selected reSHÜÜT photo preview" />
              <TouchableOpacity onPress={() => setPhoto(null)} accessibilityLabel="Remove photo"><X color={colors.mutedForeground} size={18} /></TouchableOpacity>
            </View>
          ) : null}
          {photoError ? <Text style={[styles.error, { color: colors.destructive }]}>{photoError}</Text> : null}
          {recordedUri ? (
            <View style={styles.composerRow}>
              <View style={{ flex: 1 }}><AuthenticatedAudioPlayer url={recordedUri} durationSeconds={duration} /></View>
              <TouchableOpacity onPress={() => setRecordedUri(null)} accessibilityLabel="Discard voice note"><X color={colors.mutedForeground} size={18} /></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.composerRow} onPress={recorderState.isRecording ? () => void stopRecording() : () => void startRecording()}
              disabled={consentLoading || consentError} accessibilityRole="button" accessibilityLabel={recorderState.isRecording ? 'Stop voice note recording' : 'Record a voice note'}>
              {recorderState.isRecording ? <Square color={colors.destructive} size={18} /> : <Mic color={colors.primary} size={18} />}
              <Text style={[styles.reshuutText, { color: colors.foreground }]}>{recorderState.isRecording ? 'Stop recording' : 'Record a voice note'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.composerRow} onPress={() => void choosePhoto()} disabled={photoBusy || publishing} accessibilityRole="button" accessibilityLabel={photo ? 'Change reSHÜÜT photo' : 'Add optional photo'}>
            {photoBusy ? <ActivityIndicator color={colors.primary} /> : <ImagePlus color={colors.primary} size={18} />}
            <Text style={[styles.reshuutText, { color: colors.primary }]}>{photo ? 'Change photo' : 'Add optional photo'}</Text>
          </TouchableOpacity>
          <View style={styles.composerActions}>
            <TouchableOpacity onPress={() => { setComposerVisible(false); setRecordedUri(null); setPhoto(null); void discardRecording(); }} accessibilityLabel="Cancel voice note">
              <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.publish, { backgroundColor: colors.primary, opacity: recordedUri && !publishing ? 1 : 0.5 }]}
              onPress={() => void publishVoiceNote()} disabled={!recordedUri || publishing || photoBusy} accessibilityRole="button" accessibilityLabel="Publish voice note reSHÜÜT">
              {publishing ? <ActivityIndicator color={colors.primaryForeground} /> : <Send color={colors.primaryForeground} size={16} />}
            </TouchableOpacity>
          </View>
        </View>
      )}
      <VoiceAiConsentModal visible={showModal} onAccept={onAccept} onDecline={onDecline} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 10 },
  attributionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  attribution: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  attributionText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  ancestry: { padding: 10, borderRadius: 10, borderWidth: 1, gap: 4 },
  ancestryTitle: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  reshuutText: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  image: { width: '100%', height: 220, marginTop: 8 },
  original: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 6 },
  originalLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.6 },
  reactions: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  reaction: { minWidth: 38, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 18, paddingHorizontal: 5 },
  count: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  action: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  composer: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  composerRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  publish: { width: 34, height: 34, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  previewWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: { height: 120, flex: 1 },
  error: { fontSize: 12 },
});