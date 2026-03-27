import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Forespør tillatelse og hent Expo push-token.
 * Krever fysisk enhet og (for de fleste bygg) gyldig `extra.eas.projectId` i app-konfigurasjonen.
 */
export async function registerForExpoPushTokenAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  // Expo Go (SDK 53+) støtter ikke remote push via expo-notifications.
  // Krever development build / production build.
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient';
  if (isExpoGo) {
    return null;
  }
  if (!Device.isDevice) {
    return null;
  }

  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: String(projectId) } : undefined
    );
    return tokenData.data ?? null;
  } catch {
    return null;
  }
}
