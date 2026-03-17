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
import type { Product, ProductCategory } from '@/types/database';

type EnrichedProduct = Product & {
  category?: ProductCategory | null;
};

export default function ProdukterScreen() {
  const insets = useSafeAreaInsets();
  const c = useDesignColors();

  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [{ data: productsData, error: productsError }, { data: categoriesData, error: categoriesError }] =
        await Promise.all([
          supabase
            .from('products')
            .select(
              'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, created_at, updated_at'
            )
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
                <ProductCard key={p.id} product={p} />
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
};

function ProductCard({ product }: ProductCardProps) {
  const c = useDesignColors();
  const hasImage = !!product.image_url;

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
          <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap">
            <Text fontSize={13} style={{ color: c.textMuted }} numberOfLines={1}>
              {product.manufacturer || product.supplier}
            </Text>
            <Text fontSize={13} fontWeight="600" style={{ color: c.textSecondary }}>
              {product.unit_price_amount.toFixed(2)} kr / {product.unit}
            </Text>
          </HStack>
          {product.category && (
            <Text fontSize={12} style={{ color: c.textMuted }}>
              {product.category.name}
            </Text>
          )}
          {product.is_weight_item && (
            <Text fontSize={11} style={{ color: c.textMuted }}>
              Vektvare
            </Text>
          )}
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

