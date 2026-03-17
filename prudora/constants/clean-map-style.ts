import type { MapStyleElement } from 'react-native-maps';

/**
 * Forenklet kartstil for Google Maps (Android) – lys modus. Bedre kontrast.
 */
export const CLEAN_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#ebeae8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a4a4a' }, { weight: 0.6 }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e0dfdd' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e2e1de' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d4ddce' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f5f5f3' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#b0b0ae' }, { weight: 1 }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8e7e5' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#9a9a98' }, { weight: 1 }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b8d0dc' }] },
  { featureType: 'water', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
];

/**
 * Forenklet kartstil for Google Maps (Android) – mørk modus. Gråaktig.
 */
export const CLEAN_MAP_STYLE_DARK: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#3c3c3e' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#e0e0e0' }, { weight: 0.6 }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#3c3c3e' }, { weight: 2 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#454547' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#404042' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#3d4340' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#4a4a4c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#5c5c60' }, { weight: 1 }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#505052' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#6a6a6e' }, { weight: 1 }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#2d3842' }] },
  { featureType: 'water', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
];
