import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Loading } from '../components/ui';
import { useAuth, useMyEnrollmentCount, useMyProfile } from '../lib/auth';
import { registerPush } from '../lib/push';
import { hasSupabaseConfig } from '../lib/supabase';
import { fontFamily, space, useTheme } from '../lib/theme';

/** Entry gate: config → auth → onboarding (profile, then schedule) → tabs. */
export default function Index() {
  const { colors, type } = useTheme();
  const { session, loading } = useAuth();
  const profile = useMyProfile();
  const enrollments = useMyEnrollmentCount();

  useEffect(() => {
    if (session) registerPush(session.user.id);
  }, [session]);

  const code = [styles.code, { color: colors.primary }];

  if (!hasSupabaseConfig) {
    return (
      <View style={[styles.config, { backgroundColor: colors.bg }]}>
        <Text style={type.title}>almost there</Text>
        <Text style={[type.body, { textAlign: 'center' }]}>
          Supabase isn’t configured. Copy <Text style={code}>.env.example</Text> to{' '}
          <Text style={code}>.env</Text>, fill in the URL and anon key, then restart{' '}
          <Text style={code}>npx expo start</Text>. Full steps are in the README.
        </Text>
      </View>
    );
  }

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profile.isLoading || enrollments.isLoading) return <Loading />;
  if (!profile.data?.full_name) return <Redirect href="/onboarding/profile" />;
  if ((enrollments.data ?? 0) === 0) return <Redirect href="/onboarding/schedule" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  config: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  code: { fontFamily: fontFamily.semibold },
});
