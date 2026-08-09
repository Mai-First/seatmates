import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialogs';
import { useModeration, useRelationship } from '../../lib/moderation';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';
import type { Profile } from '../../lib/types';

type ConversationInfo = {
  id: string;
  kind: 'section' | 'dm';
  title: string;
  member: boolean;
  muted: boolean;
  pinned: boolean;
  other_id: string | null;
};

export default function ChatOptions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const info = useQuery({
    queryKey: ['conversation', id],
    queryFn: async (): Promise<ConversationInfo | undefined> => {
      const { data, error } = await supabase.rpc('get_conversation_info', { p_id: id });
      if (error) throw error;
      return data?.[0];
    },
  });

  const otherId = info.data?.kind === 'dm' ? (info.data.other_id ?? undefined) : undefined;

  const other = useQuery({
    queryKey: ['profile-view', otherId],
    enabled: !!otherId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', otherId).single();
      if (error) throw error;
      return data;
    },
  });

  const relationship = useRelationship(otherId);
  const { myBlock, block: doBlock, unblock, report: doReport } = useModeration(
    otherId,
    session?.user.id,
  );

  const toggleMute = useMutation({
    mutationFn: async (muted: boolean) => {
      const { error } = await supabase.rpc('set_conversation_muted', {
        p_conversation: id,
        p_muted: muted,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => notify('Could not update', e.message),
  });

  const togglePin = useMutation({
    mutationFn: async (pinned: boolean) => {
      const { error } = await supabase.rpc('set_conversation_pinned', {
        p_conversation: id,
        p_pinned: pinned,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => notify('Could not update', e.message),
  });

  const block = async () => {
    if (await doBlock()) router.back();
  };

  if (info.isLoading) return <Loading />;
  const isDm = info.data?.kind === 'dm';
  const rel = relationship.data;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      {isDm && other.data ? (
        <Pressable
          style={styles.profileRow}
          onPress={() => otherId && router.push(`/profile/${otherId}`)}>
          <Avatar uri={other.data.photo_url} name={other.data.full_name} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.h2}>{other.data.full_name ?? 'Classmate'}</Text>
            <Text style={type.sub}>View full profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
        </Pressable>
      ) : null}

      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Ionicons name="pin-outline" size={22} color={colors.primary} />
        <Text style={[type.body, { flex: 1 }]}>Pin chat</Text>
        <Switch
          value={info.data?.pinned ?? false}
          disabled={togglePin.isPending}
          onValueChange={(v) => togglePin.mutate(v)}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Ionicons name="notifications-off-outline" size={22} color={colors.primary} />
        <Text style={[type.body, { flex: 1 }]}>Mute chat</Text>
        <Switch
          value={info.data?.muted ?? false}
          disabled={toggleMute.isPending}
          onValueChange={(v) => toggleMute.mutate(v)}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>

      {isDm && other.data?.instagram ? (
        <ActionRow
          icon="logo-instagram"
          label="Add on Instagram"
          onPress={() => Linking.openURL(`https://instagram.com/${other.data!.instagram}`)}
        />
      ) : null}
      {isDm && other.data?.linkedin ? (
        <ActionRow
          icon="logo-linkedin"
          label="Add on LinkedIn"
          onPress={() =>
            Linking.openURL(`https://linkedin.com/${other.data!.linkedin!.replace(/^\/+/, '')}`)
          }
        />
      ) : null}

      {isDm && rel !== 'self' ? (
        <>
          {rel === 'blocked' ? (
            myBlock.data ? (
              <ActionRow icon="lock-open-outline" label="Unblock" onPress={unblock} />
            ) : null
          ) : (
            <ActionRow icon="ban-outline" label="Block" danger onPress={block} />
          )}
          <ActionRow icon="flag-outline" label="Report" danger onPress={doReport} />
        </>
      ) : null}
    </ScrollView>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon as never} size={22} color={danger ? colors.danger : colors.primary} />
      <Text style={[type.body, { flex: 1 }, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: space.md,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
});
