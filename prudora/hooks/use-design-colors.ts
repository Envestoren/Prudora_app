/**
 * Returnerer designfarger basert på useTheme().resolvedScheme
 * (som bruker useColorScheme fra react-native når preferanse er 'system').
 */
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

export function useDesignColors() {
  const { resolvedScheme } = useTheme();
  return Colors[resolvedScheme];
}
