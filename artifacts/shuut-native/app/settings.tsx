import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '../hooks/useColors';
import { useAuth } from '../hooks/useAuthStore';
import { ChevronLeft, ChevronRight, LogOut, Trash2, FileText, ShieldAlert } from 'lucide-react-native';
import { useMobileLogout, useDeleteAccount } from '@workspace/api-client-react';

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useAuth();

  const logout = useMobileLogout();
  const deleteAccount = useDeleteAccount();
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const openUrl = async (path: string) => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN || "localhost:80";
    await WebBrowser.openBrowserAsync(`https://${domain}${path}`);
  };

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch (e) {
      console.log(e); // Proceed to sign out locally anyway
    } finally {
      await signOut();
      router.replace('/(auth)/login');
    }
  };

  const performDelete = async () => {
    if (deleteConfirmation !== 'DELETE') return;
    try {
      const result = await deleteAccount.mutateAsync();
      if (result.status === 'completed') {
        await signOut();
        router.replace('/(auth)/login');
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={colors.foreground} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Account</Text>

        <View style={{ borderRadius: 16, overflow: 'hidden', marginHorizontal: 16 }}>
          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.card, borderBottomColor: colors.border }]} onPress={handleLogout}>
            <View style={styles.menuItemLeft}>
              <LogOut color={colors.foreground} size={20} />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Log out</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.card, borderBottomWidth: 0 }]} onPress={handleDeleteAccount}>
            <View style={styles.menuItemLeft}>
              <Trash2 color={colors.destructive} size={20} />
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>Delete Account</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 32 }]}>About</Text>

        <View style={{ borderRadius: 16, overflow: 'hidden', marginHorizontal: 16 }}>
          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
            onPress={() => openUrl('/terms')}
          >
            <View style={styles.menuItemLeft}>
              <FileText color={colors.foreground} size={20} />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Terms of Service</Text>
            </View>
            <ChevronRight color={colors.mutedForeground} size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.card, borderBottomWidth: 0 }]}
            onPress={() => openUrl('/privacy')}
          >
            <View style={styles.menuItemLeft}>
              <ShieldAlert color={colors.foreground} size={20} />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Privacy Policy</Text>
            </View>
            <ChevronRight color={colors.mutedForeground} size={20} />
          </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  content: { paddingVertical: 16 },
  sectionTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    paddingHorizontal: 24,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
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
