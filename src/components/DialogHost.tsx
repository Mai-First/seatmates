// Mount once, at the app root (inside ThemeProvider). Renders whatever the
// confirm()/notify() calls in lib/dialogs.ts ask for. A real <Modal> means
// this works identically on web, iOS, and Android -- no native dialog API
// involved anywhere, so there's nothing for an embedding context to suppress.
//
// Confirm and notify share ONE <Modal>, not two independent ones. Two
// separate Modals each animating their own visible/hidden transition can
// both be mid-fade at once -- e.g. archiveSemester() awaits confirm(), gets
// true, and calls notify() in the very next tick, so the confirm modal's
// fade-out and the notify modal's fade-in were landing in the same frame,
// showing both stacked on top of each other. One Modal with one visible
// flag makes that overlap structurally impossible.
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { registerDialogHandlers } from '../lib/dialogs';
import { space, useTheme } from '../lib/theme';
import { Button } from './ui';

type DialogState =
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; destructive: boolean; resolve: (v: boolean) => void }
  | { kind: 'notify'; title: string; message?: string }
  | null;

export default function DialogHost() {
  const { colors, type } = useTheme();
  const [state, setState] = useState<DialogState>(null);

  useEffect(() => {
    registerDialogHandlers({
      confirm: (opts) =>
        new Promise((resolve) => setState({ kind: 'confirm', ...opts, resolve })),
      notify: (title, message) => setState({ kind: 'notify', title, message }),
    });
  }, []);

  const close = (value: boolean) => {
    if (state?.kind === 'confirm') state.resolve(value);
    setState(null);
  };

  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bg }]}>
          <Text style={type.h2}>{state?.title}</Text>
          {state?.message ? <Text style={[type.body, styles.message]}>{state.message}</Text> : null}
          <View style={styles.row}>
            {state?.kind === 'confirm' && (
              <Button title="cancel" variant="ghost" onPress={() => close(false)} />
            )}
            <Button
              title={state?.kind === 'confirm' ? state.confirmLabel : 'ok'}
              variant={state?.kind === 'confirm' && state.destructive ? 'danger' : 'primary'}
              onPress={() => close(true)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: { width: '100%', maxWidth: 420, borderRadius: 20, padding: space.lg },
  message: { marginTop: space.sm },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.lg },
});
