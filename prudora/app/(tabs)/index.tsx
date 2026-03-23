import { Box, Text, VStack, HStack, Pressable } from '@gluestack-ui/themed';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { useDesignColors } from '@/hooks/use-design-colors';
import { useTheme } from '@/lib/theme-context';
import { spacing, radius, cardShadowLight, hairlineWidth } from '@/constants/design';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const c = useDesignColors();
  const isDark = useTheme().resolvedScheme === 'dark';
  const router = useRouter();

  return (
    <BlurStatusBarView edges={['top']}>
      <Box flex={1} pt={insets.top} pb={insets.bottom} style={[styles.container, { backgroundColor: c.background, paddingHorizontal: spacing.lg }]}>
        <VStack flex={1} space="xl" py={24}>
          <VStack space="xs" pb={24}>
            <Text
              fontSize={28}
              fontWeight="800"
              color={c.text}
              lineHeight={34}
            >
              Prudora
            </Text>
            <Text
              fontSize={16}
              color={c.textSecondary}
              lineHeight={24}
            >
              Sammenlign matvarepriser på tvers av butikker
            </Text>
          </VStack>

          <VStack space="lg" flex={1}>
            <Pressable
              onPress={() => router.push('/(tabs)/explore')}
              style={[
                { backgroundColor: c.surface, borderRadius: radius.xl, padding: 20, borderWidth: hairlineWidth, borderColor: c.border },
                !isDark && cardShadowLight,
              ]}
              sx={{ _pressed: { opacity: 0.9 } }}
            >
              <HStack space="md" alignItems="center">
                <Box w={48} h={48} alignItems="center" justifyContent="center" style={{ backgroundColor: c.primary, borderRadius: radius.full }}>
                  <Text fontSize={24}>📋</Text>
                </Box>
                <VStack flex={1} space="xs">
                  <Text
                    fontSize={18}
                    fontWeight="700"
                    color={c.text}
                  >
                    Handlelister
                  </Text>
                  <Text fontSize={14} color={c.textSecondary} lineHeight={20}>
                    Bygg lister og sammenlign totalpris
                  </Text>
                </VStack>
                <Text color={c.textMuted}>›</Text>
              </HStack>
            </Pressable>

            <Pressable
              onPress={() => {}}
              style={[
                { backgroundColor: c.surface, borderRadius: radius.xl, padding: 20, borderWidth: hairlineWidth, borderColor: c.border },
                !isDark && cardShadowLight,
              ]}
              sx={{ _pressed: { opacity: 0.9 } }}
            >
              <HStack space="md" alignItems="center">
                <Box w={48} h={48} alignItems="center" justifyContent="center" style={{ backgroundColor: c.primary, borderRadius: radius.full }}>
                  <Text fontSize={24}>📍</Text>
                </Box>
                <VStack flex={1} space="xs">
                  <Text
                    fontSize={18}
                    fontWeight="700"
                    color={c.text}
                  >
                    Nærliggende butikker
                  </Text>
                  <Text fontSize={14} color={c.textSecondary} lineHeight={20}>
                    Se butikker i nærheten sortert på avstand
                  </Text>
                </VStack>
                <Text color={c.textMuted}>›</Text>
              </HStack>
            </Pressable>
          </VStack>

          {profile && (
            <Box pt={16}>
              <Text fontSize={14} color={c.textSecondary} lineHeight={20}>
                Innlogget som {profile.first_name} {profile.last_name} ({profile.age} år)
              </Text>
              <Box mt={12}>
                <PremiumButton
                  variant="outline"
                  title="Logg ut"
                  onPress={() => signOut()}
                />
              </Box>
            </Box>
          )}

          <Text
            fontSize={12}
            color={c.textMuted}
            textAlign="center"
            pb={8}
            lineHeight={18}
          >
            Mer funksjonalitet kommer snart
          </Text>
        </VStack>
      </Box>
    </BlurStatusBarView>
  );
}

const styles = StyleSheet.create({
  container: {},
});
