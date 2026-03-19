import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  ScrollView,
  Spinner,
  Input,
  InputField,
  Pressable,
} from '@gluestack-ui/themed';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, hairlineWidth } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import type { Product, ProductCategory } from '@/types/database';

type EnrichedProduct = Product & {
  category?: ProductCategory | null;
};

function formatPriceUpdatedShort(recordedAt: string) {
  const t = Date.parse(recordedAt);
  if (!Number.isFinite(t)) return '—';

  const diffMs = Date.now() - t;
  const hours = diffMs / 3600000;

  if (hours < 24) return '<24';
  if (hours < 72) return '< 3 dager';
  if (hours < 7 * 24) return '< 1 uke';
  return 'mer enn en uke';
}

type CheapestInfo = {
  // Brukes for å vise prisbeløpet
  price_amount: number;
  // Brukes for å vise "hvor lenge siden sist"
  latest_recorded_at: string;
};

export default function ProdukterScreen() {
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const router = useRouter();

  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [cheapestByProductId, setCheapestByProductId] = useState<Record<string, CheapestInfo>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [{ data: productsData, error: productsError }, { data: categoriesData, error: categoriesError }] =
        await Promise.all([
          supabase
            .from('products')
            .select(
              'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, created_at, updated_at, barcode, approval_status'
            )
            .eq('approval_status', 'approved')
            .order('name'),
          supabase.from('product_categories').select('id, name, created_at, updated_at').order('name'),
        ]);

      if (cancelled) return;

      if (productsError || categoriesError) {
        setProducts([]);
        setCategories([]);
        setLoading(false);
        return;
      }

      const categoryById = new Map<string, ProductCategory>();
      (categoriesData ?? []).forEach((cat) => categoryById.set(cat.id, cat));

      const enriched: EnrichedProduct[] = (productsData ?? []).map((p) => ({
        ...(p as Product),
        category: p.category_id ? categoryById.get(p.category_id) ?? null : null,
      }));

      setProducts(enriched);
      setCategories((categoriesData ?? []) as ProductCategory[]);

      // Finn billigste pris (approved) per produkt,
      // men lagre også nyeste recorded_at for tids-teksten ("sist registrert").
      const productIds = (productsData ?? []).map((p) => (p as any).id).filter((x: any) => typeof x === 'string' && x);
      const chunkSize = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < productIds.length; i += chunkSize) {
        chunks.push(productIds.slice(i, i + chunkSize));
      }

      const cheapest: Record<string, CheapestInfo> = {};

      for (const chunk of chunks) {
        if (!chunk.length) continue;
        // Finn nyeste recorded_at uansett butikk og uansett approval_status.
        const { data: latestRowsAny, error: latestError } = await supabase
          .from('product_prices')
          .select('product_id, recorded_at')
          .in('product_id', chunk);

        const latestByProductId: Record<string, string> = {};
        if (!latestError) {
          for (const row of latestRowsAny ?? []) {
            const product_id = (row as any).product_id as string | undefined;
            const recorded_at = (row as any).recorded_at as string | undefined;
            if (!product_id || !recorded_at) continue;

            const prev = latestByProductId[product_id];
            if (!prev || Date.parse(recorded_at) > Date.parse(prev)) {
              latestByProductId[product_id] = recorded_at;
            }
          }
        }

        const { data: priceRows, error: priceError } = await supabase
          .from('product_prices')
          .select('product_id, price_amount, recorded_at')
          .in('product_id', chunk)
          .eq('approval_status', 'approved');

        if (priceError) continue;

        for (const row of priceRows ?? []) {
          const product_id = (row as any).product_id as string | undefined;
          if (!product_id) continue;
          const price_amount = typeof (row as any).price_amount === 'number' ? (row as any).price_amount : Number((row as any).price_amount);
          if (!Number.isFinite(price_amount)) continue;
          const recorded_at = (row as any).recorded_at as string | undefined;
          if (!recorded_at) continue;

          const prev = cheapest[product_id];
          const latestRecorded = latestByProductId[product_id] ?? recorded_at;
          if (!prev) {
            cheapest[product_id] = { price_amount, latest_recorded_at: latestRecorded };
            continue;
          }

          // Oppdater billigst pris (beløpet)
          if (price_amount < prev.price_amount) {
            cheapest[product_id] = { ...prev, price_amount, latest_recorded_at: latestRecorded };
          }

          // Oppdater nyeste registreringstid (siste hentet inn)
          if (Date.parse(latestRecorded) > Date.parse(prev.latest_recorded_at)) {
            cheapest[product_id] = { ...cheapest[product_id], latest_recorded_at: latestRecorded };
          }
        }
      }
      setCheapestByProductId(cheapest);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategoryId && p.category_id !== activeCategoryId) return false;
      if (!term) return true;
      const haystack = `${p.name} ${p.supplier} ${p.manufacturer}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [products, search, activeCategoryId]);

  const [searchFocused, setSearchFocused] = useState(false);

  const inputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: searchFocused ? 2 : hairlineWidth,
    borderColor: searchFocused ? c.primary : c.border,
  };

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
            Henter produkter…
          </Text>
        </Box>
      </BlurStatusBarView>
    );
  }

  const header = (
    <Box px={spacing.lg} pt={insets.top + spacing.sm} pb={spacing.sm} style={{ backgroundColor: c.background }}>
      <VStack space="md">
        <Text fontSize={20} fontWeight="700" style={{ color: c.textSecondary }}>
          Produkter
        </Text>
        <Input size="md" variant="outline" style={inputStyle}>
          <InputField
            placeholder="Søk etter produkt, leverandør eller produsent"
            placeholderTextColor={c.textMuted}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{ color: c.text }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Input>
        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: spacing.xs }}
          >
            <HStack space="xs">
              <FilterChip
                label="Alle kategorier"
                active={!activeCategoryId}
                onPress={() => setActiveCategoryId(null)}
                c={c}
              />
              {categories.map((cat) => (
                <FilterChip
                  key={cat.id}
                  label={cat.name}
                  active={activeCategoryId === cat.id}
                  onPress={() => setActiveCategoryId(cat.id)}
                  c={c}
                />
              ))}
            </HStack>
          </ScrollView>
        )}
      </VStack>
    </Box>
  );

  return (
    <BlurStatusBarView edges={['top']}>
      <Box flex={1} pb={insets.bottom} style={{ backgroundColor: c.background }}>
        {header}
        {filteredProducts.length === 0 ? (
          <Box flex={1} justifyContent="center" alignItems="center" px={spacing.lg}>
            <Text fontSize={15} style={{ color: c.textMuted }}>
              Ingen produkter å vise. Juster søket eller filtrene.
            </Text>
          </Box>
        ) : (
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={{ ...styles.listContent, paddingBottom: insets.bottom + spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            <VStack space="md" px={spacing.lg}>
              {filteredProducts.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/(tabs)/product/${p.id}`)}
                  hitSlop={10}
                  sx={{ _pressed: { opacity: 0.9 } }}
                >
                <ProductCard product={p} cheapest={cheapestByProductId[p.id]} />
                </Pressable>
              ))}
            </VStack>
          </ScrollView>
        )}
      </Box>
    </BlurStatusBarView>
  );
}

