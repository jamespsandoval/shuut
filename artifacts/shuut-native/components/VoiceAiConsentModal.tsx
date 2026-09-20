import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Switch, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { useColors } from '../hooks/useColors';
import { useGetVoiceAiConsent, useAcceptVoiceAiConsent, getGetVoiceAiConsentQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

interface VoiceAiConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function VoiceAiConsentModal({ visible, onAccept, onDecline }: VoiceAiConsentModalProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: consentStatus } = useGetVoiceAiConsent();
  const acceptConsent = useAcceptVoiceAiConsent();

  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [isConsentPending, setIsConsentPending] = useState(false);

  const handleAccept = async () => {
    if (!consentAcknowledged || !consentStatus) return;
    setIsConsentPending(true);
    try {
      const source = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'native';
      const updatedConsent = await acceptConsent.mutateAsync({
        data: {
          version: consentStatus.currentVersion,
          source: source as 'ios' | 'android' | 'native'
        }
      });
      void queryClient.invalidateQueries({ queryKey: getGetVoiceAiConsentQueryKey() });
      if (!updatedConsent.required) {
        onAccept();
      }
    } catch (err) {
      Alert.alert('Error', 'Could not save consent. Please try again.');
    } finally {
      setIsConsentPending(false);
    }
  };

  const handleDecline = () => {
    setConsentAcknowledged(false);
    onDecline();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Voice & AI Processing</Text>
          <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
            <Text style={[styles.modalText, { color: colors.foreground, marginBottom: 12 }]}>
              {consentStatus?.summary || 'To provide transcriptions and AI features, we need your consent to process your voice.'}
            </Text>
            {consentStatus?.details?.map((detail, index) => (
              <Text key={index} style={[styles.modalText, { color: colors.mutedForeground, marginBottom: 8 }]}>
                • {detail}
              </Text>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 }}>
            <Switch
              value={consentAcknowledged}
              onValueChange={setConsentAcknowledged}
              trackColor={{ false: colors.border, true: colors.primary }}
              testID="consent-acknowledge-switch"
              accessibilityLabel="Acknowledge voice and AI processing consent"
            />
            <Text style={[styles.modalText, { color: colors.foreground, flex: 1, fontSize: 14 }]}>
              I understand and agree to the processing of my voice data.
            </Text>
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={handleDecline}
              disabled={isConsentPending}
              accessibilityLabel="Not now"
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalAcceptBtn, { backgroundColor: colors.primary, opacity: consentAcknowledged ? 1 : 0.5 }]}
              onPress={() => void handleAccept()}
              disabled={!consentAcknowledged || isConsentPending}
              accessibilityLabel="Accept consent"
            >
              {isConsentPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Accept & Continue</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    marginBottom: 12,
  },
  modalText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    alignItems: 'center',
  },
  modalCancelBtn: {
    padding: 12,
  },
  modalAcceptBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  }
});