import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Keyboard, useWindowDimensions } from 'react-native';
import * as Location from 'expo-location';
import {
  Box,
  Text,
  VStack,
  HStack,
  Spinner,
  Pressable,
  Input,
  InputField,
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
import { distanceKm } from '@/lib/location-utils';
import { LineChart } from '@/components/charts/line-chart';
import type { ChartDataPoint } from '@/components/charts/line-chart';
import type { Product, Store } from '@/types/database';
import { useAuth } from '@/lib/auth-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PremiumButton } from '@/components/ui/PremiumButton';

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

type StorePriceEntry = {
  price_amount: number;
  recorded_at: string;
};

type ComparePriceRow = {
  store_id: string;
  product_id: string;
  price_amount: number;
  recorded_at: string;
};

type StoreCompareSeries = {
  storeId: string;
  store: Store | null;
  points: { x: number; y: number; missingCount: number }[];
  latestTotal: number | null;
  latestMissingCount: number;
  latestRecordedAt: string | null;
};

export const options = {
  headerShown: false,
};

/** Maks antall butikker som kan sammenlignes samtidig (stående visning). */
const MAX_COMPARE_STORES = 2;

export default function ShoppingListDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const { width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const { user } = useAuth();

  const goBackToShoppingLists = () => {
    // Handlelisteoversikt (tabben "Handlelister")
    router.replace('/(tabs)/explore');
  };

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
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [showComparisonPanel, setShowComparisonPanel] = useState(false);
  const [showCompareStorePicker, setShowCompareStorePicker] = useState(true);
  const [showCompareInfoAlert, setShowCompareInfoAlert] = useState(false);
  const [showMatrixInfoAlert, setShowMatrixInfoAlert] = useState(false);
  const [showListStoreInfoAlert, setShowListStoreInfoAlert] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ShoppingListItem | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [favoriteStores, setFavoriteStores] = useState<Store[]>([]);
  const [storePriceByProductId, setStorePriceByProductId] = useState<Record<string, StorePriceEntry>>({});
  const [compareMode, setCompareMode] = useState<'favorites' | 'nearest' | 'search'>('nearest');
  const [compareSearch, setCompareSearch] = useState('');
  const [compareSelectedStoreIds, setCompareSelectedStoreIds] = useState<string[]>([]);
  const [comparisonRows, setComparisonRows] = useState<ComparePriceRow[]>([]);
  const [comparisonStoresById, setComparisonStoresById] = useState<Record<string, Store>>({});
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

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
        // ignore location failures
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
        'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, created_at, updated_at, barcode, approval_status'
      )
      .eq('approval_status', 'approved')
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

  const deleteItem = async (itemId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    await supabase.from('shopping_list_items').delete().eq('id', itemId);
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

  /** Butikk/ikon lagres med én gang (Lagre-knapp vises bare ved endret navn). */
  const persistStoreId = async (next: string | null) => {
    if (!id || !list) return;
    setStoreId(next);
    setList(prev => (prev ? { ...prev, store_id: next } : prev));
    await supabase.from('shopping_lists').update({ store_id: next }).eq('id', id);
  };

  const persistIcon = async (emoji: string) => {
    if (!id || !list) return;
    setShowIconPicker(false);
    setIconDraft(emoji);
    setList(prev => (prev ? { ...prev, icon: emoji } : prev));
    await supabase.from('shopping_lists').update({ icon: emoji }).eq('id', id);
  };

  const handleDeleteList = async () => {
    if (!id) return;
    await supabase.from('shopping_lists').delete().eq('id', id);
    goBackToShoppingLists();
  };

  const insetsStyle = {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingHorizontal: spacing.lg,
  };

  /** Kun når bruker faktisk har endret navnet (ikke ikon/butikk) */
  const isListNameDirty = useMemo(
    () => (list ? nameDraft.trim() !== (list.name ?? '').trim() : false),
    [list, nameDraft],
  );

  const compactHeaderBtnStyle = {
    minHeight: 40,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  } as const;

  const baseInputStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: hairlineWidth,
    borderColor: c.border,
  };

  const notPurchasedItems = useMemo(
    () => items.filter(it => !it.is_purchased).sort((a, b) => a.position - b.position),
    [items]
  );
  const purchasedItems = useMemo(
    () => items.filter(it => it.is_purchased).sort((a, b) => a.position - b.position),
    [items]
  );
  const checkedCount = useMemo(
    () => items.filter(it => it.is_purchased).length,
    [items]
  );

  // Hent nyeste pris per produkt for valgt butikk (for handlelistevisning/total)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!storeId || items.length === 0) {
        setStorePriceByProductId({});
        return;
      }

      const productIds = Array.from(new Set(items.map((it) => it.product_id)));
      if (!productIds.length) {
        setStorePriceByProductId({});
        return;
      }

      const { data, error } = await supabase
        .from('product_prices')
        .select('product_id, price_amount, recorded_at')
        .eq('store_id', storeId)
        .eq('approval_status', 'approved')
        .in('product_id', productIds)
        .order('recorded_at', { ascending: false });

      if (cancelled) return;
      if (error || !data) {
        setStorePriceByProductId({});
        return;
      }

      const byProduct: Record<string, StorePriceEntry> = {};
      for (const row of data as any[]) {
        const pid = row.product_id as string | undefined;
        if (!pid || byProduct[pid]) continue; // første rad er nyeste pga sortering desc
        const amount =
          typeof row.price_amount === 'number' ? row.price_amount : Number(row.price_amount);
        const recorded = row.recorded_at as string | undefined;
        if (!Number.isFinite(amount) || !recorded) continue;
        byProduct[pid] = { price_amount: amount, recorded_at: recorded };
      }

      setStorePriceByProductId(byProduct);
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, items]);

  const totalPricing = useMemo(() => {
    if (!storeId) return null;
    let total = 0;
    let missingCount = 0;

    for (const item of items) {
      const p = storePriceByProductId[item.product_id];
      if (!p) {
        missingCount += 1;
        continue;
      }
      total += (item.quantity || 0) * p.price_amount;
    }

    return { total, missingCount };
  }, [storeId, items, storePriceByProductId]);

  // Datagrunnlag for butikksammenligning (priser over tid for listeprodukter)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const productIds = Array.from(new Set(items.map((it) => it.product_id)));
      if (!productIds.length) {
        setComparisonRows([]);
        setComparisonStoresById({});
        return;
      }

      const { data: rowsData, error: rowsError } = await supabase
        .from('product_prices')
        .select('store_id, product_id, price_amount, recorded_at')
        .in('product_id', productIds)
        .eq('approval_status', 'approved')
        .order('recorded_at', { ascending: true });

      if (cancelled) return;
      if (rowsError || !rowsData) {
        setComparisonRows([]);
        setComparisonStoresById({});
        return;
      }

      const normalized: ComparePriceRow[] = (rowsData as any[])
        .map((r) => ({
          store_id: String(r.store_id),
          product_id: String(r.product_id),
          price_amount: typeof r.price_amount === 'number' ? r.price_amount : Number(r.price_amount),
          recorded_at: String(r.recorded_at),
        }))
        .filter((r) => Number.isFinite(r.price_amount) && !!r.store_id && !!r.product_id && !!r.recorded_at);

      setComparisonRows(normalized);

      const storeIds = Array.from(new Set(normalized.map((r) => r.store_id)));
      if (!storeIds.length) {
        setComparisonStoresById({});
        return;
      }

      const { data: storesData } = await supabase
        .from('stores')
        .select('id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at')
        .in('id', storeIds);

      if (cancelled) return;
      const byId: Record<string, Store> = {};
      (storesData ?? []).forEach((s: any) => {
        byId[String(s.id)] = s as Store;
      });
      setComparisonStoresById(byId);
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const compareStoreIdsAll = useMemo(
    () => Array.from(new Set(comparisonRows.map((r) => r.store_id))),
    [comparisonRows]
  );

  const compareStoresSorted = useMemo(() => {
    const base = compareStoreIdsAll
      .map((sid) => comparisonStoresById[sid])
      .filter((s): s is Store => !!s);

    if (!userLocation) return base;
    return [...base].sort(
      (a, b) =>
        distanceKm(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) -
        distanceKm(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude)
    );
  }, [compareStoreIdsAll, comparisonStoresById, userLocation]);

  const compareNearest5Ids = useMemo(() => compareStoresSorted.slice(0, 5).map((s) => s.id), [compareStoresSorted]);
  const compareNearest2Ids = useMemo(() => compareStoresSorted.slice(0, MAX_COMPARE_STORES).map((s) => s.id), [compareStoresSorted]);
  const compareFavoriteIds = useMemo(
    () => favoriteStores.map((s) => s.id).filter((id) => compareStoreIdsAll.includes(id)),
    [favoriteStores, compareStoreIdsAll]
  );

  const comparePickerResults = useMemo(() => {
    if (compareMode === 'favorites') {
      return compareFavoriteIds.map((id) => comparisonStoresById[id]).filter((s): s is Store => !!s);
    }
    if (compareMode === 'nearest') {
      return compareNearest5Ids.map((id) => comparisonStoresById[id]).filter((s): s is Store => !!s);
    }
    const q = compareSearch.trim().toLowerCase();
    const base = compareStoresSorted.slice(0, 5);
    if (!q) return base;
    return compareStoresSorted.filter((s) => `${s.chain} ${s.name ?? ''} ${s.address}`.toLowerCase().includes(q));
  }, [compareMode, compareFavoriteIds, compareNearest5Ids, comparisonStoresById, compareSearch, compareStoresSorted]);

  useEffect(() => {
    if (compareMode === 'nearest') {
      setCompareSelectedStoreIds(compareNearest2Ids);
      return;
    }
    if (compareMode === 'search') {
      setCompareSelectedStoreIds([]);
      return;
    }
    if (compareMode === 'favorites') {
      setCompareSelectedStoreIds(compareFavoriteIds.slice(0, MAX_COMPARE_STORES));
    }
  }, [compareMode, compareNearest2Ids, compareFavoriteIds]);

  useEffect(() => {
    setCompareSelectedStoreIds((prev) =>
      prev.length > MAX_COMPARE_STORES ? prev.slice(0, MAX_COMPARE_STORES) : prev
    );
  }, []);

  const commonComparableProductIds = useMemo(() => {
    if (compareSelectedStoreIds.length === 0) return [] as string[];
    const listProductIds = Array.from(
      new Set(items.filter((it) => (it.quantity ?? 0) > 0).map((it) => it.product_id))
    );
    if (!listProductIds.length) return [] as string[];

    const productsByStore: Record<string, Set<string>> = {};
    for (const row of comparisonRows) {
      if (!compareSelectedStoreIds.includes(row.store_id)) continue;
      if (!listProductIds.includes(row.product_id)) continue;
      (productsByStore[row.store_id] ||= new Set<string>()).add(row.product_id);
    }

    return listProductIds.filter((productId) =>
      compareSelectedStoreIds.every((storeId) => productsByStore[storeId]?.has(productId))
    );
  }, [compareSelectedStoreIds, items, comparisonRows]);

  const compareSeriesByStore = useMemo(() => {
    const productIds = commonComparableProductIds;
    const productIdSet = new Set(productIds);
    if (!productIds.length) return [] as StoreCompareSeries[];
    const quantityByProductId: Record<string, number> = {};
    for (const item of items) {
      if (!productIdSet.has(item.product_id)) continue;
      quantityByProductId[item.product_id] =
        (quantityByProductId[item.product_id] ?? 0) + (item.quantity || 0);
    }
    const byStore: Record<string, ComparePriceRow[]> = {};
    for (const row of comparisonRows) {
      if (!productIdSet.has(row.product_id)) continue;
      (byStore[row.store_id] ||= []).push(row);
    }

    const result: StoreCompareSeries[] = [];
    for (const storeIdRow of compareSelectedStoreIds) {
      const rows = byStore[storeIdRow] ?? [];
      const sorted = [...rows].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
      const latestByProduct: Record<string, number> = {};
      const points: { x: number; y: number; missingCount: number }[] = [];
      let latestRecordedAt: string | null = null;

      for (const r of sorted) {
        latestByProduct[r.product_id] = r.price_amount;
        const missingCount = productIds.filter((pid) => latestByProduct[pid] == null).length;
        const sum = productIds.reduce((acc, pid) => {
          const quantity = quantityByProductId[pid] ?? 0;
          return acc + ((latestByProduct[pid] ?? 0) * quantity);
        }, 0);
        points.push({ x: Date.parse(r.recorded_at), y: sum, missingCount });
        latestRecordedAt = r.recorded_at;
      }

      const latestPoint = points.length ? points[points.length - 1] : null;
      result.push({
        storeId: storeIdRow,
        store: comparisonStoresById[storeIdRow] ?? null,
        points,
        latestTotal: latestPoint ? latestPoint.y : null,
        latestMissingCount: latestPoint ? latestPoint.missingCount : productIds.length,
        latestRecordedAt,
      });
    }
    return result;
  }, [comparisonRows, items, comparisonStoresById, commonComparableProductIds, compareSelectedStoreIds]);

  const selectedCompareSeries = useMemo(
    () => compareSeriesByStore.filter((s) => compareSelectedStoreIds.includes(s.storeId)),
    [compareSeriesByStore, compareSelectedStoreIds]
  );

  const compareChartSeries = useMemo(() => {
    return selectedCompareSeries.map((s) => ({
      id: s.storeId,
      label: s.store?.name ? `${s.store.chain} – ${s.store.name}` : (s.store?.chain ?? 'Butikk'),
      color: '#2563EB',
      data: s.points
        .filter((p) => p.missingCount === 0)
        .map((p) => ({ x: p.x, y: p.y, label: new Date(p.x).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' }) })) satisfies ChartDataPoint[],
    }));
  }, [selectedCompareSeries]);

  const compareRanking = useMemo(() => {
    return selectedCompareSeries
      .filter((s) => s.latestTotal != null)
      .sort((a, b) => (a.latestTotal ?? Infinity) - (b.latestTotal ?? Infinity));
  }, [selectedCompareSeries]);

  const compareLatestPriceByStoreProduct = useMemo(() => {
    const selectedSet = new Set(compareSelectedStoreIds);
    const byStoreProduct: Record<string, Record<string, number>> = {};
    const sorted = [...comparisonRows].sort(
      (a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at)
    );

    for (const row of sorted) {
      if (!selectedSet.has(row.store_id)) continue;
      const storeBucket = (byStoreProduct[row.store_id] ||= {});
      if (storeBucket[row.product_id] != null) continue;
      storeBucket[row.product_id] = row.price_amount;
    }

    return byStoreProduct;
  }, [comparisonRows, compareSelectedStoreIds]);

  const compareItemRows = useMemo(() => {
    const productMap = new Map<string, ShoppingListItem>();
    for (const item of items) {
      if ((item.quantity ?? 0) <= 0) continue;
      if (!productMap.has(item.product_id)) productMap.set(item.product_id, item);
    }

    return Array.from(productMap.values()).map((item) => {
      const entries = compareSelectedStoreIds.map((storeId) => {
        const amount = compareLatestPriceByStoreProduct[storeId]?.[item.product_id] ?? null;
        const total = amount != null ? amount * (item.quantity || 0) : null;
        return { storeId, amount, total };
      });
      const cheapestTotal = entries.reduce<number | null>((best, cur) => {
        if (cur.total == null) return best;
        if (best == null) return cur.total;
        return cur.total < best ? cur.total : best;
      }, null);

      return { item, entries, cheapestTotal };
    });
  }, [items, compareSelectedStoreIds, compareLatestPriceByStoreProduct]);

  // I portrett skal matrisen gi plass til ca. to butikkolonner samtidig.
  const matrixProductColWidth = useMemo(() => {
    const min = 130;
    const max = 180;
    const target = Math.round(screenWidth * 0.36);
    return Math.min(max, Math.max(min, target));
  }, [screenWidth]);

  const matrixStoreColWidth = useMemo(() => {
    const available = Math.max(220, screenWidth - matrixProductColWidth - (spacing.lg * 2));
    return Math.max(92, Math.round(available / MAX_COMPARE_STORES));
  }, [screenWidth, matrixProductColWidth]);

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
          <Pressable
            mt={spacing.md}
            onPress={goBackToShoppingLists}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Tilbake"
          >
            <IconSymbol name="chevron.backward" size={22} color={c.textSecondary} />
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
              <Pressable
                onPress={goBackToShoppingLists}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Tilbake til handlelister"
              >
                <IconSymbol name="chevron.backward" size={22} color={c.textSecondary} />
              </Pressable>
              <Text fontSize={18} fontWeight="700" style={{ color: c.textSecondary }}>
                Handleliste
              </Text>
              <PremiumButton
                title="Slett"
                variant="outline"
                accentColor="#EF4444"
                onPress={handleDeleteList}
                style={compactHeaderBtnStyle}
                textStyle={{ fontSize: 14 }}
              />
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
                {isListNameDirty && (
                  <PremiumButton
                    title="Lagre"
                    onPress={handleSaveListMeta}
                    style={compactHeaderBtnStyle}
                    textStyle={{ fontSize: 14 }}
                  />
                )}
              </HStack>
              <HStack space="sm" mt={spacing.sm}>
                <Pressable
                  onPress={() => setShowComparisonPanel(false)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: !showComparisonPanel ? (c.tint ?? c.border) : c.border,
                    backgroundColor: !showComparisonPanel ? (c.tint ?? c.border) : c.surface,
                    alignItems: 'center',
                  }}
                >
                  <HStack alignItems="center" space="xs">
                    <IconSymbol name="list.bullet" size={16} color={!showComparisonPanel ? c.background : c.textSecondary} />
                    <Text fontSize={13} fontWeight="700" style={{ color: !showComparisonPanel ? c.background : c.textSecondary }}>
                      Handleliste
                    </Text>
                  </HStack>
                </Pressable>
                <Pressable
                  onPress={() => setShowComparisonPanel(true)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: showComparisonPanel ? (c.tint ?? c.border) : c.border,
                    backgroundColor: showComparisonPanel ? (c.tint ?? c.border) : c.surface,
                    alignItems: 'center',
                  }}
                >
                  <HStack alignItems="center" space="xs">
                    <IconSymbol name="chart.bar.fill" size={16} color={showComparisonPanel ? c.background : c.textSecondary} />
                    <Text fontSize={13} fontWeight="700" style={{ color: showComparisonPanel ? c.background : c.textSecondary }}>
                      Statistikk
                    </Text>
                  </HStack>
                </Pressable>
              </HStack>

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
                          onPress={() => void persistIcon(emoji)}
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

            </VStack>

            <Box flex={1} mt={spacing.md}>
              {!showComparisonPanel ? (
                <>
                  <DraggableFlatList
                    data={notPurchasedItems}
                    keyExtractor={item => item.id}
                    onDragEnd={async ({ data }) => {
                      const updatedNotPurchased = data.map((it, index) => ({
                        ...it,
                        position: index + 1,
                      }));
                      const purchasedWithStableOrder = purchasedItems.map((it, index) => ({
                        ...it,
                        position: updatedNotPurchased.length + index + 1,
                      }));
                      setItems([...updatedNotPurchased, ...purchasedWithStableOrder]);
                      await Promise.all(
                        [...updatedNotPurchased, ...purchasedWithStableOrder].map((it) =>
                          supabase
                            .from('shopping_list_items')
                            .update({ position: it.position })
                            .eq('id', it.id)
                        )
                      );
                    }}
                    renderItem={({
                      item,
                      drag,
                      isActive,
                    }: RenderItemParams<ShoppingListItem>) => {
                      return (
                        <VStack space="xs">
                          <ShoppingListItemRow
                            item={item}
                            hasStoreSelected={!!storeId}
                            storePrice={storeId ? (storePriceByProductId[item.product_id] ?? null) : null}
                            onToggleChecked={() =>
                              updateItem(item.id, { is_purchased: !item.is_purchased })
                            }
                            onChangeQuantity={q => updateItem(item.id, { quantity: q })}
                            onRequestDeleteItem={() => setPendingDeleteItem(item)}
                            onLongPress={drag}
                            isActive={isActive}
                            draggable
                          />
                        </VStack>
                      );
                    }}
                    contentContainerStyle={{
                      paddingBottom: insets.bottom + spacing.lg,
                      paddingTop: spacing.xs,
                    }}
                    ListFooterComponent={
                      purchasedItems.length > 0 ? (
                        <VStack space="xs" mt={spacing.lg}>
                          <VStack mb={spacing.xs} space="xs">
                            <Box height={hairlineWidth} bg={c.border} opacity={0.7} />
                            <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }}>
                              Kjøpt
                            </Text>
                          </VStack>
                          <VStack space="xs">
                            {purchasedItems.map((item) => (
                              <ShoppingListItemRow
                                key={item.id}
                                item={item}
                                hasStoreSelected={!!storeId}
                                storePrice={storeId ? (storePriceByProductId[item.product_id] ?? null) : null}
                                onToggleChecked={() =>
                                  updateItem(item.id, { is_purchased: !item.is_purchased })
                                }
                                onChangeQuantity={q => updateItem(item.id, { quantity: q })}
                                onRequestDeleteItem={() => setPendingDeleteItem(item)}
                                onLongPress={undefined}
                                isActive={false}
                                draggable={false}
                              />
                            ))}
                          </VStack>
                        </VStack>
                      ) : null
                    }
                    ListHeaderComponent={
                      <VStack space="md" mb={spacing.md}>
                        <VStack space="xs">
                          <Pressable
                            onPress={() => setShowStorePicker((prev) => !prev)}
                            style={{
                              paddingVertical: spacing.sm,
                              paddingHorizontal: spacing.md,
                              borderRadius: radius.lg,
                              borderWidth: hairlineWidth,
                              borderColor: c.border,
                              backgroundColor: c.surface,
                            }}
                          >
                            <HStack justifyContent="space-between" alignItems="center">
                              <VStack space="xs" flex={1}>
                                <Text fontSize={12} style={{ color: c.textMuted }}>
                                  Velg butikk
                                </Text>
                                <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }} numberOfLines={1}>
                                  {storeId
                                    ? (() => {
                                        const selected = favoriteStores.find((s) => s.id === storeId);
                                        return selected
                                          ? (selected.name ? `${selected.chain} – ${selected.name}` : selected.chain)
                                          : 'Valgt butikk';
                                      })()
                                    : 'Ingen butikk'}
                                </Text>
                              </VStack>
                              <Pressable
                                onPress={() => setShowListStoreInfoAlert(true)}
                                hitSlop={8}
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: c.border,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: c.surface,
                                }}
                              >
                                <Text fontSize={11} fontWeight="700" style={{ color: c.textSecondary }}>
                                  i
                                </Text>
                              </Pressable>
                            </HStack>
                          </Pressable>

                          {showStorePicker && (
                            <VStack space="xs" mt={spacing.xs}>
                              <Text fontSize={12} style={{ color: c.textMuted }}>
                                Du kan kun velge mellom favorittbutikkene dine.
                              </Text>
                              <Pressable
                                onPress={async () => {
                                  await persistStoreId(null);
                                  setShowStorePicker(false);
                                }}
                                style={{
                                  paddingVertical: spacing.xs,
                                  paddingHorizontal: spacing.sm,
                                  borderRadius: radius.md,
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

                              {favoriteStores.map((store) => {
                                const active = storeId === store.id;
                                const label = store.name ? `${store.chain} – ${store.name}` : store.chain;
                                return (
                                  <Pressable
                                    key={store.id}
                                    onPress={async () => {
                                      await persistStoreId(store.id);
                                      setShowStorePicker(false);
                                    }}
                                    style={{
                                      paddingVertical: spacing.xs,
                                      paddingHorizontal: spacing.sm,
                                      borderRadius: radius.md,
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

                              {favoriteStores.length === 0 && (
                                <Text fontSize={12} style={{ color: c.textMuted }}>
                                  Du har ingen favorittbutikker ennå.
                                </Text>
                              )}
                            </VStack>
                          )}
                        </VStack>

                        <VStack space="xs">
                          <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
                            Søk og legg til produkter
                          </Text>
                          <Box
                            p={spacing.sm}
                            borderRadius={radius.lg}
                            style={{
                              borderWidth: 1.5,
                              borderColor: focusedField === 'search' ? (c.primary ?? c.tint ?? c.border) : (c.tint ?? c.border),
                              backgroundColor: c.surface,
                            }}
                          >
                            <Input
                              variant="outline"
                              size="md"
                              style={[
                                baseInputStyle,
                                {
                                  borderWidth: 0,
                                  backgroundColor: 'transparent',
                                  paddingHorizontal: 0,
                                  marginVertical: 0,
                                },
                              ]}
                            >
                              <InputField
                                placeholder="Søk etter produktnavn for å legge til"
                                placeholderTextColor={c.textMuted}
                                value={search}
                                onChangeText={handleSearchProducts}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{ color: c.text, fontSize: 15 }}
                                onFocus={() => setFocusedField('search')}
                                onBlur={() =>
                                  setFocusedField(prev => (prev === 'search' ? null : prev))
                                }
                              />
                            </Input>
                          </Box>
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

                        <HStack justifyContent="space-between" alignItems="center">
                          <VStack space="xs">
                            <Text fontSize={14} fontWeight="700" style={{ color: c.textSecondary }}>
                              Produkter i listen
                            </Text>
                            {storeId ? (
                              totalPricing ? (
                                <Text fontSize={12} style={{ color: c.textMuted }}>
                                  Total: {totalPricing.total.toFixed(2)} kr
                                  {totalPricing.missingCount > 0
                                    ? ` · Pris mangler: ${totalPricing.missingCount}`
                                    : ''}
                                </Text>
                              ) : (
                                <Text fontSize={12} style={{ color: c.textMuted }}>
                                  Total: 0.00 kr
                                </Text>
                              )
                            ) : (
                              <Text fontSize={12} style={{ color: c.textMuted }}>
                                Velg butikk for å se butikkpriser og total
                              </Text>
                            )}
                          </VStack>
                          <Text fontSize={13} style={{ color: c.textMuted }}>
                            {items.length} totalt · {checkedCount} kjøpt
                          </Text>
                        </HStack>
                      </VStack>
                    }
                  />
                </>
              ) : (
                <Pressable flex={1} onPress={() => setShowCompareStorePicker(false)}>
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
                  >
                    <Pressable onPress={(e: any) => e?.stopPropagation?.()}>
                      <VStack space="md">
                    <Box
                      p={spacing.md}
                      borderRadius={radius.xl}
                      style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                    >
                      <HStack alignItems="center" justifyContent="space-between">
                        <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                          Sammenlign handleliste
                        </Text>
                        <Pressable
                          onPress={() => setShowCompareInfoAlert(true)}
                          hitSlop={8}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: c.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: c.surface,
                          }}
                        >
                          <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                            i
                          </Text>
                        </Pressable>
                      </HStack>

                      <HStack space="sm" mt={spacing.sm} flexWrap="wrap">
                        {[
                          { id: 'favorites' as const, label: 'Favoritter' },
                          { id: 'nearest' as const, label: 'Nærmeste' },
                          { id: 'search' as const, label: 'Velg & søk' },
                        ].map((opt) => {
                          const active = compareMode === opt.id;
                          return (
                            <Pressable
                              key={opt.id}
                              onPress={() => {
                                if (active && showCompareStorePicker) {
                                  setShowCompareStorePicker(false);
                                  return;
                                }
                                setCompareMode(opt.id);
                                setShowCompareStorePicker(true);
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
                              <Text fontSize={13} style={{ color: active ? c.background : c.textSecondary }}>
                                {opt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </HStack>

                      {showCompareStorePicker && compareMode === 'search' && (
                        <Input
                          variant="outline"
                          size="md"
                          mt={spacing.sm}
                          style={{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: hairlineWidth, borderColor: c.border }}
                        >
                          <InputField
                            placeholder="Søk butikk"
                            placeholderTextColor={c.textMuted}
                            value={compareSearch}
                            onChangeText={setCompareSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{ color: c.text }}
                          />
                        </Input>
                      )}

                      {showCompareStorePicker && (
                        <ScrollView style={{ maxHeight: 220, marginTop: spacing.sm }} showsVerticalScrollIndicator={false}>
                          <VStack space="xs">
                            {comparePickerResults.map((s) => {
                              const active = compareSelectedStoreIds.includes(s.id);
                              const canSelect = active || compareSelectedStoreIds.length < MAX_COMPARE_STORES;
                              return (
                                <Pressable
                                  key={`compare-store-${s.id}`}
                                  disabled={!canSelect}
                                  onPress={() => {
                                    setCompareSelectedStoreIds((prev) => {
                                      if (prev.includes(s.id)) return prev.filter((id) => id !== s.id);
                                      if (prev.length >= MAX_COMPARE_STORES) return prev;
                                      return [...prev, s.id];
                                    });
                                  }}
                                  style={{
                                    paddingVertical: spacing.xs,
                                    paddingHorizontal: spacing.sm,
                                    borderRadius: radius.md,
                                    borderWidth: 1,
                                    borderColor: active ? (c.tint ?? c.border) : c.border,
                                    backgroundColor: active ? (c.tint ?? c.border) : 'transparent',
                                    opacity: canSelect ? 1 : 0.5,
                                  }}
                                >
                                  <HStack justifyContent="space-between" alignItems="center">
                                    <Text fontSize={13} fontWeight="700" style={{ color: active ? c.background : c.textSecondary }} numberOfLines={1} flex={1}>
                                      {s.name ? `${s.chain} – ${s.name}` : s.chain}
                                    </Text>
                                    {userLocation ? (
                                      <Text fontSize={12} style={{ color: active ? c.background : c.textMuted }}>
                                        {distanceKm(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude).toFixed(1)} km
                                      </Text>
                                    ) : null}
                                  </HStack>
                                </Pressable>
                              );
                            })}
                          </VStack>
                        </ScrollView>
                      )}
                    </Box>

                    <Box
                      p={spacing.md}
                      borderRadius={radius.xl}
                      style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                    >
                      <HStack alignItems="center" justifyContent="space-between">
                        <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                          Butikkrangering (billigst til dyrest)
                        </Text>
                        <Pressable
                          onPress={() => setShowCompareInfoAlert(true)}
                          hitSlop={8}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: c.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: c.surface,
                          }}
                        >
                          <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                            i
                          </Text>
                        </Pressable>
                      </HStack>
                      {compareRanking.length > 0 ? (
                        <VStack space="xs" mt={spacing.sm}>
                          {compareRanking.map((entry, index) => {
                            const label = entry.store?.name
                              ? `${entry.store.chain} – ${entry.store.name}`
                              : (entry.store?.chain ?? 'Butikk');
                            const isBest = index === 0;
                            return (
                              <HStack
                                key={`rank-${entry.storeId}`}
                                alignItems="center"
                                justifyContent="space-between"
                                style={{
                                  paddingVertical: spacing.xs,
                                  paddingHorizontal: spacing.sm,
                                  borderRadius: radius.md,
                                  borderWidth: hairlineWidth,
                                  borderColor: isBest ? '#16A34A' : c.border,
                                  backgroundColor: isBest ? 'rgba(22,163,74,0.08)' : 'transparent',
                                }}
                              >
                                <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }} numberOfLines={1} flex={1}>
                                  {index + 1}. {label}
                                </Text>
                                <Text fontSize={13} fontWeight="700" style={{ color: isBest ? '#16A34A' : c.textSecondary }}>
                                  {(entry.latestTotal ?? 0).toFixed(2)} kr
                                </Text>
                              </HStack>
                            );
                          })}
                        </VStack>
                      ) : (
                        <Text mt={spacing.sm} fontSize={12} style={{ color: c.textMuted }}>
                          {commonComparableProductIds.length === 0
                            ? 'Ingen felles varer med pris på tvers av valgte butikker.'
                            : 'Mangler rangering for valgte butikker akkurat nå.'}
                        </Text>
                      )}
                    </Box>

                    <Box
                      p={spacing.md}
                      borderRadius={radius.xl}
                      style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                    >
                      <HStack alignItems="center" justifyContent="space-between">
                        <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                          Totalpris over tid
                        </Text>
                        <Pressable
                          onPress={() => setShowCompareInfoAlert(true)}
                          hitSlop={8}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: c.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: c.surface,
                          }}
                        >
                          <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                            i
                          </Text>
                        </Pressable>
                      </HStack>
                      {compareChartSeries.length > 0 ? (
                        <LineChart
                          series={compareChartSeries}
                          config={{
                            height: 230,
                            showGrid: true,
                            showLabels: true,
                            showYLabels: true,
                            yAxisWidth: 44,
                            yLabelCount: 5,
                            interactive: true,
                            gradient: false,
                            animated: true,
                          }}
                        />
                      ) : (
                        <Text mt={spacing.sm} fontSize={12} style={{ color: c.textMuted }}>
                          {commonComparableProductIds.length === 0
                            ? 'Ingen felles varer med pris for de valgte butikkene.'
                            : 'Velg butikker med tilgjengelige priser for å se utvikling.'}
                        </Text>
                      )}
                    </Box>

                    <Box
                      p={spacing.md}
                      borderRadius={radius.xl}
                      style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                    >
                      <HStack alignItems="center" justifyContent="space-between">
                        <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                          Varesammenligning per butikk
                        </Text>
                        <Pressable
                          onPress={() => setShowMatrixInfoAlert(true)}
                          hitSlop={8}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: c.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: c.surface,
                          }}
                        >
                          <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                            i
                          </Text>
                        </Pressable>
                      </HStack>
                      {compareItemRows.length > 0 && compareSelectedStoreIds.length > 0 ? (
                        <VStack style={{ marginTop: spacing.sm }}>
                            <HStack
                              style={{
                                borderBottomWidth: hairlineWidth,
                                borderBottomColor: c.border,
                                paddingBottom: spacing.xs,
                              }}
                            >
                              <Box width={matrixProductColWidth} pr={spacing.sm}>
                                <Text fontSize={12} fontWeight="700" style={{ color: c.textMuted }}>
                                  Produkt
                                </Text>
                              </Box>
                              {compareSelectedStoreIds.map((storeId) => {
                                const store = comparisonStoresById[storeId];
                                const chainShort = (store?.chain ?? 'Butikk').trim();
                                const nameShort = (store?.name ?? '').trim();
                                return (
                                  <Box key={`matrix-head-${storeId}`} width={matrixStoreColWidth} pl={spacing.xs}>
                                    <VStack space="xs">
                                      <Text fontSize={10} fontWeight="700" style={{ color: c.textMuted }} numberOfLines={1}>
                                        {chainShort}
                                      </Text>
                                      <Text fontSize={10} style={{ color: c.textMuted }} numberOfLines={1}>
                                        {nameShort || '—'}
                                      </Text>
                                    </VStack>
                                  </Box>
                                );
                              })}
                            </HStack>

                            {compareItemRows.map(({ item, entries, cheapestTotal }) => (
                              <HStack
                                key={`compare-item-${item.id}`}
                                alignItems="center"
                                style={{
                                  borderBottomWidth: hairlineWidth,
                                  borderBottomColor: c.border,
                                  paddingVertical: spacing.sm,
                                }}
                              >
                                <Box width={matrixProductColWidth} pr={spacing.sm}>
                                  <Text fontSize={12} style={{ color: c.textSecondary }} numberOfLines={2}>
                                    {item.product.name} x {item.quantity}
                                  </Text>
                                </Box>
                                {entries.map((entry) => {
                                  const isBest =
                                    cheapestTotal != null && entry.total != null && entry.total === cheapestTotal;
                                  return (
                                    <Box key={`matrix-cell-${item.id}-${entry.storeId}`} width={matrixStoreColWidth} pl={spacing.xs}>
                                      <Text fontSize={12} fontWeight="700" style={{ color: isBest ? '#16A34A' : c.textSecondary }}>
                                        {entry.total != null ? `${entry.total.toFixed(2)} kr` : '—'}
                                      </Text>
                                    </Box>
                                  );
                                })}
                              </HStack>
                            ))}
                          </VStack>
                      ) : (
                        <Text mt={spacing.sm} fontSize={12} style={{ color: c.textMuted }}>
                          Velg minst én butikk for å sammenligne varer.
                        </Text>
                      )}
                    </Box>
                      </VStack>
                    </Pressable>
                  </ScrollView>
                </Pressable>
              )}
            </Box>
          </VStack>
        </Box>
        {pendingDeleteItem && (
          <Pressable
            onPress={() => setPendingDeleteItem(null)}
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
              <VStack space="sm">
                <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary }}>
                  Slette vare?
                </Text>
                <Text fontSize={13} style={{ color: c.textMuted }}>
                  Vil du fjerne "{pendingDeleteItem.product.name}" fra handlelisten?
                </Text>
                <HStack space="sm" mt={spacing.sm}>
                  <PremiumButton
                    title="Avbryt"
                    variant="outline"
                    onPress={() => setPendingDeleteItem(null)}
                    style={{ flex: 1, minHeight: 40 }}
                    textStyle={{ fontSize: 14 }}
                  />
                  <PremiumButton
                    title="Slett"
                    accentColor="#EF4444"
                    onPress={async () => {
                      const targetId = pendingDeleteItem.id;
                      setPendingDeleteItem(null);
                      await deleteItem(targetId);
                    }}
                    style={{ flex: 1, minHeight: 40 }}
                    textStyle={{ fontSize: 14 }}
                  />
                </HStack>
              </VStack>
            </Pressable>
          </Pressable>
        )}
        {showCompareInfoAlert && (
          <Pressable
            onPress={() => setShowCompareInfoAlert(false)}
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
              <VStack space="sm">
                <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary }}>
                  Hvordan sammenligningen fungerer
                </Text>
                <Text fontSize={13} style={{ color: c.textMuted }}>
                  Du kan maksimalt sammenligne to butikker om gangen.
                  Vi sammenligner kun varer som begge valgte butikker har registrert pris på.
                  Hvis en vare mangler pris i en butikk, tas den ut av sammenligningen for begge.
                </Text>
                <PremiumButton
                  title="Skjønner"
                  onPress={() => setShowCompareInfoAlert(false)}
                  style={{ minHeight: 40, marginTop: spacing.sm }}
                  textStyle={{ fontSize: 14 }}
                />
              </VStack>
            </Pressable>
          </Pressable>
        )}
        {showListStoreInfoAlert && (
          <Pressable
            onPress={() => setShowListStoreInfoAlert(false)}
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
              <VStack space="sm">
                <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary }}>
                  Om butikkvalg i handlelisten
                </Text>
                <Text fontSize={13} style={{ color: c.textMuted }}>
                  Du kan kun velge mellom favorittbutikkene dine. Butikkvalget brukes til å
                  beregne en estimert totalpris for handlekurven basert på innhentede priser.
                </Text>
                <PremiumButton
                  title="Skjønner"
                  onPress={() => setShowListStoreInfoAlert(false)}
                  style={{ minHeight: 40, marginTop: spacing.sm }}
                  textStyle={{ fontSize: 14 }}
                />
              </VStack>
            </Pressable>
          </Pressable>
        )}
        {showMatrixInfoAlert && (
          <Pressable
            onPress={() => setShowMatrixInfoAlert(false)}
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
              <VStack space="sm">
                <Text fontSize={16} fontWeight="700" style={{ color: c.textSecondary }}>
                  Prismatrise
                </Text>
                <Text fontSize={13} style={{ color: c.textMuted }}>
                  Du kan maksimalt sammenligne to butikker om gangen i stående format.
                  Tabellen viser én kolonne per valgt butikk.
                </Text>
                <PremiumButton
                  title="Skjønner"
                  onPress={() => setShowMatrixInfoAlert(false)}
                  style={{ minHeight: 40, marginTop: spacing.sm }}
                  textStyle={{ fontSize: 14 }}
                />
              </VStack>
            </Pressable>
          </Pressable>
        )}
      </GestureHandlerRootView>
    </BlurStatusBarView>
  );
}

