import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Linking, Animated, Easing, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, setAudioModeAsync, PermissionResponse } from 'expo-audio';
import { File } from 'expo-file-system';
import { Founder, useRequestUploadUrl, useCreatePost, useGetProfile, useTranscribeAudio } from '@workspace/api-client-react';
import { Pause, Play, Send, Square } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuthStore';
import { MentionPicker } from '../../components/MentionPicker';
import { KeyboardAwareScrollViewCompat } from '../../components/KeyboardAwareScrollViewCompat';

export default function RecordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const isScreenActiveRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [reviewRecording, setReviewRecording] = useState<{ uri: string; duration: number } | null>(null);
  const [audioObjectPath, setAudioObjectPath] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [isPreparingTranscript, setIsPreparingTranscript] = useState(false);
  const [mentionedFounders, setMentionedFounders] = useState<Founder[]>([]);
  const spinnerRotation = useRef(new Animated.Value(0)).current;
  const previewPlayer = useAudioPlayer(null);
  const previewStatus = useAudioPlayerStatus(previewPlayer);

  const requestUploadUrl = useRequestUploadUrl();
  const createPost = useCreatePost();
  const transcribeAudio = useTranscribeAudio();
  const { data: profile } = useGetProfile('me');
  const previewTranscript = profile?.founder.previewTranscript ?? false;

  useEffect(() => {
    if (!reviewRecording) return;
    previewPlayer.replace({ uri: reviewRecording.uri });
  }, [previewPlayer, reviewRecording]);

  const startRecording = useCallback(async (
    knownPermission?: PermissionResponse | null,
    shouldContinue: () => boolean = () => true,
  ) => {
    try {
      setIsStarting(true);
      let perm = knownPermission;
      if (!perm || perm.status !== 'granted') {
        perm = await requestRecordingPermissionsAsync();
        if (!shouldContinue()) return;
        if (perm.status !== 'granted') {
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
      });
      if (!shouldContinue()) return;
      await recorder.prepareToRecordAsync();
      if (!shouldContinue()) return;
      recorder.record();
      isRecordingRef.current = true;
    } catch (err) {
      console.error('Failed to start recording', err);
    } finally {
      if (shouldContinue()) setIsStarting(false);
    }
  }, [recorder]);

  useFocusEffect(useCallback(() => {
    let isActive = true;
    isScreenActiveRef.current = true;
    setIsProcessing(false);
    setIsStarting(true);
    setReviewRecording(null);
    setAudioObjectPath(null);
    setTranscript('');
    setIsPreparingTranscript(false);
    setMentionedFounders([]);
    isStoppingRef.current = false;

    const beginRecording = async () => {
      const permission = await getRecordingPermissionsAsync();
      if (!isActive) return;
      await startRecording(permission, () => isActive);
    };

    void beginRecording();
    return () => {
      isActive = false;
      isScreenActiveRef.current = false;
      setIsProcessing(false);
      setIsStarting(true);
    };
  }, [startRecording]));

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

  const stopRecording = async () => {
    if (isStoppingRef.current || !isRecordingRef.current) return;
    isStoppingRef.current = true;
    isRecordingRef.current = false;
    try {
      setIsProcessing(true);
      const finalDuration = Math.max(1, Math.round((recorderState?.durationMillis || 0) / 1000));
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording file was not created.');
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      setReviewRecording({ uri, duration: finalDuration });
      setIsProcessing(false);
      if (previewTranscript) {
        void prepareTranscript(uri);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsProcessing(false);
      Alert.alert('Could not publish', 'Your SHÜÜT could not be processed. Please try again.');
    } finally {
      isStoppingRef.current = false;
    }
  };

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
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
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
    setIsPreparingTranscript(false);
    setMentionedFounders([]);
    router.replace('/(main)/feed');
  };

  const publishReview = async () => {
    if (!reviewRecording || isProcessing || isPreparingTranscript) return;
    if (previewTranscript && !transcript.trim()) {
      Alert.alert('Transcript not ready', 'Wait for the transcript or edit it before publishing.');
      return;
    }
    previewPlayer.pause();
    setIsProcessing(true);
    try {
      await publishPost(reviewRecording.uri, reviewRecording.duration);
    } catch {
      setIsProcessing(false);
      Alert.alert('Could not publish', 'Your SHÜÜT could not be processed. Please try again.');
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
    const domain = process.env.EXPO_PUBLIC_DOMAIN || 'localhost:80';
    const fullUrl = uploadURL.startsWith('http') ? uploadURL : `https://${domain}${uploadURL}`;

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

  const prepareTranscript = async (recordingUri: string) => {
    setIsPreparingTranscript(true);
    try {
      const objectPath = await uploadRecording(recordingUri);
      const result = await transcribeAudio.mutateAsync({ data: { audioObjectPath: objectPath } });
      setTranscript(result.transcript);
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
      const createdPost = await createPost.mutateAsync({
        data: {
          audioObjectPath: objectPath,
          durationSeconds: recordingDuration,
          ...(previewTranscript ? { transcript: transcript.trim() } : {}),
          mentionedFounderIds: mentionedFounders.map((founder) => founder.id),
        }
      });
      if (isScreenActiveRef.current) {
        router.replace({
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
  const showRecordingState = isStarting || isRecording;

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
              {previewTranscript && (
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
                  disabled={isPreparingTranscript || (previewTranscript && !transcript.trim())}
                  accessibilityLabel="Publish SHÜÜT"
                  accessibilityState={{ disabled: isPreparingTranscript || (previewTranscript && !transcript.trim()) }}
                >
                  <Send color={colors.primaryForeground} size={18} />
                  <Text style={[styles.shuutText, { color: colors.primaryForeground }]}>SHÜÜT</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.recordCard}>
              <View style={styles.recordingState}>
                <Text style={[styles.recordingTitle, { color: showRecordingState ? colors.destructive : colors.mutedForeground }]}>
                  {showRecordingState ? 'RECORDING' : 'READY'}
                </Text>
                <Text style={[styles.timerText, { color: colors.foreground }]}>
                  {Math.floor((recorderState?.durationMillis || 0) / 1000 / 60)}:{Math.floor(((recorderState?.durationMillis || 0) / 1000) % 60).toString().padStart(2, '0')}
                </Text>
                <Text style={[styles.timerLimit, { color: colors.mutedForeground }]}>/ 1:30</Text>
              </View>
              
              <TouchableOpacity 
                style={[
                  styles.recordButton, 
                  { backgroundColor: showRecordingState ? colors.destructive : colors.primary }
                ]}
                onPress={isRecording ? stopRecording : () => void startRecording()}
                disabled={isStarting}
              >
                <Square color={colors.primaryForeground} size={32} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAwareScrollViewCompat>
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
    padding: 24,
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
    padding: 16,
    gap: 18,
  },
  reviewTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
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
    gap: 10,
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
    minHeight: 130,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 23,
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
  }
});
