import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Loading } from '../../components/ui';
import { useMyProfile } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, type } from '../../lib/theme';

export default function Account() {
  const profile = useMyProfile();
  if (profile.isLoading) return <Loading />;
  const p = profile.data;

  const rows = [
    {
      icon: 'create-outline' as const,
      label: 'Edit profile',
      onPress: () => router.push('/onboarding/profile?edit=1'),
    },
    {
      icon: 'school-outline' as const,
      label: 'My classes (add / drop)',
      onPress: () => router.push('/courses'),
    },
    {
      icon: 'notifications-outline' as const,
      label: 'Notifications',
      onPress: () => router.push('/inbox'),
    },
    {
      icon: 'log-out-outline' as const,
      label: 'Sign out',
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
  ];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <View style={styles.card}>
        <Avatar uri={p?.photo_url} name={p?.full_name} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.h2}>{p?.full_name ?? 'Unnamed'}</Text>
          <Text style={type.sub}>{p?.email}</Text>
          <Text style={type.sub}>
            {[p?.major, p?.hometown].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      {rows.map((row) => (
        <Pressable key={row.label} onPress={row.onPress} style={styles.row}>
          <Ionicons
            name={row.icon}
            size={22}
            color={row.danger ? colors.danger : colors.primary}
          />
          <Text style={[type.body, row.danger && { color: colors.danger }]}>{row.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.subtle} style={{ marginLeft: 'auto' }} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
