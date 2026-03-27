import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box, HStack, Pressable, ScrollView, Spinner, Text, VStack } from '@gluestack-ui/themed';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { useAuth } from '@/lib/auth-context';
import { spacing, radius, hairlineWidth } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import { distanceKm } from '@/lib/location-utils';
import { Input as BnaInput } from '@/components/ui/input';
import { LineChart } from '@/components/charts/line-chart';
import type { ChartDataPoint } from '@/components/charts/line-chart';
import type { Product, ProductPrice, Store } from '@/types/database';
import { IconSymbol } from '@/components/ui/icon-symbol';

export const options = {
  headerShown: false,
};

type PriceRow = Pick<ProductPrice, 'id' | 'product_id' | 'store_id' | 'recorded_at' | 'approval_status'> & {
  price_amount: number;
};

type StoreHistory = {
  store_id: string;
  store: Store | null;
  prices: PriceRow[];
  lastUpdatedAt: string;
  lastUpdatedLabel: string;
};

type ChartSeries = {
  storeId: string;
  label: string;
  color: string;
  points: { x: number; y: number; price: number }[];
};

function formatRelativeDays(recordedAt: string) {
  const t = Date.parse(recordedAt);
  if (!Number.isFinite(t)) return '—';

  const diffMs = Date.now() - t;
  const days = Math.floor(diffMs / 86400000);

  if (days <= 0) return 'i dag';
  if (days === 1) return '1 dag';
  if (days >= 8) return 'mer enn en uke';
  return `${days} dager`;
}

function formatStoreLabel(store: Store | null) {
  if (!store) return 'Butikk';
  return store.name ? `${store.chain} – ${store.name}` : store.chain;
}

