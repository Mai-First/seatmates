import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Avatar, Button, Field } from '../../components/ui';
import { notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';

/** Adding someone from a group chat's member list requires a note — a bare
 * tap is an easy way to spam-add a whole roster with zero context, and the
 * note doubles as the conversation opener (enforced server-side too). */
export default function AddFriendWithNote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { type, colors } = useTheme();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');

  const person = useQuery({
    queryKey: ['profile-name', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, photo_url')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_friend_request', {
        p_to: id,
        p_source: 'group_chat',
        p_note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'members' });
      notify('sent', 'they’ll see your note when they open it.');
      router.back();
    },
    onError: (e) => notify('could not send', e.message),
  });

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
        <Avatar uri={person.data?.photo_url} name={person.data?.full_name} size={64} />
        <Text style={type.h2}>{person.data?.full_name ?? 'classmate'}</Text>
      </View>
      <Text style={type.sub}>
        add a quick note so they know why you’re reaching out — it sends with the request.
      </Text>
      <Field
        placeholder="e.g. we’re both in the makefile lab, want to team up?"
        value={note}
        onChangeText={setNote}
        multiline
        style={{ minHeight: 90, textAlignVertical: 'top' }}
      />
      <Button
        title="send request"
        onPress={() => send.mutate()}
        loading={send.isPending}
        disabled={!note.trim()}
      />
    </ScrollView>
  );
}
