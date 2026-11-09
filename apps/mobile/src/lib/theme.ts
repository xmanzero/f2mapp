import { useColorScheme } from "react-native";

/**
 * Màu theo PCDEX Brand Kit (docs/design.md), giống token CSS của web: Đêm là gốc (nền Deep Navy), Ngày theo hệ điều hành.
 * Tech Blue là màu dữ liệu; gradient chỉ ở logo và nút chính.
 */
const dark = {
  ground: "#080f24", surface: "#0f1830", raised: "#18233f", border: "#16203a", rule: "#1a2442", control: "#3a4766",
  text: "#f8faff", muted: "#b3bcd3", faint: "#8f99b3",
  accent: "#00a6ff", accentInk: "#080f24", accentSoft: "#0b2a52",
  positive: "#3ddc97", negative: "#ff6b7a", warning: "#f2b544", track: "#18233f",
  tier: { bronze: "#d69a6a", silver: "#c3ccd6", gold: "#f0c24b", platinum: "#63d4cb", diamond: "#8fc4ff", legend: "#ff7a7a" } as Record<string, string>,
  tierFill: { bronze: "#22192a", silver: "#172238", gold: "#241f24", platinum: "#0e2433", diamond: "#12224a", legend: "#2a1530" } as Record<string, string>,
};
const light: typeof dark = {
  ground: "#eef2fa", surface: "#ffffff", raised: "#f1f4fa", border: "#dfe5f0", rule: "#e8edf5", control: "#c3ccdc",
  text: "#0b1530", muted: "#46506a", faint: "#5c6681",
  accent: "#1460e6", accentInk: "#ffffff", accentSoft: "#e2ecff",
  positive: "#0b8457", negative: "#c4242a", warning: "#9a5600", track: "#e1e7f1",
  tier: { bronze: "#8a4f22", silver: "#4f5b66", gold: "#8a6400", platinum: "#0f6e66", diamond: "#1f5fb8", legend: "#b3262f" },
  tierFill: { bronze: "#f3ecea", silver: "#eef1f6", gold: "#f3f0e6", platinum: "#ddf4f1", diamond: "#e3eefd", legend: "#fde6e6" },
};
export type Theme = typeof dark & { dark: boolean };

/** Nút chính: Electric Blue → Neon Purple */
export const CTA = ["#1769ff", "#8a2bff"] as const;
export const FONT = { regular: "Inter_400Regular", medium: "Inter_500Medium", semibold: "Inter_600SemiBold", bold: "Inter_700Bold", display: "ChakraPetch_700Bold" };
export const RADIUS = { card: 20, inner: 12, pill: 999 };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "light" ? { ...light, dark: false } : { ...dark, dark: true };
}
