import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field } from '../../components/ui';
import { notify } from '../../lib/dialogs';
import { PROFILE_PROMPT_OPTIONS } from '../../lib/profilePrompts';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';

type Prompt = { id: string; prompt: string; answer: string };

/** Add as many prompts as you want, picked from a fixed list, each answered
 * and saved immediately — not bundled into the big profile Save button. */
export default function PromptsEditor({ profileId }: { profileId: string }) {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');

  const prompts = useQuery({
    queryKey: ['profile-prompts', profileId],
    queryFn: async (): Promise<Prompt[]> => {
      const { data, error } = await supabase
        .from('profile_prompts')
        .select('id, prompt, answer')
        .eq('profile_id', profileId)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profile_prompts')
        .insert({ profile_id: profileId, prompt: answering, answer: answer.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-prompts', profileId] });
      setAnswering(null);
      setAnswer('');
    },
    onError: (e) => notify('could not add', e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('profile_prompts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile-prompts', profileId] }),
    onError: (e) => notify('could not remove', e.message),
  });

  const used = new Set((prompts.data ?? []).map((p) => p.prompt));
  const available = PROFILE_PROMPT_OPTIONS.filter((p) => !used.has(p));

  return (
    <View style={{ gap: space.sm }}>
      <Text style={type.sub}>prompts (optional — add as many as you want)</Text>
      {(prompts.data ?? []).map((p) => (
        <View
          key={p.id}
          style={[styles.promptCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.tiny}>{p.prompt}</Text>
            <Text style={type.body}>{p.answer}</Text>
          </View>
          <Pressable onPress={() => remove.mutate(p.id)} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.subtle} />
          </Pressable>
        </View>
      ))}

      {available.length > 0 && (
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={[styles.addRow, { borderColor: colors.primary }]}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: fontFamily.semibold }}>add a prompt</Text>
        </Pressable>
      )}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={type.h2}>pick a prompt</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm }}>
            {available.map((p) => (
              <Pressable
                key={p}
                onPress={() => {
                  setAnswering(p);
                  setPickerOpen(false);
                }}
                style={[styles.optionRow, { borderColor: colors.border }]}>
                <Text style={type.body}>{p}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!answering} transparent animationType="fade" onRequestClose={() => setAnswering(null)}>
        <View style={styles.answerBackdrop}>
          <View style={[styles.answerCard, { backgroundColor: colors.bg }]}>
            <Text style={type.h2}>{answering}</Text>
            <Field
              placeholder="Your answer"
              value={answer}
              onChangeText={setAnswer}
              multiline
              autoFocus
            />
            <Button
              title="add to profile"
              onPress={() => add.mutate()}
              loading={add.isPending}
              disabled={!answer.trim()}
            />
            <Button
              title="cancel"
              variant="ghost"
              onPress={() => {
                setAnswering(null);
                setAnswer('');
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  promptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    padding: space.md,
    justifyContent: 'center',
  },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
    borderBottomWidth: 1,
  },
  optionRow: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  answerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  answerCard: { width: '100%', maxWidth: 420, borderRadius: 20, padding: space.lg, gap: space.sm },
});