type RowProps = {
  item: ShoppingListItem;
  hasStoreSelected: boolean;
  storePrice: StorePriceEntry | null;
  onToggleChecked: () => void;
  onChangeQuantity: (q: number) => void;
  onRequestDeleteItem: () => void;
  onLongPress?: () => void;
  isActive: boolean;
  draggable: boolean;
};

function ShoppingListItemRow({
  item,
  hasStoreSelected,
  storePrice,
  onToggleChecked,
  onChangeQuantity,
  onRequestDeleteItem,
  onLongPress,
  isActive,
  draggable,
}: RowProps) {
  const c = useDesignColors();

  const handleQuantityChange = (delta: number) => {
    const next = Math.max(0, (item.quantity || 0) + delta);
    if (delta < 0 && next === 0) {
      onRequestDeleteItem();
      return;
    }
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
            <Text fontSize={12} style={{ color: c.textSecondary }}>
              {hasStoreSelected
                ? storePrice
                ? `${storePrice.price_amount.toFixed(2)} kr / ${item.product.unit}`
                : 'Pris mangler'
                : 'Velg butikk'}
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
            {storePrice ? (
              <Text fontSize={12} fontWeight="700" style={{ color: c.textSecondary }}>
                {(storePrice.price_amount * (item.quantity || 0)).toFixed(2)} kr
              </Text>
            ) : (
              <Text fontSize={11} style={{ color: c.textMuted }}>
                —
              </Text>
            )}
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


