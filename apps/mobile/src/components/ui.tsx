import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
  type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from "react-native";
import { CTA, FONT, RADIUS, useTheme } from "@/lib/theme";

/** Chữ: Inter; `display` = Chakra Petch cho số lớn / tiêu đề (docs/design.md) */
export function T({ v = "body", style, ...p }: TextProps & { v?: "title" | "h2" | "body" | "muted" | "faint" | "small" | "display" | "label" }) {
  const c = useTheme();
  const s: Record<string, TextStyle> = {
    title: { fontFamily: FONT.display, fontSize: 26, color: c.text },
    h2: { fontFamily: FONT.semibold, fontSize: 16, color: c.text },
    body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text },
    muted: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.muted },
    faint: { fontFamily: FONT.regular, fontSize: 12, color: c.faint },
    small: { fontFamily: FONT.regular, fontSize: 13, color: c.text },
    label: { fontFamily: FONT.medium, fontSize: 12, color: c.muted },
    display: { fontFamily: FONT.display, fontSize: 44, color: c.text, fontVariant: ["tabular-nums"] },
  };
  return <Text {...p} style={[s[v], style]} />;
}

/** Thẻ: bo 20, không viền, không đổ bóng — phân lớp bằng độ sáng nền */
export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: string }) {
  const c = useTheme();
  return <View style={[{ backgroundColor: tone ?? c.surface, borderRadius: RADIUS.card, padding: 18, gap: 12 }, style]}>{children}</View>;
}

/** Nút: primary = gradient Electric Blue → Neon Purple (mỗi màn hình một nút chính), secondary = viền */
export function Button({ title, onPress, kind = "secondary", disabled, busy, small, icon, style }: {
  title: string; onPress?: PressableProps["onPress"]; kind?: "primary" | "secondary" | "danger"; disabled?: boolean; busy?: boolean; small?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const h = small ? 36 : 48;
  const inner = (
    <View style={{ height: h, paddingHorizontal: small ? 14 : 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {busy ? <ActivityIndicator color={kind === "primary" ? "#fff" : c.text} /> : icon}
      <Text style={{ fontFamily: FONT.semibold, fontSize: small ? 14 : 15, color: kind === "primary" ? "#fff" : kind === "danger" ? c.negative : c.text }}>{title}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || busy) }}
      style={({ pressed }) => [{ borderRadius: RADIUS.pill, overflow: "hidden", opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, kind !== "primary" && { borderWidth: 1, borderColor: c.control }, style]}>
      {kind === "primary" ? <LinearGradient colors={[...CTA]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}>{inner}</LinearGradient> : inner}
    </Pressable>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" | "accent" }) {
  const c = useTheme();
  const bg = { neutral: c.raised, positive: c.dark ? "#10392c" : "#dcf3e8", warning: c.dark ? "#3a2c10" : "#f8ecd8", accent: c.accentSoft }[tone];
  const fg = { neutral: c.muted, positive: c.positive, warning: c.warning, accent: c.accent }[tone];
  return <View style={{ backgroundColor: bg, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}><Text style={{ fontFamily: FONT.medium, fontSize: 12, color: fg }}>{children}</Text></View>;
}

const TINTS = ["#8fc4ff", "#63d4cb", "#f0c24b", "#d69a6a", "#c3a6ff", "#ff9fb2", "#9be37f"];
export const tintOf = (name: string) => TINTS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length]!;
export function Avatar({ name, size = 36, accent }: { name: string; size?: number; accent?: boolean }) {
  const c = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent ? c.accent : tintOf(name), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: size * 0.42, color: "#080f24" }}>{name.trim()[0]?.toUpperCase() ?? "?"}</Text>
    </View>
  );
}

/** Nút chọn kiểu viên thuốc (Máy bàn / Laptop…) */
export function Segmented<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.raised, borderRadius: RADIUS.pill, padding: 3, alignSelf: "flex-start" }}>
      {options.map(([k, label]) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="button" accessibilityState={{ selected: value === k }}
          style={{ paddingHorizontal: 16, height: 34, justifyContent: "center", borderRadius: RADIUS.pill, backgroundColor: value === k ? c.text : "transparent" }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: value === k ? c.ground : c.muted }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return <Card style={{ alignItems: "flex-start" }}><T v="muted">{text}</T>{children}</Card>;
}

export function Loading() {
  const c = useTheme();
  return <View style={{ padding: 32, alignItems: "center" }}><ActivityIndicator color={c.accent} /></View>;
}

/** Khung màn hình cuộn có kéo để tải lại */
export function Screen({ children, refreshing, onRefresh, style }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[{ padding: 16, gap: 14, paddingBottom: 40 }, style]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ flexDirection: "row", alignItems: "center", gap: 10 }, style]}>{children}</View>
);
export const Divider = () => { const c = useTheme(); return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.rule }} />; };
