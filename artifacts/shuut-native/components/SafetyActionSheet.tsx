import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { MoreHorizontal, X } from 'lucide-react-native';
import { useColors } from '../hooks/useColors';
import { useQueryClient } from '@tanstack/react-query';
import { ReportInputReason, ReportInputTargetType, useBlockAccount, useCreateReport } from '@workspace/api-client-react';

const reasons = Object.values(ReportInputReason);
const labels: Record<string, string> = {
  spam: 'Spam', harassment: 'Harassment', hate: 'Hate speech', sexual_content: 'Sexual content',
  violence: 'Violence', impersonation: 'Impersonation', other: 'Other',
};

export function SafetyActionSheet({ targetType, targetId, authorHandle, self = false, onBlocked, compact = false }: {
  targetType: ReportInputTargetType;
  targetId: number;
  authorHandle: string;
  self?: boolean;
  onBlocked?: () => void;
  compact?: boolean;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const report = useCreateReport();
  const block = useBlockAccount();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'actions' | 'report'>('actions');
  const [reason, setReason] = useState<ReportInputReason | null>(null);
  const [details, setDetails] = useState('');

  if (self) return null;
  const close = () => { setVisible(false); setMode('actions'); setReason(null); setDetails(''); };
  const submitReport = async () => {
    if (!reason || report.isPending) return;
    try {
      await report.mutateAsync({ data: { targetType, targetId, reason, details: details.trim() || undefined } });
      close();
      Alert.alert('Report submitted', 'Thanks for helping keep SHÜÜT safe.');
    } catch { Alert.alert('Report failed', 'Please try again.'); }
  };
  const confirmBlock = () => Alert.alert('Block account?', `You will no longer see @${authorHandle}'s profile or posts.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Block', style: 'destructive', onPress: async () => {
      try {
        await block.mutateAsync({ handle: authorHandle });
        await queryClient.invalidateQueries();
        close();
        Alert.alert('Account blocked', `@${authorHandle} has been blocked.`);
        onBlocked?.();
      } catch { Alert.alert('Block failed', 'Please try again.'); }
    }},
  ]);
  return <>
    <TouchableOpacity
      style={compact ? styles.compactTrigger : styles.trigger}
      onPress={(event) => { event.stopPropagation(); setVisible(true); }}
      accessibilityRole="button" accessibilityLabel="More safety actions" hitSlop={8}
    ><MoreHorizontal color={colors.mutedForeground} size={20} /></TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heading}><Text style={[styles.title, { color: colors.foreground }]}>{mode === 'report' ? 'Report' : 'Safety actions'}</Text><TouchableOpacity onPress={close} accessibilityLabel="Close"><X color={colors.foreground} size={22} /></TouchableOpacity></View>
          {mode === 'actions' ? <>
            <TouchableOpacity style={styles.option} onPress={() => setMode('report')} accessibilityLabel="Report"><Text style={[styles.optionText, { color: colors.foreground }]}>Report</Text></TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={confirmBlock} accessibilityLabel={`Block @${authorHandle}`}><Text style={[styles.optionText, { color: colors.destructive }]}>Block @{authorHandle}</Text></TouchableOpacity>
          </> : <>
            <Text style={[styles.prompt, { color: colors.mutedForeground }]}>Why are you reporting this?</Text>
            {reasons.map(value => <TouchableOpacity key={value} style={[styles.reason, reason === value && { borderColor: colors.primary, backgroundColor: `${colors.primary}18` }]} onPress={() => setReason(value)} accessibilityRole="radio" accessibilityState={{ selected: reason === value }}><Text style={[styles.reasonText, { color: colors.foreground }]}>{labels[value]}</Text></TouchableOpacity>)}
            <TextInput value={details} onChangeText={setDetails} maxLength={1000} multiline placeholder="Additional details (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]} accessibilityLabel="Report details" />
            <TouchableOpacity style={[styles.submit, { backgroundColor: colors.primary, opacity: reason ? 1 : .5 }]} disabled={!reason || report.isPending} onPress={submitReport} accessibilityLabel="Submit report">{report.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Submit report</Text>}</TouchableOpacity>
          </>}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { padding: 8, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  compactTrigger: { padding: 6, minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, paddingBottom: 36 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  option: { paddingVertical: 16, minHeight: 52 },
  optionText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  prompt: { fontFamily: 'Inter_400Regular', marginBottom: 10 },
  reason: { borderWidth: 1, borderColor: 'transparent', borderRadius: 10, padding: 10, marginBottom: 4 },
  reasonText: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  input: { minHeight: 72, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10, textAlignVertical: 'top' },
  submit: { marginTop: 14, borderRadius: 22, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});