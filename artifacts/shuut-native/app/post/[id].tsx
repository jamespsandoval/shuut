import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, AppState, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetPost, useGetPostComments, useCreatePostComment, useRequestUploadUrl, useGetProfile } from '@workspace/api-client-react';
import { ChevronLeft, Mic, Square, Send } from 'lucide-react-native';
import { PostCard } from '../../components/PostCard';
import { AuthenticatedAudioPlayer } from '../../components/AuthenticatedAudioPlayer';
import { File } from 'expo-file-system';
import { useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { SPEECH_RECORDING_OPTIONS } from '../../lib/audioRecording';
import { formatApproximateTimeAgo } from '../../lib/relativeTime';
import { SafetyActionSheet } from '../../components/SafetyActionSheet';

import { VoiceAiConsentModal } from '../../components/VoiceAiConsentModal';
import { useVoiceConsentCheck } from '../../hooks/useVoiceConsentCheck';
import { resolveApiUrl } from '../../lib/apiUrl';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = parseInt(id, 10);
  const colors = useColors();
  const router = useRouter();

  const { data: post, isLoading, isError, refetch } = useGetPost(postId, { query: { queryKey: ['post', postId] } });
  const { data: comments, isLoading: commentsLoading, refetch: refetchComments } = useGetPostComments(postId, { query: { queryKey: ['comments', postId] } });
  const { data: viewerProfile } = useGetProfile('me', { query: { queryKey: ['profile', 'me'] } });

  const requestUploadUrl = useRequestUploadUrl();
  const createComment = useCreatePostComment();

  const {
    checkConsent,
    showModal,
    onAccept,
    onDecline,
    isLoading: isConsentLoading,
    isError: isConsentError
  } = useVoiceConsentCheck();

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
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const postScrollRef = useRef<ScrollView>(null);
  const postScrollOffsetRef = useRef(0);

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

  const cancelReply = async () => {
    await discardRecording(false);
    setRecordedUri(null);
  };

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

  useFocusEffect(useCallback(() => {
    if (interruptAlertedRef.current && AppState.currentState === 'active') {
      interruptAlertedRef.current = false;
      Alert.alert('Recording interrupted', 'Your voice comment was discarded. Please record it again.');
    }
    return () => { void discardRecording(true); };
  }, [recorder]));

  useEffect(() => {
    if (AppState.currentState !== 'active') return;
    void getRecordingPermissionsAsync();
  }, []);

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
        postId,
        data: { audioObjectPath: objectPath, durationSeconds: duration }
      });

      setRecordedUri(null);
      refetchComments();
      refetch();
    } catch (err) {
      console.error('Failed to publish comment', err);
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (isError || !post) {
    return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: colors.mutedForeground }}>This post is no longer available.</Text><TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back"><Text style={{ color: colors.primary, marginTop: 12 }}>Go back</Text></TouchableOpacity></SafeAreaView>;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={colors.foreground} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={postScrollRef}
        contentContainerStyle={styles.content}
        onScroll={(event) => { postScrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        <PostCard
          post={post}
          refetchFeed={refetch}
          isDetail
          onReply={() => void startRecording()}
          onRevealReshuut={(distance) => postScrollRef.current?.scrollTo({ y: postScrollOffsetRef.current + distance, animated: true })}
        />

        <Text style={[styles.commentsTitle, { color: colors.foreground }]}>Voice Comments</Text>

        <View style={[styles.composerContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {recordedUri ? (
            <View style={styles.composerActions}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <AuthenticatedAudioPlayer url={recordedUri} durationSeconds={duration} />
              </View>
              <View style={styles.composerButtonsRow}>
                <TouchableOpacity onPress={() => void cancelReply()} disabled={isUploading} accessibilityRole="button" accessibilityLabel="Cancel voice reply">
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13, marginRight: 8 }}>Cancel</Text>
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
                <View style={styles.composerButtonsRow}>
                  <TouchableOpacity onPress={() => void cancelReply()} accessibilityRole="button" accessibilityLabel="Cancel voice reply" hitSlop={8}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13, marginRight: 8 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.publishCommentBtn, { backgroundColor: colors.destructive }]}
                    onPress={stopRecording}
                    accessibilityLabel="Stop recording"
                  >
                    <Square color="#fff" size={14} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {commentsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : comments?.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No comments yet. Be the first to reply!</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {comments?.map(comment => (
              <View key={comment.id} style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.commentHeader}>
                  <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.author.name}</Text>
                  <SafetyActionSheet targetType="comment" targetId={comment.id} authorHandle={comment.author.handle} self={comment.author.handle === viewerProfile?.founder?.handle} compact />
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {formatApproximateTimeAgo(comment.createdAt)}
                  </Text>
                </View>
                {comment.transcript ? (
                  <Text style={[styles.commentTranscript, { color: colors.foreground }]}>{comment.transcript}</Text>
                ) : null}
                <AuthenticatedAudioPlayer url={comment.audioUrl} durationSeconds={comment.durationSeconds} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <VoiceAiConsentModal visible={showModal} onAccept={onAccept} onDecline={onDecline} />
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
    paddingTop: 8,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  content: { padding: 16, paddingBottom: 64 },
  commentsTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  composerContainer: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 24,
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
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  commentCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  commentAuthor: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  time: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  commentTranscript: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  }
});
