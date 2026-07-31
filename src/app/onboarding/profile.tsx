import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Avatar, Button, Field } from '../../components/ui';
import { useAuth, useMyProfile } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';
import { confirm, notify } from '../../lib/dialogs';

export default function OnboardingProfile() {
  const { colors, type } = useTheme();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === '1';
  const { session } = useAuth();
  const profile = useMyProfile();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [major, setMajor] = useState('');
  const [hometown, setHometown] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setName((v) => v || (p.full_name ?? ''));
    setMajor((v) => v || (p.major ?? ''));
    setHometown((v) => v || (p.hometown ?? ''));
    setBio((v) => v || (p.bio ?? ''));
    setInstagram((v) => v || (p.instagram ?? ''));
    setLinkedin((v) => v || (p.linkedin ?? ''));
    setPhotoUrl((v) => v ?? p.photo_url);
  }, [profile.data]);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !session) return;
    setBusy(true);
    try {
      const asset = result.assets[0];
      const bytes = await (await fetch(asset.uri)).arrayBuffer();
      const path = `${session.user.id}/avatar.jpg`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setPhotoUrl(`${data.publicUrl}?v=${Date.now()}`); // bust image cache
    } catch (e: unknown) {
      notify('Upload failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!session) return;
    if (!name.trim()) {
      notify('Name required', 'Classmates need something to call you.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name.trim(),
        major: major.trim() || null,
        hometown: hometown.trim() || null,
        bio: bio.trim() || null,
        instagram: instagram.trim().replace(/^@/, '') || null,
        linkedin: linkedin.trim() || null,
        photo_url: photoUrl,
      })
      .eq('id', session.user.id);
    setBusy(false);
    if (error) {
      notify('Could not save', error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    if (isEdit) router.back();
    else router.replace('/onboarding/schedule');
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled">
      {!isEdit && (
        <Text style={type.sub}>
          This is what classmates see before they swipe. Only your name is required.
        </Text>
      )}

      <Pressable onPress={pickPhoto} style={styles.photoRow}>
        <Avatar uri={photoUrl} name={name || '?'} size={84} />
        <Text style={{ color: colors.primary, fontWeight: '600' }}>
          {photoUrl ? 'Change photo' : 'Add a photo'}
        </Text>
      </Pressable>

      <Field label="Name" placeholder="Alex Morgan" value={name} onChangeText={setName} />
      <Field label="Major" placeholder="Computer Science" value={major} onChangeText={setMajor} />
      <Field
        label="Where you're from"
        placeholder="Queens, NY"
        value={hometown}
        onChangeText={setHometown}
      />
      <Field
        label="Bio (optional)"
        placeholder="A line or two about you"
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <Field
        label="Instagram (optional)"
        placeholder="handle"
        autoCapitalize="none"
        value={instagram}
        onChangeText={setInstagram}
      />
      <Field
        label="LinkedIn (optional)"
        placeholder="in/yourname"
        autoCapitalize="none"
        value={linkedin}
        onChangeText={setLinkedin}
      />

      <Button
        title={isEdit ? 'Save' : 'Continue'}
        onPress={save}
        loading={busy}
        disabled={!name.trim()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  photoRow: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
});
