/**
 * Design system colors – design_dark.md / design_light.md.
 * Primary: #4F6F52, Secondary: #86A789, Neutral base: #F8FAF8.
 * Light/Dark støttes via useTheme().resolvedScheme.
 */

import { Platform } from 'react-native';

/** Primærfarge – rik jordfarge for interaktive elementer */
export const PRIMARY = '#4F6F52';
/** Sekundærfarge – harmonisk balanse for støtteelementer */
export const SECONDARY = '#86A789';
/** Nøytral bakgrunn – ren og tilgjengelig */
export const NEUTRAL_BASE = '#F8FAF8';

export const Colors = {
  light: {
    /** Hovedbakgrunn – design neutral base */
    background: NEUTRAL_BASE,
    /** Sekundære flater (kort, inputs, etc.) */
    surface: '#FFFFFF',
    text: '#1A1F1A',
    textSecondary: '#4A5D4A',
    textMuted: '#6B7B6B',
    /** Hairline border – svart med lav opacity */
    border: 'rgba(0,0,0,0.06)',
    tint: PRIMARY,
    icon: '#4A5D4A',
    tabIconDefault: '#6B7B6B',
    tabIconSelected: PRIMARY,
    primary: PRIMARY,
    primaryMuted: '#E8F0E9',
    secondary: SECONDARY,
    secondaryMuted: '#D4E2D5',
  },
  dark: {
    /** Mørk bakgrunn – dypt mørk med subtil grønn tone */
    background: '#0D1210',
    /** Kort/elementer – lett hevet fra bakgrunn */
    surface: '#1A211C',
    text: '#F8FAF8',
    textSecondary: '#B8C5B9',
    textMuted: '#7A8B7C',
    /** Hairline border – hvit med lav opacity */
    border: 'rgba(255,255,255,0.08)',
    tint: SECONDARY,
    icon: '#B8C5B9',
    tabIconDefault: '#7A8B7C',
    tabIconSelected: SECONDARY,
    primary: PRIMARY,
    primaryMuted: '#2D3B2F',
    secondary: SECONDARY,
    secondaryMuted: '#3D4F40',
  },
};

/** Manrope – brukes på tvers av alle tekstelementer */
export const Fonts = Platform.select({
  ios: {
    sans: 'Manrope',
    serif: 'ui-serif',
    rounded: 'Manrope',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Manrope',
    serif: 'serif',
    rounded: 'Manrope',
    mono: 'monospace',
  },
  web: {
    sans: "Manrope, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "Manrope, 'SF Pro Rounded', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});
