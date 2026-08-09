import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { fontFamily, useTheme } from '../../lib/theme';
import type { ConversationSummary } from '../../lib/types';

/** Top-right notification inbox (PLAN D17) — Swipe tab only. */
function InboxButton() {
  const { colors } = useTheme();
  const { data: unread } = useQuery({
    queryKey: ['unread-count'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('unread_notification_count');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
  return (
    <Pressable onPress={() => router.push('/inbox')} style={styles.bell} hitSlop={8}>
      <Ionicons name="notifications-outline" size={24} color={colors.primary} />
      {!!unread && (
        <View style={[styles.dot, { backgroundColor: colors.primary }]}>
          <Text style={[styles.dotText, { color: colors.onFill }]}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function TabsLayout() {
  const { colors, type } = useTheme();

  // Same queryKey the Chats tab itself uses, so this shares that cache
  // instead of firing a second RPC — and stays fresh via the same
  // invalidations chats.tsx already does.
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<ConversationSummary[]> => {
      const { data, error } = await supabase.rpc('get_conversations');
      if (error) throw error;
      return data;
    },
  });
  const unreadChats = conversations?.filter((c) => c.unread).length ?? 0;

  const { data: unreadStudy } = useQuery({
    queryKey: ['unread-study-count'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('unread_study_notification_count');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  // React Navigation badges default to red; the app's one brand accent is
  // this Columbia blue, so every "new stuff" bubble should read as the same
  // signal instead of looking like three unrelated alerts.
  const badgeStyle = { backgroundColor: colors.primary, color: colors.onFill };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontFamily: type.h2.fontFamily, fontSize: 19 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 10 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'swipe',
          headerRight: () => <InboxButton />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'chats',
          tabBarBadge: unreadChats > 0 ? unreadChats : undefined,
          tabBarBadgeStyle: badgeStyle,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: 'study dates',
          tabBarBadge: unreadStudy && unreadStudy > 0 ? unreadStudy : undefined,
          tabBarBadgeStyle: badgeStyle,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'account',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bell: { marginRight: 16 },
  dot: {
    position: 'absolute',
    top: -4,
    right: -6,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  dotText: { fontSize: 11, fontFamily: fontFamily.bold },
});
