import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useGetPost, useSetReaction, useGetPostComments, useCreatePostComment, useDeletePost } from '@workspace/api-client-react';
import { ChevronLeft, Play, Pause, Rocket, Smile, ThumbsDown, User, Mic, Trash2, Send, Square } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, PermissionResponse } from 'expo-audio';
import { useRequestUploadUrl } from '@workspace/api-client-react';

import { AuthenticatedAudioPlayer } from '../../components/AuthenticatedAudioPlayer';

// ... implementing post/[id]
export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = parseInt(id, 10);
  const colors = useColors();
  const router = useRouter();

  const { data: post, isLoading, refetch } = useGetPost(postId, { query: { queryKey: ['post', postId] } });
  const { data: comments, isLoading: commentsLoading, refetch: refetchComments } = useGetPostComments(postId, { query: { queryKey: ['comments', postId] } });

  const setReaction = useSetReaction();
  const deletePost = useDeletePost();

  const handleDelete = () => {
    deletePost.mutate(
      { postId },
      {
        onSuccess: () => router.replace('/(main)/feed')
      }
    );
  };

  const handleReaction = (emojiType: 'rocket' | 'laughing' | 'thumbsDown') => {
    setReaction.mutate({ postId, data: { emojiType } }, {
      onSuccess: () => refetch()
    });
  };

  const requestUploadUrl = useRequestUploadUrl();
  const createComment = useCreatePostComment();
  
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [permissionResponse, setPermissionResponse] = useState<PermissionResponse | null>(null);

  useEffect(() => {
    getRecordingPermissionsAsync().then(setPermissionResponse);
  }, []);

  const startRecording = async () => {
    try {
      let perm = permissionResponse;
      if (!perm || perm.status !== 'granted') {
        perm = await requestRecordingPermissionsAsync();
        setPermissionResponse(perm);
        if (perm.status !== 'granted') {
          return;
        }
      }

      setRecordedUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    try {
      recorder.stop();
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

  const publishComment = async () => {
    if (!recordedUri) return;
    try {
      setIsUploading(true);
      const fileObj = new File(recordedUri);
      
      if (!fileObj.exists) {
        throw new Error('Recorded file does not exist');
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
      
      if (uploadResult.status !== 200) {
        throw new Error('Failed to upload file');
      }

      await createComment.mutateAsync({
        postId,
        data: { audioObjectPath: objectPath, durationSeconds: duration }
      });

      setRecordedUri(null);
      refetchComments();
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
        <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.postHeader}>
            <TouchableOpacity 
              style={styles.authorInfo}
              onPress={() => router.push(`/profile/${post.author.handle}`)}
            >
              {post.author.avatarUrl ? (
                <Image source={{ uri: post.author.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: post.author.avatarColor || colors.primary }]}>
                  <User color="#fff" size={20} />
                </View>
              )}
              <View>
                <Text style={[styles.authorName, { color: colors.foreground }]}>{post.author.name}</Text>
                <Text style={[styles.authorHandle, { color: colors.mutedForeground }]}>@{post.author.handle}</Text>
              </View>
            </TouchableOpacity>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </Text>
              {post.canDelete && (
                <TouchableOpacity onPress={handleDelete} disabled={deletePost.isPending}>
                  <Trash2 color={colors.destructive} size={16} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={[styles.transcript, { color: colors.foreground }]}>
            {post.transcript}
          </Text>

          <AuthenticatedAudioPlayer url={post.audioUrl} durationSeconds={post.durationSeconds} />

          <View style={styles.reactions}>
            <TouchableOpacity style={styles.reactionBtn} onPress={() => handleReaction('rocket')}>
              <Rocket color={post.viewerReaction === 'rocket' ? colors.primary : colors.mutedForeground} size={16} />
              <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{post.reactions.rocket}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reactionBtn} onPress={() => handleReaction('laughing')}>
              <Smile color={post.viewerReaction === 'laughing' ? colors.primary : colors.mutedForeground} size={16} />
              <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{post.reactions.laughing}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reactionBtn} onPress={() => handleReaction('thumbsDown')}>
              <ThumbsDown color={post.viewerReaction === 'thumbsDown' ? colors.primary : colors.mutedForeground} size={16} />
              <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{post.reactions.thumbsDown}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.commentsTitle, { color: colors.foreground }]}>Voice Comments</Text>

        <View style={[styles.composerContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {recordedUri ? (
            <View style={styles.composerActions}>
              <AuthenticatedAudioPlayer url={null} durationSeconds={duration} />
              <View style={styles.composerButtonsRow}>
                <TouchableOpacity onPress={() => setRecordedUri(null)} disabled={isUploading}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.publishCommentBtn, { backgroundColor: colors.primary }]}
                  onPress={publishComment}
                  disabled={isUploading}
                >
                  {isUploading ? <ActivityIndicator size="small" color="#fff" /> : <Send color="#fff" size={16} />}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.composerActions}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                {recorder.isRecording ? 'Recording...' : 'Add a voice comment...'}
              </Text>
              <TouchableOpacity 
                style={[styles.recordBtn, { backgroundColor: recorder.isRecording ? colors.destructive : colors.primary }]}
                onPress={recorder.isRecording ? stopRecording : startRecording}
              >
                {recorder.isRecording ? <Square color="#fff" size={16} /> : <Mic color="#fff" size={16} />}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {commentsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : comments?.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No comments yet. Be the first to reply!</Text>
        ) : (
          comments?.map(comment => (
            <View key={comment.id} style={[styles.commentCard, { borderBottomColor: colors.border }]}>
              <View style={styles.commentHeader}>
                <View style={styles.authorInfo}>
                  <View style={[styles.smallAvatar, { backgroundColor: comment.author.avatarColor || colors.primary }]}>
                    <User color="#fff" size={12} />
                  </View>
                  <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.author.name}</Text>
                </View>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {formatDistanceToNow(new Date(comment.createdAt))}
                </Text>
              </View>
              <Text style={[styles.commentTranscript, { color: colors.foreground }]}>{comment.transcript}</Text>
              <View style={{ marginTop: 8 }}>
                <AuthenticatedAudioPlayer url={comment.audioUrl} durationSeconds={comment.durationSeconds} />
              </View>
            </View>
          ))
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
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  content: { padding: 16, gap: 16 },
  postCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  authorHandle: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  time: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  transcript: {
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 16,
  },
  audioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    marginBottom: 16,
  },
  duration: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  reactions: { flexDirection: 'row', gap: 24 },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  reactionCount: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  commentsTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  commentCard: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAuthor: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  commentTranscript: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', marginTop: 32 },
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
  composerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  recordBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishCommentBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
