// The match moment — used by the swipe screen (mutual right-swipe) and the
// inbox (accepted friend request). Same event, same feeling.
import { router } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, space, type } from '../lib/theme';
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
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Text style={{ fontSize: 52 }}>🎉</Text>
        <Text style={type.title}>You’re connected!</Text>
        <Text style={[type.body, { textAlign: 'center' }]}>
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
    backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
});
