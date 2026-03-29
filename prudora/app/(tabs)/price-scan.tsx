import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  Input,
  InputField,
  Pressable,
  ScrollView,
  Spinner,
  Switch,
} from '@gluestack-ui/themed';
import { ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';

import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { hairlineWidth, radius, spacing } from '@/constants/design';
import { useDesignColors } from '@/hooks/use-design-colors';
import { useAuth } from '@/lib/auth-context';
import { distanceKm, formatDistance } from '@/lib/location-utils';
import { supabase } from '@/lib/supabase';
import type { Product, ProductCategory } from '@/types/database';

export default function PriceScanScreen() {
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const { profile, user, isLoading, refreshProfile, appMode } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRequested = useMemo(
    () => !!profile?.price_verification_requested_at && !profile?.is_price_verified,
    [profile]
  );

  const handleRequestAccess = useCallback(async () => {
    if (!profile) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          price_verification_requested_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      if (updateError) {
        setError(updateError.message ?? 'Kunne ikke sende søknad. Prøv igjen.');
        return;
      }
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.');
    } finally {
      setSubmitting(false);
    }
  }, [profile, refreshProfile]);

  if (isLoading || !profile) {
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
          <ActivityIndicator size="large" color={c.primary} />
          <Text mt={spacing.md} fontSize={15} style={{ color: c.textMuted }}>
            Laster bruker…
          </Text>
        </Box>
      </BlurStatusBarView>
    );
  }

  if (profile.is_price_verified) {
    return <VerifiedPriceScan />;
  }

  const requestedDate =
    profile.price_verification_requested_at &&
    new Date(profile.price_verification_requested_at).toLocaleDateString('nb-NO');

  return (
    <BlurStatusBarView edges={['top']}>
      <Box
        flex={1}
        pt={insets.top + spacing.lg}
        pb={insets.bottom + spacing.lg}
        px={spacing.lg}
        style={{ backgroundColor: c.background }}
      >
        <VStack space="lg">
          <VStack space="sm">
            <Text fontSize={20} fontWeight="700" style={{ color: c.textSecondary }}>
              Pris-scanning krever verifisering
            </Text>
            <Text fontSize={15} style={{ color: c.text }}>
              For å kunne legge inn priser på produkter må kontoen din først verifiseres av en administrator.
            </Text>
          </VStack>

          <VStack space="sm">
            <Text fontSize={15} style={{ color: c.text }}>
              Når du sender inn en søknad vil en admin gjennomgå kontoen din og gi deg tilgang. Du får tilgang så snart
              søknaden er godkjent.
            </Text>
            {hasRequested && (
              <Text fontSize={14} style={{ color: c.textMuted }}>
                Søknad sendt {requestedDate}. Vennligst avvent godkjenning fra admin.
              </Text>
            )}
          </VStack>

          {error && (
            <Text fontSize={14} style={{ color: c.error ?? '#ff4d4f' }}>
              {error}
            </Text>
          )}

          <PremiumButton
            title={
              hasRequested
                ? 'Søknad sendt'
                : submitting
                  ? 'Sender søknad…'
                  : 'Send søknad om pris-tilgang'
            }
            onPress={handleRequestAccess}
            disabled={submitting || hasRequested}
          />
        </VStack>
      </Box>
    </BlurStatusBarView>
  );

  function formatFixed2(n: number): string {
    const rounded = Math.round(n * 100);
    const intPart = Math.floor(Math.abs(rounded) / 100);
    const fracPart = String(Math.abs(rounded) % 100).padStart(2, '0');
    return `${n < 0 ? '-' : ''}${intPart},${fracPart}`;
  }

  function formatDateShort(iso: string): string {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }

  function VerifiedPriceScan() {
    const MAX_STORE_CONFIRM_DISTANCE_KM = 0.1; // 100 meters
    const adminBypassDistanceCheck = !!profile?.is_admin && appMode === 'admin';
    const [permission, requestPermission] = useCameraPermissions();
    const [scannerOpen, setScannerOpen] = useState(false);

    const [scanError, setScanError] = useState<string | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
    const [foundProduct, setFoundProduct] = useState<Product | null>(null);
    const [isUnknown, setIsUnknown] = useState(false);

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const STORE_CONFIRM_STORAGE_KEY = 'prudora_price_store_confirm_v1';

    const [stores, setStores] = useState<
      {
        id: string;
        chain: string;
        name: string | null;
        address: string;
        latitude: number;
        longitude: number;
        logo_url: string | null;
      }[]
    >([]);
    const [storesLoading, setStoresLoading] = useState(false);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [storeConfirmedAt, setStoreConfirmedAt] = useState<number | null>(null);

    const selectedStore = useMemo(() => {
      if (!selectedStoreId) return null;
      return stores.find((s) => s.id === selectedStoreId) ?? null;
    }, [stores, selectedStoreId]);

    const selectedStoreDistanceKm = useMemo(() => {
      if (!selectedStore || !userLocation) return null;
      return distanceKm(userLocation.latitude, userLocation.longitude, selectedStore.latitude, selectedStore.longitude);
    }, [selectedStore, userLocation]);

    const selectedStoreWithinConfirmRadius = useMemo(() => {
      if (adminBypassDistanceCheck) return true;
      if (selectedStoreDistanceKm == null) return false;
      return selectedStoreDistanceKm <= MAX_STORE_CONFIRM_DISTANCE_KM;
    }, [MAX_STORE_CONFIRM_DISTANCE_KM, adminBypassDistanceCheck, selectedStoreDistanceKm]);

    const storeConfirmed = storeConfirmedAt != null && Date.now() - storeConfirmedAt < ONE_HOUR_MS;

    useEffect(() => {
      if (storeConfirmedAt == null) return;
      const elapsed = Date.now() - storeConfirmedAt;
      if (elapsed >= ONE_HOUR_MS) {
        setStoreConfirmedAt(null);
        return;
      }
      const remaining = ONE_HOUR_MS - elapsed;
      const t = setTimeout(() => setStoreConfirmedAt(null), remaining);
      return () => clearTimeout(t);
    }, [storeConfirmedAt]);

    const storesSorted = useMemo(() => {
      if (!userLocation) return stores;
      return [...stores].sort((a, b) => {
        const da = distanceKm(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude);
        const db = distanceKm(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude);
        return da - db;
      });
    }, [stores, userLocation]);

    const nearestStores = useMemo(() => storesSorted.slice(0, 3), [storesSorted]);

    const storesWithinConfirmRadius = useMemo(() => {
      if (adminBypassDistanceCheck) return storesSorted;
      if (!userLocation) return [];
      return storesSorted.filter(
        (store) =>
          distanceKm(userLocation.latitude, userLocation.longitude, store.latitude, store.longitude) <=
          MAX_STORE_CONFIRM_DISTANCE_KM
      );
    }, [MAX_STORE_CONFIRM_DISTANCE_KM, adminBypassDistanceCheck, storesSorted, userLocation]);

    const hasAnyStoreWithinConfirmRadius = storesWithinConfirmRadius.length > 0;

    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(false);

    const lastScanRef = useRef<{ value: string; at: number } | null>(null);

    const [newProduct, setNewProduct] = useState({
      name: '',
      supplier: '',
      manufacturer: '',
      unit: '',
      unit_price_amount: '1',
      is_weight_item: false,
      category_id: '',
    });
    const [creating, setCreating] = useState(false);
    const [createdPending, setCreatedPending] = useState(false);
    const [thankYouMessage, setThankYouMessage] = useState<string | null>(null);

    const [priceDraft, setPriceDraft] = useState(''); // kr per products.unit
    const [priceSubmitting, setPriceSubmitting] = useState(false);
    const [priceConfirmationMessage, setPriceConfirmationMessage] = useState<string | null>(null);
    const [lastStorePrice, setLastStorePrice] = useState<{ price: number; recorded_at: string } | null>(null);
    const [lastStorePriceLoading, setLastStorePriceLoading] = useState(false);
    const [switchStoreDialog, setSwitchStoreDialog] = useState<{ storeId: string; label: string } | null>(null);

    const baseInputStyle = useMemo(
      () => ({
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderWidth: hairlineWidth,
        borderColor: c.border,
      }),
      [c]
    );

    useEffect(() => {
      if (!foundProduct || !selectedStoreId) {
        setLastStorePrice(null);
        return;
      }
      let cancelled = false;
      setLastStorePriceLoading(true);
      setLastStorePrice(null);
      (async () => {
        const { data } = await supabase
          .from('product_prices')
          .select('price_amount, recorded_at')
          .eq('product_id', foundProduct.id)
          .eq('store_id', selectedStoreId)
          .eq('approval_status', 'approved')
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        setLastStorePrice(
          data ? { price: Number(data.price_amount), recorded_at: data.recorded_at as string } : null
        );
        setLastStorePriceLoading(false);
      })();
      return () => { cancelled = true; };
    }, [foundProduct, selectedStoreId]);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        setCategoriesLoading(true);
        const { data, error } = await supabase
          .from('product_categories')
          .select('id, name, created_at, updated_at')
          .order('name');
        if (cancelled) return;
        if (error) {
          setCategories([]);
          setCategoriesLoading(false);
          return;
        }
        setCategories((data ?? []) as ProductCategory[]);
        setCategoriesLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    const resetState = useCallback(() => {
      setScanError(null);
      setLookupLoading(false);
      setScannedBarcode(null);
      setFoundProduct(null);
      setIsUnknown(false);
      setCreatedPending(false);
      setThankYouMessage(null);
      setPriceDraft('');
      setPriceConfirmationMessage(null);
      setLastStorePrice(null);
      setLastStorePriceLoading(false);
      setCreating(false);
      setNewProduct({
        name: '',
        supplier: '',
        manufacturer: '',
        unit: '',
        unit_price_amount: '1',
        is_weight_item: false,
        category_id: '',
      });
      lastScanRef.current = null;
    }, []);

    const loadStores = useCallback(async () => {
      setStoresLoading(true);
      setScanError(null);
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, chain, name, address, latitude, longitude, logo_url')
          .order('chain');
        if (error) throw error;
        const next = (data ?? []) as any[];
        setStores(next);
        return next;
      } catch (e) {
        setStores([]);
        setScanError(e instanceof Error ? e.message : 'Kunne ikke hente butikker.');
        return [];
      } finally {
        setStoresLoading(false);
      }
    }, []);

    const loadSavedStoreConfirmation = useCallback(async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_CONFIRM_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { storeId: string; confirmedAt: number };
        if (!parsed?.storeId || typeof parsed.confirmedAt !== 'number') return null;
        if (Date.now() - parsed.confirmedAt > ONE_HOUR_MS) return null;
        return parsed;
      } catch {
        return null;
      }
    }, []);

    const saveStoreConfirmation = useCallback(async (storeId: string) => {
      const confirmedAt = Date.now();
      await AsyncStorage.setItem(
        STORE_CONFIRM_STORAGE_KEY,
        JSON.stringify({ storeId, confirmedAt })
      );
      setStoreConfirmedAt(confirmedAt);
      setSelectedStoreId(storeId);
    }, []);

    const handleConfirmStore = useCallback(async () => {
      if (!selectedStoreId) {
        setScanError('Velg en butikk først.');
        return;
      }
      if (!adminBypassDistanceCheck && !userLocation) {
        setScanError('Lokasjon er nødvendig for å bekrefte butikk innen 100 meter.');
        return;
      }
      if (!adminBypassDistanceCheck && !selectedStoreWithinConfirmRadius) {
        setScanError('Du må være innen 100 meter fra valgt butikk for å bekrefte.');
        return;
      }
      setScanError(null);
      try {
        await saveStoreConfirmation(selectedStoreId);
      } catch {
        setScanError('Kunne ikke bekrefte butikk. Prøv igjen.');
      }
    }, [adminBypassDistanceCheck, saveStoreConfirmation, selectedStoreId, selectedStoreWithinConfirmRadius, userLocation]);

    const handleSelectStore = useCallback(
      (storeId: string) => {
        if (!storeId || storeId === selectedStoreId) return;

        const nextStore = stores.find((s) => s.id === storeId);
        const nextStoreLabel = nextStore
          ? nextStore.name
            ? `${nextStore.chain} – ${nextStore.name}`
            : nextStore.chain
          : 'valgt butikk';

        setSwitchStoreDialog({ storeId, label: nextStoreLabel });
      },
      [selectedStoreId, stores]
    );

    const resolveGpsLocation = useCallback(async () => {
      try {
        if (Platform.OS === 'web') return null;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return null;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      } catch {
        return null;
      }
    }, []);

    const pickSuggestedStoreFromLocation = useCallback(
      (loc: { latitude: number; longitude: number } | null, allStores: typeof stores) => {
        if (adminBypassDistanceCheck) return allStores[0] ?? null;
        if (!loc || allStores.length === 0) return null;
        const sorted = [...allStores].sort((a, b) => {
          const da = distanceKm(loc.latitude, loc.longitude, a.latitude, a.longitude);
          const db = distanceKm(loc.latitude, loc.longitude, b.latitude, b.longitude);
          return da - db;
        });
        const nearest = sorted[0] ?? null;
        if (!nearest) return null;
        const nearestDistance = distanceKm(loc.latitude, loc.longitude, nearest.latitude, nearest.longitude);
        return nearestDistance <= MAX_STORE_CONFIRM_DISTANCE_KM ? nearest : null;
      },
      [adminBypassDistanceCheck]
    );

    useEffect(() => {
      let cancelled = false;
      (async () => {
        const allStores = await loadStores();
        const loc = await resolveGpsLocation();
        if (cancelled) return;
        setUserLocation(loc);

        const saved = await loadSavedStoreConfirmation();
        if (cancelled) return;
        if (saved?.storeId) {
          const savedStore = allStores.find((s) => s.id === saved.storeId);
          const isSavedStoreWithinRadius =
            adminBypassDistanceCheck ||
            (!!loc &&
            !!savedStore &&
            distanceKm(loc.latitude, loc.longitude, savedStore.latitude, savedStore.longitude) <=
              MAX_STORE_CONFIRM_DISTANCE_KM);

          if (isSavedStoreWithinRadius) {
            setSelectedStoreId(saved.storeId);
            setStoreConfirmedAt(saved.confirmedAt);
            return;
          }
        }

        const suggested = pickSuggestedStoreFromLocation(loc, allStores);
        if (cancelled) return;
        setSelectedStoreId(suggested?.id ?? null);
        setStoreConfirmedAt(null);
      })();
      return () => {
        cancelled = true;
      };
    }, [adminBypassDistanceCheck, loadSavedStoreConfirmation, loadStores, pickSuggestedStoreFromLocation, resolveGpsLocation]);

    const openScanner = useCallback(async () => {
      setScanError(null);
      if (!adminBypassDistanceCheck && !userLocation) {
        setScanError('Lokasjon må være aktiv for å bruke scanneren.');
        return;
      }
      if (!adminBypassDistanceCheck && !hasAnyStoreWithinConfirmRadius) {
        setScanError('Ingen butikk er innen 100 meter. Scanner kan ikke brukes her.');
        return;
      }
      if (!selectedStoreId || !storeConfirmed) {
        setScanError('Velg og bekreft butikk først.');
        return;
      }
      if (!adminBypassDistanceCheck && !selectedStoreWithinConfirmRadius) {
        setScanError('Valgt butikk er ikke innen 100 meter.');
        return;
      }
      if (!permission) return;
      if (!permission.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          setScanError('Kameratilgang er nødvendig for å scanne strekkoder.');
          return;
        }
      }
      resetState();
      setScannerOpen(true);
    }, [
      adminBypassDistanceCheck,
      hasAnyStoreWithinConfirmRadius,
      permission,
      requestPermission,
      resetState,
      selectedStoreId,
      selectedStoreWithinConfirmRadius,
      storeConfirmed,
      userLocation,
    ]);

    const lookupBarcode = useCallback(
      async (code: string) => {
        setLookupLoading(true);
        setScanError(null);
        setFoundProduct(null);
        setIsUnknown(false);
        setCreatedPending(false);

        try {
          const { data, error } = await supabase
            .from('products')
            .select(
              'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, created_at, updated_at, barcode, approval_status'
            )
            .eq('barcode', code)
            .eq('approval_status', 'approved')
            .maybeSingle();

          if (error) {
            setScanError(error.message ?? 'Kunne ikke slå opp produkt. Prøv igjen.');
            return;
          }

          if (data) {
            setFoundProduct(data as unknown as Product);
            setIsUnknown(false);
          } else {
            setIsUnknown(true);
          }
        } catch (e) {
          setScanError(e instanceof Error ? e.message : 'Noe gikk galt ved oppslag.');
        } finally {
          setLookupLoading(false);
        }
      },
      []
    );

    const handleBarcodeScanned = useCallback(
      async (payload: { data?: string } | { raw?: string } | any) => {
        const raw = (payload?.data ?? payload?.raw ?? '').trim();
        if (!raw) return;

        const now = Date.now();
        const last = lastScanRef.current;
        if (last && last.value === raw && now - last.at < 1500) return;
        lastScanRef.current = { value: raw, at: now };

        setScannedBarcode(raw);
        setScannerOpen(false);

        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // ignore
        }

        await lookupBarcode(raw);
      },
      [lookupBarcode]
    );

    const handleCreatePending = useCallback(async () => {
      if (!user) {
        setScanError('Du må være innlogget for å legge til produkter.');
        return;
      }
      if (!scannedBarcode) {
        setScanError('Mangler strekkode. Scan på nytt.');
        return;
      }
      const name = newProduct.name.trim();
      if (!name) {
        setScanError('Skriv inn produktnavn.');
        return;
      }
      const amount = parseFloat(String(newProduct.unit_price_amount).replace(',', '.'));
      if (Number.isNaN(amount) || amount < 0) {
        setScanError('Mengde må være et tall ≥ 0.');
        return;
      }

      setCreating(true);
      setScanError(null);
      try {
        const { error } = await supabase.from('products').insert({
          name,
          supplier: newProduct.supplier.trim() || 'Diverse',
          manufacturer: newProduct.manufacturer.trim() || 'Diverse',
          unit: newProduct.unit.trim() || 'stk',
          unit_price_amount: amount,
          is_weight_item: !!newProduct.is_weight_item,
          category_id: newProduct.category_id || null,
          image_url: null,
          barcode: scannedBarcode,
          approval_status: 'pending',
          submitted_by: user.id,
          submitted_at: new Date().toISOString(),
        });
        if (error) {
          setScanError(error.message ?? 'Kunne ikke sende til godkjenning.');
          return;
        }
        setCreatedPending(true);
        setThankYouMessage('Takk for bidraget! Varen er sendt til godkjenning.');
        // Rydd skjermen etter innsending
        setIsUnknown(false);
        setFoundProduct(null);
        setScannedBarcode(null);
        setNewProduct({
          name: '',
          supplier: '',
          manufacturer: '',
          unit: '',
          unit_price_amount: '1',
          is_weight_item: false,
          category_id: '',
        });
      } catch (e) {
        setScanError(e instanceof Error ? e.message : 'Noe gikk galt ved innsending.');
      } finally {
        setCreating(false);
      }
    }, [newProduct, scannedBarcode, user]);

    const handleCreatePrice = useCallback(async () => {
      if (!user) {
        setScanError('Du må være innlogget for å registrere pris.');
        return;
      }
      if (!selectedStoreId) {
        setScanError('Velg en butikk først.');
        return;
      }
      if (!foundProduct) {
        setScanError('Ingen produkt valgt.');
        return;
      }

      const raw = priceDraft.trim();
      if (!raw) {
        setScanError('Skriv inn pris.');
        return;
      }

      const amount = parseFloat(raw.replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) {
        setScanError('Pris må være et tall > 0.');
        return;
      }

      setPriceSubmitting(true);
      setScanError(null);
      try {
        const { data, error } = await supabase
          .from('product_prices')
          .insert({
            product_id: foundProduct.id,
            store_id: selectedStoreId,
            user_id: user.id,
            price_amount: amount,
          })
          .select('approval_status')
          .single();

        if (error) {
          setScanError(error.message ?? 'Kunne ikke registrere pris.');
          return;
        }

        const status = data?.approval_status as 'approved' | 'pending' | 'rejected' | undefined;
        const msg =
          status === 'approved'
            ? 'Takk! Pris registrert.'
            : status === 'pending'
              ? 'Takk! Prisen er sendt til godkjenning.'
              : 'Takk! Prisen er sendt til godkjenning.';

        setPriceConfirmationMessage(msg);
        setFoundProduct(null);
        setScannedBarcode(null);
        setIsUnknown(false);
        setCreatedPending(false);
        setThankYouMessage(null);
        setPriceDraft('');
      } catch (e) {
        setScanError(e instanceof Error ? e.message : 'Noe gikk galt ved prisregistrering.');
      } finally {
        setPriceSubmitting(false);
      }
    }, [foundProduct, priceDraft, selectedStoreId, user]);

    const header = (
      <Box px={spacing.lg} pt={insets.top + spacing.lg} pb={spacing.md} style={{ backgroundColor: c.background }}>
        <VStack space="xs">
          <Text fontSize={20} fontWeight="700" style={{ color: c.textSecondary }}>
            Pris-scan
          </Text>
          <Text fontSize={14} style={{ color: c.textMuted }}>
            Scan en strekkode for å finne produktet, eller legg til et nytt produkt for godkjenning.
          </Text>
        </VStack>
      </Box>
    );

    return (
      <BlurStatusBarView edges={['top']}>
        <Box flex={1} pb={insets.bottom} style={{ backgroundColor: c.background }}>
          {header}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <VStack space="lg">
                <Box
                  p={spacing.md}
                  borderRadius={radius.lg}
                  style={{
                    backgroundColor: c.surface,
                    borderWidth: hairlineWidth,
                    borderColor: c.border,
                  }}
                >
                  <VStack space="xs">
                    <Text fontSize={12} style={{ color: c.textMuted }}>
                      Butikk
                    </Text>
                    {adminBypassDistanceCheck && (
                      <Text fontSize={12} style={{ color: c.textMuted }}>
                        Adminmodus: avstandskrav (100 m) er deaktivert.
                      </Text>
                    )}

                    {storesLoading ? (
                      <HStack space="sm" alignItems="center">
                        <Spinner size="small" />
                        <Text fontSize={13} style={{ color: c.textMuted }}>
                          Henter butikker…
                        </Text>
                      </HStack>
                    ) : (
                      <>
                        {!selectedStore ? (
                          <>
                            <Text fontSize={12} style={{ color: c.error ?? '#ff4d4f' }}>
                              Alle registrerte butikker er for langt unna (over 100 meter).
                            </Text>
                            {nearestStores.length > 0 && (
                              <VStack space="sm" mt={spacing.xs}>
                                <Text fontSize={12} style={{ color: c.textMuted }}>
                                  Nærmeste butikker:
                                </Text>
                                {nearestStores.map((s) => {
                                  const storeDistance =
                                    userLocation != null
                                      ? distanceKm(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude)
                                      : null;
                                  return (
                                    <Box
                                      key={s.id}
                                      style={{
                                        paddingVertical: spacing.xs,
                                        paddingHorizontal: spacing.sm,
                                        borderRadius: 12,
                                        backgroundColor: c.surface,
                                        borderWidth: 1,
                                        borderColor: c.border,
                                      }}
                                    >
                                      <Text fontSize={13} fontWeight="600" style={{ color: c.textSecondary }}>
                                        {s.name ? `${s.chain} – ${s.name}` : s.chain}{' '}
                                        {storeDistance != null ? `(${formatDistance(storeDistance)})` : ''}
                                      </Text>
                                    </Box>
                                  );
                                })}
                              </VStack>
                            )}
                          </>
                        ) : (
                          <>
                            <Text fontSize={16} fontWeight="800" style={{ color: c.text }}>
                              {selectedStore.name ? `${selectedStore.chain} – ${selectedStore.name}` : selectedStore.chain}
                            </Text>

                            {userLocation && (
                              <Text fontSize={13} style={{ color: c.tint }}>
                                {formatDistance(
                                  distanceKm(
                                    userLocation.latitude,
                                    userLocation.longitude,
                                    selectedStore.latitude,
                                    selectedStore.longitude
                                  )
                                )}
                              </Text>
                            )}

                            <Text fontSize={13} style={{ color: c.textMuted }}>
                              {selectedStore.address}
                            </Text>
                          </>
                        )}

                        {!!selectedStore &&
                          (!storeConfirmed ? (
                            <>
                              <Text fontSize={12} style={{ color: c.textMuted }}>
                                Bekreft at dette er butikken du handler i.
                              </Text>
                              {!!userLocation && !hasAnyStoreWithinConfirmRadius && !adminBypassDistanceCheck && (
                                <Text fontSize={12} style={{ color: c.error ?? '#ff4d4f' }}>
                                  Ingen butikk er innen 100 meter. Scanneren kan ikke brukes her.
                                </Text>
                              )}
                              {!userLocation && !adminBypassDistanceCheck && (
                                <Text fontSize={12} style={{ color: c.error ?? '#ff4d4f' }}>
                                  Lokasjon må være aktiv for å bekrefte butikk innen 100 meter.
                                </Text>
                              )}
                              {!!userLocation && selectedStore && !selectedStoreWithinConfirmRadius && !adminBypassDistanceCheck && (
                                <Text fontSize={12} style={{ color: c.error ?? '#ff4d4f' }}>
                                  Du er for langt unna valgt butikk. Gå nærmere (maks 100 meter).
                                </Text>
                              )}

                              <ScrollView
                                nestedScrollEnabled
                                style={{ maxHeight: 200 }}
                                showsVerticalScrollIndicator={false}
                              >
                                <VStack space="sm">
                                  {nearestStores.map((s) => {
                                    const active = s.id === selectedStoreId;
                                    const storeDistance =
                                      userLocation != null
                                        ? distanceKm(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude)
                                        : null;
                                    return (
                                      <Pressable
                                        key={s.id}
                                        onPress={() => handleSelectStore(s.id)}
                                        style={{
                                          paddingVertical: spacing.xs,
                                          paddingHorizontal: spacing.sm,
                                          borderRadius: 12,
                                          backgroundColor: active ? c.tint ?? c.border : c.surface,
                                          borderWidth: 1,
                                          borderColor: active ? c.primary : c.border,
                                        }}
                                      >
                                        <Text
                                          fontSize={13}
                                          fontWeight="600"
                                          style={{ color: active ? c.background : c.textSecondary }}
                                        >
                                          {s.name ? `${s.chain} – ${s.name}` : s.chain}{' '}
                                          {storeDistance != null ? `(${formatDistance(storeDistance)})` : ''}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </VStack>
                              </ScrollView>

                              <PremiumButton
                                title="Bekreft butikk"
                                onPress={handleConfirmStore}
                                disabled={
                                  !selectedStoreId ||
                                  storesLoading ||
                                  (!adminBypassDistanceCheck && !userLocation) ||
                                  (!adminBypassDistanceCheck && !hasAnyStoreWithinConfirmRadius) ||
                                  (!adminBypassDistanceCheck && !selectedStoreWithinConfirmRadius)
                                }
                                variant="outline"
                              />
                            </>
                          ) : (
                            <HStack justifyContent="space-between" alignItems="center" mt={spacing.xs}>
                              <Pressable
                                onPress={() => {
                                  setStoreConfirmedAt(null);
                                }}
                              >
                                <Text fontSize={13} style={{ color: c.tint }}>
                                  Endre butikk
                                </Text>
                              </Pressable>
                              <Text fontSize={12} style={{ color: c.textMuted }}>
                                Bekreftet
                              </Text>
                            </HStack>
                          ))}
                      </>
                    )}
                  </VStack>
                </Box>

                <PremiumButton
                  title="Scanner"
                  onPress={openScanner}
                  disabled={
                    !storeConfirmed ||
                    (!adminBypassDistanceCheck && !userLocation) ||
                    (!adminBypassDistanceCheck && !hasAnyStoreWithinConfirmRadius)
                  }
                />

                {scanError && (
                  <Text fontSize={14} style={{ color: c.error ?? '#ff4d4f' }}>
                    {scanError}
                  </Text>
                )}

                {lookupLoading && (
                  <HStack space="sm" alignItems="center">
                    <Spinner size="small" />
                    <Text fontSize={14} style={{ color: c.textMuted }}>
                      Slår opp produkt…
                    </Text>
                  </HStack>
                )}

                {priceConfirmationMessage && (
                  <Box
                    p={spacing.md}
                    borderRadius={radius.lg}
                    style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                  >
                    <VStack space="xs">
                      <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                        Takk!
                      </Text>
                      <Text fontSize={14} style={{ color: c.text }}>
                        {priceConfirmationMessage}
                      </Text>
                      <PremiumButton title="Scan på nytt" onPress={openScanner} />
                    </VStack>
                  </Box>
                )}

                {createdPending && thankYouMessage && (
                  <Box
                    p={spacing.md}
                    borderRadius={radius.lg}
                    style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                  >
                    <VStack space="xs">
                      <Text fontSize={14} fontWeight="800" style={{ color: c.textSecondary }}>
                        Takk!
                      </Text>
                      <Text fontSize={14} style={{ color: c.text }}>
                        {thankYouMessage}
                      </Text>
                      <PremiumButton title="Scan på nytt" onPress={openScanner} />
                    </VStack>
                  </Box>
                )}

              {scannedBarcode && !foundProduct && (
                <Box
                  p={spacing.md}
                  borderRadius={radius.lg}
                  style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                >
                  <VStack space="xs">
                    <Text fontSize={12} style={{ color: c.textMuted }}>
                      Skannet strekkode
                    </Text>
                    <Text fontSize={16} fontWeight="700" style={{ color: c.text }}>
                      {scannedBarcode}
                    </Text>
                    <Pressable onPress={resetState} mt={spacing.xs}>
                      <Text fontSize={13} style={{ color: c.tint }}>
                        Nullstill
                      </Text>
                    </Pressable>
                  </VStack>
                </Box>
              )}

              {foundProduct && (
                <Box
                  p={spacing.md}
                  borderRadius={radius.lg}
                  style={{ backgroundColor: c.card ?? c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                >
                  <VStack space="xs">
                    <Text fontSize={12} style={{ color: c.textMuted }}>
                      Fant produkt
                    </Text>
                    <Text fontSize={16} fontWeight="700" style={{ color: c.text }}>
                      {foundProduct.name}
                    </Text>
                    <Text fontSize={13} style={{ color: c.textMuted }}>
                      {foundProduct.manufacturer || foundProduct.supplier}
                    </Text>

                    {lastStorePriceLoading ? (
                      <HStack space="xs" alignItems="center">
                        <Spinner size="small" />
                        <Text fontSize={12} style={{ color: c.textMuted }}>Henter siste pris…</Text>
                      </HStack>
                    ) : lastStorePrice ? (
                      <HStack space="xs" alignItems="center">
                        <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary }}>
                          Siste pris: {formatFixed2(lastStorePrice.price)} kr
                        </Text>
                        <Text fontSize={12} style={{ color: c.textMuted }}>
                          ({formatDateShort(lastStorePrice.recorded_at)})
                        </Text>
                      </HStack>
                    ) : (
                      <Text fontSize={12} style={{ color: c.textMuted }}>
                        Ingen registrert pris i denne butikken ennå
                      </Text>
                    )}

                    <Text fontSize={13} fontWeight="700" style={{ color: c.textSecondary, marginTop: spacing.xs }}>
                      Registrer pris
                    </Text>

                    <Input variant="outline" size="md" style={baseInputStyle}>
                      <InputField
                        placeholder="Pris (f.eks. 29,90)"
                        placeholderTextColor={c.textMuted}
                        value={priceDraft}
                        onChangeText={setPriceDraft}
                        style={{ color: c.text }}
                        keyboardType="decimal-pad"
                      />
                    </Input>

                    {scanError && (
                      <Text fontSize={13} style={{ color: c.error ?? '#ff4d4f' }}>
                        {scanError}
                      </Text>
                    )}

                    <PremiumButton
                      title={priceSubmitting ? 'Registrerer…' : 'Registrer pris'}
                      onPress={handleCreatePrice}
                      disabled={priceSubmitting || !priceDraft.trim() || !storeConfirmed}
                    />

                    <PremiumButton title="Scan på nytt" onPress={openScanner} variant="outline" disabled={priceSubmitting} />
                  </VStack>
                </Box>
              )}

              {isUnknown && scannedBarcode && (
                <Box
                  p={spacing.md}
                  borderRadius={radius.lg}
                  style={{ backgroundColor: c.surface, borderWidth: hairlineWidth, borderColor: c.border }}
                >
                  <VStack space="md">
                    <VStack space="xs">
                      <Text fontSize={12} style={{ color: c.textMuted }}>
                        Produkt ikke funnet
                      </Text>
                      <Text fontSize={15} style={{ color: c.text }}>
                        Strekkoden er ukjent. Du kan legge til produktet og sende det til godkjenning.
                      </Text>
                    </VStack>

                    <VStack space="md">
                      <Input variant="outline" size="md" style={baseInputStyle}>
                        <InputField
                          placeholder="Produktnavn (påkrevd)"
                          placeholderTextColor={c.textMuted}
                          value={newProduct.name}
                          onChangeText={(t) => setNewProduct((p) => ({ ...p, name: t }))}
                          style={{ color: c.text }}
                        />
                      </Input>
                      <Input variant="outline" size="md" style={baseInputStyle}>
                        <InputField
                          placeholder="Leverandør (f.eks. Tine)"
                          placeholderTextColor={c.textMuted}
                          value={newProduct.supplier}
                          onChangeText={(t) => setNewProduct((p) => ({ ...p, supplier: t }))}
                          style={{ color: c.text }}
                        />
                      </Input>
                      <Input variant="outline" size="md" style={baseInputStyle}>
                        <InputField
                          placeholder="Produsent (f.eks. Tine)"
                          placeholderTextColor={c.textMuted}
                          value={newProduct.manufacturer}
                          onChangeText={(t) => setNewProduct((p) => ({ ...p, manufacturer: t }))}
                          style={{ color: c.text }}
                        />
                      </Input>
                      <HStack space="sm">
                        <Box flex={1}>
                          <Input variant="outline" size="md" style={baseInputStyle}>
                            <InputField
                              placeholder="Enhet (stk, kg, l)"
                              placeholderTextColor={c.textMuted}
                              value={newProduct.unit}
                              onChangeText={(t) => setNewProduct((p) => ({ ...p, unit: t }))}
                              style={{ color: c.text }}
                            />
                          </Input>
                        </Box>
                        <Box flex={1}>
                          <Input variant="outline" size="md" style={baseInputStyle}>
                            <InputField
                              placeholder="Mengde (f.eks. 1)"
                              placeholderTextColor={c.textMuted}
                              value={newProduct.unit_price_amount}
                              onChangeText={(t) => setNewProduct((p) => ({ ...p, unit_price_amount: t }))}
                              style={{ color: c.text }}
                              keyboardType="decimal-pad"
                            />
                          </Input>
                        </Box>
                      </HStack>

                      <HStack alignItems="center" justifyContent="space-between">
                        <Text fontSize={13} style={{ color: c.textSecondary }}>
                          Vektvare
                        </Text>
                        <Switch
                          value={newProduct.is_weight_item}
                          onValueChange={(v) => setNewProduct((p) => ({ ...p, is_weight_item: v }))}
                        />
                      </HStack>

                      <VStack space="xs">
                        <Text fontSize={13} style={{ color: c.textSecondary }}>
                          Kategori (valgfritt)
                        </Text>
                        {categoriesLoading ? (
                          <HStack space="sm" alignItems="center">
                            <Spinner size="small" />
                            <Text fontSize={13} style={{ color: c.textMuted }}>
                              Laster kategorier…
                            </Text>
                          </HStack>
                        ) : (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <HStack space="xs" py={spacing.xs}>
                              <CategoryChip
                                label="Ingen"
                                active={!newProduct.category_id}
                                onPress={() => setNewProduct((p) => ({ ...p, category_id: '' }))}
                              />
                              {categories.map((cat) => (
                                <CategoryChip
                                  key={cat.id}
                                  label={cat.name}
                                  active={newProduct.category_id === cat.id}
                                  onPress={() => setNewProduct((p) => ({ ...p, category_id: cat.id }))}
                                />
                              ))}
                            </HStack>
                          </ScrollView>
                        )}
                      </VStack>

                      <PremiumButton
                        title={creating ? 'Sender…' : 'Send til godkjenning'}
                        onPress={handleCreatePending}
                        disabled={creating}
                      />
                    </VStack>
                  </VStack>
                </Box>
              )}
              </VStack>
            </ScrollView>
          </KeyboardAvoidingView>

          {scannerOpen && (
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              style={{ backgroundColor: '#000' }}
            >
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                onBarcodeScanned={handleBarcodeScanned as any}
              />
              <Box
                position="absolute"
                top={0}
                left={0}
                right={0}
                pt={insets.top + spacing.sm}
                px={spacing.lg}
              >
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
        </Box>

        {switchStoreDialog && (
          <Pressable
            onPress={() => setSwitchStoreDialog(null)}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
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
                <HStack alignItems="center" space="sm">
                  <IconSymbol name="storefront.fill" size={20} color={c.textSecondary} />
                  <Text fontSize={16} fontWeight="700" style={{ color: c.text }}>
                    Bytte butikk?
                  </Text>
                </HStack>
                <Text fontSize={14} style={{ color: c.textMuted }} lineHeight={20}>
                  Er du sikker på at du er i{' '}
                  <Text fontSize={14} fontWeight="700" style={{ color: c.text }}>
                    {switchStoreDialog.label}
                  </Text>
                  ? Du må bekrefte butikken på nytt.
                </Text>
                <HStack space="sm" mt={spacing.xs}>
                  <PremiumButton
                    title="Avbryt"
                    variant="outline"
                    onPress={() => setSwitchStoreDialog(null)}
                    style={{ flex: 1, minHeight: 44 }}
                    textStyle={{ fontSize: 14 }}
                  />
                  <PremiumButton
                    title="Ja, bytt butikk"
                    onPress={() => {
                      setSelectedStoreId(switchStoreDialog.storeId);
                      setStoreConfirmedAt(null);
                      setScanError(null);
                      setSwitchStoreDialog(null);
                    }}
                    style={{ flex: 1, minHeight: 44 }}
                    textStyle={{ fontSize: 14 }}
                  />
                </HStack>
              </VStack>
            </Pressable>
          </Pressable>
        )}
      </BlurStatusBarView>
    );

    function CategoryChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
  }
}

