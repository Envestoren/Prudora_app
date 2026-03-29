import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';
import { Box, HStack, Input, InputField, ScrollView, Spinner, Text, VStack } from '@gluestack-ui/themed';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { hairlineWidth, radius, spacing } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { distanceKm } from '@/lib/location-utils';
import type { Product, Store, UserProductPriceAlert } from '@/types/database';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PremiumButton } from '@/components/ui/PremiumButton';

type ProductPick = Pick<Product, 'id' | 'name' | 'supplier' | 'manufacturer' | 'barcode' | 'unit' | 'image_url'>;
type AlertFrequency = 'instant' | 'daily' | 'weekly';
type SubscriptionItem = ProductPick & {
  alertId: string;
  percentDrop: number | null;
  absoluteDropKr: number | null;
  thresholdPrice: number | null;
};

export default function ProductSubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const { user, profile, appMode } = useAuth();
  const [query, setQuery] = useState('');
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ProductPick[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<string[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMode, setSettingsMode] = useState<'favorites' | 'nearest' | 'search'>('favorites');
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [frequency, setFrequency] = useState<AlertFrequency>('instant');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [editTarget, setEditTarget] = useState<SubscriptionItem | null>(null);
  const [editPercentText, setEditPercentText] = useState('');
  const [editAbsoluteText, setEditAbsoluteText] = useState('');
  const [editThresholdPriceText, setEditThresholdPriceText] = useState('');
  const [editShowThresholdInfo, setEditShowThresholdInfo] = useState(false);

  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const inputStyle = useMemo(
    () => ({
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: searchFocused ? 2 : hairlineWidth,
      borderColor: searchFocused ? c.primary : c.border,
    }),
    [c, searchFocused]
  );
  const settingsInputStyle = useMemo(
    () => ({
      backgroundColor: c.background,
      borderRadius: radius.md,
      borderWidth: hairlineWidth,
      borderColor: c.border,
    }),
    [c]
  );
  const storesByDistance = useMemo(() => {
    if (!userLocation) return stores;
    return [...stores].sort(
      (a, b) =>
        distanceKm(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) -
        distanceKm(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude)
    );
  }, [stores, userLocation]);
  const nearestStores = useMemo(() => storesByDistance.slice(0, 5), [storesByDistance]);
  const storePickerResults = useMemo(() => {
    if (settingsMode === 'favorites') {
      if (!favoriteStoreIds.length) return [];
      return storesByDistance.filter((s) => favoriteStoreIds.includes(s.id));
    }
    if (settingsMode === 'nearest') {
      return nearestStores;
    }
    const q = storeSearch.trim().toLowerCase();
    if (!q) return storesByDistance.slice(0, 8);
    return storesByDistance.filter((s) =>
      `${s.chain} ${s.name ?? ''} ${s.address}`.toLowerCase().includes(q)
    );
  }, [favoriteStoreIds, nearestStores, settingsMode, storeSearch, storesByDistance]);

  const sendPushNotification = useCallback(async (title: string, body: string) => {
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
        if (newStatus !== 'granted') return;
      }

      await scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: null,
      });
    } catch {
      // ignore notification errors silently
    }
  }, []);

  const parseNullableNumber = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }, []);

  const addSubscription = useCallback(
    async (product: ProductPick) => {
      if (!user) {
        setSaveMessage('Du må være innlogget for å opprette abonnement.');
        return;
      }

      const alreadyExists = subscriptions.some((item) => item.id === product.id);
      if (alreadyExists) {
        Alert.alert('Allerede lagt til', 'Du har allerede abonnement på dette produktet.');
        return;
      }

      const { data, error } = await supabase
        .from('user_product_price_alerts')
        .insert({
          user_id: user.id,
          product_id: product.id,
          enabled: true,
          percent_drop: null,
          absolute_drop_kr: null,
        })
        .select('id, percent_drop, absolute_drop_kr, threshold_price')
        .single();

      if (error || !data?.id) {
        setSaveMessage(error?.message ?? 'Kunne ikke lagre abonnement.');
        return;
      }

      setSubscriptions((prev) => [
        {
          ...product,
          alertId: data.id as string,
          percentDrop: data.percent_drop as number | null,
          absoluteDropKr: data.absolute_drop_kr as number | null,
          thresholdPrice: data.threshold_price as number | null,
        },
        ...prev,
      ]);
      setQuery('');
      setSearchResults([]);
      setSearchMessage(null);
      setSaveMessage('Produkt lagt til i abonnement.');
      // Ikke send push ved aktivering av varsel; kun ved faktiske prisvarsler.
    },
    [subscriptions, user]
  );

  const removeSubscription = useCallback(
    async (alertId: string, productId: string) => {
      const prev = subscriptions;
      setSubscriptions((items) => items.filter((item) => item.id !== productId));

      const { error } = await supabase.from('user_product_price_alerts').delete().eq('id', alertId);
      if (error) {
        setSubscriptions(prev);
        setSaveMessage(error.message ?? 'Kunne ikke fjerne abonnement.');
        return;
      }
      setSaveMessage('Abonnement fjernet.');
    },
    [subscriptions]
  );

  const saveThresholds = useCallback(
    async (
      item: SubscriptionItem,
      percentText: string,
      absoluteText: string,
      thresholdPriceText: string
    ) => {
      const percent = parseNullableNumber(percentText);
      const absolute = parseNullableNumber(absoluteText);
      const thresholdPrice = parseNullableNumber(thresholdPriceText);
      if (percent == null && absolute == null && thresholdPrice == null) {
        setSaveMessage('Legg inn minst én regel: prosent, kroner eller makspris.');
        return;
      }

      const { error } = await supabase
        .from('user_product_price_alerts')
        .update({
          percent_drop: percent,
          absolute_drop_kr: absolute,
          threshold_price: thresholdPrice,
          enabled: true,
        })
        .eq('id', item.alertId);

      if (error) {
        setSaveMessage(error.message ?? 'Kunne ikke lagre varselgrenser.');
        return;
      }

      setSubscriptions((prev) =>
        prev.map((current) =>
          current.alertId === item.alertId
            ? { ...current, percentDrop: percent, absoluteDropKr: absolute, thresholdPrice }
            : current
        )
      );
      setSaveMessage('Varselgrenser lagret.');
      // Ikke send push ved lagring av regler; kun ved faktiske prisvarsler.
    },
    [parseNullableNumber]
  );

  const lookupProductByBarcode = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      if (!code) return;

      const { data, error } = await supabase
        .from('products')
        .select('id, name, supplier, manufacturer, barcode, unit, image_url')
        .eq('barcode', code)
        .eq('approval_status', 'approved')
        .maybeSingle();

      if (error) {
        setScanMessage(error.message ?? 'Kunne ikke slå opp strekkode.');
        return;
      }
      if (!data?.id) {
        setScanMessage('Fant ikke produkt med denne strekkoden.');
        return;
      }

      setScanMessage(null);
      await addSubscription(data as ProductPick);
    },
    [addSubscription]
  );

  const handleBarcodeScanned = useCallback(
    async (payload: { data?: string } | { raw?: string } | any) => {
      const raw = (payload?.data ?? payload?.raw ?? '').trim();
      if (!raw) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.value === raw && now - last.at < 1500) return;
      lastScanRef.current = { value: raw, at: now };

      setScannerOpen(false);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // ignore haptics errors
      }
      await lookupProductByBarcode(raw);
    },
    [lookupProductByBarcode]
  );

  const openScanner = useCallback(async () => {
    setScanMessage(null);
    if (!permission) return;
    if (!permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setScanMessage('Kameratilgang er nødvendig for å scanne strekkoder.');
        return;
      }
    }
    setScannerOpen(true);
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchMessage(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      setSearchMessage(null);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, supplier, manufacturer, barcode, unit, image_url')
        .eq('approval_status', 'approved')
        .or(`name.ilike.%${trimmedQuery}%,supplier.ilike.%${trimmedQuery}%,manufacturer.ilike.%${trimmedQuery}%`)
        .order('name')
        .limit(12);

      if (cancelled) return;
      if (error) {
        setSearchResults([]);
        setSearchMessage(error.message ?? 'Kunne ikke søke i produkter.');
        setIsSearching(false);
        return;
      }

      const next = (data ?? []) as ProductPick[];
      setSearchResults(next);
      if (next.length === 0) setSearchMessage('Ingen produkter funnet.');
      setIsSearching(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [trimmedQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setSubscriptions([]);
        setSubscriptionsLoading(false);
        return;
      }
      setSubscriptionsLoading(true);

      const { data: alerts, error } = await supabase
        .from('user_product_price_alerts')
        .select('id, product_id, percent_drop, absolute_drop_kr, threshold_price, enabled')
        .eq('user_id', user.id)
        .eq('enabled', true)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        setSubscriptions([]);
        setSaveMessage(error.message ?? 'Kunne ikke hente abonnement.');
        setSubscriptionsLoading(false);
        return;
      }

      const rows = (alerts ?? []) as Pick<
        UserProductPriceAlert,
        'id' | 'product_id' | 'percent_drop' | 'absolute_drop_kr' | 'enabled'
        | 'threshold_price'
      >[];
      const productIds = rows.map((row) => row.product_id).filter(Boolean);
      if (productIds.length === 0) {
        setSubscriptions([]);
        setSubscriptionsLoading(false);
        return;
      }

      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, supplier, manufacturer, barcode, unit, image_url')
        .in('id', productIds);

      if (cancelled) return;
      if (productsError) {
        setSubscriptions([]);
        setSaveMessage(productsError.message ?? 'Kunne ikke hente produkter for abonnement.');
        setSubscriptionsLoading(false);
        return;
      }

      const byProductId = new Map<string, ProductPick>();
      ((products ?? []) as ProductPick[]).forEach((p) => byProductId.set(p.id, p));

      const next: SubscriptionItem[] = [];
      rows.forEach((row) => {
        const product = byProductId.get(row.product_id);
        if (!product) return;
        next.push({
          ...product,
          alertId: row.id,
          percentDrop: row.percent_drop,
          absoluteDropKr: row.absolute_drop_kr,
          thresholdPrice: row.threshold_price,
        });
      });

      setSubscriptions(next);
      setSubscriptionsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const [{ data: storesData }, { data: favData }, { data: filterData }, { data: settingsData }] = await Promise.all([
        supabase
          .from('stores')
          .select('id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at')
          .order('chain'),
        supabase.from('favorite_stores').select('store_id').eq('user_id', user.id),
        supabase.from('user_price_alert_store_filters').select('store_id').eq('user_id', user.id),
        supabase.from('user_price_alert_settings').select('report_frequency').eq('user_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setStores((storesData ?? []) as Store[]);
      setFavoriteStoreIds((favData ?? []).map((r: any) => r.store_id as string));
      setSelectedStoreIds((filterData ?? []).map((r: any) => r.store_id as string));
      const fromDb = (settingsData as any)?.report_frequency as AlertFrequency | undefined;
      setFrequency(fromDb ?? 'instant');
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        // ignore location errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStoreFilter = useCallback((storeId: string) => {
    setSelectedStoreIds((prev) => (prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]));
  }, []);

  const saveAlertSettings = useCallback(async () => {
    if (!user) {
      setSaveMessage('Du må være innlogget.');
      return;
    }
    setSettingsSaving(true);
    const { error: settingsError } = await supabase.from('user_price_alert_settings').upsert({
      user_id: user.id,
      enabled: true,
      report_frequency: frequency,
      updated_at: new Date().toISOString(),
    });
    if (settingsError) {
      setSettingsSaving(false);
      setSaveMessage(settingsError.message ?? 'Kunne ikke lagre varselinnstillinger.');
      return;
    }

    const { error: deleteError } = await supabase
      .from('user_price_alert_store_filters')
      .delete()
      .eq('user_id', user.id);
    if (deleteError) {
      setSettingsSaving(false);
      setSaveMessage(deleteError.message ?? 'Kunne ikke oppdatere butikkfilter.');
      return;
    }

    if (selectedStoreIds.length > 0) {
      const { error: insertError } = await supabase
        .from('user_price_alert_store_filters')
        .insert(selectedStoreIds.map((storeId) => ({ user_id: user.id, store_id: storeId })));
      if (insertError) {
        setSettingsSaving(false);
        setSaveMessage(insertError.message ?? 'Kunne ikke lagre butikkfilter.');
        return;
      }
    }

    setSettingsSaving(false);
    setSettingsOpen(false);
    setSaveMessage('Varselinnstillinger lagret.');
  }, [frequency, selectedStoreIds, user]);

  const openEditDialog = useCallback((item: SubscriptionItem) => {
    setEditTarget(item);
    setEditPercentText(item.percentDrop != null ? String(item.percentDrop).replace('.', ',') : '');
    setEditAbsoluteText(item.absoluteDropKr != null ? String(item.absoluteDropKr).replace('.', ',') : '');
    setEditThresholdPriceText(item.thresholdPrice != null ? String(item.thresholdPrice).replace('.', ',') : '');
    setEditShowThresholdInfo(false);
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditTarget(null);
    setEditShowThresholdInfo(false);
  }, []);

  return (
    <BlurStatusBarView edges={['top']}>
      <Box flex={1} style={{ backgroundColor: c.background }}>
        <Box px={spacing.lg} pt={insets.top + spacing.sm} pb={spacing.sm} style={{ backgroundColor: c.background }}>
          <VStack space="md">
            <Text fontSize={20} fontWeight="700" style={{ color: c.textSecondary }}>
              Produktabonnement
            </Text>
            <HStack alignItems="center" space="sm">
              <Box flex={1}>
                <Input size="md" variant="outline" style={inputStyle}>
                  <InputField
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Søk"
                    placeholderTextColor={c.textMuted}
                    style={{ color: c.text }}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                </Input>
              </Box>
              <Pressable
                onPress={() => {
                  void openScanner();
                }}
                hitSlop={10}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.surface,
                  borderWidth: hairlineWidth,
                  borderColor: c.border,
                }}
                accessibilityRole="button"
                accessibilityLabel="Skann strekkode"
              >
                <IconSymbol name="barcode.viewfinder" size={18} color={c.textSecondary} />
              </Pressable>
            </HStack>
            {scanMessage && (
              <Text fontSize={12} style={{ color: c.error ?? '#ff4d4f' }}>
                {scanMessage}
              </Text>
            )}
            {saveMessage && (
              <Text fontSize={12} style={{ color: c.textMuted }}>
                {saveMessage}
              </Text>
            )}
            {trimmedQuery.length > 0 && searchMessage && !isSearching && (
              <Text fontSize={12} style={{ color: c.textMuted }}>
                {searchMessage}
              </Text>
            )}
            <Pressable
              onPress={() => setSettingsOpen((prev) => !prev)}
              style={[styles.settingsButton, { borderColor: c.border, backgroundColor: c.surface }]}
            >
              <HStack alignItems="center" justifyContent="space-between">
                <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }}>
                  Innstillinger for varsler
                </Text>
                <IconSymbol
                  name={settingsOpen ? 'chevron.backward' : 'chevron.right'}
                  size={16}
                  color={c.textSecondary}
                />
              </HStack>
            </Pressable>
            {profile?.is_admin && appMode === 'admin' ? (
              <Pressable
                onPress={() => router.push('/(tabs)/varselsimulator')}
                style={[styles.settingsButton, { borderColor: c.border, backgroundColor: c.surface }]}
              >
                <HStack alignItems="center" justifyContent="space-between">
                  <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }}>
                    Varselsimulator (Admin)
                  </Text>
                  <IconSymbol name="chevron.right" size={16} color={c.textSecondary} />
                </HStack>
              </Pressable>
            ) : null}
            {settingsOpen && (
              <Pressable onPress={() => setStorePickerOpen(false)}>
                <Box
                  p={spacing.md}
                  borderRadius={radius.lg}
                  style={{ borderWidth: hairlineWidth, borderColor: c.border, backgroundColor: c.surface }}
                >
                  <Pressable onPress={(e: any) => e?.stopPropagation?.()}>
                    <VStack space="md">
                  <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                    Butikkfilter
                  </Text>
                  <HStack space="sm" flexWrap="wrap">
                    {[
                      { mode: 'favorites' as const, label: 'Favoritter' },
                      { mode: 'nearest' as const, label: 'Nærmeste' },
                      { mode: 'search' as const, label: 'Søk' },
                    ].map((opt) => {
                      const active = settingsMode === opt.mode;
                      const nextOpen = !(storePickerOpen && active);
                      return (
                        <RuleChip
                          key={opt.mode}
                          label={opt.label}
                          active={active}
                          onPress={() => {
                            setSettingsMode(opt.mode);
                            setStorePickerOpen(nextOpen);
                            if (nextOpen && opt.mode === 'search') setStoreSearch('');
                          }}
                        />
                      );
                    })}
                  </HStack>

                  {storePickerOpen && (
                    <>
                      {settingsMode === 'search' && (
                        <Input size="md" variant="outline" style={settingsInputStyle}>
                          <InputField
                            value={storeSearch}
                            onChangeText={setStoreSearch}
                            placeholder="Søk butikk (navn, kjede, adresse)"
                            placeholderTextColor={c.textMuted}
                            style={{ color: c.text }}
                          />
                        </Input>
                      )}

                      <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                        <VStack space="sm">
                          {storePickerResults.map((store) => {
                            const active = selectedStoreIds.includes(store.id);
                            const distanceLabel =
                              userLocation != null
                                ? `${distanceKm(userLocation.latitude, userLocation.longitude, store.latitude, store.longitude).toFixed(1)} km`
                                : null;
                            return (
                              <Pressable
                                key={store.id}
                                onPress={() => toggleStoreFilter(store.id)}
                                style={{
                                  paddingVertical: spacing.sm,
                                  paddingHorizontal: spacing.sm,
                                  borderRadius: radius.md,
                                  borderWidth: hairlineWidth,
                                  borderColor: active ? c.primary : c.border,
                                  backgroundColor: active ? (c.tint ?? c.border) : c.background,
                                }}
                              >
                                <HStack alignItems="center" justifyContent="space-between">
                                  <Text fontSize={13} fontWeight="600" style={{ color: active ? c.background : c.textSecondary }} numberOfLines={1}>
                                    {store.name ? `${store.chain} - ${store.name}` : store.chain}
                                  </Text>
                                  <Text fontSize={12} style={{ color: active ? c.background : c.textMuted }}>
                                    {distanceLabel ?? ''}
                                  </Text>
                                </HStack>
                              </Pressable>
                            );
                          })}
                        </VStack>
                      </ScrollView>
                    </>
                  )}

                  <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                    Varselfrekvens
                  </Text>
                  <HStack space="sm" flexWrap="wrap">
                    <RuleChip label="Hver prisnedgang" active={frequency === 'instant'} onPress={() => setFrequency('instant')} />
                    <RuleChip label="Daglig rapport" active={frequency === 'daily'} onPress={() => setFrequency('daily')} />
                    <RuleChip label="Ukentlig rapport" active={frequency === 'weekly'} onPress={() => setFrequency('weekly')} />
                  </HStack>

                  <PremiumButton
                    title={settingsSaving ? 'Lagrer...' : 'Lagre innstillinger'}
                    onPress={() => {
                      void saveAlertSettings();
                    }}
                    variant="outline"
                    disabled={settingsSaving}
                    style={{ minHeight: 42 }}
                  />

                    </VStack>
                  </Pressable>
                </Box>
              </Pressable>
            )}
          </VStack>
        </Box>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {isSearching || subscriptionsLoading ? (
            <Box flex={1} justifyContent="center" alignItems="center">
              <Spinner size="large" />
              <Text mt={spacing.md} fontSize={15} style={{ color: c.textMuted }}>
                {subscriptionsLoading ? 'Henter abonnement...' : 'Søker produkter...'}
              </Text>
            </Box>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={{ ...styles.listContent, paddingBottom: insets.bottom + spacing.xl }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <VStack space="md" px={spacing.lg}>
                {trimmedQuery.length > 0 &&
                  searchResults.map((product) => (
                    <Pressable key={`search-${product.id}`} hitSlop={10} sx={{ _pressed: { opacity: 0.9 } }}>
                      <SubscriptionCard product={product} actionLabel="Legg til" onAction={() => void addSubscription(product)} />
                    </Pressable>
                  ))}

                {subscriptions.length > 0 && (
                  <Text fontSize={13} fontWeight="600" style={{ color: c.textMuted }}>
                    Dine abonnement
                  </Text>
                )}

                {subscriptions.map((product) => (
                  <Pressable key={`sub-${product.id}`} hitSlop={10} sx={{ _pressed: { opacity: 0.9 } }}>
                    <SubscriptionCard
                      product={product}
                      actionLabel="Fjern"
                      onAction={() => void removeSubscription(product.alertId, product.id)}
                      onEdit={() => openEditDialog(product)}
                    />
                  </Pressable>
                ))}

                {subscriptions.length === 0 && trimmedQuery.length === 0 && (
                  <Box flex={1} justifyContent="center" alignItems="center" py={spacing.xl}>
                    <Text fontSize={15} style={{ color: c.textMuted }}>
                      Søk opp produkter eller scan strekkode for å starte.
                    </Text>
                  </Box>
                )}
              </VStack>
            </ScrollView>
          )}
        </KeyboardAvoidingView>

        {scannerOpen && (
          <Box position="absolute" top={0} left={0} right={0} bottom={0} style={{ backgroundColor: '#000' }}>
            <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={handleBarcodeScanned as any} />
            <Box position="absolute" top={0} left={0} right={0} pt={insets.top + spacing.sm} px={spacing.lg}>
              <HStack alignItems="center" justifyContent="space-between">
                <Text fontSize={16} fontWeight="700" style={{ color: '#fff' }}>
                  Scanner
                </Text>
                <Pressable onPress={() => setScannerOpen(false)} hitSlop={10}>
                  <Text fontSize={14} style={{ color: '#fff' }}>
                    Lukk
                  </Text>
                </Pressable>
              </HStack>
            </Box>
            <Box position="absolute" left={0} right={0} bottom={insets.bottom + spacing.lg} px={spacing.lg}>
              <Text fontSize={13} style={{ color: 'rgba(255,255,255,0.85)' }}>
                Hold strekkoden innenfor kameraet.
              </Text>
            </Box>
          </Box>
        )}
        {editTarget && (
          <Pressable
            onPress={closeEditDialog}
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
                  <HStack alignItems="center" justifyContent="space-between">
                    <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary }}>
                      Rediger prisvarsel
                    </Text>
                    <Pressable
                      onPress={() => setEditShowThresholdInfo((prev) => !prev)}
                      style={[
                        styles.infoIconButton,
                        {
                          borderColor: editShowThresholdInfo ? (c.tint ?? c.border) : c.border,
                          backgroundColor: editShowThresholdInfo ? (c.tint ?? c.border) : c.surface,
                        },
                      ]}
                    >
                      <Text
                        fontSize={12}
                        fontWeight="700"
                        style={{ color: editShowThresholdInfo ? c.background : c.textSecondary }}
                      >
                        i
                      </Text>
                    </Pressable>
                  </HStack>
                  <Text fontSize={13} style={{ color: c.textMuted }} numberOfLines={2}>
                    {editTarget.name}
                  </Text>

                  {editShowThresholdInfo && (
                    <Box style={[styles.infoBox, { borderColor: c.border, backgroundColor: c.background }]}>
                      <Text fontSize={12} style={{ color: c.textMuted }}>
                        Du varsles hvis minst en utfylt regel treffer: prosentnedgang, kr-nedgang eller pris under makspris.
                      </Text>
                    </Box>
                  )}

                  <HStack alignItems="center" style={{ gap: spacing.sm }}>
                    <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted, width: 120 }}>
                      Prosentnedgang
                    </Text>
                    <Input size="sm" variant="outline" style={[styles.thresholdInput, { flex: 1 }]}>
                      <InputField
                        value={editPercentText}
                        onChangeText={setEditPercentText}
                        placeholder="f.eks. 10"
                        placeholderTextColor={c.textMuted}
                        keyboardType="decimal-pad"
                        style={{ color: c.text }}
                      />
                    </Input>
                    <Box style={[styles.unitBadge, { borderColor: c.border, backgroundColor: c.surface }]}>
                      <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                        %
                      </Text>
                    </Box>
                  </HStack>

                  <HStack alignItems="center" style={{ gap: spacing.sm }}>
                    <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted, width: 120 }}>
                      Prisnedgang
                    </Text>
                    <Input size="sm" variant="outline" style={[styles.thresholdInput, { flex: 1 }]}>
                      <InputField
                        value={editAbsoluteText}
                        onChangeText={setEditAbsoluteText}
                        placeholder="f.eks. 5"
                        placeholderTextColor={c.textMuted}
                        keyboardType="decimal-pad"
                        style={{ color: c.text }}
                      />
                    </Input>
                    <Box style={[styles.unitBadge, { borderColor: c.border, backgroundColor: c.surface }]}>
                      <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                        kr
                      </Text>
                    </Box>
                  </HStack>

                  <HStack alignItems="center" style={{ gap: spacing.sm }}>
                    <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted, width: 120 }}>
                      Makspris
                    </Text>
                    <Input size="sm" variant="outline" style={[styles.thresholdInput, { flex: 1 }]}>
                      <InputField
                        value={editThresholdPriceText}
                        onChangeText={setEditThresholdPriceText}
                        placeholder="f.eks. 29,90"
                        placeholderTextColor={c.textMuted}
                        keyboardType="decimal-pad"
                        style={{ color: c.text }}
                      />
                    </Input>
                    <Box style={[styles.unitBadge, { borderColor: c.border, backgroundColor: c.surface }]}>
                      <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                        kr
                      </Text>
                    </Box>
                  </HStack>

                  <HStack space="sm" mt={spacing.xs}>
                    <PremiumButton
                      title="Avbryt"
                      variant="outline"
                      onPress={closeEditDialog}
                      style={{ flex: 1, minHeight: 40 }}
                      textStyle={{ fontSize: 14 }}
                    />
                    <PremiumButton
                      title="Lagre"
                      onPress={() => {
                        Keyboard.dismiss();
                        void (async () => {
                          await saveThresholds(editTarget, editPercentText, editAbsoluteText, editThresholdPriceText);
                          closeEditDialog();
                        })();
                      }}
                      style={{ flex: 1, minHeight: 40 }}
                      textStyle={{ fontSize: 14 }}
                    />
                  </HStack>
                </VStack>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        )}
      </Box>
    </BlurStatusBarView>
  );
}

