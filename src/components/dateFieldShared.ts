// Shared by DateField.tsx (native) and DateField.web.tsx. Lives in its own
// file because on web `./DateField` resolves to the .web variant — a re-export
// from there would import itself forever.

export type DateFieldProps = {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
};

export function formatWhen(d: Date | null): string {
  if (!d) return 'pick a date & time';
  return (
    d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  ).toLowerCase();
}
