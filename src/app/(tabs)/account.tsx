import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Loading } from '../../components/ui';
import { useAuth, useMyProfile } from '../../lib/auth';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme, type Scheme } from '../../lib/theme';
import { schoolYearLabel } from '../../lib/types';

/** System / Light / Dark, per the redesign brief. Defaults to System. */
function Appearance() {
  const { colors, type, override, setOverride } = useTheme();
  const options: { label: string; value: Scheme | null }[] = [
    { label: 'system', value: null },
    { label: 'light', value: 'light' },
    { label: 'dark', value: 'dark' },
  ];
  return (
    <View style={{ gap: space.sm }}>
      <Text style={type.tiny}>appearance</Text>
      <View style={[styles.segment, { backgroundColor: colors.surface }]}>
        {options.map((o) => {
          const active = override === o.value;
          return (
            <Pressable
              key={o.label}
              onPress={() => setOverride(o.value)}
              style={[
                styles.segmentItem,
                active && { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <Text
                style={{
                  color: active ? colors.text : colors.subtle,
                  fontFamily: active ? fontFamily.semibold : fontFamily.ui,
                  fontSize: 14,
                }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function Account() {
  const { colors, type } = useTheme();
  const profile = useMyProfile();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const archiveSemester = async () => {
    const ok = await confirm(
      'are you sure the semester is over?',
      'All your class group chats move to archived (readable, not deleted), your classes are cleared, and your swipe deck resets for next semester. DMs and friends are untouched.',
      'archive semester',
      true,
    );
    if (!ok) return;
    const { data, error } = await supabase.rpc('archive_semester');
    if (error) {
      notify('could not archive', error.message);
      return;
    }
    queryClient.invalidateQueries();
    notify(
      'semester archived',
      `${data} class${data === 1 ? '' : 'es'} moved to archived. See you next term.`,
    );
  };

  if (profile.isLoading) return <Loading />;
  const p = profile.data;

  const rows = [
    {
      icon: 'create-outline' as const,
      label: 'edit profile',
      onPress: () => router.push('/onboarding/profile?edit=1'),
    },
    {
      icon: 'school-outline' as const,
      label: 'my classes (add / drop)',
      onPress: () => router.push('/courses'),
    },
    {
      icon: 'options-outline' as const,
      label: 'notification settings',
      onPress: () => router.push('/notification-settings'),
    },
    {
      icon: 'archive-outline' as const,
      label: 'archive this semester',
      onPress: archiveSemester,
    },
    {
      icon: 'key-outline' as const,
      label: 'change password',
      onPress: () => router.push('/change-password'),
    },
    {
      icon: 'log-out-outline' as const,
      label: 'sign out',
      danger: true,
      onPress: async () => {
        // scope:'local' clears this device's session without needing the
        // server round-trip to succeed; never let a rejection strand the user.
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // session is gone locally either way
        }
        router.replace('/(auth)/sign-in');
      },
    },
    {
      icon: 'trash-outline' as const,
      label: 'delete account',
      danger: true,
      onPress: async () => {
        const ok = await confirm(
          'delete your account?',
          'This permanently removes your profile, matches, messages, RSVPs, and study sessions. It cannot be undone.',
          'delete forever',
          true,
        );
        if (!ok) return;
        const really = await confirm(
          'last check',
          'There is no recovery after this. Delete the account?',
          'yes, delete it',
          true,
        );
        if (!really) return;
        // Storage blocks SQL deletes, so the avatar goes first via the API.
        await supabase.storage
          .from('avatars')
          .remove([`${session!.user.id}/avatar.jpg`])
          .catch(() => {});
        const { error } = await supabase.rpc('delete_my_account');
        if (error) {
          notify('could not delete', error.message);
          return;
        }
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // account is already gone; local session cleanup is best-effort
        }
        router.replace('/(auth)/sign-in');
      },
    },
  ];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Avatar uri={p?.photo_url} name={p?.full_name} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.h2}>{p?.full_name ?? 'unnamed'}</Text>
          {schoolYearLabel(p?.school, p?.grad_year) ? (
            <Text style={[type.sub, { color: colors.primary }]}>
              {schoolYearLabel(p?.school, p?.grad_year)}
            </Text>
          ) : null}
          <Text style={type.sub}>{p?.email}</Text>
          <Text style={type.sub}>{[p?.major, p?.hometown].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      <Appearance />

      <View style={{ height: space.sm }} />

      {rows.map((row) => (
        <Pressable
          key={row.label}
          onPress={row.onPress}
          style={[styles.row, { borderBottomColor: colors.border }]}>
          <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.primary} />
          <Text style={[type.body, row.danger && { color: colors.danger }]}>{row.label}</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.subtle}
            style={{ marginLeft: 'auto' }}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
  },
  segment: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
  },
});
