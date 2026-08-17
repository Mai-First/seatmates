import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Badge, Empty, Avatar, Loading } from '../../components/ui';
import { notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { subjectIcon } from '../../lib/subjectIcon';
import { relativeShort } from '../../lib/time';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import type { ConversationSummary, PendingFriendRequest } from '../../lib/types';

export default function Chats() {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: async (): Promise<ConversationSummary[]> => {
      const { data, error } = await supabase.rpc('get_conversations');
      if (error) throw error;
      return data;
    },
  });

  const requests = useQuery({
    queryKey: ['pending-requests'],
    queryFn: async (): Promise<PendingFriendRequest[]> => {
      const { data, error } = await supabase.rpc('get_pending_friend_requests');
      if (error) throw error;
      return data;
    },
  });

  // Optimistic: flip the row in the shared ['conversations'] cache the
  // instant you swipe, instead of waiting on a round trip. That cache entry
  // is what both this list AND the tab bar's unread badge read from, so
  // both update in the same tick. Roll back on error, reconcile on settle.
  const setUnreadFlag = (conversationId: string, unread: boolean) => {
    const previous = queryClient.getQueryData<ConversationSummary[]>(['conversations']);
    queryClient.setQueryData<ConversationSummary[]>(['conversations'], (old) =>
      old?.map((c) => (c.id === conversationId ? { ...c, unread } : c)),
    );
    return previous;
  };

  const markUnread = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('mark_conversation_unread', {
        p_conversation: conversationId,
      });
      if (error) throw error;
    },
    onMutate: async (conversationId: string) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      return { previous: setUnreadFlag(conversationId, true) };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['conversations'], ctx.previous);
      notify('could not update', e.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const markRead = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('mark_conversation_read', {
        p_conversation: conversationId,
      });
      if (error) throw error;
    },
    onMutate: async (conversationId: string) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      return { previous: setUnreadFlag(conversationId, false) };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['conversations'], ctx.previous);
      notify('could not update', e.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
    }, [queryClient]),
  );

  const requestCount = requests.data?.length ?? 0;
  // Instagram-requests-tab vibes: a persistent entry point, badge only when
  // there's something waiting.
  const requestsRow = (
    <Pressable
      onPress={() => router.push('/friend-requests')}
      style={[styles.requestsRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="person-add-outline" size={22} color={colors.primary} />
      </View>
      <Text style={[type.body, { flex: 1 }]}>friend requests</Text>
      {requestCount > 0 ? (
        <View>
          <Badge text={String(requestCount)} />
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
    </Pressable>
  );

  // Reads as a list row like the Account tab, not a link floating mid-screen.
  const archivedLink = (
    <Pressable
      onPress={() => router.push('/chats-archived')}
      style={[styles.archivedRow, { borderTopColor: colors.border }]}>
      <Ionicons name="archive-outline" size={20} color={colors.subtle} />
      <Text style={[type.sub, { flex: 1 }]}>archived chats</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
    </Pressable>
  );

  if (conversations.isLoading) return <Loading />;

  // Pinned chats (any kind) float to the very top; below that, sections
  // pinned on top of DMs, DMs by recency (PLAN D8).
  const rows = [...(conversations.data ?? [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'section' ? -1 : 1;
    return a.kind === 'section'
      ? a.title.localeCompare(b.title)
      : +new Date(b.last_at) - +new Date(a.last_at);
  });

  if (rows.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {requestsRow}
        <Empty
          icon="chatbubbles-outline"
          title="no chats yet"
          body="add classes to join their group chats, or match with a classmate to start a dm."
        />
        {archivedLink}
      </View>
    );
  }

  const firstPinned = rows.findIndex((r) => r.pinned);
  const firstUnpinnedSection = rows.findIndex((r) => !r.pinned && r.kind === 'section');
  const firstUnpinnedDm = rows.findIndex((r) => !r.pinned && r.kind === 'dm');

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={rows}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={requestsRow}
      ListFooterComponent={archivedLink}
      renderItem={({ item, index }) => (
        <>
          {index === firstPinned && <SectionHeader label="pinned" />}
          {index === firstUnpinnedSection && <SectionHeader label="class group chats" />}
          {index === firstUnpinnedDm && <SectionHeader label="direct messages" />}
          <ChatRow
            item={item}
            onToggleRead={() =>
              item.unread ? markRead.mutate(item.id) : markUnread.mutate(item.id)
            }
          />
        </>
      )}
    />
  );
}

/** Swipe right to toggle read state — reads "mark as read" on an unread
 * chat, "mark unread" on a read one. Left as its own component so each row's
 * Swipeable ref (used to snap it shut after the action) stays local. */
function ChatRow({
  item,
  onToggleRead,
}: {
  item: ConversationSummary;
  onToggleRead: () => void;
}) {
  const { colors, type } = useTheme();
  const swipeRef = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      renderLeftActions={() => (
        <Pressable
          onPress={() => {
            onToggleRead();
            swipeRef.current?.close();
          }}
          style={[styles.unreadAction, { backgroundColor: colors.primary }]}>
          <Ionicons
            name={item.unread ? 'mail-open-outline' : 'mail-unread-outline'}
            size={22}
            color={colors.onFill}
          />
          <Text style={[styles.unreadActionText, { color: colors.onFill }]}>
            {item.unread ? 'mark as read' : 'mark unread'}
          </Text>
        </Pressable>
      )}>
      <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={[styles.row, { backgroundColor: colors.bg }]}>
        {item.kind === 'dm' ? (
          <Avatar uri={item.photo_url} name={item.title} deleted={item.deleted} size={48} />
        ) : (
          <View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons
              name={(item.icon_name ?? subjectIcon(item.title)) as never}
              size={22}
              color={colors.primary}
            />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Text
              style={[type.body, item.unread && { fontFamily: fontFamily.bold }]}
              numberOfLines={1}>
              {item.title}
            </Text>
            {item.pinned && <Ionicons name="pin" size={13} color={colors.subtle} />}
            {item.muted && <Ionicons name="notifications-off-outline" size={14} color={colors.subtle} />}
          </View>
          <View style={styles.previewRow}>
            {item.last_body === 'this message was deleted' && (
              <Ionicons name="trash-outline" size={13} color={colors.subtle} />
            )}
            <Text
              style={[
                type.sub,
                { flexShrink: 1 },
                item.unread && { color: colors.text, fontFamily: fontFamily.medium },
              ]}
              numberOfLines={1}>
              {item.last_body ?? item.subtitle ?? 'say something first'}
            </Text>
          </View>
        </View>
        <View style={styles.trailing}>
          {/* type.fine, not type.tiny — tiny is uppercase-transformed, which
              turns "2m" into "2M" and reads as months, not minutes. */}
          <Text style={[type.fine, item.unread && { color: colors.primary, fontFamily: fontFamily.bold }]}>
            {relativeShort(item.last_at)}
          </Text>
          {item.unread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
        </View>
      </Pressable>
    </Swipeable>
  );
}

function SectionHeader({ label }: { label: string }) {
  const { type } = useTheme();
  return <Text style={[type.tiny, styles.header]}>{label}</Text>;
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  header: {
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: { alignItems: 'flex-end', gap: 6 },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
  unreadAction: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.sm,
    marginVertical: 4,
    marginLeft: space.lg,
  },
  unreadActionText: { fontSize: 11, fontFamily: fontFamily.semibold },
  requestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    marginTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
