import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field } from '../../components/ui';
import { useMyCourses } from '../../features/schedule/CourseManager';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, type } from '../../lib/theme';
import { confirm, notify } from '../../lib/dialogs';

export default function NewStudySession() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const myCourses = useMyCourses();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState('');

  // Sessions scope to the course, not the section (PLAN A2) — dedupe.
  const courses = useMemo(() => {
    const seen = new Map<string, { id: string; code: string; title: string }>();
    for (const c of myCourses.data ?? []) {
      if (!seen.has(c.course_id)) seen.set(c.course_id, { id: c.course_id, code: c.code, title: c.title });
    }
    return [...seen.values()];
  }, [myCourses.data]);

  const create = useMutation({
    mutationFn: async () => {
      const starts = new Date(when.trim().replace(' ', 'T'));
      if (Number.isNaN(+starts)) throw new Error('Date format: 2026-08-05 19:00');
      const { data, error } = await supabase
        .from('study_sessions')
        .insert({
          course_id: courseId,
          host_id: session!.user.id,
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          starts_at: starts.toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      // Hosts are going to their own session.
      await supabase.from('rsvps').upsert(
        { session_id: data.id, profile_id: session!.user.id, status: 'going' },
        { onConflict: 'session_id,profile_id' },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-feed'] });
      router.back();
    },
    onError: (e) => notify('Could not post', e.message),
  });

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled">
      <Text style={type.sub}>Class</Text>
      <View style={styles.chips}>
        {courses.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCourseId(c.id)}
            style={[styles.chip, courseId === c.id && styles.chipOn]}>
            <Text style={{ color: courseId === c.id ? colors.white : colors.primary, fontWeight: '600' }}>
              {c.code}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field label="Title" placeholder="Midterm grind session" value={title} onChangeText={setTitle} />
      <Field
        label="Details (optional)"
        placeholder="What are you covering? Snacks?"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
      <Field label="Location" placeholder="Butler 403" value={location} onChangeText={setLocation} />
      <Field
        label="When (YYYY-MM-DD HH:MM)"
        placeholder="2026-08-05 19:00"
        autoCapitalize="none"
        value={when}
        onChangeText={setWhen}
      />

      <Button
        title="Post it"
        onPress={() => create.mutate()}
        loading={create.isPending}
        disabled={!courseId || !title.trim() || !when.trim()}
      />
      <Text style={type.tiny}>
        Everyone enrolled in the course — any section — can see this and RSVP.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.primary },
});
