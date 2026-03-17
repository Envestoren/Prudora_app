import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

type Edges = 'top' | 'bottom' | ('top' | 'bottom')[];

/**
 * Innholdet vises gjennom safe area; kun statuslinje- og bunnområdet får blur
 * slik at statusbaren er lett å se. Bruker useTheme().resolvedScheme (useColorScheme).
 */
export function BlurStatusBarView({
  children,
  edges = ['top'],
}: {
  children: ReactNode;
  edges?: Edges;
}) {
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const backgroundColor = Colors[resolvedScheme].background;
  const edgeList = Array.isArray(edges) ? edges : [edges];

  return (
    <View style={{ flex: 1, backgroundColor }}>
      {edgeList.includes('top') && insets.top > 0 && (
        <BlurView
          intensity={Platform.OS === 'web' ? 50 : 60}
          tint="dark"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top,
            zIndex: 1,
          }}
          pointerEvents="none"
        />
      )}
      {edgeList.includes('bottom') && insets.bottom > 0 && (
        <BlurView
          intensity={Platform.OS === 'web' ? 50 : 60}
          tint="dark"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: insets.bottom,
            zIndex: 1,
          }}
          pointerEvents="none"
        />
      )}
      <View style={{ flex: 1 }} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}
