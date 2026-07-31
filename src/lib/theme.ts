// Shared, additive-only (PLAN §7 rule 3).
// Color, radius, space and type all live here — nothing else in the app
// should hardcode a hex value, a font size, or a spacing number.
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export type Scheme = 'light' | 'dark';

const palette = {
  light: {
    primary: '#1D4F91', // Columbia blue, kept as the app's one inherited accent
    primaryPressed: '#163C70',
    accent: '#75AADB',
    accentSoft: '#E8F1FA',
    warm: '#B5502E', // new secondary accent — likes, hero highlights
    warmSoft: '#F5E4DB',
    bg: '#FBF9F6', // warm off-white, not stark white
    surface: '#F2EEE7',
    card: '#FFFFFF',
    text: '#221E1A',
    subtle: '#6E665D',
    border: '#E5DFD5',
    danger: '#C33D22',
    success: '#3D8A5B',
    white: '#FFFFFF',
    // Foreground for anything sitting ON a primary/warm/danger fill. Light
    // mode: white. Dark mode those fills are *light* colours, so white-on-them
    // is ~1.9:1 — unreadable. The design's dark swatches label themselves with
    // the near-black, so that's what goes on top.
    onFill: '#FFFFFF',
    // Photo-legibility gradient on cards — transparent at the top so the
    // photo shows through, opaque behind the name. Rendered with
    // expo-linear-gradient; a flat fill here would band hard across the photo.
    scrim: ['rgba(20,16,12,0)', 'rgba(20,16,12,0.72)'] as [string, string],
  },
  dark: {
    primary: '#8FB4E3',
    primaryPressed: '#B2CBEE',
    accent: '#4D739F',
    accentSoft: '#22314A',
    warm: '#E28E66',
    warmSoft: '#3B291F',
    bg: '#17140F',
    surface: '#211D17',
    card: '#252019',
    text: '#F3EEE6',
    subtle: '#A79D8F',
    border: '#3A342B',
    danger: '#E2694B',
    success: '#63B283',
    white: '#FFFFFF',
    onFill: '#17140F',
    scrim: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)'] as [string, string],
  },
} as const;

export const radius = { sm: 8, md: 12, lg: 20, xl: 28, full: 999 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// Typography pass: Instrument Sans for all UI text, Instrument Serif
// (italic) as a single confident accent for hero details — the shared-class
// line on a swipe card, celebration copy. Both ship as Expo Google Font
// packages and are loaded in app/_layout.tsx; these names are the keys
// useFonts() registers them under.
const fontUI = 'InstrumentSans_400Regular';
const fontUIMedium = 'InstrumentSans_500Medium';
const fontUISemiBold = 'InstrumentSans_600SemiBold';
const fontUIBold = 'InstrumentSans_700Bold';
const fontAccent = 'InstrumentSerif_400Regular_Italic';

export const fontFamily = {
  ui: fontUI,
  medium: fontUIMedium,
  semibold: fontUISemiBold,
  bold: fontUIBold,
  accent: fontAccent,
};

// RN maps fontWeight onto a *family*, so a custom family plus a weight can
// double-bold on Android. The family carries the weight; keep these free of
// fontWeight and let the family name do the work.
function buildType(c: (typeof palette)['light' | 'dark']) {
  return {
    // Card hero name (Swipe) and other single big moments.
    display: { fontFamily: fontUIBold, fontSize: 34, letterSpacing: -0.4, color: c.text },
    title: { fontFamily: fontUIBold, fontSize: 26, letterSpacing: -0.2, color: c.text },
    h2: { fontFamily: fontUISemiBold, fontSize: 19, color: c.text },
    body: { fontFamily: fontUI, fontSize: 16, color: c.text, lineHeight: 22 },
    sub: { fontFamily: fontUI, fontSize: 14, color: c.subtle, lineHeight: 19 },
    tiny: {
      fontFamily: fontUISemiBold,
      fontSize: 11,
      color: c.subtle,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
    },
    // Same size/colour as `tiny` but left in sentence case — for the short
    // explanatory lines under forms, where SHOUTING A WHOLE SENTENCE reads badly.
    fine: { fontFamily: fontUI, fontSize: 12, color: c.subtle, lineHeight: 16 },
    // The one serif moment — used sparingly (shared-class hero line, match copy).
    accent: { fontFamily: fontAccent, fontSize: 19, color: c.text },
  };
}

// Legacy static exports so any file not yet migrated to useTheme() still
// compiles during the transition; new code should prefer useTheme().
export const colors = palette.light;
export const type = buildType(palette.light);

type ThemeValue = {
  scheme: Scheme;
  colors: (typeof palette)['light' | 'dark'];
  type: ReturnType<typeof buildType>;
  radius: typeof radius;
  space: typeof space;
  override: Scheme | null;
  setOverride: (s: Scheme | null) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

const OVERRIDE_KEY = 'seatmates.appearance';

/** Wrap the app once, in app/_layout.tsx, inside AuthProvider. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [override, setOverrideState] = useState<Scheme | null>(null); // set from Account → Appearance

  // An appearance choice that forgets itself on relaunch reads as a bug.
  useEffect(() => {
    AsyncStorage.getItem(OVERRIDE_KEY).then((v) => {
      if (v === 'light' || v === 'dark') setOverrideState(v);
    });
  }, []);

  const setOverride = (s: Scheme | null) => {
    setOverrideState(s);
    if (s) AsyncStorage.setItem(OVERRIDE_KEY, s);
    else AsyncStorage.removeItem(OVERRIDE_KEY);
  };

  const scheme: Scheme = override ?? (system === 'dark' ? 'dark' : 'light');

  const value = useMemo<ThemeValue>(() => {
    const c = palette[scheme];
    return { scheme, colors: c, type: buildType(c), radius, space, override, setOverride };
  }, [scheme, override]);

  return React.createElement(ThemeContext.Provider, { value }, children);
}

/** Read the active theme. Every screen/component should use this instead of
 *  importing `colors`/`type` directly, so it repaints on scheme change. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
