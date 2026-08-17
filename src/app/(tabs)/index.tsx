import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Celebration from '../../components/Celebration';
import { Button, Loading } from '../../components/ui';
import { useMyProfile } from '../../lib/auth';
import { notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import { schoolYearLabel, type DeckCard } from '../../lib/types';

const SWIPE_THRESHOLD = 110;

export default function Swipe() {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  // Who's been swiped this session, tracked locally rather than as a numeric
  // index into deck.data. An index breaks the instant deck.data changes
  // underneath it — a background refetch (window refocus, invalidation from
  // elsewhere) reorders/shortens the array server-side once a swipe lands,
  // and a stale index then points at the wrong card: exactly what read as
  // "flashes back to the previous profile." Filtering a stable local set
  // out of whatever deck.data currently is makes "the current card" correct
  // no matter when or how often the array underneath changes.
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [match, setMatch] = useState<{ name: string; conversationId: string | null } | null>(null);
  const profile = useMyProfile();

  const deck = useQuery({
    queryKey: ['deck'],
    // Hidden means invisible to everyone else's deck (PLAN §6) — Hinge-style,
    // that only makes sense if it also pauses your own swiping both ways.
    enabled: profile.data?.hidden !== true,
    // A mid-session background refetch has nothing to offer here (new people
    // becoming available is exactly what useFocusEffect below already
    // refreshes for) and only risks reshuffling the array while swipedIds
    // is filtering it — off entirely, not just a longer staleTime.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DeckCard[]> => {
      const { data, error } = await supabase.rpc('get_swipe_deck');
      if (error) throw error;
      return data;
    },
  });

  useFocusEffect(
    useCallback(() => {
      // New enrollments / accepted requests change the deck; refresh when shown.
      queryClient.invalidateQueries({ queryKey: ['deck'] });
    }, [queryClient]),
  );

  const swipe = useMutation({
    mutationFn: async (args: { swipee: string; direction: 'left' | 'right' }) => {
      const { data, error } = await supabase.rpc('record_swipe', {
        p_swipee: args.swipee,
        p_direction: args.direction,
      });
      if (error) throw error;
      return data as { matched: boolean; conversation_id: string | null };
    },
  });

  // ─── Gesture logic below is UNCHANGED from the original screen ───
  const pan = useRef(new Animated.ValueXY()).current;
  const cards = (deck.data ?? []).filter((c) => !swipedIds.has(c.id));
  const card = cards[0];
  const nextCard = cards[1];

  // Resetting pan here (imperative, applies instantly) used to run in the
  // same tick as setSwipedIds (a React state update, deferred to the next
  // render) — pan would snap back to center a frame before the card
  // content actually swapped, so the just-swiped card flashed back into
  // view for a frame. useLayoutEffect (not useEffect) matters here: it
  // fires synchronously right after the new card commits but before the
  // screen paints, so the reset and the content swap land in the same
  // frame instead of two — useEffect's async timing was still letting
  // that frame slip through often enough to be noticeable.
  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
  }, [card?.id, pan]);

  const advance = useCallback(
    (direction: 'left' | 'right') => {
      if (!card) return;
      const current = card;
      setSwipedIds((prev) => {
        const next = new Set(prev);
        next.add(current.id);
        return next;
      });
      swipe.mutate(
        { swipee: current.id, direction },
        {
          onSuccess: (res) => {
            if (res.matched) {
              setMatch({ name: current.full_name, conversationId: res.conversation_id });
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
              queryClient.invalidateQueries({ queryKey: ['unread-count'] });
            }
          },
          onError: (e) => {
            notify('could not record swipe', e.message);
            setSwipedIds((prev) => {
              const next = new Set(prev);
              next.delete(current.id);
              return next;
            });
          },
        },
      );
    },
    [card, swipe, queryClient],
  );

  const fling = useCallback(
    (direction: 'left' | 'right') => {
      Animated.timing(pan, {
        toValue: { x: direction === 'right' ? width * 1.3 : -width * 1.3, y: 0 },
        duration: 180,
        useNativeDriver: false,
      }).start(() => advance(direction));
    },
    [pan, width, advance],
  );

  // PanResponder.create() only ever runs once — useRef discards every
  // later render's argument. Its handlers close over whatever `fling` (and
  // therefore `card`) was on that very first render, so a real drag-release
  // kept swiping the *original* first card forever while the on-screen card
  // had already correctly advanced — the just-swiped card would fly off and
  // never get its position reset, unmasking the peek card underneath in its
  // smaller "behind" styling. Routing through a ref that's kept current
  // every render fixes it without recreating the responder itself.
  const flingRef = useRef(fling);
  useLayoutEffect(() => {
    flingRef.current = fling;
  }, [fling]);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD) flingRef.current('right');
        else if (g.dx < -SWIPE_THRESHOLD) flingRef.current('left');
        else
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
      },
    }),
  ).current;
  // ─── end unchanged gesture logic ───

  if (profile.isLoading) return <Loading />;

  if (profile.data?.hidden) {
    return (
      <View style={[styles.emptyDeck, { backgroundColor: colors.bg }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="eye-off-outline" size={26} color={colors.primary} />
        </View>
        <Text style={[type.h2, { textAlign: 'center' }]}>your profile is hidden</Text>
        <Text style={[type.sub, { textAlign: 'center', maxWidth: 300 }]}>
          swiping is paused while you're hidden — you won't see anyone, and no one sees you.
          turn it back on in account to pick up where you left off.
        </Text>
        <View style={{ marginTop: space.xs }}>
          <Button title="go to account" onPress={() => router.push('/account')} />
        </View>
      </View>
    );
  }

  if (deck.isLoading) return <Loading />;

  if (!card) {
    return (
      <View style={[styles.emptyDeck, { backgroundColor: colors.bg }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="school-outline" size={26} color={colors.primary} />
        </View>
        <Text style={[type.h2, { textAlign: 'center' }]}>that’s everyone for now</Text>
        <Text style={[type.sub, { textAlign: 'center', maxWidth: 300 }]}>
          you’ve seen every classmate in your sections. check back as more people join.
        </Text>
        <View style={{ marginTop: space.xs }}>
          <Button title="say hi to your new friends" onPress={() => router.push('/chats')} />
        </View>
      </View>
    );
  }

  const rotate = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const likeOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Peek of the next card */}
      {nextCard && (
        <View style={[styles.card, styles.cardBehind, { backgroundColor: colors.card }]}>
          <CardFace card={nextCard} />
        </View>
      )}

      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.card,
          { backgroundColor: colors.card },
          { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
        ]}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(`/profile/${card.id}?from=swipe`)}>
          <CardFace card={card} />
        </Pressable>
        <Animated.View
          style={[styles.stamp, styles.like, { borderColor: colors.success, opacity: likeOpacity }]}>
          <Text style={[styles.stampText, { color: colors.success }]}>FRIEND</Text>
        </Animated.View>
        <Animated.View
          style={[styles.stamp, styles.nope, { borderColor: colors.danger, opacity: nopeOpacity }]}>
          <Text style={[styles.stampText, { color: colors.danger }]}>PASS</Text>
        </Animated.View>
      </Animated.View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => fling('left')}
          style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="close" size={30} color={colors.danger} />
        </Pressable>
        <Pressable
          onPress={() => fling('right')}
          style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="heart" size={28} color={colors.warm} />
        </Pressable>
      </View>

      {match && (
        <Celebration
          name={match.name}
          conversationId={match.conversationId}
          onClose={() => setMatch(null)}
        />
      )}
    </View>
  );
}

