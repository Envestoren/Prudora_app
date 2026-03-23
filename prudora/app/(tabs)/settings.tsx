import { useState, useEffect } from 'react';
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
  Pressable,
  HStack,
} from '@gluestack-ui/themed';
import { StyleSheet, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useTheme, type ThemePreference } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, cardShadowLight, hairlineWidth } from '@/constants/design';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Lys modus' },
  { value: 'dark', label: 'Mørk modus' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = useTheme();
  const { profile, updateProfile, signOut, changePassword } = useAuth();
  const toast = useToast();
  const c = useDesignColors();
  const isDark = useTheme().resolvedScheme === 'dark';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatNewPassword, setRepeatNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setAge(String(profile.age ?? ''));
    }
  }, [profile]);

  const hasChanges = profile
    ? firstName.trim() !== (profile.first_name ?? '') ||
      lastName.trim() !== (profile.last_name ?? '') ||
      (parseInt(age.trim(), 10) || 0) !== (profile.age ?? 0)
    : false;

  async function handleSaveProfile() {
    const ageNum = parseInt(age, 10);
    if (!firstName.trim() || !lastName.trim() || isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Ugyldige verdier</ToastTitle>
            <ToastDescription>Fyll ut fornavn, etternavn og en gyldig alder (0–150).</ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    setSaving(true);
    const { error } = await updateProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      age: ageNum,
    });
    setSaving(false);
    if (error) {
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke lagre</ToastTitle>
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
          <ToastTitle>Profil oppdatert</ToastTitle>
        </Toast>
      ),
    });
  }

  const [focusedField, setFocusedField] = useState<
    | 'profileFirstName'
    | 'profileLastName'
    | 'profileAge'
    | 'currentPassword'
    | 'newPassword'
    | 'repeatNewPassword'
    | null
  >(null);

  const baseInputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: hairlineWidth,
    borderColor: c.border,
  };

  const getInputStyle = (
    field:
      | 'profileFirstName'
      | 'profileLastName'
      | 'profileAge'
      | 'currentPassword'
      | 'newPassword'
      | 'repeatNewPassword',
  ) => [
    baseInputStyle,
    focusedField === field && {
      borderColor: c.primary,
      borderWidth: 2,
    },
  ];

  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`${label} tok for lang tid. Prøv igjen.`)), ms)
      ),
    ]);
  }

  async function handleSavePassword() {
    if (!currentPassword.trim() || !newPassword.trim() || !repeatNewPassword.trim()) {
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Mangler felter</ToastTitle>
            <ToastDescription>Fyll ut nåværende passord og skriv nytt passord to ganger.</ToastDescription>
          </Toast>
        ),
      });
      return;
    }

    if (newPassword !== repeatNewPassword) {
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Passordene matcher ikke</ToastTitle>
            <ToastDescription>De to nye passordene må være identiske.</ToastDescription>
          </Toast>
        ),
      });
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await withTimeout(
        changePassword({
          currentPassword: currentPassword,
          newPassword: newPassword,
        }),
        15000,
        'Passordbytte'
      );

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

      setCurrentPassword('');
      setNewPassword('');
      setRepeatNewPassword('');
      setFocusedField(null);
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="success" variant="solid">
            <ToastTitle>Passordet er lagret</ToastTitle>
          </Toast>
        ),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ukjent feil';
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke oppdatere passord</ToastTitle>
            <ToastDescription>{msg}</ToastDescription>
          </Toast>
        ),
      });
    } finally {
      setSavingPassword(false);
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
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Box flex={1} pt={insets.top} pb={24} style={[styles.container, { backgroundColor: c.background, paddingHorizontal: spacing.lg }]}>
            <VStack space="lg" py={24}>
          <Text fontSize={28} fontWeight="800" style={{ color: c.text }} lineHeight={34}>
            Innstillinger
          </Text>

          {/* Utseende / Tema */}
          <VStack space="md">
            <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
              Utseende
            </Text>
            <Text fontSize={13} style={{ color: c.textMuted }} lineHeight={20} mb={4}>
              Velg lys modus, mørk modus eller følg systeminnstillingen.
            </Text>
            <HStack space="sm" flexWrap="wrap">
              {THEME_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setPreference(opt.value)}
                  style={{
                    backgroundColor: preference === opt.value ? c.primary : c.surface,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: radius.lg,
                    borderWidth: hairlineWidth,
                    borderColor: preference === opt.value ? c.primary : c.border,
                  }}
                >
                  <Text
                    fontSize={14}
                    fontWeight="600"
                    style={{ color: preference === opt.value ? '#FFFFFF' : c.text }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </HStack>
          </VStack>

          <View style={{ height: hairlineWidth, backgroundColor: c.border }} />

          {/* Profil */}
          <VStack space="md">
            <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
              Profil
            </Text>
            <VStack space="md">
              <Input size="md" variant="outline" style={getInputStyle('profileFirstName')}>
                <InputField
                  placeholder="Fornavn"
                  placeholderTextColor={c.textMuted}
                  value={firstName}
                  onChangeText={setFirstName}
                  onFocus={() => setFocusedField('profileFirstName')}
                  onBlur={() => setFocusedField((prev) => (prev === 'profileFirstName' ? null : prev))}
                  style={{ color: c.text }}
                />
              </Input>
              <Input size="md" variant="outline" style={getInputStyle('profileLastName')}>
                <InputField
                  placeholder="Etternavn"
                  placeholderTextColor={c.textMuted}
                  value={lastName}
                  onChangeText={setLastName}
                  onFocus={() => setFocusedField('profileLastName')}
                  onBlur={() => setFocusedField((prev) => (prev === 'profileLastName' ? null : prev))}
                  style={{ color: c.text }}
                />
              </Input>
              <Input size="md" variant="outline" style={getInputStyle('profileAge')}>
                <InputField
                  placeholder="Alder"
                  placeholderTextColor={c.textMuted}
                  value={age}
                  onChangeText={setAge}
                  onFocus={() => setFocusedField('profileAge')}
                  onBlur={() => setFocusedField((prev) => (prev === 'profileAge' ? null : prev))}
                  style={{ color: c.text }}
                />
              </Input>
              <PremiumButton
                title={saving ? 'Lagrer...' : 'Lagre profil'}
                onPress={handleSaveProfile}
                disabled={saving || !hasChanges}
              />
            </VStack>
          </VStack>

          <View style={{ height: hairlineWidth, backgroundColor: c.border }} />

          {/* Bytt passord */}
          <VStack space="md">
            <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
              Bytt passord
            </Text>
            <VStack space="md">
              <Input size="md" variant="outline" style={getInputStyle('currentPassword')}>
                <InputField
                  placeholder="Nåværende passord"
                  placeholderTextColor={c.textMuted}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  onFocus={() => setFocusedField('currentPassword')}
                  onBlur={() => setFocusedField((prev) => (prev === 'currentPassword' ? null : prev))}
                  style={{ color: c.text }}
                  type="password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Input>
              <Input size="md" variant="outline" style={getInputStyle('newPassword')}>
                <InputField
                  placeholder="Nytt passord"
                  placeholderTextColor={c.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  onFocus={() => setFocusedField('newPassword')}
                  onBlur={() => setFocusedField((prev) => (prev === 'newPassword' ? null : prev))}
                  style={{ color: c.text }}
                  type="password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Input>
              <Input size="md" variant="outline" style={getInputStyle('repeatNewPassword')}>
                <InputField
                  placeholder="Gjenta nytt passord"
                  placeholderTextColor={c.textMuted}
                  value={repeatNewPassword}
                  onChangeText={setRepeatNewPassword}
                  onFocus={() => setFocusedField('repeatNewPassword')}
                  onBlur={() => setFocusedField((prev) => (prev === 'repeatNewPassword' ? null : prev))}
                  style={{ color: c.text }}
                  type="password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Input>
              <PremiumButton
                title={savingPassword ? 'Lagrer...' : 'Lagre endringer'}
                onPress={handleSavePassword}
                disabled={savingPassword}
              />
            </VStack>
          </VStack>

          <View style={{ height: hairlineWidth, backgroundColor: c.border }} />

          {/* Logg ut */}
          <PremiumButton
            variant="outline"
            title="Logg ut"
            onPress={() => signOut()}
            accentColor="#EF4444"
          />
        </VStack>
      </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </BlurStatusBarView>
  );
}

const styles = StyleSheet.create({ container: {} });
