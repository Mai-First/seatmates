import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Loading } from '../components/ui';
import { useAuth, useMyProfile } from '../lib/auth';
import { notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { space, useTheme } from '../lib/theme';
import type { NotificationKind, NotificationPrefs } from '../lib/types';

const ROWS: { key: NotificationKind; label: string; body: string }[] = [
  { key: 'friend_request', label: 'Friend requests', body: 'Someone wants to connect with you.' },
  { key: 'request_accepted', label: 'Request accepted', body: 'Someone accepted your request.' },
  { key: 'new_match', label: 'New matches', body: 'You and someone are now connected.' },
  { key: 'study_new', label: 'New study sessions', body: 'A classmate posts one for your course.' },
  { key: 'announcement', label: 'Announcements', body: 'Messages from the Seatmates team.' },
  { key: 'message', label: 'Messages', body: 'New DMs and group chat messages (per-chat mute still applies).' },
];

const DEFAULTS: NotificationPrefs = {
  friend_request: true,
  request_accepted: true,
  new_match: true,
  study_new: true,
  announcement: true,
  message: true,
};

export default function NotificationSettings() {
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const profile = useMyProfile();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);

  useEffect(() => {
    if (profile.data?.notification_prefs) {
      setPrefs({ ...DEFAULTS, ...profile.data.notification_prefs });
    }
  }, [profile.data]);

  const toggle = async (key: NotificationKind, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic — a toggle should feel instant
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: next })
      .eq('id', session!.user.id);
    if (error) {
      setPrefs(prefs); // revert
      notify('Could not save', error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['profile', session?.user.id] });
  };

  if (profile.isLoading) return <Loading />;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <Text style={type.sub}>
        Choose what you hear about — in the app and as a push notification. A muted chat stays
        quiet regardless of the Messages setting below.
      </Text>
      {ROWS.map((row) => (
        <View key={row.key} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.body}>{row.label}</Text>
            <Text style={type.sub}>{row.body}</Text>
          </View>
          <Switch
            value={prefs[row.key]}
            onValueChange={(v) => toggle(row.key, v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
});
