import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AddFriendPopup from '../../components/AddFriendPopup';
import { Avatar, Button, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';
import type { Member } from '../../lib/types';

export default function ChatMembers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const [addTarget, setAddTarget] = useState<{ id: string; name: string | null } | null>(null);

  const members = useQuery({
    queryKey: ['members', id],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.rpc('get_members', { p_conversation: id });
      if (error) throw error;
      return data;
    },
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
                <Text style={type.body}>{item.full_name ?? 'classmate'}</Text>
                {item.major ? <Text style={type.sub}>{item.major}</Text> : null}
              </View>
            </Pressable>
            {item.relationship === 'none' && (
              <Button
                small
                title="add friend"
                onPress={() => setAddTarget({ id: item.id, name: item.full_name })}
              />
            )}
            {item.relationship === 'out_pending' && (
              <Button small title="requested" variant="outline" disabled onPress={() => {}} />
            )}
            {item.relationship === 'in_pending' && (
              <Button small title="respond" variant="outline" onPress={() => router.push('/inbox')} />
            )}
            {item.relationship === 'friends' && (
              <Text style={{ color: colors.success, fontWeight: '600' }}>friends</Text>
            )}
          </View>
        )}
      />
      {addTarget && (
        <AddFriendPopup
          personId={addTarget.id}
          personName={addTarget.name}
          source="group_chat"
          onClose={() => setAddTarget(null)}
          onSent={() => queryClient.invalidateQueries({ queryKey: ['members', id] })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
});
