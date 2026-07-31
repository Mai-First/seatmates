import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Empty, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, type } from '../../lib/theme';
import type { StudySession } from '../../lib/types';
import { confirm, notify } from '../../lib/dialogs';

export default function Study() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const feed = useQuery({
    queryKey: ['study-feed'],
    queryFn: async (): Promise<StudySession[]> => {
      const { data, error } = await supabase.rpc('get_study_feed');
      if (error) throw error;
      return data;
    },
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['study-feed'] });
    }, [queryClient]),
  );

  const rsvp = useMutation({
    mutationFn: async (s: StudySession) => {
      if (s.my_status === 'going') {
        const { error } = await supabase
          .from('rsvps')
          .delete()
          .eq('session_id', s.id)
          .eq('profile_id', session!.user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rsvps').upsert(
          { session_id: s.id, profile_id: session!.user.id, status: 'going' },
          { onConflict: 'session_id,profile_id' },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-feed'] }),
    onError: (e) => notify('RSVP failed', e.message),
  });

  if (feed.isLoading) return <Loading />;

  // Upcoming first (soonest on top), past below under their own header.
  const upcoming = (feed.data ?? []).filter((s) => +new Date(s.starts_at) >= Date.now());
  const past = (feed.data ?? [])
    .filter((s) => +new Date(s.starts_at) < Date.now())
    .reverse();
  const rows: (StudySession | { header: string })[] = [
    ...upcoming,
    ...(past.length ? [{ header: 'Past sessions' }, ...past] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(s) => ('header' in s ? s.header : s.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 100 }}
        ListEmptyComponent={
          <Empty
            icon="📚"
            title="No study sessions yet"
            body="Post one for any of your classes — everyone enrolled in the course can see it and RSVP."
          />
        }
        renderItem={({ item }) => {
          if ('header' in item) {
            return <Text style={styles.pastHeader}>{item.header}</Text>;
          }
          const when = new Date(item.starts_at);
          const past = +when < Date.now();
          return (
            <View style={[styles.card, past && { opacity: 0.5 }]}>
              <Badge text={item.course_code} />
              <Text style={type.h2}>{item.title}</Text>
              <Text style={type.sub}>
                {when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                {' · '}
                {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
              {item.description ? <Text style={type.body}>{item.description}</Text> : null}
              <View style={styles.cardFooter}>
                <Pressable onPress={() => router.push(`/profile/${item.host_id}`)}>
                  <Text style={type.sub}>
                    Hosted by <Text style={{ color: colors.primary }}>{item.host_name}</Text>
                  </Text>
                </Pressable>
                <Pressable
                  disabled={past || rsvp.isPending}
                  onPress={() => rsvp.mutate(item)}
                  style={[styles.rsvp, item.my_status === 'going' && styles.rsvpOn]}>
                  <Text
                    style={{
                      color: item.my_status === 'going' ? colors.white : colors.primary,
                      fontWeight: '700',
                    }}>
                    {item.my_status === 'going' ? `Going ✓ · ${item.going_count}` : `RSVP · ${item.going_count} going`}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/study/new')}>
        <Ionicons name="add" size={30} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pastHeader: {
    ...type.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: space.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
  },
  rsvp: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  rsvpOn: { backgroundColor: colors.primary },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
