import 'react-native-gesture-handler';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/theme-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutContent() {
  const { resolvedScheme } = useTheme();
  return (
    <GluestackUIProvider config={config} colorMode={resolvedScheme}>
      <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
            <Stack.Screen name="product/[id]/index" options={{ headerShown: false }} />
            <Stack.Screen name="product/[id]/store-prices/[storeId]" options={{ headerShown: false }} />
            <Stack.Screen name="shopping-list/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="produkt-abonnement" options={{ headerShown: false }} />
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
