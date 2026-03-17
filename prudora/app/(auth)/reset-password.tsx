import { useState, useEffect } from 'react';
import * as Linking from 'expo-linking';
import {
  Box,
  Text,
  VStack,
  Input,
  InputField,
  useToast,
  Toast,
  ToastTitle,
  ToastDescription,
} from '@gluestack-ui/themed';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { useDesignColors } from '@/hooks/use-design-colors';
import { supabase } from '@/lib/supabase';
import { spacing, radius, hairlineWidth } from '@/constants/design';

/**
 * Håndterer URL fra e-postlenke (type=recovery) og lar bruker angi nytt passord.
 * Legg til prudora://reset-password i Supabase Dashboard > Auth > URL Configuration > Redirect URLs.
 */
function parseSessionFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return null;
    const fragment = url.substring(hashIndex + 1);
    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const type = params.get('type');
    if (type === 'recovery' && access_token && refresh_token) {
      return { access_token, refresh_token };
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const c = useDesignColors();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const session = parseSessionFromUrl(url);
      if (session) {
        const { error } = await supabase.auth.setSession({
          access_token: session.access_token!,
          refresh_token: session.refresh_token!,
        });
        if (!error) setSessionReady(true);
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  const passwordOk = newPassword.length >= 6 && newPassword === confirmPassword;

  async function handleReset() {
    if (!passwordOk || loading) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke oppdatere passord</ToastTitle>
            <ToastDescription>{error.message}</ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    toast.show({
      placement: 'top',
      containerStyle: { marginTop: insets.top },
      render: ({ id }) => (
        <Toast nativeID={`toast-${id}`} action="success" variant="solid">
          <ToastTitle>Passord er oppdatert</ToastTitle>
        </Toast>
      ),
    });
    router.replace('/(tabs)');
  }

  const [focusedField, setFocusedField] = useState<'new' | 'confirm' | null>(null);

  const baseInputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: hairlineWidth,
    borderColor: c.border,
  };

  const getInputStyle = (field: 'new' | 'confirm') => [
    baseInputStyle,
    focusedField === field && {
      borderColor: c.primary,
      borderWidth: 2,
    },
  ];

  return (
    <BlurStatusBarView edges={['top']}>
      <Box
        flex={1}
        pt={insets.top}
        pb={insets.bottom}
        style={{ backgroundColor: c.background, paddingHorizontal: spacing.lg }}
      >
        <VStack flex={1} py={32} maxWidth={400} mx="auto" width="100%" justifyContent="center">
          <Text fontSize={24} fontWeight="800" style={{ color: c.text }} mb={8} lineHeight={30}>
            Angi nytt passord
          </Text>
          <Text fontSize={15} style={{ color: c.textSecondary }} mb={24} lineHeight={22}>
            {sessionReady
              ? 'Skriv inn ditt nye passord nedenfor.'
              : 'Åpne lenken fra e-posten for å tilbakestille passordet ditt.'}
          </Text>

          {sessionReady && (
            <VStack space="md">
              <VStack space="xs">
                <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>
                  Nytt passord
                </Text>
                <Input variant="outline" size="lg" style={getInputStyle('new')}>
                  <InputField
                    placeholder="Minst 6 tegn"
                    placeholderTextColor={c.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onFocus={() => setFocusedField('new')}
                    onBlur={() => setFocusedField((prev) => (prev === 'new' ? null : prev))}
                    secureTextEntry
                    style={{ color: c.text }}
                  />
                </Input>
                {newPassword.length > 0 && newPassword.length < 6 && (
                  <Text fontSize={12} style={{ color: '#EF4444' }}>
                    Passordet må være minst 6 tegn
                  </Text>
                )}
              </VStack>

              <VStack space="xs">
                <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>
                  Bekreft passord
                </Text>
                <Input variant="outline" size="lg" style={getInputStyle('confirm')}>
                  <InputField
                    placeholder="Skriv passordet på nytt"
                    placeholderTextColor={c.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField('confirm')}
                    onBlur={() => setFocusedField((prev) => (prev === 'confirm' ? null : prev))}
                    secureTextEntry
                    style={{ color: c.text }}
                  />
                </Input>
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <Text fontSize={12} style={{ color: '#EF4444' }}>
                    Passordene matcher ikke
                  </Text>
                )}
              </VStack>

              <Box mt={8}>
                <PremiumButton
                  title={loading ? 'Oppdaterer…' : 'Oppdater passord'}
                  onPress={handleReset}
                  disabled={!passwordOk || loading}
                />
              </Box>
            </VStack>
          )}
        </VStack>
      </Box>
    </BlurStatusBarView>
  );
}
