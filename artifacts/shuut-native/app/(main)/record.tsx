import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Linking, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../../hooks/useColors';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, PermissionResponse } from 'expo-audio';
import { File } from 'expo-file-system';
import { getPost, useRequestUploadUrl, useCreatePost } from '@workspace/api-client-react';
import { Mic, Square } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuthStore';

export default function RecordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [permissionResponse, setPermissionResponse] = useState<PermissionResponse | null>(null);
  const hasAttemptedAutoStart = useRef(false);
  const spinnerRotation = useRef(new Animated.Value(0)).current;

  const requestUploadUrl = useRequestUploadUrl();
  const createPost = useCreatePost();

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
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [isProcessing, spinnerRotation]);

  const stopRecording = async () => {
    try {
      setIsProcessing(true);
      const finalDuration = Math.max(1, Math.round((recorderState?.durationMillis || 0) / 1000));
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording file was not created.');
      await publishPost(uri, finalDuration);
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsProcessing(false);
      Alert.alert('Could not publish', 'Your SHÜÜT could not be processed. Please try again.');
    }
  };

  const publishPost = async (recordingUri: string, recordingDuration: number) => {
    try {
      const fileObj = new File(recordingUri);
      
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
      const createdPost = await createPost.mutateAsync({
        data: {
          audioObjectPath: objectPath,
          durationSeconds: recordingDuration,
        }
      });

      for (let attempt = 0; attempt < 90; attempt += 1) {
        const post = await getPost(createdPost.id);
        if (post.transcriptionStatus === 'ready') {
          router.replace({
            pathname: '/(main)/feed',
            params: { newPostId: String(post.id) },
          });
          return;
        }
        if (post.transcriptionStatus === 'failed') {
          throw new Error('Transcription failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error('Transcription timed out');
    } catch (err) {
      console.error('Failed to publish', err);
      throw err;
    }
  };

  const isRecording = recorder.isRecording;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.recordingArea}>
          {isProcessing ? (
            <View style={styles.processingState}>
              <Animated.Image
                source={require('../../assets/images/icon.png')}
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
