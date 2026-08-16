import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Loading } from '../../components/ui';
import { useAuth, useMyProfile } from '../../lib/auth';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { radius, space, useTheme, type Scheme } from '../../lib/theme';
import { schoolYearLabel } from '../../lib/types';

/** System / Light / Dark, per the redesign brief. Defaults to System. Renders
 * as one row among the settings rows, not a standalone block. */
function AppearanceRow() {
  const { colors, type, override, setOverride } = useTheme();
  const options: { icon: keyof typeof Ionicons.glyphMap; value: Scheme | null }[] = [
    { icon: 'phone-portrait-outline', value: null },
    { icon: 'sunny-outline', value: 'light' },
    { icon: 'moon-outline', value: 'dark' },
  ];
  return (
    <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Ionicons name="contrast-outline" size={22} color={colors.primary} />
      <Text style={[type.body, { flex: 1 }]}>appearance</Text>
      <View style={[styles.segment, { backgroundColor: colors.card }]}>
        {options.map((o) => {
          const active = override === o.value;
          return (
            <Pressable
              key={o.icon}
              onPress={() => setOverride(o.value)}
              style={[styles.segmentItem, active && { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={o.icon} size={16} color={active ? colors.primary : colors.subtle} />
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
      `${data} class${data === 1 ? '' : 'es'} moved to archived. see you next term.`,
    );
  };

  if (profile.isLoading) return <Loading />;
  const p = profile.data;

  type Row = {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void | Promise<void>;
    danger?: boolean;
  };

  const profileRows: Row[] = [
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
      icon: 'archive-outline' as const,
      label: 'archive this semester',
      onPress: archiveSemester,
    },
  ];

  const settingsRows: Row[] = [
    {
      icon: 'options-outline' as const,
      label: 'notification settings',
      onPress: () => router.push('/notification-settings'),
    },
    {
      icon: 'key-outline' as const,
      label: 'change password',
      onPress: () => router.push('/change-password'),
    },
  ];

  const dangerRows: Row[] = [
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
          'this permanently removes your profile, matches, messages, RSVPs, and study sessions. it cannot be undone.',
          'delete forever',
          true,
        );
        if (!ok) return;
        const really = await confirm(
          'last check',
          'there is no recovery after this. delete the account?',
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

  const renderRow = (row: Row, index: number, all: Row[]) => (
    <Pressable
      key={row.label}
      onPress={row.onPress}
      style={[
        styles.row,
        index < all.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}>
      <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.primary} />
      <Text style={[type.body, { flex: 1 }, row.danger && { color: colors.danger }]}>
        {row.label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
    </Pressable>
  );

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

      <Text style={[type.tiny, styles.sectionHeader]}>profile & classes</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        {profileRows.map(renderRow)}
      </View>

      <Text style={[type.tiny, styles.sectionHeader]}>settings & password</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
        <AppearanceRow />
        {settingsRows.map(renderRow)}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: space.xs }]}>
        {dangerRows.map(renderRow)}
      </View>
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
    marginBottom: space.sm,
  },
  sectionHeader: { paddingTop: space.md, paddingBottom: space.xs, paddingHorizontal: space.xs },
  sectionCard: { borderRadius: radius.lg, overflow: 'hidden' },
  segment: { flexDirection: 'row', borderRadius: radius.sm, padding: 2, gap: 2 },
  segmentItem: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: radius.sm - 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.md,
  },
});
