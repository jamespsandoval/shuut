import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Linking, Animated, Easing, Platform, ActivityIndicator, AppState } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, setAudioModeAsync, PermissionResponse } from 'expo-audio';
import { File } from 'expo-file-system';
import { Founder, Post, FeedPage, getGetFeedPageQueryKey, useRequestUploadUrl, useCreatePost, useGetProfile, useTranscribeAudio } from '@workspace/api-client-react';
import { Pause, Play, Send, Square } from 'lucide-react-native';
import { MentionPicker } from '../../components/MentionPicker';
import { KeyboardAwareScrollViewCompat } from '../../components/KeyboardAwareScrollViewCompat';
import { SPEECH_RECORDING_OPTIONS } from '../../lib/audioRecording';
import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useVoiceConsentCheck } from '../../hooks/useVoiceConsentCheck';
import { VoiceAiConsentModal } from '../../components/VoiceAiConsentModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RECORDING_RECOVERY_KEY, RecordingRecovery, validateRecovery } from '../../lib/recordingRecovery';
import { resolveApiUrl } from '../../lib/apiUrl';
import { shouldCancelRecordingForLifecycle } from '../../lib/voiceRecordingGuards';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ImagePlus, X } from 'lucide-react-native';
import { prepareNativePostPhoto, photoUploadError } from '../../lib/postPhoto';

