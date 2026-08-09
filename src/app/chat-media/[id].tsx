import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { radius, space, useTheme } from '../../lib/theme';
import type { Message } from '../../lib/types';

const GRID_GAP = 4;

export default function ChatMedia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useTheme();

  const attachments = useQuery({
    queryKey: ['chat-media', id],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .not('attachment_url', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Message[];
    },
  });

  if (attachments.isLoading) return <Loading />;

  const photos = (attachments.data ?? []).filter((m) => m.attachment_type === 'image');
  const files = (attachments.data ?? []).filter((m) => m.attachment_type === 'file');

  if (photos.length === 0 && files.length === 0) {
    return (
      <Empty
        icon="images-outline"
        title="nothing shared yet"
        body="Photos and files sent in this chat show up here."
      />
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      {photos.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Text style={type.tiny}>photos ({photos.length})</Text>
          <View style={styles.grid}>
            {photos.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => Linking.openURL(m.attachment_url!)}
                style={styles.gridItem}>
                <Image source={{ uri: m.attachment_url! }} style={styles.gridImage} contentFit="cover" />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {files.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Text style={type.tiny}>files ({files.length})</Text>
          {files.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => Linking.openURL(m.attachment_url!)}
              style={[styles.fileRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="document-outline" size={22} color={colors.primary} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {m.attachment_name ?? 'file'}
              </Text>
              <Ionicons name="open-outline" size={18} color={colors.subtle} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  gridItem: { width: '32%', aspectRatio: 1 },
  gridImage: { width: '100%', height: '100%', borderRadius: radius.sm },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
});
