import { useEffect } from 'react';
import 'react-native-gesture-handler';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from '@expo-google-fonts/manrope/useFonts';
import {
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Text as RNText } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';

// Globalt standardfont – Manrope
if (RNText.defaultProps == null) RNText.defaultProps = {};
RNText.defaultProps.fontFamily = 'Manrope_400Regular';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutContent() {
  const { resolvedScheme } = useTheme();
  const [fontsLoaded] = useFonts({
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  const navTheme = resolvedScheme === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: Colors.dark.background, card: Colors.dark.surface, text: Colors.dark.text, border: Colors.dark.border, primary: Colors.dark.primary } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: Colors.light.background, card: Colors.light.surface, text: Colors.light.text, border: Colors.light.border, primary: Colors.light.primary } };

  return (
    <GluestackUIProvider config={config} colorMode={resolvedScheme}>
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="(auth)"
              options={{
                headerShown: false,
                presentation: 'transparentModal',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="store/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
        </AuthProvider>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      </ThemeProvider>
    </GluestackUIProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <RootLayoutContent />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
