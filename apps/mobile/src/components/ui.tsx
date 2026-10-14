import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  type KeyboardTypeOptions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, minTouchTarget, radius, space } from '@/theme';

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const body = [styles.screenBody, padded && { padding: space.lg, gap: space.lg }] as ViewStyle[];
  if (!scroll) return <View style={[styles.screen, ...body]}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={body}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

export function Heading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 }) {
  return (
    <Text accessibilityRole="header" style={level === 1 ? styles.h1 : styles.h2}>
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors['foreground-muted'] }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const inactive = disabled || loading;
  const palette = {
    primary: { bg: colors.primary, fg: colors['primary-foreground'], border: colors.primary },
    accent: { bg: colors.accent, fg: colors['accent-foreground'], border: colors.accent },
    outline: { bg: 'transparent', fg: colors.foreground, border: colors['border-strong'] },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.danger },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonLabel, { color: palette.fg }]}>{label.toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  error,
  secure = false,
  keyboardType,
  autoCapitalize = 'none',
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | undefined;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors['border-strong']}
        style={[
          styles.input,
          multiline && { minHeight: 88, textAlignVertical: 'top', borderRadius: radius.lg },
          error ? { borderColor: colors.danger } : null,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    info: { bg: colors['info-soft'], border: colors['info-border'], fg: colors['info-foreground'] },
    success: {
      bg: colors['success-soft'],
      border: colors['success-border'],
      fg: colors['success-foreground'],
    },
    warning: {
      bg: colors['warning-soft'],
      border: colors['warning-border'],
      fg: colors['warning-foreground'],
    },
    danger: { bg: colors['danger-soft'], border: colors['danger-border'], fg: colors['danger-foreground'] },
  }[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: tones.bg, borderColor: tones.border }]}
    >
      <Text style={{ color: tones.fg, fontSize: 15, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const content = <View style={styles.card}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/** A selectable pill: filters, choices, sizes. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: space.lg,
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors['border-strong'],
        backgroundColor: selected ? colors.primary : 'transparent',
      }}
    >
      <Text style={{ fontWeight: '600', color: selected ? colors['primary-foreground'] : colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={[styles.center, { gap: space.sm }]}>
      <Text style={styles.h2}>{title}</Text>
      {children ? (
        <Text style={[styles.body, { textAlign: 'center', color: colors['foreground-muted'] }]}>
          {children}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenBody: { flexGrow: 1 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.foreground, letterSpacing: -0.4 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: colors.foreground },
  body: { fontSize: 16, lineHeight: 23, color: colors.foreground },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  error: { fontSize: 14, color: colors['danger-foreground'] },
  input: {
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderColor: colors['border-strong'],
    borderRadius: radius.full,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.surface,
  },
  button: {
    minHeight: minTouchTarget,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
  },
  buttonLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.9 },
  banner: { borderWidth: 1, borderRadius: radius.lg, padding: space.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xxl },
});
