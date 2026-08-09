// Block/unblock/report against another profile — shared by the profile
// viewer and the chat options screen so the two surfaces can't drift apart.
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
      'Block this person?',
      'They disappear from your deck and can’t message you. They won’t be told.',
      'Block',
      true,
    );
    if (!ok) return false;
    const { error } = await supabase.from('blocks').insert({ blocker_id: myId, blocked_id: otherId });
    if (error) {
      notify('Could not block', error.message);
      return false;
    }
    invalidateBlockState();
    return true;
  };

  const unblock = async (): Promise<boolean> => {
    if (!otherId || !myId) return false;
    const ok = await confirm(
      'Unblock this person?',
      'They’ll be able to message you and reappear in your deck and study feed.',
      'Unblock',
      false,
    );
    if (!ok) return false;
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', myId)
      .eq('blocked_id', otherId);
    if (error) {
      notify('Could not unblock', error.message);
      return false;
    }
    invalidateBlockState();
    return true;
  };

  const report = async (): Promise<boolean> => {
    if (!otherId || !myId) return false;
    const ok = await confirm(
      'Report this person?',
      'Tell us what happened; the team reviews every report.',
      'Report',
      true,
    );
    if (!ok) return false;
    const { error } = await supabase
      .from('reports')
      .insert({ reporter_id: myId, reported_id: otherId, reason: 'in-app report' });
    if (error) {
      notify('Could not report', error.message);
      return false;
    }
    notify('Thanks', 'We got it.');
    return true;
  };

  return { myBlock, block, unblock, report };
}
