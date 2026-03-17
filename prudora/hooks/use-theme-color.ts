/**
 * Returnerer farge basert på aktiv tema.
 * Bruker useTheme().resolvedScheme når tilgjengelig (respekterer brukerens valg),
 * ellers useColorScheme fra react-native.
 */
import { useContext } from 'react';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';
import { ThemeContext } from '@/lib/theme-context';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const themeCtx = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  const theme = themeCtx?.resolvedScheme ?? systemScheme ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
