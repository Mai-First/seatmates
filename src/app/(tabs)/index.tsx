import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Avatar, Badge, Button, Empty, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, type } from '../../lib/theme';
import type { DeckCard } from '../../lib/types';

const SWIPE_THRESHOLD = 110;

export default function Swipe() {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [cursor, setCursor] = useState(0);
  const [match, setMatch] = useState<{ name: string; conversationId: string | null } | null>(null);

  const deck = useQuery({
    queryKey: ['deck'],
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

  const pan = useRef(new Animated.ValueXY()).current;
  const cards = deck.data ?? [];
  const card = cards[cursor];

  const advance = useCallback(
    (direction: 'left' | 'right') => {
      if (!card) return;
      const current = card;
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
        },
      );
      setCursor((c) => c + 1);
      pan.setValue({ x: 0, y: 0 });
    },
    [card, swipe, pan, queryClient],
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

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD) fling('right');
        else if (g.dx < -SWIPE_THRESHOLD) fling('left');
        else
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
      },
    }),
  ).current;

  if (deck.isLoading) return <Loading />;

  if (!card) {
    return (
      <Empty
        icon="🎓"
        title="That’s everyone for now"
        body="You’ve seen every classmate in your sections. Add another class, or check back as more people join."
      />
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
    <View style={styles.root}>
      {/* Peek of the next card */}
      {cards[cursor + 1] && (
        <View style={[styles.card, styles.cardBehind]}>
          <CardFace card={cards[cursor + 1]} />
        </View>
      )}

      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.card,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
        ]}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(`/profile/${card.id}`)}>
          <CardFace card={card} />
        </Pressable>
        <Animated.View style={[styles.stamp, styles.like, { opacity: likeOpacity }]}>
          <Text style={styles.stampText}>FRIEND</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.nope, { opacity: nopeOpacity }]}>
          <Text style={styles.stampText}>PASS</Text>
        </Animated.View>
      </Animated.View>

      <View style={styles.actions}>
        <Pressable onPress={() => fling('left')} style={[styles.fab, styles.fabNope]}>
          <Ionicons name="close" size={30} color={colors.danger} />
        </Pressable>
        <Pressable onPress={() => fling('right')} style={[styles.fab, styles.fabLike]}>
          <Ionicons name="heart" size={28} color={colors.success} />
        </Pressable>
      </View>

      {match && (
        <View style={styles.matchOverlay}>
          <Text style={{ fontSize: 52 }}>🎉</Text>
          <Text style={type.title}>You’re connected!</Text>
          <Text style={[type.body, { textAlign: 'center' }]}>
            You and {match.name} both swiped right.
          </Text>
          <Button
            title="Say hi"
            onPress={() => {
              const id = match.conversationId;
              setMatch(null);
              if (id) router.push(`/chat/${id}`);
            }}
          />
          <Button title="Keep swiping" variant="ghost" onPress={() => setMatch(null)} />
        </View>
      )}
    </View>
  );
}

function CardFace({ card }: { card: DeckCard }) {
  return (
    <View style={styles.face}>
      <View style={styles.faceTop}>
        <Avatar uri={card.photo_url} name={card.full_name} size={132} />
      </View>
      <View style={styles.faceBody}>
        <Badge
          text={
            card.shared_count > 1
              ? `${card.shared_code} + ${card.shared_count - 1} more`
              : card.shared_code
          }
        />
        <Text style={type.title}>{card.full_name}</Text>
        <Text style={type.body}>
          {[card.major, card.hometown].filter(Boolean).join(' · ') || 'Columbia student'}
        </Text>
        {card.bio ? (
          <Text style={[type.sub, { marginTop: space.sm }]} numberOfLines={3}>
            {card.bio}
          </Text>
        ) : null}
        <Text style={[type.tiny, { marginTop: 'auto' }]}>Tap for full profile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, padding: space.lg },
  card: {
    position: 'absolute',
    top: space.lg,
    left: space.lg,
    right: space.lg,
    bottom: 110,
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 10 }] },
  face: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  faceTop: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    paddingVertical: space.xl,
  },
  faceBody: { flex: 1, padding: space.lg, gap: space.xs },
  stamp: {
    position: 'absolute',
    top: 28,
    borderWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: '-12deg' }],
  },
  like: { left: 20, borderColor: colors.success },
  nope: { right: 20, borderColor: colors.danger, transform: [{ rotate: '12deg' }] },
  stampText: { fontSize: 24, fontWeight: '800', color: colors.text },
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
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fabNope: { borderWidth: 1, borderColor: colors.border },
  fabLike: { borderWidth: 1, borderColor: colors.border },
  matchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
});
