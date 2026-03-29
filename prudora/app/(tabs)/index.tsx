import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Box, HStack, Pressable, Spinner, Text, VStack } from '@gluestack-ui/themed';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { spacing, radius, hairlineWidth, cardShadowLight } from '@/constants/design';
import { IconSymbol } from '@/components/ui/icon-symbol';

function greeting(firstName: string | undefined | null) {
  const hour = new Date().getHours();
  const name = firstName ? `, ${firstName}` : '';
  if (hour < 5) return `God natt${name}`;
  if (hour < 10) return `God morgen${name}`;
  if (hour < 12) return `God formiddag${name}`;
  if (hour < 18) return `God ettermiddag${name}`;
  return `God kveld${name}`;
}

function todayLabel() {
  return new Date().toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

type QuickAction = {
  icon: string;
  label: string;
  sub: string;
  route: string;
  accent: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { icon: 'cart.fill',            label: 'Produkter',       sub: 'Søk og bla i utvalget',    route: '/(tabs)/produkter',        accent: '#6366F1' },
  { icon: 'barcode.viewfinder',   label: 'Pris-scan',       sub: 'Registrer pris i butikk',  route: '/(tabs)/price-scan',       accent: '#0EA5E9' },
  { icon: 'list.bullet',          label: 'Handlelister',    sub: 'Planlegg innkjøpet',        route: '/(tabs)/explore',          accent: '#10B981' },
  { icon: 'bell.fill',            label: 'Prisvarsler',     sub: 'Følg dine produkter',       route: '/(tabs)/produkt-abonnement',      accent: '#F59E0B' },
  { icon: 'storefront.fill',      label: 'Butikker',        sub: 'Finn butikker i nærheten',  route: '/(tabs)/stores',           accent: '#EC4899' },
  { icon: 'gearshape.fill',       label: 'Innstillinger',   sub: 'Profil og preferanser',     route: '/(tabs)/settings',         accent: '#8B5CF6' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const isDark = c.background === '#000000';
  const router = useRouter();
  const { profile, user } = useAuth();

  const [shoppingListCount, setShoppingListCount] = useState<number | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState<number | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setStatsLoading(true);

    Promise.all([
      supabase.from('shopping_lists').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('user_product_price_alerts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('enabled', true),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved'),
    ]).then(([lists, subs, products]) => {
      setShoppingListCount(lists.count ?? 0);
      setSubscriptionCount(subs.count ?? 0);
      setProductCount(products.count ?? 0);
      setStatsLoading(false);
    });
  }, [user]);

  const statCards = [
    { label: 'Handlelister',  value: shoppingListCount,  icon: 'list.bullet',    route: '/(tabs)/explore'        },
    { label: 'Prisvarsler',   value: subscriptionCount,  icon: 'bell.fill',      route: '/(tabs)/produkt-abonnement'    },
    { label: 'Produkter',     value: productCount,       icon: 'cart.fill',      route: '/(tabs)/produkter'      },
  ] as const;

  return (
    <BlurStatusBarView edges={['top']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <Box
          pt={insets.top + spacing.md}
          pb={spacing.lg}
          px={spacing.lg}
        >
          <Text fontSize={13} fontWeight="500" style={{ color: c.textMuted, textTransform: 'capitalize' }}>
            {todayLabel()}
          </Text>
          <Text fontSize={26} fontWeight="800" style={{ color: c.text, marginTop: 2, lineHeight: 32 }}>
            {greeting(profile?.first_name)}
          </Text>
          <Text fontSize={14} style={{ color: c.textSecondary, marginTop: 4, lineHeight: 20 }}>
            Sammenlign matvarepriser på tvers av butikker
          </Text>
        </Box>

        {/* ── Stats ── */}
        <Box px={spacing.lg} mb={spacing.lg}>
          <HStack space="sm">
            {statCards.map((stat) => (
              <Pressable
                key={stat.label}
                flex={1}
                onPress={() => router.push(stat.route as any)}
                style={[
                  {
                    backgroundColor: c.surface,
                    borderRadius: radius.lg,
                    borderWidth: hairlineWidth,
                    borderColor: c.border,
                    padding: spacing.md,
                    alignItems: 'center',
                  },
                  !isDark && cardShadowLight,
                ]}
                sx={{ _pressed: { opacity: 0.85 } }}
              >
                <IconSymbol name={stat.icon as any} size={20} color={c.primary} />
                <Box mt={spacing.xs} minHeight={28} alignItems="center" justifyContent="center">
                  {statsLoading ? (
                    <Spinner size="small" />
                  ) : (
                    <Text fontSize={22} fontWeight="800" style={{ color: c.text }}>
                      {stat.value ?? '—'}
                    </Text>
                  )}
                </Box>
                <Text fontSize={11} fontWeight="500" style={{ color: c.textMuted, marginTop: 2, textAlign: 'center' }}>
                  {stat.label}
                </Text>
              </Pressable>
            ))}
          </HStack>
        </Box>

        {/* ── Quick actions ── */}
        <Box px={spacing.lg}>
          <Text fontSize={13} fontWeight="700" style={{ color: c.textMuted, marginBottom: spacing.sm, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Snarveier
          </Text>
          <VStack space="sm">
            {/* Row 1 */}
            <HStack space="sm">
              {QUICK_ACTIONS.slice(0, 2).map((a) => (
                <ActionCard key={a.label} action={a} isDark={isDark} c={c} router={router} />
              ))}
            </HStack>
            {/* Row 2 */}
            <HStack space="sm">
              {QUICK_ACTIONS.slice(2, 4).map((a) => (
                <ActionCard key={a.label} action={a} isDark={isDark} c={c} router={router} />
              ))}
            </HStack>
            {/* Row 3 */}
            <HStack space="sm">
              {QUICK_ACTIONS.slice(4, 6).map((a) => (
                <ActionCard key={a.label} action={a} isDark={isDark} c={c} router={router} />
              ))}
            </HStack>
          </VStack>
        </Box>

        {/* ── Tip banner ── */}
        <Box px={spacing.lg} mt={spacing.lg}>
          <Pressable
            onPress={() => router.push('/(tabs)/price-scan')}
            style={[
              {
                backgroundColor: isDark ? '#1A1A2E' : '#EEF2FF',
                borderRadius: radius.xl,
                padding: spacing.md,
                borderWidth: hairlineWidth,
                borderColor: isDark ? '#3730A3' : '#C7D2FE',
              },
            ]}
            sx={{ _pressed: { opacity: 0.88 } }}
          >
            <HStack alignItems="center" space="md">
              <Box
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: '#6366F1',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconSymbol name="barcode.viewfinder" size={22} color="#fff" />
              </Box>
              <VStack flex={1} space="xs">
                <Text fontSize={15} fontWeight="700" style={{ color: isDark ? '#A5B4FC' : '#4338CA' }}>
                  Registrer en pris nå
                </Text>
                <Text fontSize={13} style={{ color: isDark ? '#818CF8' : '#6366F1', lineHeight: 18 }}>
                  Hjelp fellesskapet ved å scanne varer i butikk
                </Text>
              </VStack>
              <IconSymbol name="chevron.forward" size={16} color={isDark ? '#818CF8' : '#6366F1'} />
            </HStack>
          </Pressable>
        </Box>
      </ScrollView>
    </BlurStatusBarView>
  );
}

type ActionCardProps = {
  action: QuickAction;
  isDark: boolean;
  c: ReturnType<typeof useDesignColors>;
  router: ReturnType<typeof useRouter>;
};

function ActionCard({ action, isDark, c, router }: ActionCardProps) {
  return (
    <Pressable
      flex={1}
      onPress={() => router.push(action.route as any)}
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.xl,
          borderWidth: hairlineWidth,
          borderColor: c.border,
          padding: spacing.md,
        },
        !isDark && cardShadowLight,
      ]}
      sx={{ _pressed: { opacity: 0.85 } }}
    >
      <Box
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: `${action.accent}18`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.sm,
        }}
      >
        <IconSymbol name={action.icon as any} size={20} color={action.accent} />
      </Box>
      <Text fontSize={14} fontWeight="700" style={{ color: c.text }}>
        {action.label}
      </Text>
      <Text fontSize={12} style={{ color: c.textMuted, marginTop: 2, lineHeight: 16 }}>
        {action.sub}
      </Text>
    </Pressable>
  );
}
