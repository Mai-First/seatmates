import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

/** Top-right notification inbox (PLAN D17) — present on every tab. */
function InboxButton() {
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
        <View style={styles.dot}>
          <Text style={styles.dotText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <InboxButton />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        headerTitleStyle: { color: colors.text },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Swipe',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: 'Study Groups',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
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
    backgroundColor: colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  dotText: { color: colors.white, fontSize: 11, fontWeight: '700' },
});
