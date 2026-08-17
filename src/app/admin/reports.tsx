import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { Avatar, Empty, Loading } from '../../components/ui';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { radius, space, useTheme } from '../../lib/theme';
import type { AdminReport } from '../../lib/types';

/** report-evidence is a private bucket -- resolve a short-lived signed URL
 * per attachment rather than a plain public one. */
function ReportAttachment({ report }: { report: AdminReport }) {
  const { colors } = useTheme();
  const signed = useQuery({
    queryKey: ['report-evidence', report.attachment_path],
    enabled: !!report.attachment_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('report-evidence')
        .createSignedUrl(report.attachment_path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!report.attachment_path || !signed.data) return null;

  if (report.attachment_type === 'image') {
    return (
      <Pressable onPress={() => Linking.openURL(signed.data)}>
        <Image
          source={{ uri: signed.data }}
          style={{ width: '100%', height: 160, borderRadius: radius.md }}
          contentFit="cover"
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      onPress={() => Linking.openURL(signed.data)}>
      <Ionicons name="document-outline" size={18} color={colors.primary} />
      <Text style={{ color: colors.primary }}>{report.attachment_name ?? 'attached file'}</Text>
    </Pressable>
  );
}

export default function AdminReports() {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();

  const reports = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async (): Promise<AdminReport[]> => {
      const { data, error } = await supabase.rpc('list_reports');
      if (error) throw error;
      return data;
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('dismiss_report', { p_report: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reports'] }),
    onError: (e) => notify('could not dismiss', e.message),
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_remove_user', { p_user: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reports'] }),
    onError: (e) => notify('could not remove', e.message),
  });

  const confirmRemove = async (report: AdminReport) => {
    const ok = await confirm(
      `remove ${report.reported_name ?? 'this user'}?`,
      'deletes their account, matches, messages, and hosted sessions. cannot be undone.',
      'remove forever',
      true,
    );
    if (ok) removeUser.mutate(report.reported_id);
  };

  if (reports.isLoading) return <Loading />;

  if (!reports.data?.length) {
    return <Empty icon="shield-checkmark-outline" title="no open reports" body="you’re all caught up." />;
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={reports.data}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      renderItem={({ item }) => (
        <View style={{ gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.md }}>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
            onPress={() => router.push(`/profile/${item.reported_id}`)}>
            <Avatar uri={item.reported_photo} name={item.reported_name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{item.reported_name ?? 'unnamed'}</Text>
              <Text style={type.fine}>
                reported by {item.reporter_name ?? 'someone'} ·{' '}
                {new Date(item.created_at)
                  .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  .toLowerCase()}
              </Text>
            </View>
          </Pressable>
          {item.reason ? <Text style={type.body}>{item.reason}</Text> : null}
          <ReportAttachment report={item} />
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <Pressable onPress={() => dismiss.mutate(item.id)} disabled={dismiss.isPending}>
              <Text style={{ color: colors.primary }}>dismiss</Text>
            </Pressable>
            <Pressable onPress={() => confirmRemove(item)} disabled={removeUser.isPending}>
              <Text style={{ color: colors.danger }}>remove user</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}
