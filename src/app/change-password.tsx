import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Field } from '../components/ui';
import { notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { colors, space, type } from '../lib/theme';

/** Set or change the account password (also the escape hatch for accounts
 *  that signed in with an email code and never had one). */
export default function ChangePassword() {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (password.length < 8) {
      setError('At least 8 characters.');
      return;
    }
    if (password !== password2) {
      setError('Passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    notify('Password saved', 'Use it next time you sign in.');
    router.back();
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <Text style={type.sub}>
        You’ll sign in with your Columbia email and this password.
      </Text>
      <Field
        label="New password"
        placeholder="At least 8 characters"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoFocus
      />
      <Field
        label="Repeat it"
        placeholder="Same thing again"
        secureTextEntry
        value={password2}
        onChangeText={setPassword2}
        onSubmitEditing={save}
      />
      <Button title="Save password" onPress={save} loading={busy} />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md },
});