export default function RecordScreen() {
  const colors = useColors();
  const { capture } = useAnalytics();
  const router = useRouter();
  const queryClient = useQueryClient();

  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const isScreenActiveRef = useRef(false);
  const startGenerationRef = useRef(0);
  const startPendingRef = useRef(false);
  const requiresExplicitStartRef = useRef(false);
  const stopRecordingRef = useRef<(message?: string) => Promise<void>>(async () => undefined);
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS, (status) => {
    if (status.mediaServicesDidReset && isRecordingRef.current) {
      void stopRecordingRef.current('Audio services were interrupted. Your recording was saved for review.');
    }
  });
  const recorderState = useAudioRecorderState(recorder);
  const [interruptionMessage, setInterruptionMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [reviewRecording, setReviewRecording] = useState<{ uri: string; duration: number } | null>(null);
  const [audioObjectPath, setAudioObjectPath] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [rawAccepted, setRawAccepted] = useState(false);
  const [isPreparingTranscript, setIsPreparingTranscript] = useState(false);
  const [mentionedFounders, setMentionedFounders] = useState<Founder[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imageObjectPath, setImageObjectPath] = useState<string | null>(null);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [permissionRevoked, setPermissionRevoked] = useState(false);
  const permissionWasRevokedRef = useRef(false);
  const publishedPostIdRef = useRef<number | null>(null);
  const spinnerRotation = useRef(new Animated.Value(0)).current;
  const previewPlayer = useAudioPlayer(null);
  const previewStatus = useAudioPlayerStatus(previewPlayer);

  const {
    checkConsent,
    showModal,
    onAccept,
    onDecline,
    isLoading: isConsentLoading,
    isError: isConsentError,
    consentStatus,
    refetch: refetchConsent,
    setShowModal
  } = useVoiceConsentCheck();

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(RECORDING_RECOVERY_KEY).then(async (raw) => {
      if (cancelled) return;
      if (!raw) {
        setRecoveryLoaded(true);
        return;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { await AsyncStorage.removeItem(RECORDING_RECOVERY_KEY); setRecoveryLoaded(true); return; }
      const descriptor = validateRecovery(parsed);
      if (!descriptor) { await AsyncStorage.removeItem(RECORDING_RECOVERY_KEY); setRecoveryLoaded(true); return; }
      try {
        if (Platform.OS !== 'web' && !(new File(descriptor.uri)).exists) {
          await AsyncStorage.removeItem(RECORDING_RECOVERY_KEY);
          Alert.alert('Recording unavailable', 'Your interrupted recording is no longer available on this device.');
          setRecoveryLoaded(true);
          return;
        }
      } catch {
        await AsyncStorage.removeItem(RECORDING_RECOVERY_KEY);
        setRecoveryLoaded(true);
        return;
      }
      if (!cancelled) {
        setReviewRecording({ uri: descriptor.uri, duration: descriptor.duration });
        setInterruptionMessage(descriptor.interruptionMessage);
      }
      setRecoveryLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const requestUploadUrl = useRequestUploadUrl();
  const createPost = useCreatePost();
  const transcribeAudio = useTranscribeAudio();
  const { data: profile } = useGetProfile('me');
  const previewTranscript = profile?.founder.previewTranscript ?? false;

  useEffect(() => {
    if (!reviewRecording) return;
    previewPlayer.replace({ uri: reviewRecording.uri });
  }, [previewPlayer, reviewRecording]);

  const startRecordingAfterConsent = useCallback(async (
    knownPermission?: PermissionResponse | null,
    shouldContinue: () => boolean = () => true,
  ) => {
    const generation = ++startGenerationRef.current;
    const stillValid = () => generation === startGenerationRef.current && isScreenActiveRef.current && shouldContinue();
    let audioModeConfigured = false;
    startPendingRef.current = true;
    try {
      setIsStarting(true);
      let perm = knownPermission;
      if (!perm || perm.status !== 'granted') {
        perm = await requestRecordingPermissionsAsync();
        if (!stillValid()) return;
        if (perm.status !== 'granted') {
          requiresExplicitStartRef.current = true;
          setPermissionRevoked(true);
          Alert.alert(
            'Permission Denied',
            'Please enable microphone access in your settings to record audio.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
          return;
        }
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
        interruptionMode: 'doNotMix',
      });
      audioModeConfigured = true;
      if (!stillValid()) return;
      await recorder.prepareToRecordAsync();
      if (!stillValid()) return;
      recorder.record();
      isRecordingRef.current = true;
      requiresExplicitStartRef.current = false;
    } catch (err) {
      console.error('Failed to start recording', err);
    } finally {
      startPendingRef.current = false;
      if (!stillValid() && audioModeConfigured) {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          allowsBackgroundRecording: false,
          interruptionMode: 'doNotMix',
        }).catch(() => undefined);
      }
      setIsStarting(false);
    }
  }, [recorder]);

  // All native microphone access is reached through this consent gate,
  // including retry after returning from Settings.
  const requestRecordingStart = useCallback(async () => {
    const { required, error } = await checkConsent(async () => {
      const permission = await getRecordingPermissionsAsync();
      if (!isScreenActiveRef.current) return;
      await startRecordingAfterConsent(permission, () => isScreenActiveRef.current);
    });
    if (required || error) setIsStarting(false);
  }, [checkConsent, startRecordingAfterConsent]);

  useFocusEffect(useCallback(() => {
    isScreenActiveRef.current = true;
    setIsProcessing(false);
    setIsStarting(!requiresExplicitStartRef.current);
    // Focus changes must not discard a stopped recording awaiting review.
    isStoppingRef.current = false;
    setInitialized(requiresExplicitStartRef.current);

    void refetchConsent();

    return () => {
      if (startPendingRef.current || isRecordingRef.current) {
        requiresExplicitStartRef.current = true;
      }
      isScreenActiveRef.current = false;
      ++startGenerationRef.current;
      setIsStarting(false);
      setShowModal(false);
      if (isRecordingRef.current) {
        void stopRecordingRef.current('Recording interrupted when leaving SHÜÜT. Your recording was saved for review.');
      }
    };
  }, [refetchConsent, setShowModal]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') {
        if (shouldCancelRecordingForLifecycle({
          appIsActive: false,
          startPending: startPendingRef.current,
          recording: isRecordingRef.current,
        })) {
          requiresExplicitStartRef.current = true;
          setInitialized(true);
        }
        ++startGenerationRef.current;
        previewPlayer.pause();
        if (isRecordingRef.current) {
          void stopRecordingRef.current('Recording interrupted when the app was backgrounded. Your recording was saved for review.');
        } else {
          setIsStarting(false);
          void setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            allowsBackgroundRecording: false,
            interruptionMode: 'doNotMix',
          });
        }
      }
      if (state === 'active') {
        if (publishedPostIdRef.current !== null) {
          const newPostId = publishedPostIdRef.current;
          publishedPostIdRef.current = null;
          router.dismissTo({
            pathname: '/(main)/feed',
            params: { newPostId: String(newPostId) },
          });
          return;
        }
        void getRecordingPermissionsAsync().then((permission) => {
          const revoked = permission.status !== 'granted';
          setPermissionRevoked(revoked);
          if (revoked && !permissionWasRevokedRef.current) {
            Alert.alert('Microphone access needed', 'Microphone access is off. Enable it in Settings, then tap Retry to record.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
          }
          permissionWasRevokedRef.current = revoked;
        });
      }
    });
    return () => subscription.remove();
  }, [previewPlayer, router]);

  useEffect(() => {
    if (!recoveryLoaded || initialized || isConsentLoading || !isScreenActiveRef.current) return;
    if (reviewRecording) {
      setIsStarting(false);
      return;
    }

    if (isConsentError || !consentStatus) {
      setIsStarting(false);
      return;
    }

    setInitialized(true);

    const checkAndStart = async () => {
      await requestRecordingStart();
    };

    void checkAndStart();
  }, [recoveryLoaded, initialized, isConsentLoading, consentStatus, isConsentError, requestRecordingStart, reviewRecording]);

  const handleDeclineConsent = () => {
    onDecline();
    router.dismissTo('/(main)/feed');
  };

  useEffect(() => {
    if (!isProcessing) {
      spinnerRotation.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(spinnerRotation, {
        toValue: 1,
        duration: 950,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [isProcessing, spinnerRotation]);

  const stopRecording = async (message?: string) => {
    if (isStoppingRef.current || !isRecordingRef.current) return;
    isStoppingRef.current = true;
    isRecordingRef.current = false;
    try {
      setIsProcessing(true);
      const finalDuration = Math.max(1, Math.round((recorderState?.durationMillis || 0) / 1000));
      let uri = recorder.uri || recorderState.url;
      if (recorderState.isRecording) {
        try {
          await recorder.stop();
        } catch (error) {
          console.error('Recorder stop failed; attempting to salvage the local file', error);
        }
      }
      uri = recorder.uri || recorderState.url || uri;
      if (!uri) throw new Error('The recording file was not created.');
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
        interruptionMode: 'doNotMix',
      }).catch((error) => console.error('Failed to restore non-recording audio mode', error));
      setReviewRecording({ uri, duration: finalDuration });
      setInterruptionMessage(message || null);
      setIsProcessing(false);
      const recovery: RecordingRecovery = {
        uri,
        duration: finalDuration,
        interruptionMessage: message || 'Recording stopped. Review it before publishing.',
        timestamp: Date.now(),
      };
      try {
        await AsyncStorage.setItem(RECORDING_RECOVERY_KEY, JSON.stringify(recovery));
      } catch (error) {
        console.error('Could not persist recording recovery', error);
        Alert.alert('Review ready', 'Your recording is ready to review, but recovery could not be saved if the app closes.');
      }
      if (!message) {
        void prepareTranscript(uri);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsProcessing(false);
      Alert.alert('Recording unavailable', 'Your recording could not be recovered. Please try again.');
    } finally {
      isStoppingRef.current = false;
    }
  };
  stopRecordingRef.current = stopRecording;

  const previousRecordingStateRef = useRef(false);
  useEffect(() => {
    if (previousRecordingStateRef.current && !recorderState.isRecording && isRecordingRef.current && !isStoppingRef.current) {
      void stopRecordingRef.current('Recording was interrupted unexpectedly. Your recording was saved for review.');
    }
    previousRecordingStateRef.current = recorderState.isRecording;
  }, [recorderState.isRecording]);

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 90_000 && !isProcessing) {
      void stopRecording();
    }
  }, [recorderState.durationMillis, recorderState.isRecording, isProcessing]);

  useEffect(() => () => {
    if (isRecordingRef.current && !isStoppingRef.current) {
      isRecordingRef.current = false;
      isStoppingRef.current = true;
      void recorder.stop().catch(() => undefined);
    }
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false, interruptionMode: 'doNotMix' });
  }, [recorder]);

  const togglePreview = async () => {
    if (previewStatus.playing) {
      previewPlayer.pause();
      return;
    }
    if (previewStatus.didJustFinish) {
      await previewPlayer.seekTo(0);
    }
    previewPlayer.play();
  };

  const cancelReview = () => {
    previewPlayer.pause();
    setReviewRecording(null);
    setAudioObjectPath(null);
    setTranscript('');
    setRawAccepted(false);
    setIsPreparingTranscript(false);
    setMentionedFounders([]);
    setSelectedPhoto(null);
    setImageObjectPath(null);
    setInterruptionMessage(null);
    void AsyncStorage.removeItem(RECORDING_RECOVERY_KEY);
    router.dismissTo('/(main)/feed');
  };

  const choosePhoto = () => {
    Alert.alert('Attach a photo', 'Choose where to get your SHÜÜT photo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take photo', onPress: () => void capturePhoto(true) },
      { text: 'Photo library', onPress: () => void capturePhoto(false) },
    ]);
  };

  const capturePhoto = async (useCamera: boolean) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          useCamera ? 'Camera access needed' : 'Photo access needed',
          permission.canAskAgain
            ? `Allow ${useCamera ? 'camera' : 'photo'} access to attach an image to your SHÜÜT.`
            : `${useCamera ? 'Camera' : 'Photo'} access is disabled. Enable it in Settings to attach an image.`,
          permission.canAskAgain
            ? [{ text: 'Not now', style: 'cancel' }]
            : [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() }],
        );
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.82 })
        : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.82,
        selectionLimit: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const prepared = await prepareNativePostPhoto(result.assets[0], 'shuut-photo');
        setSelectedPhoto({
          ...result.assets[0],
          uri: prepared.file.uri,
          mimeType: prepared.contentType,
          fileName: prepared.name,
        });
        setImageObjectPath(null);
      }
    } catch (error) {
      console.error('Could not choose SHÜÜT photo', error);
      Alert.alert('Photo unavailable', error instanceof Error ? error.message : 'We could not open your photo library. Please try again.');
    }
  };

  const publishReview = async () => {
    if (!reviewRecording || isProcessing || isPreparingTranscript) return;
    if (!transcript.trim()) {
      Alert.alert('Transcript not ready', 'Wait for the transcript or try transcription again before publishing.');
      return;
    }
    previewPlayer.pause();
    setIsProcessing(true);
    try {
      await publishPost(reviewRecording.uri, reviewRecording.duration);
    } catch (error) {
      setIsProcessing(false);
      Alert.alert('Could not publish', error instanceof Error && /photo|image|JPEG|PNG|WebP/i.test(error.message)
        ? error.message : 'Your SHÜÜT could not be processed. Please try again.');
    }
  };

  const uploadRecording = async (recordingUri: string): Promise<string> => {
    if (audioObjectPath) return audioObjectPath;
    let nativeFile: File | null = null;
    let browserBlob: Blob | null = null;
    let fileSize = 0;
    let contentType: 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/ogg' = 'audio/mp4';
    let fileName = 'audio.m4a';

    if (Platform.OS === 'web') {
      const recordingResponse = await fetch(recordingUri);
      if (!recordingResponse.ok) throw new Error('Recorded browser audio could not be read');
      browserBlob = await recordingResponse.blob();
      fileSize = browserBlob.size;
      const browserType = browserBlob.type.split(';')[0];
      if (browserType === 'audio/webm' || browserType === 'audio/mp4' || browserType === 'audio/mpeg' || browserType === 'audio/ogg') {
        contentType = browserType;
      } else {
        contentType = 'audio/webm';
      }
      fileName = contentType === 'audio/webm' ? 'audio.webm' : 'audio.m4a';
    } else {
      nativeFile = new File(recordingUri);
      if (!nativeFile.exists) throw new Error('Recorded file does not exist');
      fileSize = nativeFile.size;
    }

    const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
      data: { name: fileName, size: fileSize, contentType },
    });
    const fullUrl = resolveApiUrl(uploadURL);
    if (!fullUrl) throw new Error('Upload URL was empty.');

    if (Platform.OS === 'web') {
      const uploadResponse = await fetch(fullUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: browserBlob,
        credentials: 'omit',
      });
      if (!uploadResponse.ok) throw new Error(`Failed to upload file: ${uploadResponse.status}`);
    } else {
      const uploadResult = await nativeFile!.upload(fullUrl, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': contentType },
      });
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Failed to upload file: ${uploadResult.status}`);
      }
    }

    setAudioObjectPath(objectPath);
    return objectPath;
  };

  const uploadPhoto = async (): Promise<string | undefined> => {
    if (!selectedPhoto) return undefined;
    if (imageObjectPath) return imageObjectPath;
    const { file, name, contentType } = await prepareNativePostPhoto(selectedPhoto, 'shuut-photo');
    const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
      data: { name, size: file.size, contentType },
    });
    const fullUrl = resolveApiUrl(uploadURL);
    if (!fullUrl) throw new Error('Photo upload URL was empty.');
    const result = await file.upload(fullUrl, { httpMethod: 'PUT', headers: { 'Content-Type': contentType } });
    if (result.status < 200 || result.status >= 300) throw photoUploadError(result.status, result.body);
    setImageObjectPath(objectPath);
    return objectPath;
  };

  const prepareTranscript = async (recordingUri: string) => {
    setIsPreparingTranscript(true);
    try {
      const objectPath = await uploadRecording(recordingUri);
      const result = await transcribeAudio.mutateAsync({ data: { audioObjectPath: objectPath } });
      if (result.cleanupStatus === 'raw') {
        setTranscript('');
        setRawAccepted(false);
        Alert.alert(
          'Transcription clean-up unavailable',
          'We’re experiencing a problem with transcription clean-up. Would you like to proceed with the raw transcription?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, use raw transcription', onPress: () => { setTranscript(result.transcript); setRawAccepted(true); } },
          ],
          { cancelable: false },
        );
      } else {
        setTranscript(result.transcript);
        setRawAccepted(false);
      }
    } catch (err) {
      console.error('Failed to prepare transcript', err);
      Alert.alert('Transcription failed', 'Your recording is safe. Tap “Try transcription again” to retry.');
    } finally {
      setIsPreparingTranscript(false);
    }
  };

  const publishPost = async (recordingUri: string, recordingDuration: number) => {
    try {
      const objectPath = await uploadRecording(recordingUri);
      const photoPath = await uploadPhoto();
      const createdPost = await createPost.mutateAsync({
        data: {
          audioObjectPath: objectPath,
          durationSeconds: recordingDuration,
          ...(photoPath ? { imageObjectPath: photoPath } : {}),
          transcript: transcript.trim(),
          mentionedFounderIds: mentionedFounders.map((founder) => founder.id),
        }
      });
      capture('post_published');
      publishedPostIdRef.current = createdPost.id;
      try {
        await AsyncStorage.removeItem(RECORDING_RECOVERY_KEY);
      } catch (error) {
        // The server creation is already committed. Never present it as retryable.
        console.error('Published post recovery cleanup failed', error);
      }
      setReviewRecording(null);
      setIsProcessing(false);
      if (isScreenActiveRef.current) {
        if (createdPost.transcriptionStatus === 'ready') {
          queryClient.setQueryData<InfiniteData<FeedPage, string | null>>(
            getGetFeedPageQueryKey({ view: 'everyone' }),
            (current) => {
              if (!current) return current;
              const firstPage = current.pages[0];
              if (!firstPage) return current;
              const posts = firstPage.posts.some((post) => post.id === createdPost.id)
                ? firstPage.posts.map((post) => post.id === createdPost.id ? createdPost : post)
                : [createdPost, ...firstPage.posts];
              return { ...current, pages: [{ ...firstPage, posts }, ...current.pages.slice(1)] };
            },
          );
        }

        publishedPostIdRef.current = null;
        router.dismissTo({
          pathname: '/(main)/feed',
          params: { newPostId: String(createdPost.id) },
        });
      }
    } catch (err) {
      console.error('Failed to publish', err);
      throw err;
    }
  };

  const isRecording = recorderState.isRecording;
  const showRecordingState = (isStarting && !isConsentLoading) || isRecording;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        bottomOffset={72}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.recordingArea}>
          {isProcessing ? (
            <View style={styles.processingState}>
              <Animated.Image
                source={require('../../assets/images/transcription-spinner.png')}
                style={[
                  styles.processingLogo,
                  {
                    transform: [{
                      rotate: spinnerRotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    }],
                  },
                ]}
                resizeMode="contain"
              />
              <Text style={[styles.processingText, { color: colors.foreground }]}>Transcribing your SHÜÜT…</Text>
            </View>
          ) : reviewRecording ? (
            <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.reviewTitle, { color: colors.foreground }]}>Ready, Set…</Text>
              {interruptionMessage && (
                <Text style={[styles.interruptionMessage, { color: colors.destructive }]}>
                  {interruptionMessage} Review your recording before publishing.
                </Text>
              )}
              <View style={[styles.previewPlayer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.previewPlayButton, { backgroundColor: colors.primary }]}
                  onPress={() => void togglePreview()}
                  accessibilityLabel={previewStatus.playing ? 'Pause recording preview' : 'Play recording preview'}
                >
                  {previewStatus.playing ? (
                    <Pause color={colors.primaryForeground} size={20} />
                  ) : (
                    <Play color={colors.primaryForeground} size={20} style={{ marginLeft: 2 }} />
                  )}
                </TouchableOpacity>
                <View style={styles.previewWaveform}>
                  {Array.from({ length: 24 }, (_, index) => {
                    const progress = previewStatus.duration
                      ? previewStatus.currentTime / previewStatus.duration
                      : 0;
                    const played = index / 24 <= progress;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.previewBar,
                          {
                            height: 8 + ((index * 7) % 18),
                            backgroundColor: played ? colors.primary : colors.mutedForeground,
                            opacity: played ? 1 : 0.3,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
                <Text style={[styles.previewDuration, { color: colors.mutedForeground }]}>
                  {reviewRecording.duration} sec
                </Text>
              </View>
              {(previewTranscript || rawAccepted || !transcript.trim()) && (
                <View style={styles.transcriptSection}>
                  <Text style={[styles.transcriptLabel, { color: colors.foreground }]}>Transcript</Text>
                  {isPreparingTranscript ? (
                    <View style={styles.transcriptLoading}>
                      <Animated.Image
                        source={require('../../assets/images/transcription-spinner.png')}
                        style={styles.transcriptSpinner}
                        resizeMode="contain"
                      />
                      <Text style={[styles.transcriptStatus, { color: colors.mutedForeground }]}>
                        Preparing your draft…
                      </Text>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        style={[styles.transcriptInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                        value={transcript}
                        onChangeText={setTranscript}
                        multiline
                        textAlignVertical="top"
                        placeholder="Your transcript will appear here."
                        placeholderTextColor={colors.mutedForeground}
                      />
                      {!transcript.trim() && (
                        <TouchableOpacity
                          style={[styles.retryTranscriptButton, { borderColor: colors.border }]}
                          onPress={() => reviewRecording && void prepareTranscript(reviewRecording.uri)}
                        >
                          <Text style={[styles.retryTranscriptText, { color: colors.primary }]}>Try transcription again</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )}
              <View style={[styles.photoSection, { borderColor: colors.border }]}>
                {selectedPhoto ? (
                  <View style={styles.photoPreviewWrap}>
                    <Image source={{ uri: selectedPhoto.uri }} style={styles.photoPreview} contentFit="contain" />
                    <TouchableOpacity
                      style={[styles.removePhotoButton, { backgroundColor: colors.card }]}
                      onPress={() => { setSelectedPhoto(null); setImageObjectPath(null); }}
                      accessibilityLabel="Remove attached photo"
                    >
                      <X color={colors.foreground} size={16} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.photoPickerButton} onPress={() => void choosePhoto()} accessibilityLabel="Add a photo">
                    <ImagePlus color={colors.primary} size={19} />
                    <Text style={[styles.photoPickerText, { color: colors.primary }]}>Add a photo</Text>
                  </TouchableOpacity>
                )}
              </View>
              <MentionPicker selected={mentionedFounders} onChange={setMentionedFounders} />
              <View style={[styles.reviewActions, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={cancelReview}
                  accessibilityLabel="Cancel recording"
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shuutButton, { backgroundColor: colors.primary }]}
                  onPress={() => void publishReview()}
                  disabled={isPreparingTranscript || !transcript.trim()}
                  accessibilityLabel="Publish SHÜÜT"
                  accessibilityState={{ disabled: isPreparingTranscript || !transcript.trim() }}
                >
                  <Send color={colors.primaryForeground} size={18} />
                  <Text style={[styles.shuutText, { color: colors.primaryForeground }]}>SHÜÜT</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.recordCard}>
              {permissionRevoked ? (
                <View style={styles.recordingState}>
                  <Text style={[styles.recordingTitle, { color: colors.destructive }]}>MICROPHONE OFF</Text>
                  <Text style={[styles.timerLimit, { color: colors.foreground, textAlign: 'center', marginBottom: 12 }]}>
                    Enable microphone access in Settings to record a voice post.
                  </Text>
                  <TouchableOpacity
                    style={[styles.retryTranscriptButton, { borderColor: colors.border, paddingHorizontal: 16 }]}
                    onPress={() => {
                      void getRecordingPermissionsAsync().then((permission) => {
                        if (permission.status === 'granted') {
                          setPermissionRevoked(false);
                          permissionWasRevokedRef.current = false;
                          void requestRecordingStart();
                        } else {
                          Alert.alert('Microphone access needed', 'Choose Open Settings to enable microphone access, then tap Retry.');
                        }
                      });
                    }}
                  >
                    <Text style={[styles.retryTranscriptText, { color: colors.primary }]}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void Linking.openSettings()}>
                    <Text style={[styles.retryTranscriptText, { color: colors.primary }]}>Open Settings</Text>
                  </TouchableOpacity>
                </View>
              ) : (isConsentError || (!isConsentLoading && !consentStatus)) ? (
                <View style={styles.recordingState}>
                  <Text style={[styles.recordingTitle, { color: colors.destructive }]}>
                    ERROR
                  </Text>
                  <Text style={[styles.timerLimit, { color: colors.foreground, textAlign: 'center', marginBottom: 12 }]}>
                    Could not verify voice consent.
                  </Text>
                  <TouchableOpacity
                    style={[styles.retryTranscriptButton, { borderColor: colors.border, paddingHorizontal: 16 }]}
                    onPress={() => {
                      setIsStarting(true);
                      void refetchConsent();
                    }}
                  >
                    <Text style={[styles.retryTranscriptText, { color: colors.primary }]}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.recordingState}>
                  <Text style={[styles.recordingTitle, { color: showRecordingState ? colors.destructive : colors.mutedForeground }]}>
                    {showRecordingState ? 'RECORDING' : 'READY'}
                  </Text>
                  <Text style={[styles.timerText, { color: colors.foreground }]}>
                    {Math.floor((recorderState?.durationMillis || 0) / 1000 / 60)}:{Math.floor(((recorderState?.durationMillis || 0) / 1000) % 60).toString().padStart(2, '0')}
                  </Text>
                  <Text style={[styles.timerLimit, { color: colors.mutedForeground }]}>/ 1:30</Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.recordButton,
                  { backgroundColor: showRecordingState ? colors.destructive : colors.primary, opacity: (isConsentError || (!isConsentLoading && !consentStatus)) ? 0.5 : 1 }
                ]}
                onPress={isRecording ? () => void stopRecording() : () => void requestRecordingStart()}
                disabled={isStarting || showModal || isConsentLoading || isConsentError || !consentStatus}
              >
                <Square color={colors.primaryForeground} size={32} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAwareScrollViewCompat>

      <VoiceAiConsentModal
        visible={showModal}
        onAccept={onAccept}
        onDecline={handleDeclineConsent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  content: {
    flexGrow: 1,
    padding: 16,
  },
  recordingArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingState: {
    alignItems: 'center',
    gap: 20,
  },
  processingLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  processingText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
  },
  recordCard: {
    alignItems: 'center',
    gap: 32,
  },
  reviewCard: {
    width: '100%',
    maxWidth: 560,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  reviewTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    textAlign: 'center',
  },
  interruptionMessage: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  previewPlayer: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    gap: 10,
  },
  previewPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWaveform: {
    flex: 1,
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  previewBar: {
    flex: 1,
    borderRadius: 2,
  },
  previewDuration: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  transcriptSection: {
    gap: 8,
  },
  transcriptLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  transcriptLoading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  transcriptSpinner: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  transcriptStatus: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  transcriptInput: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 23,
  },
  photoSection: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  photoPreviewWrap: {
    width: '100%',
    height: 180,
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPickerButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoPickerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  retryTranscriptButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 22,
  },
  retryTranscriptText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  cancelButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  shuutButton: {
    minHeight: 48,
    minWidth: 142,
    borderRadius: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  shuutText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  recordingState: {
    alignItems: 'center',
    gap: 8,
  },
  recordingTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: 2,
  },
  timerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 64,
    fontVariant: ['tabular-nums'],
  },
  timerLimit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  instructionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  recordButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  previewCard: {
    alignItems: 'center',
    gap: 24,
  },
  previewText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeButton: {
    padding: 16,
  },
  retakeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  publishText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    marginBottom: 12,
  },
  modalText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    alignItems: 'center',
  },
  modalCancelBtn: {
    padding: 12,
  },
  modalAcceptBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  }
});
