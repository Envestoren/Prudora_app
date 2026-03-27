import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Box, HStack, Input, InputField, ScrollView, Spinner, Text, VStack } from '@gluestack-ui/themed';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { hairlineWidth, radius, spacing } from '@/constants/design';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Product } from '@/types/database';

type ProductPick = Pick<Product, 'id' | 'name' | 'supplier' | 'manufacturer' | 'barcode' | 'image_url'>;

const parseNullable = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

export default function AlertSimulatorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const { profile, appMode } = useAuth();

  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductPick | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [sendActualNotification, setSendActualNotification] = useState(false);

  const [oldPriceText, setOldPriceText] = useState('');
  const [newPriceText, setNewPriceText] = useState('');
  const [percentDropText, setPercentDropText] = useState('');
  const [absoluteDropText, setAbsoluteDropText] = useState('');
  const [thresholdPriceText, setThresholdPriceText] = useState('');
  const [simulationResult, setSimulationResult] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<
    'search' | 'oldPrice' | 'newPrice' | 'percentDrop' | 'absoluteDrop' | 'thresholdPrice' | null
  >(null);

  const canUse = !!profile?.is_admin && appMode === 'admin';
  const refreshNotificationsEnabled = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('user_price_alert_settings')
      .select('enabled')
      .eq('user_id', profile.id)
      .maybeSingle();
    setNotificationsEnabled(data?.enabled ?? true);
  }, [profile?.id]);

  useEffect(() => {
    if (!canUse) return;
    const q = query.trim();
    if (!q) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('products')
        .select('id, name, supplier, manufacturer, barcode, image_url')
        .eq('approval_status', 'approved')
        .or(`name.ilike.%${q}%,supplier.ilike.%${q}%,manufacturer.ilike.%${q}%`)
        .order('name')
        .limit(10);
      if (cancelled) return;
      setProducts((data ?? []) as ProductPick[]);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canUse, query]);

  useEffect(() => {
    if (!canUse || !profile?.id) return;
    let cancelled = false;

    const loadSettings = async () => {
      await refreshNotificationsEnabled();
      if (cancelled) return;
    };

    void loadSettings();

    const channel = supabase
      .channel(`user-price-alert-settings-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_price_alert_settings',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          void loadSettings();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [canUse, profile?.id, refreshNotificationsEnabled]);

  useFocusEffect(
    useCallback(() => {
      if (!canUse) return () => {};
      void refreshNotificationsEnabled();
      const t = setInterval(() => {
        void refreshNotificationsEnabled();
      }, 1200);
      return () => clearInterval(t);
    }, [canUse, refreshNotificationsEnabled])
  );

  const sendLocalNotification = useCallback(async (title: string, body: string) => {
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
          Alert.alert(title, body);
          return;
        }
      }

      await scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
        },
        trigger: null,
      });
    } catch {
      Alert.alert(title, body);
    }
  }, []);

  const baseInputStyle = useMemo(
    () => ({
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: hairlineWidth,
      borderColor: c.border,
    }),
    [c]
  );
  const getInputStyle = useCallback(
    (field: 'search' | 'oldPrice' | 'newPrice' | 'percentDrop' | 'absoluteDrop' | 'thresholdPrice') => [
      baseInputStyle,
      focusedField === field && {
        borderColor: c.primary,
        borderWidth: 2,
      },
    ],
    [baseInputStyle, c.primary, focusedField]
  );

  const runSimulation = useCallback(async () => {
    const oldPrice = parseNullable(oldPriceText);
    const newPrice = parseNullable(newPriceText);
    const percentRule = parseNullable(percentDropText);
    const absoluteRule = parseNullable(absoluteDropText);
    const thresholdRule = parseNullable(thresholdPriceText);

    if (!selectedProduct) {
      setSimulationResult('Velg et produkt først.');
      return;
    }
    if (oldPrice == null || newPrice == null) {
      setSimulationResult('Fyll inn både pris og ny pris.');
      return;
    }
    if (percentRule == null && absoluteRule == null && thresholdRule == null) {
      setSimulationResult('Fyll inn minst én regel: %, kr eller terskelpris.');
      return;
    }

    const deltaKr = oldPrice - newPrice;
    const deltaPct = oldPrice > 0 ? (deltaKr / oldPrice) * 100 : 0;
    const percentHit = percentRule != null ? deltaPct >= percentRule : false;
    const absoluteHit = absoluteRule != null ? deltaKr >= absoluteRule : false;
    const thresholdHit = thresholdRule != null ? newPrice <= thresholdRule : false;
    const shouldNotify = percentHit || absoluteHit || thresholdHit;

    const header = shouldNotify
      ? `Varsel utløst for ${selectedProduct.name}`
      : `Ingen varsel for ${selectedProduct.name}`;
    const summaryLine = `- Pris: ${oldPrice.toFixed(2)} kr -> ${newPrice.toFixed(2)} kr`;
    const changeLine = `- Endring: ${deltaKr.toFixed(2)} kr (${deltaPct.toFixed(1)}%)`;
    const ruleLines = [
      percentRule != null
        ? `- Prosentregel: ${deltaPct.toFixed(1)}% mot grense ${percentRule.toFixed(1)}% (${percentHit ? 'treff' : 'ikke treff'})`
        : null,
      absoluteRule != null
        ? `- Kr-regel: ${deltaKr.toFixed(2)} kr mot grense ${absoluteRule.toFixed(2)} kr (${absoluteHit ? 'treff' : 'ikke treff'})`
        : null,
      thresholdRule != null
        ? `- Terskelpris: ny pris ${newPrice.toFixed(2)} kr mot grense ${thresholdRule.toFixed(2)} kr (${thresholdHit ? 'treff' : 'ikke treff'})`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    const resultText = `${header}\n${summaryLine}\n${changeLine}\n${ruleLines}`;

    if (sendActualNotification && shouldNotify) {
      if (!notificationsEnabled) {
        setSimulationResult(
          `${resultText}\n\nHovedinnstilling for varsler er skrudd av. Skru på varsler i innstillinger for å sende faktisk varsel.`
        );
        return;
      }
      await sendLocalNotification(
        'Prudora Prisvarsel (Simulator)',
        `${selectedProduct.name}\nPris: ${oldPrice.toFixed(2)} kr -> ${newPrice.toFixed(2)} kr`
      );
      setSimulationResult(`${resultText}\n\nFaktisk varsel sendt.`);
      return;
    }

    setSimulationResult(resultText);
  }, [
    absoluteDropText,
    newPriceText,
    notificationsEnabled,
    oldPriceText,
    percentDropText,
    selectedProduct,
    sendActualNotification,
    thresholdPriceText,
  ]);

  if (!canUse) {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box flex={1} pt={insets.top + spacing.lg} px={spacing.lg} style={{ backgroundColor: c.background }}>
          <VStack space="md">
            <Text fontSize={20} fontWeight="700" style={{ color: c.textSecondary }}>
              Varselsimulator
            </Text>
            <Text fontSize={14} style={{ color: c.textMuted }}>
              Denne siden er kun tilgjengelig i adminmodus.
            </Text>
            <PremiumButton title="Tilbake" variant="outline" onPress={() => router.back()} />
          </VStack>
        </Box>
      </BlurStatusBarView>
    );
  }

  return (
    <BlurStatusBarView edges={['top']}>
      <Box flex={1} style={{ backgroundColor: c.background }}>
        <Box px={spacing.lg} pt={insets.top + spacing.sm} pb={spacing.sm}>
          <HStack alignItems="center" justifyContent="space-between">
            <Text fontSize={20} fontWeight="700" style={{ color: c.textSecondary }}>
              Varselsimulator
            </Text>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <IconSymbol name="chevron.backward" size={18} color={c.textSecondary} />
            </Pressable>
          </HStack>
        </Box>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
            keyboardShouldPersistTaps="handled"
          >
            <VStack space="md">
              <Input size="md" variant="outline" style={getInputStyle('search')}>
                <InputField
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Søk produkt"
                  placeholderTextColor={c.textMuted}
                  style={{ color: c.text }}
                  onFocus={() => setFocusedField('search')}
                  onBlur={() => setFocusedField((prev) => (prev === 'search' ? null : prev))}
                />
              </Input>

              {loading ? (
                <HStack space="sm" alignItems="center">
                  <Spinner size="small" />
                  <Text fontSize={13} style={{ color: c.textMuted }}>
                    Søker produkter...
                  </Text>
                </HStack>
              ) : null}

              {products.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setSelectedProduct(p);
                    setQuery('');
                    setProducts([]);
                  }}
                  style={{
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: hairlineWidth,
                    borderColor: selectedProduct?.id === p.id ? c.primary : c.border,
                    backgroundColor: selectedProduct?.id === p.id ? c.tint ?? c.surface : c.surface,
                  }}
                >
                  <HStack space="sm" alignItems="center">
                    <Box
                      width={44}
                      height={44}
                      borderRadius={10}
                      alignItems="center"
                      justifyContent="center"
                      style={{ backgroundColor: c.border, overflow: 'hidden' }}
                    >
                      {p.image_url ? (
                        <Image source={{ uri: p.image_url }} style={{ width: 44, height: 44 }} contentFit="contain" />
                      ) : (
                        <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                          {p.name.slice(0, 2).toUpperCase()}
                        </Text>
                      )}
                    </Box>
                    <VStack flex={1} space="xs">
                      <Text fontSize={14} fontWeight="600" style={{ color: selectedProduct?.id === p.id ? c.background : c.text }}>
                        {p.name}
                      </Text>
                      <Text fontSize={12} style={{ color: selectedProduct?.id === p.id ? c.background : c.textMuted }}>
                        {p.manufacturer || p.supplier}
                      </Text>
                    </VStack>
                  </HStack>
                </Pressable>
              ))}

              {selectedProduct ? (
                <Box
                  p={spacing.md}
                  borderRadius={radius.lg}
                  style={{ borderWidth: hairlineWidth, borderColor: c.border, backgroundColor: c.surface }}
                >
                  <HStack space="sm" alignItems="center">
                    <Box
                      width={44}
                      height={44}
                      borderRadius={10}
                      alignItems="center"
                      justifyContent="center"
                      style={{ backgroundColor: c.border, overflow: 'hidden' }}
                    >
                      {selectedProduct.image_url ? (
                        <Image source={{ uri: selectedProduct.image_url }} style={{ width: 44, height: 44 }} contentFit="contain" />
                      ) : (
                        <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                          {selectedProduct.name.slice(0, 2).toUpperCase()}
                        </Text>
                      )}
                    </Box>
                    <VStack flex={1} space="xs">
                      <Text fontSize={12} style={{ color: c.textMuted }}>
                        Valgt produkt
                      </Text>
                      <Text fontSize={14} fontWeight="600" style={{ color: c.text }}>
                        {selectedProduct.name}
                      </Text>
                    </VStack>
                  </HStack>
                </Box>
              ) : null}

              <VStack space="xs">
                <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>
                  Pris
                </Text>
                <HStack alignItems="center" space="sm">
                  <Input size="md" variant="outline" style={[...getInputStyle('oldPrice'), { flex: 1 }]}>
                    <InputField value={oldPriceText} onChangeText={setOldPriceText} placeholder="0,00" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" style={{ color: c.text }} onFocus={() => setFocusedField('oldPrice')} onBlur={() => setFocusedField((prev) => (prev === 'oldPrice' ? null : prev))} />
                  </Input>
                  <Text fontSize={12} style={{ color: c.textMuted }}>kr</Text>
                </HStack>
              </VStack>
              <VStack space="xs">
                <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>
                  Ny pris
                </Text>
                <HStack alignItems="center" space="sm">
                  <Input size="md" variant="outline" style={[...getInputStyle('newPrice'), { flex: 1 }]}>
                    <InputField value={newPriceText} onChangeText={setNewPriceText} placeholder="0,00" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" style={{ color: c.text }} onFocus={() => setFocusedField('newPrice')} onBlur={() => setFocusedField((prev) => (prev === 'newPrice' ? null : prev))} />
                  </Input>
                  <Text fontSize={12} style={{ color: c.textMuted }}>kr</Text>
                </HStack>
              </VStack>
              <VStack space="xs">
                <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>
                  Grense prisnedgang
                </Text>
                <HStack alignItems="center" space="sm">
                  <Input size="md" variant="outline" style={[...getInputStyle('percentDrop'), { flex: 1 }]}>
                    <InputField value={percentDropText} onChangeText={setPercentDropText} placeholder="0" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" style={{ color: c.text }} onFocus={() => setFocusedField('percentDrop')} onBlur={() => setFocusedField((prev) => (prev === 'percentDrop' ? null : prev))} />
                  </Input>
                  <Text fontSize={12} style={{ color: c.textMuted }}>%</Text>
                </HStack>
              </VStack>
              <VStack space="xs">
                <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>
                  Prisnedgang
                </Text>
                <HStack alignItems="center" space="sm">
                  <Input size="md" variant="outline" style={[...getInputStyle('absoluteDrop'), { flex: 1 }]}>
                    <InputField value={absoluteDropText} onChangeText={setAbsoluteDropText} placeholder="0,00" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" style={{ color: c.text }} onFocus={() => setFocusedField('absoluteDrop')} onBlur={() => setFocusedField((prev) => (prev === 'absoluteDrop' ? null : prev))} />
                  </Input>
                  <Text fontSize={12} style={{ color: c.textMuted }}>kr</Text>
                </HStack>
              </VStack>
              <VStack space="xs">
                <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>
                  Terskelpris
                </Text>
                <HStack alignItems="center" space="sm">
                  <Input size="md" variant="outline" style={[...getInputStyle('thresholdPrice'), { flex: 1 }]}>
                    <InputField value={thresholdPriceText} onChangeText={setThresholdPriceText} placeholder="0,00" placeholderTextColor={c.textMuted} keyboardType="decimal-pad" style={{ color: c.text }} onFocus={() => setFocusedField('thresholdPrice')} onBlur={() => setFocusedField((prev) => (prev === 'thresholdPrice' ? null : prev))} />
                  </Input>
                  <Text fontSize={12} style={{ color: c.textMuted }}>kr</Text>
                </HStack>
              </VStack>

              <VStack space="xs">
                <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                  Varseltype
                </Text>
                <HStack space="sm" flexWrap="wrap">
                  {([
                    { value: false, label: 'Kun simulering' },
                    { value: true, label: 'Send faktisk varsel' },
                  ] as const).map((opt) => (
                    <Pressable
                      key={String(opt.value)}
                      onPress={() => setSendActualNotification(opt.value)}
                      style={{
                        backgroundColor: sendActualNotification === opt.value ? c.primary : c.surface,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: radius.lg,
                        borderWidth: hairlineWidth,
                        borderColor: sendActualNotification === opt.value ? c.primary : c.border,
                      }}
                    >
                      <Text
                        fontSize={14}
                        fontWeight="600"
                        style={{ color: sendActualNotification === opt.value ? '#FFFFFF' : c.text }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </HStack>
                <Text fontSize={12} style={{ color: c.textMuted }}>
                  Hovedinnstilling for varsler: {notificationsEnabled ? 'På' : 'Av'}
                </Text>
              </VStack>

              <PremiumButton title="Simuler varsel" onPress={() => void runSimulation()} />

              {simulationResult ? (
                <Box p={spacing.md} borderRadius={radius.lg} style={{ borderWidth: hairlineWidth, borderColor: c.border, backgroundColor: c.surface }}>
                  <Text fontSize={13} style={{ color: c.text }}>
                    {simulationResult}
                  </Text>
                </Box>
              ) : null}
            </VStack>
          </ScrollView>
        </KeyboardAvoidingView>
      </Box>
    </BlurStatusBarView>
  );
}
