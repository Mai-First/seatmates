import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Field } from '../components/ui';
import { useAuth } from '../lib/auth';
import { notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { space, useTheme } from '../lib/theme';

/** Confirming the current password first means a device left signed in
 *  can't be used to hijack the account by just walking in and setting a
 *  new one. If someone genuinely doesn't know it (forgot it, or never
 *  finished setting one), "email me a code" on the sign-in screen is the
 *  real recovery path — this screen isn't it. */
export default function ChangePassword() {
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!current) {
      setError('enter your current password.');
      return;
    }
    if (password.length < 8) {
      setError('at least 8 characters.');
      return;
    }
    if (password !== password2) {
      setError('passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);

    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: session!.user.email!,
      password: current,
    });
    if (reauthErr) {
      setBusy(false);
      setError('that’s not your current password.');
      return;
    }

    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    notify('password saved', 'use it next time you sign in.');
    router.back();
  };

  const forgotPassword = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // session is gone locally either way
    }
    router.replace('/(auth)/sign-in');
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <Text style={type.sub}>you’ll sign in with your columbia email and this password.</Text>
      <Field
        label="current password"
        placeholder="your password today"
        secureTextEntry
        value={current}
        onChangeText={setCurrent}
        autoFocus
      />
      <Field
        label="new password"
        placeholder="at least 8 characters"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Field
        label="repeat it"
        placeholder="same thing again"
        secureTextEntry
        value={password2}
        onChangeText={setPassword2}
        onSubmitEditing={save}
      />
      <Button title="save password" onPress={save} loading={busy} />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Pressable onPress={forgotPassword}>
        <Text style={[type.sub, { color: colors.primary, textAlign: 'center' }]}>
          don’t know your current password? sign out and use “email me a code”
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md },
});
