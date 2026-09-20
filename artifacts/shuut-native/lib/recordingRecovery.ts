export const RECORDING_RECOVERY_KEY = '@shuut/recording-recovery';
export const RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RecordingRecovery = {
  uri: string;
  duration: number;
  interruptionMessage: string;
  timestamp: number;
};

export function validateRecovery(value: unknown, now = Date.now()): RecordingRecovery | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RecordingRecovery>;
  if (
    typeof candidate.uri !== 'string' ||
    !candidate.uri ||
    typeof candidate.duration !== 'number' ||
    !Number.isFinite(candidate.duration) ||
    candidate.duration < 0 ||
    typeof candidate.interruptionMessage !== 'string' ||
    typeof candidate.timestamp !== 'number' ||
    !Number.isFinite(candidate.timestamp) ||
    now - candidate.timestamp > RECOVERY_MAX_AGE_MS ||
    candidate.timestamp > now + 60_000
  ) return null;
  return {
    uri: candidate.uri,
    duration: Math.max(1, Math.round(candidate.duration)),
    interruptionMessage: candidate.interruptionMessage,
    timestamp: candidate.timestamp,
  };
}

export function shouldPreserveInterruptedRecording(isRecording: boolean, uri?: string | null): boolean {
  return isRecording && Boolean(uri);
}