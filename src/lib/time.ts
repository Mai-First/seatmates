// Compact, Instagram-style relative and day labels — lowercase everywhere,
// matching the rest of the app's copy.

export function relativeShort(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w`;
  return new Date(iso)
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toLowerCase();
}

/** Day-divider label for a message list — "today" / "yesterday" / weekday /
 *  short date, based on calendar days rather than a rolling 24h window. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase();
  }
  return d
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    .toLowerCase();
}
