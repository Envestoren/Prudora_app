/**
 * Design tokens: 8px grid, border-radius, skygger.
 */

import { Platform } from 'react-native';

/** 8px grid spacing */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

/** Border radius – myk, premium look */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 9999,
} as const;

/** Hairline border – bruk i stedet for tykke borders */
export const hairlineWidth = Platform.OS === 'web' ? 0.5 : 1;

/** Skygge kun i lys modus – subtil og moderne */
export const cardShadowLight = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 10,
  elevation: 2,
} as const;
