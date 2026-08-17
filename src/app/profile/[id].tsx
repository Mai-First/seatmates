import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AddFriendPopup from '../../components/AddFriendPopup';
import { Avatar, Badge, Button, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useModeration, useRelationship } from '../../lib/moderation';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';
import { schoolYearLabel, type Profile, type SharedSection } from '../../lib/types';

export default function ProfileViewer() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [showAddFriend, setShowAddFriend] = useState(false);

  const profile = useQuery({
    queryKey: ['profile-view', id],
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });

  const relationship = useRelationship(id);

  const prompts = useQuery({
    queryKey: ['profile-prompts', id],
    queryFn: async (): Promise<{ id: string; prompt: string; answer: string }[]> => {
      const { data, error } = await supabase
        .from('profile_prompts')
        .select('id, prompt, answer')
        .eq('profile_id', id)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const shared = useQuery({
    queryKey: ['shared-sections', id],
    queryFn: async (): Promise<SharedSection[]> => {
      const { data, error } = await supabase.rpc('shared_sections', { p_other: id });
      if (error) throw error;
      return data;
    },
  });

  const { myBlock, block: doBlock, unblock, report: doReport } = useModeration(id, session?.user.id);

  const openDm = async () => {
    const { data } = await supabase.rpc('dm_with', { p_other: id });
    if (data) router.push(`/chat/${data}`);
  };

  const block = async () => {
    if (await doBlock()) router.back();
  };
  const report = () => doReport();

  if (profile.isLoading) return <Loading />;
  const p = profile.data;
  if (!p) return null;
  const rel = relationship.data;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <Avatar uri={p.photo_url} name={p.full_name} size={120} />
          <Text style={type.title}>{p.full_name}</Text>
          {schoolYearLabel(p.school, p.grad_year) ? (
            <Text style={[type.sub, { color: colors.primary }]}>
              {schoolYearLabel(p.school, p.grad_year)}
            </Text>
          ) : null}
          <Text style={type.body}>
            {[p.major, p.hometown].filter(Boolean).join(' · ') || 'columbia student'}
          </Text>
          <View style={styles.sharedWrap}>
            {/* Every shared class, name + code (team decision) */}
            {(shared.data ?? []).map((s) => (
              <Badge key={`${s.code}-${s.section}`} text={`${s.title} · ${s.code} §${s.section}`} />
            ))}
          </View>
        </View>

        {/* Swiping is the only way to express interest from the swipe tab —
            an "add friend" button here would let people skip the swipe (and
            its daily limit) entirely. */}
        {rel === 'none' && from === 'swipe' && (
          <Text style={[type.sub, { textAlign: 'center' }]}>
            swipe right on their card to add them as a friend
          </Text>
        )}
        {rel === 'none' && from !== 'swipe' && (
          <Button title="add friend" onPress={() => setShowAddFriend(true)} />
        )}
        {rel === 'out_pending' && <Button title="request sent" variant="outline" disabled onPress={() => {}} />}
        {rel === 'in_pending' && (
          <Button title="they asked first. respond in inbox" variant="outline" onPress={() => router.push('/inbox')} />
        )}
        {rel === 'friends' && <Button title="message" onPress={openDm} />}

        {p.bio ? (
          <View style={styles.section}>
            <Text style={type.tiny}>about</Text>
            <Text style={type.body}>{p.bio}</Text>
          </View>
        ) : null}

        {p.study_spot ? (
          <View style={styles.section}>
            <Text style={type.tiny}>favorite study spot</Text>
            <Text style={type.body}>{p.study_spot}</Text>
          </View>
        ) : null}

        {(prompts.data ?? []).map((pr) => (
          <View key={pr.id} style={[styles.promptCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={type.tiny}>{pr.prompt}</Text>
            <Text style={type.body}>{pr.answer}</Text>
          </View>
        ))}

        {/* Contact details are for people you actually know — not visible
            just from browsing/swiping past someone. */}
        {(rel === 'friends' || rel === 'self') &&
        (p.show_email !== false || p.instagram || p.linkedin) ? (
          <View style={styles.section}>
            <Text style={type.tiny}>contact</Text>
            {p.show_email !== false ? (
              <Row icon="mail-outline" text={p.email} onPress={() => Linking.openURL(`mailto:${p.email}`)} />
            ) : null}
            {p.instagram ? (
              <Row
                icon="logo-instagram"
                text={`@${p.instagram}`}
                onPress={() => Linking.openURL(`https://instagram.com/${p.instagram}`)}
              />
            ) : null}
            {p.linkedin ? <LinkedinRow handle={p.linkedin} /> : null}
          </View>
        ) : null}

        {rel !== 'self' && (
          <View style={[styles.section, { flexDirection: 'row', gap: space.lg }]}>
            {rel === 'blocked' ? (
              myBlock.data ? (
                <Pressable onPress={unblock}>
                  <Text style={{ color: colors.primary }}>unblock</Text>
                </Pressable>
              ) : null
            ) : (
              <Pressable onPress={block}>
                <Text style={{ color: colors.danger }}>block</Text>
              </Pressable>
            )}
            <Pressable onPress={report}>
              <Text style={{ color: colors.danger }}>report</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      {showAddFriend && (
        <AddFriendPopup
          personId={id}
          personName={p.full_name}
          source="profile"
          onClose={() => setShowAddFriend(false)}
          onSent={() => queryClient.invalidateQueries({ queryKey: ['relationship', id] })}
        />
      )}
    </View>
  );
}

function LinkedinRow({ handle }: { handle: string }) {
  return (
    <Row
      icon="logo-linkedin"
      text={handle}
      onPress={() => Linking.openURL(`https://linkedin.com/${handle.replace(/^\/+/, '')}`)}
    />
  );
}

function Row({ icon, text, onPress }: { icon: string; text: string; onPress: () => void }) {
  const { colors, type } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Ionicons name={icon as never} size={20} color={colors.primary} />
      <Text style={[type.body, { color: colors.primary }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 },
  sharedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
    marginTop: space.xs,
  },
  section: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 },
  promptCard: { gap: 4, borderWidth: 1, borderRadius: 16, padding: space.md },
});