function SubscriptionCard({
  product,
  actionLabel,
  onAction,
  onEdit,
}: {
  product: ProductPick | SubscriptionItem;
  actionLabel: 'Legg til' | 'Fjern';
  onAction: () => void;
  onEdit?: () => void;
}) {
  const c = useDesignColors();
  const subscription = actionLabel === 'Fjern' ? (product as SubscriptionItem) : null;

  return (
    <Box p={spacing.md} borderRadius={12} style={{ backgroundColor: c.card ?? c.background, borderWidth: 1, borderColor: c.border }}>
      <HStack space="md" alignItems="flex-start">
        <Box
          width={56}
          height={56}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
          style={{ backgroundColor: c.border, overflow: 'hidden' }}
        >
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} style={{ width: 56, height: 56 }} contentFit="contain" />
          ) : (
            <Text fontSize={18} fontWeight="700" style={{ color: c.textMuted }}>
              {product.name.slice(0, 2).toUpperCase()}
            </Text>
          )}
        </Box>

        <VStack flex={1} space="xs">
          <Text fontSize={16} fontWeight="600" style={{ color: c.text }} numberOfLines={2}>
            {product.name}
          </Text>
          <HStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
            <VStack space="xs" flex={1}>
              <Text fontSize={13} style={{ color: c.textMuted }} numberOfLines={1}>
                {product.manufacturer || product.supplier}
              </Text>
              {product.barcode ? (
                <Text fontSize={12} style={{ color: c.textMuted }} numberOfLines={1}>
                  EAN: {product.barcode}
                </Text>
              ) : null}
            </VStack>
            <VStack justifyContent="center" alignItems="flex-end">
              {subscription ? (
                <HStack space="xs">
                  <Pressable
                    onPress={onEdit}
                    hitSlop={10}
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: hairlineWidth,
                      borderColor: c.border,
                      backgroundColor: c.surface,
                    }}
                  >
                    <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                      Rediger
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onAction}
                    hitSlop={10}
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: hairlineWidth,
                      borderColor: '#DC2626',
                      backgroundColor: 'transparent',
                    }}
                  >
                    <Text fontSize={12} fontWeight="700" style={{ color: '#DC2626' }}>
                      Fjern
                    </Text>
                  </Pressable>
                </HStack>
              ) : (
                <Pressable onPress={onAction} hitSlop={10}>
                  <Text fontSize={13} fontWeight="700" style={{ color: c.primary }}>
                    {actionLabel}
                  </Text>
                </Pressable>
              )}
            </VStack>
          </HStack>

          {subscription ? (
            <VStack space="xs" mt={spacing.sm}>
              <Text fontSize={12} fontWeight="600" style={{ color: c.textMuted }}>
                Aktivt varsel
              </Text>
              {(() => {
                const activeRules = [
                  subscription.percentDrop != null
                    ? `Prisnedgang ${String(subscription.percentDrop).replace('.', ',')}%`
                    : null,
                  subscription.absoluteDropKr != null
                    ? `${String(subscription.absoluteDropKr).replace('.', ',')} kr ned`
                    : null,
                  subscription.thresholdPrice != null
                    ? `Under ${String(subscription.thresholdPrice).replace('.', ',')} kr`
                    : null,
                ].filter(Boolean) as string[];

                if (activeRules.length === 0) {
                  return (
                    <Text fontSize={12} style={{ color: c.textMuted }}>
                      Ingen aktive varselregler.
                    </Text>
                  );
                }

                return (
                  <Text fontSize={12} style={{ color: c.textSecondary }}>
                    {activeRules.join(' • ')}
                  </Text>
                );
              })()}
            </VStack>
          ) : null}
        </VStack>
      </HStack>
    </Box>
  );
}

function RuleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = useDesignColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: 999,
        backgroundColor: active ? c.tint ?? c.border : 'transparent',
        borderWidth: 1,
        borderColor: active ? c.tint ?? c.border : c.border,
      }}
    >
      <Text fontSize={13} fontWeight="500" style={{ color: active ? c.background : c.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listScroll: { flex: 1 },
  listContent: { paddingTop: spacing.sm },
  settingsButton: {
    borderWidth: hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
  },
  thresholdInput: {
    borderRadius: radius.md,
    borderWidth: hairlineWidth,
  },
  infoChip: {
    borderWidth: hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  infoBox: {
    borderWidth: hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  infoIconButton: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitBadge: {
    minWidth: 40,
    height: 36,
    borderRadius: radius.md,
    borderWidth: hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
