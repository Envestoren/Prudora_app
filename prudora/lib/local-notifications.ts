import { Alert, Platform } from 'react-native';

const CHANNEL_ID = 'prudora-price-alerts';

/**
 * Sender en lokal push-notifikasjon.
 *
 * Android Expo Go (SDK 53+): import('expo-notifications') kaster pga.
 * DevicePushTokenAutoRegistration-sideeffekten. Vi faller tilbake på
 * spesifikke sub-moduler (NotificationsHandler, NotificationPermissions,
 * scheduleNotificationAsync) som fungerer uten den sideeffekten, og som
 * Metro bundler automatisk siden de er referert i samme fil.
 */
export async function sendLocalNotification(title: string, body: string): Promise<void> {
  try {
    let setNotificationHandler: ((h: any) => void) | undefined;
    let getPermissionsAsync: (() => Promise<any>) | undefined;
    let requestPermissionsAsync: (() => Promise<any>) | undefined;
    let scheduleNotificationAsync: ((r: any) => Promise<any>) | undefined;
    let setNotificationChannelAsync: ((id: string, ch: any) => Promise<any>) | undefined;
    let AndroidImportance: any;

    // Forsøk full modul (fungerer i dev/prod build og iOS Expo Go).
    let full: any = null;
    try {
      full = await import('expo-notifications');
    } catch {
      // Android Expo Go: full import kaster – henter sub-moduler under.
    }

    if (full) {
      setNotificationHandler = full.setNotificationHandler;
      getPermissionsAsync = full.getPermissionsAsync;
      requestPermissionsAsync = full.requestPermissionsAsync;
      scheduleNotificationAsync = full.scheduleNotificationAsync;
      setNotificationChannelAsync = full.setNotificationChannelAsync;
      AndroidImportance = full.AndroidImportance;
    } else {
      // Sub-modul-fallback for Android Expo Go.
      // Metro bundler inkluderer disse fordi de er statisk referert i import()-kallene over.
      const [Handler, Perms, Schedule] = await Promise.all([
        import('expo-notifications/build/NotificationsHandler'),
        import('expo-notifications/build/NotificationPermissions'),
        import('expo-notifications/build/scheduleNotificationAsync'),
      ]);
      setNotificationHandler = Handler.setNotificationHandler;
      getPermissionsAsync = Perms.getPermissionsAsync;
      requestPermissionsAsync = Perms.requestPermissionsAsync;
      scheduleNotificationAsync = Schedule.scheduleNotificationAsync;

      if (Platform.OS === 'android') {
        try {
          const Ch = await import('expo-notifications/build/NotificationChannelManager');
          setNotificationChannelAsync = Ch.setNotificationChannelAsync;
          AndroidImportance = Ch.AndroidImportance;
        } catch {
          // Kanalmanager ikke tilgjengelig – fortsetter uten kanal.
        }
      }
    }

    if (!scheduleNotificationAsync || !getPermissionsAsync) {
      Alert.alert(title, body);
      return;
    }

    setNotificationHandler?.({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android' && setNotificationChannelAsync) {
      await setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Prisvarsler',
        importance: AndroidImportance?.HIGH ?? 4,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      });
    }

    const { status } = await getPermissionsAsync();
    if (status !== 'granted') {
      const { status: nextStatus } = await requestPermissionsAsync!();
      if (nextStatus !== 'granted') {
        Alert.alert(title, body);
        return;
      }
    }

    await scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        ...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
      },
      trigger: null,
    });
  } catch {
    Alert.alert(title, body);
  }
}
