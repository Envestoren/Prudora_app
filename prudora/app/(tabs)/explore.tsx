import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  Pressable,
  Button,
  ButtonText,
  Input,
  InputField,
  Spinner,
} from '@gluestack-ui/themed';
import { FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { BlurStatusBarView } from '@/components/BlurStatusBarView';
import { useDesignColors } from '@/hooks/use-design-colors';
import { spacing, radius, hairlineWidth, cardShadowLight } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type ShoppingList = {
  id: string;
  name: string;
  icon: string | null;
  created_at: string;
};

export default function ShoppingListsScreen() {
  const insets = useSafeAreaInsets();
  const c = useDesignColors();
  const isDark = c.background === '#000000';
  const { session } = useAuth();
  const router = useRouter();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📋');
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<'listName' | null>(null);

  const loadLists = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('id, name, icon, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Kunne ikke hente handlelister', error);
      setLists([]);
    } else {
      setLists((data ?? []) as ShoppingList[]);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useFocusEffect(
    useCallback(() => {
      loadLists();
    }, [loadLists]),
  );

  async function handleCreateList() {
    if (!session || !name.trim()) return;
    setSubmitting(true);
    const userId = session.user.id;

    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({
        user_id: userId,
        name: name.trim(),
        icon: icon || null,
      })
      .select('id, name, icon, created_at')
      .maybeSingle();

    setSubmitting(false);

    if (error || !data) {
      console.warn('Kunne ikke opprette handleliste', error);
      return;
    }

    setLists(prev => [data as ShoppingList, ...prev]);
    setName('');
    setIcon('📋');
    setCreating(false);

    router.push({ pathname: '/(tabs)/shopping-list/[id]', params: { id: data.id } });
  }

  function renderListItem({ item }: { item: ShoppingList }) {
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/(tabs)/shopping-list/[id]', params: { id: item.id } })}
        mt={spacing.sm}
        borderRadius={radius.lg}
        borderWidth={hairlineWidth}
        borderColor={c.border}
        bg={c.surface}
        px={16}
        py={12}
        sx={{ _pressed: { opacity: 0.9 } }}
      >
        <HStack alignItems="center" space="md">
          <Box
            w={40}
            h={40}
            borderRadius={20}
            alignItems="center"
            justifyContent="center"
            style={{ backgroundColor: c.primary + '22' }}
          >
            <Text fontSize={22}>{item.icon || '📋'}</Text>
          </Box>
          <VStack flex={1} space="xs">
            <Text fontSize={16} fontWeight="700" style={{ color: c.text }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text fontSize={13} style={{ color: c.textMuted }}>
              Trykk for å åpne 🤍
            </Text>
          </VStack>
        </HStack>
      </Pressable>
    );
  }

  return (
    <BlurStatusBarView edges={['top']}>
      <Box
        flex={1}
        pt={insets.top}
        pb={insets.bottom}
        style={{ backgroundColor: c.background, paddingHorizontal: spacing.lg }}
      >
        <VStack flex={1} py={24} space="lg">
          <VStack space="xs">
            <Text fontSize={24} fontWeight="800" style={{ color: c.text }} lineHeight={30}>
              Handlelister
            </Text>
            <Text fontSize={14} style={{ color: c.textSecondary }} lineHeight={20}>
              Lag lister og kryss av etter hvert som du handler.
            </Text>
          </VStack>

          <VStack space="md">
            {creating ? (
              <VStack
                space="md"
                borderRadius={radius.xl}
                borderWidth={hairlineWidth}
                borderColor={c.border}
                bg={c.surface}
                px={16}
                py={16}
                style={!isDark ? cardShadowLight : undefined}
              >
                <Text fontSize={15} fontWeight="600" style={{ color: c.text }}>
                  Ny handleliste
                </Text>
                <VStack space="sm">
                  <Input
                    size="md"
                    variant="outline"
                    style={[
                      {
                        backgroundColor: c.surface,
                        borderRadius: radius.lg,
                        borderWidth: hairlineWidth,
                        borderColor: c.border,
                      },
                      focusedField === 'listName' && {
                        borderColor: c.primary,
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <InputField
                      value={name}
                      onChangeText={setName}
                      placeholder="Navn på listen (f.eks. Ukeshandel)"
                      placeholderTextColor={c.textMuted}
                      onFocus={() => setFocusedField('listName')}
                      onBlur={() => setFocusedField(prev => (prev === 'listName' ? null : prev))}
                      style={{ color: c.text }}
                    />
                  </Input>
                  <VStack mt={4} space="xs">
                    <Text fontSize={13} style={{ color: c.textSecondary }}>
                      Velg ikon
                    </Text>
                    <HStack flexWrap="wrap" space="sm">
                      {['📋', '🛒', '🥦', '🍞', '🍎', '🍝', '🧼'].map((emoji) => {
                        const isSelected = icon === emoji;
                        return (
                          <Pressable
                            key={emoji}
                            onPress={() => setIcon(emoji)}
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
                </VStack>
                <HStack space="sm" mt={8}>
                  <Button
                    flex={1}
                    variant="outline"
                    size="md"
                    onPress={() => {
                      setCreating(false);
                      setName('');
                      setIcon('📋');
                    }}
                    isDisabled={submitting}
                    borderRadius={radius.lg}
                    sx={{ _pressed: { opacity: 0.9 } }}
                  >
                    <ButtonText style={{ color: c.text }}>
                      Avbryt
                    </ButtonText>
                  </Button>
                  <Button
                    flex={1}
                    variant="solid"
                    size="md"
                    onPress={handleCreateList}
                    isDisabled={!name.trim() || submitting}
                    bg={c.tint}
                    borderRadius={radius.lg}
                    sx={{ _pressed: { opacity: 0.9 } }}
                  >
                    {submitting ? (
                      <Spinner color="$backgroundLight0" />
                    ) : (
                      <ButtonText>
                        Opprett &amp; åpne
                      </ButtonText>
                    )}
                  </Button>
                </HStack>
              </VStack>
            ) : (
              <Button
                onPress={() => setCreating(true)}
                variant="solid"
                size="md"
                bg={c.tint}
                borderRadius={radius.lg}
                sx={{ _pressed: { opacity: 0.9 } }}
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: 16,
                }}
              >
                <ButtonText>+ Ny handleliste</ButtonText>
              </Button>
            )}
          </VStack>

          <Box flex={1} mt={8}>
            {loading ? (
              <HStack flex={1} alignItems="center" justifyContent="center" space="sm">
                <Spinner />
                <Text fontSize={14} style={{ color: c.textMuted }}>
                  Laster handlelister…
                </Text>
              </HStack>
            ) : lists.length === 0 ? (
              <VStack flex={1} alignItems="center" justifyContent="center" space="sm">
                <Text fontSize={16} fontWeight="600" style={{ color: c.textSecondary }}>
                  Ingen handlelister enda
                </Text>
                <Text
                  fontSize={14}
                  style={{ color: c.textMuted, textAlign: 'center' }}
                  lineHeight={20}
                >
                  Trykk på &quot;Ny handleliste&quot; for å komme i gang.
                </Text>
              </VStack>
            ) : (
              <FlatList
                data={lists}
                keyExtractor={item => item.id}
                renderItem={renderListItem}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
              />
            )}
          </Box>
        </VStack>
      </Box>
    </BlurStatusBarView>
  );
}
