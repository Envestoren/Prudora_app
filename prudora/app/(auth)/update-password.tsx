import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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

function parseSessionFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const hashIndex = url.indexOf('#');
    const queryIndex = url.indexOf('?');

    const hashParams = hashIndex >= 0 ? new URLSearchParams(url.substring(hashIndex + 1)) : new URLSearchParams();
    const queryParams =
      queryIndex >= 0
        ? new URLSearchParams(url.substring(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined))
        : new URLSearchParams();

    const access_token = hashParams.get('access_token') ?? queryParams.get('access_token');
    const refresh_token = hashParams.get('refresh_token') ?? queryParams.get('refresh_token');
    const type = hashParams.get('type') ?? queryParams.get('type');

    if (type === 'recovery' && access_token && refresh_token) {
      return { access_token, refresh_token };
    }
  } catch {
    // ignore
  }
  return null;
}

function parseCodeFromUrl(url: string): string | null {
  try {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;
    const hashIndex = url.indexOf('#');
    const query = url.substring(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
    const params = new URLSearchParams(query);
    return params.get('code');
  } catch {
    return null;
  }
}

function parseTokenHashFromUrl(url: string): string | null {
  try {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;
    const hashIndex = url.indexOf('#');
    const query = url.substring(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
    const params = new URLSearchParams(query);
    return params.get('token_hash');
  } catch {
    return null;
  }
}

export default function UpdatePasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const c = useDesignColors();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [focusedField, setFocusedField] = useState<'new' | 'confirm' | null>(null);
  const [lastDeepLink, setLastDeepLink] = useState<string | null>(null);

  useEffect(() => {
    const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_resolve, reject) =>
          setTimeout(() => reject(new Error(`${label} tok for lang tid.`)), ms)
        ),
      ]);
    };

    const handleUrl = async (url: string | null) => {
      if (!url) {
        setResolvingLink(false);
        return;
      }
      setLastDeepLink(url);
      setLinkError(null);
      setResolvingLink(true);
      const session = parseSessionFromUrl(url);
      if (session) {
        const { error } = await withTimeout(
          supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
          10000,
          'Validering av recovery-lenke'
        );
        if (!error) {
          setSessionReady(true);
          setResolvingLink(false);
          return;
        }
        setLinkError(error.message ?? 'Kunne ikke validere lenken.');
        setResolvingLink(false);
        return;
      }

      // Støtt også kode-baserte recovery-lenker (?code=...) som kommer fra Supabase.
      const code = parseCodeFromUrl(url);
      if (code) {
        const { error } = await withTimeout(
          supabase.auth.exchangeCodeForSession(code),
          10000,
          'Validering av recovery-kode'
        );
        if (!error) {
          setSessionReady(true);
          setResolvingLink(false);
          return;
        }
        setLinkError(error.message ?? 'Kunne ikke validere lenken.');
        setResolvingLink(false);
        return;
      }

      const tokenHash = parseTokenHashFromUrl(url);
      if (tokenHash) {
        const { error } = await withTimeout(
          supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: tokenHash,
          }),
          10000,
          'Validering av recovery-token'
        );
        if (!error) {
          setSessionReady(true);
          setResolvingLink(false);
          return;
        }
        setLinkError(error.message ?? 'Kunne ikke validere recovery-lenken.');
        setResolvingLink(false);
        return;
      }

      setLinkError('Lenken inneholder ikke gyldig recovery-informasjon.');
      setResolvingLink(false);
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // On web, Expo Linking may drop fragment/query tokens; read full href directly.
      void handleUrl(window.location.href);
    }

    Linking.getInitialURL().then(handleUrl).finally(() => setResolvingLink(false));
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  const passwordOk = newPassword.length >= 6 && newPassword === confirmPassword;

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

  async function handleUpdate() {
    if (!passwordOk || loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
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
            <ToastTitle>Passordet er lagret</ToastTitle>
          </Toast>
        ),
      });
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BlurStatusBarView edges={['top']}>
      <Box
        flex={1}
        pt={insets.top}
        pb={insets.bottom}
        style={{ backgroundColor: c.background, paddingHorizontal: spacing.lg }}
      >
        <VStack flex={1} py={32} maxWidth={420} mx="auto" width="100%" justifyContent="center">
          <Text fontSize={24} fontWeight="800" style={{ color: c.text }} mb={8} lineHeight={30}>
            Velg nytt passord
          </Text>
          <Text fontSize={15} style={{ color: c.textSecondary }} mb={24} lineHeight={22}>
            {sessionReady
              ? 'Skriv inn ditt nye passord nedenfor.'
              : resolvingLink
                ? 'Validerer lenke...'
                : 'Åpne lenken fra e-posten for å fortsette.'}
          </Text>

          {!sessionReady && linkError && (
            <VStack space="sm" mb={16}>
              <Text fontSize={12} style={{ color: '#EF4444' }}>
                {linkError}
              </Text>
              <PremiumButton
                title="Prøv igjen"
                variant="outline"
                onPress={async () => {
                  setResolvingLink(true);
                  setLinkError(null);
                  const url = await Linking.getInitialURL();
                  setLastDeepLink(url);
                  setResolvingLink(false);
                  if (!url) {
                    setLinkError('Fant ingen recovery-lenke. Åpne lenken fra e-posten på nytt.');
                  } else {
                    // Trigger URL-handler på nytt ved å åpne samme lenke internt.
                    await Linking.openURL(url);
                  }
                }}
              />
              {lastDeepLink && (
                <Text fontSize={11} style={{ color: c.textMuted }}>
                  Mottatt lenke: {lastDeepLink.slice(0, 120)}...
                </Text>
              )}
            </VStack>
          )}

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
                    autoCapitalize="none"
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
                    autoCapitalize="none"
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
                  title={loading ? 'Lagrer…' : 'Lagre nytt passord'}
                  onPress={handleUpdate}
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

