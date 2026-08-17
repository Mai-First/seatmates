// Block/unblock/report against another profile — shared by the profile
// viewer and the chat options screen so the two surfaces can't drift apart.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { confirm, notify } from './dialogs';
import { supabase } from './supabase';
import type { Relationship } from './types';

export function useRelationship(otherId: string | undefined) {
  return useQuery({
    queryKey: ['relationship', otherId],
    enabled: !!otherId,
    queryFn: async (): Promise<Relationship> => {
      const { data, error } = await supabase.rpc('relationship_with', { p_other: otherId });
      if (error) throw error;
      return data;
    },
  });
}

export function useModeration(otherId: string | undefined, myId: string | undefined) {
  const queryClient = useQueryClient();

  // RLS only ever returns rows this user is the blocker on, so a hit here
  // means "I blocked them" specifically, not just "this pair is blocked."
  const myBlock = useQuery({
    queryKey: ['my-block', otherId],
    enabled: !!otherId && !!myId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', myId!)
        .eq('blocked_id', otherId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const invalidateBlockState = () => {
    queryClient.invalidateQueries({ queryKey: ['deck'] });
    queryClient.invalidateQueries({ queryKey: ['study-feed'] });
    queryClient.invalidateQueries({ queryKey: ['relationship', otherId] });
    queryClient.invalidateQueries({ queryKey: ['my-block', otherId] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    // Catches any open chat screen's cached "blocked" banner/read-only state.
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'conversation' });
  };

  const block = async (): Promise<boolean> => {
    if (!otherId || !myId) return false;
    const ok = await confirm(
      'block this person?',
      'they disappear from your deck and can’t message you. they won’t be told.',
      'block',
      true,
    );
    if (!ok) return false;
    const { error } = await supabase.from('blocks').insert({ blocker_id: myId, blocked_id: otherId });
    if (error) {
      notify('could not block', error.message);
      return false;
    }
    invalidateBlockState();
    return true;
  };

  const unblock = async (): Promise<boolean> => {
    if (!otherId || !myId) return false;
    const ok = await confirm(
      'unblock this person?',
      'they’ll be able to message you and reappear in your deck and study feed.',
      'unblock',
      false,
    );
    if (!ok) return false;
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', myId)
      .eq('blocked_id', otherId);
    if (error) {
      notify('could not unblock', error.message);
      return false;
    }
    invalidateBlockState();
    return true;
  };

  // Opens the report form (reason + optional screenshot/file) rather than
  // filing instantly — screenshots/files are real evidence, worth a beat to
  // attach rather than an instant fire-and-forget confirm.
  const report = () => {
    if (!otherId) return;
    router.push(`/report/${otherId}`);
  };

  return { myBlock, block, unblock, report };
}
