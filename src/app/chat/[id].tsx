import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import type { Member, Message } from '../../lib/types';
import { confirm, notify } from '../../lib/dialogs';

// Static for now; swap for an Edge Function + Claude if Phase 4 lands early (PLAN A5).
const ICEBREAKERS = [
  'Rate the lecture pace so far: gentle jog or full sprint?',
  'What are you calling this class in your notes app? Be honest.',
  'Study spot of choice: Butler, Milstein, or somewhere secret?',
  'What made you take this class?',
  'PSet buddy? I bring snacks.',
];

export default function ChatThread() {
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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
        .select('*, sender:profiles(id, full_name, photo_url)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });

  // Live updates: new sends land at the top (inverted list); '*' also picks
  // up delete-for-everyone, which is an UPDATE (soft delete), not an INSERT.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', id] });
          supabase.rpc('mark_conversation_read', { p_conversation: id });
        },
      )
      .subscribe();
    supabase.rpc('mark_conversation_read', { p_conversation: id });
    return () => {
      supabase.removeChannel(channel);
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
    onError: (e) => notify('Not sent', e.message),
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
      notify('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const pickFromCamera = async () => {
    setAttachOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify('Camera access needed', 'Enable it in Settings to take a photo.');
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
      'Delete for everyone?',
      'This removes the message for everyone in the chat. It can’t be undone.',
      'Delete',
      true,
    );
    if (!ok) return;
    const { error } = await supabase.rpc('delete_message_for_everyone', { p_message_id: messageId });
    if (error) {
      notify('Could not delete', error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['messages', id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const leave = async () => {
    const ok = await confirm(
      'Leave this group chat?',
      'You stay enrolled in the class and keep your DMs. Re-adding the class won’t re-add the chat.',
      'Leave',
      true,
    );
    if (!ok) return;
    await supabase.rpc('leave_conversation', { p_conversation: id });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    router.back();
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

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: info.data?.title ?? 'Chat',
          headerRight: () =>
            info.data ? (
              <View style={{ flexDirection: 'row', gap: 18 }}>
                {isSection && !readOnly && (
                  <Pressable onPress={() => setMembersOpen(true)} hitSlop={8}>
                    <Ionicons name="people-outline" size={24} color={colors.primary} />
                  </Pressable>
                )}
                {isSection && !readOnly && (
                  <Pressable onPress={leave} hitSlop={8}>
                    <Ionicons name="exit-outline" size={24} color={colors.danger} />
                  </Pressable>
                )}
                <Pressable onPress={() => router.push(`/chat-options/${id}`)} hitSlop={8}>
                  <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
                </Pressable>
              </View>
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
                Starting is the hard part. Steal one:
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
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            mine={item.sender_id === session?.user.id}
            showSender={isSection}
            onDelete={deleteMessage}
          />
        )}
      />

      {readOnly ? (
        <View style={[styles.readOnlyBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons
            name={info.data?.blocked ? 'ban-outline' : 'archive-outline'}
            size={16}
            color={colors.subtle}
          />
          <Text style={type.sub}>
            {info.data?.blocked ? 'This person is blocked' : 'Archived, read-only'}
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
            placeholder="Message…"
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

      <MembersModal open={membersOpen} onClose={() => setMembersOpen(false)} conversationId={id!} />
      <AttachPickerModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onCamera={pickFromCamera}
        onLibrary={pickFromLibrary}
        onFile={pickFile}
      />
    </KeyboardAvoidingView>
  );
}

function MessageBubble({
  message,
  mine,
  showSender,
  onDelete,
}: {
  message: Message;
  mine: boolean;
  showSender: boolean;
  onDelete: (id: string) => void;
}) {
  const { colors } = useTheme();
  const deleted = !!message.deleted_at;
  return (
    <View style={[styles.bubbleRow, mine && { flexDirection: 'row-reverse' }]}>
      {!mine && showSender && (
        <Pressable onPress={() => router.push(`/profile/${message.sender_id}`)}>
          <Avatar uri={message.sender?.photo_url} name={message.sender?.full_name} size={32} />
        </Pressable>
      )}
      <Pressable
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
              {message.sender?.full_name ?? 'Classmate'}
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
            This message was deleted
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
              <Pressable onPress={() => Linking.openURL(message.attachment_url!)} style={styles.fileRow}>
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
                  {message.attachment_name ?? 'File'}
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
          <Text style={type.h2}>Add to message</Text>
          <Button title="Take photo" onPress={onCamera} />
          <Button title="Photo library" variant="outline" onPress={onLibrary} />
          <Button title="File" variant="outline" onPress={onFile} />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MembersModal({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}) {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ['members', conversationId],
    enabled: open,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.rpc('get_members', {
        p_conversation: conversationId,
      });
      if (error) throw error;
      return data;
    },
  });

  const request = useMutation({
    mutationFn: async (to: string) => {
      const { error } = await supabase.rpc('send_friend_request', {
        p_to: to,
        p_source: 'group_chat',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', conversationId] }),
    onError: (e) => notify('Could not send request', e.message),
  });

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.membersRoot, { backgroundColor: colors.bg }]}>
        <View style={[styles.membersHeader, { borderBottomColor: colors.border }]}>
          <Text style={type.h2}>Members</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        {/* Individually add people — deliberately no "add all" (PLAN D9). */}
        <FlatList
          data={members.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              <Pressable
                style={styles.memberInfo}
                onPress={() => {
                  onClose();
                  router.push(`/profile/${item.id}`);
                }}>
                <Avatar uri={item.photo_url} name={item.full_name} size={44} />
                <View>
                  <Text style={type.body}>{item.full_name ?? 'Classmate'}</Text>
                  {item.major ? <Text style={type.sub}>{item.major}</Text> : null}
                </View>
              </Pressable>
              {item.relationship === 'none' && (
                <Button small title="Add friend" onPress={() => request.mutate(item.id)} />
              )}
              {item.relationship === 'out_pending' && (
                <Button small title="Requested" variant="outline" disabled onPress={() => {}} />
              )}
              {item.relationship === 'in_pending' && (
                <Button
                  small
                  title="Respond"
                  variant="outline"
                  onPress={() => {
                    onClose();
                    router.push('/inbox');
                  }}
                />
              )}
              {item.relationship === 'friends' && (
                <Text style={{ color: colors.success, fontWeight: '600' }}>Friends</Text>
              )}
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

// Structural only — colour comes from useTheme() at the usage site.
const styles = StyleSheet.create({
  root: { flex: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
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
  membersRoot: { flex: 1 },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
    borderBottomWidth: 1,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
});
