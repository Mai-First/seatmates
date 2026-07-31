import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Empty, Loading } from '../components/ui';
import { supabase } from '../lib/supabase';
import { colors, space, type } from '../lib/theme';
import type { ArchivedConversation } from '../lib/types';

/** Past semesters' class chats — readable forever, read-only (not deleted). */
export default function ArchivedChats() {
  const archived = useQuery({
    queryKey: ['archived-conversations'],
    queryFn: async (): Promise<ArchivedConversation[]> => {
      const { data, error } = await supabase.rpc('get_archived_conversations');
      if (error) throw error;
      return data;
    },
  });

  if (archived.isLoading) return <Loading />;

  const rows = archived.data ?? [];
  if (rows.length === 0) {
    return (
      <Empty
        icon="📦"
        title="Nothing archived"
        body="When a semester ends, archive it from the Account tab — class chats move here instead of disappearing."
      />
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={rows}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={styles.row}>
          <View style={styles.icon}>
            <Text style={{ fontSize: 20 }}>📦</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.body}>{item.title}</Text>
            {item.subtitle ? <Text style={type.sub}>{item.subtitle}</Text> : null}
          </View>
          <Text style={type.tiny}>read-only</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
