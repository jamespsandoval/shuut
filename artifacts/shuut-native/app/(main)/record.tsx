import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, PermissionResponse } from 'expo-audio';
import { File } from 'expo-file-system';
import { useRequestUploadUrl, useCreatePost } from '@workspace/api-client-react';
import { Mic, Square, Play, Pause, Send } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuthStore';

export default function RecordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [permissionResponse, setPermissionResponse] = useState<PermissionResponse | null>(null);
  const hasAttemptedAutoStart = useRef(false);

  const requestUploadUrl = useRequestUploadUrl();
  const createPost = useCreatePost();

  // Create a player if we have a recorded file
  const player = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);

  const startRecording = async (knownPermission?: PermissionResponse | null) => {
    try {
      setIsStarting(true);
      let perm = knownPermission ?? permissionResponse;
      if (!perm || perm.status !== 'granted') {
        perm = await requestRecordingPermissionsAsync();
        setPermissionResponse(perm);
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

      setRecordedUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error('Failed to start recording', err);
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (hasAttemptedAutoStart.current) return;
    hasAttemptedAutoStart.current = true;

    const beginRecording = async () => {
      const permission = await getRecordingPermissionsAsync();
      setPermissionResponse(permission);
      await startRecording(permission);
    };

    void beginRecording();
  }, []);

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

  const togglePlayback = () => {
    if (!player) return;
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const publishPost = async () => {
    if (!recordedUri) return;
    try {
      setIsUploading(true);
      const fileObj = new File(recordedUri);
      
      if (!fileObj.exists) {
        throw new Error('Recorded file does not exist');
      }

      // 1. Request Upload URL
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: {
          name: 'audio.m4a',
          size: fileObj.size,
          contentType: 'audio/mp4'
        }
      });

      // 2. Upload to storage
      const domain = process.env.EXPO_PUBLIC_DOMAIN || "localhost:80";
      const fullUrl = uploadURL.startsWith('http') ? uploadURL : `https://${domain}${uploadURL}`;

      const uploadResult = await fileObj.upload(fullUrl, {
        httpMethod: 'PUT',
        headers: {
          'Content-Type': 'audio/mp4',
        },
      });
      
      if (uploadResult.status !== 200) {
        throw new Error('Failed to upload file: ' + uploadResult.status);
      }

      // 3. Create Post
      await createPost.mutateAsync({
        data: {
          audioObjectPath: objectPath,
          durationSeconds: duration
        }
      });

      setRecordedUri(null);
      router.replace('/(main)/feed');
    } catch (err) {
      console.error('Failed to publish', err);
    } finally {
      setIsUploading(false);
    }
  };

  const isRecording = recorder.isRecording;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.recordingArea}>
          {recordedUri ? (
            <View style={styles.previewCard}>
              <Text style={[styles.previewText, { color: colors.foreground }]}>Review your SHÜÜT</Text>
              
              <TouchableOpacity 
                style={[styles.playButton, { backgroundColor: colors.primary }]}
                onPress={togglePlayback}
              >
                {player?.playing ? (
                  <Pause color={colors.primaryForeground} size={32} />
                ) : (
                  <Play color={colors.primaryForeground} size={32} style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => setRecordedUri(null)}
                disabled={isUploading}
              >
                <Text style={[styles.retakeText, { color: colors.mutedForeground }]}>Discard</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.recordCard}>
              <View style={styles.recordingState}>
                <Text style={[styles.recordingTitle, { color: isRecording ? colors.destructive : colors.mutedForeground }]}>
                  {isRecording ? 'RECORDING' : isStarting ? 'STARTING…' : 'READY'}
                </Text>
                <Text style={[styles.timerText, { color: colors.foreground }]}>
                  {Math.floor((recorderState?.durationMillis || 0) / 1000 / 60)}:{Math.floor(((recorderState?.durationMillis || 0) / 1000) % 60).toString().padStart(2, '0')}
                </Text>
                <Text style={[styles.timerLimit, { color: colors.mutedForeground }]}>/ 1:30</Text>
              </View>
              
              <TouchableOpacity 
                style={[
                  styles.recordButton, 
                  { backgroundColor: isRecording ? colors.destructive : colors.primary }
                ]}
                onPress={isRecording ? stopRecording : () => void startRecording()}
                disabled={isStarting}
              >
                {isRecording ? (
                  <Square color={colors.primaryForeground} size={32} />
                ) : (
                  <Mic color={colors.primaryForeground} size={40} />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {recordedUri && (
          <TouchableOpacity
            style={[styles.publishButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={publishPost}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Send color={colors.primaryForeground} size={20} />
                <Text style={[styles.publishText, { color: colors.primaryForeground }]}>Publish</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  recordingArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordCard: {
    alignItems: 'center',
    gap: 32,
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
