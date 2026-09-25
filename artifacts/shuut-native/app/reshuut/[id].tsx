import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Mic, Send, Square } from 'lucide-react-native';
import { File } from 'expo-file-system';
import { useAudioRecorder, useAudioRecorderState, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '../../hooks/useColors';
import { useGetReshuut, useGetReshuutComments, useCreateReshuutComment, useRequestUploadUrl, useGetProfile } from '@workspace/api-client-react';
import { ReshuutCard } from '../../components/ReshuutCard';
import { AuthenticatedAudioPlayer } from '../../components/AuthenticatedAudioPlayer';
import { SafetyActionSheet } from '../../components/SafetyActionSheet';
import { VoiceAiConsentModal } from '../../components/VoiceAiConsentModal';
import { useVoiceConsentCheck } from '../../hooks/useVoiceConsentCheck';
import { SPEECH_RECORDING_OPTIONS } from '../../lib/audioRecording';
import { resolveApiUrl } from '../../lib/apiUrl';
import { formatApproximateTimeAgo } from '../../lib/relativeTime';

export default function ReshuutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reshuutId = Number.parseInt(id, 10);
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: reshuutItem, isLoading, isError, refetch } = useGetReshuut(reshuutId, {
    query: { queryKey: ['reshuut', reshuutId], staleTime: 0 },
  });
  const reshuut = reshuutItem?.reshuut;
  const { data: comments, isLoading: commentsLoading, refetch: refetchComments } = useGetReshuutComments(reshuutId, {
    query: { queryKey: ['reshuut-comments', reshuutId] },
  });
  const { data: viewerProfile } = useGetProfile('me', { query: { queryKey: ['profile', 'me'] } });
  const createComment = useCreateReshuutComment();
  const requestUploadUrl = useRequestUploadUrl();
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);
  const stoppingRef = useRef(false);
  const previousRecordingRef = useRef(false);
  const recorderIsActiveRef = useRef(false);
  const interruptedRef = useRef(false);
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS, (status) => {
    if (status.mediaServicesDidReset && previousRecordingRef.current) interruptedRef.current = true;
  });
  const recorderState = useAudioRecorderState(recorder);
  recorderIsActiveRef.current = recorderState.isRecording;
  const {
    checkConsent, showModal, onAccept, onDecline, isLoading: consentLoading, isError: consentError,
  } = useVoiceConsentCheck();

  const restoreAudioMode = () => setAudioModeAsync({
    allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false,
    allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
  }).catch(() => undefined);

  const discardRecording = async (alertOnInterrupt = false) => {
    const active = recorderState.isRecording || previousRecordingRef.current;
    pendingRef.current = false;
    if (active) {
      stoppingRef.current = true;
      await recorder.stop().catch(() => undefined);
      stoppingRef.current = false;
      previousRecordingRef.current = false;
      setRecordedUri(null);
      await restoreAudioMode();
      if (alertOnInterrupt) interruptedRef.current = true;
    }
  };

  const startRecording = async () => {
    pendingRef.current = true;
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
        if (!mountedRef.current || AppState.currentState !== 'active') return;
        setRecordedUri(null);
        await setAudioModeAsync({
          allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false,
          allowsBackgroundRecording: false, interruptionMode: 'doNotMix',
        });
        if (!mountedRef.current || AppState.currentState !== 'active') { await restoreAudioMode(); return; }
        await recorder.prepareToRecordAsync();
        if (!mountedRef.current || AppState.currentState !== 'active') { await restoreAudioMode(); return; }
        recorder.record();
        previousRecordingRef.current = true;
      } catch (error) {
        Alert.alert('Could not start recording', error instanceof Error ? error.message : 'Please try again.');
        await restoreAudioMode();
      }
    });
    pendingRef.current = false;
    if (error) Alert.alert('Error', 'Could not verify voice consent. Please try again.');
  };

  const stopRecording = async () => {
    pendingRef.current = false;
    stoppingRef.current = true;
    try {
      await recorder.stop();
      previousRecordingRef.current = false;
      const uri = recorder.uri;
      if (uri) {
        setRecordedUri(uri);
        setDuration(Math.max(1, Math.round((recorderState.durationMillis || 1000) / 1000)));
      }
    } catch (error) {
      console.error('Failed to stop voice reply recording', error);
    } finally {
      stoppingRef.current = false;
      await restoreAudioMode();
    }
  };

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 90_000) void stopRecording();
    if (previousRecordingRef.current && !recorderState.isRecording && !stoppingRef.current) {
      previousRecordingRef.current = false;
      interruptedRef.current = true;
      setRecordedUri(null);
      void restoreAudioMode();
    }
  }, [recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && (recorderIsActiveRef.current || previousRecordingRef.current || pendingRef.current)) void discardRecording(true);
      else if (state === 'active' && interruptedRef.current) {
        interruptedRef.current = false;
        Alert.alert('Recording interrupted', 'Your voice reply was discarded. Please record it again.');
      }
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      void discardRecording();
    };
  }, [recorder]);

  useFocusEffect(useCallback(() => {
    mountedRef.current = true;
    void refetch();
    return () => { void discardRecording(true); };
  }, [recorder, refetch]));

  const publishComment = async () => {
    if (!recordedUri || uploading) return;
    try {
      setUploading(true);
      const file = new File(recordedUri);
      if (!file.exists) throw new Error('Recorded voice reply is no longer available.');
      const upload = await requestUploadUrl.mutateAsync({ data: { name: 'reshuut-comment.m4a', size: file.size, contentType: 'audio/mp4' } });
      const uploadUrl = resolveApiUrl(upload.uploadURL);
      if (!uploadUrl) throw new Error('Audio upload URL was empty.');
      const result = await file.upload(uploadUrl, { httpMethod: 'PUT', headers: { 'Content-Type': 'audio/mp4' } });
      if (result.status < 200 || result.status >= 300) throw new Error(`Audio upload failed: ${result.status}`);
      if (!mountedRef.current || AppState.currentState !== 'active') return;
      await createComment.mutateAsync({ reshuutId, data: { audioObjectPath: upload.objectPath, durationSeconds: duration } });
      setRecordedUri(null);
      await Promise.all([refetchComments(), refetch(), queryClient.invalidateQueries()]);
    } catch (error) {
      Alert.alert('Could not send voice reply', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  if (isError || !reshuut) return (
    <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.mutedForeground }}>This reSHÜÜT is no longer available.</Text>
      <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back"><Text style={{ color: colors.primary, marginTop: 12 }}>Go back</Text></TouchableOpacity>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><ChevronLeft color={colors.foreground} size={24} /></TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>reSHÜÜT</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ReshuutCard reshuut={reshuut} refetchFeed={() => refetch()} isDetail />
        <Text style={[styles.commentsTitle, { color: colors.foreground }]}>Voice Replies</Text>
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {recordedUri ? (
            <View style={styles.composerRow}>
              <View style={{ flex: 1 }}><AuthenticatedAudioPlayer url={recordedUri} durationSeconds={duration} /></View>
              <TouchableOpacity onPress={() => setRecordedUri(null)} disabled={uploading} accessibilityLabel="Discard voice reply"><Text style={{ color: colors.mutedForeground }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.publish, { backgroundColor: colors.primary }]} onPress={() => void publishComment()} disabled={uploading} accessibilityLabel="Send voice reply">
                {uploading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Send color={colors.primaryForeground} size={15} />}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.composerRow}>
              <TouchableOpacity style={styles.recordButton} onPress={recorderState.isRecording ? () => void stopRecording() : () => void startRecording()}
                disabled={consentLoading || consentError} accessibilityRole="button" accessibilityLabel={recorderState.isRecording ? 'Stop voice reply' : 'Record a voice reply'}>
                {recorderState.isRecording ? <Square color={colors.destructive} size={16} /> : <Mic color={colors.mutedForeground} size={16} />}
                <Text style={{ color: colors.mutedForeground, marginLeft: 8 }}>{recorderState.isRecording ? 'Recording…' : 'Add a voice reply…'}</Text>
              </TouchableOpacity>
              {recorderState.isRecording && <TouchableOpacity style={[styles.publish, { backgroundColor: colors.destructive }]} onPress={() => void stopRecording()} accessibilityLabel="Stop recording"><Square color={colors.primaryForeground} size={14} /></TouchableOpacity>}
            </View>
          )}
        </View>
        {commentsLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : comments?.length ? (
          <View style={{ gap: 12 }}>
            {comments.map((comment) => (
              <View key={comment.id} style={[styles.comment, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.commentHeading}>
                  <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.author.name}</Text>
                  <SafetyActionSheet targetType="comment" targetId={comment.id} authorHandle={comment.author.handle} self={comment.author.handle === viewerProfile?.founder?.handle} compact />
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatApproximateTimeAgo(comment.createdAt)}</Text>
                </View>
                {comment.transcript ? <Text style={[styles.transcript, { color: colors.foreground }]}>{comment.transcript}</Text> : null}
                <AuthenticatedAudioPlayer url={comment.audioUrl} durationSeconds={comment.durationSeconds} />
              </View>
            ))}
          </View>
        ) : <Text style={[styles.empty, { color: colors.mutedForeground }]}>No voice replies yet. Be the first to reply.</Text>}
      </ScrollView>
      <VoiceAiConsentModal visible={showModal} onAccept={onAccept} onDecline={onDecline} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  back: { padding: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  content: { padding: 16, paddingBottom: 64, gap: 14 },
  commentsTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 4 },
  composer: { padding: 12, borderWidth: 1, borderRadius: 16 },
  composerRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9 },
  recordButton: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  publish: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  comment: { padding: 14, borderWidth: 1, borderRadius: 14 },
  commentHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  commentAuthor: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  time: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  transcript: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21, marginBottom: 8 },
  empty: { textAlign: 'center', marginTop: 16, fontFamily: 'Inter_400Regular', fontSize: 14 },
});