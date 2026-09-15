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
        // Make sure we have a fully qualified URL
        const fullUrl = url.startsWith('http') ? url : `https://${domain}${url}`;
        
        // Generate a safe local filename based on the URL
        const filename = encodeURIComponent(url) + '.m4a';
        const fileObj = new File(Paths.cache, filename);

        // Check if we already have it
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

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = (durationSeconds % 60).toString().padStart(2, '0');

  if (error || !url) {
    return (
      <View style={[styles.audioPill, { backgroundColor: colors.muted, opacity: 0.5 }]}>
        <Play color={colors.mutedForeground} size={16} />
        <Text style={[styles.duration, { color: colors.mutedForeground }]}>
          {minutes}:{seconds}
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={[styles.audioPill, { backgroundColor: player?.playing ? colors.primary : colors.muted }]} 
      onPress={togglePlayback}
      disabled={isDownloading || !player}
    >
      {isDownloading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : player?.playing ? (
        <Pause color={colors.primaryForeground} size={16} />
      ) : (
        <Play color={colors.primary} size={16} />
      )}
      
      <Text style={[styles.duration, { color: player?.playing ? colors.primaryForeground : colors.foreground }]}>
        {minutes}:{seconds}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  duration: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
});
