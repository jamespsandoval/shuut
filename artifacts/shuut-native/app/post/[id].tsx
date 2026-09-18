import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetPost, useGetPostComments, useCreatePostComment, useRequestUploadUrl } from '@workspace/api-client-react';
import { ChevronLeft, Mic, Square, Send } from 'lucide-react-native';
import { PostCard } from '../../components/PostCard';
import { AuthenticatedAudioPlayer } from '../../components/AuthenticatedAudioPlayer';
import { File } from 'expo-file-system';
import { useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { SPEECH_RECORDING_OPTIONS } from '../../lib/audioRecording';
import { formatApproximateTimeAgo } from '../../lib/relativeTime';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = parseInt(id, 10);
  const colors = useColors();
  const router = useRouter();

  const { data: post, isLoading, refetch } = useGetPost(postId, { query: { queryKey: ['post', postId] } });
  const { data: comments, isLoading: commentsLoading, refetch: refetchComments } = useGetPostComments(postId, { query: { queryKey: ['comments', postId] } });

  const requestUploadUrl = useRequestUploadUrl();
  const createComment = useCreatePostComment();

  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder);
  const isRecordingRef = useRef(false);
  isRecordingRef.current = recorderState.isRecording;
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const startRecording = async () => {
    try {
      const perm = await getRecordingPermissionsAsync();
      if (perm.status !== 'granted') {
        const newPerm = await requestRecordingPermissionsAsync();
        if (newPerm.status !== 'granted') return;
      }
      setRecordedUri(null);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        setRecordedUri(uri);
        const finalDuration = Math.round((recorderState?.durationMillis ? recorderState.durationMillis / 1000 : 0) || 1);
        setDuration(finalDuration);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 90_000) {
      void stopRecording();
    }
  }, [recorderState.durationMillis, recorderState.isRecording]);

  useEffect(() => () => {
    if (isRecordingRef.current) void recorder.stop().catch(() => undefined);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, [recorder]);

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

      const domain = process.env.EXPO_PUBLIC_DOMAIN || "localhost:80";
      const fullUrl = uploadURL.startsWith('http') ? uploadURL : `https://${domain}${uploadURL}`;

      const uploadResult = await fileObj.upload(fullUrl, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'audio/mp4' },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Failed to upload voice comment: ${uploadResult.status}`);
      }

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

  if (isLoading || !post) {
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
        <Text style={[styles.title, { color: colors.foreground }]}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <PostCard post={post} refetchFeed={refetch} isDetail onReply={() => void startRecording()} />

        <Text style={[styles.commentsTitle, { color: colors.foreground }]}>Voice Comments</Text>

        <View style={[styles.composerContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
              <TouchableOpacity style={styles.recordBtnPlaceholder} onPress={recorderState.isRecording ? stopRecording : startRecording}>
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
