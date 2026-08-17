import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Button, Field } from '../../components/ui';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';

/** Wraps admin_send_announcement() — lands in every user's inbox + push. */
export default function AdminAnnounce() {
  const { type } = useTheme();
  const [body, setBody] = useState('');

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_send_announcement', { p_body: body });
      if (error) throw error;
    },
    onSuccess: () => {
      notify('sent', 'the announcement is in everyone’s inbox.');
      router.back();
    },
    onError: (e) => notify('could not send', e.message),
  });

  const confirmAndSend = async () => {
    const ok = await confirm(
      'send to everyone?',
      'this lands in every user’s inbox (and push notification) right away.',
      'send it',
      true,
    );
    if (ok) send.mutate();
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      keyboardShouldPersistTaps="handled">
      <Text style={type.sub}>
        goes out to every user immediately — there’s no draft or scheduling.
      </Text>
      <Field
        label="announcement"
        placeholder="e.g. new feature: study session announcements!"
        value={body}
        onChangeText={setBody}
        multiline
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />
      <Button
        title="send to everyone"
        onPress={confirmAndSend}
        loading={send.isPending}
        disabled={!body.trim()}
      />
    </ScrollView>
  );
}
