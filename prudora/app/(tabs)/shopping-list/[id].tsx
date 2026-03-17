import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Keyboard } from 'react-native';
import {
  Box,
  Text,
  VStack,
  HStack,
  Spinner,
  Pressable,
  Input,
  InputField,
  Button,
  ButtonText,
} from '@gluestack-ui/themed';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, hairlineWidth } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import type { Product, Store } from '@/types/database';
import { useAuth } from '@/lib/auth-context';

type ShoppingList = {
  id: string;
  name: string;
  icon: string | null;
  store_id?: string | null;
};

type ShoppingListItem = {
  id: string;
  product_id: string;
  quantity: number;
  is_purchased: boolean;
  position: number;
  product: Product;
};

export const options = {
  headerShown: false,
};

export default function ShoppingListDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const router = useRouter();
  const { user } = useAuth();

  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [iconDraft, setIconDraft] = useState('');
  const [focusedField, setFocusedField] = useState<'listName' | 'search' | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [favoriteStores, setFavoriteStores] = useState<Store[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { data: listData } = await supabase
        .from('shopping_lists')
        .select('id, name, icon, store_id')
        .eq('id', id)
        .maybeSingle();
      const { data: itemsData } = await supabase
        .from('shopping_list_items')
        .select('id, product_id, quantity, is_purchased, position, products (*)')
        .eq('list_id', id)
        .order('position', { ascending: true });

      if (cancelled) return;

      setList(listData as ShoppingList | null);
      setNameDraft(listData?.name ?? '');
      setIconDraft(listData?.icon ?? '🛒');
      setStoreId((listData as any)?.store_id ?? null);
      setItems(
        (itemsData ?? []).map((row: any) => ({
          id: row.id,
          product_id: row.product_id,
          quantity: row.quantity,
          is_purchased: row.is_purchased,
          position: row.position,
          product: row.products as Product,
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadFavoriteStores = useCallback(async () => {
    if (!user) {
      setFavoriteStores([]);
      return;
    }
    const { data, error } = await supabase
      .from('favorite_stores')
      .select('stores (id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at)')
      .eq('user_id', user.id);
    if (error) {
      setFavoriteStores([]);
      return;
    }
    const stores = (data ?? [])
      .map((row: any) => row.stores as Store | null)
      .filter((s: Store | null): s is Store => !!s);
    setFavoriteStores(stores);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadFavoriteStores();
    }, [loadFavoriteStores]),
  );

  const handleSearchProducts = async (term: string) => {
    setSearch(term);
    const q = term.trim();
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const { data } = await supabase
      .from('products')
      .select(
        'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, created_at, updated_at'
      )
      .ilike('name', `%${q}%`)
      .limit(20);
    setSearchResults((data ?? []) as Product[]);
    setSearchLoading(false);
  };

  const addProductToList = async (product: Product) => {
    if (!id) return;
    setSaving(true);
    const maxPos = items.reduce((max, it) => Math.max(max, it.position), 0);
    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({
        list_id: id,
        product_id: product.id,
        quantity: 1,
        is_purchased: false,
        position: maxPos + 1,
      })
      .select('id, product_id, quantity, is_purchased, position')
      .single();
    setSaving(false);
    if (error || !data) return;
    setItems(prev => [
      ...prev,
      {
        id: data.id,
        product_id: data.product_id,
        quantity: data.quantity,
        is_purchased: data.is_purchased,
        position: data.position,
        product,
      },
    ]);
    setSearch('');
    setSearchResults([]);
  };

  const updateItem = async (itemId: string, changes: Partial<ShoppingListItem>) => {
    setItems(prev => prev.map(it => (it.id === itemId ? { ...it, ...changes } : it)));
    const dbChanges: any = {};
    if (typeof changes.quantity === 'number') dbChanges.quantity = changes.quantity;
    if (typeof changes.is_purchased === 'boolean') dbChanges.is_purchased = changes.is_purchased;
    if (typeof changes.position === 'number') dbChanges.position = changes.position;
    if (Object.keys(dbChanges).length === 0) return;
    await supabase.from('shopping_list_items').update(dbChanges).eq('id', itemId);
  };

  const moveItem = (itemId: string, direction: 'up' | 'down') => {
    setItems(prev => {
      const index = prev.findIndex(it => it.id === itemId);
      if (index === -1) return prev;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const newArr = [...prev];
      const [moved] = newArr.splice(index, 1);
      newArr.splice(newIndex, 0, moved);
      newArr.forEach((it, idx) => {
        it.position = idx + 1;
        void supabase.from('shopping_list_items').update({ position: it.position }).eq('id', it.id);
      });
      return [...newArr];
    });
  };

  const handleSaveListMeta = async () => {
    if (!id || !list) return;
    const name = nameDraft.trim() || 'Handleliste';
    const icon = iconDraft || '🛒';
    setList(prev => (prev ? { ...prev, name, icon, store_id: storeId } : prev));
    await supabase
      .from('shopping_lists')
      .update({ name, icon, store_id: storeId })
      .eq('id', id);
    setFocusedField(null);
    Keyboard.dismiss();
  };

  const handleDeleteList = async () => {
    if (!id) return;
    await supabase.from('shopping_lists').delete().eq('id', id);
    router.back();
  };

  const insetsStyle = {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingHorizontal: spacing.lg,
  };

  const baseInputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: hairlineWidth,
    borderColor: c.border,
  };

  const sortedItems = useMemo(() => {
    const notPurchased = items
      .filter(it => !it.is_purchased)
      .sort((a, b) => a.position - b.position);
    const purchased = items
      .filter(it => it.is_purchased)
      .sort((a, b) => a.position - b.position);
    return [...notPurchased, ...purchased];
  }, [items]);

  const firstNotPurchasedIndex = useMemo(
    () => sortedItems.findIndex(it => !it.is_purchased),
    [sortedItems]
  );
  const firstPurchasedIndex = useMemo(
    () => sortedItems.findIndex(it => it.is_purchased),
    [sortedItems]
  );
  const checkedCount = useMemo(
    () => items.filter(it => it.is_purchased).length,
    [items]
  );

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
            Laster handleliste…
          </Text>
        </Box>
      </BlurStatusBarView>
    );
  }

  if (!list) {
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
            Fant ikke handlelisten
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

  return (
    <BlurStatusBarView edges={['top']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Box flex={1} style={{ backgroundColor: c.background, ...insetsStyle }}>
          <VStack space="lg" flex={1}>
            <HStack alignItems="center" justifyContent="space-between" mt={spacing.sm}>
              <Pressable onPress={() => router.back()} hitSlop={10}>
                <Text style={{ color: c.tint, fontSize: 14 }}>‹ Tilbake</Text>
              </Pressable>
              <Text fontSize={18} fontWeight="700" style={{ color: c.textSecondary }}>
                Handleliste
              </Text>
              <Button
                size="xs"
                variant="outline"
                borderRadius={radius.lg}
                sx={{ _pressed: { opacity: 0.9 } }}
                onPress={handleDeleteList}
              >
                <ButtonText style={{ color: '#EF4444', fontSize: 11 }}>Slett</ButtonText>
              </Button>
            </HStack>

            <VStack space="md">
              <HStack space="md" alignItems="center">
                <Pressable onPress={() => setShowIconPicker(prev => !prev)}>
                  <Box>
                    <Box
                      width={44}
                      height={44}
                      borderRadius={999}
                      alignItems="center"
                      justifyContent="center"
                      style={{
                        backgroundColor: c.surface,
                        borderWidth: hairlineWidth,
                        borderColor: c.border,
                      }}
                    >
                      <Text fontSize={26}>{iconDraft || '🛒'}</Text>
                    </Box>
                  </Box>
                </Pressable>
                <Box flex={1}>
                  <Input
                    variant="outline"
                    size="md"
                    style={[
                      baseInputStyle,
                      focusedField === 'listName' && {
                        borderColor: c.primary,
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <InputField
                      placeholder="Navn på handleliste"
                      placeholderTextColor={c.textMuted}
                      value={nameDraft}
                      onChangeText={setNameDraft}
                      style={{ color: c.text }}
                      onFocus={() => setFocusedField('listName')}
                      onBlur={() =>
                        setFocusedField(prev => (prev === 'listName' ? null : prev))
                      }
                    />
                  </Input>
                </Box>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={handleSaveListMeta}
                  borderRadius={radius.lg}
                  sx={{ _pressed: { opacity: 0.9 } }}
                >
                  <ButtonText style={{ color: c.tint, fontSize: 13 }}>Lagre</ButtonText>
                </Button>
              </HStack>
              <VStack space="xs">
                <Text fontSize={13} style={{ color: c.textSecondary }}>
                  Butikk for denne listen
                </Text>
                <HStack flexWrap="wrap" space="sm">
                  <Pressable
                    onPress={() => setStoreId(null)}
                    style={{
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.sm,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: storeId === null ? c.tint ?? c.border : c.border,
                      backgroundColor: storeId === null ? c.tint ?? c.border : 'transparent',
                    }}
                  >
                    <Text
                      fontSize={13}
                      style={{ color: storeId === null ? c.background : c.textSecondary }}
                    >
                      Ingen butikk
                    </Text>
                  </Pressable>
                  {favoriteStores.map(store => {
                    const active = storeId === store.id;
                    const label = store.name ? `${store.chain} – ${store.name}` : store.chain;
                    return (
                      <Pressable
                        key={store.id}
                        onPress={() => setStoreId(store.id)}
                        style={{
                          paddingVertical: spacing.xs,
                          paddingHorizontal: spacing.sm,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? c.tint ?? c.border : c.border,
                          backgroundColor: active ? c.tint ?? c.border : 'transparent',
                        }}
                      >
                        <Text
                          fontSize={13}
                          style={{ color: active ? c.background : c.textSecondary }}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </HStack>
              </VStack>
              {showIconPicker && (
                <VStack space="xs" mt={spacing.xs}>
                  <Text fontSize={13} style={{ color: c.textSecondary }}>
                    Velg ikon
                  </Text>
                  <HStack flexWrap="wrap" space="sm">
                    {['📋', '🛒', '🥦', '🍞', '🍎', '🍝', '🧼'].map(emoji => {
                      const isSelected = iconDraft === emoji;
                      return (
                        <Pressable
                          key={emoji}
                          onPress={() => setIconDraft(emoji)}
                          hitSlop={8}
                        >
                          <Box
                            w={40}
                            h={40}
                            borderRadius={20}
                            alignItems="center"
                            justifyContent="center"
                            style={{
                              backgroundColor: isSelected ? c.tint : c.surface,
                              borderWidth: hairlineWidth,
                              borderColor: isSelected ? c.tint : c.border,
                            }}
                          >
                            <Text
                              fontSize={22}
                              style={{ color: isSelected ? '#ffffff' : c.text }}
                            >
                              {emoji}
                            </Text>
                          </Box>
                        </Pressable>
                      );
                    })}
                  </HStack>
                </VStack>
              )}

              <VStack space="xs">
                <Text fontSize={14} fontWeight="600" style={{ color: c.textSecondary }}>
                  Legg til produkt
                </Text>
                <Input
                  variant="outline"
                  size="md"
                  style={[
                    baseInputStyle,
                    focusedField === 'search' && {
                      borderColor: c.primary,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <InputField
                    placeholder="Søk etter produkt"
                    placeholderTextColor={c.textMuted}
                    value={search}
                    onChangeText={handleSearchProducts}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ color: c.text }}
                    onFocus={() => setFocusedField('search')}
                    onBlur={() =>
                      setFocusedField(prev => (prev === 'search' ? null : prev))
                    }
                  />
                </Input>
                {searchLoading && (
                  <HStack mt={spacing.xs} space="xs" alignItems="center">
                    <Spinner size="small" />
                    <Text fontSize={13} style={{ color: c.textMuted }}>
                      Søker…
                    </Text>
                  </HStack>
                )}
                {!searchLoading && searchResults.length > 0 && (
                  <ScrollView
                    style={{ maxHeight: 200, marginTop: spacing.xs }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    <VStack space="xs">
                      {searchResults.map(p => (
                        <Pressable key={p.id} onPress={() => addProductToList(p)}>
                          <Box
                            p={spacing.sm}
                            borderRadius={radius.md}
                            style={{
                              backgroundColor: c.surface,
                              borderWidth: hairlineWidth,
                              borderColor: c.border,
                            }}
                          >
                            <Text fontSize={14} fontWeight="500" style={{ color: c.text }}>
                              {p.name}
                            </Text>
                            <Text fontSize={12} style={{ color: c.textMuted }}>
                              {p.manufacturer || p.supplier}
                            </Text>
                          </Box>
                        </Pressable>
                      ))}
                    </VStack>
                  </ScrollView>
                )}
              </VStack>
            </VStack>

            <Box flex={1} mt={spacing.md}>
              <HStack justifyContent="space-between" alignItems="center" mb={spacing.sm}>
                <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
                  Produkter i listen
                </Text>
                <Text fontSize={13} style={{ color: c.textMuted }}>
                  {items.length} totalt · {checkedCount} kjøpt
                </Text>
              </HStack>

              <DraggableFlatList
                data={sortedItems}
                keyExtractor={item => item.id}
                onDragEnd={async ({ data }) => {
                  setItems(
                    data.map((it, index) => ({
                      ...it,
                      position: index + 1,
                    }))
                  );
                  await Promise.all(
                    data.map((it, index) =>
                      supabase
                        .from('shopping_list_items')
                        .update({ position: index + 1 })
                        .eq('id', it.id)
                    )
                  );
                }}
                renderItem={({
                  item,
                  drag,
                  isActive,
                  index,
                }: RenderItemParams<ShoppingListItem>) => {
                  const showNotPurchasedHeader =
                    !item.is_purchased && index === firstNotPurchasedIndex;
                  const showPurchasedHeader =
                    item.is_purchased && index === firstPurchasedIndex;

                  return (
                    <VStack space="xs">
                      {showNotPurchasedHeader && (
                        <VStack mt={spacing.md} mb={spacing.xs} space="xs">
                          <Box height={hairlineWidth} bg={c.border} opacity={0.7} />
                          <Text
                            fontSize={13}
                            fontWeight="700"
                            style={{ color: c.textSecondary }}
                          >
                            Ikke kjøpt
                          </Text>
                        </VStack>
                      )}
                      {showPurchasedHeader && (
                        <VStack mt={spacing.lg} mb={spacing.xs} space="xs">
                          <Box height={hairlineWidth} bg={c.border} opacity={0.7} />
                          <Text
                            fontSize={13}
                            fontWeight="700"
                            style={{ color: c.textSecondary }}
                          >
                            Kjøpt
                          </Text>
                        </VStack>
                      )}
                      <ShoppingListItemRow
                        item={item}
                        onToggleChecked={() =>
                          updateItem(item.id, { is_purchased: !item.is_purchased })
                        }
                        onChangeQuantity={q => updateItem(item.id, { quantity: q })}
                        onLongPress={item.is_purchased ? undefined : drag}
                        isActive={isActive}
                        draggable={!item.is_purchased}
                      />
                    </VStack>
                  );
                }}
                contentContainerStyle={{
                  paddingBottom: insets.bottom + spacing.lg,
                  paddingTop: spacing.xs,
                }}
              />
            </Box>
          </VStack>
        </Box>
      </GestureHandlerRootView>
    </BlurStatusBarView>
  );
}

type RowProps = {
  item: ShoppingListItem;
  onToggleChecked: () => void;
  onChangeQuantity: (q: number) => void;
  onLongPress?: () => void;
  isActive: boolean;
  draggable: boolean;
};

function ShoppingListItemRow({
  item,
  onToggleChecked,
  onChangeQuantity,
  onLongPress,
  isActive,
  draggable,
}: RowProps) {
  const c = useDesignColors();

  const handleQuantityChange = (delta: number) => {
    const next = Math.max(0, (item.quantity || 0) + delta);
    onChangeQuantity(next);
  };

  return (
    <Pressable
      onLongPress={onLongPress}
      disabled={isActive || !draggable || !onLongPress}
    >
      <Box
        p={spacing.sm}
        borderRadius={radius.lg}
        style={{
          backgroundColor: c.surface,
          borderWidth: hairlineWidth,
          borderColor: isActive ? c.tint : c.border,
          opacity: item.is_purchased ? 0.6 : 1,
        }}
      >
        <HStack alignItems="center" space="sm">
          <Pressable onPress={onToggleChecked} hitSlop={10}>
            <Box
              width={22}
              height={22}
              borderRadius={6}
              alignItems="center"
              justifyContent="center"
              style={{
                borderWidth: hairlineWidth,
                borderColor: item.is_purchased ? c.tint : c.border,
                backgroundColor: item.is_purchased ? c.tint : 'transparent',
              }}
            >
              {item.is_purchased && (
                <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>
              )}
            </Box>
          </Pressable>
          <VStack flex={1} space="xs">
            <Text
              fontSize={14}
              fontWeight="500"
              style={{ color: item.is_purchased ? c.textMuted : c.text }}
              numberOfLines={2}
            >
              {item.product.name}
            </Text>
            <Text fontSize={12} style={{ color: c.textMuted }}>
              {item.product.manufacturer || item.product.supplier}
            </Text>
          </VStack>
          <VStack space="xs" alignItems="center" mr={spacing.sm}>
            <Text fontSize={11} style={{ color: c.textMuted }}>
              Antall
            </Text>
            <HStack space="xs" alignItems="center">
              <Pressable onPress={() => handleQuantityChange(-1)} hitSlop={10}>
                <Text style={{ color: c.tint, fontSize: 18 }}>−</Text>
              </Pressable>
              <Text
                fontSize={14}
                style={{ color: c.text, minWidth: 20, textAlign: 'center' }}
              >
                {item.quantity}
              </Text>
              <Pressable onPress={() => handleQuantityChange(1)} hitSlop={10}>
                <Text style={{ color: c.tint, fontSize: 18 }}>+</Text>
              </Pressable>
            </HStack>
          </VStack>
          <VStack space="xs" alignItems="center">
            <Text
              style={{
                color: draggable ? c.textMuted : c.border,
                fontSize: 18,
              }}
            >
              ≡
            </Text>
          </VStack>
        </HStack>
      </Box>
    </Pressable>
  );
}


