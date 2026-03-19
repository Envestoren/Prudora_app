import { useEffect, useMemo, useState } from 'react';
import { Box, Pressable, ScrollView, Spinner, Text, VStack, HStack } from '@gluestack-ui/themed';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { spacing, radius, hairlineWidth } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import type { Store } from '@/types/database';

export const options = {
  headerShown: false,
};

type PriceRow = {
  id: string;
  recorded_at: string;
  price_amount: number;
};

function formatRecordedAt(ts: string) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StorePricesScreen() {
  const { id, storeId } = useLocalSearchParams<{ id: string; storeId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useDesignColors();

  const productId = Array.isArray(id) ? id[0] : id;
  const sId = Array.isArray(storeId) ? storeId[0] : storeId;

  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [rows, setRows] = useState<PriceRow[]>([]);

  const goBackToProduct = () => {
    if (!productId) return;
    router.replace(`/(tabs)/product/${productId}`);
  };

  const storeTitle = useMemo(() => {
    if (!store) return 'Butikk';
    if (store.name) return `${store.chain} – ${store.name}`;
    return store.chain;
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!productId || !sId) return;
      setLoading(true);
      setStore(null);
      setRows([]);

      const [{ data: storeData }, { data: priceData }] = await Promise.all([
        supabase.from('stores').select('id, chain, name, address, latitude, longitude, logo_url').eq('id', sId).maybeSingle(),
        supabase
          .from('product_prices')
          .select('id, recorded_at, price_amount')
          .eq('product_id', productId)
          .eq('store_id', sId)
          .eq('approval_status', 'approved')
          .order('recorded_at', { ascending: true }),
      ]);

      if (cancelled) return;
      setStore(storeData as Store | null);
      setRows((priceData ?? []) as any);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [productId, sId]);

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
            <Pressable onPress={goBackToProduct} hitSlop={10}>
              <IconSymbol name="chevron.backward" size={22} color={c.textSecondary} />
            </Pressable>
            <Text fontSize={18} fontWeight="700" style={{ color: c.textSecondary }} numberOfLines={1} flex={1}>
              {storeTitle}
            </Text>
          </HStack>
        </Box>

        {loading ? (
          <Box flex={1} justifyContent="center" alignItems="center" style={{ backgroundColor: c.background }}>
            <Spinner size="large" />
            <Text mt={spacing.md} fontSize={15} style={{ color: c.textMuted }}>
              Laster priser…
            </Text>
          </Box>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            <VStack space="sm" px={spacing.lg} mt={spacing.md}>
              {rows.length === 0 ? (
                <Box p={spacing.md} borderRadius={radius.xl} style={{ borderWidth: hairlineWidth, borderColor: c.border }}>
                  <Text fontSize={13} style={{ color: c.textMuted }}>
                    Ingen registrerte priser for denne butikken.
                  </Text>
                </Box>
              ) : (
                rows.map((r) => (
                  <Box
                    key={r.id}
                    p={spacing.sm}
                    borderRadius={radius.lg}
                    style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                  >
                    <HStack justifyContent="space-between" alignItems="center">
                      <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                        {Number(r.price_amount).toFixed(2)} kr
                      </Text>
                      <Text fontSize={12} style={{ color: c.textMuted }} numberOfLines={1}>
                        {formatRecordedAt(r.recorded_at)}
                      </Text>
                    </HStack>
                  </Box>
                ))
              )}
            </VStack>
          </ScrollView>
        )}
      </Box>
    </BlurStatusBarView>
  );
}

