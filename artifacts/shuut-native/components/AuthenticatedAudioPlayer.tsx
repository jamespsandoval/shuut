import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Play, Pause } from 'lucide-react-native';
import { useAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useAuth } from '../hooks/useAuthStore';
import { useColors } from '../hooks/useColors';

interface AuthenticatedAudioPlayerProps {
  url: string | null | undefined;
  durationSeconds: number;
}

export function AuthenticatedAudioPlayer({ url, durationSeconds }: AuthenticatedAudioPlayerProps) {
  const { token } = useAuth();
  const colors = useColors();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || !token) return;

    let isMounted = true;
    
    const downloadAudio = async () => {
      try {
        setIsDownloading(true);
        setError(false);

        const domain = process.env.EXPO_PUBLIC_DOMAIN || "localhost:80";
        const fullUrl = url.startsWith('http') ? url : `https://${domain}${url}`;
        
        const filename = encodeURIComponent(url) + '.m4a';
        const fileObj = new File(Paths.cache, filename);

        const exists = fileObj.exists;
        if (exists) {
          if (isMounted) setLocalUri(fileObj.uri);
          return;
        }

        const downloadedFile = await File.downloadFileAsync(fullUrl, fileObj, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (isMounted) setLocalUri(downloadedFile.uri);
      } catch (err) {
        console.error('Audio download error:', err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setIsDownloading(false);
      }
    };

    downloadAudio();

    return () => {
      isMounted = false;
    };
  }, [url, token]);

  const player = useAudioPlayer(localUri ? { uri: localUri } : null);

  const togglePlayback = () => {
    if (!player) return;
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const bars = 24;
  const barHeights = Array.from({ length: bars }).map((_, i) => {
    return 30 + Math.sin(i * 0.5 + durationSeconds) * 20 + Math.cos(i * 1.2) * 15;
  });

  const progress = player?.currentTime ? (player.currentTime / (durationSeconds || 1)) * 100 : 0;
  const isPlaying = player?.playing || false;

  if (error || !url) {
    return (
      <View style={[styles.container, { backgroundColor: 'transparent', borderColor: colors.border }]}>
        <View style={[styles.playButton, { backgroundColor: colors.muted, opacity: 0.5 }]}>
          <Play color={colors.mutedForeground} size={16} style={{ marginLeft: 2 }} />
        </View>
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
        style={[styles.playButton, { backgroundColor: colors.primary }]}
        onPress={togglePlayback}
        disabled={isDownloading || !player}
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
