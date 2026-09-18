import { RecordingOptions, RecordingPresets } from 'expo-audio';

export const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 24_000,
  numberOfChannels: 1,
  bitRate: 48_000,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    sampleRate: 24_000,
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    sampleRate: 24_000,
  },
  web: {
    ...RecordingPresets.HIGH_QUALITY.web,
    bitsPerSecond: 48_000,
  },
};