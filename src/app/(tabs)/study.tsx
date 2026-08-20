import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar, Badge, Button, Empty, Loading } from '../../components/ui';
import { useMyCourses } from '../../features/schedule/CourseManager';
import { useAuth } from '../../lib/auth';
import { downloadIcs, googleCalendarUrl } from '../../lib/calendar';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import type { StudySession } from '../../lib/types';

export default function Study() {
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [calendarSession, setCalendarSession] = useState<StudySession | null>(null);
  const [rsvpListFor, setRsvpListFor] = useState<StudySession | null>(null);
  const [announceFor, setAnnounceFor] = useState<StudySession | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const feed = useQuery({
    queryKey: ['study-feed'],
    queryFn: async (): Promise<StudySession[]> => {
      const { data, error } = await supabase.rpc('get_study_feed');
      if (error) throw error;
      return data;
    },
  });

  // Sessions scope to the course, not the section — dedupe the same way
  // study/new.tsx does, so "COMS W3157" appears once even across sections.
  const myCourses = useMyCourses();
  const filterOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const c of myCourses.data ?? []) {
      if (!seen.has(c.code)) {
        seen.add(c.code);
        list.push(c.code);
      }
    }
    return list;
  }, [myCourses.data]);

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['study-feed'] });
      // Clears the tab's own badge — mirrors how opening Inbox clears the bell.
      supabase.rpc('mark_study_notifications_read').then(() => {
        queryClient.invalidateQueries({ queryKey: ['unread-study-count'] });
      });
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
    onSuccess: (_data, s) => {
      queryClient.invalidateQueries({ queryKey: ['study-feed'] });
      // The "who's going" modal is its own query, keyed by session — an
      // RSVP here otherwise leaves that list stale until something else
      // happens to refetch it.
      queryClient.invalidateQueries({ queryKey: ['study-rsvps', s.id] });
    },
    onError: (e) => notify('rsvp failed', e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('study_sessions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-feed'] }),
    onError: (e) => notify('could not delete', e.message),
  });

  const announce = useMutation({
    mutationFn: async ({ sessionId, body }: { sessionId: string; body: string }) => {
      const { error } = await supabase.rpc('send_study_announcement', {
        p_session_id: sessionId,
        p_body: body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAnnounceFor(null);
      notify('sent', 'everyone going got your announcement.');
    },
    onError: (e) => notify('could not send', e.message),
  });

  const confirmDelete = async (s: StudySession) => {
    const ok = await confirm(
      `delete "${s.title}"?`,
      'everyone who RSVP’d gets told it was cancelled.',
      'delete',
      true,
    );
    if (ok) remove.mutate(s.id);
  };

  if (feed.isLoading) return <Loading />;

  const filtered =
    selectedCodes.size > 0
      ? (feed.data ?? []).filter((s) => selectedCodes.has(s.course_code))
      : (feed.data ?? []);

  // Upcoming first (soonest on top), past below under their own header.
  const upcoming = filtered.filter((s) => +new Date(s.starts_at) >= Date.now());
  const past = filtered.filter((s) => +new Date(s.starts_at) < Date.now()).reverse();
  const rows: (StudySession | { header: string })[] = [
    ...upcoming,
    ...(past.length ? [{ header: 'past sessions' }, ...past] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {filterOptions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.filterRow, { borderBottomColor: colors.border }]}
          contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
          {filterOptions.map((code) => {
            const active = selectedCodes.has(code);
            return (
              <Pressable
                key={code}
                onPress={() => toggleCode(code)}
                style={[
                  styles.filterChip,
                  { borderColor: colors.primary },
                  active && { backgroundColor: colors.primary },
                ]}>
                <Text
                  style={{
                    color: active ? colors.onFill : colors.primary,
                    fontFamily: fontFamily.semibold,
                    fontSize: 13,
                  }}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <FlatList
        data={rows}
        keyExtractor={(s) => ('header' in s ? s.header : s.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 100 }}
        ListEmptyComponent={
          <Empty
            icon="book-outline"
            title="no study sessions yet"
            body="post one for any of your classes. everyone taking that course will see it and can RSVP."
          />
        }
        renderItem={({ item }) => {
          if ('header' in item) {
            return <Text style={[type.tiny, { marginTop: space.md }]}>{item.header}</Text>;
          }
          const when = new Date(item.starts_at);
          const isPast = +when < Date.now();
          const mine = item.host_id === session?.user.id;
          return (
            <View
              style={[
                styles.card,
                { borderColor: colors.border, backgroundColor: colors.card },
                isPast && { opacity: 0.5 },
              ]}>
              <View style={styles.cardTop}>
                <Badge text={item.course_code} />
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Pressable onPress={() => setRsvpListFor(item)} hitSlop={8}>
                    <Ionicons name="people-outline" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => setCalendarSession(item)} hitSlop={8}>
                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                  </Pressable>
                  {mine && (
                    <>
                      <Pressable onPress={() => setAnnounceFor(item)} hitSlop={8}>
                        <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => router.push(`/study/new?edit=${item.id}`)}
                        hitSlop={8}>
                        <Ionicons name="create-outline" size={20} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={colors.danger} />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
              <Text style={type.h2}>{item.title}</Text>
              <Text style={type.sub}>
                {when
                  .toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                  .toLowerCase()}
                {' · '}
                {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
              {item.description ? <Text style={type.body}>{item.description}</Text> : null}
              <View style={styles.cardFooter}>
                <Pressable
                  style={styles.hostLink}
                  onPress={() => router.push(`/profile/${item.host_id}`)}>
                  <Text style={type.sub} numberOfLines={1}>
                    hosted by <Text style={{ color: colors.primary }}>{item.host_name}</Text>
                  </Text>
                </Pressable>
                {mine ? (
                  // The host is always going to their own session — no toggle,
                  // just the count (also enforced server-side, PLAN review).
                  <View style={[styles.rsvp, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.subtle, fontFamily: fontFamily.bold, fontSize: 14 }}>
                      hosting · {item.going_count} going
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    disabled={isPast || rsvp.isPending}
                    onPress={() => rsvp.mutate(item)}
                    style={[
                      styles.rsvp,
                      { borderColor: colors.primary },
                      item.my_status === 'going' && { backgroundColor: colors.primary },
                    ]}>
                    <Text
                      style={{
                        color: item.my_status === 'going' ? colors.onFill : colors.primary,
                        fontFamily: fontFamily.bold,
                        fontSize: 14,
                      }}>
                      {item.my_status === 'going'
                        ? `going · ${item.going_count}`
                        : `rsvp · ${item.going_count} going`}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/study/new')}>
        <Ionicons name="add" size={30} color={colors.onFill} />
      </Pressable>

      <AddToCalendarModal session={calendarSession} onClose={() => setCalendarSession(null)} />
      <RsvpListModal session={rsvpListFor} onClose={() => setRsvpListFor(null)} />
      <AnnounceModal
        session={announceFor}
        sending={announce.isPending}
        onSend={(body) => announceFor && announce.mutate({ sessionId: announceFor.id, body })}
        onClose={() => setAnnounceFor(null)}
      />
    </View>
  );
}

/** One-hour block, title + time — either a Google Calendar link or a .ics
 * handed to the share sheet (native) / downloaded (web). */
function AddToCalendarModal({
  session,
  onClose,
}: {
  session: StudySession | null;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Modal
      visible={!!session}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={[styles.calendarCard, { backgroundColor: colors.bg }]}>
          <Text style={type.h2}>add to calendar</Text>
          <Text style={[type.sub, { marginBottom: space.sm }]}>
            one-hour block starting when the session does.
          </Text>
          <Button
            title="add to google calendar"
            onPress={() => {
              if (session) Linking.openURL(googleCalendarUrl(session));
              onClose();
            }}
          />
          <Button
            title="apple / outlook (.ics)"
            variant="outline"
            onPress={() => {
              if (session) downloadIcs(session);
              onClose();
            }}
          />
          <Button title="cancel" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Who's RSVP'd 'going' — fetched on demand, only while the modal is open. */
function RsvpListModal({ session, onClose }: { session: StudySession | null; onClose: () => void }) {
  const { colors, type } = useTheme();
  const rsvps = useQuery({
    queryKey: ['study-rsvps', session?.id],
    enabled: !!session,
    queryFn: async (): Promise<{ profile_id: string; full_name: string | null; photo_url: string | null }[]> => {
      const { data, error } = await supabase.rpc('get_study_rsvps', { p_session_id: session!.id });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Modal visible={!!session} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={[styles.calendarCard, { backgroundColor: colors.bg }]}>
          <Text style={type.h2}>who's going</Text>
          {rsvps.isLoading ? (
            <Loading />
          ) : rsvps.data?.length ? (
            rsvps.data.map((r) => (
              <View key={r.profile_id} style={styles.likerRow}>
                <Avatar uri={r.photo_url} name={r.full_name} size={36} />
                <Text style={type.body}>{r.full_name ?? 'classmate'}</Text>
              </View>
            ))
          ) : (
            <Text style={type.sub}>no one yet.</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Host-only: a free-text note that fans out as a notification + push to
 * everyone RSVP'd 'going' — deliberately not a chat message. */
function AnnounceModal({
  session,
  sending,
  onSend,
  onClose,
}: {
  session: StudySession | null;
  sending: boolean;
  onSend: (body: string) => void;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  const [body, setBody] = useState('');

  const close = () => {
    setBody('');
    onClose();
  };

  return (
    <Modal visible={!!session} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.calendarBackdrop} onPress={close}>
        <Pressable style={[styles.calendarCard, { backgroundColor: colors.bg }]}>
          <Text style={type.h2}>announce</Text>
          <Text style={[type.sub, { marginBottom: space.sm }]}>
            sent as a notification to everyone going — not a chat message.
          </Text>
          <TextInput
            style={[styles.announceInput, { borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. moved to the 3rd floor study room"
            placeholderTextColor={colors.subtle}
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus
          />
          <Button
            title="send"
            loading={sending}
            disabled={!body.trim()}
            onPress={() => {
              onSend(body.trim());
              setBody('');
            }}
          />
          <Button title="cancel" variant="ghost" onPress={close} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm },
  filterChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  // Long host names used to run underneath the RSVP pill. The name shrinks and
  // truncates; the pill keeps its natural width.
  hostLink: { flex: 1, minWidth: 0 },
  rsvp: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexShrink: 0,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  calendarCard: { width: '100%', maxWidth: 420, borderRadius: 20, padding: space.lg, gap: space.sm },
  likerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  announceInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 80,
    fontSize: 16,
    textAlignVertical: 'top',
  },
});
