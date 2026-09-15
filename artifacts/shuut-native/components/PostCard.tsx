import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Share, Platform, ActivityIndicator } from 'react-native';
import { useColors } from '../hooks/useColors';
import { Post, useDeletePost, useSetReaction, useCreatePostShareLink, useReshuutPost, useCreatePostComment, useRequestUploadUrl, useGetPostComments, useUpdatePost } from '@workspace/api-client-react';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, Mic, Share as ShareIcon, Repeat2, Send, Square, Pencil } from 'lucide-react-native';
import { AuthenticatedAudioPlayer } from './AuthenticatedAudioPlayer';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, getRecordingPermissionsAsync } from 'expo-audio';
import { authenticatedImageSource } from '../lib/apiUrl';
import { useAuth } from '../hooks/useAuthStore';

export function PostCard({ post, refetchFeed, isDetail = false }: { post: Post, refetchFeed: () => void, isDetail?: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  const deletePost = useDeletePost();
  const setReaction = useSetReaction();
  const createShareLink = useCreatePostShareLink();
  const reshuutPost = useReshuutPost();
  const updatePost = useUpdatePost();

  const [showCommentComposer, setShowCommentComposer] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.transcript);

  // Comment composer state
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const requestUploadUrl = useRequestUploadUrl();
  const createComment = useCreatePostComment();

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
    reshuutPost.mutate({ postId: post.id }, { onSuccess: refetchFeed });
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

  const startRecording = async () => {
    try {
      const perm = await getRecordingPermissionsAsync();
      if (perm.status !== 'granted') {
        const newPerm = await requestRecordingPermissionsAsync();
        if (newPerm.status !== 'granted') return;
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
        </View>
      )}

      <View style={styles.postHeader}>
        <TouchableOpacity
          style={styles.authorInfo}
          onPress={() => router.push(`/profile/${post.author.handle}`)}
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
          {formatDistanceToNow(new Date(post.createdAt))} ago
        </Text>
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
        <Text style={[styles.transcript, { color: colors.foreground }]} numberOfLines={isDetail ? undefined : 3}>
          {post.transcript}
        </Text>
      )}

      <AuthenticatedAudioPlayer url={post.audioUrl} durationSeconds={post.durationSeconds} />

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

        <TouchableOpacity style={styles.actionBtn} onPress={() => {
          if (isDetail) {
            // Already showing comments below
          } else {
            setShowCommentComposer(!showCommentComposer);
          }
        }}>
          <Mic color={colors.mutedForeground} size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleReshuut}>
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
            {recordedUri ? (
              <View style={styles.composerActions}>
                <View style={{ flex: 1, marginRight: 8 }}>
                   <AuthenticatedAudioPlayer url={null} durationSeconds={duration} />
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
                <TouchableOpacity style={styles.recordBtnPlaceholder} onPress={recorder.isRecording ? stopRecording : startRecording}>
                  <Mic color={colors.mutedForeground} size={16} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginLeft: 8 }}>
                    {recorder.isRecording ? 'Recording...' : 'Add a voice comment...'}
                  </Text>
                </TouchableOpacity>
                {recorder.isRecording && (
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
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {formatDistanceToNow(new Date(comment.createdAt))} ago
                  </Text>
                </View>
                <AuthenticatedAudioPlayer url={comment.audioUrl} durationSeconds={comment.durationSeconds} />
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );

  if (isDetail) {
    return InnerCard;
  }

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push(`/post/${post.id}`)}>
      <View pointerEvents="box-none">
        {InnerCard}
      </View>
    </TouchableOpacity>
  );
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
