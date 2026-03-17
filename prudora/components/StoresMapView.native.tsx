import React, { forwardRef } from 'react';
import { Box, Text } from '@gluestack-ui/themed';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { ComponentRef } from 'react';
import { Image } from 'expo-image';
import { spacing } from '@/constants/design';
import { CLEAN_MAP_STYLE, CLEAN_MAP_STYLE_DARK } from '@/constants/clean-map-style';
import { useTheme } from '@/lib/theme-context';
import { useDesignColors } from '@/hooks/use-design-colors';
import type { Store } from '@/types/database';

const NORWAY_REGION = {
  latitude: 59.9139,
  longitude: 10.7522,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

function openInMaps(lat: number, lng: number, label?: string) {
  const { Linking, Platform } = require('react-native');
  const url =
    Platform.OS === 'ios'
      ? `maps:?q=${encodeURIComponent(label || 'Butikk')}&ll=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}`;
  Linking.openURL(url);
}

export type StoresMapViewRef = ComponentRef<typeof MapView>;

export type StoresMapViewProps = {
  stores: Store[];
  insets: { top: number };
  cardStyle: { backgroundColor: string; borderColor: string };
  textSecondary: string;
  textMuted: string;
  showHeader?: boolean;
  userLocation?: { latitude: number; longitude: number } | null;
  onStorePress?: (store: Store) => void;
  onMapPress?: () => void;
};

function StoreMarker({
  store,
  pinColor,
  onPress,
}: {
  store: Store;
  pinColor: string;
  onPress: () => void;
}) {
  const title = store.name ? `${store.chain} – ${store.name}` : store.chain;
  const description = `${store.address}\n\nTrykk på kortet for å åpne i kart`;

  return (
    <Marker
      coordinate={{ latitude: store.latitude, longitude: store.longitude }}
      title={title}
      description={description}
      pinColor={pinColor}
      onPress={onPress}
    >
      <Box
        borderRadius={999}
        alignItems="center"
        justifyContent="center"
        style={{
          width: 40,
          height: 40,
          borderWidth: 3,
          borderColor: pinColor,
          backgroundColor: 'rgba(255,255,255,0.9)',
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
          overflow: 'hidden',
        }}
      >
        <Box
          width={30}
          height={30}
          borderRadius={999}
          alignItems="center"
          justifyContent="center"
          bg="$backgroundMuted"
          overflow="hidden"
        >
          {store.logo_url ? (
            <Image source={{ uri: store.logo_url }} style={{ width: 30, height: 30 }} contentFit="contain" />
          ) : (
            <Text fontSize={11} fontWeight="700">
              {store.chain.slice(0, 2).toUpperCase()}
            </Text>
          )}
        </Box>
      </Box>
    </Marker>
  );
}

const StoresMapView = forwardRef<StoresMapViewRef, StoresMapViewProps>(function StoresMapView(
  { stores, insets, cardStyle, textSecondary, textMuted, showHeader = true, userLocation, onStorePress, onMapPress },
  ref
) {
  const { resolvedScheme } = useTheme();
  const c = useDesignColors();
  const isDark = resolvedScheme === 'dark';
  const mapStyle = Platform.OS === 'android' ? (isDark ? CLEAN_MAP_STYLE_DARK : CLEAN_MAP_STYLE) : undefined;
  const pinColor = c.tint;

  const region =
    userLocation && userLocation.latitude && userLocation.longitude
      ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }
      : NORWAY_REGION;

  return (
    <>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : undefined}
        customMapStyle={mapStyle}
        onPress={() => {
          if (onMapPress) onMapPress();
        }}
      >
        {stores.map((s) => (
          <StoreMarker
            key={s.id}
            store={s}
            pinColor={pinColor}
            onPress={() => {
              if (onStorePress) {
                onStorePress(s);
              } else {
                openInMaps(s.latitude, s.longitude, s.address);
              }
            }}
          />
        ))}
      </MapView>
      {showHeader && (
        <Box
          position="absolute"
          top={insets.top + spacing.sm}
          left={spacing.lg}
          right={spacing.lg}
          px={spacing.md}
          py={spacing.sm}
          borderRadius={12}
          style={[cardStyle, { borderWidth: 1 }]}
        >
          <Text fontSize={18} fontWeight="700" style={{ color: textSecondary }}>
            Butikker
          </Text>
          <Text fontSize={13} style={{ color: textMuted }}>
            {stores.length === 0
              ? 'Ingen butikker på kartet'
              : `${stores.length} butikk${stores.length !== 1 ? 'er' : ''} – trykk på markør for å åpne i kart`}
          </Text>
        </Box>
      )}
    </>
  );
});

export default StoresMapView;
