import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import {
  Box,
  Text,
  VStack,
  Heading,
  Input,
  InputField,
  Pressable,
  useToast,
  Toast,
  ToastTitle,
  ToastDescription,
} from '@gluestack-ui/themed';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, cardShadowLight, hairlineWidth } from '@/constants/design';

const isEmailFormat = (s: string) => {
  const t = s.trim();
  const at = t.indexOf('@');
  return at > 0 && at < t.length - 1 && t.includes('@');
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();
  const { signIn, resetPasswordForEmail } = useAuth();
  const c = useDesignColors();
  const isDark = c.background === '#000000';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const emailOk = email.trim().length > 0 && isEmailFormat(email);
  const showEmailError = emailTouched && email.trim().length > 0 && !emailOk;

  const handleForgotPassword = async () => {
    if (!emailOk) {
      toast.show({
        placement: 'bottom',
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Skriv inn e-postadressen din</ToastTitle>
            <ToastDescription>Fyll inn e-postadressen over først.</ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    setResetting(true);
    const { error } = await resetPasswordForEmail(email.trim());
    setResetting(false);
    if (error) {
      toast.show({
        placement: 'bottom',
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke sende e-post</ToastTitle>
            <ToastDescription>{error.message}</ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    toast.show({
      placement: 'bottom',
      render: ({ id }) => (
        <Toast nativeID={`toast-${id}`} action="success" variant="solid">
          <ToastTitle>E-post sendt</ToastTitle>
          <ToastDescription>Sjekk innboksen din for en lenke til å lage nytt passord.</ToastDescription>
        </Toast>
      ),
    });
  };

  const handleLogin = async () => {
    if (!emailOk || !password) return;
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      toast.show({
        placement: 'bottom',
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Innlogging feilet</ToastTitle>
            <ToastDescription>{error.message}</ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    router.replace('/(tabs)');
  };

  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const baseInputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: hairlineWidth,
    borderColor: c.border,
  };

  const getInputStyle = (field: 'email' | 'password') => [
    baseInputStyle,
    focusedField === field && {
      borderColor: c.primary,
      borderWidth: 2,
    },
  ];

  return (
    <BlurStatusBarView edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 24) + 280,
            paddingHorizontal: 24,
            justifyContent: 'center',
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
            <Box flex={1} style={{ backgroundColor: c.background }}>
              <VStack space="2xl" py={40} maxWidth={420} mx="auto" width="100%">
              {/* Hero */}
              <VStack space="md" alignItems="center" pb={8}>
                <Box
                  w={64}
                  h={64}
                  alignItems="center"
                  justifyContent="center"
                  style={{ backgroundColor: c.primary, borderRadius: radius.xl }}
                >
                  <Text fontSize={32}>🛒</Text>
                </Box>
                <VStack space="xs" alignItems="center">
                  <Heading size="3xl" style={{ color: c.text, fontWeight: '800' }} textAlign="center">
                    Prudora
                  </Heading>
                  <Text
                    fontSize={16}
                    style={{ color: c.textSecondary }}
                    textAlign="center"
                    px={16}
                    lineHeight={24}
                  >
                    Sammenlign matvarepriser på tvers av butikker
                  </Text>
                </VStack>
              </VStack>

              {/* Innloggingskort */}
              <Box
                p={24}
                style={[
                  {
                    backgroundColor: c.surface,
                    borderRadius: radius.xl,
                    borderWidth: hairlineWidth,
                    borderColor: c.border,
                  },
                  !isDark && cardShadowLight,
                ]}
              >
                <VStack space="md">
                  <VStack space="xs" pb={4}>
                    <Text fontSize={24} fontWeight="800" style={{ color: c.text }} lineHeight={30}>
                      Logg inn
                    </Text>
                    <Text fontSize={14} style={{ color: c.textSecondary }} lineHeight={20}>
                      Bruk e-post og passord for å gå videre
                    </Text>
                  </VStack>

                  <VStack space="xs">
                    <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>
                      E-post
                    </Text>
                    <Input variant="outline" size="lg" style={getInputStyle('email')}>
                      <InputField
                        placeholder="din@epost.no"
                        placeholderTextColor={c.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => {
                          setEmailTouched(true);
                          setFocusedField((prev) => (prev === 'email' ? null : prev));
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        style={{ color: c.text }}
                      />
                    </Input>
                    {showEmailError && (
                      <Text fontSize={12} style={{ color: '#EF4444' }}>
                        E-post må inneholde @ og være gyldig
                      </Text>
                    )}
                  </VStack>

                  <VStack space="xs">
                    <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>
                      Passord
                    </Text>
                    <Input variant="outline" size="lg" style={getInputStyle('password')}>
                      <InputField
                        placeholder="Passord"
                        placeholderTextColor={c.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField((prev) => (prev === 'password' ? null : prev))}
                        secureTextEntry
                        style={{ color: c.text }}
                      />
                    </Input>
                    <Box mt={4}>
                      <Pressable onPress={handleForgotPassword} disabled={resetting}>
                        <Text fontSize={13} style={{ color: c.primary, fontWeight: '600' }}>
                          {resetting ? 'Sender…' : 'Glemt passord?'}
                        </Text>
                      </Pressable>
                    </Box>
                  </VStack>

                  <Box mt={4}>
                    <PremiumButton
                      title={loading ? 'Logger inn…' : 'Logg inn'}
                      onPress={handleLogin}
                      disabled={!emailOk || !password || loading}
                    />
                  </Box>
                </VStack>
              </Box>

              <Text fontSize={14} style={{ color: c.textSecondary }} textAlign="center" lineHeight={20}>
                Har du ikke konto?{' '}
                <Link href="/(auth)/register">
                  <Text style={{ color: c.primary, fontWeight: '600' }}>Registrer deg</Text>
                </Link>
              </Text>
              </VStack>
            </Box>
          </ScrollView>
      </KeyboardAvoidingView>
    </BlurStatusBarView>
  );
}

const styles = StyleSheet.create({});
