// Shared, additive-only (PLAN §7 rule 3).
export const colors = {
  primary: '#1D4F91', // Columbia's darker blue
  accent: '#75AADB', // Columbia blue
  accentSoft: '#E8F1FA',
  bg: '#FFFFFF',
  surface: '#F4F7FB',
  text: '#101828',
  subtle: '#667085',
  border: '#E4E7EC',
  danger: '#D92D20',
  success: '#12B76A',
  white: '#FFFFFF',
};

export const radius = { sm: 8, md: 12, lg: 20, full: 999 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  sub: { fontSize: 14, color: colors.subtle },
  tiny: { fontSize: 12, color: colors.subtle },
};
