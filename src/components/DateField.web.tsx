// Web variant: the browser's native calendar/time control. Rendering a raw
// <input> is fine here — react-native-web mounts into the normal DOM.
import { Text, View } from 'react-native';
import { fontFamily, space, useTheme } from '../lib/theme';
import type { DateFieldProps } from './dateFieldShared';

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DateField({ label, value, onChange }: DateFieldProps) {
  const { colors, type, scheme } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.sub}>{label}</Text>
      <input
        type="datetime-local"
        value={value ? toLocalInputValue(value) : ''}
        onChange={(e) => {
          const d = new Date(e.currentTarget.value);
          if (!Number.isNaN(+d)) onChange(d);
        }}
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: '12px 16px',
          fontSize: 16,
          color: colors.text,
          background: colors.card,
          fontFamily: fontFamily.ui,
          // makes the browser's own calendar picker render dark too
          colorScheme: scheme,
        }}
      />
    </View>
  );
}
