import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AtSign, X } from 'lucide-react-native';
import { Founder, getSearchProfilesQueryKey, useSearchProfiles } from '@workspace/api-client-react';
import { useColors } from '../hooks/useColors';

export function MentionPicker({
  selected,
  onChange,
}: {
  selected: Founder[];
  onChange: (founders: Founder[]) => void;
}) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const { data = [], isFetching } = useSearchProfiles(
    { q: trimmed || ' ' },
    { query: { enabled: trimmed.length > 0, queryKey: getSearchProfilesQueryKey({ q: trimmed || ' ' }) } },
  );
  const results = data.filter((founder) => !selected.some((item) => item.id === founder.id));

  return (
    <View style={styles.wrapper}>
      <View style={[styles.strip, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <AtSign color={colors.mutedForeground} size={16} />
        {selected.map((founder) => (
          <TouchableOpacity
            key={founder.id}
            style={[styles.chip, { backgroundColor: `${colors.primary}18` }]}
            onPress={() => onChange(selected.filter((item) => item.id !== founder.id))}
            accessibilityLabel={`Remove @${founder.handle}`}
          >
            <Text numberOfLines={1} style={[styles.chipText, { color: colors.primary }]}>@{founder.handle}</Text>
            <X color={colors.primary} size={12} />
          </TouchableOpacity>
        ))}
        {selected.length < 5 && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={selected.length ? 'Add another' : 'Tag anyone?'}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search people to tag"
          />
        )}
        {isFetching && <ActivityIndicator size="small" color={colors.mutedForeground} />}
      </View>
      {!!trimmed && (
        <View style={[styles.results, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {results.length ? results.slice(0, 4).map((founder) => (
            <TouchableOpacity
              key={founder.id}
              style={styles.result}
              onPress={() => {
                onChange([...selected, founder]);
                setQuery('');
              }}
            >
              <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{founder.name}</Text>
              <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{founder.handle}</Text>
            </TouchableOpacity>
          )) : !isFetching && (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>No matching people</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', zIndex: 5 },
  strip: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  chip: { maxWidth: 126, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, flexShrink: 1 },
  input: { minWidth: 90, flex: 1, height: 40, fontFamily: 'Inter_400Regular', fontSize: 14, padding: 0 },
  results: { position: 'absolute', top: 45, left: 0, right: 0, borderWidth: 1, borderRadius: 12, padding: 4, zIndex: 20 },
  result: { minHeight: 38, borderRadius: 9, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 },
  handle: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  empty: { paddingHorizontal: 10, paddingVertical: 9, fontFamily: 'Inter_400Regular', fontSize: 13 },
});