type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  c: ReturnType<typeof useDesignColors>;
};

function FilterChip({ label, active, onPress, c }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      px={spacing.sm}
      py={spacing.xs}
      borderRadius={999}
      style={{
        backgroundColor: active ? c.tint ?? c.border : 'transparent',
        borderWidth: 1,
        borderColor: active ? c.tint ?? c.border : c.border,
      }}
    >
      <Text
        fontSize={13}
        fontWeight="500"
        style={{ color: active ? c.background : c.textSecondary }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type ProductCardProps = {
  product: EnrichedProduct;
  cheapest?: CheapestInfo;
};

function ProductCard({ product, cheapest }: ProductCardProps) {
  const c = useDesignColors();
  const hasImage = !!product.image_url;
  const showCheapest = cheapest && Number.isFinite(cheapest.price_amount);

  return (
    <Box
      p={spacing.md}
      borderRadius={12}
      style={{ backgroundColor: c.card ?? c.background, borderWidth: 1, borderColor: c.border }}
    >
      <HStack space="md" alignItems="flex-start">
        <Box
          width={56}
          height={56}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
          style={{ backgroundColor: c.border, overflow: 'hidden' }}
        >
          {hasImage ? (
            <Image
              source={{ uri: product.image_url! }}
              style={{ width: 56, height: 56 }}
              contentFit="contain"
            />
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
              {product.category && (
                <Text fontSize={12} style={{ color: c.textMuted }} numberOfLines={1}>
                  {product.category.name}
                </Text>
              )}
            </VStack>
            <VStack space="xs" alignItems="flex-end">
              <Text fontSize={13} fontWeight="600" style={{ color: c.textSecondary }}>
                {showCheapest ? `${cheapest!.price_amount.toFixed(2)} kr / ${product.unit}` : 'Pris mangler'}
              </Text>
              {showCheapest && (
                <Text fontSize={12} style={{ color: c.textMuted }} numberOfLines={1}>
                  Oppd. {formatPriceUpdatedShort(cheapest!.latest_recorded_at)}
                </Text>
              )}
            </VStack>
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
}

const styles = StyleSheet.create({
  listScroll: { flex: 1 },
  listContent: { paddingTop: spacing.sm },
  input: { borderRadius: 10 },
});

