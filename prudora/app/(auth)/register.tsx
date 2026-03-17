import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
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
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius } from '@/constants/design';

const hasDigits = (s: string) => /\d/.test(s);
const isNameValid = (s: string) => s.trim().length > 0 && !hasDigits(s);
const isAgeNumeric = (s: string) => s === '' || /^\d+$/.test(s);
const isEmailFormat = (s: string) => {
  const t = s.trim();
  const at = t.indexOf('@');
  return at > 0 && at < t.length - 1 && t.includes('@');
};

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();
  const { signUp } = useAuth();
  const c = useDesignColors();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const ageNum = age === '' ? NaN : parseInt(age, 10);
  const firstNameOk = isNameValid(firstName);
  const lastNameOk = isNameValid(lastName);
  const ageNumericOnly = isAgeNumeric(age);
  const ageInRange = !isNaN(ageNum) && ageNum >= 0 && ageNum <= 150;
  const emailOk = email.trim().length > 0 && isEmailFormat(email);
  const showEmailError = emailTouched && email.trim().length > 0 && !emailOk;
  const passwordOk = password.length >= 6;

  const isValid = firstNameOk && lastNameOk && ageNumericOnly && ageInRange && emailOk && passwordOk;

  const handleRegister = async () => {
    if (!isValid) return;
    setLoading(true);
    const { error, emailAlreadyRegistered } = await signUp({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      age: ageNum,
    });
    setLoading(false);
    if (error || emailAlreadyRegistered) {
      toast.show({
        placement: 'bottom',
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>E-posten er i bruk</ToastTitle>
            <ToastDescription>
              {emailAlreadyRegistered
                ? 'Denne e-posten er allerede registrert. Logg inn eller bruk glemt passord.'
                : error?.message}
            </ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    toast.show({
      placement: 'bottom',
      render: ({ id }) => (
        <Toast nativeID={`toast-${id}`} action="success" variant="solid">
          <ToastTitle>Sjekk e-posten din</ToastTitle>
          <ToastDescription>Vi har sendt en lenke for å bekrefte kontoen.</ToastDescription>
        </Toast>
      ),
    });
    router.replace('/(auth)/bekreft-epost');
  };

  const [focusedField, setFocusedField] = useState<'firstName' | 'lastName' | 'age' | 'email' | 'password' | null>(null);

  const baseInputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: c.border,
  };

  const getInputStyle = (field: 'firstName' | 'lastName' | 'age' | 'email' | 'password') => [
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
            paddingTop: insets.top + 32,
            paddingBottom: Math.max(insets.bottom, 24) + 280,
            paddingHorizontal: 24,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
            <Box flex={1} style={{ backgroundColor: c.background }}>
              <VStack space="xl" maxWidth={400} mx="auto" width="100%">
              <VStack space="xs" pb={16}>
                <Text fontSize={24} fontWeight="800" style={{ color: c.text }} lineHeight={30}>
                  Registrer deg
                </Text>
                <Text fontSize={16} style={{ color: c.textSecondary }} lineHeight={24}>
                  Fyll inn navn, alder og e-post. Du må bekrefte e-posten før du kan logge inn.
                </Text>
              </VStack>

              <VStack space="md">
                <VStack space="xs">
                  <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>Fornavn</Text>
                  <Input variant="outline" size="lg" style={getInputStyle('firstName')}>
                    <InputField
                      placeholder="Fornavn"
                      placeholderTextColor={c.textMuted}
                      value={firstName}
                      onChangeText={setFirstName}
                      onFocus={() => setFocusedField('firstName')}
                      onBlur={() => setFocusedField((prev) => (prev === 'firstName' ? null : prev))}
                      autoCapitalize="words"
                      style={{ color: c.text }}
                    />
                  </Input>
                  {firstName.trim().length > 0 && !firstNameOk && (
                    <Text fontSize={12} style={{ color: '#EF4444' }}>Fornavn kan ikke inneholde tall</Text>
                  )}
                </VStack>

                <VStack space="xs">
                  <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>Etternavn</Text>
                  <Input variant="outline" size="lg" style={getInputStyle('lastName')}>
                    <InputField
                      placeholder="Etternavn"
                      placeholderTextColor={c.textMuted}
                      value={lastName}
                      onChangeText={setLastName}
                      onFocus={() => setFocusedField('lastName')}
                      onBlur={() => setFocusedField((prev) => (prev === 'lastName' ? null : prev))}
                      autoCapitalize="words"
                      style={{ color: c.text }}
                    />
                  </Input>
                  {lastName.trim().length > 0 && !lastNameOk && (
                    <Text fontSize={12} style={{ color: '#EF4444' }}>Etternavn kan ikke inneholde tall</Text>
                  )}
                </VStack>

                <VStack space="xs">
                  <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>Alder</Text>
                  <Input variant="outline" size="lg" style={getInputStyle('age')} keyboardType="number-pad">
                    <InputField
                      placeholder="F.eks. 25"
                      placeholderTextColor={c.textMuted}
                      value={age}
                      onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))}
                      onFocus={() => setFocusedField('age')}
                      onBlur={() => setFocusedField((prev) => (prev === 'age' ? null : prev))}
                      keyboardType="number-pad"
                      style={{ color: c.text }}
                    />
                  </Input>
                  {age !== '' && !ageNumericOnly && (
                    <Text fontSize={12} style={{ color: '#EF4444' }}>Alder kan kun inneholde tall</Text>
                  )}
                  {ageNumericOnly && age !== '' && !ageInRange && (
                    <Text fontSize={12} style={{ color: '#EF4444' }}>Alder må være mellom 0 og 150</Text>
                  )}
                </VStack>

                <VStack space="xs">
                  <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>E-post</Text>
                  <Input
                    variant="outline"
                    size="lg"
                    style={getInputStyle('email')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  >
                    <InputField
                      placeholder="din@epost.no"
                      placeholderTextColor={c.textMuted}
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField((prev) => (prev === 'email' ? null : prev))}
                      onBlur={() => setEmailTouched(true)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={{ color: c.text }}
                    />
                  </Input>
                  {showEmailError && (
                    <Text fontSize={12} style={{ color: '#EF4444' }}>E-post må inneholde @ og være gyldig (f.eks. navn@domene.no)</Text>
                  )}
                </VStack>

                <VStack space="xs">
                  <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>Passord</Text>
                  <Input variant="outline" size="lg" style={getInputStyle('password')}>
                    <InputField
                      placeholder="Minst 6 tegn"
                      placeholderTextColor={c.textMuted}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField((prev) => (prev === 'password' ? null : prev))}
                      secureTextEntry
                      style={{ color: c.text }}
                    />
                  </Input>
                  {password.length > 0 && !passwordOk && (
                    <Text fontSize={12} style={{ color: '#EF4444' }}>Passordet må være minst 6 tegn</Text>
                  )}
                </VStack>

                <PremiumButton
                  title={loading ? 'Registrerer…' : 'Registrer deg'}
                  onPress={handleRegister}
                  disabled={!isValid || loading}
                />
              </VStack>

              <Text fontSize={14} style={{ color: c.textSecondary }} textAlign="center" lineHeight={20}>
                Har du allerede konto?{' '}
                <Link href="/(auth)/login">
                  <Text style={{ color: c.primary, fontWeight: '600' }}>Logg inn</Text>
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
