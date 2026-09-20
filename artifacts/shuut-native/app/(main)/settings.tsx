import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert, ActivityIndicator, Modal, TextInput, Switch, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '../../hooks/useColors';
import { useAuth } from '../../hooks/useAuthStore';
import { Trash2, LogOut } from 'lucide-react-native';
import { useMobileLogout, useDeleteAccount, useGetProfile, useUpdateProfile, useListBlockedAccounts, useUnblockAccount, useGetVoiceAiConsent, getGetVoiceAiConsentQueryKey, useRevokeVoiceAiConsent } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { createEditableProfileUpdate } from '../../lib/profileUpdate';

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();

  const logout = useMobileLogout();
  const deleteAccount = useDeleteAccount();
  const updateProfile = useUpdateProfile();
  const { data: blockedAccounts, isLoading: blockedLoading, refetch: refetchBlocked } = useListBlockedAccounts();
  const unblockAccount = useUnblockAccount();
  const { data: profileData, refetch: refetchProfile } = useGetProfile('me', {
    query: { queryKey: ['profile', 'me'] },
  });
  const { data: consentStatus, isLoading: isConsentLoading, refetch: refetchConsent } = useGetVoiceAiConsent();
  const revokeConsent = useRevokeVoiceAiConsent();
  const [isRevokeModalVisible, setIsRevokeModalVisible] = useState(false);
  const [revokeConfirmation, setRevokeConfirmation] = useState('');

  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [previewTranscript, setPreviewTranscript] = useState(false);

  useFocusEffect(useCallback(() => {
    void refetchConsent();
  }, [refetchConsent]));

  useEffect(() => {
    if (profileData?.founder) {
      setPreviewTranscript(profileData.founder.previewTranscript || false);
    }
  }, [profileData]);

  const openPublicPage = (slug: string) => {
    router.push({
      pathname: '/public/[slug]',
      params: { slug, returnTo: '/(main)/settings' },
    });
  };

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch (e) {
      console.log(e); // Proceed to sign out locally anyway
    } finally {
      queryClient.clear();
      await signOut();
      router.replace('/');
    }
  };

  const performDelete = async () => {
    if (deleteConfirmation !== 'DELETE') return;
    try {
      const result = await deleteAccount.mutateAsync();
      if (result.status === 'completed') {
        queryClient.clear();
        await signOut();
        router.replace('/');
      } else if (result.status === 'pending') {
        Alert.alert("Account Deletion", "Your account deletion is pending. It will be fully deleted soon.");
        setIsDeleteModalVisible(false);
      } else {
        Alert.alert("Account Deletion Failed", "We could not delete your account at this time.");
        setIsDeleteModalVisible(false);
      }
    } catch (e) {
      Alert.alert("Error", "Failed to delete account");
      setIsDeleteModalVisible(false);
    }
  };

  const handleDeleteAccount = () => {
    setIsDeleteModalVisible(true);
    setDeleteConfirmation('');
  };

  const handlePreviewTranscriptChange = async (value: boolean) => {
    if (!profileData?.founder) return;

    const previousValue = previewTranscript;
    setPreviewTranscript(value);

    try {
      await updateProfile.mutateAsync({
        handle: 'me',
        data: createEditableProfileUpdate(
          profileData.founder.name,
          profileData.founder.handle,
          profileData.founder.bio || '',
          profileData.founder.location || '',
          profileData.founder.website || '',
          value,
        ),
      });
      void refetchProfile();
    } catch {
      setPreviewTranscript(previousValue);
      Alert.alert('Setting not saved', 'Please try changing the transcript preview setting again.');
    }
  };

  const handleUnblock = (handle: string) => {
    Alert.alert('Unblock account?', `You will see @${handle}'s content again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: async () => {
        try {
          await unblockAccount.mutateAsync({ handle });
          await refetchBlocked();
          await queryClient.invalidateQueries();
        } catch { Alert.alert('Unblock failed', 'Please try again.'); }
      }},
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: Platform.OS === 'web' ? 52 : 16,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.preferenceCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.preferenceCopy}>
            <Text style={[styles.preferenceTitle, { color: colors.foreground }]}>Preview transcript before publishing</Text>
            <Text style={[styles.preferenceDesc, { color: colors.mutedForeground }]}>
              Review and edit generated text before your SHÜÜT goes live.
            </Text>
          </View>
          <Switch
            value={previewTranscript}
            onValueChange={handlePreviewTranscriptChange}
            disabled={!profileData?.founder || updateProfile.isPending}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Voice & AI Processing</Text>
              {isConsentLoading ? (
                <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
              ) : consentStatus?.revokedAt ? (
                <>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
                    You revoked Voice & AI processing consent on {new Date(consentStatus.revokedAt).toLocaleDateString()}.
                  </Text>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                    To create new recordings, you must provide consent when prompted.
                  </Text>
                </>
              ) : consentStatus?.required && (consentStatus.acceptedVersion || consentStatus.acceptedAt) ? (
                <>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
                    Voice & AI consent must be updated before you can create new recordings.
                  </Text>
                  {consentStatus.acceptedVersion && (
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                      Previously accepted version: {consentStatus.acceptedVersion}
                    </Text>
                  )}
                </>
              ) : (consentStatus?.acceptedAt && !consentStatus.required && consentStatus.canRevoke) ? (
                <>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
                    You consented to Voice & AI processing on {new Date(consentStatus.acceptedAt).toLocaleDateString()}.
                  </Text>
                  {consentStatus.acceptedVersion && (
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
                      Version: {consentStatus.acceptedVersion}
                    </Text>
                  )}
                  <TouchableOpacity onPress={() => { setIsRevokeModalVisible(true); setRevokeConfirmation(''); }} accessibilityLabel="Revoke voice consent">
                    <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', marginTop: 4 }}>Revoke consent</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                  You have not provided consent for voice processing.
                </Text>
              )}
              <TouchableOpacity onPress={() => openPublicPage('privacy')} hitSlop={8} style={{ marginTop: 12 }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Read Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[styles.blockedCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Blocked accounts</Text>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>Blocked profiles and their posts are hidden from your feeds.</Text>
          {blockedLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} /> :
            blockedAccounts?.length ? blockedAccounts.map(account => (
              <View key={account.id} style={styles.blockedRow}>
                <View style={{ flex: 1 }}><Text style={[styles.blockedName, { color: colors.foreground }]}>{account.name}</Text><Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>@{account.handle}</Text></View>
                <TouchableOpacity onPress={() => handleUnblock(account.handle)} accessibilityLabel={`Unblock @${account.handle}`} style={[styles.unblockBtn, { borderColor: colors.border }]}><Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Unblock</Text></TouchableOpacity>
              </View>
            )) : <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginTop: 12 }]}>No blocked accounts.</Text>}
        </View>

        <View style={[styles.card, { borderColor: colors.destructive + '40', backgroundColor: colors.destructive + '05' }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: colors.destructive + '1A' }]}>
              <Trash2 color={colors.destructive} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Delete account</Text>
              <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                Permanently delete your SHÜÜT account and all associated content. This action cannot be undone.
              </Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.destructiveBtn, { backgroundColor: colors.destructive }]} onPress={handleDeleteAccount}>
            <Text style={styles.primaryBtnText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.border }]} onPress={handleLogout}>
          <LogOut color={colors.foreground} size={20} />
          <Text style={[styles.logoutBtnText, { color: colors.foreground }]}>Log out</Text>
        </TouchableOpacity>

        <View style={styles.legalLinks}>
          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => openPublicPage('about')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>About</Text></TouchableOpacity>
            <Text style={[styles.separator, { color: colors.border }]}>|</Text>
            <TouchableOpacity onPress={() => openPublicPage('community')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>Community Guidelines</Text></TouchableOpacity>
            <Text style={[styles.separator, { color: colors.border }]}>|</Text>
            <TouchableOpacity onPress={() => openPublicPage('contact')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>Contact</Text></TouchableOpacity>
          </View>
          <View style={[styles.linksRow, { marginTop: 12 }]}>
            <TouchableOpacity onPress={() => openPublicPage('terms')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>Terms of Service</Text></TouchableOpacity>
            <Text style={[styles.separator, { color: colors.border }]}>|</Text>
            <TouchableOpacity onPress={() => openPublicPage('privacy')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>Privacy Policy</Text></TouchableOpacity>
            <Text style={[styles.separator, { color: colors.border }]}>|</Text>
            <TouchableOpacity onPress={() => openPublicPage('cookies')} hitSlop={8}><Text style={[styles.link, { color: colors.mutedForeground }]}>Cookie Policy</Text></TouchableOpacity>
          </View>
          <View style={styles.copyright}>
            <Text style={[styles.copyrightText, { color: colors.mutedForeground }]}>
              © {new Date().getFullYear()} SHÜÜT — A{' '}
            </Text>
            <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync('https://www.doubleportrait.com')} hitSlop={8}>
              <Text style={[styles.copyrightText, styles.companyLink, { color: colors.mutedForeground }]}>DoublePortrait Labs</Text>
            </TouchableOpacity>
            <Text style={[styles.copyrightText, { color: colors.mutedForeground }]}>
              {' '}Production. All rights reserved.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={isDeleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Delete Account</Text>
            <Text style={[styles.modalText, { color: colors.mutedForeground }]}>
              This action is permanent and cannot be undone. All your posts and profile data will be removed.
            </Text>
            <Text style={[styles.modalText, { color: colors.mutedForeground, marginTop: 12 }]}>
              Type <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>DELETE</Text> to confirm.
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.input }]}
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsDeleteModalVisible(false)} disabled={deleteAccount.isPending}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteBtn, { backgroundColor: colors.destructive, opacity: deleteConfirmation === 'DELETE' ? 1 : 0.5 }]}
                onPress={performDelete}
                disabled={deleteConfirmation !== 'DELETE' || deleteAccount.isPending}
              >
                {deleteAccount.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isRevokeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Revoke Voice Consent</Text>
            <Text style={[styles.modalText, { color: colors.mutedForeground }]}>
              Revoking consent will prevent you from making new recordings or transcriptions. Existing posts and required safety records will not be erased.
            </Text>
            <Text style={[styles.modalText, { color: colors.mutedForeground, marginTop: 12 }]}>
              Type <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>REVOKE</Text> to confirm.
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.input }]}
              value={revokeConfirmation}
              onChangeText={setRevokeConfirmation}
              autoCapitalize="none"
              testID="revoke-consent-input"
              accessibilityLabel="Type REVOKE to confirm"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsRevokeModalVisible(false)} disabled={revokeConsent.isPending}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteBtn, { backgroundColor: colors.destructive, opacity: revokeConfirmation === 'REVOKE' ? 1 : 0.5 }]}
                onPress={async () => {
                  if (revokeConfirmation !== 'REVOKE') return;
                  try {
                    await revokeConsent.mutateAsync();
                    await queryClient.invalidateQueries({ queryKey: getGetVoiceAiConsentQueryKey() });
                    setIsRevokeModalVisible(false);
                    setRevokeConfirmation('');
                  } catch (e) {
                    Alert.alert('Error', 'Could not revoke consent.');
                  }
                }}
                disabled={revokeConfirmation !== 'REVOKE' || revokeConsent.isPending}
                accessibilityLabel="Confirm revoke consent"
              >
                {revokeConsent.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Revoke</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  content: { padding: 16, gap: 16 },
  preferenceCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  preferenceCopy: {
    flex: 1,
  },
  blockedCard: { padding: 20, borderRadius: 16, borderWidth: 1 },
  blockedRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, gap: 12 },
  blockedName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  unblockBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  preferenceTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 4,
  },
  preferenceDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    marginBottom: 4,
  },
  cardDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  destructiveBtn: {
    padding: 12,
    borderRadius: 24,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    gap: 8,
  },
  logoutBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  legalLinks: {
    marginTop: 32,
    alignItems: 'center',
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  link: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  separator: {
    marginHorizontal: 12,
    fontSize: 12,
  },
  copyright: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 24,
  },
  copyrightText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  companyLink: {
    textDecorationLine: 'underline',
  },
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
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 24,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
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
  modalDeleteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  }
});