// ─── Redesigned card face: big photo, confident type, shared class as the
// hero detail (Hinge-style). Only this function + its styles changed. ───
function CardFace({ card }: { card: DeckCard }) {
  const { colors, type } = useTheme();
  const shared = card.shared ?? [];
  // Multiple shared classes squeeze the body, so give the bio less room
  // rather than letting the class list get clipped — the overlap is the
  // reason this person is on screen at all.
  const bioLines = shared.length > 2 ? 1 : 2;

  const initials = (card.full_name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.face}>
      <View style={[styles.facePhoto, { backgroundColor: colors.accentSoft }]}>
        {card.photo_url ? (
          <Image
            source={{ uri: card.photo_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // A 150ms transition turned out to be its own, more noticeable
            // glitch — a visible fade drawing attention to itself instead
            // of masking anything. No transition prop = expo-image's plain
            // instant swap, which is what to compare future attempts
            // against. cachePolicy alone (no visual effect, just a caching
            // hint) is left in since it's not implicated in either report.
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.initialsWrap]}>
            <Text style={{ fontSize: 64, fontFamily: fontFamily.bold, color: colors.primary }}>
              {initials}
            </Text>
          </View>
        )}
        {/* legibility scrim so name/major sit on the photo like Hinge's cards */}
        <LinearGradient colors={colors.scrim} style={styles.scrim} pointerEvents="none" />
        <View style={styles.photoOverlay}>
          <Text style={[type.display, { color: colors.white }]} numberOfLines={1}>
            {card.full_name}
          </Text>
          {schoolYearLabel(card.school, card.grad_year) ? (
            <Text
              style={[type.accent, { color: colors.white, opacity: 0.95 }]}
              numberOfLines={1}>
              {schoolYearLabel(card.school, card.grad_year)}
            </Text>
          ) : null}
          <Text style={[type.body, { color: colors.white, opacity: 0.92 }]} numberOfLines={1}>
            {[card.major, card.hometown].filter(Boolean).join(' · ') || 'columbia student'}
          </Text>
        </View>
      </View>

      <View style={styles.faceBody}>
        {/* the shared classes are the hero detail — italic serif, one per line,
            every one listed rather than collapsed into a "+N" */}
        <View style={styles.sharedList}>
          {shared.map((s, i) => (
            <View key={`${s.code}-${s.section}`} style={styles.sharedRow}>
              {i === 0 ? (
                <Ionicons name="school-outline" size={16} color={colors.primary} />
              ) : (
                // keeps continuation lines aligned under the first
                <View style={styles.sharedRowSpacer} />
              )}
              <Text style={[type.accent, { color: colors.primary, flex: 1 }]} numberOfLines={1}>
                {s.title} · {s.code} §{s.section}
              </Text>
            </View>
          ))}
        </View>
        {card.bio ? (
          <Text style={type.sub} numberOfLines={bioLines}>
            {card.bio}
          </Text>
        ) : null}
        {card.study_spot ? (
          <View style={styles.sharedRow}>
            <Ionicons name="location-outline" size={16} color={colors.primary} />
            <Text style={[type.sub, { flex: 1 }]} numberOfLines={1}>
              studies at {card.study_spot}
            </Text>
          </View>
        ) : null}
        <Text style={[type.tiny, { marginTop: 'auto' }]}>tap for full profile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.lg },
  emptyDeck: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    top: space.lg,
    left: space.lg,
    right: space.lg,
    bottom: 110,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 10 }] },
  face: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  // photo now fills ~65% of the card — the headline element, not a chip up top
  facePhoto: { flex: 1.9, position: 'relative' },
  // sit the initials in the clear upper area, not behind the scrim
  initialsWrap: { alignItems: 'center', justifyContent: 'center', paddingBottom: '22%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  photoOverlay: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.md, gap: 2 },
  faceBody: { flex: 1, padding: space.lg, gap: space.sm },
  sharedList: { gap: 2 },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sharedRowSpacer: { width: 16 },
  stamp: {
    position: 'absolute',
    top: 28,
    borderWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: '-12deg' }],
  },
  like: { left: 20 },
  nope: { right: 20, transform: [{ rotate: '12deg' }] },
  stampText: { fontSize: 24, fontFamily: fontFamily.bold },
  actions: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xl,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
