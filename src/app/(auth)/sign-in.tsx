import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Field } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, space, type } from '../../lib/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const clean = email.trim().toLowerCase();
    if (!/@columbia\.edu$/.test(clean)) {
      setError('Use your @columbia.edu email — that’s the whole point.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setStage('code');
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (err) setError(err.message);
    else router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.logo}>Seatmates</Text>
        <Text style={type.sub}>Make friends with the people already in the room.</Text>

        {stage === 'email' ? (
          <>
            <Field
              label="Columbia email"
              placeholder="you@columbia.edu"
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={sendCode}
            />
            <Button title="Send code" onPress={sendCode} loading={busy} />
          </>
        ) : (
          <>
            <Field
              label={`Enter the 6-digit code sent to ${email.trim()}`}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={verify}
            />
            <Button title="Verify" onPress={verify} loading={busy} disabled={code.length < 6} />
            <Button title="Different email" variant="ghost" onPress={() => setStage('email')} />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  inner: { padding: space.xl, gap: space.md, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { fontSize: 40, fontWeight: '800', color: colors.primary },
  error: { color: colors.danger, fontSize: 14 },
});
