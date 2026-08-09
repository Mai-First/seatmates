// A class group chat's icon should hint at the subject, not be one generic
// cap-and-gown for every course. Course codes are "SUBJ 1234" (e.g. "COMS
// W3157") — the first token is the subject prefix.
const SUBJECT_ICONS: Record<string, string> = {
  COMS: 'hardware-chip-outline',
  MATH: 'calculator-outline',
  ECON: 'trending-up-outline',
  PSYC: 'happy-outline',
  HIST: 'time-outline',
  ENGL: 'book-outline',
  BIOL: 'leaf-outline',
  CHEM: 'flask-outline',
  PHYS: 'planet-outline',
  STAT: 'stats-chart-outline',
  PHIL: 'help-circle-outline',
  ARTH: 'color-palette-outline',
  MUSI: 'musical-notes-outline',
  FILM: 'film-outline',
  POLS: 'megaphone-outline',
  ANTH: 'globe-outline',
  SOCI: 'people-outline',
};

/** Falls back to the generic school icon for any subject not in the map
 * above — keeps a widened catalog (README) from ever rendering nothing. */
export function subjectIcon(courseCode: string): string {
  const subject = courseCode.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  return SUBJECT_ICONS[subject] ?? 'school-outline';
}
