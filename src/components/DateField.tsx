// Native date+time picker (iOS spinner in a sheet, Android system dialogs).
// Web gets the browser's own calendar control via DateField.web.tsx —
// Metro picks the .web file automatically on web builds.
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../lib/theme';
import { formatWhen, type DateFieldProps } from './dateFieldShared';
import { Button } from './ui';

/** Next round hour, tomorrow-ish — a sane starting point for a study session. */
function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return d;
}

export default function DateField({ label, value, onChange }: DateFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? defaultStart());

  const open = () => {
    const start = value ?? defaultStart();
    if (Platform.OS === 'android') {
      // Android has no combined mode: date dialog, then time dialog.
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        onChange: (event, day) => {
          if (event.type !== 'set' || !day) return;
          DateTimePickerAndroid.open({
            value: start,
            mode: 'time',
            onChange: (timeEvent, time) => {
              if (timeEvent.type !== 'set' || !time) return;
              const combined = new Date(day);
              combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(combined);
            },
          });
        },
      });
    } else {
      setDraft(start);
      setIosOpen(true);
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.sub}>{label}</Text>
      <Pressable onPress={open} style={styles.trigger}>
        <Text style={[type.body, !value && { color: colors.subtle }]}>{formatWhen(value)}</Text>
      </Pressable>

      {Platform.OS === 'ios' && (
        <Modal visible={iosOpen} transparent animationType="slide">
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <DateTimePicker
                value={draft}
                mode="datetime"
                display="spinner"
                minuteInterval={5}
                onChange={(_e, d) => d && setDraft(d)}
              />
              <Button
                title="Done"
                onPress={() => {
                  onChange(draft);
                  setIosOpen(false);
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    backgroundColor: colors.bg,
  },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
});
