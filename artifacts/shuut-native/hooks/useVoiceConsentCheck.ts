import { useState, useCallback } from 'react';
import { useGetVoiceAiConsent } from '@workspace/api-client-react';
import { resolveVoiceConsentGate } from '../lib/voiceRecordingGuards';

export function useVoiceConsentCheck() {
  const { data: consentStatus, isLoading, isError, refetch } = useGetVoiceAiConsent();
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const checkConsent = useCallback(async (onAllowed: () => void) => {
    const gate = resolveVoiceConsentGate({
      status: consentStatus,
      loading: isLoading,
      error: isError,
    });
    if (gate === 'block') {
      return {
        allowed: false,
        loading: isLoading,
        error: !isLoading,
        required: false,
      };
    }
    if (gate === 'prompt') {
      setPendingAction(() => onAllowed);
      setShowModal(true);
      return { allowed: false, required: true, loading: false, error: false };
    }

    onAllowed();
    return { allowed: true, required: false, loading: false, error: false };
  }, [consentStatus, isLoading, isError]);

  const onAccept = useCallback(() => {
    setShowModal(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const onDecline = useCallback(() => {
    setShowModal(false);
    setPendingAction(null);
  }, []);

  return {
    checkConsent,
    showModal,
    onAccept,
    onDecline,
    isLoading,
    isError,
    consentStatus,
    refetch,
    setShowModal
  };
}