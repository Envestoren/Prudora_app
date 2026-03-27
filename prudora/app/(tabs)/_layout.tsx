import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

export default function TabLayout() {
  const { resolvedScheme: colorScheme } = useTheme();
  const { session, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!session) router.replace('/(auth)/login');
  }, [session, isLoading, router]);

  const colors = Colors[colorScheme ?? 'light'];
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#000000' : '#FFFFFF',
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hjem',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Handlelister',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="list.bullet" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="produkter"
        options={{
          title: 'Produkter',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="cart.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="produkt-abonnement"
        options={{
          title: 'Abonnement',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="price-scan"
        options={{
          title: 'Pris-scan',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="barcode.viewfinder" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: 'Butikker',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="storefront.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Innstillinger',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="gearshape.fill" color={color} />,
        }}
      />
      {/* Skjul detaljruta for handleliste fra tab-baren */}
      <Tabs.Screen
        name="shopping-list/[id]"
        options={{
          href: null,
        }}
      />
      {/* Skjul produktdetalj fra tab-baren */}
      <Tabs.Screen
        name="product/[id]"
        options={{
          href: null,
        }}
      />
      {/* Skjul butikk-prishistorikk fra tab-baren */}
      <Tabs.Screen
        name="product/[id]/store-prices/[storeId]"
        options={{
          href: null,
        }}
      />
      {/* Skjul varselsimulator fra tab-baren */}
      <Tabs.Screen
        name="varselsimulator"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
