import { useEffect, useState } from 'react';
import { Box, HStack, Text, VStack, Spinner, Pressable } from '@gluestack-ui/themed';
import { Platform, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import type { Store } from '@/types/database';
import { IconSymbol } from '@/components/ui/icon-symbol';

function openInMaps(lat: number, lng: number, label?: string) {
  const url =
    Platform.OS === 'ios'
      ? `maps:?q=${encodeURIComponent(label || 'Butikk')}&ll=${lat},${lng}`
      : Platform.OS === 'android'
        ? `geo:${lat},${lng}?q=${lat},${lng}`
        : `https://www.google.com/maps?q=${lat},${lng}`;
  Linking.openURL(url);
}

export const options = {
  headerShown: false,
};

export default function StoreDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { data } = await supabase
        .from('stores')
        .select('id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();
      if (!cancelled) {
        setStore(data as Store | null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box
          flex={1}
          pt={insets.top}
          pb={insets.bottom}
          justifyContent="center"
          alignItems="center"
          style={{ backgroundColor: c.background }}
        >
          <Spinner size="large" />
          <Text mt={spacing.md} fontSize={15} style={{ color: c.textMuted }}>
            Laster butikk…
          </Text>
        </Box>
      </BlurStatusBarView>
    );
  }

  if (!store) {
    return (
      <BlurStatusBarView edges={['top']}>
        <Box
          flex={1}
          pt={insets.top}
          pb={insets.bottom}
          justifyContent="center"
          alignItems="center"
          style={{ backgroundColor: c.background }}
        >
          <Text fontSize={16} fontWeight="600" style={{ color: c.text }}>
            Fant ikke butikken
          </Text>
          <Pressable mt={spacing.md} onPress={() => router.back()}>
            <Text fontSize={14} style={{ color: c.tint }}>
              Gå tilbake
            </Text>
          </Pressable>
        </Box>
      </BlurStatusBarView>
    );
  }

  const title = store.name ? `${store.chain} – ${store.name}` : store.chain;

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
          <HStack alignItems="center" space="sm">
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <IconSymbol name="chevron.backward" size={22} color={c.textSecondary} />
            </Pressable>
            <Text fontSize={18} fontWeight="700" style={{ color: c.textSecondary }} numberOfLines={1}>
              {store.chain}
            </Text>
          </HStack>
        </Box>

        <Box flex={1} px={spacing.lg} pt={spacing.lg}>
          <VStack space="lg">
            <HStack space="md" alignItems="center">
              <Box
                width={64}
                height={64}
                borderRadius={16}
                alignItems="center"
                justifyContent="center"
                bg={c.border}
                overflow="hidden"
              >
                {store.logo_url ? (
                  <Image source={{ uri: store.logo_url }} style={{ width: 64, height: 64 }} contentFit="contain" />
                ) : (
                  <Text fontSize={18} fontWeight="700" style={{ color: c.textMuted }}>
                    {store.chain.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </Box>
              <VStack flex={1} space="xs">
                <Text fontSize={18} fontWeight="700" style={{ color: c.text }} numberOfLines={2}>
                  {title}
                </Text>
                <Text fontSize={14} style={{ color: c.textMuted }}>
                  {store.address}
                </Text>
              </VStack>
            </HStack>

            <Pressable
              onPress={() => openInMaps(store.latitude, store.longitude, store.address)}
              borderRadius={12}
              px={spacing.md}
              py={spacing.md}
              bg={c.card ?? c.background}
              style={{ borderWidth: 1, borderColor: c.border }}
            >
              <HStack alignItems="center" justifyContent="space-between">
                <VStack flex={1} space="xs">
                  <Text fontSize={15} fontWeight="600" style={{ color: c.text }}>
                    Åpne i kart
                  </Text>
                  <Text fontSize={13} style={{ color: c.textMuted }}>
                    Åpner i din kart‑app
                  </Text>
                </VStack>
                <IconSymbol name="map.fill" size={22} color={c.tint} />
              </HStack>
            </Pressable>
          </VStack>
        </Box>
      </Box>
    </BlurStatusBarView>
  );
}

