import { useState, useCallback } from 'react';
import { useGetVoiceAiConsent } from '@workspace/api-client-react';

export function useVoiceConsentCheck() {
  const { data: consentStatus, isLoading, isError, refetch } = useGetVoiceAiConsent();
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const checkConsent = useCallback(async (onAllowed: () => void) => {
    if (isError || (!isLoading && !consentStatus)) {
      // error state
      return { allowed: false, error: true };
    }
    if (isLoading) {
      return { allowed: false, loading: true };
    }
    if (consentStatus?.required) {
      setPendingAction(() => onAllowed);
      setShowModal(true);
      return { allowed: false, required: true };
    }

    onAllowed();
    return { allowed: true };
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