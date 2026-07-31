import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Empty, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, space, type } from '../../lib/theme';
import type { ConversationSummary } from '../../lib/types';

export default function Chats() {
  const queryClient = useQueryClient();
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: async (): Promise<ConversationSummary[]> => {
      const { data, error } = await supabase.rpc('get_conversations');
      if (error) throw error;
      return data;
    },
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }, [queryClient]),
  );

  if (conversations.isLoading) return <Loading />;

  // Section chats pinned on top, DMs below by recency (PLAN D8).
  const rows = [...(conversations.data ?? [])].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'section' ? -1 : 1;
    return a.kind === 'section'
      ? a.title.localeCompare(b.title)
      : +new Date(b.last_at) - +new Date(a.last_at);
  });

  if (rows.length === 0) {
    return (
      <Empty
        icon="💬"
        title="No chats yet"
        body="Add classes to join their group chats, or match with a classmate to start a DM."
      />
    );
  }

  const firstDm = rows.findIndex((r) => r.kind === 'dm');

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={rows}
      keyExtractor={(c) => c.id}
      renderItem={({ item, index }) => (
        <>
          {index === 0 && item.kind === 'section' && <SectionHeader label="Class group chats" />}
          {index === firstDm && <SectionHeader label="Direct messages" />}
          <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={styles.row}>
            {item.kind === 'dm' ? (
              <Avatar uri={item.photo_url} name={item.title} size={48} />
            ) : (
              <View style={styles.sectionIcon}>
                <Text style={{ fontSize: 20 }}>🏫</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, item.unread && styles.unreadText]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[type.sub, item.unread && styles.unreadText]} numberOfLines={1}>
                {item.last_body ?? item.subtitle ?? 'Say something first'}
              </Text>
            </View>
            {item.unread && <View style={styles.unreadDot} />}
          </Pressable>
        </>
      )}
    />
  );
}

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.header}>{label}</Text>;
}

const styles = StyleSheet.create({
  header: {
    ...type.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
  sectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { fontWeight: '700', color: colors.text },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
