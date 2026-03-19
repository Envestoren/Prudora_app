import { useTheme } from '@/lib/theme-context';

/**
 * BNA-compatible hook name expected by generated components.
 * Returns resolved scheme from existing Prudora theme context.
 */
export function useColorScheme(): 'light' | 'dark' {
  const { resolvedScheme } = useTheme();
  return resolvedScheme;
}

