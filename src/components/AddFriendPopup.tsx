// A plain absolutely-positioned overlay, deliberately NOT React Native's
// <Modal> — DialogHost already learned the hard way that nesting a real
// Modal inside certain screens (or timing it against another Modal's own
// fade transition) breaks touch routing / causes visible flicker. An
// in-tree overlay sidesteps both failure modes entirely.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { radius, space, useTheme } from '../lib/theme';
import { Button, Field } from './ui';

export default function AddFriendPopup({
  personId,
  personName,
  source,
  onClose,
  onSent,
}: {
  personId: string;
  personName?: string | null;
  source: 'group_chat' | 'profile';
  onClose: () => void;
  onSent?: () => void;
}) {
  const { colors, type } = useTheme();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (withNote: boolean) => {
    setSending(true);
    const { error } = await supabase.rpc('send_friend_request', {
      p_to: personId,
      p_source: source,
      p_note: withNote && note.trim() ? note.trim() : null,
    });
    setSending(false);
    if (error) {
      onClose();
      notify('could not send', error.message);
      return;
    }
    onSent?.();
    onClose();
    notify('sent', withNote && note.trim() ? 'they’ll see your note when they open it.' : 'request sent.');
  };

  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.bg }]}>
        <Text style={type.h2}>add {personName ?? 'this person'}?</Text>
        <Text style={[type.sub, { marginTop: space.xs }]}>
          a note starts the conversation — totally optional.
        </Text>
        <Field
          placeholder="e.g. we’re both in the makefile lab..."
          value={note}
          onChangeText={setNote}
          multiline
          editable={!sending}
          style={{ minHeight: 80, textAlignVertical: 'top', marginTop: space.md }}
        />
        <View style={styles.row}>
          <Pressable onPress={onClose} disabled={sending} hitSlop={8}>
            <Text style={{ color: colors.subtle }}>cancel</Text>
          </Pressable>
          <Button title="just add" variant="outline" small onPress={() => send(false)} loading={sending} />
          <Button
            title="send with note"
            small
            onPress={() => send(true)}
            loading={sending}
            disabled={!note.trim()}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    zIndex: 1000,
  },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: space.lg },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
  },
});
