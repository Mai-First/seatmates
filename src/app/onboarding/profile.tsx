import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar, Button, Field } from '../../components/ui';
import PromptsEditor from '../../features/profile/PromptsEditor';
import { useAuth, useMyProfile } from '../../lib/auth';
import { notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import type { School } from '../../lib/types';

const SCHOOLS: School[] = ['CC', 'SEAS', 'BC', 'GS'];
const GRAD_YEARS = [2027, 2028, 2029, 2030];

export default function OnboardingProfile() {
  const { colors, type } = useTheme();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === '1';
  const { session } = useAuth();
  const profile = useMyProfile();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [school, setSchool] = useState<School | null>(null);
  const [gradYear, setGradYear] = useState<number | null>(null);
  const [major, setMajor] = useState('');
  const [hometown, setHometown] = useState('');
  const [bio, setBio] = useState('');
  const [studySpot, setStudySpot] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // null = "not loaded from the server yet" -- distinct from a real false,
  // so a refetch can never clobber a user's already-flipped-off toggle.
  const [showEmail, setShowEmail] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setName((v) => v || (p.full_name ?? ''));
    setPronouns((v) => v || (p.pronouns ?? ''));
    setSchool((v) => v ?? p.school);
    setGradYear((v) => v ?? p.grad_year);
    setMajor((v) => v || (p.major ?? ''));
    setHometown((v) => v || (p.hometown ?? ''));
    setBio((v) => v || (p.bio ?? ''));
    setStudySpot((v) => v || (p.study_spot ?? ''));
    setInstagram((v) => v || (p.instagram ?? ''));
    setLinkedin((v) => v || (p.linkedin ?? ''));
    setPhotoUrl((v) => v ?? p.photo_url);
    setShowEmail((v) => v ?? (p.show_email ?? true));
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
      notify('upload failed', e instanceof Error ? e.message : 'try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!session) return;
    if (!name.trim()) {
      notify('name required', 'classmates need something to call you.');
      return;
    }
    if (!photoUrl) {
      notify('photo required', 'add a profile photo so classmates know who they’re meeting.');
      return;
    }
    if (!studySpot.trim()) {
      notify('study spot required', 'tell classmates where you like to study.');
      return;
    }
    if (!school || !gradYear) {
      notify('school and year required', 'pick your school and graduation year.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name.trim(),
        pronouns: pronouns.trim() || null,
        school,
        grad_year: gradYear,
        major: major.trim() || null,
        hometown: hometown.trim() || null,
        bio: bio.trim() || null,
        study_spot: studySpot.trim(),
        instagram: instagram.trim().replace(/^@/, '') || null,
        linkedin: linkedin.trim() || null,
        photo_url: photoUrl,
        show_email: showEmail ?? true,
      })
      .eq('id', session.user.id);
    setBusy(false);
    if (error) {
      notify('could not save', error.message);
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
          this is what classmates see before they swipe. photo, name, study spot, school, and
          graduation year are required.
        </Text>
      )}

      <Pressable onPress={pickPhoto} style={styles.photoRow}>
        <Avatar uri={photoUrl} name={name || '?'} size={84} />
        <Text style={{ color: colors.primary, fontWeight: '600' }}>
          {photoUrl ? 'change photo' : 'add a photo (required)'}
        </Text>
        {!isEdit && (
          <Text style={[type.fine, { textAlign: 'center', paddingHorizontal: space.lg }]}>
            be silly and show your true nerdy self. no judgement here.
          </Text>
        )}
      </Pressable>

      <Field label="name" placeholder="alex morgan" value={name} onChangeText={setName} />
      <Field
        label="pronouns (optional)"
        placeholder="she/her, he/him, they/them..."
        value={pronouns}
        onChangeText={setPronouns}
      />

      <View style={{ gap: space.xs }}>
        <Text style={type.sub}>school</Text>
        <View style={styles.chips}>
          {SCHOOLS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSchool(s)}
              style={[
                styles.chip,
                { borderColor: colors.primary },
                school === s && { backgroundColor: colors.primary },
              ]}>
              <Text
                style={{
                  color: school === s ? colors.onFill : colors.primary,
                  fontFamily: fontFamily.semibold,
                }}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        <Text style={type.sub}>graduation year</Text>
        <View style={styles.chips}>
          {GRAD_YEARS.map((y) => (
            <Pressable
              key={y}
              onPress={() => setGradYear(y)}
              style={[
                styles.chip,
                { borderColor: colors.primary },
                gradYear === y && { backgroundColor: colors.primary },
              ]}>
              <Text
                style={{
                  color: gradYear === y ? colors.onFill : colors.primary,
                  fontFamily: fontFamily.semibold,
                }}>
                '{String(y).slice(-2)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Field label="major" placeholder="computer science" value={major} onChangeText={setMajor} />
      <Field
        label="where you're from"
        placeholder="queens, ny"
        value={hometown}
        onChangeText={setHometown}
      />
      <Field
        label="bio (optional)"
        placeholder="a line or two about you"
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <Field
        label="favorite study spot"
        placeholder="butler 4th floor, milstein, a specific bench…"
        value={studySpot}
        onChangeText={setStudySpot}
      />
      <Field
        label="instagram (optional)"
        placeholder="handle"
        autoCapitalize="none"
        value={instagram}
        onChangeText={setInstagram}
      />
      <Field
        label="linkedin (optional)"
        placeholder="in/yourname"
        autoCapitalize="none"
        value={linkedin}
        onChangeText={setLinkedin}
      />

      {isEdit && session ? <PromptsEditor profileId={session.user.id} /> : null}

      <View style={styles.emailToggleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.body}>show my columbia email</Text>
          <Text style={type.sub}>Visible on your profile to other signed-in students.</Text>
        </View>
        <Switch
          value={showEmail ?? true}
          onValueChange={setShowEmail}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>

      <Button
        title={isEdit ? 'save' : 'continue'}
        onPress={save}
        loading={busy}
        disabled={!name.trim() || !photoUrl || !studySpot.trim() || !school || !gradYear}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  photoRow: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  emailToggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
});
