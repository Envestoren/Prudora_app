import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Text,
  VStack,
  ScrollView,
  Spinner,
  useToast,
  Toast,
  ToastTitle,
  ToastDescription,
  Pressable,
  HStack,
  Input,
  InputField,
} from '@gluestack-ui/themed';
import { Platform, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, hairlineWidth } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import type { Store } from '@/types/database';
import { distanceKm, formatDistance } from '@/lib/location-utils';
import StoresMapView, { type StoresMapViewRef } from '@/components/StoresMapView';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';

type ViewMode = 'list' | 'map';

function openInMaps(lat: number, lng: number, label?: string) {
  const url =
    Platform.OS === 'ios'
      ? `maps:?q=${encodeURIComponent(label || 'Butikk')}&ll=${lat},${lng}`
      : Platform.OS === 'android'
        ? `geo:${lat},${lng}?q=${lat},${lng}`
        : `https://www.google.com/maps?q=${lat},${lng}`;
  Linking.openURL(url);
}

export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const toast = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const mapRef = useRef<StoresMapViewRef>(null);

  const isWeb = Platform.OS === 'web';

  const fetchStores = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stores')
      .select('id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at')
      .order('chain');
    if (error) {
      setStores([]);
      toast.show({
        placement: 'top',
        containerStyle: { marginTop: insets.top },
        render: ({ id }) => (
          <Toast nativeID={`toast-${id}`} action="error" variant="solid">
            <ToastTitle>Kunne ikke hente butikker</ToastTitle>
            <ToastDescription>{error.message}</ToastDescription>
          </Toast>
        ),
      });
      return;
    }
    setStores(data ?? []);
    setLoading(false);
  }, [insets.top, toast]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isWeb) {
          if (typeof navigator !== 'undefined' && navigator.geolocation) {
            await new Promise<void>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  if (!cancelled) setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                  resolve();
                },
                () => resolve(),
                { enableHighAccuracy: false, timeout: 10000 }
              );
            });
          }
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        // Ignore
      }
    })();
    return () => { cancelled = true; };
  }, [isWeb]);

  const sortedStores = useMemo(() => {
    if (!userLocation || stores.length === 0) return stores;
    return [...stores].sort(
      (a, b) =>
        distanceKm(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) -
        distanceKm(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude)
    );
  }, [stores, userLocation]);

  const filteredStores = useMemo(() => {
    const list =
      filterMode === 'favorites' && favoriteStoreIds.length
        ? sortedStores.filter((s) => favoriteStoreIds.includes(s.id))
        : filterMode === 'favorites'
          ? []
          : sortedStores;

    const term = search.trim().toLowerCase();
    if (!term) return list;

    return list.filter((s) => {
      const haystack = `${s.chain} ${s.name ?? ''} ${s.address}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [sortedStores, filterMode, favoriteStoreIds, search]);

  const loadFavorites = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from('favorite_stores')
        .select('store_id')
        .eq('user_id', userId);
      if (error) {
        return;
      }
      setFavoriteStoreIds((data ?? []).map((row) => row.store_id as string));
    },
    []
  );

  useEffect(() => {
    if (!user) {
      setFavoriteStoreIds([]);
      return;
    }
    loadFavorites(user.id);
  }, [user, loadFavorites]);

  const toggleFavorite = useCallback(
    async (storeId: string) => {
      if (!user) return;
      let wasFavorite = false;
      setFavoriteStoreIds((prev) => {
        wasFavorite = prev.includes(storeId);
        return wasFavorite ? prev.filter((id) => id !== storeId) : [...prev, storeId];
      });

      if (wasFavorite) {
        await supabase.from('favorite_stores').delete().eq('user_id', user.id).eq('store_id', storeId);
      } else {
        await supabase.from('favorite_stores').insert({ user_id: user.id, store_id: storeId });
      }
    },
    [user]
  );

  useEffect(() => {
    if (isWeb || viewMode !== 'map' || !userLocation || !mapRef.current) return;
    // Zoom ca. 5 km radius rundt brukerens posisjon
    const region = {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.09,
      longitudeDelta: 0.09,
    };
    if ('animateToRegion' in mapRef.current) {
      // @ts-expect-error: MapView type on ref in native file
      mapRef.current.animateToRegion(region, 500);
    }
  }, [viewMode, userLocation, isWeb]);

  if (loading) {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box
          flex={1}
          pt={insets.top}
          style={{ backgroundColor: c.background }}
          justifyContent="center"
          alignItems="center"
        >
          <Spinner size="large" />
          <Text mt={spacing.md} fontSize={15} style={{ color: c.textMuted }}>
            Henter butikker…
          </Text>
        </Box>
      </BlurStatusBarView>
    );
  }

  const toggleStyle = (active: boolean) => ({
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: active ? (c.tint ?? c.border) : 'transparent',
  });

  const inputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: searchFocused ? 2 : hairlineWidth,
    borderColor: searchFocused ? c.primary : c.border,
  };

  const headerBar = (
    <Box px={spacing.lg} pt={insets.top + spacing.sm} pb={spacing.sm} style={{ backgroundColor: c.background }}>
      <HStack alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={spacing.sm}>
        <Text fontSize={20} fontWeight="700" style={{ color: c.textSecondary }}>
          Butikker
        </Text>
        <HStack space="xs" alignItems="center">
          <Pressable onPress={() => setViewMode('list')} style={toggleStyle(viewMode === 'list')} accessibilityLabel="Listevisning">
            <IconSymbol name="list.bullet" size={22} color={viewMode === 'list' ? c.background : c.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => !isWeb && setViewMode('map')}
            style={[toggleStyle(viewMode === 'map'), isWeb && { opacity: 0.5 }]}
            accessibilityLabel="Kartvisning"
            disabled={isWeb}
          >
            <IconSymbol name="map.fill" size={22} color={viewMode === 'map' ? c.background : c.textMuted} />
          </Pressable>
        </HStack>
      </HStack>
      <HStack mt={spacing.xs} alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={spacing.sm}>
        <HStack space="xs">
          <Pressable
            onPress={() => setFilterMode('all')}
            style={{
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              borderRadius: 999,
              backgroundColor: filterMode === 'all' ? (c.tint ?? c.border) : 'transparent',
              borderWidth: 1,
              borderColor: filterMode === 'all' ? (c.tint ?? c.border) : c.border,
            }}
          >
            <Text
              fontSize={13}
              style={{ color: filterMode === 'all' ? c.background : c.textSecondary }}
            >
              Alle butikker
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFilterMode('favorites')}
            style={{
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              borderRadius: 999,
              backgroundColor: filterMode === 'favorites' ? (c.tint ?? c.border) : 'transparent',
              borderWidth: 1,
              borderColor: filterMode === 'favorites' ? (c.tint ?? c.border) : c.border,
            }}
          >
            <HStack space="xs" alignItems="center">
              <IconSymbol
                name={favoriteStoreIds.length ? 'heart.fill' : 'heart'}
                size={16}
                color={filterMode === 'favorites' ? c.background : c.textSecondary}
              />
              <Text
                fontSize={13}
                style={{ color: filterMode === 'favorites' ? c.background : c.textSecondary }}
              >
                Favoritter
              </Text>
            </HStack>
          </Pressable>
        </HStack>
        <Text fontSize={13} style={{ color: c.textMuted }}>
          {userLocation
            ? 'Sortert etter avstand fra deg'
            : `Viser ${filteredStores.length} butikk${filteredStores.length !== 1 ? 'er' : ''}.`}
        </Text>
      </HStack>
      {viewMode === 'list' && (
        <Box mt={spacing.sm}>
          <Input variant="outline" size="md" style={inputStyle}>
            <InputField
              placeholder="Søk etter butikk eller adresse"
              placeholderTextColor={c.textMuted}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ color: c.text }}
            />
          </Input>
        </Box>
      )}
    </Box>
  );

  const LIST_LOGO_SIZE = 44;

  const listItem = (s: Store) => {
    const km = userLocation ? distanceKm(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude) : null;
    const isFavorite = favoriteStoreIds.includes(s.id);
    return (
      <Box
        key={s.id}
        p={spacing.md}
        borderRadius={12}
        style={{ backgroundColor: c.card ?? c.background, borderWidth: 1, borderColor: c.border }}
      >
        <HStack alignItems="flex-start" flexWrap="wrap">
          <Box
            width={LIST_LOGO_SIZE}
            height={LIST_LOGO_SIZE}
            borderRadius={10}
            style={{ backgroundColor: c.border, marginRight: spacing.md }}
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
          >
            {s.logo_url ? (
              <Image
                source={{ uri: s.logo_url }}
                style={{ width: LIST_LOGO_SIZE, height: LIST_LOGO_SIZE }}
                contentFit="contain"
              />
            ) : (
              <Text fontSize={13} fontWeight="700" style={{ color: c.textMuted }}>
                {s.chain.slice(0, 2).toUpperCase()}
              </Text>
            )}
          </Box>
          <Box flex={1} minWidth={0}>
            <HStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
              <Text fontSize={16} fontWeight="600" style={{ color: c.text }} flex={1}>
                {s.name ? `${s.chain} – ${s.name}` : s.chain}
              </Text>
              {km !== null && (
                <Text fontSize={13} style={{ color: c.textMuted }}>
                  {formatDistance(km)}
                </Text>
              )}
              {user && (
                <Pressable
                  onPress={() => toggleFavorite(s.id)}
                  hitSlop={10}
                  style={{ marginLeft: spacing.sm }}
                  accessibilityLabel={isFavorite ? 'Fjern som favoritt' : 'Sett som favoritt'}
                >
                  <IconSymbol
                    name={isFavorite ? 'heart.fill' : 'heart'}
                    size={20}
                    color={isFavorite ? c.tint ?? c.primary : c.textMuted}
                  />
                </Pressable>
              )}
            </HStack>
            <Text fontSize={14} style={{ color: c.textMuted }} mt={4}>
              {s.address}
            </Text>
            <Text fontSize={13} style={{ color: c.tint }} mt={6} onPress={() => openInMaps(s.latitude, s.longitude, s.address)}>
              Åpne i kart →
            </Text>
          </Box>
        </HStack>
      </Box>
    );
  };

  if (isWeb) {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box flex={1} pb={insets.bottom} style={{ backgroundColor: c.background }}>
          {headerBar}
          {filteredStores.length > 0 ? (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={{ ...styles.listContent, paddingBottom: insets.bottom + spacing.lg }}
              showsVerticalScrollIndicator={false}
            >
              <VStack space="md" px={spacing.lg}>
                {filteredStores.map(listItem)}
              </VStack>
            </ScrollView>
          ) : (
            <Box flex={1} justifyContent="center" alignItems="center" px={spacing.lg}>
              <Text fontSize={15} style={{ color: c.textMuted }}>Ingen butikker å vise.</Text>
            </Box>
          )}
        </Box>
      </BlurStatusBarView>
    );
  }

  if (viewMode === 'map') {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box flex={1} style={{ backgroundColor: c.background }}>
          {headerBar}
          <Box flex={1} pt={spacing.xs}>
            <StoresMapView
              ref={mapRef}
              stores={filteredStores}
              insets={insets}
              showHeader={false}
              cardStyle={{ backgroundColor: c.card ?? c.background, borderColor: c.border }}
              textSecondary={c.textSecondary}
              textMuted={c.textMuted}
              userLocation={userLocation ?? undefined}
              onStorePress={(store) => setSelectedStore(store)}
              onMapPress={() => setSelectedStore(null)}
            />
          </Box>
          {selectedStore && (
            <Box pt={spacing.xs} pb={insets.bottom} style={{ backgroundColor: c.background }}>
              <Box px={spacing.lg}>
                {listItem(selectedStore)}
              </Box>
            </Box>
          )}
        </Box>
      </BlurStatusBarView>
    );
  }

  return (
    <BlurStatusBarView edges={['top']}>
      <Box flex={1} pb={insets.bottom} style={{ backgroundColor: c.background }}>
        {headerBar}
        {filteredStores.length > 0 ? (
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={{ ...styles.listContent, paddingBottom: insets.bottom + spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            <VStack space="md" px={spacing.lg}>
              {filteredStores.map(listItem)}
            </VStack>
          </ScrollView>
        ) : (
          <Box flex={1} justifyContent="center" alignItems="center" px={spacing.lg}>
            <Text fontSize={15} style={{ color: c.textMuted }}>Ingen butikker å vise.</Text>
          </Box>
        )}
      </Box>
    </BlurStatusBarView>
  );
}

const styles = StyleSheet.create({
  listScroll: { flex: 1 },
  listContent: { paddingTop: spacing.sm },
});
