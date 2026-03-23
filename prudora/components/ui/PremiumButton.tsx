import { Pressable, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { Colors } from '@/constants/theme';
import { radius, spacing } from '@/constants/design';
import { useTheme } from '@/lib/theme-context';

type Variant = 'primary' | 'outline' | 'ghost';

type PremiumButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  title: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  /** Overstyr farge for outline (f.eks. #EF4444 for fare) */
  accentColor?: string;
};

export function PremiumButton({
  onPress,
  disabled = false,
  variant = 'primary',
  title,
  style,
  textStyle,
  accentColor,
}: PremiumButtonProps) {
  const { resolvedScheme } = useTheme();
  const c = Colors[resolvedScheme];

  const getBg = (): string => {
    if (disabled) return c.primaryMuted;
    if (variant === 'primary') return c.primary;
    return 'transparent';
  };

  const accent = accentColor ?? c.primary;

  const getTextColor = (): string => {
    if (disabled) return c.textMuted;
    if (variant === 'primary') return '#FFFFFF';
    return accent;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: getBg(),
          borderRadius: radius.lg,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: disabled ? c.border : accent,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: getTextColor() },
          textStyle,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
