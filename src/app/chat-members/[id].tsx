import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Loading } from '../../components/ui';
import { notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';
import type { Member } from '../../lib/types';

export default function ChatMembers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();

  const members = useQuery({
    queryKey: ['members', id],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.rpc('get_members', { p_conversation: id });
      if (error) throw error;
      return data;
    },
  });

  const request = useMutation({
    mutationFn: async (to: string) => {
      const { error } = await supabase.rpc('send_friend_request', {
        p_to: to,
        p_source: 'group_chat',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', id] }),
    onError: (e) => notify('Could not send request', e.message),
  });

  if (members.isLoading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Individually add people — deliberately no "add all" (PLAN D9). */}
      <FlatList
        data={members.data ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.info} onPress={() => router.push(`/profile/${item.id}`)}>
              <Avatar uri={item.photo_url} name={item.full_name} size={44} />
              <View>
                <Text style={type.body}>{item.full_name ?? 'Classmate'}</Text>
                {item.major ? <Text style={type.sub}>{item.major}</Text> : null}
              </View>
            </Pressable>
            {item.relationship === 'none' && (
              <Button small title="Add friend" onPress={() => request.mutate(item.id)} />
            )}
            {item.relationship === 'out_pending' && (
              <Button small title="Requested" variant="outline" disabled onPress={() => {}} />
            )}
            {item.relationship === 'in_pending' && (
              <Button small title="Respond" variant="outline" onPress={() => router.push('/inbox')} />
            )}
            {item.relationship === 'friends' && (
              <Text style={{ color: colors.success, fontWeight: '600' }}>Friends</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
});
