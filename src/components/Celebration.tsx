// The match moment — used by the swipe screen (mutual right-swipe) and the
// inbox (accepted friend request). Same event, same feeling.
import { router } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { space, useTheme } from '../lib/theme';
import { Button } from './ui';

export default function Celebration({
  name,
  conversationId,
  onClose,
}: {
  name: string;
  conversationId: string | null;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.bg }]}>
        <Text style={{ fontSize: 52 }}>🎉</Text>
        <Text style={type.title}>You’re connected!</Text>
        {/* the serif accent's second home, per the type scale */}
        <Text style={[type.accent, { color: colors.primary, textAlign: 'center' }]}>
          You and {name} are now friends.
        </Text>
        <View style={{ gap: space.sm, alignSelf: 'stretch' }}>
          <Button
            title="Say hi"
            onPress={() => {
              onClose();
              if (conversationId) router.push(`/chat/${conversationId}`);
            }}
          />
          <Button title="Later" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
});
