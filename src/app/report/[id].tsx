import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { radius, space, useTheme } from '../../lib/theme';

type Attachment = { uri: string; name: string; type: 'image' | 'file'; mimeType: string };

/** Files a report with an optional screenshot/file as evidence — stored in
 * the private report-evidence bucket, visible only to the reporter and
 * admins reviewing it. */
export default function ReportProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  const reported = useQuery({
    queryKey: ['profile-name', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('full_name').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setAttachment({ uri: asset.uri, name: 'evidence.jpg', type: 'image', mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    setAttachment({
      uri: asset.uri,
      name: asset.name,
      type: 'file',
      mimeType: asset.mimeType ?? 'application/octet-stream',
    });
  };

  const submit = useMutation({
    mutationFn: async () => {
      let attachment_path: string | null = null;
      let attachment_type: 'image' | 'file' | null = null;
      let attachment_name: string | null = null;

      if (attachment) {
        const bytes = await (await fetch(attachment.uri)).arrayBuffer();
        const path = `${session!.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${attachment.name}`;
        const { error: upErr } = await supabase.storage
          .from('report-evidence')
          .upload(path, bytes, { contentType: attachment.mimeType });
        if (upErr) throw upErr;
        attachment_path = path;
        attachment_type = attachment.type;
        attachment_name = attachment.type === 'file' ? attachment.name : null;
      }

      const { error } = await supabase.from('reports').insert({
        reporter_id: session!.user.id,
        reported_id: id,
        reason: reason.trim() || null,
        attachment_path,
        attachment_type,
        attachment_name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify('thanks', 'we got it. the team reviews every report.');
      router.back();
    },
    onError: (e) => notify('could not report', e.message),
  });

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      keyboardShouldPersistTaps="handled">
      <Text style={type.sub}>
        reporting {reported.data?.full_name ?? 'this person'}. tell us what happened. a screenshot
        or file helps us review it faster, but isn’t required.
      </Text>
      <Field
        label="what happened (optional)"
        placeholder="describe what happened..."
        value={reason}
        onChangeText={setReason}
        multiline
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />

      {attachment ? (
        <View style={[styles.attachmentPreview, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {attachment.type === 'image' ? (
            <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} contentFit="cover" />
          ) : (
            <View style={styles.attachmentFileRow}>
              <Ionicons name="document-outline" size={20} color={colors.primary} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {attachment.name}
              </Text>
            </View>
          )}
          <Pressable
            style={[styles.removeBadge, { backgroundColor: colors.bg }]}
            onPress={() => setAttachment(null)}>
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Pressable
            style={[styles.attachButton, { borderColor: colors.border }]}
            onPress={pickFromLibrary}>
            <Ionicons name="image-outline" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary }}>add screenshot</Text>
          </Pressable>
          <Pressable style={[styles.attachButton, { borderColor: colors.border }]} onPress={pickFile}>
            <Ionicons name="attach-outline" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary }}>add file</Text>
          </Pressable>
        </View>
      )}

      <Button title="submit report" onPress={() => submit.mutate()} loading={submit.isPending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
  },
  attachmentPreview: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  attachmentImage: { width: '100%', height: 180 },
  attachmentFileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  removeBadge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
