import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Avatar, Empty, Loading } from '../components/ui';
import { confirm, notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { space, useTheme } from '../lib/theme';
import type { BlockedProfile } from '../lib/types';

export default function Blocked() {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();

  const blocks = useQuery({
    queryKey: ['my-blocks'],
    queryFn: async (): Promise<BlockedProfile[]> => {
      const { data, error } = await supabase.rpc('get_my_blocks');
      if (error) throw error;
      return data;
    },
  });

  const unblock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('blocks').delete().eq('blocked_id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      queryClient.invalidateQueries({ queryKey: ['study-feed'] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'members' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'relationship' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'my-block' });
    },
    onError: (e) => notify('could not unblock', e.message),
  });

  const confirmUnblock = async (person: BlockedProfile) => {
    const ok = await confirm(
      `unblock ${person.full_name ?? 'this person'}?`,
      'they’ll be able to message you and reappear in your deck, study feed, and shared group chats.',
      'unblock',
      false,
    );
    if (ok) unblock.mutate(person.id);
  };

  if (blocks.isLoading) return <Loading />;

  if (!blocks.data?.length) {
    return <Empty icon="hand-left-outline" title="no one blocked" body="people you block show up here." />;
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={blocks.data}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}
            onPress={() => router.push(`/profile/${item.id}`)}>
            <Avatar uri={item.photo_url} name={item.full_name} size={44} />
            <View>
              <Text style={type.body}>{item.full_name ?? 'unnamed'}</Text>
              {item.major ? <Text style={type.sub}>{item.major}</Text> : null}
            </View>
          </Pressable>
          <Pressable onPress={() => confirmUnblock(item)} disabled={unblock.isPending}>
            <Text style={{ color: colors.primary }}>unblock</Text>
          </Pressable>
        </View>
      )}
    />
  );
}
