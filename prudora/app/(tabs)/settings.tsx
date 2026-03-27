import { useState, useEffect, useCallback } from 'react';
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
  Spinner,
} from '@gluestack-ui/themed';
import { StyleSheet, View, ScrollView, KeyboardAvoidingView, Platform, Alert, Vibration, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useTheme, type ThemePreference } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, cardShadowLight, hairlineWidth } from '@/constants/design';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: 'iphone' },
  { value: 'light', label: 'Lys modus', icon: 'sun.max.fill' },
  { value: 'dark', label: 'Mørk modus', icon: 'moon.fill' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = useTheme();
  const { user, profile, updateProfile, signOut, changePassword, deleteAccount, appMode, setAppMode } = useAuth();
  const toast = useToast();
  const c = useDesignColors();
  const isDark = c.background === '#000000';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingVerification, setSavingVerification] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatNewPassword, setRepeatNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [isDeletePasswordValid, setIsDeletePasswordValid] = useState(false);
  const [isValidatingDeletePassword, setIsValidatingDeletePassword] = useState(false);
  const [lastCheckedDeletePassword, setLastCheckedDeletePassword] = useState('');
  const [lastCheckedDeletePasswordValid, setLastCheckedDeletePasswordValid] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setAge(String(profile.age ?? ''));
    }
  }, [profile]);

  useEffect(() => {
    if (!deleteAccountModalOpen) {
      setIsDeletePasswordValid(false);
      setIsValidatingDeletePassword(false);
      setLastCheckedDeletePassword('');
      setLastCheckedDeletePasswordValid(false);
      return;
    }

    const password = deleteAccountPassword.trim();
    const email = user?.email?.trim();
    if (!password || !email) {
      setIsDeletePasswordValid(false);
      setIsValidatingDeletePassword(false);
      return;
    }

    if (password === lastCheckedDeletePassword) {
      setIsDeletePasswordValid(lastCheckedDeletePasswordValid);
      setIsValidatingDeletePassword(false);
      return;
    }

    let cancelled = false;
    setIsValidatingDeletePassword(true);
    const timer = setTimeout(() => {
      void (async () => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (cancelled) return;
        const isValid = !error;
        setIsDeletePasswordValid(isValid);
        setLastCheckedDeletePassword(password);
        setLastCheckedDeletePasswordValid(isValid);
        setIsValidatingDeletePassword(false);
      })();
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deleteAccountModalOpen, deleteAccountPassword, lastCheckedDeletePassword, lastCheckedDeletePasswordValid, user?.email]);

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
    | 'deleteAccountPassword'
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
      | 'repeatNewPassword'
      | 'deleteAccountPassword'
  ) => [
    baseInputStyle,
    focusedField === field && {
      borderColor: c.primary,
      borderWidth: 2,
    },
  ];

  const isVerified = !!profile?.is_price_verified;
  const hasVerificationRequest = !!profile?.price_verification_requested_at && !isVerified;
  const verificationRequestedDate = profile?.price_verification_requested_at
    ? new Date(profile.price_verification_requested_at).toLocaleDateString('nb-NO')
    : null;

  async function handleRequestVerification() {
    if (!profile) return;
    setSavingVerification(true);
    const { error } = await updateProfile({
      price_verification_requested_at: new Date().toISOString(),
    } as any);
    setSavingVerification(false);

    if (error) {
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke sende søknad</ToastTitle>
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
          <ToastTitle>Søknad sendt</ToastTitle>
          <ToastDescription>Vi har mottatt søknaden din om prisverifisering.</ToastDescription>
        </Toast>
      ),
    });
  }

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  const [notificationsSaving, setNotificationsSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_price_alert_settings')
      .select('enabled')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setNotificationsEnabled(data?.enabled ?? true);
      });
  }, [user]);

  const toggleNotifications = useCallback(async () => {
    if (!user) return;
    const prev = notificationsEnabled;
    const newValue = !prev;
    setNotificationsEnabled(newValue);
    setNotificationsSaving(true);
    const { error } = await supabase.from('user_price_alert_settings').upsert({
      user_id: user.id,
      enabled: newValue,
      updated_at: new Date().toISOString(),
    });
    setNotificationsSaving(false);
    if (error) {
      setNotificationsEnabled(prev);
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke oppdatere</ToastTitle>
            <ToastDescription>{error.message}</ToastDescription>
          </Toast>
        ),
      });
    }
  }, [user, notificationsEnabled, insets.top, toast]);

  const [devOpen, setDevOpen] = useState(false);
  const [devResults, setDevResults] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'fail'>>({
    notification: 'idle',
    gps: 'idle',
    camera: 'idle',
    vibration: 'idle',
    supabase: 'idle',
    network: 'idle',
  });
  const [deviceInfoOpen, setDeviceInfoOpen] = useState(false);
  const [pushTokenInfo, setPushTokenInfo] = useState<{ token: string | null; registered: boolean; expoGo: boolean } | null>(null);

  const setDevResult = (key: string, value: 'idle' | 'loading' | 'ok' | 'fail') =>
    setDevResults((prev) => ({ ...prev, [key]: value }));

  const [devDialog, setDevDialog] = useState<{ action: 'success' | 'error'; title: string; description?: string } | null>(null);

  const showDevToast = useCallback(
    (action: 'success' | 'error', title: string, description?: string) => {
      setDevDialog({ action, title, description });
    },
    [],
  );

  const testNotification = useCallback(async () => {
    if (notificationsEnabled === false) {
      setDevDialog({
        action: 'error',
        title: 'Varsler er skrudd av',
        description: 'Gå til Innstillinger → Varsler og skru på prisvarsler før du kan teste.',
      });
      return;
    }
    setDevResult('notification', 'loading');
    try {
      const { setNotificationHandler } = await import(
        'expo-notifications/build/NotificationsHandler'
      );
      const { getPermissionsAsync, requestPermissionsAsync } = await import(
        'expo-notifications/build/NotificationPermissions'
      );
      const { scheduleNotificationAsync } = await import(
        'expo-notifications/build/scheduleNotificationAsync'
      );

      setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      const { status } = await getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await requestPermissionsAsync();
        if (newStatus !== 'granted') {
          setDevResult('notification', 'fail');
          showDevToast('error', 'Varsler deaktivert', 'Aktiver varsler i telefonens innstillinger.');
          return;
        }
      }

      await scheduleNotificationAsync({
        content: {
          title: 'Prudora Prisvarsel',
          body: 'Testvarsel: Tine Helmelk 1L har falt 15% – nå kr 19,90 hos Rema 1000!',
          sound: true,
        },
        trigger: null,
      });
      setDevResult('notification', 'ok');
      showDevToast('success', 'Push-varsel sendt');
    } catch {
      Alert.alert('Prudora Prisvarsel', 'Testvarsel: Tine Helmelk 1L har falt 15% – nå kr 19,90 hos Rema 1000!');
      setDevResult('notification', 'ok');
    }
  }, [notificationsEnabled, showDevToast]);

  const testGps = useCallback(async () => {
    setDevResult('gps', 'loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDevResult('gps', 'fail');
        showDevToast('error', 'GPS ikke tilgjengelig', 'Gi appen tilgang til posisjon i innstillingene.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      if (loc?.coords) {
        setDevResult('gps', 'ok');
        showDevToast(
          'success',
          'GPS OK',
          `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)} (±${Math.round(loc.coords.accuracy ?? 0)} m)`,
        );
      } else {
        setDevResult('gps', 'fail');
        showDevToast('error', 'GPS feilet', 'Kunne ikke hente posisjon.');
      }
    } catch {
      setDevResult('gps', 'fail');
      showDevToast('error', 'GPS feilet', 'Kunne ikke hente posisjon.');
    }
  }, [showDevToast]);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraPreviewOpen, setCameraPreviewOpen] = useState(false);

  const testCamera = useCallback(async () => {
    setDevResult('camera', 'loading');
    try {
      let perm = cameraPermission;
      if (!perm?.granted) {
        perm = await requestCameraPermission();
      }
      if (!perm?.granted) {
        setDevResult('camera', 'fail');
        showDevToast('error', 'Kamera avslått', 'Gi appen tilgang til kamera i innstillingene.');
        return;
      }
      setCameraPreviewOpen(true);
      setDevResult('camera', 'ok');
    } catch {
      setDevResult('camera', 'fail');
    }
  }, [cameraPermission, requestCameraPermission, showDevToast]);

  const testVibration = useCallback(() => {
    setDevResult('vibration', 'loading');
    try {
      Vibration.vibrate([0, 200, 100, 200]);
      setDevResult('vibration', 'ok');
    } catch {
      setDevResult('vibration', 'fail');
    }
  }, []);

  const testSupabase = useCallback(async () => {
    setDevResult('supabase', 'loading');
    const start = Date.now();
    try {
      const { error } = await supabase.from('products').select('id').limit(1).single();
      const ms = Date.now() - start;
      if (error && error.code !== 'PGRST116') {
        setDevResult('supabase', 'fail');
        showDevToast('error', 'Supabase feilet', error.message);
      } else {
        setDevResult('supabase', 'ok');
        showDevToast('success', 'Supabase OK', `Responstid: ${ms} ms`);
      }
    } catch {
      setDevResult('supabase', 'fail');
      showDevToast('error', 'Supabase feilet', 'Kunne ikke koble til databasen.');
    }
  }, [showDevToast]);

  const testNetwork = useCallback(async () => {
    setDevResult('network', 'loading');
    try {
      const state = await Network.getNetworkStateAsync();
      if (state.isConnected && state.isInternetReachable !== false) {
        setDevResult('network', 'ok');
        const typeLabel =
          state.type === Network.NetworkStateType.WIFI
            ? 'WiFi'
            : state.type === Network.NetworkStateType.CELLULAR
              ? 'Mobildata'
              : state.type === Network.NetworkStateType.ETHERNET
                ? 'Ethernet'
                : 'Ukjent';
        showDevToast('success', 'Internett OK', `Tilkoblingstype: ${typeLabel}`);
      } else {
        setDevResult('network', 'fail');
        showDevToast('error', 'Ingen internettforbindelse', 'Enheten er ikke koblet til nett.');
      }
    } catch {
      setDevResult('network', 'fail');
      showDevToast('error', 'Nettverkssjekk feilet');
    }
  }, [showDevToast]);

  const checkPushToken = useCallback(async () => {
    const expoGo =
      Constants.appOwnership === 'expo' ||
      (Constants as any).executionEnvironment === 'storeClient';

    if (!user) {
      setPushTokenInfo({ token: null, registered: false, expoGo });
      return;
    }
    const { data } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    setPushTokenInfo({
      token: data?.expo_push_token ?? null,
      registered: !!data?.expo_push_token,
      expoGo,
    });
  }, [user]);

  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    (Constants as any).executionEnvironment === 'storeClient';
  const screen = Dimensions.get('window');
  const deviceModel = Device.modelName ?? 'Ukjent';
  const osVersion = `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`;
  const sdkVersion = Constants.expoConfig?.sdkVersion ?? 'Ukjent';
  const appVersion = Constants.expoConfig?.version ?? '-';
  const buildType = isExpoGo ? 'Expo Go' : 'Development Build';

  const passwordMinLength = 6;
  const canSavePassword =
    !!currentPassword.trim() &&
    newPassword.trim().length >= passwordMinLength &&
    repeatNewPassword.trim().length >= passwordMinLength &&
    newPassword === repeatNewPassword &&
    newPassword !== currentPassword &&
    !savingPassword;

  async function handleSavePassword() {
    if (!canSavePassword) return;
    setSavingPassword(true);
    try {
      const { error } = await changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });

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

      setChangePasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setRepeatNewPassword('');
      setFocusedField(null);
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="success" variant="solid">
            <ToastTitle>Passordet er oppdatert</ToastTitle>
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

  async function handleDeleteAccount() {
    const password = deleteAccountPassword.trim();
    const email = user?.email?.trim();
    if (!email || !password) {
      setDevDialog({
        action: 'error',
        title: 'Bekreft med passord',
        description: 'Du må skrive inn passordet ditt før kontoen kan slettes.',
      });
      return;
    }

    setDeletingAccount(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (verifyError) {
      setDeletingAccount(false);
      setDevDialog({
        action: 'error',
        title: 'Feil passord',
        description: 'Passordet stemmer ikke. Prøv igjen.',
      });
      return;
    }

    const { error } = await deleteAccount();
    setDeletingAccount(false);
    if (error) {
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke slette konto</ToastTitle>
            <ToastDescription>{error.message}</ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    setDeleteAccountPassword('');
    setDeleteAccountModalOpen(false);
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
                  <HStack alignItems="center" space="xs">
                    <IconSymbol
                      name={opt.icon as any}
                      size={14}
                      color={preference === opt.value ? '#FFFFFF' : c.text}
                    />
                    <Text
                      fontSize={14}
                      fontWeight="600"
                      style={{ color: preference === opt.value ? '#FFFFFF' : c.text }}
                    >
                      {opt.label}
                    </Text>
                  </HStack>
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

          {/* Prisverifisering */}
          <VStack space="md">
            <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
              Prisverifisering
            </Text>
            <Text fontSize={13} style={{ color: c.textMuted }} lineHeight={20} mb={4}>
              Kun verifiserte brukere kan registrere priser.
            </Text>
            <HStack space="sm" flexWrap="wrap">
              <Pressable
                onPress={() => {
                  if (isVerified) {
                    const verifiedDate = profile?.updated_at
                      ? new Date(profile.updated_at).toLocaleDateString('nb-NO')
                      : 'ukjent dato';
                    setDevDialog({
                      action: 'success',
                      title: 'Verifisert',
                      description: `Kontoen din ble verifisert ${verifiedDate}. Du kan registrere priser som lagres med tidsstempel og ditt navn.`,
                    });
                  } else if (hasVerificationRequest) {
                    setDevDialog({
                      action: 'error',
                      title: 'Søknad sendt',
                      description: `Du søkte om verifisering ${verificationRequestedDate}. En administrator vil behandle søknaden din.`,
                    });
                  } else {
                    void handleRequestVerification();
                  }
                }}
                disabled={savingVerification}
                style={{
                  backgroundColor: isVerified ? c.primary : hasVerificationRequest ? '#D97706' : c.surface,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: radius.lg,
                  borderWidth: hairlineWidth,
                  borderColor: isVerified ? c.primary : hasVerificationRequest ? '#D97706' : c.border,
                }}
              >
                <HStack alignItems="center" space="xs">
                  <IconSymbol
                    name={isVerified ? 'checkmark.circle.fill' : 'info.circle.fill'}
                    size={14}
                    color={isVerified || hasVerificationRequest ? '#FFFFFF' : c.text}
                  />
                  <Text
                    fontSize={14}
                    fontWeight="600"
                    style={{ color: isVerified || hasVerificationRequest ? '#FFFFFF' : c.text }}
                  >
                    {savingVerification
                      ? 'Sender...'
                      : isVerified
                        ? 'Verifisert'
                        : hasVerificationRequest
                          ? 'Søknad sendt'
                          : 'Søk om verifisering'}
                  </Text>
                </HStack>
              </Pressable>
            </HStack>
          </VStack>

          <View style={{ height: hairlineWidth, backgroundColor: c.border }} />

          {/* Varsler */}
          <VStack space="md">
            <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
              Varsler
            </Text>
            <Text fontSize={13} style={{ color: c.textMuted }} lineHeight={20} mb={4}>
              Motta push-varsler når produkter du abonnerer på faller i pris.
            </Text>
            <HStack space="sm" flexWrap="wrap">
              {([
                { value: true, label: 'På' },
                { value: false, label: 'Av' },
              ] as const).map((opt) => (
                <Pressable
                  key={String(opt.value)}
                  onPress={() => {
                    if (notificationsEnabled !== opt.value) void toggleNotifications();
                  }}
                  disabled={notificationsSaving || notificationsEnabled === null}
                  style={{
                    backgroundColor: notificationsEnabled === opt.value ? c.primary : c.surface,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: radius.lg,
                    borderWidth: hairlineWidth,
                    borderColor: notificationsEnabled === opt.value ? c.primary : c.border,
                  }}
                >
                  <Text
                    fontSize={14}
                    fontWeight="600"
                    style={{ color: notificationsEnabled === opt.value ? '#FFFFFF' : c.text }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
              {notificationsSaving && <Spinner size="small" />}
            </HStack>
          </VStack>

          <View style={{ height: hairlineWidth, backgroundColor: c.border }} />

          {/* App-modus (kun admin) */}
          {profile?.is_admin ? (
            <VStack space="md">
              <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
                App-modus (Admin)
              </Text>
              <Text fontSize={13} style={{ color: c.textMuted }} lineHeight={20} mb={4}>
                Velg om appen skal brukes i bruker- eller adminmodus.
              </Text>
              <HStack space="sm" flexWrap="wrap">
                {([
                  { value: 'user' as const, label: 'Brukermodus' },
                  { value: 'admin' as const, label: 'Adminmodus' },
                ] as const).map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      if (appMode !== opt.value) {
                        void setAppMode(opt.value);
                      }
                    }}
                    style={{
                      backgroundColor: appMode === opt.value ? c.primary : c.surface,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: radius.lg,
                      borderWidth: hairlineWidth,
                      borderColor: appMode === opt.value ? c.primary : c.border,
                    }}
                  >
                    <Text
                      fontSize={14}
                      fontWeight="600"
                      style={{ color: appMode === opt.value ? '#FFFFFF' : c.text }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </HStack>
              <Text fontSize={12} style={{ color: c.textMuted }}>
                Aktiv modus: {appMode === 'admin' ? 'Adminmodus' : 'Brukermodus'}
              </Text>

              <Box
                p={spacing.md}
                borderRadius={radius.lg}
                style={{ borderWidth: hairlineWidth, borderColor: c.border, backgroundColor: c.surface }}
              >
                <VStack space="xs">
                  <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                    Admin-funksjoner
                  </Text>
                  <Text fontSize={12} style={{ color: c.textMuted }} lineHeight={18}>
                    - Pris-scan uten krav om 100 meter fra registrert butikk (kun i adminmodus)
                  </Text>
                  <Text fontSize={12} style={{ color: c.textMuted }} lineHeight={18}>
                    - Varselsimulator for lokal test av prisvarsler (kun i adminmodus)
                  </Text>
                </VStack>
              </Box>
            </VStack>
          ) : null}

          {profile?.is_admin ? <View style={{ height: hairlineWidth, backgroundColor: c.border }} /> : null}

          {/* Passord */}
          <VStack space="md">
            <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
              Sikkerhet
            </Text>
            <PremiumButton
              variant="outline"
              title="Bytt passord"
              onPress={() => setChangePasswordModalOpen(true)}
            />
          </VStack>

          <View style={{ height: hairlineWidth, backgroundColor: c.border }} />

          {/* Developer */}
          <VStack space="md">
            <Pressable onPress={() => setDevOpen((prev) => !prev)}>
              <HStack alignItems="center" justifyContent="space-between">
                <HStack alignItems="center" space="sm">
                  <IconSymbol name="wrench.and.screwdriver" size={16} color={c.textSecondary} />
                  <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
                    Utviklerverktøy
                  </Text>
                </HStack>
                <IconSymbol
                  name={devOpen ? 'chevron.backward' : 'chevron.right'}
                  size={16}
                  color={c.textSecondary}
                />
              </HStack>
            </Pressable>

            {devOpen && (
              <VStack space="md">
                {/* Enhetstester */}
                <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                  Enhetstester
                </Text>
                <VStack space="sm">
                  {([
                    { key: 'supabase', label: 'Supabase-tilkobling', icon: 'server.rack' as const, onPress: testSupabase },
                    { key: 'network', label: 'Internett-tilkobling', icon: 'wifi' as const, onPress: testNetwork },
                    { key: 'notification', label: 'Push-varsel', icon: 'bell.fill' as const, onPress: testNotification },
                    { key: 'gps', label: 'GPS / Posisjon', icon: 'location.fill' as const, onPress: testGps },
                    { key: 'camera', label: 'Kamera', icon: 'camera.fill' as const, onPress: testCamera },
                    { key: 'vibration', label: 'Vibrasjon', icon: 'iphone.radiowaves.left.and.right' as const, onPress: testVibration },
                  ] as const).map((item) => {
                    const status = devResults[item.key];
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => void item.onPress()}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.md,
                          borderRadius: radius.lg,
                          borderWidth: hairlineWidth,
                          borderColor: c.border,
                          backgroundColor: c.surface,
                        }}
                      >
                        <HStack alignItems="center" space="sm">
                          <IconSymbol name={item.icon} size={18} color={c.textSecondary} />
                          <Text fontSize={14} fontWeight="600" style={{ color: c.text }}>
                            {item.label}
                          </Text>
                        </HStack>
                        {status === 'loading' ? (
                          <Spinner size="small" />
                        ) : status === 'ok' ? (
                          <IconSymbol name="checkmark.circle.fill" size={20} color="#16A34A" />
                        ) : status === 'fail' ? (
                          <IconSymbol name="xmark.circle.fill" size={20} color="#EF4444" />
                        ) : (
                          <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>
                            Test
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </VStack>

                {cameraPreviewOpen && (
                  <VStack space="sm">
                    <Box
                      borderRadius={radius.lg}
                      style={{ overflow: 'hidden', height: 200, borderWidth: hairlineWidth, borderColor: c.border }}
                    >
                      <CameraView style={{ flex: 1 }} facing="back" />
                    </Box>
                    <PremiumButton
                      title="Lukk kamera"
                      variant="outline"
                      onPress={() => setCameraPreviewOpen(false)}
                      style={{ minHeight: 38 }}
                      textStyle={{ fontSize: 13 }}
                    />
                  </VStack>
                )}

                {/* Enhetsinformasjon */}
                <Pressable onPress={() => setDeviceInfoOpen((prev) => !prev)}>
                  <HStack alignItems="center" justifyContent="space-between">
                    <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                      Enhetsinformasjon
                    </Text>
                    <IconSymbol
                      name={deviceInfoOpen ? 'chevron.backward' : 'chevron.right'}
                      size={14}
                      color={c.textMuted}
                    />
                  </HStack>
                </Pressable>
                {deviceInfoOpen && (
                  <Box
                    p={spacing.md}
                    borderRadius={radius.lg}
                    style={{ borderWidth: hairlineWidth, borderColor: c.border, backgroundColor: c.surface }}
                  >
                    <VStack space="sm">
                      {([
                        ['Modell', deviceModel],
                        ['OS', osVersion],
                        ['Expo SDK', sdkVersion],
                        ['App-versjon', appVersion],
                        ['Bygg', buildType],
                        ['Skjerm', `${Math.round(screen.width)}×${Math.round(screen.height)} pt`],
                        ['Pixel Ratio', `${Dimensions.get('window').scale}x`],
                      ] as const).map(([label, value]) => (
                        <HStack key={label} justifyContent="space-between" alignItems="center">
                          <Text fontSize={12} style={{ color: c.textMuted }}>{label}</Text>
                          <Text fontSize={12} fontWeight="600" style={{ color: c.text }}>{value}</Text>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                )}

                {/* Push-token status */}
                <Pressable
                  onPress={() => void checkPushToken()}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: hairlineWidth,
                    borderColor: c.border,
                    backgroundColor: c.surface,
                  }}
                >
                  <HStack alignItems="center" space="sm">
                    <IconSymbol name="antenna.radiowaves.left.and.right" size={18} color={c.textSecondary} />
                    <Text fontSize={14} fontWeight="600" style={{ color: c.text }}>
                      Push-token status
                    </Text>
                  </HStack>
                  {pushTokenInfo == null ? (
                    <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>Sjekk</Text>
                  ) : pushTokenInfo.registered ? (
                    <IconSymbol name="checkmark.circle.fill" size={20} color="#16A34A" />
                  ) : pushTokenInfo.expoGo ? (
                    <IconSymbol name="info.circle.fill" size={20} color="#D97706" />
                  ) : (
                    <IconSymbol name="xmark.circle.fill" size={20} color="#EF4444" />
                  )}
                </Pressable>
                {pushTokenInfo != null && (
                  <Box
                    p={spacing.md}
                    borderRadius={radius.lg}
                    style={{
                      borderWidth: 1,
                      borderColor: pushTokenInfo.registered
                        ? '#16A34A'
                        : pushTokenInfo.expoGo
                          ? '#D97706'
                          : '#EF4444',
                      backgroundColor: pushTokenInfo.registered
                        ? 'rgba(22,163,74,0.08)'
                        : pushTokenInfo.expoGo
                          ? 'rgba(217,119,6,0.08)'
                          : 'rgba(239,68,68,0.08)',
                    }}
                  >
                    <VStack space="xs">
                      <Text
                        fontSize={12}
                        fontWeight="700"
                        style={{
                          color: pushTokenInfo.registered
                            ? '#16A34A'
                            : pushTokenInfo.expoGo
                              ? '#D97706'
                              : '#EF4444',
                        }}
                      >
                        {pushTokenInfo.registered
                          ? 'Registrert i databasen'
                          : pushTokenInfo.expoGo
                            ? 'Expo Go – kun lokale varsler'
                            : 'Ikke registrert'}
                      </Text>
                      {pushTokenInfo.token ? (
                        <Text fontSize={11} style={{ color: c.textMuted }} numberOfLines={2} selectable>
                          {pushTokenInfo.token}
                        </Text>
                      ) : pushTokenInfo.expoGo ? (
                        <Text fontSize={11} style={{ color: c.textMuted }} lineHeight={16}>
                          Remote push-token støttes ikke i Expo Go (SDK 53+). Lokale varsler og in-app polling fungerer fortsatt. Bruk development build for full push-støtte.
                        </Text>
                      ) : (
                        <Text fontSize={11} style={{ color: c.textMuted }}>
                          Ingen token funnet. Sjekk at varsler er aktivert.
                        </Text>
                      )}
                    </VStack>
                  </Box>
                )}
              </VStack>
            )}
          </VStack>

          <View style={{ height: hairlineWidth, backgroundColor: c.border }} />

          {/* Logg ut */}
          <PremiumButton
            variant="outline"
            title="Logg ut"
            onPress={() => signOut()}
            accentColor="#EF4444"
          />
          <PremiumButton
            variant="outline"
            title="Slett konto"
            onPress={() => setDeleteAccountModalOpen(true)}
            accentColor="#EF4444"
          />
        </VStack>
      </Box>
        </ScrollView>
      </KeyboardAvoidingView>
      {changePasswordModalOpen && (
        <Pressable
          onPress={() => {
            if (!savingPassword) setChangePasswordModalOpen(false);
          }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            paddingHorizontal: spacing.lg,
          }}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          >
            <Pressable
              onPress={() => {}}
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: radius.xl,
                backgroundColor: c.surface,
                borderWidth: hairlineWidth,
                borderColor: c.border,
                padding: spacing.md,
              }}
            >
              <VStack space="sm">
              <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary }}>
                Bytt passord
              </Text>
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
              <Text fontSize={12} style={{ color: c.textMuted }}>
                Passord må være minst {passwordMinLength} tegn, og nytt passord må være forskjellig fra nåværende.
              </Text>
              {savingPassword && (
                <HStack space="sm" alignItems="center">
                  <Spinner size="small" />
                  <Text fontSize={12} style={{ color: c.textMuted }}>
                    Oppdaterer passord...
                  </Text>
                </HStack>
              )}
              <HStack space="sm" mt={spacing.xs}>
                <PremiumButton
                  title="Avbryt"
                  variant="outline"
                  onPress={() => setChangePasswordModalOpen(false)}
                  disabled={savingPassword}
                  style={{ flex: 1, minHeight: 40 }}
                  textStyle={{ fontSize: 14 }}
                />
                <PremiumButton
                  title={savingPassword ? 'Lagrer...' : 'Lagre'}
                  onPress={handleSavePassword}
                  disabled={!canSavePassword}
                  style={{ flex: 1, minHeight: 40 }}
                  textStyle={{ fontSize: 14 }}
                />
              </HStack>
              </VStack>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      )}
      {devDialog && (
        <Pressable
          onPress={() => setDevDialog(null)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: radius.xl,
              backgroundColor: c.surface,
              borderWidth: hairlineWidth,
              borderColor: c.border,
              padding: spacing.md,
            }}
          >
            <VStack space="sm" alignItems="center">
              <IconSymbol
                name={devDialog.action === 'success' ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                size={40}
                color={devDialog.action === 'success' ? '#16A34A' : '#EF4444'}
              />
              <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary, textAlign: 'center' }}>
                {devDialog.title}
              </Text>
              {devDialog.description ? (
                <Text fontSize={13} style={{ color: c.textMuted, textAlign: 'center' }} lineHeight={20}>
                  {devDialog.description}
                </Text>
              ) : null}
              <PremiumButton
                title="OK"
                variant="outline"
                onPress={() => setDevDialog(null)}
                style={{ minHeight: 40, marginTop: spacing.xs, alignSelf: 'stretch' }}
                textStyle={{ fontSize: 14 }}
              />
            </VStack>
          </Pressable>
        </Pressable>
      )}
      {deleteAccountModalOpen && (
        <Pressable
          onPress={() => {
            if (!deletingAccount) {
              setDeleteAccountPassword('');
              setDeleteAccountModalOpen(false);
            }
          }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            paddingHorizontal: spacing.lg,
          }}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          >
            <Pressable
              onPress={() => {}}
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: radius.xl,
                backgroundColor: c.surface,
                borderWidth: hairlineWidth,
                borderColor: c.border,
                padding: spacing.md,
              }}
            >
              <VStack space="sm">
              <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary }}>
                Slett konto
              </Text>
              <Text fontSize={13} style={{ color: c.textMuted }} lineHeight={20}>
                Kontoen din slettes permanent. Prisene du har registrert beholdes i systemet, men koblingen til deg fjernes.
              </Text>
              <Input size="md" variant="outline" style={getInputStyle('deleteAccountPassword')}>
                <InputField
                  placeholder="Passord"
                  placeholderTextColor={c.textMuted}
                  value={deleteAccountPassword}
                  onChangeText={setDeleteAccountPassword}
                  onFocus={() => setFocusedField('deleteAccountPassword')}
                  onBlur={() => setFocusedField((prev) => (prev === 'deleteAccountPassword' ? null : prev))}
                  style={{ color: c.text }}
                  type="password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Input>
              <HStack space="sm" mt={spacing.xs}>
                <PremiumButton
                  title="Avbryt"
                  variant="outline"
                  onPress={() => {
                    setDeleteAccountPassword('');
                    setDeleteAccountModalOpen(false);
                  }}
                  disabled={deletingAccount}
                  style={{ flex: 1, minHeight: 40 }}
                  textStyle={{ fontSize: 14 }}
                />
                <PremiumButton
                  title={deletingAccount ? 'Sletter...' : 'Slett konto'}
                  onPress={() => {
                    void handleDeleteAccount();
                  }}
                  disabled={deletingAccount || !isDeletePasswordValid || isValidatingDeletePassword}
                  style={{ flex: 1, minHeight: 40 }}
                  textStyle={{ fontSize: 14 }}
                />
              </HStack>
              </VStack>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      )}
    </BlurStatusBarView>
  );
}

const styles = StyleSheet.create({ container: {} });
