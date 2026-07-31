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

type Stage = 'choice' | 'email' | 'code';
type Mode = 'create' | 'signin';

export default function SignIn() {
  const [stage, setStage] = useState<Stage>('choice');
  const [mode, setMode] = useState<Mode>('create');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (m: Mode) => {
    setMode(m);
    setError(null);
    setStage('email');
  };

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
      // "Sign in" never creates an account; "Create account" does (D1).
      options: { shouldCreateUser: mode === 'create' },
    });
    setBusy(false);
    if (err) {
      setError(
        /signup|not allowed|not found/i.test(err.message)
          ? 'No account with that email yet — go back and create one.'
          : err.message,
      );
    } else {
      setStage('code');
    }
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

        {stage === 'choice' && (
          <>
            <Button title="Create account" onPress={() => pick('create')} />
            <Button title="Sign in" variant="outline" onPress={() => pick('signin')} />
            <Text style={[type.tiny, { textAlign: 'center' }]}>
              Columbia students only — you’ll verify with your @columbia.edu email.
            </Text>
          </>
        )}

        {stage === 'email' && (
          <>
            <Field
              label={mode === 'create' ? 'Your Columbia email' : 'Columbia email'}
              placeholder="you@columbia.edu"
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={sendCode}
              autoFocus
            />
            <Button
              title={mode === 'create' ? 'Create account' : 'Send code'}
              onPress={sendCode}
              loading={busy}
            />
            <Button title="Back" variant="ghost" onPress={() => setStage('choice')} />
          </>
        )}

        {stage === 'code' && (
          <>
            <Field
              label={`Enter the 6-digit code sent to ${email.trim()}`}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={verify}
              autoFocus
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
