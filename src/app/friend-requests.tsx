import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Celebration from '../components/Celebration';
import { Avatar, Button, Empty, Loading } from '../components/ui';
import { notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { space, useTheme } from '../lib/theme';
import type { PendingFriendRequest } from '../lib/types';

/** Instagram-requests-style list: everyone who's asked to connect, one row
 * each, accept/decline right there. */
export default function FriendRequests() {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const [celebrate, setCelebrate] = useState<{ name: string; conversationId: string | null } | null>(
    null,
  );

  const requests = useQuery({
    queryKey: ['pending-requests'],
    queryFn: async (): Promise<PendingFriendRequest[]> => {
      const { data, error } = await supabase.rpc('get_pending_friend_requests');
      if (error) throw error;
      return data;
    },
  });

  const respond = useMutation({
    mutationFn: async (args: { requestId: string; accept: boolean; name: string | null }) => {
      const { data, error } = await supabase.rpc('respond_friend_request', {
        p_request: args.requestId,
        p_accept: args.accept,
      });
      if (error) throw error;
      return data as string | null; // dm conversation id on accept
    },
    onSuccess: (conversationId, args) => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      if (args.accept && conversationId) {
        setCelebrate({ name: args.name ?? 'your classmate', conversationId });
      }
    },
    onError: (e) => notify('could not respond', e.message),
  });

  if (requests.isLoading) return <Loading />;

  const items = requests.data ?? [];
  const overlay = celebrate ? (
    <Celebration
      name={celebrate.name}
      conversationId={celebrate.conversationId}
      onClose={() => setCelebrate(null)}
    />
  ) : null;

  if (items.length === 0) {
    return (
      <>
        <Empty
          icon="people-outline"
          title="no requests"
          body="when someone wants to connect, they'll show up here."
        />
        {overlay}
      </>
    );
  }

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.bg }}
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.info} onPress={() => router.push(`/profile/${item.from_id}`)}>
              <Avatar uri={item.photo_url} name={item.full_name} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.body}>{item.full_name ?? 'classmate'}</Text>
                {item.major ? <Text style={type.sub}>{item.major}</Text> : null}
                {item.note ? <Text style={type.sub}>“{item.note}”</Text> : null}
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                small
                title="accept"
                onPress={() =>
                  respond.mutate({ requestId: item.id, accept: true, name: item.full_name })
                }
              />
              <Button
                small
                title="decline"
                variant="outline"
                onPress={() =>
                  respond.mutate({ requestId: item.id, accept: false, name: item.full_name })
                }
              />
            </View>
          </View>
        )}
      />
      {overlay}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  info: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
});
