import { Colors as DesignColors } from '@/constants/theme';

/**
 * BNA-compatible color export expected by generated components.
 * Reuses existing project design colors to keep styling consistent.
 */
export const Colors = {
  light: {
    ...DesignColors.light,
    card: DesignColors.light.surface,
    textMuted: DesignColors.light.textMuted,
    /** BNA / charts – sekundær tekst og hjelpelinjer */
    mutedForeground: DesignColors.light.textSecondary,
    primary: DesignColors.light.primary,
    red: '#DC2626',
    green: '#16A34A',
  },
  dark: {
    ...DesignColors.dark,
    card: DesignColors.dark.surface,
    textMuted: DesignColors.dark.textMuted,
    mutedForeground: DesignColors.dark.textMuted,
    primary: DesignColors.dark.primary,
    red: '#EF4444',
    green: '#22C55E',
  },
} as const;

