import { Box, Text, VStack } from '@gluestack-ui/themed';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing } from '@/constants/design';

export default function BekreftEpostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refreshSession } = useAuth();
  const c = useDesignColors();

  const handleLoggInn = async () => {
    const confirmed = await refreshSession();
    if (confirmed) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  };

  return (
    <BlurStatusBarView edges={['top']}>
      <Box
        flex={1}
        pt={insets.top}
        pb={insets.bottom}
        style={{ backgroundColor: c.background, paddingHorizontal: spacing.lg }}
      >
        <VStack flex={1} space="xl" py={32} maxWidth={400} mx="auto" width="100%" justifyContent="center">
          <VStack space="md" alignItems="center">
            <Text fontSize={24} fontWeight="800" style={{ color: c.text }} textAlign="center" lineHeight={30}>
              Sjekk e-posten din
            </Text>
            <Text
              fontSize={16}
              style={{ color: c.textSecondary }}
              textAlign="center"
              lineHeight={24}
            >
              Vi har sendt en bekreftelseslenke til{' '}
              <Text fontWeight="600">{user?.email ?? ''}</Text>. Klikk på lenken i e-posten for å aktivere kontoen.
            </Text>
            <Text fontSize={14} style={{ color: c.textMuted }} textAlign="center" lineHeight={20}>
              Etter at du har bekreftet, trykk nedenfor for å logge inn.
            </Text>
            <Box mt={16}>
              <PremiumButton title="Logg inn" onPress={handleLoggInn} />
            </Box>
          </VStack>
        </VStack>
      </Box>
    </BlurStatusBarView>
  );
}
