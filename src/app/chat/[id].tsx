import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar, Button, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import { dayLabel } from '../../lib/time';
import type { ConversationSummary, Message } from '../../lib/types';
import { confirm, notify } from '../../lib/dialogs';

// Static for now; swap for an Edge Function + Claude if Phase 4 lands early (PLAN A5).
const ICEBREAKERS = [
  'rate the lecture pace so far: gentle jog or full sprint?',
  'what are you calling this class in your notes app? be honest.',
  'study spot of choice: butler, milstein, or somewhere secret?',
  'what made you take this class?',
  'pset buddy? I bring snacks.',
];

type LikeRow = {
  message_id: string;
  profile_id: string;
  profile: { full_name: string | null; photo_url: string | null } | null;
};

export default function ChatThread() {
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [likersFor, setLikersFor] = useState<string | null>(null);

  const info = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_conversation_info', { p_id: id });
      if (error) throw error;
      return data?.[0] as
        | {
            id: string;
            kind: 'section' | 'dm';
            title: string;
            subtitle: string | null;
            member: boolean;
            can_post: boolean;
            blocked: boolean;
            muted: boolean;
          }
        | undefined;
    },
  });

  const messages = useQuery({
    queryKey: ['messages', id],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        // message_likes' FKs to both messages and profiles make PostgREST
        // infer an implicit many-to-many relationship between them, so a
        // bare `profiles(...)` embed here is now ambiguous — pin the exact
        // foreign key to use instead.
        .select('*, sender:profiles!messages_sender_id_fkey(id, full_name, photo_url)')
        .eq('conversation_id', id)
        // id as a tiebreaker: two messages can share a created_at down to
        // the same millisecond, and without a deterministic secondary sort
        // Postgres can return them in a different order on every refetch —
        // which made the day/gap dividers appear to jump around.
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });

  // Kept as its own query, deliberately not embedded in the messages
  // select above — a hiccup in this newer table should never be able to
  // blank out the core message list. message_likes has exactly one FK to
  // profiles, so this embed (unlike the sender one above) is unambiguous.
  const likes = useQuery({
    queryKey: ['message-likes', id],
    queryFn: async (): Promise<LikeRow[]> => {
      const { data, error } = await supabase
        .from('message_likes')
        .select('message_id, profile_id, profile:profiles(full_name, photo_url)')
        .eq('conversation_id', id);
      if (error) throw error;
      // supabase-js infers this many-to-one embed as an array without
      // generated DB types; it's a single row at runtime (profile_id is a
      // FK, not a list).
      return data as unknown as LikeRow[];
    },
  });

  const likesByMessage = useMemo(() => {
    const map = new Map<string, LikeRow[]>();
    for (const l of likes.data ?? []) {
      const arr = map.get(l.message_id) ?? [];
      arr.push(l);
      map.set(l.message_id, arr);
    }
    return map;
  }, [likes.data]);

  // Live updates: new sends land at the top (inverted list); '*' also picks
  // up delete-for-everyone, which is an UPDATE (soft delete), not an INSERT.
  useEffect(() => {
    if (!id) return;
    const markRead = () => {
      // Flip the cached row instantly — the tab badge and Chats-list dot
      // read from this same ['conversations'] cache — instead of waiting
      // on the RPC round trip to notice anything changed.
      queryClient.setQueryData<ConversationSummary[]>(['conversations'], (old) =>
        old?.map((c) => (c.id === id ? { ...c, unread: false } : c)),
      );
      supabase.rpc('mark_conversation_read', { p_conversation: id }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      });
    };
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', id] });
          markRead();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_likes',
          filter: `conversation_id=eq.${id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['message-likes', id] }),
      )
      .subscribe();
    markRead();
    return () => {
      supabase.removeChannel(channel);
      // Belt and suspenders: the Chats list's own focus-effect invalidation
      // should already catch this, but leaving the screen is the one moment
      // we know for sure the unread state just changed underneath it.
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
  }, [id, queryClient]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: id, sender_id: session!.user.id, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => notify('not sent', e.message),
  });

  // Optimistic: flip the like in the cached ['message-likes', id] list the
  // instant you double-tap, instead of waiting on the round trip — the
  // realtime message_likes subscription reconciles it (and syncs the other
  // participant) shortly after.
  const toggleLike = useMutation({
    mutationFn: async ({ messageId, liked }: { messageId: string; liked: boolean }) => {
      if (liked) {
        const { error } = await supabase
          .from('message_likes')
          .delete()
          .eq('message_id', messageId)
          .eq('profile_id', session!.user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('message_likes')
          .insert({ message_id: messageId, conversation_id: id, profile_id: session!.user.id });
        if (error) throw error;
      }
    },
    onMutate: async ({ messageId, liked }) => {
      await queryClient.cancelQueries({ queryKey: ['message-likes', id] });
      const previous = queryClient.getQueryData<LikeRow[]>(['message-likes', id]);
      queryClient.setQueryData<LikeRow[]>(['message-likes', id], (old) => {
        const list = old ?? [];
        return liked
          ? list.filter((l) => !(l.message_id === messageId && l.profile_id === session!.user.id))
          : [...list, { message_id: messageId, profile_id: session!.user.id, profile: null }];
      });
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['message-likes', id], ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['message-likes', id] }),
  });

  const uploadAttachment = async (kind: 'image' | 'file', uri: string, name: string, contentType: string) => {
    setUploading(true);
    try {
      const bytes = await (await fetch(uri)).arrayBuffer();
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`;
      const { error: upErr } = await supabase.storage
        .from('chat-media')
        .upload(path, bytes, { contentType });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
      const { error } = await supabase.from('messages').insert({
        conversation_id: id,
        sender_id: session!.user.id,
        body: draft.trim() || null,
        attachment_url: data.publicUrl,
        attachment_type: kind,
        attachment_name: kind === 'file' ? name : null,
      });
      if (error) throw error;
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e: unknown) {
      notify('could not send', e instanceof Error ? e.message : 'try again.');
    } finally {
      setUploading(false);
    }
  };

  const pickFromCamera = async () => {
    setAttachOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify('camera access needed', 'enable it in settings to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    await uploadAttachment('image', asset.uri, 'photo.jpg', asset.mimeType ?? 'image/jpeg');
  };

  const pickFromLibrary = async () => {
    setAttachOpen(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    await uploadAttachment('image', asset.uri, 'photo.jpg', asset.mimeType ?? 'image/jpeg');
  };

  const pickFile = async () => {
    setAttachOpen(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    await uploadAttachment('file', asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
  };

  const deleteMessage = async (messageId: string) => {
    const ok = await confirm(
      'delete for everyone?',
      'This removes the message for everyone in the chat. It can’t be undone.',
      'delete',
      true,
    );
    if (!ok) return;
    const { error } = await supabase.rpc('delete_message_for_everyone', { p_message_id: messageId });
    if (error) {
      notify('could not delete', error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['messages', id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const isSection = info.data?.kind === 'section';
  const readOnly = info.data ? !info.data.can_post : false;
  const showIcebreakers =
    info.data?.kind === 'dm' &&
    !info.data?.blocked &&
    (messages.data?.length ?? 0) === 0 &&
    !messages.isLoading;

  const rows = useMemo(() => messages.data ?? [], [messages.data]);

  if (info.isLoading) return <Loading />;

  if (messages.isError) {
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.lg },
        ]}>
        <Text style={[type.sub, { textAlign: 'center', color: colors.danger }]}>
          could not load messages: {(messages.error as Error)?.message ?? 'unknown error'}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: info.data?.title ?? 'chat',
          headerRight: () =>
            info.data ? (
              <Pressable onPress={() => router.push(`/chat-options/${id}`)} hitSlop={8}>
                <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
              </Pressable>
            ) : undefined,
        }}
      />

      <FlatList
        inverted
        data={rows}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.md, gap: 6 }}
        ListEmptyComponent={
          showIcebreakers ? (
            <View style={styles.icebreakers}>
              {/* Inverted list flips children; flip back. */}
              <Text style={[type.sub, { textAlign: 'center' }]}>
                starting is the hard part. steal one:
              </Text>
              {ICEBREAKERS.map((line) => (
                <Pressable
                  key={line}
                  onPress={() => setDraft(line)}
                  style={[styles.icebreaker, { borderColor: colors.accent }]}>
                  <Text style={[type.accent, { color: colors.primary, fontSize: 15 }]}>{line}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const older = rows[index + 1];
          const crossedDay = !older || dayLabel(item.created_at) !== dayLabel(older.created_at);
          const gapMs = older
            ? new Date(item.created_at).getTime() - new Date(older.created_at).getTime()
            : Infinity;
          const timeLabel = new Date(item.created_at)
            .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
            .toLowerCase();
          // Day boundary: "today · 2:45 pm". Same day but over an hour since
          // the last message: just "2:45 pm" — same idea as Instagram.
          const dividerLabel = crossedDay
            ? `${dayLabel(item.created_at)} · ${timeLabel}`
            : gapMs > 60 * 60 * 1000
              ? timeLabel
              : null;
          return (
            // Inverted list: a cell's own JSX order renders bottom-to-top on
            // screen, not top-to-bottom — the bubble has to come first here
            // for the divider to actually land above it.
            <>
              <MessageBubble
                message={item}
                mine={item.sender_id === session?.user.id}
                showSender={isSection}
                onDelete={deleteMessage}
                myId={session?.user.id}
                likes={likesByMessage.get(item.id) ?? []}
                onToggleLike={(liked) => toggleLike.mutate({ messageId: item.id, liked })}
                onShowLikers={() => setLikersFor(item.id)}
              />
              {dividerLabel && <DateDivider label={dividerLabel} />}
            </>
          );
        }}
      />

      {readOnly ? (
        <View style={[styles.readOnlyBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons
            name={info.data?.blocked ? 'ban-outline' : 'archive-outline'}
            size={16}
            color={colors.subtle}
          />
          <Text style={type.sub}>
            {info.data?.blocked ? 'this person is blocked' : 'archived, read-only'}
          </Text>
        </View>
      ) : (
        <View style={[styles.composer, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => setAttachOpen(true)}
            disabled={uploading}
            hitSlop={8}
            style={{ opacity: uploading ? 0.4 : 1 }}>
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
          </Pressable>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            placeholder="message…"
            placeholderTextColor={colors.subtle}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            onPress={() => draft.trim() && send.mutate(draft.trim())}
            disabled={!draft.trim() || send.isPending}
            style={[
              styles.sendBtn,
              { backgroundColor: colors.primary, opacity: draft.trim() ? 1 : 0.4 },
            ]}>
            <Ionicons name="arrow-up" size={22} color={colors.onFill} />
          </Pressable>
        </View>
      )}

      <AttachPickerModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onCamera={pickFromCamera}
        onLibrary={pickFromLibrary}
        onFile={pickFile}
      />

      <LikersModal
        likers={likersFor ? (likesByMessage.get(likersFor) ?? []) : []}
        onClose={() => setLikersFor(null)}
      />
    </KeyboardAvoidingView>
  );
}

function DateDivider({ label }: { label: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.dateDivider}>
      {/* type.fine, not type.tiny — tiny is uppercase-transformed, which
          would shout the divider text and fight the app's lowercase style. */}
      <Text style={[type.fine, { color: colors.subtle }]}>{label}</Text>
    </View>
  );
}

function MessageBubble({
  message,
  mine,
  showSender,
  onDelete,
  onToggleLike,
  onShowLikers,
  myId,
  likes,
}: {
  message: Message;
  mine: boolean;
  showSender: boolean;
  onDelete: (id: string) => void;
  onToggleLike: (liked: boolean) => void;
  onShowLikers: () => void;
  myId: string | undefined;
  likes: LikeRow[];
}) {
  const { colors, type } = useTheme();
  const deleted = !!message.deleted_at;
  const likedByMe = !!myId && likes.some((l) => l.profile_id === myId);
  const likeCount = likes.length;

  const [showTime, setShowTime] = useState(false);
  const lastTapRef = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    [],
  );

  // Single tap reveals this message's exact time, tap again to hide it.
  // Double tap (Instagram-style) toggles a heart instead — never on your
  // own message. The single tap is held for a beat so a fast second tap
  // can still cancel it and register as the double tap.
  const handleTap = () => {
    if (deleted) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (tapTimer.current) {
        clearTimeout(tapTimer.current);
        tapTimer.current = null;
      }
      lastTapRef.current = 0;
      if (!mine) onToggleLike(likedByMe);
    } else {
      lastTapRef.current = now;
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        setShowTime((v) => !v);
      }, 300);
    }
  };

  return (
    <View>
      <View style={[styles.bubbleRow, mine && { flexDirection: 'row-reverse' }]}>
        {!mine && showSender && (
          <Pressable onPress={() => router.push(`/profile/${message.sender_id}`)}>
            <Avatar uri={message.sender?.photo_url} name={message.sender?.full_name} size={32} />
          </Pressable>
        )}
        <View style={styles.bubbleStack}>
          <Pressable
            onPress={handleTap}
            onLongPress={() => mine && !deleted && onDelete(message.id)}
            style={[
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleTheirs,
              { backgroundColor: mine ? colors.primary : colors.surface },
            ]}>
            {!mine && showSender && (
              // Tap a name to open the profile → add friend from there (PLAN D9).
              <Pressable onPress={() => router.push(`/profile/${message.sender_id}`)}>
                <Text style={[styles.senderName, { color: colors.primary }]}>
                  {message.sender?.full_name ?? 'classmate'}
                </Text>
              </Pressable>
            )}
            {deleted ? (
              <Text
                style={{
                  color: mine ? colors.onFill : colors.subtle,
                  fontSize: 15,
                  fontStyle: 'italic',
                  fontFamily: fontFamily.ui,
                }}>
                this message was deleted
              </Text>
            ) : (
              <>
                {message.attachment_type === 'image' && message.attachment_url ? (
                  <Pressable onPress={() => Linking.openURL(message.attachment_url!)}>
                    <Image
                      source={{ uri: message.attachment_url }}
                      style={styles.attachmentImage}
                      contentFit="cover"
                    />
                  </Pressable>
                ) : null}
                {message.attachment_type === 'file' && message.attachment_url ? (
                  <Pressable
                    onPress={() => Linking.openURL(message.attachment_url!)}
                    style={styles.fileRow}>
                    <Ionicons
                      name="document-outline"
                      size={20}
                      color={mine ? colors.onFill : colors.primary}
                    />
                    <Text
                      style={{
                        color: mine ? colors.onFill : colors.primary,
                        fontFamily: fontFamily.ui,
                        fontSize: 15,
                        flex: 1,
                      }}
                      numberOfLines={1}>
                      {message.attachment_name ?? 'file'}
                    </Text>
                  </Pressable>
                ) : null}
                {message.body ? (
                  <Text
                    style={{
                      color: mine ? colors.onFill : colors.text,
                      fontSize: 16,
                      fontFamily: fontFamily.ui,
                      marginTop: message.attachment_url ? space.xs : 0,
                    }}>
                    {message.body}
                  </Text>
                ) : null}
              </>
            )}
          </Pressable>

          {likeCount > 0 && (
            <Pressable
              onPress={onShowLikers}
              style={[
                styles.heartBadge,
                mine ? { right: undefined, left: -6 } : { left: undefined, right: -6 },
                { backgroundColor: colors.bg, borderColor: colors.border },
              ]}>
              <Ionicons name="heart" size={12} color={colors.danger} />
              {likeCount > 1 && (
                <Text style={[styles.heartCount, { color: colors.subtle }]}>{likeCount}</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {(likeCount > 0 || showTime) && (
        <View
          style={[
            styles.belowBubble,
            { alignItems: mine ? 'flex-end' : 'flex-start' },
            !mine && showSender && { paddingLeft: 40 },
          ]}>
          {/* Small top margin, not the row's own gap — the heart badge
              already hangs below the bubble, so without this the badge
              sits closer to the next message than the normal inter-message
              spacing. This tops it up to roughly match. */}
          {likeCount > 0 && <View style={{ height: 4 }} />}
          {showTime && (
            <Text style={[type.fine, { color: colors.subtle }]}>
              {new Date(message.created_at)
                .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                .toLowerCase()}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function AttachPickerModal({
  open,
  onClose,
  onCamera,
  onLibrary,
  onFile,
}: {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onLibrary: () => void;
  onFile: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.attachBackdrop} onPress={onClose}>
        <Pressable style={[styles.attachCard, { backgroundColor: colors.bg }]}>
          <Text style={type.h2}>add to message</Text>
          <Button title="take photo" onPress={onCamera} />
          <Button title="photo library" variant="outline" onPress={onLibrary} />
          <Button title="file" variant="outline" onPress={onFile} />
          <Button title="cancel" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LikersModal({ likers, onClose }: { likers: LikeRow[]; onClose: () => void }) {
  const { colors, type } = useTheme();
  return (
    <Modal visible={likers.length > 0} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.attachBackdrop} onPress={onClose}>
        <Pressable style={[styles.attachCard, { backgroundColor: colors.bg }]}>
          <Text style={type.h2}>liked by</Text>
          {likers.map((l) => (
            <View key={l.profile_id} style={styles.likerRow}>
              <Avatar uri={l.profile?.photo_url} name={l.profile?.full_name} size={36} />
              <Text style={type.body}>{l.profile?.full_name ?? 'classmate'}</Text>
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Structural only — colour comes from useTheme() at the usage site.
const styles = StyleSheet.create({
  root: { flex: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  // maxWidth lives here, not on `bubble` — a percentage width only resolves
  // correctly against a parent that itself has a real size, not one sized
  // by an unconstrained child further down the tree. Kept off bubbleRow
  // itself so the avatar aligns with just the bubble, not with whatever
  // renders below it (heart badge spacer, revealed timestamp).
  bubbleStack: { position: 'relative', maxWidth: '78%' },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
  heartBadge: {
    position: 'absolute',
    bottom: -8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  heartCount: { fontSize: 10, fontFamily: fontFamily.semibold },
  belowBubble: { marginTop: 2 },
  likerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dateDivider: { alignItems: 'center', paddingVertical: space.sm },
  senderName: { fontSize: 12, fontFamily: fontFamily.bold, marginBottom: 2 },
  attachmentImage: { width: 200, height: 200, borderRadius: radius.md },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
  },
  readOnlyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
    fontFamily: fontFamily.ui,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icebreakers: { gap: space.sm, padding: space.md, transform: [{ scaleY: -1 }] },
  icebreaker: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  attachBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  attachCard: { width: '100%', maxWidth: 420, borderRadius: 20, padding: space.lg, gap: space.sm },
});
