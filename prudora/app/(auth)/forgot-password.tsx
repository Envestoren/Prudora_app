import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { useAuth } from '@/lib/auth-context';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, hairlineWidth } from '@/constants/design';

const isEmailFormat = (s: string) => {
  const t = s.trim();
  const at = t.indexOf('@');
  return at > 0 && at < t.length - 1 && t.includes('@');
};

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const c = useDesignColors();
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);

  const emailOk = email.trim().length > 0 && isEmailFormat(email);

  const baseInputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: hairlineWidth,
    borderColor: c.border,
  };

  const inputStyle = [
    baseInputStyle,
    focused && {
      borderColor: c.primary,
      borderWidth: 2,
    },
  ];

  async function handleSend() {
    if (!emailOk || sending) return;
    setSending(true);
    try {
      const redirectTo =
        Platform.OS === 'web'
          ? `${window.location.origin}/(auth)/update-password`
          : 'prudora://update-password';
      const { error } = await resetPasswordForEmail(email.trim(), redirectTo);
      if (error) {
        toast.show({
          placement: 'top',
          containerStyle: { marginTop: insets.top },
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
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="success" variant="solid">
            <ToastTitle>E-post sendt</ToastTitle>
            <ToastDescription>Sjekk innboksen din for en lenke til å velge nytt passord.</ToastDescription>
          </Toast>
        ),
      });
      router.replace('/(auth)/login');
    } finally {
      setSending(false);
    }
  }

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
            paddingBottom: Math.max(insets.bottom, 24) + 120,
            paddingHorizontal: spacing.lg,
            justifyContent: 'center',
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Box flex={1} style={{ backgroundColor: c.background }}>
            <VStack space="lg" py={40} maxWidth={420} mx="auto" width="100%">
              <Text fontSize={24} fontWeight="800" style={{ color: c.text }} lineHeight={30}>
                Tilbakestill passord
              </Text>
              <Text fontSize={14} style={{ color: c.textSecondary }} lineHeight={20}>
                Skriv inn e-posten din, så sender vi deg en lenke for å velge nytt passord.
              </Text>

              <VStack space="xs" mt={8}>
                <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>
                  E-post
                </Text>
                <Input variant="outline" size="lg" style={inputStyle}>
                  <InputField
                    placeholder="din@epost.no"
                    placeholderTextColor={c.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={{ color: c.text }}
                  />
                </Input>
              </VStack>

              <Box mt={8}>
                <PremiumButton
                  title={sending ? 'Sender…' : 'Send e-post'}
                  onPress={handleSend}
                  disabled={!emailOk || sending}
                />
              </Box>
            </VStack>
          </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </BlurStatusBarView>
  );
}