function formatChange(value: number) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} kr`;
}

function formatLatestPriceAgeBucket(recordedAt: string) {
  const t = Date.parse(recordedAt);
  if (!Number.isFinite(t)) return '—';
  const diffMs = Date.now() - t;
  const hours = diffMs / 3600000;

  if (hours < 24) return '<24';
  if (hours < 72) return '< 3 dager';
  if (hours < 7 * 24) return '< 1 uke';
  return 'mer enn en uke';
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function PriceLineChart({
  series,
  xDomain,
}: {
  series: ChartSeries[];
  /** Hele tidsvinduet som skal vises (ms), typisk [nå − intervall, nå] */
  xDomain: { min: number; max: number };
}) {
  const activeSeries = series.filter((s) => s.points.length > 0);
  if (activeSeries.length === 0) return null;
  const chartSeries = activeSeries.map((s) => ({
    id: s.storeId,
    label: s.label,
    color: s.color,
    data: s.points.map((p) => ({
      x: p.x, // timestamp for proper x-scaling
      y: p.y,
      label: new Date(p.x).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' }),
    })) satisfies ChartDataPoint[],
  }));

  return (
    <Box style={styles.chartWrap}>
      <LineChart
        series={chartSeries}
        config={{
          height: 240,
          showGrid: true,
          showLabels: true,
          showYLabels: true,
          yAxisWidth: 44,
          yLabelCount: 5,
          interactive: true,
          gradient: false,
          animated: true,
          xDomain,
        }}
      />

      {/* Pris min/max fra faktiske målinger; Fra/Til = hele valgt intervall */}
      {(() => {
        const all = activeSeries.flatMap((s) => s.points);
        if (!all.length) return null;
        const minPrice = Math.min(...all.map((p) => p.price));
        const maxPrice = Math.max(...all.map((p) => p.price));
        return (
          <>
            <HStack justifyContent="space-between" width="100%" px={spacing.sm} mt={spacing.md}>
              <Text fontSize={11} style={{ color: '#6B7280' }}>
                Min pris: {minPrice.toFixed(2)} kr
              </Text>
              <Text fontSize={11} style={{ color: '#6B7280' }}>
                Maks pris: {maxPrice.toFixed(2)} kr
              </Text>
            </HStack>
            <HStack justifyContent="space-between" width="100%" px={spacing.sm} mt={spacing.xs}>
              <Text fontSize={11} style={{ color: '#6B7280' }}>
                Fra: {new Date(xDomain.min).toLocaleDateString('nb-NO')}
              </Text>
              <Text fontSize={11} style={{ color: '#6B7280' }}>
                Til: {new Date(xDomain.max).toLocaleDateString('nb-NO')}
              </Text>
            </HStack>
          </>
        );
      })()}
    </Box>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const { user } = useAuth();

  /** Alltid til Produkter-fanen (listen), ikke bare én steg tilbake i stacken */
  const goToProductsList = () => {
    router.replace('/(tabs)/produkter');
  };

  const productId = Array.isArray(id) ? id[0] : id;

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [priceRows, setPriceRows] = useState<PriceRow[]>([]);
  const [storeById, setStoreById] = useState<Record<string, Store>>({});
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [interval, setInterval] = useState<'4w' | '12w' | '52w'>('12w');
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const MAX_STORE_SELECTION = 5;
  const [storePickerMode, setStorePickerMode] = useState<'favorites' | 'nearest' | 'search'>('nearest');
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const hasAppliedInitialFavoriteSelection = useRef(false);

  // "Sist hentet inn" (uansett butikk/status)
  const [latestOverallRecordedAt, setLatestOverallRecordedAt] = useState<string | null>(null);
  // Nyeste pris i hver valgt butikk (uansett butikk/status)
  const [latestPriceByStoreId, setLatestPriceByStoreId] = useState<
    Record<string, { price_amount: number; recorded_at: string }>
  >({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!productId) return;
      setLoading(true);
      setProduct(null);
      setPriceRows([]);
      setStoreById({});
      setSelectedStoreIds([]);
      hasAppliedInitialFavoriteSelection.current = false;

      const { data: productData, error: productError } = await supabase
        .from('products')
        .select(
          'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, barcode, approval_status, created_at, updated_at'
        )
        .eq('id', productId)
        .maybeSingle();

      if (cancelled) return;

      if (productError) {
        setProduct(null);
        setLoading(false);
        return;
      }

      const { data: pricesData, error: pricesError } = await supabase
        .from('product_prices')
        .select('id, product_id, store_id, price_amount, recorded_at, approval_status')
        .eq('product_id', productId)
        .eq('approval_status', 'approved')
        .order('recorded_at', { ascending: true });

      if (cancelled) return;

      if (pricesError) {
        setProduct(productData as Product | null);
        setPriceRows([]);
        setStoreById({});
        setLoading(false);
        return;
      }

      const normalizedRows: PriceRow[] = (pricesData ?? []).map((row: any) => ({
        id: row.id as string,
        product_id: row.product_id as string,
        store_id: row.store_id as string,
        recorded_at: row.recorded_at as string,
        approval_status: row.approval_status as PriceRow['approval_status'],
        price_amount: typeof row.price_amount === 'number' ? row.price_amount : Number(row.price_amount),
      }));

      const storeIds = Array.from(new Set(normalizedRows.map((r) => r.store_id)));

      const { data: storesData } = storeIds.length
        ? await supabase
            .from('stores')
            .select('id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at')
            .in('id', storeIds)
        : { data: [] as Store[] };

      if (cancelled) return;

      const byId: Record<string, Store> = {};
      (storesData ?? []).forEach((s: Store) => {
        byId[s.id] = s;
      });

      const storeIdOrder = Array.from(new Set(normalizedRows.map((r) => r.store_id)));

      setProduct(productData as Product | null);
      setPriceRows(normalizedRows);
      setStoreById(byId);
      // Start med ingen valgte butikker; vis kun det brukeren faktisk trykker.
      setSelectedStoreIds([]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Hent "sist hentet inn" og nyeste pris per valgt butikk
  useEffect(() => {
    let cancelled = false;
    if (!productId) {
      setLatestOverallRecordedAt(null);
      setLatestPriceByStoreId({});
      return;
    }

    (async () => {
      // Overordnet nyeste pris for produktet (uansett butikk/status)
      const { data: latestAny } = await supabase
        .from('product_prices')
        .select('recorded_at')
        .eq('product_id', productId)
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (cancelled) return;
      setLatestOverallRecordedAt((latestAny?.[0] as any)?.recorded_at ?? null);

      if (selectedStoreIds.length === 0) {
        setLatestPriceByStoreId({});
        return;
      }

      const latestEntries = await Promise.all(
        selectedStoreIds.map(async (storeId) => {
          const { data, error } = await supabase
            .from('product_prices')
            .select('price_amount, recorded_at')
            .eq('product_id', productId)
            .eq('store_id', storeId)
            .order('recorded_at', { ascending: false })
            .limit(1);

          if (error || !data || !data[0]) return null;
          const row = data[0] as any;
          const recorded_at = row.recorded_at as string | undefined;
          const price_amount =
            typeof row.price_amount === 'number' ? row.price_amount : Number(row.price_amount);
          if (!recorded_at || !Number.isFinite(price_amount)) return null;

          return { storeId, price_amount, recorded_at };
        })
      );

      if (cancelled) return;
      const map: Record<string, { price_amount: number; recorded_at: string }> = {};
      for (const entry of latestEntries) {
        if (!entry) continue;
        map[entry.storeId] = { price_amount: entry.price_amount, recorded_at: entry.recorded_at };
      }
      setLatestPriceByStoreId(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [productId, selectedStoreIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        // ignore location failures; picker still works with default order
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Last inn favorittbutikker for innlogget bruker
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setFavoriteStoreIds([]);
        return;
      }
      const { data, error } = await supabase
        .from('favorite_stores')
        .select('store_id')
        .eq('user_id', user.id);

      if (cancelled) return;
      if (error) {
        setFavoriteStoreIds([]);
        return;
      }

      setFavoriteStoreIds((data ?? []).map((row: any) => row.store_id as string).filter(Boolean));
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const historiesAll = useMemo<StoreHistory[]>(() => {
    if (!priceRows.length) return [];

    const byStore: Record<string, PriceRow[]> = {};
    for (const row of priceRows) {
      (byStore[row.store_id] ||= []).push(row);
    }

    return Object.entries(byStore)
      .map(([store_id, prices]) => {
        const last = prices[prices.length - 1];
        const store = storeById[store_id] ?? null;
        return {
          store_id,
          store,
          prices,
          lastUpdatedAt: last.recorded_at,
          lastUpdatedLabel: formatRelativeDays(last.recorded_at),
        };
      })
      .sort((a, b) => Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt));
  }, [priceRows, storeById]);

  const intervalMs = useMemo(() => {
    if (interval === '4w') return 4 * 7 * 24 * 60 * 60 * 1000;
    if (interval === '52w') return 52 * 7 * 24 * 60 * 60 * 1000;
    return 12 * 7 * 24 * 60 * 60 * 1000;
  }, [interval]);

  /** Graf + filter: alltid [nå − intervall, nå] slik at hele tidslinjen vises (tomt der det ikke finnes data). */
  const chartXDomain = useMemo(() => {
    const max = Date.now();
    const min = max - intervalMs;
    return { min, max };
  }, [intervalMs]);

  const historiesFiltered = useMemo<StoreHistory[]>(() => {
    const { min, max } = chartXDomain;
    return historiesAll
      .map((history) => ({
        ...history,
        prices: history.prices.filter((p) => {
          const t = Date.parse(p.recorded_at);
          return t >= min && t <= max;
        }),
      }))
      .filter((history) => history.prices.length > 0);
  }, [historiesAll, chartXDomain]);

  const storesByDistance = useMemo(() => {
    if (!userLocation) return historiesAll;
    return [...historiesAll].sort((a, b) => {
      if (!a.store || !b.store) return 0;
      const da = distanceKm(userLocation.latitude, userLocation.longitude, a.store.latitude, a.store.longitude);
      const db = distanceKm(userLocation.latitude, userLocation.longitude, b.store.latitude, b.store.longitude);
      return da - db;
    });
  }, [historiesAll, userLocation]);

  const nearestStoreIds5 = useMemo(() => {
    return storesByDistance.slice(0, 5).map((h) => h.store_id);
  }, [storesByDistance]);

  // Sørg for at graf og "Nyeste priser" bare viser butikker som matcher valgt modus.
  useEffect(() => {
    if (storePickerMode === 'favorites') {
      const allowed = new Set(favoriteStoreIds);
      setSelectedStoreIds((prev) => prev.filter((id) => allowed.has(id)));
    }

    if (storePickerMode === 'nearest') {
      // I "nærmeste" kan du velge inntil 5, men visningen er begrenset til 5 nærmeste.
      const allowed = new Set(nearestStoreIds5);
      setSelectedStoreIds((prev) => prev.filter((id) => allowed.has(id)));
    }
  }, [storePickerMode, favoriteStoreIds, nearestStoreIds5]);

  const storePickerResults = useMemo(() => {
    if (storePickerMode === 'favorites') {
      if (!favoriteStoreIds.length) return [];
      return storesByDistance.filter((h) => favoriteStoreIds.includes(h.store_id));
    }

    if (storePickerMode === 'nearest') {
      return storesByDistance.slice(0, 5);
    }

    // search mode
    const q = storeSearch.trim().toLowerCase();
    if (!q) return storesByDistance.slice(0, 5);
    return storesByDistance.filter((h) => {
      const s = h.store;
      const label = `${s?.chain ?? ''} ${s?.name ?? ''} ${s?.address ?? ''}`.toLowerCase();
      return label.includes(q);
    });
  }, [storesByDistance, storeSearch, storePickerMode, favoriteStoreIds]);

  useEffect(() => {
    const allIds = historiesAll.map((h) => h.store_id);
    if (!allIds.length) return;

    // Første gang data er lastet: forhåndsvelg alle favorittbutikker med data.
    if (!hasAppliedInitialFavoriteSelection.current) {
      const favoriteWithData = favoriteStoreIds.filter((id) => allIds.includes(id));
      if (favoriteWithData.length > 0) {
        setSelectedStoreIds(favoriteWithData);
        setStorePickerMode('favorites');
      } else {
        setSelectedStoreIds((prev) => prev.filter((id) => allIds.includes(id)));
      }
      hasAppliedInitialFavoriteSelection.current = true;
      return;
    }

    // Etter init: behold brukerens valg, men fjern butikker som ikke lenger finnes i datasettet.
    setSelectedStoreIds((prev) => prev.filter((id) => allIds.includes(id)));
  }, [historiesAll, favoriteStoreIds]);

  const selectedHistories = useMemo(
    () => historiesFiltered.filter((h) => selectedStoreIds.includes(h.store_id)),
    [historiesFiltered, selectedStoreIds]
  );

  const storeColors = useMemo(() => {
    const palette = ['#2563EB', '#F97316', '#10B981', '#A855F7', '#EC4899', '#EAB308', '#14B8A6', '#EF4444'];
    const byStore: Record<string, string> = {};
    historiesAll.forEach((history, i) => {
      byStore[history.store_id] = palette[i % palette.length];
    });
    return byStore;
  }, [historiesAll]);

  const chartSeries = useMemo<ChartSeries[]>(() => {
    return selectedHistories.map((history) => ({
      storeId: history.store_id,
      label: formatStoreLabel(history.store),
      color: storeColors[history.store_id] ?? '#2563EB',
      points: history.prices.map((price) => ({
        x: Date.parse(price.recorded_at),
        y: price.price_amount,
        price: price.price_amount,
      })),
    }));
  }, [selectedHistories, storeColors]);

  const cheapestRegistered = useMemo(() => {
    if (!priceRows.length) return null;
    let cheapest: PriceRow | null = null;
    for (const row of priceRows) {
      if (!Number.isFinite(row.price_amount)) continue;
      if (!cheapest || row.price_amount < cheapest.price_amount) {
        cheapest = row;
      }
    }
    if (!cheapest) return null;
    return {
      price: cheapest.price_amount,
      updatedLabel: formatRelativeDays(cheapest.recorded_at),
    };
  }, [priceRows]);

  const changeMetrics = useMemo(() => {
    return selectedHistories.map((history) => {
      const first = history.prices[0];
      const last = history.prices[history.prices.length - 1];
      const delta = last.price_amount - first.price_amount;
      const percent = first.price_amount !== 0 ? (delta / first.price_amount) * 100 : null;
      return {
        storeId: history.store_id,
        storeLabel: formatStoreLabel(history.store),
        color: storeColors[history.store_id] ?? '#2563EB',
        firstPrice: first.price_amount,
        lastPrice: last.price_amount,
        delta,
        percent,
        lastUpdatedLabel: history.lastUpdatedLabel,
      };
    });
  }, [selectedHistories, storeColors]);

  const toggleStore = (storeId: string) => {
    setSelectedStoreIds((prev) => {
      if (prev.includes(storeId)) return prev.filter((id) => id !== storeId);
      if (storePickerMode !== 'favorites' && prev.length >= MAX_STORE_SELECTION) return prev;
      return [...prev, storeId];
    });
  };

  if (loading) {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box flex={1} pt={insets.top} pb={insets.bottom} justifyContent="center" alignItems="center" style={{ backgroundColor: c.background }}>
          <Spinner size="large" />
          <Text mt={spacing.md} fontSize={15} style={{ color: c.textMuted }}>
            Laster prishistorikk…
          </Text>
        </Box>
      </BlurStatusBarView>
    );
  }

  if (!product) {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box flex={1} pt={insets.top} pb={insets.bottom} justifyContent="center" alignItems="center" style={{ backgroundColor: c.background }}>
          <Text fontSize={16} fontWeight="600" style={{ color: c.text }}>
            Fant ikke produkt
          </Text>
          <Pressable mt={spacing.md} onPress={goToProductsList} hitSlop={10}>
            <Text fontSize={14} style={{ color: c.tint }}>
              Til produkter
            </Text>
          </Pressable>
        </Box>
      </BlurStatusBarView>
    );
  }

  return (
    <BlurStatusBarView edges={['top']}>
      <Box flex={1} pb={insets.bottom} style={{ backgroundColor: c.background }}>
        <Box
          pt={insets.top + spacing.sm}
          pb={spacing.sm}
          px={spacing.lg}
          borderBottomWidth={1}
          borderBottomColor={c.border}
          bg={c.background}
        >
          <Pressable
            onPress={goToProductsList}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Tilbake til produkter"
          >
            <HStack alignItems="center" space="xs">
              <IconSymbol name="chevron.backward" size={22} color={c.textSecondary} />
              <Text fontSize={17} fontWeight="600" style={{ color: c.textSecondary }} numberOfLines={1}>
                Produkter
              </Text>
            </HStack>
          </Pressable>
        </Box>

        <VStack flex={1} px={spacing.lg} pt={spacing.lg} space="lg">
          <Box
            borderRadius={radius.xl}
            style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
            p={spacing.md}
          >
            <HStack space="md">
              <Box
                width={72}
                height={72}
                borderRadius={12}
                alignItems="center"
                justifyContent="center"
                style={{ backgroundColor: c.border, overflow: 'hidden' }}
              >
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={{ width: 72, height: 72 }} contentFit="cover" />
                ) : (
                  <Text fontSize={20} fontWeight="700" style={{ color: c.textMuted }}>
                    {product.name.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </Box>
              <VStack flex={1} space="xs">
                <Text fontSize={18} fontWeight="800" style={{ color: c.text }} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text fontSize={13} style={{ color: c.textMuted }} numberOfLines={1}>
                  {product.manufacturer || product.supplier}
                </Text>
                <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }}>
                  {cheapestRegistered
                    ? `${cheapestRegistered.price.toFixed(2)} kr / ${product.unit}`
                    : `Ingen registrert pris / ${product.unit}`}
                </Text>
                {latestOverallRecordedAt && (
                  <Text fontSize={12} style={{ color: c.textMuted }}>
                    Sist hentet inn: {formatLatestPriceAgeBucket(latestOverallRecordedAt)}
                  </Text>
                )}
                {product.is_weight_item && (
                  <Text fontSize={12} style={{ color: c.textMuted }}>
                    Vektvare
                  </Text>
                )}
              </VStack>
            </HStack>
          </Box>

          {historiesAll.length === 0 ? (
            <Box flex={1} justifyContent="center" alignItems="center">
              <Text fontSize={16} fontWeight="600" style={{ color: c.textSecondary }}>
                Ingen prishistorikk ennå
              </Text>
              <Text mt={spacing.xs} fontSize={14} style={{ color: c.textMuted, textAlign: 'center' }}>
                Når noen registrerer en pris, vil den dukke opp her per butikk.
              </Text>
            </Box>
          ) : (
            <Pressable flex={1} onPress={() => setStorePickerOpen(false)}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: spacing.lg }}
              >
                <Pressable onPress={(e: any) => e?.stopPropagation?.()}>
              <VStack space="md">
                <VStack space="xs">
                  <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                    Velg butikk
                  </Text>
                  <HStack space="sm" flexWrap="wrap">
                    {[
                      { mode: 'favorites' as const, label: 'Favoritter' },
                      { mode: 'nearest' as const, label: 'Nærmeste' },
                      { mode: 'search' as const, label: 'Velg & søk' },
                    ].map((opt) => {
                      const active = storePickerMode === opt.mode;
                      const nextOpen = !(storePickerOpen && active);
                      return (
                        <Pressable
                          key={opt.mode}
                          onPress={() => {
                            setStorePickerMode(opt.mode);
                            setStorePickerOpen(nextOpen);

                            if (nextOpen) {
                              if (opt.mode === 'nearest') {
                                // Vis og forhåndsvelg fem nærmeste.
                                setSelectedStoreIds(nearestStoreIds5);
                              }
                              if (opt.mode === 'search') {
                                // Ingen forhåndsvalg i "Velg & søk"
                                setSelectedStoreIds([]);
                                setStoreSearch('');
                              }
                            }
                          }}
                          style={{
                            paddingVertical: spacing.xs,
                            paddingHorizontal: spacing.sm,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? (c.tint ?? c.border) : c.border,
                            backgroundColor: active ? (c.tint ?? c.border) : 'transparent',
                          }}
                        >
                          <Text
                            fontSize={13}
                            fontWeight="600"
                            style={{ color: active ? c.background : c.textSecondary }}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </HStack>

                  {storePickerOpen && (
                    <Box
                      p={spacing.sm}
                      borderRadius={radius.lg}
                      style={{ borderWidth: hairlineWidth, borderColor: c.border, backgroundColor: c.surface }}
                    >
                      {storePickerMode === 'search' && (
                        <>
                          <BnaInput
                            variant="outline"
                            placeholder="Søk butikk (navn, kjede, adresse)"
                            value={storeSearch}
                            onChangeText={setStoreSearch}
                          />
                          {!storeSearch.trim() && (
                            <Text mt={spacing.xs} fontSize={12} style={{ color: c.textMuted }}>
                              Viser nærmeste butikker først.
                            </Text>
                          )}
                        </>
                      )}

                      {storePickerMode === 'favorites' && (
                        <Text fontSize={12} style={{ color: c.textMuted, marginTop: spacing.xs }}>
                          Velg fra favoritter
                        </Text>
                      )}

                      {storePickerMode === 'nearest' && (
                        <Text fontSize={12} style={{ color: c.textMuted, marginTop: spacing.xs }}>
                          Velg fra 5 nærmeste
                        </Text>
                      )}
                      <ScrollView
                        style={{ maxHeight: 260, marginTop: spacing.sm }}
                        showsVerticalScrollIndicator={false}
                      >
                        <VStack space="xs">
                          {storePickerResults.map((h) => {
                            const active = selectedStoreIds.includes(h.store_id);
                            const canSelectMore =
                              active || storePickerMode === 'favorites' || selectedStoreIds.length < MAX_STORE_SELECTION;
                            const color = storeColors[h.store_id] ?? '#2563EB';
                            const store = h.store;
                            const distanceLabel =
                              userLocation && store
                                ? `${distanceKm(userLocation.latitude, userLocation.longitude, store.latitude, store.longitude).toFixed(1)} km`
                                : null;
                            return (
                              <Pressable
                                key={`picker-${h.store_id}`}
                                disabled={!canSelectMore}
                                onPress={() => canSelectMore && toggleStore(h.store_id)}
                                style={{
                                  paddingVertical: spacing.xs,
                                  paddingHorizontal: spacing.sm,
                                  borderRadius: radius.md,
                                  borderWidth: 1,
                                  borderColor: active ? (c.tint ?? c.border) : c.border,
                                  backgroundColor: active ? (c.tint ?? c.border) : 'transparent',
                                  opacity: canSelectMore ? 1 : 0.5,
                                }}
                              >
                                <HStack alignItems="center" justifyContent="space-between" space="sm">
                                  <HStack alignItems="center" space="xs" flex={1}>
                                    <Box width={8} height={8} borderRadius={999} style={{ backgroundColor: color }} />
                                    <Text
                                      fontSize={13}
                                      fontWeight="700"
                                      style={{ color: active ? c.background : c.textSecondary }}
                                      numberOfLines={1}
                                      flex={1}
                                    >
                                      {formatStoreLabel(h.store)}
                                    </Text>
                                  </HStack>
                                  <Text fontSize={12} style={{ color: active ? c.background : c.textMuted }}>
                                    {distanceLabel ?? h.lastUpdatedLabel}
                                  </Text>
                                </HStack>
                              </Pressable>
                            );
                          })}
                        </VStack>
                      </ScrollView>
                    </Box>
                  )}
                </VStack>

                <VStack space="xs">
                  <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                    Intervall
                  </Text>
                  <HStack space="sm" flexWrap="wrap">
                    {[
                      { id: '4w' as const, label: '4 uker' },
                      { id: '12w' as const, label: '12 uker' },
                      { id: '52w' as const, label: '52 uker' },
                    ].map((opt) => {
                      const active = interval === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setInterval(opt.id)}
                          style={{
                            paddingVertical: spacing.xs,
                            paddingHorizontal: spacing.sm,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? (c.tint ?? c.border) : c.border,
                            backgroundColor: active ? (c.tint ?? c.border) : 'transparent',
                          }}
                        >
                          <Text fontSize={13} style={{ color: active ? c.background : c.textSecondary }}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </HStack>
                </VStack>

                {selectedStoreIds.length === 0 ? (
                  <Box p={spacing.md} borderRadius={radius.xl} style={{ borderWidth: hairlineWidth, borderColor: c.border }}>
                    <Text fontSize={13} style={{ color: c.textMuted }}>
                      Velg minst én butikk for å vise graf og endringer.
                    </Text>
                  </Box>
                ) : (
                  <Box
                    borderRadius={radius.xl}
                    style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                    p={spacing.md}
                  >
                    <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                      Prisutvikling ({interval === '4w' ? '4 uker' : interval === '12w' ? '12 uker' : '52 uker'})
                    </Text>

                    {chartSeries.length > 0 ? (
                      <>
                        <PriceLineChart series={chartSeries} xDomain={chartXDomain} />

                        <VStack space="xs" mt={spacing.sm}>
                          {changeMetrics.map((metric) => (
                            <Box
                              key={metric.storeId}
                              p={spacing.sm}
                              borderRadius={radius.lg}
                              style={{ borderWidth: hairlineWidth, borderColor: c.border }}
                            >
                              <HStack justifyContent="space-between" alignItems="center">
                                <HStack space="xs" alignItems="center" flex={1}>
                                  <Box width={8} height={8} borderRadius={999} style={{ backgroundColor: metric.color }} />
                                  <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }} numberOfLines={1} flex={1}>
                                    {metric.storeLabel}
                                  </Text>
                                </HStack>
                                <Text fontSize={12} style={{ color: c.textMuted }}>
                                  Sist: {metric.lastUpdatedLabel}
                                </Text>
                              </HStack>
                              <HStack justifyContent="space-between" mt={spacing.xs}>
                                <Text fontSize={12} style={{ color: c.textMuted }}>
                                  {metric.firstPrice.toFixed(2)} kr → {metric.lastPrice.toFixed(2)} kr
                                </Text>
                                <Text
                                  fontSize={12}
                                  fontWeight="700"
                                  style={{
                                    color:
                                      metric.delta > 0
                                        ? '#DC2626'
                                        : metric.delta < 0
                                          ? '#16A34A'
                                          : c.textSecondary,
                                  }}
                                >
                                  {formatChange(metric.delta)} ({formatPercent(metric.percent)})
                                </Text>
                              </HStack>
                            </Box>
                          ))}
                        </VStack>
                      </>
                    ) : (
                      <Text mt={spacing.sm} fontSize={13} style={{ color: c.textMuted }}>
                        Ingen prispunkter i valgt intervall for valgte butikker.
                      </Text>
                    )}
                  </Box>
                )}

                {selectedStoreIds.length > 0 && (
                  <Box
                    borderRadius={radius.xl}
                    style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                    p={spacing.md}
                  >
                    <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                      Nyeste priser
                    </Text>

                    <VStack space="xs" mt={spacing.sm}>
                      {selectedStoreIds.map((storeId) => {
                        const store = storeById[storeId] ?? null;
                        const latest = latestPriceByStoreId[storeId];
                        const bucket = latest?.recorded_at ? formatLatestPriceAgeBucket(latest.recorded_at) : '—';
                        const color = storeColors[storeId] ?? '#2563EB';

                        return (
                          <Pressable
                            key={`latest-${storeId}`}
                            onPress={() => {
                              if (!productId) return;
                              router.push(`/(tabs)/product/${productId}/store-prices/${storeId}`);
                            }}
                            style={{}}
                          >
                            <Box
                              p={spacing.sm}
                              borderRadius={radius.lg}
                              style={{ borderWidth: hairlineWidth, borderColor: c.border }}
                            >
                              <HStack justifyContent="space-between" alignItems="center">
                                <HStack space="xs" alignItems="center" flex={1}>
                                  <Box width={8} height={8} borderRadius={999} style={{ backgroundColor: color }} />
                                  <Text
                                    fontSize={13}
                                    fontWeight="700"
                                    style={{ color: c.textSecondary }}
                                    numberOfLines={1}
                                    flex={1}
                                  >
                                    {formatStoreLabel(store)}
                                  </Text>
                                </HStack>
                                <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                                  {latest ? `${latest.price_amount.toFixed(2)} kr` : 'Pris mangler'}
                                </Text>
                              </HStack>
                              <Text fontSize={11} style={{ color: c.textMuted, marginTop: spacing.xs }}>
                                Oppd. {bucket}
                              </Text>
                            </Box>
                          </Pressable>
                        );
                      })}
                    </VStack>
                  </Box>
                )}

                {historiesFiltered.length === 0 && (
                  <Box p={spacing.md} borderRadius={radius.xl} style={{ borderWidth: hairlineWidth, borderColor: c.border }}>
                    <Text fontSize={13} style={{ color: c.textMuted }}>
                      Ingen registrerte priser i valgt intervall.
                    </Text>
                  </Box>
                )}
              </VStack>
                </Pressable>
              </ScrollView>
            </Pressable>
          )}
        </VStack>
      </Box>
    </BlurStatusBarView>
  );
}

const styles = StyleSheet.create({
  chartWrap: {
    alignItems: 'center',
    width: '100%',
    overflow: 'hidden',
  },
});

