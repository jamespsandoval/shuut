import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Play, Pause } from 'lucide-react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useAuth } from '../hooks/useAuthStore';
import { useColors } from '../hooks/useColors';
import { resolveApiUrl } from '../lib/apiUrl';

interface AuthenticatedAudioPlayerProps {
  url: string | null | undefined;
  durationSeconds: number;
}

function sessionCacheSuffix(token: string) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function AuthenticatedAudioPlayer({ url, durationSeconds }: AuthenticatedAudioPlayerProps) {
  const { token } = useAuth();
  const colors = useColors();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(false);
  const pendingPlayRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    requestIdRef.current += 1;
    pendingPlayRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsDownloading(false);

    if (!url) {
      setLocalUri(null);
      setError(false);
    } else if (url.startsWith('file:') || url.startsWith('blob:')) {
      setLocalUri(url);
      setError(false);
    } else {
      setLocalUri(null);
      setError(false);
    }

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [url, token]);

  const player = useAudioPlayer(localUri ? { uri: localUri } : null);
  const status = useAudioPlayerStatus(player);

  const downloadAudio = useCallback(async () => {
    if (!url || url.startsWith('file:') || url.startsWith('blob:')) return;
    if (!token) {
      setError(true);
      return;
    }

    const requestId = requestIdRef.current;
    const isCurrent = () => mountedRef.current && requestId === requestIdRef.current;

    try {
      setIsDownloading(true);
      setError(false);

      const fullUrl = resolveApiUrl(url);
      if (!fullUrl) throw new Error('Audio URL was empty.');

      if (Platform.OS === 'web') {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const response = await fetch(fullUrl, {
          credentials: 'omit',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`Audio request failed with status ${response.status}`);
        }

        const nextObjectUrl = URL.createObjectURL(await response.blob());
        if (!isCurrent()) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        objectUrlRef.current = nextObjectUrl;
        setLocalUri(nextObjectUrl);
        return;
      }

      const { File, Paths } = await import('expo-file-system');
      // Do not reuse a private recording downloaded by a different session.
      const filename = encodeURIComponent(url) + '-' + sessionCacheSuffix(token) + '.m4a';
      const fileObj = new File(Paths.cache, filename);

      if (fileObj.exists) {
        if (isCurrent()) setLocalUri(fileObj.uri);
        return;
      }

      const downloadedFile = await File.downloadFileAsync(fullUrl, fileObj, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (isCurrent()) setLocalUri(downloadedFile.uri);
    } catch (err) {
      if (isCurrent() && !(err instanceof Error && err.name === 'AbortError')) {
        setError(true);
      }
    } finally {
      if (isCurrent()) setIsDownloading(false);
    }
  }, [token, url]);

  useEffect(() => {
    if (!localUri || !pendingPlayRef.current || !player) return;

    pendingPlayRef.current = false;
    void (async () => {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      if (status.didJustFinish) {
        await player.seekTo(0);
      }
      player.play();
    })();
  }, [localUri, player, status.didJustFinish]);

  const togglePlayback = async () => {
    if (error) {
      pendingPlayRef.current = true;
      await downloadAudio();
      return;
    }
    if (!localUri) {
      pendingPlayRef.current = true;
      await downloadAudio();
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      if (status.didJustFinish) {
        await player.seekTo(0);
      }
      player.play();
    }
  };

  const bars = 24;
  const barHeights = Array.from({ length: bars }).map((_, i) => {
    return 30 + Math.sin(i * 0.5 + durationSeconds) * 20 + Math.cos(i * 1.2) * 15;
  });

  const progress = status.currentTime ? (status.currentTime / (status.duration || durationSeconds || 1)) * 100 : 0;
  const isPlaying = status.playing;

  if (!url) {
    return (
      <View style={[styles.container, { backgroundColor: 'transparent', borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: colors.muted, opacity: 0.5 }]}
          disabled
        >
          <Play color={colors.mutedForeground} size={16} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
        <View style={styles.waveform}>
          {barHeights.map((height, i) => (
            <View key={i} style={[styles.bar, { height: `${Math.max(10, height)}%`, backgroundColor: colors.mutedForeground, opacity: 0.3 }]} />
          ))}
        </View>
        <Text style={[styles.duration, { color: colors.mutedForeground }]}>
          {Math.max(1, Math.round(durationSeconds))} sec
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: 'rgba(0,0,0,0.03)', borderColor: colors.border }]}>
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: error ? colors.muted : colors.primary }]}
        onPress={() => void togglePlayback()}
        disabled={isDownloading}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isDownloading ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : isPlaying ? (
          <Pause color={colors.primaryForeground} size={16} />
        ) : (
          <Play color={colors.primaryForeground} size={16} style={{ marginLeft: 2 }} />
        )}
      </TouchableOpacity>
      
      <View style={styles.waveform}>
        {barHeights.map((height, i) => {
          const isPlayed = (i / bars) * 100 <= progress;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: `${Math.max(10, height)}%`,
                  backgroundColor: isPlayed ? colors.primary : colors.mutedForeground,
                  opacity: isPlayed ? 1 : 0.3,
                }
              ]}
            />
          );
        })}
      </View>

      <Text style={[styles.duration, { color: colors.mutedForeground }]}>
        {Math.max(1, Math.round(durationSeconds))} sec
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
  },
  duration: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
