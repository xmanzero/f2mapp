import { ChakraPetch_700Bold } from "@expo-google-fonts/chakra-petch";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { I18nProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { FONT, useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

/** Gốc: font Inter + Chakra Petch, ngôn ngữ, phiên đăng nhập; các tab ở (tabs), màn hình mở thêm (đăng nhập, quét mã, hồ sơ) xếp chồng lên */
export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, ChakraPetch_700Bold });
  const c = useTheme();
  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  const nav = c.dark ? DarkTheme : DefaultTheme;
  return (
    <I18nProvider>
      <SessionProvider>
        <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: c.ground, card: c.surface, text: c.text, border: c.border, primary: c.accent } }}>
          <StatusBar style={c.dark ? "light" : "dark"} />
          <Stack screenOptions={{
            headerStyle: { backgroundColor: c.ground }, headerTintColor: c.text, headerShadowVisible: false,
            headerTitleStyle: { fontFamily: FONT.semibold }, contentStyle: { backgroundColor: c.ground },
          }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="dang-nhap" options={{ presentation: "modal", title: "" }} />
            <Stack.Screen name="quet" options={{ presentation: "modal", title: "" }} />
            <Stack.Screen name="u/[handle]" options={{ title: "" }} />
            <Stack.Screen name="bang-tin" options={{ title: "" }} />
          </Stack>
        </ThemeProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
