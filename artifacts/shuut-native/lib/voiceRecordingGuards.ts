export type VoiceConsentSnapshot = {
  required?: boolean;
} | null | undefined;

export type VoiceConsentGateInput = {
  status: VoiceConsentSnapshot;
  loading: boolean;
  error: boolean;
};

export type VoiceConsentGate = 'allow' | 'prompt' | 'block';

/**
 * Keep the microphone boundary explicit: only a known, non-required consent
 * response may reach the recorder. Unknown/error states fail closed.
 */
export function resolveVoiceConsentGate({
  status,
  loading,
  error,
}: VoiceConsentGateInput): VoiceConsentGate {
  if (loading || error || !status) return 'block';
  return status.required ? 'prompt' : 'allow';
}

export function shouldCancelRecordingForLifecycle({
  appIsActive,
  startPending,
  recording,
}: {
  appIsActive: boolean;
  startPending: boolean;
  recording: boolean;
}): boolean {
  return !appIsActive && (startPending || recording);
}