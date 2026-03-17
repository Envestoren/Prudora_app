/**
 * Premium design system colors.
 * Light/Dark mode støttes via useTheme().resolvedScheme (som bruker useColorScheme fra react-native når system).
 */

import { Platform } from 'react-native';

/** Aksentfarge – dyp indigo/lilla for interaktive elementer */
export const ACCENT = '#6366F1';
export const ACCENT_MUTED_LIGHT = '#EEF2FF';
export const ACCENT_MUTED_DARK = '#312E81';

export const Colors = {
  light: {
    /** Hovedbakgrunn */
    background: '#FFFFFF',
    /** Sekundære flater (kort, inputs, etc.) */
    surface: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    /** Hairline border – svart med lav opacity */
    border: 'rgba(0,0,0,0.06)',
    tint: ACCENT,
    icon: '#6B7280',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: ACCENT,
    primary: ACCENT,
    primaryMuted: ACCENT_MUTED_LIGHT,
  },
  dark: {
    /** Ekte sort for OLED */
    background: '#000000',
    /** Kort/elementer – lett hevet fra bakgrunn */
    surface: '#1C1C1E',
    text: '#F9FAFB',
    textSecondary: '#D1D5DB',
    textMuted: '#9CA3AF',
    /** Hairline border – hvit med lav opacity */
    border: 'rgba(255,255,255,0.08)',
    tint: '#818CF8',
    icon: '#D1D5DB',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#818CF8',
    primary: '#818CF8',
    primaryMuted: ACCENT_MUTED_DARK,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
